import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { Session } from "../src/session";
import {
  DEFAULT_ITERATIONS,
  MIN_ITERATIONS,
  MAX_ITERATIONS,
  decryptEnvelope,
} from "../src/crypto";
import * as storage from "../src/storage";
import { passwordVault } from "./helpers/vault";
const password = "synthetic KDF upgrade password";
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("old vault unlocks and atomically upgrades its password slot to an injected higher default", async () => {
  const session = new Session();
  const old = await passwordVault(password);
  await storage.commit(old);
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
it.each([
  [
    "conflict",
    "Vault changed in another window. Lock and unlock before retrying.",
  ],
  ["generic", "synthetic upgrade commit failed"],
])(
  "a %s upgrade commit failure preserves password access and retries on later unlock",
  async (_kind, message) => {
    const session = new Session();
    const old = await passwordVault(password);
    await storage.commit(old);
    const commit = vi
      .spyOn(storage, "commit")
      .mockRejectedValueOnce(new Error(message));
    await session.unlock(password, 600_001);
    expect(session.unlocked).toBe(true);
    expect(session.current()).toEqual(old);
    expect((await decryptEnvelope(old, password)).data).toEqual(
      session.accounts(),
    );
    expect(await storage.load()).toEqual(old);
    expect(commit).toHaveBeenCalledTimes(1);

    session.lock();
    await session.unlock(password, 600_001);
    const upgraded = session.current();
    expect(commit).toHaveBeenCalledTimes(2);
    expect(upgraded.password.iterations).toBe(600_001);
    expect(upgraded.revision).toBe(old.revision + 1);
    expect(await storage.load()).toEqual(upgraded);
    expect((await decryptEnvelope(upgraded, password)).data).toEqual(
      session.accounts(),
    );

    session.lock();
    await session.unlock(password, 600_001);
    expect(commit).toHaveBeenCalledTimes(2);
    expect(session.current()).toEqual(upgraded);
  },
);
it("locking during a failed KDF upgrade still cancels unlock", async () => {
  const old = await passwordVault(password);
  await storage.commit(old);
  const session = new Session();
  vi.spyOn(storage, "commit").mockImplementationOnce(async () => {
    session.lock();
    throw new Error("synthetic cancelled upgrade");
  });
  await expect(session.unlock(password, 600_001)).rejects.toThrow("cancelled");
  expect(session.unlocked).toBe(false);
  expect(await storage.load()).toEqual(old);
});

it("a 600k vault unlocks and persists the production 2m default without an override", async () => {
  expect(MIN_ITERATIONS).toBe(600_000);
  expect(MAX_ITERATIONS).toBe(5_000_000);
  const old = await passwordVault(password, 600_000);
  await storage.commit(old);
  const commit = vi.spyOn(storage, "commit");
  const session = new Session();
  await session.unlock(password);
  const upgraded = session.current();
  expect(session.unlocked).toBe(true);
  expect(upgraded.password.iterations).toBe(2_000_000);
  expect(upgraded.password.iterations).toBe(DEFAULT_ITERATIONS);
  expect(upgraded.password).not.toEqual(old.password);
  expect(upgraded.revision).toBe(old.revision + 1);
  expect(await storage.load()).toEqual(upgraded);
  expect((await decryptEnvelope(upgraded, password)).data).toEqual(
    session.accounts(),
  );
  expect(commit).toHaveBeenCalledTimes(1);

  session.lock();
  await session.unlock(password);
  expect(session.current()).toEqual(upgraded);
  expect(commit).toHaveBeenCalledTimes(1);
});
