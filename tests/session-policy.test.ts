import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { BrowserSession } from "../src/browser-session";
import { SessionBroker } from "../src/session-broker";
import { Session } from "../src/session";
import { base64, importVaultKey, random, seal } from "../src/crypto";
import { emptyVault } from "../src/model";
import {
  envelopeBinding,
  type CachedUnlock,
  type SessionCache,
  type SessionState,
} from "../src/session-cache";
import * as storage from "../src/storage";

beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}
async function fixture(timeout: number) {
  const raw = random(32);
  try {
    const envelope = await seal(
      {
        format: "otp-vault",
        version: 2,
        kind: "vault",
        id: "policy-test",
        revision: 0,
        password: {
          kdf: "Argon2id",
          m: 65536,
          t: 3,
          p: 1,
          salt: base64(random(32)),
          iv: base64(random(12)),
          wrapped: base64(random(48)),
        },
      },
      await importVaultKey(raw),
      emptyVault(),
    );
    await storage.commit(envelope);
    const now = Date.now();
    const cached: CachedUnlock = {
      epoch: "lease",
      key: base64(raw),
      binding: await envelopeBinding(envelope),
      id: envelope.id,
      revision: 0,
      timeout,
      touched: now,
      checkedAt: now,
      expires: timeout ? now + timeout : 0,
    };
    return { envelope, cached };
  } finally {
    raw.fill(0);
  }
}
it.each([0, 300_000])(
  "queued activity cannot restore an old %i ms policy after another view shortens it",
  async (timeout) => {
    const { envelope, cached } = await fixture(timeout);
    let now = cached.checkedAt;
    let state: SessionState = {
      epoch: cached.epoch,
      source: "B",
      unlock: cached,
    };
    const broker = new SessionBroker({
      read: async () => structuredClone(state),
      write: async (value) => {
        state = structuredClone(value);
      },
      active: async () => envelope,
      alarm: async () => {},
      now: () => now,
    });
    const entered = gate(),
      held = gate();
    let first = true;
    vi.stubGlobal("chrome", {
      storage: { onChanged: { addListener() {} } },
      runtime: {
        sendMessage: async (message: unknown) => {
          const value = await broker.request(message, "B");
          if (first) {
            first = false;
            entered.release();
            await held.wait;
          }
          return { ok: true, source: "B", value };
        },
      },
    });
    const cache = new BrowserSession();
    const previousReply = cache.resume();
    await entered.wait;
    const activity = cache.touch(cached.epoch);
    now++;
    await broker.request(
      { action: "touch", epoch: cached.epoch, timeout: 60_000 },
      "A",
    );
    held.release();
    await previousReply;
    await activity;
    expect(state.unlock!.timeout).toBe(60_000);
    expect(state.unlock!.expires).toBe(now + 60_000);
    now += 60_001;
    expect(await broker.request({ action: "resume" }, "C")).toBeUndefined();
    expect(state.unlock).toBeUndefined();
  },
);
it.each(["activity", "verification"])(
  "a stale %s reply cannot undo an observed shorter policy",
  async (operation) => {
    const { cached } = await fixture(0);
    const entered = gate(),
      held = gate();
    const cache = {
      onstate: () => {},
      resume: async () => cached,
      verify: vi.fn(async () => cached),
      touch: vi.fn(async () => {
        entered.release();
        await held.wait;
        return cached;
      }),
      expire: async () => {},
      clear: async () => {},
    } as unknown as SessionCache;
    const session = new Session(cache);
    expect(await session.resume()).toBe(true);
    if (operation === "verification")
      vi.mocked(cache.verify).mockImplementationOnce(async () => {
        entered.release();
        await held.wait;
        return cached;
      });
    const pending =
      operation === "verification"
        ? session.validate()
        : (session.touch(), Promise.resolve());
    await entered.wait;
    const newer = {
      ...cached,
      timeout: 60_000,
      expires: cached.checkedAt + 60_000,
    };
    cache.onstate({ epoch: cached.epoch, source: "other-view", unlock: newer });
    held.release();
    await pending;
    await vi.waitFor(() => expect(session.timeout).toBe(60_000));
    if (operation === "activity")
      expect(cache.touch).toHaveBeenCalledWith(cached.epoch);
    vi.spyOn(Date, "now").mockReturnValue(newer.expires + 1);
    expect(() => session.check()).toThrow("Unlock");
    expect(session.unlocked).toBe(false);
  },
);
