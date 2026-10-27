import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAccounts } from "../src/ui/accounts";
import { createRecovery } from "../src/ui/recovery";
import { offlineHelp } from "../src/ui/offline-help";
import { emptyVault } from "../src/model";
import { parseURI } from "../src/import";
import type { Session } from "../src/session";
import { context } from "./helpers/ui";
import { TestElement, primaryText, testDocument } from "./helpers/dom";
beforeEach(() => {
  vi.stubGlobal("document", testDocument);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem() {} });
});
afterEach(() => vi.unstubAllGlobals());
function fixture(withAccount = false) {
  const data = emptyVault();
  if (withAccount)
    data.accounts.push(
      parseURI("otpauth://totp/Test:user?secret=JBSWY3DPEHPK3PXP"),
    );
  const ctx = context({
    unlocked: true,
    accounts: () => structuredClone(data),
    check() {},
    epoch: () => 0,
  } as Session);
  ctx.state.firstRunTip = true;
  return { ctx, accounts: createAccounts(ctx) };
}
it("shows one empty-state message and hides search, favorites and backup reminder", async () => {
  const { ctx, accounts } = fixture();
  const view = accounts.codesView() as unknown as TestElement;
  expect(view.querySelectorAll(".empty")).toHaveLength(1);
  expect(view.querySelector(".search-row")!.hidden).toBe(true);
  await vi.waitFor(() =>
    expect(view.querySelector(".backup-notice")!.hidden).toBe(true),
  );
  expect(view.querySelectorAll(".notice")).toHaveLength(0);
  view
    .querySelectorAll("button")
    .find((n) => n.textContent === "Got it")!
    .click();
  expect(ctx.state.firstRunTip).toBe(false);
  expect(view.querySelectorAll(".empty")).toHaveLength(1);
  accounts.clear();
});
it("keeps backup reminder dismissal for the unlocked session across redraws", async () => {
  const { ctx, accounts } = fixture(true);
  let view = accounts.codesView() as unknown as TestElement;
  await vi.waitFor(() =>
    expect(view.querySelector(".backup-notice")!.hidden).toBe(false),
  );
  view.querySelector('[aria-label="Dismiss backup reminder"]')!.click();
  expect(ctx.state.backupDismissed).toBe(true);
  view = accounts.codesView() as unknown as TestElement;
  await vi.waitFor(() =>
    expect(view.querySelector(".backup-notice")!.hidden).toBe(true),
  );
  accounts.clear();
});
it("puts the compact Import shortcut beside Add account and routes it to Backup", () => {
  const { ctx, accounts } = fixture();
  const view = accounts.codesView() as unknown as TestElement;
  const tools = view.querySelector(".account-tools")!;
  expect(tools.textContent).toContain("+ Add account");
  tools
    .querySelectorAll("button")
    .find((n) => n.textContent === "Import")!
    .click();
  expect(ctx.state.view).toBe("backups");
});
it("offers Import accounts alongside the existing export and backup actions", () => {
  const { ctx } = fixture();
  const action = vi.fn();
  const view = createRecovery(
    ctx,
    async () => {},
    action,
  ).backupsView() as unknown as TestElement;
  for (const name of [
    "Import accounts",
    "Export plaintext OTP links…",
    "Create encrypted backup",
    "Verify or restore a backup",
  ])
    expect(
      view.querySelectorAll("button").some((n) => n.textContent === name),
    ).toBe(true);
  view
    .querySelectorAll("button")
    .find((n) => n.textContent === "Import accounts")!
    .click();
  expect(action).toHaveBeenCalledOnce();
});
it.each([true, false])(
  "essential help is bundled, plain language and available in popup=%s",
  (mode) => {
    const help = offlineHelp(mode) as unknown as TestElement;
    for (const text of [
      "These tips work offline",
      "There is no password reset",
      "Reveal",
      "Counter-based",
      "Backup",
      "Open in a window",
    ])
      expect(primaryText(help)).toContain(text);
    expect(help.querySelector("a")!.getAttribute("href")).toContain(
      "github.com/librerob/lykvakt",
    );
    expect(primaryText(help)).not.toMatch(/Argon2|AES|envelope|nonce|WASM/);
  },
);
