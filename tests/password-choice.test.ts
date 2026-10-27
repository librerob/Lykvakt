import { expect, it } from "vitest";
import {
  createEnvelope,
  decryptEnvelope,
  requirePassword,
} from "../src/crypto";
import { DEFAULT_KDF } from "../src/kdf-policy";
import { emptyVault } from "../src/model";

it.each(["x", "short", "a phrase chosen by the user", " "])(
  "allows a non-empty password chosen by the user: %s",
  (value) => expect(() => requirePassword(value)).not.toThrow(),
);
it.each(["", "a".repeat(1025)])(
  "retains empty/oversized password bounds",
  (value) => {
    expect(() => requirePassword(value)).toThrow("password");
  },
);
it("creates and unlocks a one-character password with the full Argon2id defaults", async () => {
  const data = emptyVault();
  const created = await createEnvelope("x", data);
  expect(created.envelope.password).toMatchObject(DEFAULT_KDF);
  const result = await decryptEnvelope(created.envelope, "x", "vault");
  expect(result.data).toEqual(data);
  expect(result.key.extractable).toBe(false);
  await expect(
    decryptEnvelope(created.envelope, "z", "vault"),
  ).rejects.toThrow();
}, 60_000);
