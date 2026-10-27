import { extensionId } from "./extension-id.mjs";
import { chromium, expect } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
const extension = resolve("dist");
const profile = await mkdtemp(join(tmpdir(), "otp-visibility-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: false,
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
async function hideTab(page) {
  await page.evaluate(async () => {
    const current = await chrome.tabs.getCurrent();
    await chrome.tabs.create({
      windowId: current.windowId,
      url: "about:blank",
      active: true,
    });
  });
  await expect
    .poll(() => page.evaluate(() => document.visibilityState))
    .toBe("hidden");
}
try {
  const id = await extensionId(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/index.html?window`);
  // Use real visibility; Playwright otherwise emulates focus.
  const windowCDP = await context.newCDPSession(page);
  await windowCDP.send("Emulation.setFocusEmulationEnabled", {
    enabled: false,
  });
  await page
    .getByLabel("Create a master password")
    .fill("synthetic visibility test password");
  await page
    .getByLabel("Confirm master password")
    .fill("synthetic visibility test password");
  await page
    .getByRole("button", { name: "Create encrypted vault", exact: true })
    .click();
  await expect(page.getByText("A fresh start.")).toBeVisible();
  await page.getByRole("button", { name: "Backup", exact: true }).click();
  await page
    .getByRole("button", { name: "Import accounts", exact: true })
    .click();
  await page
    .getByLabel("OTP URIs or export text")
    .fill(
      "otpauth://totp/Visibility:synthetic?secret=JBSWY3DPEHPK3PXP&issuer=Visibility",
    );
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Import 1 account(s)", exact: true })
    .click();
  await hideTab(page);
  await page.bringToFront();
  await expect(
    page.getByLabel("Search accounts", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/index.html`);
  const popupCDP = await context.newCDPSession(popup);
  await popupCDP.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await popup
    .getByLabel("Master password", { exact: true })
    .fill("synthetic visibility test password");
  await popup
    .getByRole("button", { name: "Unlock vault", exact: true })
    .click();
  await expect(
    popup.getByRole("button", { name: "Lock", exact: true }),
  ).toBeVisible();
  await hideTab(popup);
  await popup.bringToFront();
  await expect(
    popup.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  console.log(
    "PASS headed Chromium window switching stays unlocked; popup switching and explicit Lock lock the vault",
  );
} finally {
  await context.close();
}
