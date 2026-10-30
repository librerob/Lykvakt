import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createEnvelope, headerOf, seal } from "../src/crypto";
import { emptyVault } from "../src/model";
import * as storage from "../src/storage";
import { Session } from "../src/session";
import { createWelcome } from "../src/ui/welcome";
import { context, resetUI, send, set } from "./helpers/ui";
vi.mock("../src/dom", async () => import("./helpers/ui"));
const password = "synthetic recovery refresh password";
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  resetUI();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function write(active: unknown, previous?: unknown) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("otp-vault", 1);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("vault", "readwrite");
      const store = tx.objectStore("vault");
      store.put(active, "active");
      if (previous !== undefined) store.put(previous, "previous");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function fixture() {
  const first = await createEnvelope(password, emptyVault());
  await storage.commit(first.envelope);
  const next = await seal(
    { ...headerOf(first.envelope), revision: 1 },
    first.key,
    emptyVault(),
  );
  await storage.commit(next, first.envelope);
  await write({ ...next, payload: { ...next.payload, key: "broken" } });
  const offer = await storage.load();
  if (!offer || !storage.isRecoveryOffer(offer))
    throw Error("Missing recovery offer");
  const session = new Session(),
    ctx = context(session);
  ctx.state.recovery = offer;
  ctx.render = vi.fn();
  const welcome = createWelcome(ctx, () => {});
  welcome.locked();
  return { first, next, offer, session, ctx, welcome };
}
it("refreshes a stale recovery offer after another view repairs active, then allows a normal retry", async () => {
  const f = await fixture();
  const other = new Session();
  await other.unlock(password, f.offer);
  await other.save(other.accounts());
  const winning = await storage.load();
  set("password", password);
  await expect(send()).rejects.toThrow();
  expect(f.session.unlocked).toBe(false);
  expect(f.ctx.state.recovery).toBeUndefined();
  expect(f.ctx.state.exists).toBe(true);
  expect(f.ctx.render).toHaveBeenCalledOnce();
  expect(await storage.load()).toEqual(winning);
  f.welcome.locked();
  set("password", password);
  await send();
  expect(f.session.unlocked).toBe(true);
  expect(await storage.load()).toEqual(winning);
}, 60000);
it("offers the new older copy for explicit confirmation when recovery metadata changes", async () => {
  const f = await fixture();
  const previous = await seal(
    { ...headerOf(f.first.envelope), revision: 2 },
    f.first.key,
    emptyVault(),
  );
  const active = {
    ...previous,
    revision: 3,
    payload: { ...previous.payload, key: "broken" },
  };
  await write(active, previous);
  set("password", password);
  await expect(send()).rejects.toThrow();
  expect(f.session.unlocked).toBe(false);
  expect(f.ctx.state.recovery?.previous.revision).toBe(2);
  expect(f.ctx.state.recovery?.active).toEqual(active);
  f.welcome.locked();
  set("password", password);
  await send();
  expect(f.session.unlocked).toBe(true);
  expect(f.session.current().revision).toBe(2);
}, 60000);
it("does not offer setup when refreshing recovery metadata fails", async () => {
  const f = await fixture();
  await write(f.next);
  vi.spyOn(storage, "load")
    .mockResolvedValueOnce(f.next)
    .mockRejectedValueOnce(new Error("synthetic read failure"));
  set("password", password);
  await expect(send()).rejects.toThrow();
  expect(f.session.unlocked).toBe(false);
  expect(f.ctx.state.exists).toBe(true);
  expect(f.ctx.render).not.toHaveBeenCalled();
}, 60000);
