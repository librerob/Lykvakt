import { expect, it, vi, afterEach } from "vitest";
import { base64, unbase64, createEnvelope } from "../src/crypto";
import { MAX_FILE_BYTES, emptyVault, validateAccount } from "../src/model";
import { verifyBackup } from "../src/import";
import { readText } from "../src/dom";
afterEach(() => vi.restoreAllMocks());
it("accepts a canonical six-megabyte binary field without overflowing the regexp stack", () => {
  const expected = new Uint8Array(6_000_000);
  for (let i = 0; i < expected.length; i++) expected[i] = i % 256;
  const encoded = base64(expected),
    actual = unbase64(encoded, MAX_FILE_BYTES);
  expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
}, 15_000);
it("rejects a field above its decoded limit before allocating the decoded bytes", () => {
  const decode = vi.spyOn(globalThis, "atob");
  expect(() => unbase64("AAAA".repeat(2), 5)).toThrow();
  expect(decode).not.toHaveBeenCalled();
});
it.each([
  "A===",
  "AA=A",
  "AB==",
  "AAB=",
  "AAAA=",
  "_AAA",
  "AAA",
  "A",
  "AA",
  "AAAA\n",
])("retains strict Base64 rejection for %j", (s) =>
  expect(() => unbase64(s, 100)).toThrow(),
);
it("creates and restores a near-limit saved backup containing 2000 valid accounts", async () => {
  const data = emptyVault(),
    wide = "漢",
    password = "synthetic large backup password";
  for (let i = 0; i < 2000; i++)
    data.accounts.push(
      validateAccount({
        id: String(i).padEnd(100, wide),
        issuer: wide.repeat(200),
        label: wide.repeat(200),
        secret: "A".repeat(1024),
        type: "totp",
        algorithm: "SHA-512",
        digits: 8,
        period: 3600,
        counter: "0",
        favorite: false,
        group: wide.repeat(80),
      }),
    );
  const saved = await createEnvelope(password, data, "backup"),
    file = new File([JSON.stringify(saved.envelope)], "large-backup.json");
  expect(file.size).toBeLessThanOrEqual(MAX_FILE_BYTES);
  const restored = await verifyBackup(
    JSON.parse(await readText(file)),
    password,
    data,
  );
  expect(restored.matches).toBe(true);
  expect(restored.count).toBe(2000);
  expect(restored.data).toEqual(data);
}, 60_000);
