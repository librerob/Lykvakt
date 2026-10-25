import {
  MAX_FILE_BYTES,
  integer,
  record,
  text,
  validateData,
  type VaultData,
} from "./model";

import { argon2Key } from "./kdf";
import {
  DEFAULT_KDF,
  MIN_ITERATIONS,
  MAX_ITERATIONS,
  kdfPolicy,
  upgradePolicy,
  validateArgon2,
  type Argon2Policy,
  type KDFPolicy,
} from "./kdf-policy";
export {
  MIN_ITERATIONS,
  DEFAULT_ITERATIONS,
  MAX_ITERATIONS,
  DEFAULT_KDF,
} from "./kdf-policy";
export type { KDFPolicy, Argon2Policy } from "./kdf-policy";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
export const random = (length: number): Uint8Array<ArrayBuffer> =>
  crypto.getRandomValues(new Uint8Array(length));
export function base64(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 8192)
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
export function unbase64(value: unknown, max: number): Uint8Array<ArrayBuffer> {
  const s = text(value, Math.ceil(max / 3) * 4 + 4);
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)
  )
    throw new Error("Invalid base64.");
  const bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  if (bytes.length > max || base64(bytes) !== s)
    throw new Error("Invalid binary field.");
  return bytes;
}
function exact(value: unknown, length: number): Uint8Array<ArrayBuffer> {
  const bytes = unbase64(value, length);
  if (bytes.length !== length) throw new Error("Invalid binary length.");
  return bytes;
}
export interface PBKDF2Slot {
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  wrapped: string;
}
export interface Argon2Slot extends Argon2Policy {
  salt: string;
  iv: string;
  wrapped: string;
}
export type PasswordSlot = PBKDF2Slot | Argon2Slot;
// Read compatibility only; no new passkey wrappers may be written.
interface PasskeySlot {
  id: string;
  credential: string;
  salt: string;
  iv: string;
  wrapped: string;
}
export interface Header {
  format: "otp-vault";
  version: 1;
  kind: "vault" | "backup";
  id: string;
  revision: number;
  password: PasswordSlot;
  passkeys: PasskeySlot[];
}
export interface Envelope extends Header {
  payload: { key: string; iv: string; ciphertext: string };
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
const aad = (value: unknown) => encoder.encode(canonical(value));
const passwordAAD = (h: Pick<Header, "id" | "kind" | "password">) =>
  aad({
    format: "otp-vault",
    version: 1,
    id: h.id,
    kind: h.kind,
    purpose: "password-wrap",
    kdf: h.password.kdf,
    salt: h.password.salt,
    ...(h.password.kdf === "PBKDF2-SHA256"
      ? { iterations: h.password.iterations }
      : { m: h.password.m, t: h.password.t, p: h.password.p }),
  });
export function headerOf(e: Envelope): Header {
  const { payload: _payload, ...header } = e;
  return header;
}
export function validateEnvelope(
  input: unknown,
  kind?: Header["kind"],
  legacy = false,
): Envelope {
  const e = record(input),
    p = record(e.password),
    payload = record(e.payload);
  if (
    e.format !== "otp-vault" ||
    e.version !== 1 ||
    (e.kind !== "vault" && e.kind !== "backup") ||
    (kind && kind !== e.kind)
  )
    throw new Error("Unsupported archive format or purpose.");
  if (p.kdf === "PBKDF2-SHA256")
    integer(p.iterations, MIN_ITERATIONS, MAX_ITERATIONS);
  else if (p.kdf === "Argon2id") validateArgon2(p as unknown as Argon2Policy);
  else throw new Error("Unsupported password derivation.");
  exact(p.salt, 32);
  exact(p.iv, 12);
  exact(p.wrapped, 48);
  exact(payload.key, 40);
  exact(payload.iv, 12);
  if (unbase64(payload.ciphertext, MAX_FILE_BYTES).length < 16)
    throw new Error("Truncated encrypted payload.");
  if (
    !Array.isArray(e.passkeys) ||
    e.passkeys.length > 5 ||
    ((!legacy || e.kind === "backup") && e.passkeys.length)
  )
    throw new Error("Invalid passkey slots.");
  for (const item of e.passkeys) {
    const s = record(item);
    text(s.id, 100, false);
    const credential = unbase64(s.credential, 2048);
    if (!credential.length) throw new Error("Missing credential.");
    exact(s.salt, 32);
    exact(s.iv, 12);
    exact(s.wrapped, 48);
    if (Object.keys(s).sort().join() !== "credential,id,iv,salt,wrapped")
      throw new Error("Unsupported passkey fields.");
  }
  if (new Set(e.passkeys.map((s) => record(s).id)).size !== e.passkeys.length)
    throw new Error("Duplicate passkey identifiers.");
  if (
    Object.keys(e).sort().join() !==
      "format,id,kind,passkeys,password,payload,revision,version" ||
    Object.keys(p).sort().join() !==
      (p.kdf === "PBKDF2-SHA256"
        ? "iterations,iv,kdf,salt,wrapped"
        : "iv,kdf,m,p,salt,t,wrapped") ||
    Object.keys(payload).sort().join() !== "ciphertext,iv,key"
  )
    throw new Error("Unsupported archive fields.");
  text(e.id, 100, false);
  integer(e.revision, 0, Number.MAX_SAFE_INTEGER - 1);
  return structuredClone(e) as unknown as Envelope;
}
async function passwordKey(
  password: string,
  p: PasswordSlot,
  normalize = true,
  signal?: AbortSignal,
): Promise<CryptoKey> {
  if (!password.length || password.length > 1024)
    throw new Error("Invalid password length.");
  const bytes = encoder.encode(
    normalize ? password.normalize("NFKC") : password,
  );
  try {
    signal?.throwIfAborted();
    if (p.kdf === "Argon2id")
      return await argon2Key(bytes, exact(p.salt, 32), p, signal);
    const source = await crypto.subtle.importKey(
      "raw",
      bytes,
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: exact(p.salt, 32),
        iterations: p.iterations,
      },
      source,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    signal?.throwIfAborted();
    return key;
  } finally {
    bytes.fill(0);
  }
}
export function requireStrongPassword(password: string): void {
  if (password.length < 14 || password.length > 1024)
    throw new Error(
      "Use at least 14 characters. A long, unique passphrase is best.",
    );
}
export async function makePasswordSlot(
  raw: Uint8Array<ArrayBuffer>,
  password: string,
  id: string,
  kind: Header["kind"],
  policy: KDFPolicy | number = DEFAULT_KDF,
  signal?: AbortSignal,
): Promise<PasswordSlot> {
  requireStrongPassword(password);
  const slot: PasswordSlot = {
    ...kdfPolicy(policy),
    salt: base64(random(32)),
    iv: base64(random(12)),
    wrapped: "",
  };
  const key = await passwordKey(password, slot, true, signal);
  slot.wrapped = base64(
    new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: exact(slot.iv, 12),
          additionalData: passwordAAD({ id, kind, password: slot }),
          tagLength: 128,
        },
        key,
        raw,
      ),
    ),
  );
  return slot;
}
export async function unwrapPassword(
  e: Envelope,
  password: string,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  validateEnvelope(e, undefined, true);
  const unwrap = async (normalize: boolean) => {
    const key = await passwordKey(password, e.password, normalize, signal);
    signal?.throwIfAborted();
    const raw = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: exact(e.password.iv, 12),
          additionalData: passwordAAD(e),
          tagLength: 128,
        },
        key,
        exact(e.password.wrapped, 48),
      ),
    );
    if (signal?.aborted) {
      raw.fill(0);
      signal.throwIfAborted();
    }
    return raw;
  };
  try {
    return await unwrap(true);
  } catch (error) {
    if (
      e.password.kdf !== "PBKDF2-SHA256" ||
      !(error instanceof Error) ||
      error.name !== "OperationError" ||
      password.normalize("NFKC") === password
    )
      throw error;
    return await unwrap(false);
  }
}
export async function rotatePassword(
  envelope: Envelope,
  currentPassword: string,
  nextPassword: string,
  policy: KDFPolicy | number = DEFAULT_KDF,
  signal?: AbortSignal,
): Promise<{ key: CryptoKey; password: PasswordSlot }> {
  const previous = await unwrapPassword(envelope, currentPassword, signal);
  let raw: Uint8Array<ArrayBuffer> | undefined;
  try {
    raw = random(32);
    const password = await makePasswordSlot(
      raw,
      nextPassword,
      envelope.id,
      envelope.kind,
      policy,
      signal,
    );
    signal?.throwIfAborted();
    return { password, key: await importVaultKey(raw) };
  } finally {
    previous.fill(0);
    raw?.fill(0);
  }
}
export const importVaultKey = (
  raw: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> =>
  crypto.subtle.importKey("raw", raw, "AES-KW", false, [
    "wrapKey",
    "unwrapKey",
  ]);
export async function seal(
  header: Header,
  key: CryptoKey,
  data: VaultData,
): Promise<Envelope> {
  const clear = encoder.encode(JSON.stringify(validateData(data)));
  if (clear.length > MAX_FILE_BYTES - 100_000)
    throw new Error("Vault exceeds size limit.");
  const contentKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const iv = random(12);
  try {
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad(header), tagLength: 128 },
      contentKey,
      clear,
    );
    const wrapped = await crypto.subtle.wrapKey(
      "raw",
      contentKey,
      key,
      "AES-KW",
    );
    return validateEnvelope({
      ...header,
      payload: {
        key: base64(new Uint8Array(wrapped)),
        iv: base64(iv),
        ciphertext: base64(new Uint8Array(ciphertext)),
      },
    });
  } finally {
    clear.fill(0);
  }
}
export async function open(e: Envelope, key: CryptoKey): Promise<VaultData> {
  validateEnvelope(e, undefined, true);
  const contentKey = await crypto.subtle.unwrapKey(
    "raw",
    exact(e.payload.key, 40),
    key,
    "AES-KW",
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const clear = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: exact(e.payload.iv, 12),
        additionalData: aad(headerOf(e)),
        tagLength: 128,
      },
      contentKey,
      unbase64(e.payload.ciphertext, MAX_FILE_BYTES),
    ),
  );
  try {
    return validateData(JSON.parse(decoder.decode(clear)));
  } finally {
    clear.fill(0);
  }
}
export async function createEnvelope(
  password: string,
  data: VaultData,
  kind: Header["kind"] = "vault",
  policy: KDFPolicy | number = DEFAULT_KDF,
  signal?: AbortSignal,
): Promise<{ envelope: Envelope; key: CryptoKey }> {
  const raw = random(32),
    id = crypto.randomUUID();
  try {
    const slot = await makePasswordSlot(
      raw,
      password,
      id,
      kind,
      policy,
      signal,
    );
    const key = await importVaultKey(raw);
    return {
      envelope: await seal(
        {
          format: "otp-vault",
          version: 1,
          kind,
          id,
          revision: 0,
          password: slot,
          passkeys: [],
        },
        key,
        data,
      ),
      key,
    };
  } finally {
    raw.fill(0);
  }
}
export async function decryptEnvelope(
  input: unknown,
  password: string,
  kind?: Header["kind"],
  policy?: KDFPolicy | number,
  signal?: AbortSignal,
): Promise<{ envelope: Envelope; key: CryptoKey; data: VaultData }> {
  const envelope = validateEnvelope(input, kind, true);
  if (policy !== undefined) kdfPolicy(policy);
  const raw = await unwrapPassword(envelope, password, signal);
  try {
    const key = await importVaultKey(raw);
    const data = await open(envelope, key);
    signal?.throwIfAborted();
    const target =
      policy === undefined
        ? undefined
        : upgradePolicy(envelope.password, policy);
    if (policy !== undefined && (target || envelope.passkeys.length)) {
      try {
        const passwordSlot = target
          ? await makePasswordSlot(
              raw,
              password,
              envelope.id,
              envelope.kind,
              target,
              signal,
            )
          : envelope.password;
        const upgraded = await seal(
          {
            ...headerOf(envelope),
            revision: envelope.revision + 1,
            password: passwordSlot,
            passkeys: [],
          },
          key,
          data,
        );
        signal?.throwIfAborted();
        return { envelope: upgraded, key, data };
      } catch {
        signal?.throwIfAborted();
        // Authenticated access survives optional upgrade preparation failures too.
      }
    }
    return { envelope, key, data };
  } finally {
    raw.fill(0);
  }
}
export async function snapshot(data: VaultData): Promise<string> {
  const bytes = encoder.encode(
    canonical(
      data.accounts
        .slice()
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    ),
  );
  try {
    return base64(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  } finally {
    bytes.fill(0);
  }
}
