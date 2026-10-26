import { expect, it } from "vitest";
import { readImport } from "../src/import-formats";
import { validateAccount } from "../src/model";
import { fixture } from "./helpers/source-exports.mjs";
it.each([
  "andotp.json",
  "bitwarden.json",
  "raivo.json",
  "proton.json",
  "stratum.json",
  "steam.maFile",
  "ente.txt",
  "aegis.json",
  "2fas.json",
])(
  "%s survives 5000 deterministic mutations without returning an invalid account",
  async (name) => {
    let state = 0x39a51e;
    const next = (bound: number) => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) % bound;
    };
    const seed = fixture(name);
    let accepted = 0,
      rejected = 0;
    for (let i = 0; i < 5000; i++) {
      const position = next(seed.length);
      const input =
        i % 5 === 0
          ? seed.slice(0, position)
          : i % 5 === 1
            ? seed.slice(0, position) +
              ["\u0000", "\ud800", "😀", "\u202e"][next(4)] +
              seed.slice(position)
            : i % 5 === 2
              ? seed.slice(0, position) +
                String.fromCharCode(next(128)) +
                seed.slice(position + 1)
              : i % 5 === 3
                ? seed.replace(
                    /"(digits|period|timer|counter|Type|Algorithm)"\s*:\s*[^,}]+/g,
                    '"$1":1e999',
                  )
                : seed + " ";
      const start = performance.now();
      let result: Awaited<ReturnType<typeof readImport>> | undefined;
      try {
        result = await readImport(input);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        rejected++;
      }
      if (result) {
        accepted++;
        for (const a of result.accounts) expect(validateAccount(a)).toEqual(a);
        expect(result.accounts.length).toBeGreaterThan(0);
        expect(result.accounts.length).toBeLessThanOrEqual(2000);
      }
      expect(performance.now() - start).toBeLessThan(250);
    }
    expect(accepted + rejected).toBe(5000);
    expect(accepted).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  },
  30000,
);
