import { afterEach, expect, it, vi } from "vitest";
const buffers = vi.hoisted(() => ({ derived: [] as Uint8Array[] }));
vi.mock("@noble/hashes/argon2.js", () => ({
  argon2id: () => {
    const result = new Uint8Array(32).fill(7);
    buffers.derived.push(result);
    return result;
  },
  argon2idAsync: async () => {
    const result = new Uint8Array(32).fill(7);
    buffers.derived.push(result);
    return result;
  },
}));
import { deriveKeyHere } from "../src/kdf-engine";
import { DEFAULT_KDF } from "../src/kdf-policy";
afterEach(() => {
  buffers.derived = [];
  vi.restoreAllMocks();
});
it("imports a non-extractable key then wipes derived, password and salt buffers", async () => {
  const password = new Uint8Array(32).fill(1),
    salt = new Uint8Array(32).fill(2);
  const key = await deriveKeyHere(password, salt, DEFAULT_KDF);
  expect(key.extractable).toBe(false);
  expect(key.algorithm.name).toBe("AES-GCM");
  expect(
    [...password, ...salt, ...buffers.derived[0]!].every((x) => x === 0),
  ).toBe(true);
});
it("key-import failure still wipes all temporary buffers", async () => {
  const password = new Uint8Array(32).fill(1),
    salt = new Uint8Array(32).fill(2);
  vi.spyOn(crypto.subtle, "importKey").mockRejectedValueOnce(
    new Error("synthetic import failure"),
  );
  await expect(deriveKeyHere(password, salt, DEFAULT_KDF)).rejects.toThrow(
    "import failure",
  );
  expect(
    [...password, ...salt, ...buffers.derived[0]!].every((x) => x === 0),
  ).toBe(true);
});
it("invalid costs are rejected before the primitive is called, with inputs wiped", async () => {
  const password = new Uint8Array(32).fill(1),
    salt = new Uint8Array(32).fill(2);
  await expect(
    deriveKeyHere(password, salt, { ...DEFAULT_KDF, m: 1e20 }),
  ).rejects.toThrow();
  expect(buffers.derived).toEqual([]);
  expect([...password, ...salt].every((x) => x === 0)).toBe(true);
});
