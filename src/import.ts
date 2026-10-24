import { parseMigrationBatch } from "./migration";
import {
  identity,
  MAX_ACCOUNTS,
  MAX_FILE_BYTES,
  record,
  validateAccount,
  type Account,
} from "./model";
import { codeFor } from "./otp";
import { decryptEnvelope, snapshot } from "./crypto";
import type { VaultData } from "./model";

export function parseURI(input: string): Account {
  if (input.length > 5000 || /[\r\n\u0000]/.test(input))
    throw new Error("Invalid OTP URI.");
  const url = new URL(input);
  if (
    url.protocol !== "otpauth:" ||
    !["totp", "hotp"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  )
    throw new Error("Only standard otpauth TOTP or HOTP URIs are supported.");
  const allowed = new Set([
    "secret",
    "issuer",
    "algorithm",
    "digits",
    "period",
    "counter",
  ]);
  for (const key of url.searchParams.keys())
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1)
      throw new Error("Unknown or duplicate OTP parameter.");
  if (
    (url.hostname === "hotp" && url.searchParams.has("period")) ||
    (url.hostname === "totp" && url.searchParams.has("counter"))
  )
    throw new Error("Parameters conflict with OTP type.");
  const label = decodeURIComponent(url.pathname.slice(1));
  const colon = label.indexOf(":");
  const prefix = colon < 0 ? "" : label.slice(0, colon).trim();
  const issuer = url.searchParams.get("issuer") ?? prefix;
  if (prefix && issuer !== prefix)
    throw new Error("Issuer in label conflicts with issuer parameter.");
  const algorithm = url.searchParams.get("algorithm") ?? "SHA1";
  const algorithms: Record<string, string> = {
    SHA1: "SHA-1",
    SHA256: "SHA-256",
    SHA512: "SHA-512",
    "SHA-1": "SHA-1",
    "SHA-256": "SHA-256",
    "SHA-512": "SHA-512",
  };
  const digits = url.searchParams.get("digits") ?? "6";
  const period = url.searchParams.get("period") ?? "30";
  if (!/^(6|8)$/.test(digits) || !/^[1-9][0-9]{0,3}$/.test(period))
    throw new Error("Unsupported digits or period.");
  if (url.hostname === "hotp" && !url.searchParams.has("counter"))
    throw new Error("HOTP requires an explicit counter.");
  return validateAccount({
    id: crypto.randomUUID(),
    issuer,
    label: colon < 0 ? label : label.slice(colon + 1).trim(),
    secret: url.searchParams.get("secret"),
    type: url.hostname,
    algorithm: algorithms[algorithm.toUpperCase()],
    digits: Number(digits),
    period: Number(period),
    counter: url.searchParams.get("counter") ?? "0",
    favorite: false,
    group: "",
  });
}
export function toURI(a: Account): string {
  const query = new URLSearchParams({
    secret: a.secret,
    issuer: a.issuer,
    algorithm: a.algorithm.replace("-", ""),
    digits: String(a.digits),
  });
  query.set(
    a.type === "totp" ? "period" : "counter",
    a.type === "totp" ? String(a.period) : a.counter,
  );
  return `otpauth://${a.type}/${encodeURIComponent(a.issuer ? a.issuer + ":" + a.label : a.label)}?${query}`;
}
export interface ImportPreview {
  accounts: Account[];
  duplicates: number;
  conflicts: number;
}
export function previewImport(
  incoming: Account[],
  existing: Account[],
): ImportPreview {
  if (incoming.length > MAX_ACCOUNTS)
    throw new Error("Too many imported accounts.");
  const keys = new Map(existing.map((a) => [identity(a), a]));
  const accounts: Account[] = [];
  let duplicates = 0,
    conflicts = 0;
  for (const entry of incoming.map(validateAccount)) {
    const old = keys.get(identity(entry));
    if (old) {
      const properties = (a: Account) =>
        JSON.stringify([
          a.issuer,
          a.label,
          a.algorithm,
          a.digits,
          a.period,
          a.counter,
        ]);
      if (properties(old) === properties(entry)) duplicates++;
      else conflicts++;
      continue;
    }
    keys.set(identity(entry), entry);
    accounts.push({ ...entry, id: crypto.randomUUID() });
  }
  if (existing.length + accounts.length > MAX_ACCOUNTS)
    throw new Error("Import would exceed the vault size limit.");
  return { accounts, duplicates, conflicts };
}
export function parseImport(
  input: string,
  format: "uri" | "aegis" | "2fas",
): Account[] {
  if (new TextEncoder().encode(input).length > MAX_FILE_BYTES)
    throw new Error("Import is too large.");
  if (format === "uri") {
    const lines = input
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length || lines.length > MAX_ACCOUNTS)
      throw new Error("Supply 1–2000 OTP URIs.");
    const migrations = lines.filter((line) =>
      line.startsWith("otpauth-migration:"),
    );
    if (migrations.length) {
      if (migrations.length !== lines.length)
        throw new Error(
          "Import Google transfers separately from standard OTP links.",
        );
      return parseMigrationBatch(migrations);
    }
    return lines.map((line, i) => {
      try {
        return parseURI(line);
      } catch {
        throw new Error(
          `Account ${i + 1} is invalid or unsupported. Nothing was imported.`,
        );
      }
    });
  }
  const parsed = record(JSON.parse(input));
  let rows: unknown[];
  if (format === "aegis") {
    if (
      parsed.version !== 1 ||
      (parsed.header !== null &&
        (typeof parsed.header !== "object" ||
          Object.keys(record(parsed.header)).length !== 0)) ||
      typeof parsed.db !== "object"
    )
      throw new Error(
        "Only unencrypted Aegis version 1 export envelopes are supported.",
      );
    const db = record(parsed.db);
    if (db.version !== 3 || !Array.isArray(db.entries))
      throw new Error("Unsupported Aegis database version.");
    rows = db.entries;
  } else {
    if (
      parsed.schemaVersion !== 4 ||
      parsed.servicesEncrypted ||
      !Array.isArray(parsed.services)
    )
      throw new Error("Only unencrypted 2FAS schema 4 exports are supported.");
    rows = parsed.services;
  }
  if (!rows.length || rows.length > MAX_ACCOUNTS)
    throw new Error("Unsupported import size.");
  return rows.map((row, index) => {
    try {
      const item = record(row),
        otp = record(format === "aegis" ? item.info : item.otp);
      const hash = String(otp.algo ?? otp.algorithm)
        .toUpperCase()
        .replace("-", "");
      const algorithms: Record<string, string> = {
        SHA1: "SHA-1",
        SHA256: "SHA-256",
        SHA512: "SHA-512",
      };
      const type =
        format === "aegis" ? item.type : String(otp.tokenType).toLowerCase();
      if (type === "hotp" && otp.counter === undefined)
        throw new Error("HOTP requires an explicit counter.");
      const counter = otp.counter ?? 0;
      if (typeof counter !== "string" && !Number.isSafeInteger(counter))
        throw new Error("Unsafe HOTP counter.");
      const account = format === "2fas" ? otp.account : undefined;
      if (
        format === "2fas" &&
        account !== undefined &&
        typeof account !== "string"
      )
        throw new Error("Invalid 2FAS account identifier.");
      return validateAccount({
        id: crypto.randomUUID(),
        type,
        issuer: format === "aegis" ? item.issuer : (otp.issuer ?? item.name),
        label:
          format === "aegis" ? item.name : (account ?? otp.label ?? item.name),
        secret: format === "aegis" ? otp.secret : item.secret,
        algorithm: algorithms[hash],
        digits: otp.digits,
        period: otp.period ?? 30,
        counter: String(counter),
        group: "",
        favorite: false,
      });
    } catch {
      throw new Error(
        `Account ${index + 1} is invalid or unsupported. Nothing was imported.`,
      );
    }
  });
}
export async function verifyBackup(
  input: unknown,
  password: string,
  current?: VaultData,
): Promise<{
  data: VaultData;
  count: number;
  matches: boolean | null;
  fingerprint: string;
}> {
  const { data } = await decryptEnvelope(input, password, "backup");
  for (const account of data.accounts)
    await codeFor(account, 1_234_567_890_000);
  const fingerprint = await snapshot(data);
  return {
    data,
    count: data.accounts.length,
    fingerprint,
    matches: current ? fingerprint === (await snapshot(current)) : null,
  };
}
