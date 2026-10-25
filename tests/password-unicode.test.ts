import { it, expect } from "vitest";
import { createEnvelope, decryptEnvelope, unwrapPassword } from "../src/crypto";
import { emptyVault } from "../src/model";
import legacy from "./fixtures/legacy-unicode-backup.json";
const passphrase = "synthetic å ø é master passphrase";
it.each(["NFC", "NFD"] as const)(
  "new %s slots unwrap the same vault key with both NFC and NFD passphrases",
  async (form) => {
    const { envelope } = await createEnvelope(
      passphrase.normalize(form),
      emptyVault(),
    );
    const nfc = await unwrapPassword(envelope, passphrase.normalize("NFC"));
    let nfd: Uint8Array | undefined;
    try {
      nfd = await unwrapPassword(envelope, passphrase.normalize("NFD"));
      expect(nfd).toEqual(nfc);
      expect(
        (
          await decryptEnvelope(
            envelope,
            passphrase.normalize(form === "NFC" ? "NFD" : "NFC"),
          )
        ).data,
      ).toEqual(emptyVault());
    } finally {
      nfc.fill(0);
      nfd?.fill(0);
    }
  },
  60_000,
);
it("new slots also apply compatibility normalization, not only canonical composition", async () => {
  const { envelope } = await createEnvelope(
    "synthetic Ａ master passphrase",
    emptyVault(),
  );
  expect(
    (await decryptEnvelope(envelope, "synthetic A master passphrase")).data,
  ).toEqual(emptyVault());
}, 60_000);
it("a frozen raw-NFD legacy backup still unlocks with its original passphrase", async () => {
  // Made with untouched source at fe2cc687, before any normalization change.
  const restored = await decryptEnvelope(
    legacy,
    "legacy å ø é master passphrase".normalize("NFD"),
    "backup",
  );
  expect(restored.data).toEqual(emptyVault());
}, 60_000);
