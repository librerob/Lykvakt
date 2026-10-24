import { it, expect, vi } from "vitest";
import { canonical, snapshot } from "../src/crypto";
import { emptyVault } from "../src/model";
import { parseURI } from "../src/import";
const header = {
  version: 1,
  revision: 7,
  password: {
    wrapped: "wrapped",
    salt: "salt",
    kdf: "PBKDF2-SHA256",
    iv: "iv",
    iterations: 600000,
  },
  passkeys: [],
  kind: "vault",
  id: "sample-vault",
  format: "otp-vault",
};
it("pins the exact canonical bytes of an existing ASCII header", () => {
  expect(canonical(header)).toBe(
    '{"format":"otp-vault","id":"sample-vault","kind":"vault","passkeys":[],"password":{"iterations":600000,"iv":"iv","kdf":"PBKDF2-SHA256","salt":"salt","wrapped":"wrapped"},"revision":7,"version":1}',
  );
});
it("canonical ordering uses code units even for Unicode and punctuation", () => {
  expect(canonical({ z: 1, ä: 2, A: 3, a: 4, _: 5 })).toBe(
    '{"A":3,"_":5,"a":4,"z":1,"ä":2}',
  );
});
it("canonical headers and snapshots never consult localeCompare", async () => {
  const a = parseURI("otpauth://totp/Synthetic:user?secret=JBSWY3DPEHPK3PXP");
  const data = {
    ...emptyVault(),
    accounts: [
      { ...a, id: "z" },
      { ...a, id: "ä" },
      { ...a, id: "A" },
    ],
  };
  const before = await snapshot(data);
  const locale = vi
    .spyOn(String.prototype, "localeCompare")
    .mockImplementation(() => {
      throw new Error("locale-dependent ordering");
    });
  try {
    expect(canonical(header)).toContain('"format":"otp-vault"');
    expect(await snapshot(data)).toBe(before);
  } finally {
    locale.mockRestore();
  }
});
