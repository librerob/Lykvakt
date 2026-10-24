import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  codeFor,
  decodeBase32,
  encodeBase32,
  hotp,
  normalizeSecret,
} from "../src/otp";
import { parseURI, toURI, parseImport, previewImport } from "../src/import";
import { validateAccount } from "../src/model";

const secret = encodeBase32(new TextEncoder().encode("12345678901234567890"));
const account = parseURI(
  `otpauth://totp/Example:alice?secret=${secret}&issuer=Example`,
);
describe("RFC 4226 appendix D", () => {
  const expected = [
    "755224",
    "287082",
    "359152",
    "969429",
    "338314",
    "254676",
    "287922",
    "162583",
    "399871",
    "520489",
  ];
  it.each(expected.map((code, i) => [i, code] as const))(
    "counter %i",
    async (counter, expected) =>
      expect(await hotp(secret, BigInt(counter))).toBe(expected),
  );
});
describe("RFC 6238 appendix B", () => {
  const times = [
    59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000,
  ];
  const vectors = {
    "SHA-1": [
      "94287082",
      "07081804",
      "14050471",
      "89005924",
      "69279037",
      "65353130",
    ],
    "SHA-256": [
      "46119246",
      "68084774",
      "67062674",
      "91819424",
      "90698825",
      "77737706",
    ],
    "SHA-512": [
      "90693936",
      "25091201",
      "99943326",
      "93441116",
      "38618901",
      "47863826",
    ],
  } as const;
  for (const [algorithm, results] of Object.entries(vectors)) {
    const source = "1234567890"
      .repeat(7)
      .slice(0, { "SHA-1": 20, "SHA-256": 32, "SHA-512": 64 }[algorithm]!);
    it.each(times.map((t, i) => [t, results[i]]))(
      `${algorithm} at %i`,
      async (seconds, expected) => {
        expect(
          await codeFor(
            {
              ...account,
              secret: encodeBase32(new TextEncoder().encode(source)),
              algorithm: algorithm as typeof account.algorithm,
              digits: 8,
            },
            Number(seconds) * 1000,
          ),
        ).toBe(expected);
      },
    );
  }
});
it("matches independent node HMAC across periods and hashes", async () => {
  for (const algorithm of ["SHA-1", "SHA-256", "SHA-512"] as const)
    for (const period of [15, 30, 45, 60])
      for (const seconds of [0, period - 1, period, period + 1, 1234567890]) {
        const counter = BigInt(Math.floor(seconds / period));
        const message = Buffer.alloc(8);
        message.writeBigUInt64BE(counter);
        const digest = createHmac(
          algorithm.toLowerCase().replace("-", ""),
          Buffer.from(decodeBase32(secret)),
        )
          .update(message)
          .digest();
        const offset = digest.at(-1)! & 15;
        const code = ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)
          .toString()
          .padStart(6, "0");
        expect(
          await codeFor({ ...account, algorithm, period }, seconds * 1000),
        ).toBe(code);
      }
});
it("does not advance HOTP during generation", async () => {
  const a = {
    ...account,
    type: "hotp" as const,
    counter: "18446744073709551615",
  };
  expect(await codeFor(a)).toBe(await hotp(secret, 0xffffffffffffffffn));
  expect(a.counter).toBe("18446744073709551615");
  await expect(hotp(secret, 0x10000000000000000n)).rejects.toThrow();
  await expect(hotp(secret, -1n)).rejects.toThrow();
});
describe("strict Base32", () => {
  it("normalizes case and spacing and round-trips bytes", () => {
    expect(
      normalizeSecret(
        secret
          .toLowerCase()
          .match(/.{1,4}/g)!
          .join(" "),
      ),
    ).toBe(secret);
    for (let n = 10; n < 70; n++) {
      const bytes = crypto.getRandomValues(new Uint8Array(n));
      expect(decodeBase32(encodeBase32(bytes))).toEqual(bytes);
    }
  });
  it.each([
    "",
    "ABC",
    "0000000000000000",
    "ABCDEFGHIJKLMNOPQ",
    "JBSWY3DPEHPK3PXP=",
    "JBSWY3DPEHPK3PX!",
    "JBSWY3DPEHPK3PX😃",
  ])("rejects malformed secret %s", (s) =>
    expect(() => normalizeSecret(s)).toThrow(),
  );
  it("rejects nonzero pad bits", () =>
    expect(() => normalizeSecret("AAAAAAAAAAAAAAAABB")).toThrow());
});
describe("URI boundary", () => {
  it("round-trips exact OTP properties", () => {
    const a = {
      ...account,
      type: "hotp" as const,
      counter: "9007199254740993",
      digits: 8 as const,
      algorithm: "SHA-512" as const,
    };
    expect({ ...parseURI(toURI(a)), id: a.id }).toEqual(a);
  });
  it.each([
    `https://example.com/?secret=${secret}`,
    `otpauth://steam/a?secret=${secret}`,
    `otpauth://hotp/a?secret=${secret}`,
    `otpauth://totp/A:a?issuer=B&secret=${secret}`,
    `otpauth://totp/a?secret=${secret}&digits=7`,
    `otpauth://totp/a?secret=${secret}&digits=06`,
    `otpauth://totp/a?secret=${secret}&algorithm=MD5`,
    `otpauth://totp/a?secret=${secret}&period=0`,
    `otpauth://totp/a?secret=${secret}&secret=${secret}`,
    `otpauth://totp/a?secret=${secret}&unknown=x`,
    `otpauth://totp/a?secret=${secret}&counter=1`,
    `otpauth://totp/a?secret=${secret}#ignored`,
    `otpauth://user@totp/a?secret=${secret}`,
    `otpauth://totp/%GG?secret=${secret}`,
  ])("rejects unsafe URI %#", (uri) => expect(() => parseURI(uri)).toThrow());
});
describe("import safety", () => {
  it("distinguishes duplicates from metadata/counter conflicts", () => {
    expect(previewImport([account], [account])).toMatchObject({
      duplicates: 1,
      conflicts: 0,
      accounts: [],
    });
    expect(
      previewImport([{ ...account, algorithm: "SHA-512" }], [account]),
    ).toMatchObject({ duplicates: 0, conflicts: 1, accounts: [] });
    expect(
      previewImport([{ ...account, label: "different" }], [account]).conflicts,
    ).toBe(1);
  });
  it("reports a bad line while retaining a valid account", () => {
    const result = parseImport(toURI(account) + "\ninvalid", "uri");
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]).toMatchObject({
      ...account,
      id: expect.any(String),
    });
    expect(result.skipped).toEqual([{ index: 2, reason: expect.any(String) }]);
  });
  it("reads documented unencrypted Aegis fields", () => {
    const result = parseImport(
      JSON.stringify({
        version: 1,
        header: {},
        db: {
          version: 3,
          entries: [
            {
              type: "hotp",
              issuer: "Aegis test",
              name: "user",
              info: { secret, algo: "SHA256", digits: 8, counter: 12 },
            },
          ],
        },
      }),
      "aegis",
    );
    expect(result.accounts[0]).toMatchObject({
      issuer: "Aegis test",
      type: "hotp",
      algorithm: "SHA-256",
      digits: 8,
      counter: "12",
    });
  });
  it("reads documented unencrypted 2FAS fields", () => {
    const result = parseImport(
      JSON.stringify({
        schemaVersion: 4,
        services: [
          {
            name: "2FAS test",
            secret,
            otp: {
              tokenType: "TOTP",
              account: "user",
              algorithm: "SHA1",
              digits: 6,
              period: 30,
            },
          },
        ],
      }),
      "2fas",
    );
    expect(result.accounts[0]).toMatchObject({
      label: "user",
      algorithm: "SHA-1",
      period: 30,
    });
  });
  it("rejects unsafe JSON counters and proprietary variants", () => {
    expect(() =>
      validateAccount({ ...account, counter: "18446744073709551616" }),
    ).toThrow();
    expect(() =>
      parseImport(
        JSON.stringify({
          version: 1,
          header: {},
          db: {
            version: 3,
            entries: [
              {
                type: "steam",
                issuer: "Steam",
                name: "user",
                info: { secret, algo: "SHA1", digits: 5 },
              },
            ],
          },
        }),
        "aegis",
      ),
    ).toThrow();
  });
});
