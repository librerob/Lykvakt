import { expect, it } from "vitest";
import { normalizeSecret } from "../src/otp";
import { parseImport } from "../src/import";
import { friendlyError } from "../src/help";
const link = "otpauth://totp/2FAS:test?secret=2FASTEST&issuer=2FAS";
function failure(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the short demonstration key to be rejected.");
}
it("explains the minimum setup-key length for manual entry without blaming the password", () => {
  const error = failure(() => normalizeSecret("2FASTEST"));
  const shown = friendlyError(error);
  expect(shown.message).toContain("10 to 640 bytes");
  expect(shown.message).toContain("demonstration keys");
  expect(shown.message).not.toMatch(/password|2FASTEST/);
});
it("preserves the setup-key explanation when a decoded QR contains no importable accounts", () => {
  const error = failure(() => parseImport(link, "uri"));
  const shown = friendlyError(error);
  expect(shown.message).toContain("Account 1:");
  expect(shown.message).toContain("10 to 640 bytes");
  expect(shown.message).toContain("Nothing was imported");
  expect(shown.message + shown.technical).not.toMatch(
    /2FASTEST|otpauth:|test\?/,
  );
});
it("keeps a useful skipped reason alongside a valid account without exposing the rejected key", () => {
  const result = parseImport(
    link +
      "\n" +
      "otpauth://totp/Valid:test?secret=JBSWY3DPEHPK3PXP&issuer=Valid",
    "uri",
  );
  expect(result.accounts).toHaveLength(1);
  expect(result.skipped).toHaveLength(1);
  expect(result.skipped[0]!.index).toBe(1);
  expect(result.skipped[0]!.reason).toContain("10 to 640 bytes");
  expect(JSON.stringify(result.skipped)).not.toContain("2FASTEST");
});
