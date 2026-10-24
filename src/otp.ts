import type { Account, Algorithm } from "./model";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function normalizeSecret(input: string): string {
  const s = input.replace(/[ \r\n\t-]/g, "").toUpperCase();
  if (!/^[A-Z2-7]+={0,6}$/.test(s))
    throw new Error("Secret must use Base32 letters A–Z and digits 2–7.");
  const raw = s.replace(/=+$/, "");
  const remainder = raw.length % 8;
  if (
    ![0, 2, 4, 5, 7].includes(remainder) ||
    (s.includes("=") &&
      (s.length % 8 !== 0 || s.length - raw.length !== (8 - remainder) % 8))
  )
    throw new Error("Invalid Base32 length or padding.");
  const bits = (raw.length * 5) % 8;
  if (bits && (ALPHABET.indexOf(raw.at(-1)!) & ((1 << bits) - 1)) !== 0)
    throw new Error("Noncanonical Base32 trailing bits.");
  if (raw.length < 16 || raw.length > 1024)
    throw new Error("Use a secret between 10 and 640 bytes.");
  return raw;
}
export function decodeBase32(input: string): Uint8Array<ArrayBuffer> {
  const s = normalizeSecret(input);
  const out = new Uint8Array(Math.floor((s.length * 5) / 8));
  let bits = 0,
    value = 0,
    i = 0;
  for (const c of s) {
    value = (value << 5) | ALPHABET.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[i++] = (value >>> bits) & 255;
    }
  }
  return out;
}
export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0,
    value = 0,
    out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
export async function hotp(
  secret: string,
  counter: bigint,
  algorithm: Algorithm = "SHA-1",
  digits: 6 | 8 = 6,
): Promise<string> {
  if (counter < 0n || counter > 0xffffffffffffffffn)
    throw new Error("Counter outside unsigned 64-bit range.");
  if (
    !["SHA-1", "SHA-256", "SHA-512"].includes(algorithm) ||
    ![6, 8].includes(digits)
  )
    throw new Error("Unsupported OTP parameters.");
  const bytes = decodeBase32(secret);
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      bytes,
      { name: "HMAC", hash: algorithm },
      false,
      ["sign"],
    );
    const message = new Uint8Array(8);
    new DataView(message.buffer).setBigUint64(0, counter);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
    const offset = mac[mac.length - 1]! & 15;
    const value = new DataView(mac.buffer).getUint32(offset) & 0x7fffffff;
    return (value % 10 ** digits).toString().padStart(digits, "0");
  } finally {
    bytes.fill(0);
  }
}
export async function codeFor(
  a: Account,
  milliseconds = Date.now(),
): Promise<string> {
  if (
    !Number.isFinite(milliseconds) ||
    milliseconds < 0 ||
    !Number.isInteger(a.period) ||
    a.period < 1 ||
    a.period > 3600
  )
    throw new Error("Invalid time or period.");
  const counter =
    a.type === "hotp"
      ? BigInt(a.counter)
      : BigInt(Math.floor(milliseconds / 1000 / a.period));
  return hotp(a.secret, counter, a.algorithm, a.digits);
}
