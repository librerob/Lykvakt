import { expect, it } from "vitest";
import {
  detectImport,
  readImport,
  boundedJSON,
  parseBitwarden,
} from "../src/import-formats";
import { validateAccount, MAX_ACCOUNTS, MAX_FILE_BYTES } from "../src/model";
import { fixture } from "./helpers/source-exports.mjs";
const formats = [
  ["andotp.json", "andotp", 1],
  ["bitwarden.json", "bitwarden", 2],
  ["raivo.json", "raivo", 1],
  ["proton.json", "proton", 1],
  ["stratum.json", "stratum", 1],
  ["steam.maFile", "mafile", 1],
  ["aegis.json", "aegis", 2],
  ["2fas.json", "2fas", 1],
  ["ente.txt", "uri", 1],
  ["google-transfer.txt", "uri", 1],
  ["freeotp.txt", "uri", 1],
  ["freeotpplus.txt", "uri", 1],
  ["freeotpplus-steam.txt", "uri", 1],
  ["freeotpplus-hotp.txt", "uri", 1],
] as const;
it.each(formats)(
  "detects and previews the synthetic %s fixture",
  async (name, format, count) => {
    expect(detectImport(fixture(name))).toMatchObject({
      format,
      encrypted: false,
    });
    const result = await readImport(fixture(name));
    expect(result.accounts).toHaveLength(count);
    for (const account of result.accounts)
      expect(validateAccount(account)).toEqual(account);
    expect(result.name.length).toBeGreaterThan(0);
  },
);
it("Bitwarden copies only OTP settings and display names, never unrelated credentials", async () => {
  const source = JSON.parse(fixture("bitwarden.json"));
  for (const row of source.items)
    if (row.login) {
      Object.defineProperty(row.login, "password", {
        get() {
          throw new Error("Must never read password");
        },
      });
      Object.defineProperty(row.login, "username", {
        get() {
          throw new Error("Must never read username");
        },
      });
      Object.defineProperty(row, "notes", {
        get() {
          throw new Error("Must never read notes");
        },
      });
    }
  const result = parseBitwarden(source);
  expect(result.accounts).toHaveLength(2);
  expect(result.skipped).toEqual([{ index: 3, reason: expect.any(String) }]);
  expect(
    JSON.stringify(await readImport(fixture("bitwarden.json"))),
  ).not.toContain("DO_NOT_IMPORT");
});
it.each([
  "andotp.json",
  "raivo.json",
  "proton.json",
  "stratum.json",
  "bitwarden.json",
  "2fas.json",
])("%s reports a bad record without dropping valid records", async (name) => {
  const source = JSON.parse(fixture(name));
  const rows = Array.isArray(source)
    ? source
    : (source.entries ??
      source.Authenticators ??
      source.items ??
      source.services);
  rows.push(null);
  const result = await readImport(JSON.stringify(source));
  expect(result.accounts.length).toBeGreaterThan(0);
  expect(result.skipped.at(-1)).toEqual({
    index: rows.length,
    reason: expect.any(String),
  });
});
it("unknown and encrypted unsupported formats give a plain safe error without source fragments", async () => {
  for (const input of [
    '{"password":"DO_NOT_IMPORT"',
    '{"encrypted":true,"items":[]}',
    '{"unrelated":"secret"}',
    "not an export",
  ]) {
    await expect(readImport(input)).rejects.toThrow(/couldn't recognise/);
    try {
      await readImport(input);
    } catch (error) {
      expect(String(error)).not.toContain("DO_NOT_IMPORT");
    }
  }
});
it("all formats enforce byte, entry-count and nesting limits before doing password work", async () => {
  expect(() => detectImport(" ".repeat(MAX_FILE_BYTES + 1))).toThrow(/8 MB/);
  expect(() =>
    detectImport('"' + "é".repeat(MAX_FILE_BYTES / 2) + '"'),
  ).toThrow(/8 MB/);
  expect(() => boundedJSON("[".repeat(33) + "0" + "]".repeat(33))).toThrow(
    /deeply/,
  );
  for (const name of [
    "andotp.json",
    "bitwarden.json",
    "raivo.json",
    "proton.json",
    "stratum.json",
    "2fas.json",
  ]) {
    const source = JSON.parse(fixture(name));
    const field = source.items
      ? "items"
      : source.entries
        ? "entries"
        : source.Authenticators
          ? "Authenticators"
          : "services";
    const tooMany = Array.from({ length: MAX_ACCOUNTS + 1 }, () => null);
    await expect(
      readImport(
        JSON.stringify(
          Array.isArray(source) ? tooMany : { ...source, [field]: tooMany },
        ),
      ),
    ).rejects.toThrow(/2000|size/);
  }
});
it("FreeOTP presentation metadata is discarded locally and unknown OTP parameters still fail", async () => {
  const uri = fixture("freeotp.txt").trim();
  expect(
    (
      await readImport(
        uri + "&image=https%3A%2F%2Fexample.invalid%2Ficon&lock=true&color=red",
      )
    ).accounts,
  ).toHaveLength(1);
  await expect(readImport(uri + "&algorithm=MD5")).rejects.toThrow(/No valid/);
  await expect(readImport(uri + "&surprise=1")).rejects.toThrow(/No valid/);
});
it("unsupported Proton types are explicit skips and never misrepresented as TOTP", async () => {
  const root = JSON.parse(fixture("proton.json"));
  root.entries.push({
    content: { uri: "steam://NOT_IMPORTED", entry_type: "Steam" },
  });
  const result = await readImport(JSON.stringify(root));
  expect(result.accounts).toHaveLength(1);
  expect(result.skipped[0]).toEqual({
    index: 2,
    reason: expect.stringContaining("Steam"),
  });
});
it("Steam source files ignore trade and session secrets and reject malformed shared secrets", async () => {
  expect(
    JSON.stringify(await readImport(fixture("steam.maFile"))),
  ).not.toContain("DO_NOT_IMPORT");
  for (const shared_secret of ["", "!!!", "MTI=", "A".repeat(1025)]) {
    await expect(
      readImport(JSON.stringify({ shared_secret, account_name: "synthetic" })),
    ).rejects.toThrow();
  }
});

it("documented FreeOTP+ Steam and HOTP links retain their actual code type and counter", async () => {
  expect(
    (await readImport(fixture("freeotpplus-steam.txt"))).accounts[0],
  ).toMatchObject({ type: "steam", digits: 5, period: 30 });
  expect(
    (await readImport(fixture("freeotpplus-hotp.txt"))).accounts[0],
  ).toMatchObject({ type: "hotp", counter: "42" });
  await expect(
    readImport(fixture("freeotpplus-hotp.txt").trim() + "&counter=43"),
  ).rejects.toThrow();
});

it("auto-detection preserves valid OTP lines after an invalid first line and reports the original position", async () => {
  const result = await readImport(
    "invalid-SENSITIVE_MARKER\n" + fixture("ente.txt"),
  );
  expect(result.accounts).toHaveLength(1);
  expect(result.skipped).toEqual([{ index: 1, reason: expect.any(String) }]);
  expect(result.skipped[0]!.reason).not.toContain("SENSITIVE_MARKER");
});
