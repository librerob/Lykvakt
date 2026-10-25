import { deriveKeyHere } from "./kdf-engine";
import type { Argon2Policy } from "./kdf-policy";
interface Request {
  password: Uint8Array<ArrayBuffer>;
  salt: Uint8Array<ArrayBuffer>;
  policy: Argon2Policy;
}
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: { key: CryptoKey } | { error: string }): void;
  close(): void;
};
worker.onmessage = (event) => {
  worker.onmessage = null;
  const { password, salt, policy } = event.data;
  void (async () => {
    try {
      const key = await deriveKeyHere(password, salt, policy, undefined, true);
      // Only a non-extractable key leaves this worker, never the derived raw bytes.
      worker.postMessage({ key });
    } catch (error) {
      worker.postMessage({
        error:
          error instanceof Error
            ? error.message
            : "Password protection failed.",
      });
    } finally {
      password?.fill(0);
      salt?.fill(0);
      worker.close();
    }
  })();
};
