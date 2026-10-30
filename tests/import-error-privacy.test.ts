import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseURI } from "../src/import";
import { parseMigration } from "../src/migration";
import { parseBitwarden, parseProton } from "../src/import-formats";
import { friendlyError } from "../src/help";
const NativeURL = globalThis.URL;
const secret = "JBSWY3DPEHPK3PXP",
  bad = "otpauth://[PRIVATE_SETUP_MARKER]/test?secret=" + secret,
  good = "otpauth://totp/Synthetic:test?secret=" + secret;
beforeEach(() => {
  vi.stubGlobal(
    "URL",
    class extends NativeURL {
      constructor(input: string | URL, base?: string | URL) {
        try {
          super(input, base);
        } catch {
          throw new TypeError(
            "URL constructor: " + input + " is not a valid URL.",
          );
        }
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
function caught(action: () => unknown): Error {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    return error as Error;
  }
  throw new Error("Expected invalid input to be rejected.");
}
function safe(error: Error) {
  const shown = friendlyError(error);
  expect(shown.message + shown.technical).not.toMatch(
    /PRIVATE_SETUP_MARKER|JBSWY3DPEHPK3PXP|otpauth:/,
  );
}
it("OTP URL-constructor failures never expose the rejected link", () => {
  const error = caught(() => parseURI(bad));
  expect(error.message).toBe("Invalid OTP URI.");
  safe(error);
});
it("Google transfer URL-constructor failures never expose the rejected payload", () => {
  const error = caught(() =>
    parseMigration(
      "otpauth-migration://[PRIVATE_SETUP_MARKER]/?data=" + secret,
    ),
  );
  expect(error.message).toBe("Invalid Google transfer URI.");
  safe(error);
});
function parse(kind: string, links: string[]) {
  return kind === "bitwarden"
    ? parseBitwarden({
        encrypted: false,
        items: links.map((totp) => ({
          type: 1,
          name: "Synthetic",
          login: { totp },
        })),
      })
    : parseProton({
        version: 1,
        entries: links.map((uri) => ({ content: { entry_type: "Totp", uri } })),
      });
}
it.each(["bitwarden", "proton"])(
  "%s all-invalid imports show a secret-free reason",
  (kind) => {
    const error = caught(() => parse(kind, [bad]));
    safe(error);
    expect(friendlyError(error).message).toContain(
      "Account 1: Invalid OTP URI.",
    );
  },
);
it.each(["bitwarden", "proton"])(
  "%s mixed imports preserve the valid account and a secret-free skipped reason",
  (kind) => {
    const result = parse(kind, [bad, good]);
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]!.label).toBe("test");
    expect(result.skipped).toEqual([{ index: 1, reason: "Invalid OTP URI." }]);
    expect(JSON.stringify(result.skipped)).not.toContain(secret);
  },
);
