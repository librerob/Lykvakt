import { validateArgon2, type Argon2Policy } from "./kdf-policy";
export async function argon2Key(
  password: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  policy: Argon2Policy,
  signal?: AbortSignal,
): Promise<CryptoKey> {
  const checked = validateArgon2(policy);
  signal?.throwIfAborted();
  if (typeof Worker === "undefined") {
    const { deriveKeyHere } = await import("./kdf-engine");
    return deriveKeyHere(password, salt, checked, signal);
  }
  return new Promise<CryptoKey>((resolve, reject) => {
    const worker = new Worker(new URL("./argon2.worker.ts", import.meta.url), {
      type: "module",
    });
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
      reject(
        new Error(
          "Password protection could not start. Reload this extension and try again.",
        ),
      );
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      // Structured clone gives the worker its own wipeable password/salt buffers.
      worker.postMessage({ password, salt, policy: checked });
    } catch (error) {
      finish();
      reject(error);
    }
  });
}
