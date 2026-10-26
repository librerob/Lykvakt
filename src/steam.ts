import { decodeBase32 } from "./otp";

// ValvePython/steam, steam/guard.py: generate_twofactor_code_for_time.
export async function steamCode(
  secret: string,
  counter: bigint,
): Promise<string> {
  if (counter < 0n || counter > 0xffffffffffffffffn)
    throw new Error("Invalid Steam time counter.");
  const bytes = decodeBase32(secret);
  let mac: Uint8Array | undefined;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      bytes,
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const message = new Uint8Array(8);
    new DataView(message.buffer).setBigUint64(0, counter);
    mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
    let value = new DataView(mac.buffer).getUint32(mac[19]! & 15) & 0x7fffffff;
    let code = "";
    const alphabet = "23456789BCDFGHJKMNPQRTVWXY";
    for (let i = 0; i < 5; i++) {
      code += alphabet[value % alphabet.length];
      value = Math.floor(value / alphabet.length);
    }
    return code;
  } finally {
    bytes.fill(0);
    mac?.fill(0);
  }
}
