import type { Envelope } from "./crypto";

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
export async function load(): Promise<Envelope | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("vault", "readonly");
      const request = tx.objectStore("vault").get("active");
      tx.oncomplete = () => resolve(request.result as Envelope | undefined);
      tx.onabort = tx.onerror = () =>
        reject(new Error("Vault could not be read."));
    });
  } finally {
    db.close();
  }
}
export async function commit(
  next: Envelope,
  expected?: Envelope,
): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("vault", "readwrite", { durability: "strict" });
      const store = tx.objectStore("vault");
      const request = store.get("active");
      let conflict = false;
      request.onsuccess = () => {
        const old = request.result as Envelope | undefined;
        if (
          expected
            ? !old ||
              old.id !== expected.id ||
              old.revision !== expected.revision
            : old !== undefined
        ) {
          conflict = true;
          tx.abort();
          return;
        }
        store.put(next, "active");
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(
          new Error(
            conflict
              ? "Vault changed in another window. Lock and unlock before retrying."
              : "Save failed. The previous vault is unchanged.",
          ),
        );
    });
  } finally {
    db.close();
  }
}
