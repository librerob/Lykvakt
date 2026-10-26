import { afterEach, expect, it, vi } from "vitest";
import { parseMigration } from "../src/migration";
import { MAX_ACCOUNTS, validateAccount } from "../src/model";

// Independent proto3 writer, restricted to the wire types used by this format.
function vint(n: number): Buffer {
  const out: number[] = [];
  do {
    out.push((n & 127) | (n > 127 ? 128 : 0));
    n = Math.floor(n / 128);
  } while (n);
  return Buffer.from(out);
}
const integer = (key: number, n: number) =>
  Buffer.concat([vint(key * 8), vint(n)]);
const bytes = (key: number, value: Uint8Array) =>
  Buffer.concat([vint(key * 8 + 2), vint(value.length), value]);
function entry(extra = Buffer.alloc(0), secret = Buffer.alloc(20, 49)) {
  return bytes(
    1,
    Buffer.concat([
      bytes(1, secret),
      bytes(2, Buffer.from("Example:alice")),
      bytes(3, Buffer.from("Example")),
      integer(4, 1),
      integer(5, 1),
      integer(6, 2),
      extra,
    ]),
  );
}
function uri(content: Uint8Array) {
  return (
    "otpauth-migration://offline?data=" +
    encodeURIComponent(
      Buffer.concat([content, integer(2, 1), integer(3, 1)]).toString("base64"),
    )
  );
}
function unknownFields(count: number) {
  // Avoid materializing hundreds of thousands of test fixture objects.
  const out = Buffer.alloc(count * 6);
  let offset = 0;
  for (let field = 10; field < count + 10; field++) {
    let tag = field * 8;
    do {
      out[offset++] = (tag & 127) | (tag > 127 ? 128 : 0);
      tag = Math.floor(tag / 128);
    } while (tag);
    out[offset++] = 1;
  }
  return out.subarray(0, offset);
}
afterEach(() => vi.restoreAllMocks());
it("bounds all fields, including distinct unknown tags, before building an oversized map", () => {
  const input = uri(Buffer.concat([entry(), unknownFields(500_000)]));
  const started = performance.now();
  expect(() => parseMigration(input)).toThrow("Too many transfer fields");
  const elapsed = performance.now() - started;
  console.log(
    `500,000-field transfer (${input.length} characters): ${elapsed.toFixed(1)} ms`,
  );
  expect(elapsed).toBeLessThan(1000);
});
it("skips a large unknown byte field without copying or retaining its body", () => {
  const input = uri(
    Buffer.concat([entry(), bytes(20, Buffer.alloc(1_000_000))]),
  );
  const slice = vi.spyOn(Uint8Array.prototype, "slice");
  expect(parseMigration(input).accounts).toHaveLength(1);
  expect(
    slice.mock.calls.some(
      ([start = 0, end = Infinity]) => end - start >= 1_000_000,
    ),
  ).toBe(false);
});
it("decodes the bounded transfer string without an iterable allocation", () => {
  const from = vi.spyOn(Uint8Array, "from");
  expect(parseMigration(uri(entry())).accounts).toHaveLength(1);
  expect(from).not.toHaveBeenCalled();
});
it("checks known byte lengths before decoding and reports the invalid entry", () => {
  const result = parseMigration(
    uri(Buffer.concat([entry(), entry(Buffer.alloc(0), Buffer.alloc(641))])),
    true,
  );
  expect(result.accounts).toHaveLength(1);
  expect(result.skipped).toEqual([
    { index: 2, reason: "Transfer field exceeds its size limit." },
  ]);
});
it("retains the full 2000-account limit", () => {
  const result = parseMigration(
    uri(Buffer.concat(Array.from({ length: MAX_ACCOUNTS }, () => entry()))),
  );
  expect(result.accounts).toHaveLength(MAX_ACCOUNTS);
  expect(result.skipped).toEqual([]);
  for (const account of result.accounts)
    expect(validateAccount(account)).toEqual(account);
});
it("skips optional unknown fields within the budget without changing accounts", () => {
  expect(
    parseMigration(
      uri(Buffer.concat([entry(unknownFields(20)), unknownFields(20)])),
    ).accounts[0],
  ).toMatchObject({ issuer: "Example", label: "alice", type: "totp" });
});
it("applies an independent field budget to each account and reports the skipped entry", () => {
  const result = parseMigration(
    uri(Buffer.concat([entry(), entry(unknownFields(27))])),
    true,
  );
  expect(result.accounts).toHaveLength(1);
  expect(result.skipped).toEqual([
    { index: 2, reason: "Too many transfer fields." },
  ]);
});
it("still rejects truncated unknown fields and known fields with the wrong wire type", () => {
  expect(() =>
    parseMigration(
      uri(Buffer.concat([entry(), vint(20 * 8 + 2), vint(1_000_000)])),
    ),
  ).toThrow("Truncated transfer field");
  expect(() =>
    parseMigration(uri(Buffer.concat([entry(), bytes(2, Buffer.from([1]))]))),
  ).toThrow();
});
