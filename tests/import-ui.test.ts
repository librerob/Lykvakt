import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createEnrollment } from "../src/ui/enrollment";
import { Session } from "../src/session";
import { context, resetUI, ui, send, set, click } from "./helpers/ui";
import { fixture, sourcePassword } from "./helpers/source-exports.mjs";
vi.mock("../src/dom", async () => import("./helpers/ui"));
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  resetUI();
});
afterEach(() => vi.unstubAllGlobals());
async function setup() {
  const session = new Session();
  await session.setup("synthetic imports UI master password");
  createEnrollment(context(session), () => {}).importAccounts();
  ui.fields.set("payload", { value: fixture("2fas-encrypted.json") });
  Object.assign(ui.fields.get("sourcePassword")!, { focus() {} });
  return session;
}
it("detects encrypted format without a dropdown and clears the source password on wrong-password failure and success; preview needs confirmation", async () => {
  const session = await setup();
  expect(ui.fields.has("format")).toBe(false);
  await send();
  expect(ui.messages.at(-1)).toContain("Detected format: 2FAS");
  set("sourcePassword", "wrong source password");
  await expect(send()).rejects.toMatchObject({ name: "OperationError" });
  expect(ui.fields.get("sourcePassword")!.value).toBe("");
  expect(session.accounts().accounts).toEqual([]);
  set("sourcePassword", sourcePassword);
  await send();
  expect(ui.fields.get("sourcePassword")!.value).toBe("");
  expect(JSON.stringify(ui.dialog)).toContain("Detected format: 2FAS");
  expect(session.accounts().accounts).toEqual([]);
  await click("Import 1 account(s)");
  expect(session.accounts().accounts).toHaveLength(1);
}, 60000);
it("invalid files also clear a previously entered source password", async () => {
  const session = await setup();
  set("payload", '{"unrecognised": true}');
  set("sourcePassword", "unneeded secret password");
  await expect(send()).rejects.toThrow(/recognise/);
  expect(ui.fields.get("sourcePassword")!.value).toBe("");
  expect(session.accounts().accounts).toEqual([]);
}, 60000);
it("locking during source-password derivation cancels the preview and never saves", async () => {
  const session = await setup();
  set("payload", fixture("aegis-encrypted.json"));
  set("sourcePassword", sourcePassword);
  const before = ui.dialog;
  const work = send();
  setTimeout(() => session.lock(), 1);
  await expect(work).rejects.toThrow();
  expect(session.unlocked).toBe(false);
  expect(ui.fields.get("sourcePassword")!.value).toBe("");
  expect(ui.dialog).toBe(before);
  await session.unlock("synthetic imports UI master password");
  expect(session.accounts().accounts).toEqual([]);
}, 60000);
