import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { Session } from "../src/session";
import { decryptEnvelope } from "../src/crypto";
import * as storage from "../src/storage";
const password = "synthetic KDF upgrade password";
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("old vault unlocks and atomically upgrades its password slot to an injected higher default", async () => {
  const session = new Session();
  await session.setup(password);
  const old = session.current();
  session.lock();
  expect(old.password.iterations).toBe(600_000);
  await session.unlock(password, 600_001);
  const upgraded = session.current();
  expect(upgraded.password.iterations).toBe(600_001);
  expect(upgraded.revision).toBe(old.revision + 1);
  expect(await storage.load()).toEqual(upgraded);
  expect((await decryptEnvelope(old, password)).data).toEqual(
    session.accounts(),
  );
  expect((await decryptEnvelope(upgraded, password)).data).toEqual(
    session.accounts(),
  );
  session.lock();
  await session.unlock(password, 600_001);
  expect(session.current()).toEqual(upgraded);
});
it("failed upgrade commit never unlocks or replaces the original vault", async () => {
  const session = new Session();
  await session.setup(password);
  const old = session.current();
  session.lock();
  vi.spyOn(storage, "commit").mockRejectedValueOnce(
    new Error("synthetic upgrade commit failed"),
  );
  await expect(session.unlock(password, 600_001)).rejects.toThrow(
    "synthetic upgrade commit failed",
  );
  expect(session.unlocked).toBe(false);
  expect(await storage.load()).toEqual(old);
});
