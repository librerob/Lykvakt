import { checkQRFile, QR_DECODE_TIMEOUT } from "./qr-policy";
const unavailable = () =>
  new Error("QR reading could not start. Reload this extension and try again.");
export async function readQRs(
  file: Blob,
  signal?: AbortSignal,
): Promise<string[]> {
  signal?.throwIfAborted();
  checkQRFile(file);
  if (typeof Worker === "undefined") throw unavailable();
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./qr.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      reject(unavailable());
      return;
    }
    let settled = false;
    const deadline = performance.now() + QR_DECODE_TIMEOUT;
    const timeoutError = () =>
      new Error("QR reading took too long. Try a smaller, cropped image.");
    const finish = (values?: string[], error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else resolve(values!);
    };
    const abort = () =>
      finish(
        undefined,
        new DOMException("QR reading was cancelled.", "AbortError"),
      );
    const timer = setTimeout(
      () => finish(undefined, timeoutError()),
      QR_DECODE_TIMEOUT,
    );
    worker.onmessage = (
      event: MessageEvent<{ values?: string[]; error?: string }>,
    ) => {
      if (signal?.aborted) {
        abort();
        return;
      }
      if (performance.now() >= deadline) {
        finish(undefined, timeoutError());
        return;
      }
      const { values, error } = event.data ?? {};
      if (
        Array.isArray(values) &&
        values.length > 0 &&
        values.length <= 20 &&
        values.every(
          (value) => typeof value === "string" && value.length <= 64_000,
        )
      )
        finish(values);
      else
        finish(
          undefined,
          new Error(
            typeof error === "string"
              ? error
              : "No readable QR code found. Try a cropped QR image.",
          ),
        );
    };
    worker.onerror = () => finish(undefined, unavailable());
    worker.onmessageerror = () => finish(undefined, unavailable());
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage(file);
    } catch {
      finish(undefined, unavailable());
    }
  });
}
export async function readQR(file: File): Promise<string> {
  const values = await readQRs(file);
  if (values.length !== 1) throw new Error("Expected one QR code.");
  return values[0]!;
}
