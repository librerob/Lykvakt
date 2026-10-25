import { argon2id, argon2idAsync } from "@noble/hashes/argon2.js";
import { validateArgon2, type Argon2Policy } from "./kdf-policy";

// The browser calls this in an isolated, one-job worker; Node uses the yielding path.
export async function deriveKeyHere(
  password: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  policy: Argon2Policy,
  signal?: AbortSignal,
  synchronous = false,
): Promise<CryptoKey> {
  let derived: Uint8Array<ArrayBuffer> | undefined;
  try {
    const checked = validateArgon2(policy);
    if (salt.length !== 32 || !password.length || password.length > 65_536)
      throw new Error("Invalid password-protection input.");
    signal?.throwIfAborted();
    const options = {
      m: checked.m,
      t: checked.t,
      p: checked.p,
      version: 0x13,
      dkLen: 32,
      maxmem: checked.m * 1024,
      asyncTick: 16,
      onProgress: signal ? () => signal.throwIfAborted() : undefined,
    };
    derived = synchronous
      ? argon2id(password, salt, options)
      : await argon2idAsync(password, salt, options);
    signal?.throwIfAborted();
    return await crypto.subtle.importKey("raw", derived, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  } finally {
    derived?.fill(0);
    password.fill(0);
    salt.fill(0);
  }
}
