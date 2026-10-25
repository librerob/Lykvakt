import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { decryptEnvelope, headerOf, seal } from "../src/crypto";
import { Session } from "../src/session";
import { friendlyError } from "../src/help";
import * as storage from "../src/storage";
import { passwordVault } from "./helpers/vault";
const password = "synthetic typed conflict password";
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function storedVault() {
  const e = await passwordVault(password);
  await storage.commit(e);
  return e;
}
function expectLocked(session: Session) {
  expect(session.unlocked).toBe(false);
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
}, 60_000);
it("a concurrent write during unlock rejects the stale session and preserves the winning record", async () => {
  const old = await storedVault(),
    original = await decryptEnvelope(old, password);
  const newer = await seal(
    { ...headerOf(old), revision: 1 },
    original.key,
    original.data,
  );
  const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, "decrypt").mockImplementationOnce(async (...args) => {
    const bytes = await decrypt(...args);
    await storage.commit(newer, old);
    return bytes;
  });
  const session = new Session();
  await expect(session.unlock(password)).rejects.toThrow(
    "Your vault changed in another window. Unlock again.",
  );
  expectLocked(session);
  expect(await storage.load()).toEqual(newer);
  await expect(session.save(original.data)).rejects.toThrow("Unlock");
}, 60_000);
it("a typed save conflict preserves the original session snapshot and stored vault", async () => {
  const old = await storedVault(),
    session = new Session();
  await session.unlock(password);
  const onlock = vi.fn();
  session.onlock = onlock;
  vi.spyOn(storage, "commit").mockRejectedValueOnce(
    new storage.StorageConflictError(),
  );
  await expect(session.save(session.accounts())).rejects.toBeInstanceOf(
    storage.StorageConflictError,
  );
  expect(session.unlocked).toBe(true);
  expect(session.current()).toEqual(old);
  expect(onlock).not.toHaveBeenCalled();
  expect(await storage.load()).toEqual(old);
}, 60_000);
it("message text alone cannot turn a generic write error into a storage conflict", async () => {
  const old = await storedVault(),
    session = new Session();
  await session.unlock(password);
  vi.spyOn(storage, "commit").mockRejectedValueOnce(
    new Error(new storage.StorageConflictError().message),
  );
  await expect(session.save(session.accounts())).rejects.toThrow("changed");
  expect(session.unlocked).toBe(true);
  expect(session.current()).toEqual(old);
  expect(await storage.load()).toEqual(old);
}, 60_000);
it.each(["typed conflict", "transient error"])(
  "locking takes precedence over a %s during a save",
  async (kind) => {
    const old = await storedVault(),
      session = new Session();
    await session.unlock(password);
    vi.spyOn(storage, "commit").mockImplementationOnce(async () => {
      session.lock();
      throw kind === "typed conflict"
        ? new storage.StorageConflictError()
        : new Error("transient failure");
    });
    await expect(session.save(session.accounts())).rejects.toThrow("cancelled");
    expectLocked(session);
    expect(await storage.load()).toEqual(old);
  },
  60_000,
);
it("unlock never writes or upgrades the stored envelope", async () => {
  const old = await storedVault(),
    session = new Session(),
    commit = vi.spyOn(storage, "commit");
  await session.unlock(password);
  expect(session.current()).toEqual(old);
  expect(commit).not.toHaveBeenCalled();
}, 60_000);
it("the friendly conflict error preserves the request to unlock again", () => {
  const message = "Your vault changed in another window. Unlock again.";
  expect(
    friendlyError(
      new Error(message, { cause: new storage.StorageConflictError() }),
    ).message,
  ).toBe(message);
});
