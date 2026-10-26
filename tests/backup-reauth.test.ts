import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Session } from "../src/session";
import { createRecovery } from "../src/ui/recovery";
import { parseURI, verifyBackup } from "../src/import";
import * as cryptoModule from "../src/crypto";
import { click, context, resetUI, send, set, ui } from "./helpers/ui";
vi.mock("../src/dom", async () => import("./helpers/ui"));
const master = "synthetic backup owner master password";
const backup = "synthetic visitor chosen backup password";
beforeEach(() => {
  resetUI();
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(["", "wrong synthetic master password"])(
  "backup creation rejects master password %j without exporting secrets",
  async (value) => {
    const session = new Session();
    await session.setup(master);
    const data = session.accounts();
    data.accounts.push(
      parseURI("otpauth://totp/Test:user?secret=JBSWY3DPEHPK3PXP"),
    );
    await session.save(data);
    createRecovery(context(session), async () => {}).backupsView();
    await click("Create encrypted backup");
    // Also models an old UI or a direct form submission bypassing native required checks.
    if (!ui.fields.has("masterPassword"))
      ui.fields.set("masterPassword", { value: "" });
    set("masterPassword", value);
    set("password", backup);
    set("confirmation", backup);
    await expect(send()).rejects.toThrow();
    expect(ui.downloads).toHaveLength(0);
    expect(ui.fields.get("masterPassword")!.value).toBe("");
    set("masterPassword", master);
    set("password", backup);
    set("confirmation", backup);
    const unwrap = vi.spyOn(cryptoModule, "unwrapPassword");
    await send();
    expect(ui.downloads).toHaveLength(1);
    expect(ui.fields.get("masterPassword")!.value).toBe("");
    expect([...(await unwrap.mock.results[0]!.value)]).toEqual(
      Array(32).fill(0),
    );
    const restored = await verifyBackup(
      JSON.parse(ui.downloads[0]!.contents),
      backup,
    );
    expect(restored.data.accounts).toEqual(data.accounts);
  },
  60_000,
);
