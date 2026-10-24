import { expect, it } from "vitest";
import { needsBackup } from "../src/ui/recovery";
import { emptyVault } from "../src/model";
import { parseURI } from "../src/import";
import { snapshot } from "../src/crypto";
function fixture() {
  const data = emptyVault();
  data.accounts.push(
    parseURI("otpauth://hotp/Test:user?secret=JBSWY3DPEHPK3PXP&counter=0"),
  );
  return data;
}
it("reminds until a backup has actually been verified", async () => {
  const data = fixture();
  expect(await needsBackup(data)).toBe(true);
  data.verifiedSnapshot = await snapshot(data);
  expect(await needsBackup(data)).toBe(true);
  data.verifiedAt = new Date().toISOString();
  expect(await needsBackup(data)).toBe(false);
});
it("HOTP counter advances invalidate a verified backup snapshot", async () => {
  const data = fixture();
  data.verifiedAt = new Date().toISOString();
  data.verifiedSnapshot = await snapshot(data);
  data.accounts[0]!.counter = "1";
  expect(await needsBackup(data)).toBe(true);
});
it("account changes invalidate verification but changes to verification metadata do not", async () => {
  const data = fixture();
  data.verifiedAt = "2026-10-24T00:00:00.000Z";
  data.verifiedSnapshot = await snapshot(data);
  data.verifiedAt = "2026-10-25T00:00:00.000Z";
  expect(await needsBackup(data)).toBe(false);
  data.accounts[0]!.favorite = true;
  expect(await needsBackup(data)).toBe(true);
});
