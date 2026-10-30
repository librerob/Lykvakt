import {
  collectImport,
  requireAccounts,
  type ImportResult,
} from "./import-result";
export type { ImportResult, SkippedEntry } from "./import-result";
import { parseMigrationImport } from "./migration";
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
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Invalid OTP URI.");
  }
  if (
    url.protocol !== "otpauth:" ||
    !["totp", "hotp", "steam"].includes(url.hostname) ||
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
    (url.hostname !== "hotp" && url.searchParams.has("counter"))
  )
    throw new Error("Parameters conflict with OTP type.");
  if (
    url.hostname === "steam" &&
    (url.searchParams.get("digits") !== "5" ||
      url.searchParams.get("period") !== "30")
  )
    throw new Error(
      "Steam links require explicit five-character, 30-second settings.",
    );
  const label = decodeURIComponent(url.pathname.slice(1));
  const colon = label.indexOf(":");
  const prefix = colon < 0 ? "" : label.slice(0, colon).trim();
  const issuer = url.searchParams.get("issuer") ?? prefix;
  if (prefix && issuer !== prefix)
    throw new Error("Issuer in label conflicts with issuer parameter.");
  // FreeOTP+ uses issuer Steam with five-character TOTP links.
  const steam =
    url.hostname === "steam" ||
    (url.hostname === "totp" &&
      issuer === "Steam" &&
      url.searchParams.get("digits") === "5");
  const algorithm = url.searchParams.get("algorithm") ?? "SHA1";
  const algorithms: Record<string, string> = {
    SHA1: "SHA-1",
    SHA256: "SHA-256",
    SHA512: "SHA-512",
    "SHA-1": "SHA-1",
    "SHA-256": "SHA-256",
    "SHA-512": "SHA-512",
  };
  const digits = url.searchParams.get("digits") ?? (steam ? "5" : "6");
  const period = url.searchParams.get("period") ?? "30";
  if (
    !(steam ? digits === "5" : /^(6|8)$/.test(digits)) ||
    !/^[1-9][0-9]{0,3}$/.test(period)
  )
    throw new Error("Unsupported digits or period.");
  if (url.hostname === "hotp" && !url.searchParams.has("counter"))
    throw new Error("HOTP requires an explicit counter.");
  return validateAccount({
    id: crypto.randomUUID(),
    issuer,
    label: colon < 0 ? label : label.slice(colon + 1).trim(),
    secret: url.searchParams.get("secret"),
    type: steam ? "steam" : url.hostname,
    algorithm: algorithms[algorithm.toUpperCase()],
    digits: Number(digits),
    period: Number(period),
    counter: url.searchParams.get("counter") ?? "0",
    favorite: false,
    group: "",
  });
}
function transferNames(a: Account): { issuer: string; label: string } {
  // Replace ill-formed UTF-16 only in the explicitly reviewed transfer copy.
  const name = (value: string) =>
    new TextDecoder()
      .decode(new TextEncoder().encode(value))
      .replace(/:/g, " ")
      .trim();
  const issuer = name(a.issuer),
    label = name(a.label);
  // URL parsers normalize an unprefixed dot segment instead of keeping its label.
  return {
    issuer,
    label:
      !label || (!issuer && (label === "." || label === ".."))
        ? "Account"
        : label,
  };
}
export function prepareTransfer(input: Account[]): {
  accounts: Account[];
  renamed: { from: string; to: string }[];
} {
  const renamed: { from: string; to: string }[] = [];
  const accounts = input.map((value) => {
    const a = validateAccount(value),
      names = transferNames(a);
    if (names.issuer !== a.issuer || names.label !== a.label)
      renamed.push({
        from: `${a.issuer} · ${a.label}`,
        to: `${names.issuer} · ${names.label}`,
      });
    const copy = { ...a, ...names };
    toURI(copy); // Check the link before asking for a password.
    return copy;
  });
  return { accounts, renamed };
}
export function toURI(a: Account): string {
  const names = transferNames(a);
  if (names.issuer !== a.issuer || names.label !== a.label)
    throw new Error("Review the transfer names before exporting this account.");
  const query = new URLSearchParams({
    secret: a.secret,
    issuer: a.issuer,
    algorithm: a.algorithm.replace("-", ""),
    digits: String(a.digits),
  });
  query.set(
    a.type !== "hotp" ? "period" : "counter",
    a.type !== "hotp" ? String(a.period) : a.counter,
  );
  const prefix = `otpauth://${a.type}/`,
    suffix = `?${query}`;
  let uri =
    prefix +
    encodeURIComponent(a.issuer ? a.issuer + ":" + a.label : a.label) +
    suffix;
  // Keep the issuer parameter, but skip the repeated prefix if the link is too long.
  if (uri.length > 5000) uri = prefix + encodeURIComponent(a.label) + suffix;
  if (uri.length > 5000)
    throw new Error(
      "This account is too large for an OTP link. Use an encrypted backup.",
    );
  return uri;
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
): ImportResult {
  if (new TextEncoder().encode(input).length > MAX_FILE_BYTES)
    throw new Error("Import is too large.");
  if (format === "uri") {
    const entries = input
      .split(/\r?\n/)
      .map((line, i) => ({ value: line.trim(), index: i + 1 }))
      .filter((line) => line.value);
    const lines = entries.map((line) => line.value);
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
      return parseMigrationImport(migrations);
    }
    return requireAccounts(
      collectImport(
        lines,
        parseURI,
        "Invalid or unsupported OTP URI.",
        entries.map((line) => line.index),
      ),
    );
  }

  const parsed = record(JSON.parse(input));
  let rows: unknown[];
  if (format === "aegis") {
    if (
      parsed.version !== 1 ||
      (parsed.header !== null &&
        (typeof parsed.header !== "object" ||
          (Object.keys(record(parsed.header)).length !== 0 &&
            !(
              Object.keys(record(parsed.header)).sort().join() ===
                "params,slots" &&
              record(parsed.header).params === null &&
              record(parsed.header).slots === null
            )))) ||
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
  return requireAccounts(
    collectImport(rows, (row) => {
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
      if (
        type === "steam" &&
        (otp.digits !== 5 || otp.period !== 30 || hash !== "SHA1")
      )
        throw new Error("Unsupported OTP type or Steam settings.");
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
    }),
  );
}
export async function verifyBackup(
  input: unknown,
  password: string,
  current?: VaultData,
  signal?: AbortSignal,
): Promise<{
  data: VaultData;
  count: number;
  matches: boolean | null;
  fingerprint: string;
}> {
  const { data } = await decryptEnvelope(input, password, "backup", signal);
  for (const account of data.accounts) {
    signal?.throwIfAborted();
    await codeFor(account, 1_234_567_890_000);
  }
  signal?.throwIfAborted();
  const fingerprint = await snapshot(data);
  return {
    data,
    count: data.accounts.length,
    fingerprint,
    matches: current ? fingerprint === (await snapshot(current)) : null,
  };
}
