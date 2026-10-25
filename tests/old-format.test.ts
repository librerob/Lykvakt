import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEnvelope, validateEnvelope } from "../src/crypto";
import { verifyBackup } from "../src/import";
import { OldFormatError, oldFormatMessage } from "../src/format";
import { emptyVault, validateData, validateAccount } from "../src/model";
import { parseURI } from "../src/import";
import { Session } from "../src/session";
import { createWelcome } from "../src/ui/welcome";
import { context } from "./helpers/ui";
import { TestElement, testDocument } from "./helpers/dom";
import * as kdf from "../src/kdf";
import * as storage from "../src/storage";
const old = {
  format: "otp-vault",
  version: 1,
  id: "earlier-preview",
  revision: 4,
};
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("document", testDocument);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function record(key: string, value?: unknown) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("otp-vault", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("vault");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(
          "vault",
          value === undefined ? "readonly" : "readwrite",
        ),
        store = tx.objectStore("vault");
      const request =
        value === undefined ? store.get(key) : store.put(value, key);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
it("old vault and backup formats fail calmly before any password work", async () => {
  const derive = vi.spyOn(kdf, "argon2Key");
  expect(oldFormatMessage).toBe(
    "This vault was made by an earlier preview and can't be opened by this version. To move your accounts: use the old version, go to Recovery → Export plaintext OTP links, then import that file here. If you no longer have the old version, reinstall it in the same folder (same extension), export, then update.",
  );
  expect(() => validateEnvelope(old)).toThrow(oldFormatMessage);
  await expect(
    verifyBackup({ ...old, kind: "backup" }, "synthetic password"),
  ).rejects.toThrow(OldFormatError);
  await record("active", old);
  await expect(new Session().unlock("synthetic password")).rejects.toThrow(
    oldFormatMessage,
  );
  expect(derive).not.toHaveBeenCalled();
  expect(await record("active")).toEqual(old);
});
it.each(["old-active", "old-previous", "corrupt-with-old-previous"])(
  "%s is never offered as older-revision recovery",
  async (scenario) => {
    if (scenario === "old-active") await record("active", old);
    else {
      if (scenario.startsWith("corrupt"))
        await record("active", { damaged: true });
      await record("previous", old);
    }
    const offer = (await storage.load())!;
    expect(storage.isOldVault(offer)).toBe(true);
    expect(storage.isRecoveryOffer(offer)).toBe(false);
    expect(offer).toMatchObject({ kind: "old-format" });
  },
);
it("a valid current active vault wins over an old previous copy", async () => {
  const current = await createEnvelope(
    "synthetic current vault password",
    emptyVault(),
  );
  await storage.commit(current.envelope);
  await record("previous", old);
  expect(await storage.load()).toEqual(current.envelope);
}, 60_000);
it("an old active vault never falls back to a readable current-format previous copy", async () => {
  const current = await createEnvelope(
    "synthetic previous copy password",
    emptyVault(),
  );
  await storage.commit(current.envelope);
  await record("previous", current.envelope);
  await record("active", old);
  expect(storage.isOldVault((await storage.load())!)).toBe(true);
  expect(await record("active")).toEqual(old);
  expect(await record("previous")).toEqual(current.envelope);
}, 60_000);
it("erasure requires the second UI confirmation and removes both records only then", async () => {
  await record("active", old);
  await record("previous", old);
  const offer = (await storage.load())!;
  if (!storage.isOldVault(offer)) throw new Error("Missing old-format offer");
  const session = new Session(),
    ctx = context(session);
  ctx.state.oldVault = offer;
  let confirmed: (() => Promise<void>) | undefined;
  ctx.confirmAction = (_title, message, label, action) => {
    expect(message).toContain("Export your accounts");
    expect(label).toBe("Erase old vault");
    confirmed = action;
  };
  const view = createWelcome(ctx, () => {}).locked() as unknown as TestElement;
  expect(view.textContent).toContain(oldFormatMessage);
  expect(view.querySelector("input")).toBeNull();
  expect(view.querySelector('[data-help="oldFormat"]')).not.toBeNull();
  expect(await record("active")).toEqual(old);
  view
    .querySelectorAll("button")
    .find((b) => b.textContent === "Erase the old vault and start fresh")!
    .click();
  expect(confirmed).toBeDefined();
  expect(await record("active")).toEqual(old);
  expect(await record("previous")).toEqual(old);
  await confirmed!();
  expect(await record("active")).toBeUndefined();
  expect(await record("previous")).toBeUndefined();
  expect(ctx.state.exists).toBe(false);
});
it("a change after the offer prevents confirmed erasure", async () => {
  await record("active", old);
  const offer = (await storage.load())!;
  if (!storage.isOldVault(offer)) throw new Error("Missing old-format offer");
  const changed = { ...old, revision: 5 };
  await record("active", changed);
  await expect(storage.eraseOldVault(offer)).rejects.toBeInstanceOf(
    storage.StorageConflictError,
  );
  expect(await record("active")).toEqual(changed);
});
it("a new-format replacement cannot be erased by an old confirmation", async () => {
  await record("active", old);
  const offer = (await storage.load())!;
  if (!storage.isOldVault(offer)) throw new Error("Missing old-format offer");
  const changed = { ...old, version: 2 };
  await record("active", changed);
  await expect(storage.eraseOldVault(offer)).rejects.toBeInstanceOf(
    storage.StorageConflictError,
  );
  expect(await record("active")).toEqual(changed);
});
it("a failed second deletion rolls back both old records", async () => {
  await record("active", old);
  await record("previous", old);
  const offer = (await storage.load())!;
  if (!storage.isOldVault(offer)) throw new Error("Missing old-format offer");
  const remove = IDBObjectStore.prototype.delete;
  vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(function (
    this: IDBObjectStore,
    key,
  ) {
    if (key === "previous") throw new Error("synthetic delete failure");
    return remove.call(this, key);
  });
  await expect(storage.eraseOldVault(offer)).rejects.toThrow("unchanged");
  expect(await record("active")).toEqual(old);
  expect(await record("previous")).toEqual(old);
});
it("payload schema 3 rejects earlier schemas and removed or unknown account fields", () => {
  for (const version of [1, 2])
    expect(() => validateData({ ...emptyVault(), version })).toThrow(
      OldFormatError,
    );
  const account = parseURI("otpauth://totp/Test:user?secret=JBSWY3DPEHPK3PXP");
  expect(() => validateAccount({ ...account, origins: [] })).toThrow();
  expect(() => validateData({ ...emptyVault(), extra: 1 })).toThrow();
  const missing = { ...account } as Partial<typeof account>;
  delete missing.group;
  expect(() => validateAccount(missing)).toThrow();
});

it("an added null record after the offer cannot pass erasure confirmation", async () => {
  await record("active", old);
  const offer = (await storage.load())!;
  if (!storage.isOldVault(offer)) throw new Error("Missing old-format offer");
  await record("previous", null);
  await expect(storage.eraseOldVault(offer)).rejects.toBeInstanceOf(
    storage.StorageConflictError,
  );
  expect(await record("active")).toEqual(old);
  expect(await record("previous")).toBeNull();
});
