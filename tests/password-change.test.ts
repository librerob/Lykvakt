import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  base64,
  decryptEnvelope,
  importVaultKey,
  open,
  random,
  unwrapPassword,
} from "../src/crypto";
import { Session } from "../src/session";
import * as storage from "../src/storage";
import { createSettings } from "../src/ui/settings";
import { click, context, resetUI, send, set, ui } from "./helpers/ui";
vi.mock("../src/dom", async () => import("./helpers/ui"));
const oldPassword = "synthetic old master password";
const newPassword = "synthetic new master password";
beforeEach(() => {
  resetUI();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  vi.stubGlobal("localStorage", { getItem: () => null });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function settings() {
  const session = new Session();
  await session.setup(oldPassword);
  createSettings(context(session)).settingsView();
  await click("Change master password");
  set("current", oldPassword);
  set("next", newPassword);
  set("confirm", newPassword);
  return session;
}
it("password change rotates the actual session key: an old envelope/password cannot decrypt future saves", async () => {
  const session = await settings();
  await session.save(session.accounts(), (h) => ({
    ...h,
    passkeys: [
      {
        id: "synthetic",
        credential: base64(random(32)),
        salt: base64(random(32)),
        iv: base64(random(12)),
        wrapped: base64(random(48)),
      },
    ],
  }));
  const oldEnvelope = session.current();
  const raw = await unwrapPassword(oldEnvelope, oldPassword);
  let oldKey: CryptoKey;
  try {
    oldKey = await importVaultKey(raw);
  } finally {
    raw.fill(0);
  }
  await send();
  const changed = session.current();
  await expect(open(changed, oldKey)).rejects.toThrow();
  expect(changed.passkeys).toEqual([]);
  expect((await decryptEnvelope(changed, newPassword)).data).toEqual(
    session.accounts(),
  );
  await expect(decryptEnvelope(changed, oldPassword)).rejects.toThrow();
  await session.save(session.accounts());
  await expect(open(session.current(), oldKey)).rejects.toThrow();
  expect((await decryptEnvelope(session.current(), newPassword)).data).toEqual(
    session.accounts(),
  );
  expect(ui.messages.join(" ")).toMatch(/passkeys.*re-enroll/i);
});
it("failed rotation commit preserves the old session key and stored vault", async () => {
  const session = await settings(),
    before = session.current();
  vi.spyOn(storage, "commit").mockRejectedValueOnce(
    new Error("synthetic failed commit"),
  );
  await expect(send()).rejects.toThrow("synthetic failed commit");
  expect(session.current()).toEqual(before);
  expect(await storage.load()).toEqual(before);
  await session.save(session.accounts());
  expect((await decryptEnvelope(session.current(), oldPassword)).data).toEqual(
    session.accounts(),
  );
});
it("password-change verification failure clears every password input", async () => {
  const session = await settings(),
    before = session.current();
  set("current", "incorrect synthetic password");
  await expect(send()).rejects.toThrow();
  expect(session.current()).toEqual(before);
  for (const name of ["current", "next", "confirm"])
    expect(ui.fields.get(name)!.value).toBe("");
});
