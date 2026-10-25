import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { argon2Key } from "../src/kdf";
import { DEFAULT_KDF } from "../src/kdf-policy";
import { Session } from "../src/session";
import * as storage from "../src/storage";
import { passwordVault } from "./helpers/vault";
class FakeWorker {
  static jobs: FakeWorker[] = [];
  static started: (() => void) | undefined;
  onmessage?: (event: { data: { key: CryptoKey } }) => void;
  onerror?: () => void;
  request?: {
    password: Uint8Array;
    salt: Uint8Array;
    policy: unknown;
  };
  terminate = vi.fn();
  constructor(
    public url: URL,
    public options: WorkerOptions,
  ) {
    FakeWorker.jobs.push(this);
  }
  postMessage(request: FakeWorker["request"]) {
    this.request = request;
    FakeWorker.started?.();
  }
}
beforeEach(() => {
  FakeWorker.jobs = [];
  FakeWorker.started = undefined;
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("worker derivation returns only a non-extractable AES key and terminates its one-job worker", async () => {
  const controller = new AbortController();
  const pending = argon2Key(
    new Uint8Array(32).fill(1),
    new Uint8Array(32).fill(2),
    DEFAULT_KDF,
    controller.signal,
  );
  const job = FakeWorker.jobs[0]!;
  expect(job.options.type).toBe("module");
  expect(job.url.pathname).toMatch(/argon2\.worker\.ts$/);
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(32),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
  job.onmessage!({ data: { key } });
  expect(await pending).toBe(key);
  expect(job.terminate).toHaveBeenCalledTimes(1);
  controller.abort();
  expect(job.terminate).toHaveBeenCalledTimes(1);
});
it("abort terminates an in-flight derivation rather than returning a late key", async () => {
  const controller = new AbortController();
  const pending = argon2Key(
    new Uint8Array(32),
    new Uint8Array(32),
    DEFAULT_KDF,
    controller.signal,
  );
  const rejected = expect(pending).rejects.toThrow(/cancelled/);
  controller.abort();
  await rejected;
  expect(FakeWorker.jobs[0]!.terminate).toHaveBeenCalledTimes(1);
});
it("locking during an Argon2id password derivation cancels unlock and wipes the sent input", async () => {
  const password = "synthetic worker cancellation password";
  vi.stubGlobal("Worker", undefined);
  const old = await passwordVault(password);
  vi.stubGlobal("Worker", FakeWorker);
  await storage.commit(old);
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    started = resolve;
  });
  FakeWorker.started = started;
  const session = new Session();
  const pending = session.unlock(password);
  const rejected = expect(pending).rejects.toThrow(/cancelled|aborted/i);
  await gate;
  const job = FakeWorker.jobs[0]!;
  session.lock();
  await rejected;
  expect(job.terminate).toHaveBeenCalledTimes(1);
  expect([...job.request!.password].every((x) => x === 0)).toBe(true);
  expect(session.unlocked).toBe(false);
  expect(await storage.load()).toEqual(old);
}, 60_000);
