import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { Session } from "../src/session";
import * as cryptoModule from "../src/crypto";
import * as storage from "../src/storage";
function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}
const password = "synthetic session test password";
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function unlocked() {
  const session = new Session();
  await session.setup(password);
  return session;
}
it("idle timeout locks and removes access to keys and account data", async () => {
  const session = await unlocked();
  session.timeout = 1000;
  vi.spyOn(performance, "now").mockReturnValue(performance.now() + 1001);
  expect(() => session.check()).toThrow("Unlock");
  expect(session.unlocked).toBe(false);
  expect(() => session.accounts()).toThrow("Unlock");
  expect(() => session.current()).toThrow("Unlock");
}, 60_000);
it("lock during in-flight password unlock cancels it without resurrecting the session", async () => {
  const session = await unlocked();
  session.lock();
  const started = gate(),
    finish = gate(),
    original = cryptoModule.decryptEnvelope;
  vi.spyOn(cryptoModule, "decryptEnvelope").mockImplementationOnce(
    async (...args) => {
      const result = await original(...args);
      started.release();
      await finish.wait;
      return result;
    },
  );
  const pending = session.unlock(password),
    rejected = expect(pending).rejects.toThrow("cancelled");
  await started.wait;
  session.lock();
  finish.release();
  await rejected;
  expect(session.unlocked).toBe(false);
}, 60_000);
it("lock during in-flight sealing cancels save without changing storage", async () => {
  const session = await unlocked(),
    old = session.current(),
    started = gate(),
    finish = gate(),
    original = cryptoModule.seal;
  vi.spyOn(cryptoModule, "seal").mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    started.release();
    await finish.wait;
    return result;
  });
  const pending = session.save(session.accounts()),
    rejected = expect(pending).rejects.toThrow(/Unlock|cancelled/);
  await started.wait;
  session.lock();
  finish.release();
  await rejected;
  expect(await storage.load()).toEqual(old);
  expect(session.unlocked).toBe(false);
}, 60_000);
it("lock after save reaches storage cancels the pending commit rather than writing it", async () => {
  const session = await unlocked(),
    old = session.current(),
    started = gate(),
    finish = gate(),
    original = storage.commit;
  vi.spyOn(storage, "commit").mockImplementationOnce(async (...args) => {
    started.release();
    await finish.wait;
    return original(...args);
  });
  const pending = session.save(session.accounts()),
    rejected = expect(pending).rejects.toThrow("cancelled");
  await started.wait;
  session.lock();
  finish.release();
  await rejected;
  expect(await storage.load()).toEqual(old);
  expect(session.unlocked).toBe(false);
}, 60_000);
it("concurrent save is rejected while the first save is in flight", async () => {
  const session = await unlocked(),
    old = session.current(),
    started = gate(),
    finish = gate(),
    original = cryptoModule.seal;
  vi.spyOn(cryptoModule, "seal").mockImplementationOnce(async (...args) => {
    started.release();
    await finish.wait;
    return original(...args);
  });
  const first = session.save(session.accounts());
  await started.wait;
  await expect(session.save(session.accounts())).rejects.toThrow(
    "already in progress",
  );
  finish.release();
  await first;
  expect(session.current().revision).toBe(old.revision + 1);
}, 60_000);
it("stale session revision cannot overwrite another window's save", async () => {
  const first = await unlocked(),
    stale = new Session();
  await stale.unlock(password);
  const old = stale.current();
  await first.save(first.accounts());
  await expect(stale.save(stale.accounts())).rejects.toThrow(
    "changed in another window",
  );
  expect(stale.current()).toEqual(old);
  expect(await storage.load()).toEqual(first.current());
}, 60_000);
