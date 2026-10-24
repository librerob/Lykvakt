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
try {
  const id = await extensionId(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/index.html?window`);
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
  await page.evaluate(async () => {
    await chrome.tabs.create({ url: "about:blank", active: true });
  });
  await page.bringToFront();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  console.log("PASS actual headed Chromium tab activation locks the vault");
} finally {
  await context.close();
}
