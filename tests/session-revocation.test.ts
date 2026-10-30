import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Session } from "../src/session";
import { SessionBroker, type BrokerIO } from "../src/session-broker";
import { base64, rotatePassword } from "../src/crypto";
import {
  envelopeBinding,
  type CachedUnlock,
  type SessionCache,
  type SessionState,
} from "../src/session-cache";
import * as storage from "../src/storage";
let state: unknown,
  now: number,
  broker: SessionBroker,
  listeners: Map<string, SessionCache>;
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  now = Date.now();
  state = undefined;
  listeners = new Map();
  const io: BrokerIO = {
    read: async () => structuredClone(state),
    write: async (s) => {
      state = structuredClone(s);
      for (const [id, cache] of listeners)
        if (id !== s.source) cache.onstate(s);
    },
    active: async () => {
      const e = await storage.load();
      return e && !storage.isOldVault(e) && !storage.isRecoveryOffer(e)
        ? e
        : undefined;
    },
    alarm: async () => {},
    now: () => now,
  };
  broker = new SessionBroker(io);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function cache(id: string): SessionCache {
  const request = (action: string, value = {}) =>
    broker.request({ action, ...value }, id);
  const c: SessionCache = {
    onstate: () => {},
    begin: async () => (await request("begin")) as string,
    remember: async (epoch, e, raw, timeout) =>
      (await request("remember", {
        epoch,
        binding: await envelopeBinding(e),
        key: base64(raw),
        timeout,
      })) as CachedUnlock,
    resume: async () => (await request("resume")) as CachedUnlock | undefined,
    verify: async (epoch, e) =>
      (await request("verify", {
        epoch,
        binding: await envelopeBinding(e),
      })) as CachedUnlock,
    update: async (epoch, previous, next) =>
      (await request("update", {
        epoch,
        previous: await envelopeBinding(previous),
        binding: await envelopeBinding(next),
      })) as CachedUnlock,
    touch: async (epoch, timeout) =>
      (await request("touch", { epoch, timeout })) as CachedUnlock,
    draft: async (epoch, value) => {
      await request("draft", { epoch, value });
    },
    expire: async () => {
      await request("expire");
    },
    clear: async (epoch) => {
      await request("lock", { epoch });
    },
  };
  listeners.set(id, c);
  return c;
}
const password = "synthetic shared session password";
async function setup(id = "one") {
  const s = new Session(cache(id));
  s.timeout = 300_000;
  await s.setup(password);
  return s;
}
it.each([0, 300_000])(
  "global Lock revokes a password-change view with timeout %i",
  async (timeout) => {
    const first = await setup();
    await first.setTimeout(timeout);
    const nextPassword = "synthetic revocation new password";
    const rotation = await rotatePassword(
      first.current(),
      password,
      nextPassword,
    );
    await first.save(
      first.accounts(),
      (h) => ({ ...h, password: rotation.password }),
      rotation.key,
    );
    expect(first.unlocked).toBe(true);
    const other = new Session(cache("other"));
    other.lock();
    await broker.request({ action: "expire" }, "worker");
    expect((state as SessionState).unlock).toBeUndefined();
    expect(first.unlocked).toBe(false);
    await expect(first.validate()).rejects.toThrow();
    expect(() => first.accounts()).toThrow();
  },
  60000,
);
it("global Lock revokes a confirmed recovery view before and after promotion", async () => {
  const original = await setup();
  await original.save(original.accounts());
  const current = original.current();
  original.lock();
  await broker.request({ action: "expire" }, "worker");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("otp-vault", 1);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("vault", "readwrite");
    tx.objectStore("vault").put(
      { ...current, payload: { ...current.payload, key: "broken" } },
      "active",
    );
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  db.close();
  let offer = await storage.load();
  if (!offer || !storage.isRecoveryOffer(offer)) throw Error("Missing offer");
  const recovered = new Session(cache("recovered"));
  await recovered.unlock(password, offer);
  const other = new Session(cache("other"));
  other.lock();
  await broker.request({ action: "expire" }, "worker");
  expect(recovered.unlocked).toBe(false);
  offer = await storage.load();
  if (!offer || !storage.isRecoveryOffer(offer)) throw Error("Missing offer");
  await recovered.unlock(password, offer);
  await recovered.save(recovered.accounts());
  expect(recovered.unlocked).toBe(true);
  other.lock();
  await broker.request({ action: "expire" }, "worker");
  expect(recovered.unlocked).toBe(false);
  expect(() => recovered.accounts()).toThrow();
}, 60000);
