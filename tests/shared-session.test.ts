import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Session } from "../src/session";
import { SessionBroker, type BrokerIO } from "../src/session-broker";
import {
  base64,
  importVaultKey,
  rotatePassword,
  type Envelope,
} from "../src/crypto";
import {
  envelopeBinding,
  type CachedUnlock,
  type SessionCache,
  type SessionState,
} from "../src/session-cache";
import * as storage from "../src/storage";
import * as crypt from "../src/crypto";
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
it("reopens from an authenticated encrypted vault without deriving the password again", async () => {
  const first = await setup(),
    expected = first.current();
  first.detach();
  const unwrap = vi.spyOn(crypt, "unwrapPassword");
  const next = new Session(cache("two"));
  expect(await next.resume()).toBe(true);
  expect(next.current()).toEqual(expected);
  expect(JSON.stringify(next)).not.toContain(
    (state as SessionState).unlock!.key,
  );
  expect(next.accounts()).toEqual(firstData());
  expect(unwrap).not.toHaveBeenCalled();
  const raw = new Uint8Array(
    Buffer.from((state as SessionState).unlock!.key, "base64"),
  );
  const key = await importVaultKey(raw);
  raw.fill(0);
  expect(key.extractable).toBe(false);
}, 60_000);
function firstData() {
  return { version: 3, accounts: [], verifiedAt: null, verifiedSnapshot: null };
}
it("manual lock clears the shared cache and immediately cancels every other open view", async () => {
  const first = await setup(),
    second = new Session(cache("two"));
  expect(await second.resume()).toBe(true);
  first.lock();
  await broker.request({ action: "expire" }, "worker");
  expect(first.unlocked).toBe(false);
  expect(second.unlocked).toBe(false);
  expect((state as SessionState).unlock).toBeUndefined();
  expect(await new Session(cache("three")).resume()).toBe(false);
}, 60_000);
it("expired cache cannot reopen the vault even without an alarm", async () => {
  const first = await setup();
  first.detach();
  now += 300_000;
  expect(await new Session(cache("two")).resume()).toBe(false);
  expect((state as SessionState).unlock).toBeUndefined();
}, 60_000);
it("a successful ordinary save refreshes the cache and invalidates a stale view", async () => {
  const first = await setup(),
    second = new Session(cache("two"));
  await second.resume();
  await first.save(first.accounts());
  expect(second.unlocked).toBe(false);
  const reopened = new Session(cache("three"));
  expect(await reopened.resume()).toBe(true);
  expect(reopened.current().revision).toBe(1);
}, 60_000);
it("password rotation revokes the old cache and all other views before committing", async () => {
  const first = await setup(),
    second = new Session(cache("two"));
  await second.resume();
  const rotation = await rotatePassword(
    first.current(),
    password,
    "new synthetic shared password",
  );
  const original = storage.commit;
  vi.spyOn(storage, "commit").mockImplementationOnce(async (...args) => {
    expect((state as SessionState).unlock).toBeUndefined();
    expect(second.unlocked).toBe(false);
    return original(...args);
  });
  await first.save(
    first.accounts(),
    (h) => ({ ...h, password: rotation.password }),
    rotation.key,
  );
  expect(first.unlocked).toBe(true);
  expect(await new Session(cache("three")).resume()).toBe(false);
  const fresh = new Session(cache("four"));
  await fresh.unlock("new synthetic shared password");
  expect(fresh.unlocked).toBe(true);
}, 60_000);
it("a lock in another view during derivation prevents publishing a remembered session", async () => {
  const first = await setup();
  first.detach();
  const c = cache("two"),
    next = new Session(c);
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>((r) => {
      entered = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  const original = crypt.decryptEnvelope;
  vi.spyOn(crypt, "decryptEnvelope").mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    entered();
    await gate;
    return result;
  });
  const pending = next.unlock(password),
    rejected = expect(pending).rejects.toThrow("cancelled");
  await waiting;
  await broker.request({ action: "lock" }, "three");
  release();
  await rejected;
  expect(next.unlocked).toBe(false);
  expect((state as SessionState).unlock).toBeUndefined();
}, 60_000);
it("tampering at the same revision cannot resume or change the stored vault", async () => {
  const first = await setup(),
    original = first.current();
  first.detach();
  const damaged: Envelope = {
    ...original,
    payload: {
      ...original.payload,
      iv: base64(crypto.getRandomValues(new Uint8Array(12))),
    },
  };
  await storage.commit(damaged, original);
  expect(await new Session(cache("two")).resume()).toBe(false);
  expect(await storage.load()).toEqual(damaged);
}, 60_000);
it("captured key bytes are zeroed after setup and after a password unlock", async () => {
  const c = cache("one"),
    remember = c.remember;
  const copies: Uint8Array[] = [];
  c.remember = async (...args) => {
    copies.push(args[2]);
    return remember(...args);
  };
  const first = new Session(c);
  first.timeout = 300_000;
  await first.setup(password);
  expect(copies[0]!.every((v) => v === 0)).toBe(true);
  first.lock();
  await first.unlock(password);
  expect(copies).toHaveLength(2);
  expect(copies[1]!.every((v) => v === 0)).toBe(true);
}, 60_000);

it("a cache-update failure reports the committed save accurately and revokes other views", async () => {
  const c = cache("one"),
    first = new Session(c);
  first.timeout = 300_000;
  await first.setup(password);
  const second = new Session(cache("two"));
  await second.resume();
  c.update = async () => {
    throw new Error("temporary cache failure");
  };
  await expect(first.save(first.accounts())).rejects.toThrow(
    "Your vault was saved",
  );
  expect(first.unlocked).toBe(false);
  expect(second.unlocked).toBe(false);
  expect(((await storage.load()) as Envelope).revision).toBe(1);
  expect((state as SessionState).unlock).toBeUndefined();
}, 60_000);

it("view validation waits for an in-flight encrypted commit and cache refresh instead of locking it", async () => {
  const c = cache("one"),
    first = new Session(c);
  first.timeout = 300_000;
  await first.setup(password);
  const update = c.update,
    verify = vi.spyOn(c, "verify");
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  c.update = async (...args) => {
    entered();
    await gate;
    return update(...args);
  };
  const saving = first.save(first.accounts());
  await started;
  verify.mockClear();
  const action = first.validate();
  try {
    expect(verify).not.toHaveBeenCalled();
    expect(first.unlocked).toBe(true);
  } finally {
    release();
    await Promise.allSettled([saving, action]);
  }
  await saving;
  await action;
  expect(verify).toHaveBeenCalledOnce();
  expect(first.unlocked).toBe(true);
  expect(first.current().revision).toBe(1);
}, 60_000);

it("a blocked old-view action and late save failure cannot cancel a newer password unlock", async () => {
  const c = cache("one"),
    first = new Session(c);
  first.timeout = 300_000;
  await first.setup(password);
  const update = c.update;
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  c.update = async (...args) => {
    entered();
    await gate;
    return update(...args);
  };
  const saving = first.save(first.accounts());
  const savedError = expect(saving).rejects.toThrow("Your vault was saved");
  await started;
  const action = first.validate(),
    cancelled = expect(action).rejects.toThrow("cancelled");
  first.lock();
  await first.unlock(password);
  const freshEpoch = (state as SessionState).epoch;
  release();
  await savedError;
  await cancelled;
  expect(first.unlocked).toBe(true);
  expect((state as SessionState).epoch).toBe(freshEpoch);
  expect((state as SessionState).unlock).toBeDefined();
}, 60_000);

it("shared sessions use five minutes even when a caller has no UI preferences", async () => {
  const first = new Session(cache("one"));
  await first.setup(password);
  expect((state as SessionState).unlock!.timeout).toBe(300_000);
  expect((state as SessionState).unlock!.expires).toBe(now + 300_000);
}, 60_000);

it("a cancelled unlock cannot replace a newer unlock's lease with its delayed begin result", async () => {
  const first = await setup();
  first.detach();
  const c = cache("delayed");
  const session = new Session(c);
  const oldLease = (state as SessionState).epoch;
  let release!: (value: string) => void;
  const begin = vi.spyOn(c, "begin").mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        release = resolve;
      }),
  );
  const oldUnlock = session.unlock(password);
  const rejected = expect(oldUnlock).rejects.toThrow("Unlock cancelled.");
  await vi.waitFor(() => expect(begin).toHaveBeenCalledTimes(1));
  session.lock();
  await broker.request({ action: "expire" }, "worker");
  await session.unlock(password);
  release(oldLease);
  await rejected;
  expect(session.unlocked).toBe(true);
  await session.save(session.accounts());
  expect(session.current().revision).toBe(1);
  expect(await new Session(cache("reopened")).resume()).toBe(true);
}, 60_000);
