import { describe, it, expect } from "vitest";
import { parseMigration, parseMigrationBatch } from "../src/migration";
import { parseImport, toURI } from "../src/import";
// Independent fixture encoder mirrors the published proto3 wire schema. It is
// test-only; the production implementation only decodes Google transfers.
function vint(n: bigint | number): number[] {
  let v = BigInt(n);
  const result: number[] = [];
  do {
    result.push(Number(v & 127n) | (v > 127n ? 128 : 0));
    v >>= 7n;
  } while (v);
  return result;
}
const int = (key: number, n: bigint | number) => [...vint(key * 8), ...vint(n)];
const bytes = (key: number, data: number[]) => [
  ...vint(key * 8 + 2),
  ...vint(data.length),
  ...data,
];
const str = (key: number, s: string) =>
  bytes(key, [...new TextEncoder().encode(s)]);
function account(extra: number[] = []) {
  return bytes(1, [
    ...bytes(1, [...new TextEncoder().encode("12345678901234567890")]),
    ...str(2, "Example:alice@example.test"),
    ...str(3, "Example"),
    ...int(4, 1),
    ...int(5, 1),
    ...int(6, 2),
    ...extra,
  ]);
}
function fixture(size = 1, index = 0, id = 42, content = account()) {
  return uri([
    ...content,
    ...int(2, 1),
    ...int(3, size),
    ...int(4, index),
    ...int(5, id),
  ]);
}
function uri(data: number[]) {
  return (
    "otpauth-migration://offline?data=" +
    encodeURIComponent(btoa(String.fromCharCode(...data)))
  );
}
describe("Google Authenticator transfer import", () => {
  it("decodes the published wire types and preserves service/account separation", () => {
    expect(parseMigration(fixture()).accounts[0]).toMatchObject({
      issuer: "Example",
      label: "alice@example.test",
      type: "totp",
      algorithm: "SHA-1",
      digits: 6,
      period: 30,
      counter: "0",
      secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    });
  });
  it("imports a complete batch in order and accepts text transfer links", () => {
    expect(
      parseImport(fixture(2, 1) + "\n" + fixture(2, 0), "uri").accounts,
    ).toHaveLength(2);
  });
  it("refuses incomplete, repeated and unrelated batches", () => {
    expect(() => parseMigrationBatch([fixture(2)])).toThrow("all 2");
    expect(() => parseMigrationBatch([fixture(2), fixture(2)])).toThrow(
      "twice",
    );
    expect(() => parseMigrationBatch([fixture(2), fixture(2, 1, 43)])).toThrow(
      "different",
    );
  });
  it("supports SHA256/SHA512, eight digits and precise signed-int64 HOTP", () => {
    const entry = bytes(1, [
      ...bytes(1, [...new TextEncoder().encode("12345678901234567890")]),
      ...str(2, "counter"),
      ...int(4, 3),
      ...int(5, 2),
      ...int(6, 1),
      ...int(7, 9007199254740993n),
    ]);
    expect(parseMigration(fixture(1, 0, 1, entry)).accounts[0]).toMatchObject({
      algorithm: "SHA-512",
      digits: 8,
      type: "hotp",
      counter: "9007199254740993",
    });
  });
  it("refuses duplicate singular fields, unknown algorithms and unsafe counters", () => {
    expect(() =>
      parseMigration(fixture(1, 0, 1, account(int(4, 4)))),
    ).toThrow();
    expect(() =>
      parseMigration(fixture(1, 0, 1, account(int(7, 0xffffffffffffffffn)))),
    ).toThrow();
    expect(() =>
      parseMigration(uri([...account(), ...int(2, 2), ...int(3, 1)])),
    ).toThrow("version");
  });
  it("rejects malformed, truncated and oversized wire values", () => {
    for (const data of [
      [10, 127],
      [10, 255, 255, 255, 127],
      Array(12).fill(255),
      [0],
      [15, 1],
    ])
      expect(() => parseMigration(uri(data))).toThrow();
    expect(() =>
      parseMigration("otpauth-migration://offline?data=%25"),
    ).toThrow();
    expect(() => parseMigration(fixture() + "&data=AA==")).toThrow();
    expect(() => parseMigration(fixture(101))).toThrow();
  });
  it("fails mixed Google and standard imports without partial results", () => {
    const standard = toURI(parseMigration(fixture()).accounts[0]!);
    expect(() => parseImport(fixture() + "\n" + standard, "uri")).toThrow(
      "separately",
    );
  });
});
