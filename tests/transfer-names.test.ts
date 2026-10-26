import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { parseURI, toURI, parseImport, prepareTransfer } from "../src/import";
import { validateAccount } from "../src/model";
import { Session } from "../src/session";
import { createRecovery } from "../src/ui/recovery";
import { createEnrollment } from "../src/ui/enrollment";
import { codeFor } from "../src/otp";
import * as QRCode from "qrcode";
import { click, context, resetUI, send, set, ui } from "./helpers/ui";
vi.mock("../src/dom", async () => import("./helpers/ui"));
vi.mock("qrcode", () => ({
  toDataURL: vi.fn(async () => "data:image/png;base64,c3ludGhldGlj"),
}));
const account = (issuer: string, label: string, secret = "JBSWY3DPEHPK3PXP") =>
  validateAccount({
    id: "synthetic",
    issuer,
    label,
    secret,
    type: "totp",
    algorithm: "SHA-1",
    digits: 6,
    period: 30,
    counter: "0",
    favorite: false,
    group: "",
  });
beforeEach(() => {
  vi.clearAllMocks();
  resetUI();
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([
  ["Example: Personal", "alice"],
  ["", "alice:personal"],
  ["Example ", "alice"],
])("does not silently export incompatible names %j / %j", (issuer, label) => {
  expect(() => toURI(account(issuer, label))).toThrow(/transfer names/i);
});
it("long international names still export a self-readable OTP link within 5000 characters", () => {
  const a = account("漢".repeat(200), "字".repeat(200), "A".repeat(1024)),
    uri = toURI(a);
  expect(uri.length).toBeLessThanOrEqual(5000);
  expect({ ...parseURI(uri), id: a.id }).toEqual(a);
});
it("bulk export requires explicit agreement to transfer-name adjustments and leaves the vault unchanged", async () => {
  const password = "synthetic transfer name master password",
    s = new Session();
  await s.setup(password);
  const data = s.accounts();
  data.accounts.push(account("Example: Personal ", "alice:work"));
  await s.save(data);
  createRecovery(context(s), async () => {}).backupsView();
  await click("Export plaintext OTP links…");
  set("password", password);
  await expect(send()).rejects.toThrow(/transfer names/i);
  expect(ui.downloads).toHaveLength(0);
  expect(s.accounts()).toEqual(data);
  Object.assign(ui.fields.get("transferNames")!, { checked: true });
  set("password", password);
  await send();
  expect(ui.downloads).toHaveLength(1);
  const imported = parseImport(ui.downloads[0]!.contents, "uri").accounts[0]!;
  expect(imported).toMatchObject({
    issuer: "Example  Personal",
    label: "alice work",
    secret: data.accounts[0]!.secret,
    algorithm: "SHA-1",
    digits: 6,
    period: 30,
  });
  expect(s.accounts()).toEqual(data);
}, 60_000);

it.each([
  { type: "totp", algorithm: "SHA-512", digits: 8, period: 45, counter: "0" },
  {
    type: "hotp",
    algorithm: "SHA-256",
    digits: 8,
    period: 30,
    counter: "18446744073709551615",
  },
  { type: "steam", algorithm: "SHA-1", digits: 5, period: 30, counter: "0" },
])("reviewed names preserve every code setting for $type", async (settings) => {
  const original = validateAccount({
      ...account("Service: Personal ", "user:work"),
      ...settings,
    }),
    plan = prepareTransfer([original]),
    parsed = parseURI(toURI(plan.accounts[0]!));
  expect(plan.renamed).toHaveLength(1);
  expect(parsed).toMatchObject({
    ...settings,
    issuer: "Service  Personal",
    label: "user work",
    secret: original.secret,
  });
  expect(await codeFor(parsed, 1234567890000)).toBe(
    await codeFor(original, 1234567890000),
  );
  expect(original.issuer).toBe("Service: Personal ");
});
it("ordinary names retain the standard issuer prefix", () => {
  expect(
    decodeURIComponent(new URL(toURI(account("Example", "user"))).pathname),
  ).toBe("/Example:user");
});
it("ill-formed or colon-only names require a reviewed, representable transfer copy", () => {
  const original = account("\ud800", ":::");
  expect(() => toURI(original)).toThrow(/transfer names/i);
  const plan = prepareTransfer([original]);
  expect(plan.renamed).toHaveLength(1);
  expect(parseURI(toURI(plan.accounts[0]!))).toMatchObject({
    issuer: "�",
    label: "Account",
  });
});
it.each(["single", "qr"])(
  "%s transfer also requires explicit name consent",
  async (kind) => {
    const password = "synthetic transfer name master password",
      s = new Session();
    await s.setup(password);
    const data = s.accounts();
    data.accounts.push(account("Service: Personal", "user:work"));
    await s.save(data);
    createEnrollment(context(s), () => {}).editAccount(data.accounts[0]!.id);
    await click(
      kind === "qr" ? "Show transfer QR…" : "Export plaintext OTP URI…",
    );
    set("password", password);
    await expect(send()).rejects.toThrow(/transfer names/i);
    expect(ui.downloads).toHaveLength(0);
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
    Object.assign(ui.fields.get("transferNames")!, { checked: true });
    set("password", password);
    await send();
    const uri =
      kind === "qr"
        ? vi.mocked(QRCode.toDataURL).mock.calls[0]![0]
        : ui.downloads[0]!.contents;
    expect(parseURI(String(uri))).toMatchObject({
      issuer: "Service  Personal",
      label: "user work",
      secret: data.accounts[0]!.secret,
    });
    expect(s.accounts()).toEqual(data);
  },
  60_000,
);

it.each([".", ".."])(
  "an empty-issuer dot label %j gets an explicitly reviewed transfer name",
  (label) => {
    const a = account("", label);
    expect(() => toURI(a)).toThrow(/transfer names/i);
    const plan = prepareTransfer([a]);
    expect(plan.renamed).toHaveLength(1);
    expect(parseURI(toURI(plan.accounts[0]!))).toMatchObject({
      issuer: "",
      label: "Account",
    });
    expect(a.label).toBe(label);
  },
);
