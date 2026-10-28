import { debuggingEndpoint } from "./chromium-endpoint.mjs";
import { extensionId } from "./extension-id.mjs";
import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
const extension = resolve(process.env.EXTENSION_DIST || "dist");
const profile = await mkdtemp(join(tmpdir(), "otp-visibility-"));
// Attach without Playwright's forced-focus defaults so Chrome can hide tabs.
const chromeProcess = spawn(
  process.env.CHROMIUM_PATH || chromium.executablePath(),
  [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
);
const started = debuggingEndpoint(chromeProcess, profile);
let browser;
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
  const endpoint = await started;
  browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
  const context = browser.contexts()[0];
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
    popup.getByRole("button", { name: "Lock", exact: true }),
  ).toBeVisible();
  await expect(
    popup.getByRole("heading", { name: "Welcome back." }),
  ).toHaveCount(0);
  await popup.close();
  const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${id}/index.html`);
  await expect(
    reopened.getByRole("button", { name: "Lock", exact: true }),
  ).toBeVisible();
  await expect(
    reopened.getByLabel("Master password", { exact: true }),
  ).toHaveCount(0);
  await page.bringToFront();
  await expect(
    page.getByRole("button", { name: "Lock", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(
    reopened.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  console.log(
    "PASS headed Chromium switching and popup reopening retain the timed session; explicit Lock locks every view",
  );
} finally {
  if (browser) {
    const client = await browser.newBrowserCDPSession().catch(() => undefined);
    await client?.send("Browser.close").catch(() => {});
    await browser.close().catch(() => {});
  }
  if (chromeProcess.exitCode === null) chromeProcess.kill();
}
