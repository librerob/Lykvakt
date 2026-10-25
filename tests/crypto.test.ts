import { it, expect, beforeAll } from "vitest";
import {
  createEnvelope,
  decryptEnvelope,
  headerOf,
  importVaultKey,
  makePasswordSlot,
  open,
  seal,
  snapshot,
  unwrapPassword,
  validateEnvelope,
  canonical,
} from "../src/crypto";
import { emptyVault } from "../src/model";
import { parseURI, verifyBackup } from "../src/import";
import { codeFor } from "../src/otp";
const password = "test-only horse battery stable";
const data = emptyVault();
data.accounts = [
  parseURI(
    "otpauth://hotp/Synthetic:user?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&counter=9007199254740993&digits=8&algorithm=SHA512",
  ),
];
let result: Awaited<ReturnType<typeof createEnvelope>>;
beforeAll(async () => {
  result = await createEnvelope(password, data);
}, 60_000);
it("encrypts and restores complete records without plaintext metadata", async () => {
  const { data: restored, key } = await decryptEnvelope(
    result.envelope,
    password,
    "vault",
  );
  expect(restored).toEqual(data);
  expect(key.extractable).toBe(false);
  expect(JSON.stringify(result.envelope)).not.toContain(
    data.accounts[0]!.secret,
  );
  expect(JSON.stringify(result.envelope)).not.toContain("Synthetic");
}, 60_000);
it("rejects an incorrect password", async () => {
  await expect(
    decryptEnvelope(result.envelope, "wrong password string"),
  ).rejects.toThrow();
}, 60_000);
it("rejects modified ciphertext and wrapped content key", async () => {
  for (const field of ["key", "iv", "ciphertext"] as const) {
    const e = structuredClone(result.envelope);
    const old = e.payload[field];
    e.payload[field] = (old[0] === "A" ? "B" : "A") + old.slice(1);
    await expect(open(e, result.key)).rejects.toThrow();
  }
});
it("authenticates metadata and every remaining header field", async () => {
  const changes = [
    { revision: 3 },
    { id: crypto.randomUUID() },
    { kind: "backup" },
    { password: { ...result.envelope.password, t: 4 } },
    { extra: [] },
  ];
  for (const change of changes)
    await expect(
      open(
        { ...result.envelope, ...change } as typeof result.envelope,
        result.key,
      ),
    ).rejects.toThrow();
});
it("uses a fresh content key and nonce for each save", async () => {
  const writes = await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      seal({ ...headerOf(result.envelope), revision: i + 1 }, result.key, data),
    ),
  );
  expect(new Set(writes.map((e) => e.payload.key)).size).toBe(30);
  expect(new Set(writes.map((e) => e.payload.iv)).size).toBe(30);
  for (const e of writes) expect(await open(e, result.key)).toEqual(data);
});
it("changes the password wrapper without losing the vault key", async () => {
  const raw = await unwrapPassword(result.envelope, password);
  try {
    const slot = await makePasswordSlot(
      raw,
      "a different test passphrase",
      result.envelope.id,
      "vault",
    );
    const changed = await seal(
      { ...headerOf(result.envelope), revision: 1, password: slot },
      result.key,
      data,
    );
    expect(
      (await decryptEnvelope(changed, "a different test passphrase")).data,
    ).toEqual(data);
    await expect(decryptEnvelope(changed, password)).rejects.toThrow();
    expect((await importVaultKey(raw)).extractable).toBe(false);
  } finally {
    raw.fill(0);
  }
}, 60_000);
it("verifies an actual serialized backup and compares records", async () => {
  const archive = await createEnvelope(
    "separate test backup passphrase",
    data,
    "backup",
  );
  const file = JSON.parse(JSON.stringify(archive.envelope));
  const restored = await verifyBackup(
    file,
    "separate test backup passphrase",
    data,
  );
  expect(restored.count).toBe(1);
  expect(restored.matches).toBe(true);
  expect(await codeFor(restored.data.accounts[0]!)).toBe(
    await codeFor(data.accounts[0]!),
  );
  expect(
    (await verifyBackup(file, "separate test backup passphrase", emptyVault()))
      .matches,
  ).toBe(false);
  await expect(
    decryptEnvelope(file, "separate test backup passphrase", "vault"),
  ).rejects.toThrow();
}, 60_000);
it("rejects malformed format and unbounded KDF work before deriving", () => {
  const e = result.envelope;
  for (const change of [
    { version: 3 },
    { extra: "x" },
    { password: { ...e.password, m: 5 } },
    { password: { ...e.password, m: 262145 } },
    { password: { ...e.password, t: 11 } },
    { password: { ...e.password, p: 2 } },
    { payload: { ...e.payload, key: "bad!" } },
    { removedSlots: [] },
  ])
    expect(() => validateEnvelope({ ...e, ...change })).toThrow();
});
it("rejects schema corruption even with a valid encryption key", async () => {
  await expect(
    seal(headerOf(result.envelope), result.key, {
      ...data,
      accounts: [{ ...data.accounts[0]!, algorithm: "MD5" as never }],
    }),
  ).rejects.toThrow();
  const changed = {
    ...data,
    accounts: [{ ...data.accounts[0]!, counter: "12" }],
  };
  expect(await snapshot(changed)).not.toBe(await snapshot(data));
});
it("canonicalizes independently of key insertion order", () =>
  expect(canonical({ z: 1, a: { c: 3, b: 2 } })).toBe(
    canonical({ a: { b: 2, c: 3 }, z: 1 }),
  ));
