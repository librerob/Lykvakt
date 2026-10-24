import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import * as cryptoModule from "../src/crypto";
import { Session } from "../src/session";
import { parseURI } from "../src/import";
import { createEnrollment } from "../src/ui/enrollment";
import { createRecovery } from "../src/ui/recovery";
import { click, context, resetUI, send, set, ui } from "./helpers/ui";
import * as QRCode from "qrcode";
vi.mock("../src/dom", async () => import("./helpers/ui"));
vi.mock("qrcode", () => ({
  toDataURL: vi.fn(async () => "data:image/png;base64,c3ludGhldGlj"),
}));
const password = "synthetic export master password";
const secret = "JBSWY3DPEHPK3PXP";
beforeEach(() => {
  resetUI();
  vi.clearAllMocks();
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function prepare(kind: string) {
  const session = new Session();
  await session.setup(password);
  const data = session.accounts();
  data.accounts.push(
    parseURI(`otpauth://totp/Synthetic:user?secret=${secret}`),
  );
  await session.save(data);
  if (kind === "bulk") {
    createRecovery(context(session), async () => {}).backupsView();
    await click("Export plaintext OTP links…");
  } else {
    createEnrollment(context(session), () => {}).editAccount(
      data.accounts[0]!.id,
    );
    await click(
      kind === "qr" ? "Show transfer QR…" : "Export plaintext OTP URI…",
    );
  }
  return session;
}
it.each(["single", "bulk", "qr"])(
  "%s secret export requires re-authentication, clears the field on failure and succeeds only with the password",
  async (kind) => {
    await prepare(kind);
    expect(ui.fields.has("password")).toBe(true);
    set("password", "wrong synthetic password");
    await expect(send()).rejects.toThrow();
    expect(ui.fields.get("password")!.value).toBe("");
    expect(ui.downloads).toHaveLength(0);
    expect(QRCode.toDataURL).not.toHaveBeenCalled();
    const unwrap = vi.spyOn(cryptoModule, "unwrapPassword");
    set("password", password);
    await send();
    expect(ui.fields.get("password")!.value).toBe("");
    const raw = await unwrap.mock.results[0]!.value;
    expect([...raw]).toEqual(Array(32).fill(0));
    if (kind === "qr") {
      expect(QRCode.toDataURL).toHaveBeenCalledOnce();
      expect(ui.downloads).toHaveLength(0);
      expect(JSON.stringify(ui.dialog)).toContain("Secret account transfer QR");
    } else {
      expect(ui.downloads).toHaveLength(1);
      expect(ui.downloads[0]!.contents).toContain(secret);
    }
  },
);
it("locking during password verification prevents secret export and clears raw bytes", async () => {
  const session = await prepare("bulk"),
    original = cryptoModule.unwrapPassword;
  const unwrap = vi
    .spyOn(cryptoModule, "unwrapPassword")
    .mockImplementation(async (...args) => {
      const raw = await original(...args);
      session.lock();
      return raw;
    });
  set("password", password);
  await expect(send()).rejects.toThrow("Unlock");
  expect(ui.downloads).toHaveLength(0);
  expect(ui.fields.get("password")!.value).toBe("");
  expect([...(await unwrap.mock.results[0]!.value)]).toEqual(Array(32).fill(0));
});
