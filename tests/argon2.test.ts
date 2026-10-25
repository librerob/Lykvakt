import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { argon2idAsync } from "@noble/hashes/argon2.js";
import {
  createEnvelope,
  decryptEnvelope,
  headerOf,
  open,
  rotatePassword,
  seal,
  unwrapPassword,
  validateEnvelope,
  type Envelope,
} from "../src/crypto";
import { DEFAULT_KDF, MIN_MEMORY_KIB, upgradePolicy } from "../src/kdf-policy";
import { Session } from "../src/session";
import { emptyVault } from "../src/model";
import { verifyBackup } from "../src/import";
import * as storage from "../src/storage";
import * as kdf from "../src/kdf";
import { passwordVault } from "./helpers/vault";
import oldBackup from "./fixtures/v1-backup.json";

const password = "synthetic Argon2id roundtrip password";
let fixture: Awaited<ReturnType<typeof createEnvelope>>;
beforeAll(async () => {
  fixture = await createEnvelope(password, emptyVault());
}, 60_000);
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("matches the RFC 9106 section 5.3 Argon2id v19 small-memory known-answer vector", async () => {
  // This upstream primitive vector intentionally uses 32 KiB / p=4; stored slots cannot.
  const passwordBytes = new Uint8Array(32).fill(1),
    salt = new Uint8Array(16).fill(2);
  const secret = new Uint8Array(8).fill(3),
    data = new Uint8Array(12).fill(4);
  let result: Uint8Array | undefined;
  try {
    result = await argon2idAsync(passwordBytes, salt, {
      version: 0x13,
      m: 32,
      t: 3,
      p: 4,
      dkLen: 32,
      key: secret,
      personalization: data,
    });
    expect(Buffer.from(result).toString("hex")).toBe(
      "0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659",
    );
  } finally {
    passwordBytes.fill(0);
    salt.fill(0);
    secret.fill(0);
    data.fill(0);
    result?.fill(0);
  }
});
it("creates version-1 vaults with the exact default Argon2id slot and unlocks non-extractable keys", async () => {
  expect(fixture.envelope.version).toBe(1);
  expect(fixture.envelope.password).toMatchObject(DEFAULT_KDF);
  expect(Object.keys(fixture.envelope.password).sort()).toEqual([
    "iv",
    "kdf",
    "m",
    "p",
    "salt",
    "t",
    "wrapped",
  ]);
  const restored = await decryptEnvelope(fixture.envelope, password);
  expect(restored.data).toEqual(emptyVault());
  expect(restored.key.extractable).toBe(false);
}, 60_000);
it("wrong Argon2id passwords never retry a second raw-string derivation", async () => {
  const derive = vi.spyOn(kdf, "argon2Key");
  await expect(
    unwrapPassword(fixture.envelope, "wrong Ａ password with normalization"),
  ).rejects.toThrow();
  expect(derive).toHaveBeenCalledTimes(1);
}, 60_000);
it.each([
  { m: 65_540 },
  { t: 4 },
  { p: 2 },
  { salt: "A" + "A".repeat(42) + "=" },
])(
  "authenticates Argon2id parameter or salt tampering %j",
  async (change) => {
    const changed = {
      ...fixture.envelope,
      password: { ...fixture.envelope.password, ...change },
    } as Envelope;
    await expect(open(changed, fixture.key)).rejects.toThrow();
    await expect(unwrapPassword(changed, password)).rejects.toThrow();
  },
  60_000,
);
it.each([
  ["m", Number.MAX_VALUE],
  ["m", -1],
  ["m", 19_455],
  ["m", 262_145],
  ["m", 65_536.5],
  ["m", undefined],
  ["t", 1],
  ["t", -1],
  ["t", 11],
  ["t", 2.5],
  ["t", undefined],
  ["p", 0],
  ["p", 2],
  ["p", 1.5],
  ["p", undefined],
])(
  "rejects hostile %s=%s before creating a worker or allocating Argon2 memory",
  async (field, value) => {
    const derive = vi.spyOn(kdf, "argon2Key");
    const changed = {
      ...fixture.envelope,
      password: { ...fixture.envelope.password, [field]: value },
    };
    expect(() => validateEnvelope(changed)).toThrow(Error);
    await expect(decryptEnvelope(changed, password)).rejects.toThrow(Error);
    expect(derive).not.toHaveBeenCalled();
  },
);
it("rejects missing and extra Argon2id fields before derivation", async () => {
  const derive = vi.spyOn(kdf, "argon2Key");
  for (const change of [
    { ...fixture.envelope.password, iterations: 2_000_000 },
    { ...fixture.envelope.password, version: 0x13 },
    { ...fixture.envelope.password, kdf: "Argon2i" },
  ]) {
    expect(() =>
      validateEnvelope({ ...fixture.envelope, password: change }),
    ).toThrow();
  }
  expect(derive).not.toHaveBeenCalled();
});
it("ordinary unlock migrates a frozen-cost 600k vault to the production Argon2id policy", async () => {
  const old = await passwordVault(password);
  await storage.commit(old);
  const session = new Session();
  await session.unlock(password);
  expect(session.current().password).toMatchObject(DEFAULT_KDF);
  expect(session.current().revision).toBe(old.revision + 1);
  expect(await storage.load()).toEqual(session.current());
  expect((await decryptEnvelope(session.current(), password)).data).toEqual(
    session.accounts(),
  );
  session.lock();
  await session.unlock(password);
  expect(session.current().revision).toBe(old.revision + 1);
}, 60_000);
it.each(["conflict", "generic"])(
  "a %s migration write failure keeps authenticated access and retries on later unlock",
  async (kind) => {
    const old = await passwordVault(password);
    await storage.commit(old);
    const commit = vi
      .spyOn(storage, "commit")
      .mockRejectedValueOnce(new Error(kind));
    const session = new Session();
    await session.unlock(password);
    expect(session.current()).toEqual(old);
    expect(session.unlocked).toBe(true);
    expect(await storage.load()).toEqual(old);
    session.lock();
    await session.unlock(password);
    expect(session.current().password).toMatchObject(DEFAULT_KDF);
    expect(await storage.load()).toEqual(session.current());
    expect(commit).toHaveBeenCalledTimes(2);
  },
  60_000,
);
it("ordinary unlock strengthens an accepted weaker Argon2id slot", async () => {
  const old = await createEnvelope(password, emptyVault(), "vault", {
    kdf: "Argon2id",
    m: MIN_MEMORY_KIB,
    t: 2,
    p: 1,
  });
  await storage.commit(old.envelope);
  const session = new Session();
  await session.unlock(password);
  expect(session.current().password).toMatchObject(DEFAULT_KDF);
  expect(session.current().revision).toBe(old.envelope.revision + 1);
}, 60_000);
it("upgrade policy never lowers existing Argon2id memory or pass costs", () => {
  expect(
    upgradePolicy({ kdf: "Argon2id", m: 262_144, t: 2, p: 1 }, DEFAULT_KDF),
  ).toEqual({ kdf: "Argon2id", m: 262_144, t: 3, p: 1 });
  expect(
    upgradePolicy({ kdf: "Argon2id", m: 131_072, t: 5, p: 1 }, DEFAULT_KDF),
  ).toBeUndefined();
  expect(upgradePolicy(DEFAULT_KDF, 2_000_000)).toBeUndefined();
});
it("password changes produce an Argon2id slot and rotate the actual vault key", async () => {
  const old = await passwordVault(password);
  const original = await decryptEnvelope(old, password);
  const nextPassword = "synthetic new Argon2id master password";
  const rotated = await rotatePassword(old, password, nextPassword);
  expect(rotated.password).toMatchObject(DEFAULT_KDF);
  const next = await seal(
    { ...headerOf(old), revision: 1, password: rotated.password, passkeys: [] },
    rotated.key,
    original.data,
  );
  await expect(open(next, original.key)).rejects.toThrow();
  expect((await decryptEnvelope(next, nextPassword)).data).toEqual(
    original.data,
  );
}, 60_000);
it("new backups use Argon2id while frozen PBKDF2 backups still verify without persisting upgrades", async () => {
  const commit = vi.spyOn(storage, "commit");
  const restored = await verifyBackup(
    oldBackup,
    "synthetic legacy backup passphrase",
  );
  expect(restored.data.accounts[0]!.counter).toBe("9007199254740993");
  expect(commit).not.toHaveBeenCalled();
  const next = await createEnvelope(password, restored.data, "backup");
  expect(next.envelope.password).toMatchObject(DEFAULT_KDF);
  expect((await verifyBackup(next.envelope, password)).data).toEqual(
    restored.data,
  );
  expect(commit).not.toHaveBeenCalled();
}, 60_000);
it("an explicitly calibrated policy round-trips as an authenticated slot", async () => {
  const policy = { kdf: "Argon2id" as const, m: 65_536, t: 4, p: 1 as const };
  const next = await createEnvelope(password, emptyVault(), "vault", policy);
  expect(next.envelope.password).toMatchObject(policy);
  expect((await decryptEnvelope(next.envelope, password)).data).toEqual(
    emptyVault(),
  );
}, 60_000);
