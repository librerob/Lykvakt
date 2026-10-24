import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createEnvelope, headerOf, seal } from "../src/crypto";
import { emptyVault } from "../src/model";
import {
  commit,
  load,
  isRecoveryOffer,
  RecoveryRequired,
} from "../src/storage";
import { Session } from "../src/session";
const password = "synthetic recovery test password";
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function record(key: string, value?: unknown, write = false) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("otp-vault", 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction("vault", write ? "readwrite" : "readonly"),
        store = tx.objectStore("vault");
      const req = write
        ? value === undefined
          ? store.delete(key)
          : store.put(value, key)
        : store.get(key);
      tx.oncomplete = () => resolve(req.result);
      tx.onabort = tx.onerror = () =>
        reject(new Error("Fixture transaction failed"));
    });
  } finally {
    db.close();
  }
}
async function copies() {
  const first = await createEnvelope(password, emptyVault());
  await commit(first.envelope);
  const second = await seal(
    { ...headerOf(first.envelope), revision: 1 },
    first.key,
    emptyVault(),
  );
  await commit(second, first.envelope);
  return { first: first.envelope, second, key: first.key };
}
it("offers structurally corrupted active data without silently selecting previous", async () => {
  const { first, second } = await copies();
  const corrupt = { ...second, ciphertext: "bad" };
  await record("active", corrupt, true);
  const offered = await load();
  expect(offered).toEqual({
    kind: "recovery",
    previous: first,
    active: corrupt,
  });
  const session = new Session();
  await expect(session.unlock(password)).rejects.toThrow(RecoveryRequired);
  expect(session.unlocked).toBe(false);
  expect(await record("active")).toEqual(corrupt);
  expect(await record("previous")).toEqual(first);
});
it("offers previous when active is missing and only unlocks after confirmation", async () => {
  const { first } = await copies();
  await record("active", undefined, true);
  const offered = (await load())!;
  expect(isRecoveryOffer(offered)).toBe(true);
  if (!isRecoveryOffer(offered)) throw new Error("Missing recovery offer");
  const session = new Session();
  await expect(session.unlock(password)).rejects.toThrow(
    "Unlock it to recover?",
  );
  await expect(
    session.unlock("wrong password", undefined, offered),
  ).rejects.toThrow();
  expect(session.unlocked).toBe(false);
  await session.unlock(password, undefined, offered);
  expect(session.current()).toEqual(first);
  expect(await record("active")).toBeUndefined();
  await session.save(session.accounts());
  expect(await load()).toEqual(session.current());
  expect(await record("previous")).toEqual(first);
});
it("uses active when both copies validate, regardless of previous", async () => {
  const { second } = await copies();
  expect(await load()).toEqual(second);
  await record("previous", { corrupt: true }, true);
  expect(await load()).toEqual(second);
});
it("rolls back both records if the second write fails", async () => {
  const { first, second, key } = await copies();
  const third = await seal(
    { ...headerOf(second), revision: 2 },
    key,
    emptyVault(),
  );
  const put = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(
    function (value, key) {
      if (key === "active")
        throw new DOMException("Synthetic failure", "QuotaExceededError");
      return put.call(this, value, key);
    },
  );
  await expect(commit(third, second)).rejects.toThrow(
    "previous vault is unchanged",
  );
  expect(await record("active")).toEqual(second);
  expect(await record("previous")).toEqual(first);
});
it("overwrites previous with the exact prior envelope on the next commit", async () => {
  const { second, key } = await copies();
  const third = await seal(
    { ...headerOf(second), revision: 2 },
    key,
    emptyVault(),
  );
  await commit(third, second);
  expect(await record("previous")).toEqual(second);
  expect(await load()).toEqual(third);
  await expect(commit(third, second)).rejects.toThrow(
    "changed in another window",
  );
  expect(await record("previous")).toEqual(second);
});
it("promotes recovery past the active revision and rejects stale writers", async () => {
  const { first, second } = await copies();
  const stale = new Session();
  await stale.unlock(password);
  await record("active", { ...second, ciphertext: "bad" }, true);
  const offered = (await load())!;
  if (!isRecoveryOffer(offered)) throw new Error("Missing recovery offer");
  const session = new Session();
  await session.unlock(password, undefined, offered);
  await session.save(session.accounts());
  expect(session.current().revision).toBe(second.revision + 1);
  expect(await record("previous")).toEqual(first);
  await expect(stale.save(stale.accounts())).rejects.toThrow(
    "changed in another window",
  );
});
it("rejects recovery promotion and old confirmation when active changes", async () => {
  const { second } = await copies();
  await record("active", { ...second, ciphertext: "bad" }, true);
  const offered = (await load())!;
  if (!isRecoveryOffer(offered)) throw new Error("Missing recovery offer");
  const session = new Session();
  await session.unlock(password, undefined, offered);
  await record("active", second, true);
  const other = new Session();
  await expect(other.unlock(password, undefined, offered)).rejects.toThrow(
    "changed",
  );
  // Same identity and revision retains the existing compare-and-set semantics.
  await record("active", { ...second, revision: second.revision + 1 }, true);
  await expect(session.save(session.accounts())).rejects.toThrow(
    "changed in another window",
  );
});
it("never offers an invalid previous copy or falls back after authentication failure", async () => {
  const { second } = await copies();
  await expect(new Session().unlock("wrong password")).rejects.toThrow();
  expect(await load()).toEqual(second);
  await record("active", { bad: true }, true);
  await record("previous", { bad: true }, true);
  await expect(load()).rejects.toThrow("no readable older copy");
});
