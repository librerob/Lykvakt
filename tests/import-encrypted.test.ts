import { expect, it, vi, afterEach } from "vitest";
import * as scrypt from "@noble/hashes/scrypt.js";
import { readImport, detectImport } from "../src/import-formats";
import {
  fixture,
  aegisFixture,
  twofasFixture,
  sourcePassword,
} from "./helpers/source-exports.mjs";
vi.mock("@noble/hashes/scrypt.js", { spy: true });
afterEach(() => vi.restoreAllMocks());
it.each([
  ["aegis", aegisFixture, 2],
  ["2fas", twofasFixture, 1],
] as const)(
  "%s known-answer fixture matches independent Node/OpenSSL encryption and decrypts",
  async (format, generate, count) => {
    const input = fixture(format + "-encrypted.json");
    expect(JSON.parse(input)).toEqual(generate());
    expect(detectImport(input)).toMatchObject({ format, encrypted: true });
    const result = await readImport(input, sourcePassword);
    expect(result.accounts).toHaveLength(count);
    expect(result.skipped).toEqual([]);
  },
  15000,
);
it.each(["aegis", "2fas"])(
  "%s rejects wrong passwords and ciphertext/tag tampering",
  async (format) => {
    const input = fixture(format + "-encrypted.json");
    await expect(
      readImport(input, "wrong source password"),
    ).rejects.toMatchObject({ name: "OperationError" });
    const root = JSON.parse(input);
    if (format === "aegis") root.header.params.tag = "00".repeat(16);
    else root.servicesEncrypted = "AAAA" + root.servicesEncrypted.slice(4);
    await expect(
      readImport(JSON.stringify(root), sourcePassword),
    ).rejects.toMatchObject({ name: "OperationError" });
  },
  15000,
);
it.each([
  { n: 131072 },
  { n: 32769 },
  { n: 1 },
  { r: 9 },
  { r: 0 },
  { p: 5 },
  { p: 0 },
  { n: 65536, r: 8, p: 2 },
  { n: 1e100 },
  { r: 1.5 },
  { p: "1" },
])("rejects hostile Aegis costs %j before scrypt starts", async (cost) => {
  const derive = vi.mocked(scrypt.scryptAsync);
  derive.mockClear();
  const root = JSON.parse(fixture("aegis-encrypted.json"));
  root.header.slots[0] = { ...root.header.slots[0], ...cost };
  await expect(
    readImport(JSON.stringify(root), sourcePassword),
  ).rejects.toThrow();
  expect(derive).not.toHaveBeenCalled();
});
it("validates all Aegis slots and ciphertext lengths before deriving even the first slot", async () => {
  const derive = vi.mocked(scrypt.scryptAsync);
  derive.mockClear();
  const root = JSON.parse(fixture("aegis-encrypted.json"));
  root.header.slots.push({ ...root.header.slots[0], n: 2 ** 30 });
  await expect(
    readImport(JSON.stringify(root), sourcePassword),
  ).rejects.toThrow();
  root.header.slots = [root.header.slots[0]];
  root.db = "A".repeat(8_000_001);
  await expect(
    readImport(JSON.stringify(root), sourcePassword),
  ).rejects.toThrow();
  expect(derive).not.toHaveBeenCalled();
});
it("scrypt yields to the event loop and cancels during derivation", async () => {
  const abort = new AbortController();
  const work = readImport(
    fixture("aegis-encrypted.json"),
    sourcePassword,
    abort.signal,
  );
  setTimeout(() => abort.abort(new DOMException("locked", "AbortError")), 1);
  await expect(work).rejects.toMatchObject({ name: "AbortError" });
});
it.each(["aegis", "2fas"])(
  "%s cancellation before and after decryption cannot return accounts",
  async (format) => {
    const before = new AbortController();
    before.abort();
    await expect(
      readImport(
        fixture(format + "-encrypted.json"),
        sourcePassword,
        before.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    const after = new AbortController(),
      original = crypto.subtle.decrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "decrypt").mockImplementation(async (...args) => {
      const result = await original(...args);
      after.abort();
      return result;
    });
    await expect(
      readImport(
        fixture(format + "-encrypted.json"),
        sourcePassword,
        after.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  },
  15000,
);
it("2FAS rejects malformed salt, IV, reference and ciphertext before password work", async () => {
  const derive = vi.spyOn(crypto.subtle, "deriveKey");
  const source = JSON.parse(fixture("2fas-encrypted.json"));
  for (const servicesEncrypted of [
    "bad",
    "AA==:AA==:AA==",
    source.servicesEncrypted + ":extra",
  ]) {
    await expect(
      readImport(
        JSON.stringify({ ...source, servicesEncrypted }),
        sourcePassword,
      ),
    ).rejects.toThrow();
  }
  await expect(
    readImport(JSON.stringify({ ...source, reference: "bad" }), sourcePassword),
  ).rejects.toThrow();
  expect(derive).not.toHaveBeenCalled();
});

it.each(["aegis", "2fas"])(
  "%s wipes decrypted and password buffers after reading",
  async (format) => {
    const plaintext: Uint8Array[] = [],
      passwords: Uint8Array[] = [];
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle),
      importKey = crypto.subtle.importKey.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "decrypt").mockImplementation(async (...args) => {
      const result = await decrypt(...args);
      plaintext.push(new Uint8Array(result));
      return result;
    });
    vi.spyOn(crypto.subtle, "importKey").mockImplementation(
      (...args: Parameters<typeof importKey>) => {
        if (
          args[0] === "raw" &&
          args[1] instanceof Uint8Array &&
          args[2] === "PBKDF2"
        )
          passwords.push(args[1]);
        return importKey(...args);
      },
    );
    await readImport(fixture(format + "-encrypted.json"), sourcePassword);
    expect(plaintext.length).toBeGreaterThan(0);
    for (const bytes of [...plaintext, ...passwords])
      expect(bytes.every((b) => b === 0)).toBe(true);
  },
  15000,
);
