import { expect, it } from "vitest";
import { parseURI, parseImport, type ImportResult } from "../src/import";
import { parseMigration, type Transfer } from "../src/migration";
import { validateEnvelope } from "../src/crypto";
import { validateAccount, type Account } from "../src/model";
import archive from "./fixtures/v1-backup.json";

// xorshift32: deterministic mutation choices; never used by production code.
function seeded(seed: number) {
  let state = seed >>> 0;
  return (bound: number) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % bound;
  };
}
const uri = "otpauth://totp/Fuzz:user?secret=JBSWY3DPEHPK3PXP&issuer=Fuzz";
const aegis = JSON.stringify({
  version: 1,
  header: null,
  db: {
    version: 3,
    entries: [
      {
        type: "totp",
        issuer: "Fuzz",
        name: "user",
        info: {
          secret: "JBSWY3DPEHPK3PXP",
          algo: "SHA1",
          digits: 6,
          period: 30,
        },
      },
    ],
  },
});
const twofas = JSON.stringify({
  schemaVersion: 4,
  services: [
    {
      name: "Fuzz",
      secret: "JBSWY3DPEHPK3PXP",
      otp: {
        issuer: "Fuzz",
        account: "user",
        tokenType: "TOTP",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
      },
    },
  ],
});
const migration =
  "otpauth-migration://offline?data=Cj4KFDEyMzQ1Njc4OTAxMjM0NTY3ODkwEhhHaXRIdWI6ZGVtb0BleGFtcGxlLnRlc3QaBkdpdEh1YiABKAEwAhABGAIgACh7";
const argonArchive = {
  ...archive,
  password: {
    kdf: "Argon2id",
    m: 65_536,
    t: 3,
    p: 1,
    salt: archive.password.salt,
    iv: archive.password.iv,
    wrapped: archive.password.wrapped,
  },
};
const odd = ["\u0000", "\ud800", "\udfff", "å\u0301", "\u202e", "😀", "\n"];
const cases = [
  {
    name: "parseURI",
    seed: uri,
    parse: (s: string) => parseURI(s),
    kind: "account",
  },
  {
    name: "parseImport/uri",
    seed: uri,
    parse: (s: string) => parseImport(s, "uri"),
    kind: "import",
  },
  {
    name: "parseImport/aegis",
    seed: aegis,
    parse: (s: string) => parseImport(s, "aegis"),
    kind: "import",
  },
  {
    name: "parseImport/2fas",
    seed: twofas,
    parse: (s: string) => parseImport(s, "2fas"),
    kind: "import",
  },
  {
    name: "parseMigration",
    seed: migration,
    parse: (s: string) => parseMigration(s),
    kind: "transfer",
  },
  {
    name: "validateEnvelope",
    seed: JSON.stringify(archive),
    parse: (s: string) => {
      let input: unknown = s;
      try {
        input = JSON.parse(s);
      } catch {
        /* Still call the validator for malformed JSON strings. */
      }
      return validateEnvelope(input);
    },
    kind: "envelope",
  },
  {
    name: "validateEnvelope/Argon2id",
    seed: JSON.stringify(argonArchive),
    parse: (s: string) => {
      let input: unknown = s;
      try {
        input = JSON.parse(s);
      } catch {
        /* Still validate malformed input. */
      }
      return validateEnvelope(input);
    },
    kind: "envelope",
  },
];
function candidate(
  s: string,
  i: number,
  random: (n: number) => number,
): string {
  const at = random(s.length + 1);
  switch (i % 10) {
    case 0: {
      const bytes = new TextEncoder().encode(s);
      const position = random(bytes.length);
      bytes[position] = bytes[position]! ^ (1 << random(8));
      return new TextDecoder().decode(bytes);
    }
    case 1:
      return s.slice(0, at);
    case 2:
      return s.startsWith("{")
        ? s.replace(/("[^"]+":)([^,}]+)/, "$1$2,$1$2")
        : s +
            (s.startsWith("otpauth-migration:")
              ? "&data=AA=="
              : "&secret=JBSWY3DPEHPK3PXP");
    case 3: {
      // Huge declared lengths are cheap; real oversized text is also exercised.
      const length =
        i % 500 === 3 ? 8_000_001 : [1024, 65_536, 10_000][random(3)]!;
      return s.slice(0, at) + "9".repeat(length) + s.slice(at);
    }
    case 4: {
      const depth = 1000 + random(1000);
      const nested = "[".repeat(depth) + "0" + "]".repeat(depth);
      return s.startsWith("{")
        ? s.replace(/"(info|otp|password)":\{[^}]*\}/, '"$1":' + nested)
        : s + nested;
    }
    case 5:
      return s.slice(0, at) + odd[random(odd.length)]! + s.slice(at);
    case 6:
      return s.startsWith("{")
        ? s.replace(
            /"(version|schemaVersion|iterations|m|t|p|digits|period)":\d+/g,
            '"$1":' +
              ["-1", "1e999", "9007199254740993", "null", "[]"][random(5)],
          )
        : s +
            "&digits=" +
            ["0", "9999999999999999999", "%00", "NaN", "8"][random(5)];
    case 7: {
      if (s.startsWith("otpauth-migration:")) {
        const u = new URL(s),
          bytes = Uint8Array.from(atob(u.searchParams.get("data")!), (c) =>
            c.charCodeAt(0),
          );
        const position = random(bytes.length);
        bytes[position] = random(256);
        const content =
          i % 30 === 7
            ? new Uint8Array([10, 255, 255, 255, 255, 15])
            : i % 20 === 7
              ? bytes.slice(0, position)
              : bytes;
        u.searchParams.set("data", btoa(String.fromCharCode(...content)));
        return u.href;
      }
      return s.startsWith("{")
        ? s.replace(/"(entries|services)":\[/, '"$1":[null,')
        : s + "\ninvalid";
    }
    case 8:
      return s.startsWith("{")
        ? '{"__proto__":{"polluted":true},' + s.slice(1)
        : s.replace("user", "%ED%A0%80");
    default:
      return s.startsWith("{") ? " \n" + s + "\t " : " " + s + " ";
  }
}
function mutate(s: string, i: number, random: (n: number) => number): string {
  const result = candidate(s, i, random);
  // Every iteration changes its source, including formats without a selected field.
  return result === s ? s + " " : result;
}
const PER_CALL_MS = 250;
it.each(cases)(
  "$name tolerates 5000 seeded mutations within a per-call budget",
  ({ name, seed, parse, kind }) => {
    const random = seeded(0x51afe123);
    let accepted = 0,
      rejected = 0,
      maximum = 0;
    for (let i = 0; i < 5000; i++) {
      const input = mutate(seed, i, random);
      let result: ReturnType<typeof parse> | undefined,
        threw = false,
        error: unknown;
      const start = performance.now();
      try {
        result = parse(input);
      } catch (caught) {
        threw = true;
        error = caught;
      }
      const elapsed = performance.now() - start;
      maximum = Math.max(maximum, elapsed);
      if (elapsed >= PER_CALL_MS)
        throw new Error(
          `${name}: mutation ${i} exceeded ${PER_CALL_MS} ms (${elapsed} ms)`,
        );
      if (threw) {
        if (!(error instanceof Error))
          throw new Error(`${name}: mutation ${i} threw a non-Error`, {
            cause: error,
          });
        rejected++;
        continue;
      }
      accepted++;
      if (kind === "envelope") expect(validateEnvelope(result)).toEqual(result);
      else {
        const accounts =
          kind === "account"
            ? [result as Account]
            : (result as ImportResult | Transfer).accounts;
        expect(accounts.length).toBeGreaterThan(0);
        for (const account of accounts)
          expect(validateAccount(account)).toEqual(account);
        if (kind !== "account")
          for (const skipped of (result as ImportResult).skipped) {
            expect(
              Number.isSafeInteger(skipped.index) && skipped.index >= 1,
            ).toBe(true);
            expect(
              typeof skipped.reason === "string" && skipped.reason.length > 0,
            ).toBe(true);
          }
      }
    }
    expect(accepted + rejected).toBe(5000);
    expect(accepted).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
    console.log(
      `${name}: 5000 mutations, ${accepted} accepted, ${rejected} rejected, max ${maximum.toFixed(1)} ms (budget ${PER_CALL_MS} ms)`,
    );
  },
  30_000,
);
