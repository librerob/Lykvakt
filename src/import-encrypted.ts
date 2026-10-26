import { unbase64 } from "./crypto";
import { integer, MAX_FILE_BYTES, record, text } from "./model";
import { boundedJSON } from "./import-formats";
class ImportLimitError extends Error {
  constructor() {
    super(
      "This export's password settings need more memory or work than Lykvakt allows. Export a plaintext copy on a trusted device and import that instead.",
    );
    this.name = "ImportLimitError";
  }
}
const utf8 = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const exact = (value: unknown, size: number) => {
  const bytes = unbase64(value, size);
  if (bytes.length !== size) throw new Error("Invalid encrypted import field.");
  return bytes;
};
function hex(value: unknown, size: number): Uint8Array<ArrayBuffer> {
  const s = text(value, size * 2, false);
  if (s.length !== size * 2 || !/^[0-9a-f]+$/i.test(s))
    throw new Error("Invalid encrypted import field.");
  return Uint8Array.from(s.match(/../g)!, (b) => parseInt(b, 16));
}
function aegisCipher(value: unknown, params: unknown, size?: number) {
  const p = record(params);
  const ciphertext = size ? hex(value, size) : unbase64(value, MAX_FILE_BYTES);
  if (!ciphertext.length) throw new Error("Empty encrypted import.");
  const bytes = new Uint8Array(ciphertext.length + 16);
  bytes.set(ciphertext);
  bytes.set(hex(p.tag, 16), ciphertext.length);
  return { bytes, iv: hex(p.nonce, 12) };
}
async function decrypt(
  key: CryptoKey,
  encrypted: { bytes: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer> },
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted();
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: encrypted.iv, tagLength: 128 },
      key,
      encrypted.bytes,
    ),
  );
}
async function aes(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
}
async function aegis(
  root: Record<string, unknown>,
  password: Uint8Array<ArrayBuffer>,
  signal?: AbortSignal,
): Promise<unknown> {
  if (root.version !== 1) throw new Error("Unsupported Aegis file version.");
  const header = record(root.header);
  if (!Array.isArray(header.slots) || header.slots.length > 8)
    throw new Error("Unsupported Aegis key slots.");
  const slots = header.slots.map(record).filter((s) => s.type === 1);
  if (!slots.length || slots.length > 4)
    throw new Error("Choose an Aegis export protected by a password.");
  // Validate ALL password slots before any expensive derivation or allocation.
  const checked = slots.map((s) => {
    let N: number, r: number, p: number;
    try {
      N = integer(s.n, 2, 65536);
      r = integer(s.r, 1, 8);
      p = integer(s.p, 1, 4);
    } catch {
      throw new ImportLimitError();
    }
    if ((N & (N - 1)) !== 0 || N * r * p > 524288) throw new ImportLimitError();
    return {
      N,
      r,
      p,
      salt: hex(s.salt, 32),
      encrypted: aegisCipher(s.key, s.key_params, 32),
    };
  });
  const payload = aegisCipher(root.db, header.params);
  const { scryptAsync } = await import("@noble/hashes/scrypt.js");
  for (const s of checked) {
    signal?.throwIfAborted();
    let derived: Uint8Array<ArrayBuffer> | undefined,
      raw: Uint8Array<ArrayBuffer> | undefined;
    try {
      derived = await scryptAsync(password, s.salt, {
        N: s.N,
        r: s.r,
        p: s.p,
        dkLen: 32,
        maxmem: 65 * 1024 * 1024,
        asyncTick: 8,
        onProgress: () => signal?.throwIfAborted(),
      });
      raw = await decrypt(await aes(derived), s.encrypted, signal);
    } catch (error) {
      raw?.fill(0);
      signal?.throwIfAborted();
      if (error instanceof DOMException && error.name === "OperationError")
        continue;
      throw error;
    } finally {
      derived?.fill(0);
    }
    try {
      const plaintext = await decrypt(await aes(raw!), payload, signal);
      try {
        signal?.throwIfAborted();
        return {
          version: 1,
          header: null,
          db: boundedJSON(decoder.decode(plaintext)),
        };
      } finally {
        plaintext.fill(0);
      }
    } finally {
      raw?.fill(0);
    }
  }
  throw new DOMException(
    "The source password did not work, or the file is damaged.",
    "OperationError",
  );
}
function twofasCipher(value: unknown) {
  if (typeof value !== "string" || value.length > MAX_FILE_BYTES)
    throw new Error("Invalid encrypted 2FAS data.");
  const parts = value.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted 2FAS data.");
  const bytes = unbase64(parts[0], MAX_FILE_BYTES),
    salt = unbase64(parts[1], 256),
    iv = exact(parts[2], 12);
  if (bytes.length < 16 || salt.length < 16)
    throw new Error("Invalid encrypted 2FAS data.");
  return { bytes, salt, iv };
}
async function twofas(
  root: Record<string, unknown>,
  password: Uint8Array<ArrayBuffer>,
  signal?: AbortSignal,
): Promise<unknown> {
  if (root.schemaVersion !== 4)
    throw new Error("Unsupported 2FAS file version.");
  const payload = twofasCipher(root.servicesEncrypted),
    reference = twofasCipher(root.reference);
  if (
    reference.bytes.length > 1024 ||
    reference.salt.toString() !== payload.salt.toString()
  )
    throw new Error("Invalid 2FAS reference.");
  const material = await crypto.subtle.importKey(
    "raw",
    password,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  signal?.throwIfAborted();
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", iterations: 10000, salt: payload.salt },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const ref = await decrypt(key, reference, signal);
  ref.fill(0);
  const plaintext = await decrypt(key, payload, signal);
  try {
    signal?.throwIfAborted();
    return {
      schemaVersion: 4,
      services: boundedJSON(decoder.decode(plaintext)),
    };
  } finally {
    plaintext.fill(0);
  }
}
export async function decryptImport(
  format: "aegis" | "2fas",
  value: unknown,
  password: string,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!password.length || password.length > 1024)
    throw new Error("Enter an export password of at most 1024 characters.");
  signal?.throwIfAborted();
  // Source passwords are used verbatim: these formats do not specify normalization.
  const bytes = utf8.encode(password);
  try {
    return await (format === "aegis" ? aegis : twofas)(
      record(value),
      bytes,
      signal,
    );
  } finally {
    bytes.fill(0);
  }
}
