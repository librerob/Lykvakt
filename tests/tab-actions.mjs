// Genuine headed toolbar invocation grants activeTab. The isolated test copy adds
// only a shortcut, never host permissions, content scripts or permission mocks.
import { chromium, expect } from "@playwright/test";
import { mkdtemp, cp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import QRCode from "qrcode";
import { fillCode } from "../src/fill.ts";
const temp = await mkdtemp(join(tmpdir(), "lykvakt-tab-actions-"));
const extension = join(temp, "extension");
await cp(resolve("dist"), extension, { recursive: true });
const manifestPath = join(extension, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.commands = {
  _execute_action: { suggested_key: { default: "Alt+Shift+Y" } },
};
await writeFile(manifestPath, JSON.stringify(manifest));
const context = await chromium.launchPersistentContext(join(temp, "profile"), {
  channel: "chromium",
  headless: false,
  viewport: { width: 1000, height: 900 },
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
const password = "synthetic screen capture passphrase";
const secret = "JBSWY3DPEHPK3PXP";
let checks = 0,
  cdp;
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).hostname;
  const setup = await context.newPage();
  await setup.goto(`chrome-extension://${id}/index.html?window`);
  await setup.getByLabel("Create a master password").fill(password);
  await setup.getByLabel("Confirm master password").fill(password);
  await setup
    .getByRole("button", { name: "Create encrypted vault", exact: true })
    .click();
  await expect(setup.getByText("A fresh start.")).toBeVisible();
  await setup.getByRole("button", { name: "Settings", exact: true }).click();
  await setup.getByLabel("Appearance", { exact: true }).selectOption("amoled");
  await setup.close();
  const qr = await QRCode.toDataURL(
    `otpauth://totp/Screen:synthetic?secret=${secret}&issuer=Screen`,
    { width: 420 },
  );
  await context.route("https://screen.example.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><head><title>Synthetic setup</title></head><body><h1>Synthetic QR setup</h1><img src="${qr}" alt="Synthetic OTP QR"><form onsubmit="window.submitted=true;return false"><input autocomplete="one-time-code" aria-label="One-time code"><button>Submit</button></form></body></html>`,
    }),
  );
  const website = await context.newPage();
  await website.goto("https://screen.example.test/setup");
  await website.bringToFront();
  cdp = await context.browser().newBrowserCDPSession();
  execFileSync("xdotool", ["key", "--clearmodifiers", "alt+shift+y"]);
  let target;
  await expect
    .poll(async () => {
      target = (await cdp.send("Target.getTargets")).targetInfos.find(
        (t) => t.url === `chrome-extension://${id}/index.html`,
      );
      return !!target;
    })
    .toBe(true);
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: false,
  });
  let requestId = 0;
  const pending = new Map();
  cdp.on("Target.receivedMessageFromTarget", (event) => {
    if (event.sessionId !== sessionId) return;
    const response = JSON.parse(event.message),
      waiter = pending.get(response.id);
    if (waiter) {
      pending.delete(response.id);
      response.error
        ? waiter.reject(new Error(JSON.stringify(response.error)))
        : waiter.resolve(response.result);
    }
  });
  async function protocol(method, params = {}) {
    const request = ++requestId;
    let timer;
    const response = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        pending.delete(request);
        reject(new Error("Popup protocol timeout: " + method));
      }, 15000);
      pending.set(request, { resolve, reject });
    });
    try {
      await cdp.send("Target.sendMessageToTarget", {
        sessionId,
        message: JSON.stringify({ id: request, method, params }),
      });
      return await response;
    } finally {
      clearTimeout(timer);
      pending.delete(request);
    }
  }
  async function evaluate(expression) {
    const result = await protocol("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  }
  async function screenshot(name) {
    await protocol("Page.enable");
    const result = await protocol("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    await writeFile(
      `artifacts/screenshots/${name}.png`,
      Buffer.from(result.data, "base64"),
    );
  }
  const text = () => evaluate("document.body.innerText");
  const click = async (label) => {
    await expect
      .poll(() =>
        evaluate(
          `([...document.querySelectorAll('button')].some(b => b.textContent === ${JSON.stringify(label)} && !b.disabled))`,
        ),
      )
      .toBe(true);
    return evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(label)}); if (!b) throw Error('Missing button'); b.click(); })()`,
    );
  };
  await expect.poll(text).toContain("Welcome back.");
  await evaluate(
    `document.querySelector('input[name="password"]').value = ${JSON.stringify(password)}`,
  );
  await click("Unlock vault");
  await expect.poll(text).toContain("A fresh start.");
  await click("Scan this tab");
  await expect.poll(text, { timeout: 15000 }).toContain("Review import");
  await expect.poll(text).toContain("Screen");
  await mkdir("artifacts/screenshots", { recursive: true });
  await screenshot("tab-scan-preview");
  await click("Import 1 account(s)");
  await expect.poll(text).toContain("synthetic");
  checks++;
  console.log(
    "PASS genuine toolbar activeTab capture, QR decode, preview and import",
  );
  await click("Fill");
  await expect.poll(text).toContain("Approve this website?");
  await expect.poll(text).toContain("https://screen.example.test");
  await click("Approve website & fill");
  await expect.poll(text).toContain("Code filled");
  await expect(website.getByLabel("One-time code")).toHaveValue(/^\d{6}$/);
  expect(await website.evaluate(() => !!window.submitted)).toBe(false);
  await screenshot("tab-fill-approved");
  checks++;
  console.log(
    "PASS approved exact-origin fill via actual chrome.scripting, no submit",
  );
  const previous = await website.getByLabel("One-time code").inputValue();
  await click("Fill");
  await expect.poll(text).toContain("No single empty one-time-code field");
  expect(await website.getByLabel("One-time code").inputValue()).toBe(previous);
  checks++;
  console.log("PASS existing OTP field is never overwritten");
  await evaluate("window.close()");
  await website.bringToFront();
  const runFill = (origin = "https://screen.example.test") =>
    website.evaluate(
      ({ source, origin }) => {
        const fn = (0, eval)(`(${source})`); // Test harness only, never extension runtime.
        return fn(origin, "123456");
      },
      { source: fillCode.toString(), origin },
    );
  for (const html of [
    '<input autocomplete="one-time-code" value="keep">',
    '<input autocomplete="one-time-code"><input autocomplete="one-time-code">',
    '<input type="password" autocomplete="one-time-code">',
    '<input autocomplete="one-time-code" disabled>',
    '<input autocomplete="one-time-code" readonly>',
    '<input autocomplete="one-time-code" style="opacity:0">',
    '<div style="opacity:0"><input autocomplete="one-time-code"></div>',
    '<input autocomplete="one-time-code" maxlength="4">',
    '<input name="otp">',
  ]) {
    await website.setContent(html);
    expect(await runFill()).toBe(false);
  }
  await website.setContent('<input autocomplete="one-time-code">');
  expect(await runFill("https://other.example.test")).toBe(false);
  expect(await runFill()).toBe(true);
  checks++;
  console.log(
    "PASS ambiguous, hidden, disabled, password, short and unapproved fields rejected",
  );
  await writeFile(
    "artifacts/tab-actions-results.json",
    JSON.stringify(
      {
        checks,
        browser: context.browser().version(),
        nativeToolbarInvocation: true,
        addedTestPermissions: [],
        popup: target.type,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await writeFile("artifacts/tab-actions-failure.txt", String(error));
  throw error;
} finally {
  await context.close();
}
