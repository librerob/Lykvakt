import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import legacy from "./fixtures/legacy-slots-vault.json";
import { decryptEnvelope, type Envelope } from "../src/crypto";
import { Session } from "../src/session";
import * as storage from "../src/storage";
import { passwordVault } from "./helpers/vault";

beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function record(key: string, value?: unknown) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("otp-vault", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(
        "vault",
        value === undefined ? "readonly" : "readwrite",
      );
      const store = tx.objectStore("vault");
      const request =
        value === undefined ? store.get(key) : store.put(value, key);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () =>
        reject(new Error("Fixture transaction failed"));
    });
  } finally {
    db.close();
  }
}
async function prepare(kind: string) {
  const password =
    kind === "iteration upgrade"
      ? "synthetic upgrade copy password"
      : "synthetic legacy slot password";
  const old =
    kind === "iteration upgrade"
      ? await passwordVault(password)
      : (structuredClone(legacy) as Envelope);
  await storage.commit(old);
  // Include a pre-existing copy so the upgrade must delete, not just skip preservation.
  await record("previous", old);
  return {
    old,
    password,
    iterations:
      kind === "iteration upgrade" ? 600_001 : old.password.iterations,
  };
}
it.each(["iteration upgrade", "legacy-slot strip"])(
  "%s discards the superseded copy; the next ordinary save preserves only the upgraded envelope",
  async (kind) => {
    const { old, password, iterations } = await prepare(kind);
    expect(await record("previous")).toEqual(old);
    const session = new Session();
    await session.unlock(password, iterations);
    const upgraded = session.current();
    expect(upgraded.revision).toBe(old.revision + 1);
    expect(upgraded.password.iterations).toBe(iterations);
    expect(upgraded.passkeys).toEqual([]);
    expect(await record("active")).toEqual(upgraded);
    expect(await record("previous")).toBeUndefined();

    await session.save(session.accounts());
    const previous = (await record("previous")) as Envelope;
    expect(previous).toEqual(upgraded);
    expect(previous.passkeys).toEqual([]);
    expect(previous.password.iterations).toBe(iterations);
    expect((await decryptEnvelope(previous, password)).data).toEqual(
      session.accounts(),
    );
  },
);
it.each(["iteration upgrade", "legacy-slot strip"])(
  "a failed %s rolls back previous deletion together with the active write",
  async (kind) => {
    const { old, password, iterations } = await prepare(kind);
    const put = IDBObjectStore.prototype.put;
    const failure = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (value, key) {
        if (key === "active")
          throw new DOMException(
            "Synthetic upgrade failure",
            "QuotaExceededError",
          );
        return put.call(this, value, key);
      });
    const session = new Session();
    await session.unlock(password, iterations);
    expect(session.unlocked).toBe(true);
    expect(session.current()).toEqual(old);
    expect(await record("active")).toEqual(old);
    expect(await record("previous")).toEqual(old);

    failure.mockRestore();
    session.lock();
    await session.unlock(password, iterations);
    expect(session.current().revision).toBe(old.revision + 1);
    expect(await record("previous")).toBeUndefined();
  },
);
