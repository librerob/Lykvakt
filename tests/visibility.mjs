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
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const page = await context.newPage();
  await page.goto(
    `chrome-extension://${new URL(worker.url()).hostname}/index.html?window`,
  );
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
  const other = await context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await expect.poll(() => page.evaluate(() => document.hidden)).toBe(true);
  await page.bringToFront();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  console.log("PASS actual headed Chromium tab visibility locks the vault");
} finally {
  await context.close();
}
