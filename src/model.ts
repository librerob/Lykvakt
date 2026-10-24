import { normalizeSecret } from "./otp";

export type Algorithm = "SHA-1" | "SHA-256" | "SHA-512";
export interface Account {
  id: string;
  issuer: string;
  label: string;
  secret: string;
  type: "totp" | "hotp";
  algorithm: Algorithm;
  digits: 6 | 8;
  period: number;
  counter: string;
  favorite: boolean;
  group: string;
  origins: string[];
}
export interface VaultData {
  version: 2;
  accounts: Account[];
  verifiedAt: string | null;
  verifiedSnapshot: string | null;
}
export const MAX_ACCOUNTS = 2000;
export const MAX_FILE_BYTES = 8_000_000;
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 200, empty = true): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim()) ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw new Error("Invalid text field.");
  return value;
}
export function integer(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error("Invalid numeric field.");
  return value;
}
export function validateCounter(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]{0,19})$/.test(value) ||
    BigInt(value) > 0xffffffffffffffffn
  )
    throw new Error("Counter must be an unsigned 64-bit integer.");
  return value;
}
export function validateAccount(value: unknown): Account {
  const a = record(value);
  if (a.type !== "totp" && a.type !== "hotp")
    throw new Error("Unsupported OTP type.");
  if (
    a.algorithm !== "SHA-1" &&
    a.algorithm !== "SHA-256" &&
    a.algorithm !== "SHA-512"
  )
    throw new Error("Unsupported hash algorithm.");
  if (a.digits !== 6 && a.digits !== 8)
    throw new Error("Only six or eight digit codes are supported.");
  if (typeof a.favorite !== "boolean") throw new Error("Invalid favorite.");
  return {
    id: text(a.id, 100, false),
    issuer: text(a.issuer),
    label: text(a.label, 200, false),
    secret: normalizeSecret(text(a.secret, 1024, false)),
    type: a.type,
    algorithm: a.algorithm,
    digits: a.digits,
    period: integer(a.period, 1, 3600),
    counter: validateCounter(a.counter),
    favorite: a.favorite,
    group: text(a.group, 80),
    origins: validateOrigins(a.origins ?? []),
  };
}
export function validateData(value: unknown): VaultData {
  const d = record(value);
  if (
    (d.version !== 1 && d.version !== 2) ||
    !Array.isArray(d.accounts) ||
    d.accounts.length > MAX_ACCOUNTS
  )
    throw new Error("Unsupported vault schema or too many accounts.");
  const accounts = d.accounts.map((a) =>
    validateAccount(d.version === 1 ? { ...record(a), origins: [] } : a),
  );
  if (new Set(accounts.map((a) => a.id)).size !== accounts.length)
    throw new Error("Duplicate record identifiers.");
  return {
    version: 2,
    accounts,
    verifiedAt:
      d.version === 1 || d.verifiedAt === null ? null : text(d.verifiedAt, 40),
    verifiedSnapshot:
      d.version === 1 || d.verifiedSnapshot === null
        ? null
        : text(d.verifiedSnapshot, 100),
  };
}
export function emptyVault(): VaultData {
  return { version: 2, accounts: [], verifiedAt: null, verifiedSnapshot: null };
}
export function identity(a: Account): string {
  return JSON.stringify([a.type, a.secret]);
}

export function siteOrigin(value: unknown): string {
  const raw = text(value, 2048, false);
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.origin === "null"
  )
    throw new Error("Filling requires an HTTPS website.");
  return url.origin;
}
function validateOrigins(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 20)
    throw new Error("Invalid website associations.");
  return [
    ...new Set(
      value.map((origin) => {
        const normalized = siteOrigin(origin);
        if (origin !== normalized)
          throw new Error("Associations must be exact HTTPS origins.");
        return normalized;
      }),
    ),
  ];
}
