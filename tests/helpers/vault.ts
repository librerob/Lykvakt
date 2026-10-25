import { createEnvelope } from "../../src/crypto";
import { emptyVault } from "../../src/model";
export async function passwordVault(password: string) {
  return (await createEnvelope(password, emptyVault())).envelope;
}
