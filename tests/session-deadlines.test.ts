import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { base64, importVaultKey, random, seal } from "../src/crypto";
import { emptyVault } from "../src/model";
import { Session } from "../src/session";
import {
  envelopeBinding,
  type CachedUnlock,
  type SessionCache,
} from "../src/session-cache";
import * as storage from "../src/storage";
let wall: number, mono: number;
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  wall = Date.now();
  mono = performance.now();
  vi.spyOn(Date, "now").mockImplementation(() => wall);
  vi.spyOn(performance, "now").mockImplementation(() => mono);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function advance(ms: number) {
  wall += ms;
  mono += ms;
}
async function fixture(delay: number, timeout = 300_000) {
  const raw = random(32);
  try {
    const key = await importVaultKey(raw);
    const envelope = await seal(
      {
        format: "otp-vault",
        version: 2,
        kind: "vault",
        id: "deadline-fixture",
        revision: 0,
        password: {
          kdf: "Argon2id",
          m: 65_536,
          t: 3,
          p: 1,
          salt: base64(random(32)),
          iv: base64(random(12)),
          wrapped: base64(random(48)),
        },
      },
      key,
      emptyVault(),
    );
    await storage.commit(envelope);
    const value: CachedUnlock = {
      epoch: "lease",
      key: base64(raw),
      binding: await envelopeBinding(envelope),
      id: envelope.id,
      revision: 0,
      timeout,
      expires: timeout ? wall + timeout : 0,
      touched: wall,
      checkedAt: wall,
    };
    const clear = vi.fn(async () => {});
    const unused = async (): Promise<never> => {
      throw new Error("Unexpected cache operation.");
    };
    const cache: SessionCache = {
      onstate: () => {},
      begin: unused,
      remember: unused,
      resume: async () => ({ ...value }),
      verify: async () => {
        const reply = { ...value };
        advance(delay);
        return reply;
      },
      update: unused,
      touch: unused,
      draft: unused,
      expire: async () => {},
      clear,
    };
    return { session: new Session(cache), cache, value, clear };
  } finally {
    raw.fill(0);
  }
}
it.each([300_000, 300_001])(
  "rejects a timed reply delivered %i ms after verification without publishing local state",
  async (delay) => {
    const { session, clear } = await fixture(delay);
    expect(await session.resume()).toBe(false);
    expect(session.unlocked).toBe(false);
    expect(() => session.accounts()).toThrow("Unlock");
    expect(clear).toHaveBeenCalledWith("lease");
  },
);
it("subtracts delivery time from both local deadline clocks", async () => {
  const { session } = await fixture(120_000);
  expect(await session.resume()).toBe(true);
  advance(180_000);
  expect(() => session.check()).toThrow("Unlock");
  expect(session.unlocked).toBe(false);
});
it("keeps the shortened monotonic deadline when the wall clock later moves backwards", async () => {
  const { session } = await fixture(120_000);
  expect(await session.resume()).toBe(true);
  wall -= 86_400_000;
  mono += 180_001;
  expect(() => session.check()).toThrow("Unlock");
});
it("repeated observations of one expiry never grant a fresh timeout", async () => {
  const { session, cache, value } = await fixture(60_000);
  expect(await session.resume()).toBe(true);
  advance(60_000);
  cache.onstate({
    epoch: value.epoch,
    source: "other-view",
    unlock: { ...value, checkedAt: wall },
  });
  advance(180_000);
  expect(() => session.check()).toThrow("Unlock");
});
it("preserves the explicit browser-session policy separately from an expired timed reply", async () => {
  const { session } = await fixture(86_400_000, 0);
  expect(await session.resume()).toBe(true);
  advance(86_400_000);
  expect(() => session.check()).not.toThrow();
});

it("rejects a clock rollback while a verified response is in flight", async () => {
  const { session } = await fixture(-1);
  expect(await session.resume()).toBe(false);
  expect(session.unlocked).toBe(false);
});
it("an expired storage event detaches without throwing from the browser callback", async () => {
  const { session, cache, value } = await fixture(0);
  expect(await session.resume()).toBe(true);
  advance(300_001);
  expect(() =>
    cache.onstate({ epoch: value.epoch, source: "other", unlock: value }),
  ).not.toThrow();
  expect(session.unlocked).toBe(false);
});
