import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEnrollment } from "../src/ui/enrollment";
import { createRecovery } from "../src/ui/recovery";
import { emptyVault } from "../src/model";
import type { Session } from "../src/session";
import { context, ui, resetUI } from "./helpers/ui";
import { TestElement, testDocument } from "./helpers/dom";
beforeEach(() => {
  resetUI();
  vi.stubGlobal("document", testDocument);
});
afterEach(() => vi.unstubAllGlobals());
it.each([true, false])(
  "import file and QR controls are handed off only in popup=%s",
  (isPopup) => {
    const ctx = context({} as Session);
    ctx.isPopup = isPopup;
    createEnrollment(ctx, () => {}).importAccounts();
    const dialog = ui.dialog as unknown as TestElement;
    expect(dialog.querySelectorAll('input[type="file"]')).toHaveLength(
      isPopup ? 0 : 2,
    );
    expect(dialog.querySelectorAll("textarea")).toHaveLength(1);
    expect(
      dialog.textContent.includes("Open in a window to choose a file"),
    ).toBe(isPopup);
    if (isPopup)
      expect(dialog.textContent).toContain(
        "The window will ask for your password.",
      );
  },
);
it.each([true, false])(
  "backup verify and fresh restore hand off only in popup=%s",
  (isPopup) => {
    const ctx = context({ accounts: () => emptyVault() } as Session);
    ctx.isPopup = isPopup;
    const recovery = createRecovery(ctx, async () => {});
    const view = recovery.backupsView() as unknown as TestElement;
    view
      .querySelectorAll("button")
      .find((n) => n.textContent === "Verify or restore a backup")!
      .click();
    expect(
      (ui.dialog as unknown as TestElement).querySelectorAll(
        'input[type="file"]',
      ),
    ).toHaveLength(isPopup ? 0 : 1);
    recovery.recoverySetup();
    expect(
      (ui.dialog as unknown as TestElement).querySelectorAll(
        'input[type="file"]',
      ),
    ).toHaveLength(isPopup ? 0 : 1);
  },
);
