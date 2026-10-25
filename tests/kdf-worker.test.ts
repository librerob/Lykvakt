import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { argon2Key, calibrateProtection } from "../src/kdf";
import { calibratedPolicy, DEFAULT_KDF } from "../src/kdf-policy";
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
    calibration: boolean;
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
  expect(job.request!.calibration).toBe(false);
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
it("locking during a PBKDF2-to-Argon2id worker upgrade cancels unlock and wipes the sent input", async () => {
  const password = "synthetic worker cancellation password";
  const old = await passwordVault(password);
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
it.each([
  [500, 3],
  [400, 3],
  [333, 3],
  [250, 4],
  [100, 10],
  [1, 10],
])("calibration at %s ms clamps the pass count to %s", (elapsed, t) => {
  expect(calibratedPolicy(65_536, elapsed)).toEqual({
    kdf: "Argon2id",
    m: 65_536,
    t,
    p: 1,
  });
});
it.each([0, -1, Infinity, NaN])(
  "calibration rejects unreliable elapsed time %s",
  (elapsed) => {
    expect(() => calibratedPolicy(65_536, elapsed)).toThrow(Error);
  },
);
it("calibration uses one throwaway probe, an injected clock, wipes inputs and returns an unapplied result", async () => {
  const clock = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(210);
  let input!: Uint8Array, salt!: Uint8Array;
  const derive = vi.fn(
    async (
      password: Uint8Array<ArrayBuffer>,
      value: Uint8Array<ArrayBuffer>,
      policy: unknown,
      _signal: AbortSignal | undefined,
      calibration: boolean | undefined,
    ) => {
      input = password;
      salt = value;
      expect(policy).toEqual({ kdf: "Argon2id", m: 65_536, t: 1, p: 1 });
      expect(calibration).toBe(true);
      return crypto.subtle.importKey(
        "raw",
        new Uint8Array(32),
        "AES-GCM",
        false,
        ["encrypt", "decrypt"],
      );
    },
  );
  const commit = vi.spyOn(storage, "commit");
  const result = await calibrateProtection(65_536, undefined, clock, derive);
  expect(result).toEqual({
    policy: { kdf: "Argon2id", m: 65_536, t: 5, p: 1 },
    measuredMs: 200,
    estimatedMs: 1000,
  });
  expect(derive).toHaveBeenCalledTimes(1);
  expect([...input, ...salt].every((x) => x === 0)).toBe(true);
  expect(commit).not.toHaveBeenCalled();
});
it("calibration failure also wipes throwaway password and salt", async () => {
  let inputs: Uint8Array[] = [];
  const derive = vi.fn(
    async (p: Uint8Array<ArrayBuffer>, s: Uint8Array<ArrayBuffer>) => {
      inputs = [p, s];
      throw new Error("synthetic failed probe");
    },
  );
  await expect(
    calibrateProtection(65_536, undefined, () => 0, derive),
  ).rejects.toThrow("failed probe");
  expect(inputs.every((value) => value.every((x) => x === 0))).toBe(true);
});
