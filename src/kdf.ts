import {
  calibratedPolicy,
  validateArgon2,
  type Argon2Policy,
} from "./kdf-policy";
export async function argon2Key(
  password: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  policy: Argon2Policy,
  signal?: AbortSignal,
  calibration = false,
): Promise<CryptoKey> {
  const checked = validateArgon2(policy, calibration);
  signal?.throwIfAborted();
  if (typeof Worker === "undefined") {
    const { deriveKeyHere } = await import("./kdf-engine");
    return deriveKeyHere(password, salt, checked, signal, calibration);
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
      worker.postMessage({ password, salt, policy: checked, calibration });
    } catch (error) {
      finish();
      reject(error);
    }
  });
}
export async function calibrateProtection(
  memory = 65_536,
  signal?: AbortSignal,
  clock: () => number = () => performance.now(),
  derive: typeof argon2Key = argon2Key,
): Promise<{ policy: Argon2Policy; measuredMs: number; estimatedMs: number }> {
  // This internal one-pass probe is never accepted as a stored password slot.
  if (![65_536, 131_072, 262_144].includes(memory))
    throw new Error("Choose one of the listed memory settings.");
  const password = crypto.getRandomValues(new Uint8Array(32));
  const salt = crypto.getRandomValues(new Uint8Array(32));
  try {
    signal?.throwIfAborted();
    const start = clock();
    await derive(
      password,
      salt,
      { kdf: "Argon2id", m: memory, t: 1, p: 1 },
      signal,
      true,
    );
    signal?.throwIfAborted();
    const measuredMs = clock() - start;
    const policy = calibratedPolicy(memory, measuredMs);
    return { policy, measuredMs, estimatedMs: measuredMs * policy.t };
  } finally {
    password.fill(0);
    salt.fill(0);
  }
}
