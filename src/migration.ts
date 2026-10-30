import {
  collectImport,
  requireAccounts,
  type ImportResult,
  type SkippedEntry,
} from "./import-result";
// Decode Google's transfer format using the schema maintained by Aegis.
// Reference: beemdevelopment/Aegis app/src/main/proto/google_auth.proto.
import { encodeBase32 } from "./otp";
import {
  MAX_ACCOUNTS,
  MAX_FILE_BYTES,
  validateAccount,
  type Account,
} from "./model";
class Reader {
  offset = 0;
  constructor(readonly data: Uint8Array) {}
  varint(): bigint {
    let result = 0n;
    for (let i = 0; i < 10; i++) {
      const byte = this.data[this.offset++];
      if (byte === undefined || (i === 9 && byte > 1))
        throw new Error("Invalid transfer integer.");
      result |= BigInt(byte & 127) << BigInt(i * 7);
      if (!(byte & 128)) return result;
    }
    throw new Error("Invalid transfer integer.");
  }
  fields(
    schema: Readonly<Record<number, number>>,
    maxFields: number,
  ): Map<number, (bigint | Uint8Array)[]> {
    const fields = new Map<number, (bigint | Uint8Array)[]>();
    let count = 0;
    while (this.offset < this.data.length) {
      if (++count > maxFields) throw new Error("Too many transfer fields.");
      const tag = this.varint();
      const field = Number(tag >> 3n),
        wire = Number(tag & 7n);
      if (field < 1 || field > 0x1fffffff)
        throw new Error("Invalid transfer field.");
      const limit = schema[field];
      let value: bigint | Uint8Array;
      if (wire === 0) {
        value = this.varint();
        if (limit === undefined) continue;
        if (limit !== 0) throw new Error("Invalid transfer field type.");
      } else if (wire === 2) {
        const length = this.varint();
        if (length > BigInt(this.data.length - this.offset))
          throw new Error("Truncated transfer field.");
        const start = this.offset;
        this.offset += Number(length);
        if (limit === undefined) continue;
        if (limit === 0) throw new Error("Invalid transfer field type.");
        if (length > BigInt(limit))
          throw new Error("Transfer field exceeds its size limit.");
        // Keep views into the input for known fields, and skip unknown fields.
        value = this.data.subarray(start, this.offset);
      } else throw new Error("Unsupported transfer encoding.");
      const values = fields.get(field) ?? [];
      if (values.length >= MAX_ACCOUNTS)
        throw new Error("Too many transfer fields.");
      values.push(value);
      fields.set(field, values);
    }
    return fields;
  }
}
type Fields = ReturnType<Reader["fields"]>;
function one(f: Fields, key: number): bigint | Uint8Array | undefined {
  const values = f.get(key);
  if (values && values.length !== 1)
    throw new Error("Duplicate transfer field.");
  return values?.[0];
}
function num(f: Fields, key: number, fallback?: bigint): bigint {
  const value = one(f, key) ?? fallback;
  if (typeof value !== "bigint")
    throw new Error("Missing or invalid transfer integer.");
  return value;
}
function bytes(f: Fields, key: number, required = true): Uint8Array {
  const value = one(f, key);
  if (!required && value === undefined) return new Uint8Array();
  if (!(value instanceof Uint8Array))
    throw new Error("Missing or invalid transfer bytes.");
  return value;
}
function string(f: Fields, key: number): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes(f, key, false));
}
export interface Transfer {
  accounts: Account[];
  skipped: SkippedEntry[];
  entryCount: number;
  batchSize: number;
  batchIndex: number;
  batchId: string;
}
export function parseMigration(input: string, partial = false): Transfer {
  if (input.length > MAX_FILE_BYTES || /[\r\n\u0000]/.test(input))
    throw new Error("Invalid Google transfer URI.");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Invalid Google transfer URI.");
  }
  if (
    url.protocol !== "otpauth-migration:" ||
    url.hostname !== "offline" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    (url.pathname && url.pathname !== "/") ||
    [...url.searchParams.keys()].some((k) => k !== "data") ||
    url.searchParams.getAll("data").length !== 1
  )
    throw new Error("Invalid Google transfer URI.");
  const encoded = url.searchParams.get("data")!;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1)
    throw new Error("Invalid transfer base64.");
  let raw: Uint8Array;
  try {
    const decoded = atob(encoded);
    raw = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) raw[i] = decoded.charCodeAt(i);
  } catch {
    throw new Error("Invalid transfer base64.");
  }
  try {
    const fields = new Reader(raw).fields(
      { 1: 4096, 2: 0, 3: 0, 4: 0, 5: 0 },
      MAX_ACCOUNTS + 32,
    );
    if (num(fields, 2) !== 1n)
      throw new Error("Unsupported Google transfer version.");
    const size = num(fields, 3),
      index = num(fields, 4, 0n),
      batchId = num(fields, 5, 0n).toString();
    if (
      size < 1n ||
      size > 100n ||
      index >= size ||
      (size > 1n && !fields.has(5))
    )
      throw new Error("Invalid Google transfer batch.");
    const entries = fields.get(1);
    if (!entries?.length || entries.length > MAX_ACCOUNTS)
      throw new Error("Empty or oversized Google transfer.");
    const result = collectImport(entries, (entry) => {
      if (!(entry instanceof Uint8Array))
        throw new Error("Invalid transfer account.");
      const f = new Reader(entry).fields(
        { 1: 640, 2: 2048, 3: 800, 4: 0, 5: 0, 6: 0, 7: 0 },
        32,
      );
      const algorithm = (
        { 0: "SHA-1", 1: "SHA-1", 2: "SHA-256", 3: "SHA-512" } as Record<
          string,
          string
        >
      )[num(f, 4, 0n).toString()];
      const digits = num(f, 5, 0n),
        type = num(f, 6),
        issuer = string(f, 3),
        name = string(f, 2);
      if (![0n, 1n, 2n].includes(digits) || ![1n, 2n].includes(type))
        throw new Error("Unsupported Google transfer OTP settings.");
      const counter = num(f, 7, 0n);
      // The transfer schema uses signed int64 counters, unlike standard HOTP's uint64.
      if (counter > 0x7fffffffffffffffn || (type === 2n && counter !== 0n))
        throw new Error("Invalid Google transfer counter.");
      const label =
        issuer && name.startsWith(issuer + ":")
          ? name.slice(issuer.length + 1).trim()
          : name;
      return validateAccount({
        id: crypto.randomUUID(),
        issuer,
        label,
        secret: encodeBase32(bytes(f, 1)),
        algorithm,
        digits: digits === 2n ? 8 : 6,
        type: type === 1n ? "hotp" : "totp",
        counter: counter.toString(),
        period: 30,
        favorite: false,
        group: "",
      });
    });
    if (!partial && result.skipped.length)
      throw new Error(result.skipped[0]!.reason);
    return {
      ...result,
      entryCount: entries.length,
      batchSize: Number(size),
      batchIndex: Number(index),
      batchId,
    };
  } finally {
    raw.fill(0);
  }
}
function migrationBatch(inputs: string[], partial: boolean): ImportResult {
  if (!inputs.length || inputs.length > 100)
    throw new Error("Invalid transfer batch size.");
  const transfers = inputs.map((input) => parseMigration(input, partial)),
    first = transfers[0]!;
  if (
    transfers.some(
      (t) => t.batchId !== first.batchId || t.batchSize !== first.batchSize,
    )
  )
    throw new Error("QR codes belong to different Google transfers.");
  if (new Set(transfers.map((t) => t.batchIndex)).size !== transfers.length)
    throw new Error("A Google transfer QR code was supplied twice.");
  if (transfers.length !== first.batchSize)
    throw new Error(
      `This transfer needs all ${first.batchSize} QR codes. Select all transfer images together or paste every transfer URI on a separate line.`,
    );
  const result: ImportResult = { accounts: [], skipped: [] };
  let offset = 0;
  for (const transfer of transfers.sort(
    (a, b) => a.batchIndex - b.batchIndex,
  )) {
    result.accounts.push(...transfer.accounts);
    result.skipped.push(
      ...transfer.skipped.map((entry) => ({
        ...entry,
        index: offset + entry.index,
      })),
    );
    offset += transfer.entryCount;
  }
  if (offset > MAX_ACCOUNTS) throw new Error("Too many transferred accounts.");
  return requireAccounts(result);
}
export function parseMigrationBatch(inputs: string[]): Account[] {
  return migrationBatch(inputs, false).accounts;
}
export function parseMigrationImport(inputs: string[]): ImportResult {
  return migrationBatch(inputs, true);
}
