import { parseImport, parseURI } from "./import";
import {
  collectImport,
  requireAccounts,
  type ImportResult,
} from "./import-result";
import { unbase64 } from "./crypto";
import { encodeBase32 } from "./otp";
import {
  MAX_ACCOUNTS,
  MAX_FILE_BYTES,
  record,
  validateAccount,
  type Account,
} from "./model";

type Format =
  | "uri"
  | "aegis"
  | "2fas"
  | "andotp"
  | "bitwarden"
  | "raivo"
  | "proton"
  | "stratum"
  | "mafile";
export interface DetectedImport {
  format: Format;
  name: string;
  encrypted: boolean;
  value: unknown;
}
export class UnrecognizedImportError extends Error {
  constructor() {
    super(
      "We couldn't recognise this file. Choose an unchanged export from a supported app, or paste OTP setup links. Nothing was imported.",
    );
    this.name = "UnrecognizedImportError";
  }
}
export function boundedJSON(input: string): unknown {
  if (
    input.length > MAX_FILE_BYTES ||
    new TextEncoder().encode(input).length > MAX_FILE_BYTES
  )
    throw new Error("Import exceeds the 8 MB limit.");
  let depth = 0,
    quoted = false,
    escaped = false;
  for (const c of input) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{" || c === "[") {
      if (++depth > 32) throw new Error("Import is nested too deeply.");
    } else if (c === "}" || c === "]") depth--;
  }
  try {
    return JSON.parse(input);
  } catch {
    throw new SyntaxError("Invalid export JSON.");
  }
}
function rows(value: unknown): unknown[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_ACCOUNTS)
    throw new Error("Choose a file containing 1–2000 entries.");
  return value;
}
export function detectImport(input: string): DetectedImport {
  if (
    input.length > MAX_FILE_BYTES ||
    new TextEncoder().encode(input).length > MAX_FILE_BYTES
  )
    throw new Error("Import exceeds the 8 MB limit.");
  const trimmed = input.trim();
  const link = /^[ \t]*(otpauth(?:-migration)?):/m.exec(trimmed);
  if (link)
    return {
      format: "uri",
      name:
        link[1] === "otpauth-migration"
          ? "Google Authenticator transfer"
          : "OTP links",
      encrypted: false,
      value: input,
    };
  let value: unknown;
  try {
    value = boundedJSON(input);
  } catch (error) {
    if (error instanceof SyntaxError) throw new UnrecognizedImportError();
    throw error;
  }
  if (Array.isArray(value)) {
    const entries = rows(value);
    const has = (key: string) =>
      entries.some((e) => e && typeof e === "object" && Object.hasOwn(e, key));
    if (has("kind") && !has("type"))
      return {
        format: "raivo",
        name: "Raivo OTP JSON",
        encrypted: false,
        value,
      };
    if (has("type") && !has("kind"))
      return {
        format: "andotp",
        name: "andOTP plaintext JSON",
        encrypted: false,
        value,
      };
    throw new UnrecognizedImportError();
  }
  const root = record(value);
  if (root.version === 1 && Object.hasOwn(root, "db"))
    return {
      format: "aegis",
      name: "Aegis",
      encrypted: typeof root.db === "string",
      value,
    };
  if (root.schemaVersion === 4)
    return {
      format: "2fas",
      name: "2FAS",
      encrypted:
        typeof root.servicesEncrypted === "string" && !!root.servicesEncrypted,
      value,
    };
  if (root.encrypted === false && Array.isArray(root.items))
    return {
      format: "bitwarden",
      name: "Bitwarden JSON (OTP fields only)",
      encrypted: false,
      value,
    };
  if (
    root.version === 1 &&
    Array.isArray(root.entries) &&
    !Object.hasOwn(root, "salt")
  )
    return {
      format: "proton",
      name: "Proton Authenticator plaintext JSON",
      encrypted: false,
      value,
    };
  if (Array.isArray(root.Authenticators))
    return {
      format: "stratum",
      name: "Stratum plaintext JSON",
      encrypted: false,
      value,
    };
  if (Object.hasOwn(root, "shared_secret"))
    return { format: "mafile", name: "Steam .maFile", encrypted: false, value };
  throw new UnrecognizedImportError();
}
function account(fields: Record<string, unknown>): Account {
  const type = String(fields.type ?? "totp").toLowerCase();
  const hashes: Record<string, string> = {
    SHA1: "SHA-1",
    SHA256: "SHA-256",
    SHA512: "SHA-512",
  };
  const counter = fields.counter ?? "0";
  if (typeof counter !== "string" && !Number.isSafeInteger(counter))
    throw new Error("Unsafe HOTP counter.");
  if (type === "hotp" && fields.counter === undefined)
    throw new Error("HOTP requires an explicit counter.");
  return validateAccount({
    id: crypto.randomUUID(),
    issuer: fields.issuer ?? "",
    label: fields.label,
    secret: fields.secret,
    type,
    algorithm:
      hashes[
        String(fields.algorithm ?? "SHA1")
          .toUpperCase()
          .replace("-", "")
      ],
    digits: fields.digits ?? (type === "steam" ? 5 : 6),
    period: fields.period ?? 30,
    counter: String(counter),
    favorite: false,
    group: "",
  });
}
function decimal(value: unknown): number {
  if (typeof value !== "string" || !/^[0-9]{1,4}$/.test(value))
    throw new Error("Invalid numeric setting.");
  return Number(value);
}
export function parseAndOTP(value: unknown): ImportResult {
  return requireAccounts(
    collectImport(rows(value), (row) => {
      const e = record(row);
      return account({
        type: e.type,
        issuer: e.issuer,
        label: e.label,
        secret: e.secret,
        algorithm: e.algorithm,
        digits: e.digits,
        period: e.period,
        counter: e.counter,
      });
    }),
  );
}
export function parseBitwarden(value: unknown): ImportResult {
  const root = record(value);
  if (root.encrypted !== false)
    throw new Error("Choose a plaintext Bitwarden JSON export.");
  return requireAccounts(
    collectImport(rows(root.items), (row) => {
      const e = record(row);
      if (e.type !== 1)
        throw new Error("Not a login with a supported OTP setup key.");
      const login = record(e.login),
        otp = login.totp;
      // Never read/copy login.password, notes, custom fields, URLs or other secrets.
      if (typeof otp !== "string" || !otp.trim() || otp.length > 5000)
        throw new Error("No supported OTP setup key.");
      return otp.startsWith("otpauth:")
        ? parseURI(otp)
        : account({ issuer: "", label: e.name, secret: otp });
    }),
  );
}
export function parseRaivo(value: unknown): ImportResult {
  return requireAccounts(
    collectImport(rows(value), (row) => {
      const e = record(row);
      return account({
        type: e.kind,
        issuer: e.issuer,
        label: e.account || e.issuer,
        secret: e.secret,
        algorithm: e.algorithm,
        digits: decimal(e.digits),
        period: decimal(e.timer),
        counter: e.counter,
      });
    }),
  );
}
export function parseProton(value: unknown): ImportResult {
  const root = record(value);
  if (root.version !== 1 || Object.hasOwn(root, "salt"))
    throw new Error("Choose a plaintext Proton Authenticator export.");
  return requireAccounts(
    collectImport(rows(root.entries), (row) => {
      const e = record(row),
        content = record(e.content);
      if (content.entry_type !== "Totp")
        throw new Error(
          "This Proton entry type cannot be imported. Export Steam as a .maFile or Aegis file instead.",
        );
      if (typeof content.uri !== "string")
        throw new Error("Missing OTP setup link.");
      const a = parseURI(content.uri);
      if (a.type !== "totp") throw new Error("Conflicting Proton entry type.");
      return a;
    }),
  );
}
export function parseStratum(value: unknown): ImportResult {
  return requireAccounts(
    collectImport(rows(record(value).Authenticators), (row) => {
      const e = record(row);
      if (
        !Number.isInteger(e.Type) ||
        (e.Type !== 4 &&
          (!Number.isInteger(e.Algorithm) ||
            Number(e.Algorithm) < 0 ||
            Number(e.Algorithm) > 2))
      )
        throw new Error("Invalid Stratum settings.");
      const type = (
        { 1: "hotp", 2: "totp", 4: "steam" } as Record<string, string>
      )[String(e.Type)];
      if (!type) throw new Error("Unsupported Stratum account type.");
      return account({
        type,
        issuer: e.Issuer,
        label: e.Username || e.Issuer,
        secret: e.Secret,
        algorithm:
          type === "steam"
            ? "SHA1"
            : ["SHA1", "SHA256", "SHA512"][Number(e.Algorithm)],
        digits: type === "steam" ? 5 : e.Digits,
        period: type === "steam" ? 30 : e.Period,
        counter: type === "hotp" ? e.Counter : "0",
      });
    }),
  );
}
export function parseMaFile(value: unknown): ImportResult {
  const e = record(value),
    bytes = unbase64(e.shared_secret, 640);
  try {
    return {
      accounts: [
        account({
          type: "steam",
          issuer: "Steam",
          label: e.account_name,
          secret: encodeBase32(bytes),
        }),
      ],
      skipped: [],
    };
  } finally {
    bytes.fill(0);
  }
}
export async function readImport(
  input: string,
  password?: string,
  signal?: AbortSignal,
): Promise<ImportResult & { name: string }> {
  signal?.throwIfAborted();
  return readDetectedImport(detectImport(input), password, signal);
}
// The UI passes the bounded detection result so secret-bearing JSON is parsed only once.
export async function readDetectedImport(
  detected: DetectedImport,
  password?: string,
  signal?: AbortSignal,
): Promise<ImportResult & { name: string }> {
  signal?.throwIfAborted();
  let value = detected.value;
  if (detected.encrypted) {
    if (!password) throw new Error("Enter the password for this export file.");
    const { decryptImport } = await import("./import-encrypted");
    value = await decryptImport(
      detected.format as "aegis" | "2fas",
      value,
      password,
      signal,
    );
  }
  signal?.throwIfAborted();
  const parsers = {
    andotp: parseAndOTP,
    bitwarden: parseBitwarden,
    raivo: parseRaivo,
    proton: parseProton,
    stratum: parseStratum,
    mafile: parseMaFile,
  };
  const result =
    detected.format === "uri"
      ? parseImport(
          String(value)
            .split(/\r?\n/)
            .map((line) => {
              if (!line.trim().startsWith("otpauth:") || line.length > 5000)
                return line;
              try {
                const url = new URL(line.trim());
                if (
                  [...url.searchParams.keys()].some(
                    (key) => url.searchParams.getAll(key).length !== 1,
                  )
                )
                  return line;
                // FreeOTP+ writes period even for HOTP; it does not affect a counter-based code.
                if (
                  url.hostname === "hotp" &&
                  url.searchParams.get("period") === "30"
                )
                  url.searchParams.delete("period");
                // FreeOTP presentation metadata is never fetched or stored.
                for (const key of ["image", "color", "lock", "issuerAlt"])
                  url.searchParams.delete(key);
                return url.href;
              } catch {
                return line;
              }
            })
            .join("\n"),
          "uri",
        )
      : detected.format === "aegis" || detected.format === "2fas"
        ? parseImport(JSON.stringify(value), detected.format)
        : parsers[detected.format](value);
  signal?.throwIfAborted();
  return { ...result, name: detected.name };
}
