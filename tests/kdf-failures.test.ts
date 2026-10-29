import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { argon2Key, KDF_TIMEOUT } from "../src/kdf";
import { DEFAULT_KDF } from "../src/kdf-policy";
import { friendlyError } from "../src/help";
class WorkerFault {
  static latest: WorkerFault;
  onmessage?: (event: { data: { key?: CryptoKey } | null }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  terminate = vi.fn();
  constructor() {
    WorkerFault.latest = this;
  }
  postMessage() {}
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("Worker", WorkerFault);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function derive(signal?: AbortSignal) {
  return argon2Key(new Uint8Array(32), new Uint8Array(32), DEFAULT_KDF, signal);
}
async function key() {
  return crypto.subtle.importKey("raw", new Uint8Array(32), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
it("a worker messageerror rejects with friendly guidance and clears its watchdog", async () => {
  const controller = new AbortController();
  const pending = derive(controller.signal);
  const rejected = expect(pending).rejects.toThrow("could not start");
  WorkerFault.latest.onmessageerror!();
  await rejected;
  controller.abort();
  expect(WorkerFault.latest.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it("a worker that never replies is terminated at the bounded deadline", async () => {
  const pending = derive();
  const rejected = expect(pending).rejects.toThrow("took too long");
  await vi.advanceTimersByTimeAsync(KDF_TIMEOUT);
  await rejected;
  expect(WorkerFault.latest.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it("a late key is rejected even when the browser has delayed the watchdog callback", async () => {
  const value = await key();
  const pending = derive();
  const rejected = expect(pending).rejects.toThrow("took too long");
  vi.spyOn(performance, "now").mockReturnValue(
    performance.now() + KDF_TIMEOUT + 1,
  );
  WorkerFault.latest.onmessage!({ data: { key: value } });
  await rejected;
  expect(WorkerFault.latest.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it("locking wins over a timeout and ignores a late result", async () => {
  const value = await key();
  const controller = new AbortController();
  const pending = derive(controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  controller.abort();
  await vi.advanceTimersByTimeAsync(KDF_TIMEOUT);
  WorkerFault.latest.onmessage!({ data: { key: value } });
  await rejected;
  expect(WorkerFault.latest.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it("a successful derivation clears the watchdog and ignores later worker errors", async () => {
  const value = await key();
  const pending = derive();
  WorkerFault.latest.onmessage!({ data: { key: value } });
  expect(await pending).toBe(value);
  WorkerFault.latest.onmessageerror!();
  expect(WorkerFault.latest.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it("an empty worker response fails without an unhandled message callback exception", async () => {
  const pending = derive();
  const rejected = expect(pending).rejects.toThrow("could not finish");
  expect(() => WorkerFault.latest.onmessage!({ data: null })).not.toThrow();
  await rejected;
  expect(WorkerFault.latest.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it.each([
  "Password protection could not start. Reload this extension and try again.",
  "Password protection took too long. Reload Lykvakt and try again.",
])("the UI preserves the worker's recovery guidance: %s", (message) => {
  expect(friendlyError(new Error(message)).message).toBe(message);
});
