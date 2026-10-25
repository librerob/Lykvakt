import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { decryptEnvelope, type Envelope } from "../src/crypto";
import { Session } from "../src/session";
import { load } from "../src/storage";
import { createSettings } from "../src/ui/settings";
import { click, context, resetUI, send, set } from "./helpers/ui";
vi.mock("../src/dom", async () => import("./helpers/ui"));
const oldPassword = "synthetic previous-copy old password";
const newPassword = "synthetic previous-copy new password";
beforeEach(() => {
  resetUI();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  vi.stubGlobal("localStorage", { getItem: () => null });
});
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
async function prepare() {
  const session = new Session();
  await session.setup(oldPassword);
  const first = session.current();
  await session.save(session.accounts());
  const active = session.current();
  expect(await record("previous")).toEqual(first);
  createSettings(context(session)).settingsView();
  await click("Change master password");
  set("current", oldPassword);
  set("next", newPassword);
  set("confirm", newPassword);
  return { session, first, active };
}
it("master-password rotation removes the pre-rotation previous envelope", async () => {
  const { session } = await prepare();
  await send();
  expect(await record("previous")).toBeUndefined();
  expect(await load()).toEqual(session.current());
  expect((await decryptEnvelope(session.current(), newPassword)).data).toEqual(
    session.accounts(),
  );
  await expect(
    decryptEnvelope(session.current(), oldPassword),
  ).rejects.toThrow();
});
it("the next ordinary save preserves the post-rotation envelope as previous", async () => {
  const { session } = await prepare();
  await send();
  const rotated = session.current();
  await session.save(session.accounts());
  const previous = (await record("previous")) as Envelope;
  expect(previous).toEqual(rotated);
  expect((await decryptEnvelope(previous, newPassword)).data).toEqual(
    session.accounts(),
  );
  await expect(decryptEnvelope(previous, oldPassword)).rejects.toThrow();
});
it("failure after previous deletion rolls back both records and keeps the session key", async () => {
  const { session, first, active } = await prepare();
  const put = IDBObjectStore.prototype.put;
  const failure = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (value, key) {
      if (key === "active")
        throw new DOMException(
          "Synthetic rotation failure",
          "QuotaExceededError",
        );
      return put.call(this, value, key);
    });
  await expect(send()).rejects.toThrow("previous vault is unchanged");
  expect(session.current()).toEqual(active);
  expect(await record("active")).toEqual(active);
  expect(await record("previous")).toEqual(first);
  failure.mockRestore();
  await session.save(session.accounts());
  expect((await decryptEnvelope(session.current(), oldPassword)).data).toEqual(
    session.accounts(),
  );
});
it("corrupting active immediately after rotation cannot offer a pre-rotation recovery copy", async () => {
  const { session } = await prepare();
  await send();
  const active = session.current();
  await record("active", {
    ...active,
    payload: { ...active.payload, ciphertext: "bad" },
  });
  expect(await record("previous")).toBeUndefined();
  await expect(load()).rejects.toThrow("no readable older copy");
  session.lock();
  await expect(session.unlock(newPassword)).rejects.toThrow(
    "no readable older copy",
  );
  expect(session.unlocked).toBe(false);
});
