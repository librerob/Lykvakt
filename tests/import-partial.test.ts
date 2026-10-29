import { IDBFactory } from "fake-indexeddb";
import { afterEach, it, expect, vi } from "vitest";
import { parseImport } from "../src/import";
import { Session } from "../src/session";
import { createEnrollment } from "../src/ui/enrollment";
import { click, context, resetUI, ui } from "./helpers/ui";
vi.mock("../src/dom", async () => import("./helpers/ui"));
afterEach(() => vi.unstubAllGlobals());
const secret = "JBSWY3DPEHPK3PXP";
const good = `otpauth://totp/Good:user?secret=${secret}`;
const aegis = (entries: unknown[]) =>
  JSON.stringify({ version: 1, header: {}, db: { version: 3, entries } });
const entry = {
  type: "totp",
  issuer: "Good",
  name: "user",
  info: { secret, algo: "SHA1", digits: 6, period: 30 },
};
// Independent proto3 fixture writer. Unknown enum values remain record-level data.
function v(value: number): number[] {
  const result = [];
  do {
    result.push((value & 127) | (value > 127 ? 128 : 0));
    value = Math.floor(value / 128);
  } while (value);
  return result;
}
const n = (key: number, value: number) => [...v(key * 8), ...v(value)];
const b = (key: number, data: number[]) => [
  ...v(key * 8 + 2),
  ...v(data.length),
  ...data,
];
const s = (key: number, value: string) =>
  b(key, [...new TextEncoder().encode(value)]);
function otp(algorithm: number | undefined, digits: number | undefined) {
  return b(1, [
    ...b(1, [...new TextEncoder().encode("12345678901234567890")]),
    ...s(2, "Synthetic:user"),
    ...s(3, "Synthetic"),
    ...(algorithm === undefined ? [] : n(4, algorithm)),
    ...(digits === undefined ? [] : n(5, digits)),
    ...n(6, 2),
  ]);
}
function google(entries: number[][], size = 1, index = 0) {
  return (
    "otpauth-migration://offline?data=" +
    encodeURIComponent(
      btoa(
        String.fromCharCode(
          ...entries.flat(),
          ...n(2, 1),
          ...n(3, size),
          ...n(4, index),
          ...n(5, 123),
        ),
      ),
    )
  );
}
it("partial URI import reports the invalid source line without exposing its contents", () => {
  const result = parseImport(good + "\n\ninvalid-SECRET_MARKER", "uri");
  expect(result.accounts).toHaveLength(1);
  expect(result.accounts[0]).toMatchObject({ issuer: "Good", label: "user" });
  expect(result.skipped).toEqual([{ index: 3, reason: expect.any(String) }]);
  expect(result.skipped[0]!.reason).not.toContain("SECRET_MARKER");
});
it("mixed Aegis keeps valid records and reports an unsupported Steam entry", () => {
  const result = parseImport(
    aegis([{ ...entry, type: "steam" }, entry]),
    "aegis",
  );
  expect(result.accounts).toHaveLength(1);
  expect(result.accounts[0]).toMatchObject({
    issuer: "Good",
    type: "totp",
    digits: 6,
  });
  expect(result.skipped).toEqual([
    { index: 1, reason: expect.stringMatching(/unsupported.*type/i) },
  ]);
});
it("mixed 2FAS retains valid fields and reports an invalid hash", () => {
  const row = {
    name: "Good",
    secret,
    otp: {
      tokenType: "TOTP",
      account: "user",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    },
  };
  const result = parseImport(
    JSON.stringify({
      schemaVersion: 4,
      services: [row, { ...row, otp: { ...row.otp, algorithm: "MD5" } }],
    }),
    "2fas",
  );
  expect(result.accounts).toHaveLength(1);
  expect(result.accounts[0]).toMatchObject({
    label: "user",
    algorithm: "SHA-1",
    digits: 6,
    period: 30,
  });
  expect(result.skipped).toEqual([{ index: 2, reason: expect.any(String) }]);
});
it.each([
  [0, 1],
  [1, 0],
  [0, 0],
  [undefined, undefined],
])(
  "Google unspecified algorithm %s and digits %s use SHA-1 and six digits",
  (algorithm, digits) => {
    const result = parseImport(google([otp(algorithm, digits)]), "uri");
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]).toMatchObject({ algorithm: "SHA-1", digits: 6 });
    expect(result.skipped).toEqual([]);
  },
);
it("Google partial transfer reports global account positions across an ordered complete batch", () => {
  const result = parseImport(
    google([otp(4, 1), otp(1, 1)], 2, 1) + "\n" + google([otp(1, 1)], 2, 0),
    "uri",
  );
  expect(result.accounts).toHaveLength(2);
  expect(result.skipped).toEqual([{ index: 2, reason: expect.any(String) }]);
});
it("zero valid records and malformed file structure still throw", () => {
  expect(() => parseImport("bad\nalso bad", "uri")).toThrow();
  expect(() =>
    parseImport(aegis([{ ...entry, type: "steam" }]), "aegis"),
  ).toThrow();
  expect(() => parseImport(google([otp(4, 1)]), "uri")).toThrow();
  expect(() => parseImport('{"version":2}', "aegis")).toThrow();
  expect(() => parseImport("{", "2fas")).toThrow();
  expect(() => parseImport(google([otp(1, 1)], 2, 0), "uri")).toThrow("all 2");
});
it("preview reports skipped entries and saves valid accounts only after confirmation", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  resetUI();
  const session = new Session();
  await session.setup("synthetic import passphrase");
  const result = parseImport(
    aegis([entry, { ...entry, type: "steam" }]),
    "aegis",
  );
  await createEnrollment(context(session), () => {}).preview(
    result.accounts,
    result.skipped,
  );
  expect(JSON.stringify(ui.dialog)).toContain("1 skipped");
  expect(JSON.stringify(ui.dialog)).toContain("Account 2");
  expect(session.accounts().accounts).toHaveLength(0);
  await click("Add account");
  expect(session.accounts().accounts).toHaveLength(1);
}, 60_000);
