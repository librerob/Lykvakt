import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { Session } from "../src/session";
import { createSettings } from "../src/ui/settings";
import { createRecovery } from "../src/ui/recovery";
import { click, context, resetUI, send, set, ui } from "./helpers/ui";
vi.mock("../src/dom", async () => import("./helpers/ui"));
beforeEach(() => {
  resetUI();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  vi.stubGlobal("localStorage", { getItem: () => null });
});
afterEach(() => vi.unstubAllGlobals());
it("settings reads the runtime manifest version", async () => {
  const session = new Session();
  await session.setup("synthetic settings password");
  vi.stubGlobal("chrome", {
    runtime: { getManifest: () => ({ version: "7.8.9" }) },
    storage: { local: { get: async () => ({ automatic: false }) } },
  });
  const ctx = context(session);
  ctx.isExtension = true;
  expect(JSON.stringify(createSettings(ctx).settingsView())).toContain(
    "Development preview · 7.8.9",
  );
});
it("backup downloads use the Lykvakt date prefix without changing the envelope format", async () => {
  const session = new Session();
  await session.setup("synthetic settings password");
  createRecovery(context(session), async () => {}).backupsView();
  await click("Create encrypted backup");
  set("password", "synthetic independent backup passphrase");
  set("confirmation", "synthetic independent backup passphrase");
  await send();
  expect(ui.downloads).toHaveLength(1);
  expect(ui.downloads[0]!.filename).toMatch(
    /^lykvakt-backup-\d{4}-\d{2}-\d{2}\.json$/,
  );
  expect(JSON.parse(ui.downloads[0]!.contents)).toMatchObject({
    format: "otp-vault",
    kind: "backup",
  });
});
