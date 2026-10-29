import { debuggingEndpoint } from "./chromium-endpoint.mjs";
import { extensionId } from "./extension-id.mjs";
import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
const extension = resolve(process.env.EXTENSION_DIST || "dist");
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
const started = debuggingEndpoint(chromeProcess, profile);

class PopupDriver {
  constructor(socket) {
    this.socket = socket;
    this.next = 0;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
    });
  }
  static async connect(endpoint) {
    const socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Popup CDP connection failed")),
        { once: true },
      );
    });
    return new PopupDriver(socket);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Popup CDP timeout: " + method));
      }, 10_000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}
class NativePopup {
  constructor(driver, targetId, sessionId) {
    this.driver = driver;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.closed = false;
  }
  async evaluate(expression) {
    const result = await this.driver.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      this.sessionId,
    );
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  async wait(expression) {
    await expect.poll(() => this.evaluate(expression)).toBe(true);
  }
  async fill(selector, value) {
    await this.wait(
      "Boolean(document.querySelector(" + JSON.stringify(selector) + "))",
    );
    await this.evaluate(
      "(() => {const input=document.querySelector(" +
        JSON.stringify(selector) +
        "); input.value=" +
        JSON.stringify(value) +
        ";input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()",
    );
  }
  async click(text) {
    const find =
      "[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===" +
      JSON.stringify(text) +
      " && !b.disabled)";
    await this.wait("Boolean(" + find + ")");
    await this.evaluate("(" + find + ").click()");
  }
  async count(selector, count) {
    await expect
      .poll(() =>
        this.evaluate(
          "document.querySelectorAll(" + JSON.stringify(selector) + ").length",
        ),
      )
      .toBe(count);
  }
  async value(selector, value) {
    await expect
      .poll(() =>
        this.evaluate(
          "document.querySelector(" + JSON.stringify(selector) + ")?.value",
        ),
      )
      .toBe(value);
  }
  async status(text) {
    await this.wait(
      "[...document.querySelectorAll('.status')].some(n=>n.textContent.includes(" +
        JSON.stringify(text) +
        "))",
    );
  }
  async screenshot(path) {
    const result = await this.driver.send(
      "Page.captureScreenshot",
      { format: "png" },
      this.sessionId,
    );
    await writeFile(path, Buffer.from(result.data, "base64"));
  }
  async close() {
    await this.driver.send("Target.closeTarget", { targetId: this.targetId });
    this.closed = true;
    await expect
      .poll(
        async () =>
          !(await this.driver.send("Target.getTargets")).targetInfos.some(
            (t) => t.targetId === this.targetId,
          ),
      )
      .toBe(true);
  }
}
let browser, popup, bootstrap, worker, driver;
const password = "synthetic actual popup password",
  nextPassword = "new synthetic actual popup password",
  senders = [];
try {
  const endpoint = await started;
  browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
  driver = await PopupDriver.connect(endpoint);
  const context = browser.contexts()[0],
    id = await extensionId(context);
  bootstrap = await context.newPage();
  await bootstrap.goto("chrome-extension://" + id + "/index.html?window");
  const workerUrl = "chrome-extension://" + id + "/background.js";
  worker =
    context.serviceWorkers().find((w) => w.url() === workerUrl) ||
    (await context.waitForEvent("serviceworker", {
      predicate: (w) => w.url() === workerUrl,
    }));
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
    await bootstrap.evaluate(() => chrome.action.openPopup());
    let target;
    await expect
      .poll(async () => {
        target = (await driver.send("Target.getTargets")).targetInfos.find(
          (t) => t.type === "page" && t.url === popupUrl,
        );
        return Boolean(target);
      })
      .toBe(true);
    const attached = await driver.send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    const view = new NativePopup(driver, target.targetId, attached.sessionId);
    await view.wait(
      "document.querySelector('#app')?.getAttribute('aria-busy') === 'false'",
    );
    await view.wait("window.innerWidth === 400");
    const contexts = await worker.evaluate(() =>
      chrome.runtime.getContexts({ contextTypes: ["POPUP"] }),
    );
    expect(contexts.some((c) => c.documentUrl === popupUrl)).toBe(true);
    return view;
  };
  popup = await open();
  await popup.fill("input[name=password]", password);
  await popup.fill("input[name=confirmation]", password);
  await popup.click("Create encrypted vault");
  await popup.wait(
    "[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='+ Add account')",
  );
  senders.push(...(await worker.evaluate(() => globalThis.__realPopupSenders)));
  expect(senders.length).toBeGreaterThan(0);
  expect(senders.every((s) => s.url === popupUrl && !s.hasTab)).toBe(true);
  console.log("Real toolbar sender metadata: " + JSON.stringify(senders));
  await popup.click("+ Add account");
  await popup.fill("input[name=issuer]", "Actual popup");
  await popup.fill("input[name=secret]", "JBSWY3DPEHPK3PXP");
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
  await popup.wait(
    "document.querySelector('dialog[open]')?.textContent.includes('Add account') === true",
  );
  await popup.value("input[name=issuer]", "Actual popup");
  await popup.count("input[name=password]", 0);
  await popup.click("Close");
  await popup.click("Backup");
  await popup.click("Import accounts");
  await popup.fill(
    "textarea[name=payload]",
    "otpauth://totp/Popup:synthetic?secret=JBSWY3DPEHPK3PXP&issuer=Popup",
  );
  await popup.click("Review import");
  await popup.click("Add account");
  await popup.count("dialog", 0);
  await popup.count(".account", 1);
  await mkdir("artifacts/screenshots", { recursive: true });
  await popup.screenshot("artifacts/screenshots/actual-toolbar-popup.png");
  await popup.close();
  await bootstrap.reload();
  await expect(
    bootstrap.getByRole("button", { name: "Lock", exact: true }),
  ).toBeVisible();
  popup = await open();
  await popup.count(".account", 1);
  await popup.click("Lock");
  await popup.wait("Boolean(document.querySelector('input[name=password]'))");
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
  await popup.fill("input[name=password]", "wrong synthetic password");
  await popup.click("Unlock vault");
  await popup.status("Authentication failed");
  await popup.value("input[name=password]", "");
  await popup.fill("input[name=password]", password);
  await popup.click("Unlock vault");
  await popup.count(".account", 1);
  await popup.click("Settings");
  await popup.click("Change master password");
  await popup.fill("input[name=current]", password);
  await popup.fill("input[name=next]", nextPassword);
  await popup.fill("input[name=confirm]", nextPassword);
  await popup.click("Change password");
  await popup.count("dialog", 0);
  await popup.status("Master password changed");
  await popup.wait(
    "[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Lock')",
  );
  await popup.close();
  popup = await open();
  await popup.wait("Boolean(document.querySelector('input[name=password]'))");
  await popup.fill("input[name=password]", password);
  await popup.click("Unlock vault");
  await popup.status("Authentication failed");
  await popup.fill("input[name=password]", nextPassword);
  await popup.click("Unlock vault");
  await popup.count(".account", 1);
  await writeFile(
    "artifacts/real-popup-results.json",
    JSON.stringify(
      {
        passed: true,
        browser: browser.version(),
        source: "chrome.action.openPopup / native POPUP context via CDP",
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
  if (popup && !popup.closed)
    await popup
      .screenshot("artifacts/screenshots/actual-popup-failure.png")
      .catch(() => {});
  const targets = await driver
    ?.send("Target.getTargets")
    .catch(() => undefined);
  await writeFile(
    "artifacts/real-popup-failure.json",
    JSON.stringify(
      {
        error: String(error),
        body:
          popup && !popup.closed
            ? await popup.evaluate("document.body.innerText").catch(() => "")
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
  driver?.socket.close();
  if (browser) {
    const client = await browser.newBrowserCDPSession().catch(() => undefined);
    await client?.send("Browser.close").catch(() => {});
    await browser.close().catch(() => {});
  }
  if (chromeProcess.exitCode === null) chromeProcess.kill();
}
