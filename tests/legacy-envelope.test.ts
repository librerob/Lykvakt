import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import legacy from "./fixtures/legacy-slots-vault.json";
import { Session } from "../src/session";
import * as storage from "../src/storage";
import {
  decryptEnvelope,
  headerOf,
  seal,
  validateEnvelope,
} from "../src/crypto";
const password = "synthetic legacy slot password";
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("password unlock authenticates a legacy header with slots, then strips them atomically", async () => {
  const expected = await decryptEnvelope(legacy, password);
  await storage.commit(legacy);
  const session = new Session();
  await session.unlock(password);
  expect(session.accounts()).toEqual(expected.data);
  expect(session.current().passkeys).toEqual([]);
  expect(session.current().revision).toBe(legacy.revision + 1);
  expect(await storage.load()).toEqual(session.current());
  expect((await decryptEnvelope(session.current(), password)).data).toEqual(
    expected.data,
  );
  expect(session.accounts().accounts[0]).toMatchObject({
    counter: "9007199254740993",
    favorite: true,
    group: "Legacy",
    origins: ["https://example.test"],
  });
});
it("failed legacy strip commit does not block password unlock, and a later save retries", async () => {
  await storage.commit(legacy);
  vi.spyOn(storage, "commit").mockRejectedValueOnce(
    new Error("synthetic strip failure"),
  );
  const session = new Session();
  await session.unlock(password);
  expect(session.unlocked).toBe(true);
  expect(session.current()).toEqual(legacy);
  expect(await storage.load()).toEqual(legacy);
  await session.save(session.accounts());
  expect(session.current().passkeys).toEqual([]);
  expect((await storage.load())!.passkeys).toEqual([]);
});
it("failed resealing during strip still permits authenticated password access", async () => {
  await storage.commit(legacy);
  const encrypt = vi
    .spyOn(crypto.subtle, "encrypt")
    .mockRejectedValueOnce(new Error("synthetic reseal failure"));
  const session = new Session();
  await session.unlock(password);
  expect(encrypt).toHaveBeenCalled();
  expect(session.unlocked).toBe(true);
  expect(session.current()).toEqual(legacy);
  expect(await storage.load()).toEqual(legacy);
});
it("new envelopes require the empty legacy field, while stripping before authentication fails", async () => {
  expect(() => validateEnvelope(legacy)).toThrow("passkey");
  const { key, data } = await decryptEnvelope(legacy, password);
  await expect(seal(headerOf(legacy), key, data)).rejects.toThrow("passkey");
  const { passkeys: _slots, ...missing } = legacy;
  expect(() => validateEnvelope(missing)).toThrow();
  await expect(
    decryptEnvelope({ ...legacy, passkeys: [] }, password),
  ).rejects.toThrow();
});
it("locking during a failed legacy strip still cancels unlock", async () => {
  await storage.commit(legacy);
  const session = new Session();
  vi.spyOn(storage, "commit").mockImplementationOnce(async () => {
    session.lock();
    throw new Error("cancelled strip");
  });
  await expect(session.unlock(password)).rejects.toThrow("cancelled");
  expect(session.unlocked).toBe(false);
});
