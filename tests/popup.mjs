import { extensionId } from "./extension-id.mjs";
import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
const extension = resolve("dist");
const profile = await mkdtemp(join(tmpdir(), "otp-real-popup-"));
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
const started = new Promise((resolve, reject) => {
  let output = "";
  const timeout = setTimeout(
    () =>
      reject(new Error("Chrome did not expose its test endpoint. " + output)),
    30_000,
  );
  chromeProcess.once("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  chromeProcess.once("exit", (code) => {
    clearTimeout(timeout);
    reject(new Error("Chrome exited: " + code + " " + output));
  });
  chromeProcess.stderr.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-32_000);
    const endpoint = output.match(
      /DevTools listening on (ws:\/\/[^\r\n]+)[\r\n]/,
    )?.[1];
    if (endpoint) {
      clearTimeout(timeout);
      resolve(endpoint);
    }
  });
});

let browser, popup, bootstrap, worker;
const password = "synthetic actual popup password";
const nextPassword = "new synthetic actual popup password";
const senders = [];
try {
  browser = await chromium.connectOverCDP(await started, { noDefaults: true });
  const context = browser.contexts()[0];
  const id = await extensionId(context);
  bootstrap = await context.newPage();
  await bootstrap.goto("chrome-extension://" + id + "/index.html?window");
  worker =
    context.serviceWorkers().find((w) => w.url().endsWith("/background.js")) ||
    (await context.waitForEvent("serviceworker"));
  await worker.evaluate(() => {
    globalThis.__realPopupSenders = [];
    chrome.runtime.onMessage.addListener((message, sender) => {
      if (message?.type === "lykvakt-session" && message.action === "begin")
        globalThis.__realPopupSenders.push({
          id: sender.id,
          url: sender.url,
          origin: sender.origin,
          documentId: sender.documentId,
          frameId: sender.frameId,
          hasTab: !!sender.tab,
        });
    });
  });
  const popupUrl = "chrome-extension://" + id + "/index.html";
  const open = async () => {
    await bootstrap.bringToFront();
    const created = context.waitForEvent("page");
    await bootstrap.evaluate(() => chrome.action.openPopup());
    const view = await created;
    await view.waitForURL(popupUrl);
    await expect(view.locator("#app")).toHaveAttribute("aria-busy", "false");
    const contexts = await worker.evaluate(() =>
      chrome.runtime.getContexts({ contextTypes: ["POPUP"] }),
    );
    expect(contexts.some((c) => c.documentUrl === popupUrl)).toBe(true);
    return view;
  };
  popup = await open();
  await popup
    .getByLabel("Create a master password", { exact: true })
    .fill(password);
  await popup
    .getByLabel("Confirm master password", { exact: true })
    .fill(password);
  await popup
    .getByRole("button", { name: "Create encrypted vault", exact: true })
    .click();
  await expect(
    popup.getByRole("button", { name: "+ Add account", exact: true }),
  ).toBeVisible();
  senders.push(...(await worker.evaluate(() => globalThis.__realPopupSenders)));
  expect(senders.length).toBeGreaterThan(0);
  expect(senders.every((s) => s.url === popupUrl && !s.hasTab)).toBe(true);
  console.log("Real toolbar sender metadata: " + JSON.stringify(senders));
  await popup
    .getByRole("button", { name: "+ Add account", exact: true })
    .click();
  await popup.getByLabel("Service name", { exact: true }).fill("Actual popup");
  await popup.getByLabel("Setup key", { exact: true }).fill("JBSWY3DPEHPK3PXP");
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (await chrome.storage.session.get("unlockSession")).unlockSession
            ?.unlock?.draft?.fields?.secret,
      ),
    )
    .toBe("JBSWY3DPEHPK3PXP");
  await popup.close();
  popup = await open();
  await expect(popup.getByRole("dialog")).toContainText("Add account");
  await expect(popup.getByLabel("Service name", { exact: true })).toHaveValue(
    "Actual popup",
  );
  await expect(
    popup.getByLabel("Master password", { exact: true }),
  ).toHaveCount(0);
  await popup.getByRole("button", { name: "Close", exact: true }).click();
  await popup.getByRole("button", { name: "Backup", exact: true }).click();
  await popup
    .getByRole("button", { name: "Import accounts", exact: true })
    .click();
  await popup
    .getByLabel("OTP URIs or export text")
    .fill(
      "otpauth://totp/Popup:synthetic?secret=JBSWY3DPEHPK3PXP&issuer=Popup",
    );
  await popup
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await popup
    .getByRole("button", { name: "Import 1 account(s)", exact: true })
    .click();
  await expect(popup.getByRole("dialog")).toHaveCount(0);
  await expect(popup.locator(".account")).toHaveCount(1);
  await mkdir("artifacts/screenshots", { recursive: true });
  await popup.screenshot({
    path: "artifacts/screenshots/actual-toolbar-popup.png",
  });
  await popup.close();
  await bootstrap.reload();
  await expect(
    bootstrap.getByRole("button", { name: "Lock", exact: true }),
  ).toBeVisible();
  popup = await open();
  await expect(popup.locator(".account")).toHaveCount(1);
  await popup.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(
    popup.getByLabel("Master password", { exact: true }),
  ).toBeVisible();
  await expect(
    bootstrap.getByLabel("Master password", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      worker.evaluate(async () =>
        Boolean(
          (await chrome.storage.session.get("unlockSession")).unlockSession
            ?.unlock,
        ),
      ),
    )
    .toBe(false);
  await popup.close();
  popup = await open();
  await popup
    .getByLabel("Master password", { exact: true })
    .fill("wrong synthetic password");
  await popup
    .getByRole("button", { name: "Unlock vault", exact: true })
    .click();
  await expect(popup.getByRole("status")).toContainText(
    "Authentication failed",
  );
  await expect(
    popup.getByLabel("Master password", { exact: true }),
  ).toHaveValue("");
  await popup.getByLabel("Master password", { exact: true }).fill(password);
  await popup
    .getByRole("button", { name: "Unlock vault", exact: true })
    .click();
  await expect(popup.locator(".account")).toHaveCount(1);
  await popup.getByRole("button", { name: "Settings", exact: true }).click();
  await popup
    .getByRole("button", { name: "Change master password", exact: true })
    .click();
  await popup
    .getByLabel("Current master password", { exact: true })
    .fill(password);
  await popup
    .getByLabel("New master password", { exact: true })
    .fill(nextPassword);
  await popup
    .getByLabel("Confirm new master password", { exact: true })
    .fill(nextPassword);
  await popup
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(popup.getByRole("dialog")).toHaveCount(0);
  await expect(popup.getByRole("status")).toContainText(
    "Master password changed",
  );
  await expect(
    popup.getByRole("button", { name: "Lock", exact: true }),
  ).toBeVisible();
  await popup.close();
  popup = await open();
  await expect(
    popup.getByLabel("Master password", { exact: true }),
  ).toBeVisible();
  await popup.getByLabel("Master password", { exact: true }).fill(password);
  await popup
    .getByRole("button", { name: "Unlock vault", exact: true })
    .click();
  await expect(popup.getByRole("status")).toContainText(
    "Authentication failed",
  );
  await popup.getByLabel("Master password", { exact: true }).fill(nextPassword);
  await popup
    .getByRole("button", { name: "Unlock vault", exact: true })
    .click();
  await expect(popup.locator(".account")).toHaveCount(1);
  await writeFile(
    "artifacts/real-popup-results.json",
    JSON.stringify(
      {
        passed: true,
        browser: browser.version(),
        source: "chrome.action.openPopup / POPUP context",
        senders,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS actual toolbar popup setup, draft restoration, save, shared Lock, password unlock and key rotation",
  );
} catch (error) {
  if (worker)
    senders.push(
      ...(await worker
        .evaluate(() => globalThis.__realPopupSenders)
        .catch(() => [])),
    );
  await mkdir("artifacts/screenshots", { recursive: true });
  if (popup && !popup.isClosed())
    await popup
      .screenshot({ path: "artifacts/screenshots/actual-popup-failure.png" })
      .catch(() => {});
  const driver = browser
    ? await browser.newBrowserCDPSession().catch(() => undefined)
    : undefined;
  const targets = await driver
    ?.send("Target.getTargets")
    .catch(() => undefined);
  await writeFile(
    "artifacts/real-popup-failure.json",
    JSON.stringify(
      {
        error: String(error),
        body:
          popup && !popup.isClosed()
            ? await popup
                .locator("body")
                .innerText()
                .catch(() => "")
            : "",
        targets,
        senders,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  if (browser) {
    const client = await browser.newBrowserCDPSession().catch(() => undefined);
    await client?.send("Browser.close").catch(() => {});
    await browser.close().catch(() => {});
  }
  if (chromeProcess.exitCode === null) chromeProcess.kill();
}
