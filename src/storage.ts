import { validateEnvelope, type Envelope } from "./crypto";

export interface RecoveryOffer {
  kind: "recovery";
  previous: Envelope;
  active: unknown;
}
export function isRecoveryOffer(
  value: Envelope | RecoveryOffer,
): value is RecoveryOffer {
  return value.kind === "recovery";
}
export class RecoveryRequired extends Error {
  constructor(readonly offer: RecoveryOffer) {
    super(
      `The current vault could not be read. An older copy from revision ${offer.previous.revision} exists. Unlock it to recover?`,
    );
  }
}
// Recovery uses the same active-record identity/revision check as ordinary saves.
export function sameActive(a: unknown, b: unknown): boolean {
  if (a && b && typeof a === "object" && typeof b === "object") {
    const x = a as Partial<Envelope>,
      y = b as Partial<Envelope>;
    return x.id === y.id && x.revision === y.revision;
  }
  return Object.is(a, b);
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("otp-vault", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("vault");
    req.onerror = () =>
      reject(new Error("Local database could not be opened."));
    req.onsuccess = () => resolve(req.result);
    req.onblocked = () =>
      reject(new Error("Close other vault windows and retry."));
  });
}
export async function load(): Promise<Envelope | RecoveryOffer | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("vault", "readonly");
      const store = tx.objectStore("vault");
      const active = store.get("active"),
        previous = store.get("previous");
      tx.oncomplete = () => {
        try {
          if (active.result !== undefined) {
            try {
              resolve(validateEnvelope(active.result, "vault", true));
              return;
            } catch {
              /* Only structural corruption offers recovery, never a bad password. */
            }
          } else if (previous.result === undefined) {
            resolve(undefined);
            return;
          }
          const older = validateEnvelope(previous.result, "vault", true);
          resolve({ kind: "recovery", previous: older, active: active.result });
        } catch {
          reject(
            new Error(
              "The current vault could not be read and no readable older copy exists. Restore an encrypted backup.",
            ),
          );
        }
      };
      tx.onabort = tx.onerror = () =>
        reject(new Error("Vault could not be read."));
    });
  } finally {
    db.close();
  }
}
export async function commit(
  next: Envelope,
  expected?: Envelope | RecoveryOffer,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw new Error("Save cancelled by locking.");
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("Save cancelled by locking."));
        return;
      }
      const tx = db.transaction("vault", "readwrite", { durability: "strict" });
      const store = tx.objectStore("vault");
      const request = store.get("active");
      let conflict = false;
      const abort = () => {
        try {
          tx.abort();
        } catch {
          /* Already past the transaction's abortable phase. */
        }
      };
      signal?.addEventListener("abort", abort, { once: true });
      const cleanup = () => signal?.removeEventListener("abort", abort);
      request.onsuccess = () => {
        if (signal?.aborted) {
          abort();
          return;
        }
        const old: unknown = request.result;
        const recovery =
          expected && isRecoveryOffer(expected) ? expected : undefined;
        if (
          expected
            ? !sameActive(old, recovery ? recovery.active : expected)
            : old !== undefined
        ) {
          conflict = true;
          tx.abort();
          return;
        }
        try {
          // Preserve the stored ciphertext byte-for-byte, in the same transaction.
          // A recovery promotion retains the authenticated older copy, not corrupt active data.
          const previous = recovery ? recovery.previous : old;
          if (previous !== undefined) store.put(previous, "previous");
          store.put(next, "active");
        } catch {
          abort();
        }
      };
      tx.oncomplete = () => {
        cleanup();
        resolve();
      };
      tx.onabort = tx.onerror = () => {
        cleanup();
        reject(
          new Error(
            signal?.aborted
              ? "Save cancelled by locking."
              : conflict
                ? "Vault changed in another window. Lock and unlock before retrying."
                : "Save failed. The previous vault is unchanged.",
          ),
        );
      };
    });
  } finally {
    db.close();
  }
}
