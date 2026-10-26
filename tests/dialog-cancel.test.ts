import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Session } from "../src/session";
import { createRecovery } from "../src/ui/recovery";
import { createSettings } from "../src/ui/settings";
import { createEnrollment } from "../src/ui/enrollment";
import * as crypt from "../src/crypto";
import * as formats from "../src/import-formats";
import * as imports from "../src/import";
import { emptyVault } from "../src/model";
import { parseURI } from "../src/import";
import { load, eraseOldVault, isOldVault } from "../src/storage";
import * as QRCode from "qrcode";
import { click, context, resetUI, send, set, ui } from "./helpers/ui";
vi.mock("../src/dom", async (original) => ({
  ...(await original<typeof import("../src/dom")>()),
  ...(await import("./helpers/ui")),
}));
vi.mock("qrcode", () => ({
  toDataURL: vi.fn(async () => "data:image/png;base64,c3ludGhldGlj"),
}));
const password = "synthetic dialog cancellation password";
function gate() {
  let release!: () => void;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  return { wait, release };
}
beforeEach(() => {
  resetUI();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("localStorage", { getItem: () => null });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function ready() {
  const s = new Session();
  await s.setup(password);
  const d = s.accounts();
  d.accounts.push(parseURI("otpauth://totp/Test:user?secret=JBSWY3DPEHPK3PXP"));
  await s.save(d);
  return s;
}
it.each(["close", "replace"])(
  "%s cancels secret export after successful password verification",
  async (mode) => {
    const s = await ready(),
      ctx = context(s),
      start = gate(),
      finish = gate(),
      original = crypt.unwrapPassword;
    createRecovery(ctx, async () => {}).backupsView();
    await click("Export plaintext OTP links…");
    vi.spyOn(crypt, "unwrapPassword").mockImplementationOnce(
      async (...args) => {
        const raw = await original(...args);
        start.release();
        await finish.wait;
        return raw;
      },
    );
    set("password", password);
    const pending = send(),
      cancelled = expect(pending).rejects.toThrow(/cancel|abort|closed/i);
    await start.wait;
    if (mode === "close") ctx.closeDialog();
    else ctx.modal("Other action", {} as Node);
    const shown = ui.dialog;
    finish.release();
    await cancelled;
    expect(ui.downloads).toHaveLength(0);
    expect(ui.dialog).toBe(shown);
  },
  60_000,
);
it("closing backup creation while encryption finishes produces no file", async () => {
  const s = await ready(),
    ctx = context(s),
    start = gate(),
    finish = gate(),
    original = crypt.createEnvelope;
  createRecovery(ctx, async () => {}).backupsView();
  await click("Create encrypted backup");
  set("masterPassword", password);
  set("password", "synthetic separate backup passphrase");
  set("confirmation", "synthetic separate backup passphrase");
  vi.spyOn(crypt, "createEnvelope").mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    start.release();
    await finish.wait;
    return result;
  });
  const pending = send(),
    cancelled = expect(pending).rejects.toThrow(/cancel|abort|closed/i);
  await start.wait;
  ctx.closeDialog();
  finish.release();
  await cancelled;
  expect(ui.downloads).toHaveLength(0);
}, 60_000);
it("closing password change before save preserves the stored password slot", async () => {
  const s = await ready(),
    before = s.current(),
    ctx = context(s),
    start = gate(),
    finish = gate(),
    original = crypt.rotatePassword;
  createSettings(ctx).settingsView();
  await click("Change master password");
  set("current", password);
  set("next", "synthetic new master password");
  set("confirm", "synthetic new master password");
  vi.spyOn(crypt, "rotatePassword").mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    start.release();
    await finish.wait;
    return result;
  });
  const pending = send(),
    cancelled = expect(pending).rejects.toThrow(/cancel|abort|closed/i);
  await start.wait;
  ctx.closeDialog();
  finish.release();
  await cancelled;
  expect(await load()).toEqual(before);
  expect(s.current()).toEqual(before);
}, 60_000);
it("closing an import prevents its late preview and save", async () => {
  const s = await ready(),
    ctx = context(s),
    start = gate(),
    finish = gate(),
    original = formats.readDetectedImport;
  createEnrollment(ctx, () => {}).importAccounts();
  ui.fields.set("payload", {
    value: "otpauth://totp/Other:user?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  });
  vi.spyOn(formats, "readDetectedImport").mockImplementationOnce(
    async (...args) => {
      const result = await original(...args);
      start.release();
      await finish.wait;
      return result;
    },
  );
  const pending = send(),
    cancelled = expect(pending).rejects.toThrow(/cancel|abort|closed/i);
  await start.wait;
  ctx.closeDialog();
  const shown = ui.dialog;
  finish.release();
  await cancelled;
  expect(ui.dialog).toBe(shown);
  expect(s.accounts().accounts).toHaveLength(1);
}, 60_000);
it("an operation signal aborted before save cannot commit", async () => {
  const s = await ready(),
    before = s.current(),
    abort = new AbortController();
  abort.abort(new DOMException("Dialog closed.", "AbortError"));
  await expect(
    s.save(s.accounts(), undefined, undefined, abort.signal),
  ).rejects.toThrow(/cancel|abort|closed/i);
  expect(await load()).toEqual(before);
}, 60_000);

async function records() {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("otp-vault", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("vault");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("vault", "readonly"),
        store = tx.objectStore("vault"),
        a = store.get("active"),
        p = store.get("previous");
      tx.oncomplete = () => resolve({ active: a.result, previous: p.result });
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
it("dialog cancellation inside the write transaction preserves both stored revisions", async () => {
  const s = await ready(),
    before = await records(),
    abort = new AbortController(),
    put = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    if (key === "active")
      abort.abort(new DOMException("Dialog closed.", "AbortError"));
    return put.call(this, value, key);
  });
  await expect(
    s.save(s.accounts(), undefined, undefined, abort.signal),
  ).rejects.toThrow(/closed|cancel|abort/i);
  expect(await records()).toEqual(before);
}, 60_000);
it("a cancelled fresh-vault setup cannot create storage", async () => {
  const s = new Session(),
    abort = new AbortController();
  abort.abort(new DOMException("Dialog closed.", "AbortError"));
  await expect(s.setup(password, emptyVault(), abort.signal)).rejects.toThrow(
    /closed|cancel|abort/i,
  );
  expect(await load()).toBeUndefined();
  expect(s.unlocked).toBe(false);
});
it("closing fresh-profile recovery after backup decryption prevents new-vault creation", async () => {
  const saved = await crypt.createEnvelope(password, emptyVault(), "backup"),
    s = new Session(),
    ctx = context(s),
    start = gate(),
    finish = gate(),
    original = imports.verifyBackup;
  ctx.state.exists = false;
  createRecovery(ctx, async () => {}).recoverySetup();
  Object.assign(ui.fields.get("file")!, {
    files: [new File([JSON.stringify(saved.envelope)], "backup.json")],
  });
  set("backup", password);
  set("password", "synthetic recovered vault password");
  set("confirm", "synthetic recovered vault password");
  vi.spyOn(imports, "verifyBackup").mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    start.release();
    await finish.wait;
    return result;
  });
  const pending = send(),
    cancelled = expect(pending).rejects.toThrow(/closed|abort|cancel/i);
  await start.wait;
  ctx.closeDialog();
  finish.release();
  await cancelled;
  expect(await load()).toBeUndefined();
  expect(s.unlocked).toBe(false);
  expect(ui.fields.get("backup")!.value).toBe("");
  expect(ui.fields.get("password")!.value).toBe("");
}, 60_000);

it("closing QR generation prevents a late secret image", async () => {
  const s = await ready(),
    ctx = context(s),
    start = gate(),
    finish = gate();
  createEnrollment(ctx, () => {}).editAccount(s.accounts().accounts[0]!.id);
  await click("Show transfer QR…");
  vi.mocked(QRCode.toDataURL).mockImplementationOnce(async () => {
    start.release();
    await finish.wait;
    return "data:image/png;base64,c3ludGhldGlj";
  });
  set("password", password);
  const pending = send(),
    cancelled = expect(pending).rejects.toThrow(/closed|cancel|abort/i);
  await start.wait;
  ctx.closeDialog();
  const shown = ui.dialog;
  finish.release();
  await cancelled;
  expect(ui.dialog).toBe(shown);
  expect(ui.downloads).toHaveLength(0);
}, 60_000);
it("a cancelled old-vault erase preserves active and previous", async () => {
  await records();
  const db = await new Promise<IDBDatabase>((resolve) => {
    const r = indexedDB.open("otp-vault", 1);
    r.onsuccess = () => resolve(r.result);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("vault", "readwrite"),
      store = tx.objectStore("vault");
    store.put({ format: "otp-vault", version: 1, revision: 3 }, "active");
    store.put({ format: "otp-vault", version: 1, revision: 2 }, "previous");
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  db.close();
  const before = await records(),
    offer = await load();
  if (!offer || !isOldVault(offer)) throw Error("Missing old-vault offer");
  const abort = new AbortController();
  abort.abort(new DOMException("Dialog closed.", "AbortError"));
  await expect(eraseOldVault(offer, abort.signal)).rejects.toThrow(
    /closed|cancel|abort/i,
  );
  expect(await records()).toEqual(before);
});
