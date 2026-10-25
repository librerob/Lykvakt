import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { decryptEnvelope, headerOf, rotatePassword, seal } from "../src/crypto";
import { Session } from "../src/session";
import * as storage from "../src/storage";
import { passwordVault } from "./helpers/vault";

const password = "synthetic typed upgrade conflict password";
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function storedVault() {
  const old = await passwordVault(password);
  await storage.commit(old);
  return old;
}
function expectLocked(session: Session) {
  expect(session.unlocked).toBe(false);
  expect(session.upgradePending).toBe(false);
  expect(session.upgradePendingDetail).toBeUndefined();
  expect(() => session.accounts()).toThrow("Unlock");
  expect(() => session.current()).toThrow("Unlock");
}
it("compare-and-swap conflicts have a distinct type and leave the active record unchanged", async () => {
  const old = await storedVault();
  await expect(storage.commit(old)).rejects.toBeInstanceOf(
    storage.StorageConflictError,
  );
  await expect(storage.commit(old)).rejects.toMatchObject({
    name: "StorageConflictError",
    message:
      "Vault changed in another window. Lock and unlock before retrying.",
  });
  expect(await storage.load()).toEqual(old);
});
it("an actual concurrent write during upgrade rejects stale unlock and preserves the winning stored vault", async () => {
  const old = await storedVault();
  const { key, data } = await decryptEnvelope(old, password);
  const newer = await seal(
    { ...headerOf(old), revision: old.revision + 1 },
    key,
    data,
  );
  const commit = storage.commit;
  vi.spyOn(storage, "commit").mockImplementationOnce(
    async (next, expected, signal, discardPrevious) => {
      await commit(newer, old);
      await commit(next, expected, signal, discardPrevious);
    },
  );
  const session = new Session();
  await expect(session.unlock(password, 600_001)).rejects.toThrow(
    "Your vault changed in another window. Unlock again.",
  );
  expectLocked(session);
  expect(await storage.load()).toEqual(newer);
  await expect(session.save(data)).rejects.toThrow("Unlock");
});
it("a typed upgrade conflict clears a session that was already open", async () => {
  const old = await storedVault();
  const session = new Session();
  await session.unlock(password, 600_000);
  expect(session.unlocked).toBe(true);
  const onlock = vi.fn();
  session.onlock = onlock;
  vi.spyOn(storage, "commit").mockRejectedValueOnce(
    new storage.StorageConflictError(),
  );
  await expect(session.unlock(password, 600_001)).rejects.toThrow(
    "Your vault changed in another window. Unlock again.",
  );
  expectLocked(session);
  expect(onlock).toHaveBeenCalledTimes(1);
  expect(await storage.load()).toEqual(old);
});
it("a transient upgrade failure keeps access, records a pending upgrade and clears it after a successful retry", async () => {
  const old = await storedVault();
  const session = new Session();
  const commit = vi
    .spyOn(storage, "commit")
    .mockRejectedValueOnce(new Error("synthetic transient write failure"));
  await session.unlock(password, 600_001);
  expect(session.unlocked).toBe(true);
  expect(session.current()).toEqual(old);
  expect(await storage.load()).toEqual(old);
  expect(session.upgradePending).toBe(true);
  expect(session.upgradePendingDetail).toBe(
    "synthetic transient write failure",
  );
  expect(Reflect.set(session, "upgradePending", false)).toBe(false);
  expect(session.upgradePending).toBe(true);
  session.lock();
  expectLocked(session);
  await session.unlock(password, 600_001);
  expect(session.unlocked).toBe(true);
  expect(session.current().password.iterations).toBe(600_001);
  expect(session.upgradePending).toBe(false);
  expect(session.upgradePendingDetail).toBeUndefined();
  expect(commit).toHaveBeenCalledTimes(2);
  expect(await storage.load()).toEqual(session.current());
});
it("message text alone cannot turn a generic write error into a storage conflict", async () => {
  const old = await storedVault();
  const session = new Session();
  vi.spyOn(storage, "commit").mockRejectedValueOnce(
    new Error(new storage.StorageConflictError().message),
  );
  await session.unlock(password, 600_001);
  expect(session.unlocked).toBe(true);
  expect(session.upgradePending).toBe(true);
  expect(session.current()).toEqual(old);
  expect(await storage.load()).toEqual(old);
});
it.each(["typed conflict", "transient error"])(
  "locking takes precedence over a %s during an optional upgrade",
  async (kind) => {
    const old = await storedVault();
    const session = new Session();
    vi.spyOn(storage, "commit").mockImplementationOnce(async () => {
      session.lock();
      throw kind === "typed conflict"
        ? new storage.StorageConflictError()
        : new Error("transient failure");
    });
    await expect(session.unlock(password, 600_001)).rejects.toThrow(
      "Unlock cancelled.",
    );
    expectLocked(session);
    expect(await storage.load()).toEqual(old);
  },
);
it("an unlock that needs no upgrade starts with no pending state", async () => {
  await storedVault();
  const session = new Session();
  const commit = vi.spyOn(storage, "commit");
  await session.unlock(password, 600_000);
  expect(session.unlocked).toBe(true);
  expect(session.upgradePending).toBe(false);
  expect(session.upgradePendingDetail).toBeUndefined();
  expect(commit).not.toHaveBeenCalled();
});
it("a later unlock that no longer needs an upgrade clears the old pending state", async () => {
  await storedVault();
  const session = new Session();
  vi.spyOn(storage, "commit").mockRejectedValueOnce(
    new Error("transient failure"),
  );
  await session.unlock(password, 600_001);
  expect(session.upgradePending).toBe(true);
  await session.unlock(password, 600_000);
  expect(session.upgradePending).toBe(false);
  expect(session.upgradePendingDetail).toBeUndefined();
});

it("a successful password rotation clears a superseded pending upgrade", async () => {
  await storedVault();
  const session = new Session();
  vi.spyOn(storage, "commit").mockRejectedValueOnce(
    new Error("transient failure"),
  );
  await session.unlock(password, 600_001);
  expect(session.upgradePending).toBe(true);
  const rotation = await rotatePassword(
    session.current(),
    password,
    "replacement synthetic password",
    600_001,
  );
  await session.save(
    session.accounts(),
    (h) => ({ ...h, password: rotation.password, passkeys: [] }),
    rotation.key,
  );
  expect(session.upgradePending).toBe(false);
  expect(session.upgradePendingDetail).toBeUndefined();
  expect(await storage.load()).toEqual(session.current());
});
