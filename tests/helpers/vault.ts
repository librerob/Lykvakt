import {
  MIN_ITERATIONS,
  importVaultKey,
  makePasswordSlot,
  random,
  seal,
} from "../../src/crypto";
import { emptyVault } from "../../src/model";

// Pin old-vault fixtures independently of the changing new-slot default.
export async function passwordVault(
  password: string,
  iterations = MIN_ITERATIONS,
) {
  const raw = random(32),
    id = crypto.randomUUID();
  try {
    const slot = await makePasswordSlot(raw, password, id, "vault", iterations);
    const key = await importVaultKey(raw);
    return await seal(
      {
        format: "otp-vault",
        version: 1,
        kind: "vault",
        id,
        revision: 0,
        password: slot,
        passkeys: [],
      },
      key,
      emptyVault(),
    );
  } finally {
    raw.fill(0);
  }
}
