import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Session } from "../src/session";
import { decryptEnvelope, open, type Envelope } from "../src/crypto";
import { parseURI } from "../src/import";
import { createEnrollment } from "../src/ui/enrollment";
import { click, context, resetUI } from "./helpers/ui";
vi.mock("../src/dom", async (original) => ({
  ...(await original<typeof import("../src/dom")>()),
  ...(await import("./helpers/ui")),
}));
beforeEach(() => {
  resetUI();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("localStorage", { getItem: () => null });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function previous(): Promise<Envelope> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("otp-vault", 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("vault", "readonly"),
        req = tx.objectStore("vault").get("previous");
      tx.oncomplete = () => resolve(req.result);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
it("the delete confirmation accurately describes the encrypted recovery copy and its replacement", async () => {
  const password = "synthetic deletion-retention test password",
    s = new Session();
  await s.setup(password);
  const d = s.accounts();
  d.accounts.push(
    parseURI("otpauth://totp/Audit:user?secret=JBSWY3DPEHPK3PXP"),
  );
  await s.save(d);
  const ctx = context(s),
    confirm = ctx.confirmAction;
  let message = "";
  ctx.confirmAction = (title, text, label, action) => {
    message = text;
    confirm(title, text, label, action);
  };
  createEnrollment(ctx, () => {}).editAccount(d.accounts[0]!.id);
  await click("Delete account…");
  expect(message).toContain("recent encrypted recovery copy may retain it");
  expect(message).toContain("next save or a master-password change");
  expect(message).not.toContain("without a trash copy");
  await click("Delete account");
  expect(s.accounts().accounts).toHaveLength(0);
  const retained = await decryptEnvelope(await previous(), password);
  expect(retained.data.accounts[0]!.secret).toBe(d.accounts[0]!.secret);
  await s.save(s.accounts());
  expect((await open(await previous(), retained.key)).accounts).toHaveLength(0);
}, 60_000);
