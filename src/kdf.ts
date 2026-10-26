import { validateArgon2, type Argon2Policy } from "./kdf-policy";
type KdfRunner = (
  password: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  policy: Argon2Policy,
  signal?: AbortSignal,
) => Promise<CryptoKey>;
// Tests and benchmarks inject a runner; the extension uses the worker.
let nodeRunner: KdfRunner | undefined;
export function setKdfRunner(runner?: KdfRunner): void {
  nodeRunner = runner;
}
const startError = () =>
  new Error(
    "Password protection could not start. Reload this extension and try again.",
  );
export async function argon2Key(
  password: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  policy: Argon2Policy,
  signal?: AbortSignal,
): Promise<CryptoKey> {
  const checked = validateArgon2(policy);
  signal?.throwIfAborted();
  if (typeof Worker === "undefined") {
    if (nodeRunner) return nodeRunner(password, salt, checked, signal);
    throw startError();
  }
  return new Promise<CryptoKey>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./argon2.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      signal?.throwIfAborted();
      reject(startError());
      return;
    }
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      finish();
      reject(
        new DOMException(
          "Password protection was cancelled by locking.",
          "AbortError",
        ),
      );
    };
    worker.onmessage = (
      event: MessageEvent<{ key?: CryptoKey; error?: string }>,
    ) => {
      finish();
      if (signal?.aborted) {
        reject(
          new DOMException(
            "Password protection was cancelled by locking.",
            "AbortError",
          ),
        );
      } else if (
        event.data.key &&
        !event.data.key.extractable &&
        event.data.key.algorithm.name === "AES-GCM"
      ) {
        resolve(event.data.key);
      } else {
        reject(
          new Error(
            event.data.error ||
              "Password protection could not finish. Try again.",
          ),
        );
      }
    };
    worker.onerror = () => {
      finish();
      reject(startError());
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      // Structured clone gives the worker its own wipeable password/salt buffers.
      worker.postMessage({ password, salt, policy: checked });
    } catch {
      finish();
      reject(
        signal?.aborted
          ? new DOMException(
              "Password protection was cancelled by locking.",
              "AbortError",
            )
          : startError(),
      );
    }
  });
}
