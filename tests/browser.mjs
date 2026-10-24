import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHmac } from "node:crypto";
import QRCode from "qrcode";

const extension = resolve("dist");
const profile = await mkdtemp(join(tmpdir(), "otp-vault-test-"));
await mkdir("artifacts/screenshots", { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || undefined;
const launch = (directory = profile) =>
  chromium.launchPersistentContext(directory, {
    executablePath,
    channel: executablePath ? undefined : "chromium",
    headless: true,
    viewport: { width: 400, height: 760 },
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
let context = await launch();
let worker =
  context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
const id = new URL(worker.url()).hostname;
let page = await context.newPage();
const errors = [],
  network = [];
page.on("pageerror", (error) => errors.push(error.message));
context.on("request", (request) => {
  if (/^https?:/.test(request.url())) network.push(request.url());
});
const base = `chrome-extension://${id}/index.html?window`;
const password = "synthetic master passphrase only";
const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const uri = `otpauth://totp/GitHub:demo%40example.test?secret=${secret}&issuer=GitHub`;
let checks = 0;
async function check(name, action) {
  await action();
  checks++;
  console.log("PASS", name);
}
async function click(name) {
  await page.getByRole("button", { name, exact: true }).click();
}
async function unlock() {
  await page.getByLabel("Master password", { exact: true }).fill(password);
  await click("Unlock vault");
  await expect(
    page.getByRole("heading", { name: "Authenticator", exact: true }),
  ).toBeVisible();
}
async function importURI(value) {
  await click("Import accounts");
  await page.getByLabel("OTP URIs or export text").fill(value);
  await click("Preview import");
  await expect(page.getByRole("dialog")).toContainText("Review import");
  await click("Import 1 account(s)");
}
async function screenshot(name) {
  await page.screenshot({
    path: `artifacts/screenshots/${name}.png`,
    fullPage: true,
  });
}
try {
  await page.goto(base);
  await check("MV3 setup screen", async () => {
    await expect(
      page.getByRole("heading", { name: "Your codes. Your vault." }),
    ).toBeVisible();
    await screenshot("setup");
  });
  await check("password-encrypted setup", async () => {
    await page.getByLabel("Create a master password").fill(password);
    await page.getByLabel("Confirm master password").fill(password);
    await click("Create encrypted vault");
    await expect(page.getByText("A fresh start.")).toBeVisible();
    await screenshot("empty");
  });
  await check("standard URI preview and import", async () => {
    await importURI(uri);
    await expect(
      page.getByRole("heading", { name: "GitHub", exact: true }),
    ).toBeVisible();
  });
  await check("independent TOTP reference", async () => {
    const seconds = Math.floor(Date.now() / 1000),
      counter = BigInt(Math.floor(seconds / 30));
    const msg = Buffer.alloc(8);
    msg.writeBigUInt64BE(counter);
    const mac = createHmac("sha1", "12345678901234567890").update(msg).digest();
    const code = ((mac.readUInt32BE(mac.at(-1) & 15) & 0x7fffffff) % 1e6)
      .toString()
      .padStart(6, "0");
    await expect(page.locator(".account .otp")).toHaveText(
      code.slice(0, 3) + " " + code.slice(3),
    );
  });
  await check("favorite and search", async () => {
    await page
      .getByRole("button", {
        name: "Add favorite: GitHub demo@example.test",
        exact: true,
      })
      .click();
    await page.getByLabel("Search accounts", { exact: true }).fill("no match");
    await expect(page.getByText("No matching accounts")).toBeVisible();
    await page.getByLabel("Search accounts", { exact: true }).fill("");
    await expect(
      page.getByRole("heading", { name: "GitHub", exact: true }),
    ).toBeVisible();
  });
  await check("duplicate import preview", async () => {
    await click("Import accounts");
    await page.getByLabel("OTP URIs or export text").fill(uri);
    await click("Preview import");
    await expect(page.getByRole("dialog")).toContainText(
      "1 exact duplicate(s)",
    );
    await click("Close");
  });
  await check("malformed import preserves data", async () => {
    await click("Import accounts");
    await page.getByLabel("OTP URIs or export text").fill(uri + "\ninvalid");
    await click("Preview import");
    await expect(page.getByRole("status")).toContainText("Account 2");
    await click("Close");
    await expect(page.locator(".account")).toHaveCount(1);
  });
  await check("local QR image decoding", async () => {
    const qr = await QRCode.toBuffer(
      `otpauth://totp/QR:synthetic?secret=JBSWY3DPEHPK3PXP&issuer=QR`,
    );
    await click("Import accounts");
    await page.getByLabel("Read a QR image locally").setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: qr,
    });
    await expect(page.getByRole("dialog")).toContainText("Review import");
    await click("Import 1 account(s)");
    await expect(page.locator(".account")).toHaveCount(2);
  });
  await check("HOTP explicit advancement", async () => {
    await importURI(
      `otpauth://hotp/Counter:synthetic?secret=${secret}&counter=0&issuer=Counter`,
    );
    const row = page.locator(".account").filter({
      has: page.getByRole("heading", { name: "Counter", exact: true }),
    });
    await expect(row.locator(".otp")).toHaveText("755 224");
    await row
      .getByRole("button", { name: "Advance counter…", exact: true })
      .click();
    await click("Advance once");
    await expect(row.locator(".otp")).toHaveText("287 082");
  });
  await check("light appearance and accessible account list", async () => {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByLabel("Appearance", { exact: true }).selectOption("light");
    await page
      .getByRole("button", { name: "Authenticator", exact: true })
      .click();
    await screenshot("accounts-light");
    const results = await new AxeBuilder({ page })
      .setLegacyMode()
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    await writeFile(
      "artifacts/axe-light.json",
      JSON.stringify(results.violations, null, 2),
    );
    expect(results.violations).toEqual([]);
  });
  for (const theme of ["dark", "amoled"])
    await check(theme + " appearance and accessibility", async () => {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByLabel("Appearance", { exact: true }).selectOption(theme);
      await page
        .getByRole("button", { name: "Authenticator", exact: true })
        .click();
      if (theme === "amoled")
        expect(
          await page.evaluate(
            () => getComputedStyle(document.documentElement).backgroundColor,
          ),
        ).toBe("rgb(0, 0, 0)");
      await screenshot("accounts-" + theme);
      const results = await new AxeBuilder({ page })
        .setLegacyMode()
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      await writeFile(
        "artifacts/axe-" + theme + ".json",
        JSON.stringify(results.violations, null, 2),
      );
      expect(results.violations).toEqual([]);
    });
  let backupPath;
  await check("encrypted backup download", async () => {
    await page.getByRole("button", { name: "Recovery", exact: true }).click();
    await click("Create encrypted backup");
    await page
      .getByLabel("Backup passphrase", { exact: true })
      .fill("synthetic backup passphrase only");
    await page
      .getByLabel("Confirm backup passphrase", { exact: true })
      .fill("synthetic backup passphrase only");
    const waiting = page.waitForEvent("download");
    await click("Save encrypted file");
    const download = await waiting;
    backupPath = resolve("artifacts/synthetic-backup.json");
    await download.saveAs(backupPath);
    const content = await readFile(backupPath, "utf8");
    expect(content).not.toContain(secret);
    expect(JSON.parse(content).kind).toBe("backup");
  });
  await check("saved backup isolated restore verification", async () => {
    await click("Verify or restore a backup");
    await page
      .getByLabel("Encrypted backup file", { exact: true })
      .setInputFiles(backupPath);
    await page
      .getByLabel("Backup passphrase", { exact: true })
      .fill("synthetic backup passphrase only");
    await click("Decrypt & test restoration");
    await expect(page.getByRole("dialog")).toContainText(
      "3 account(s) decrypted",
    );
    await expect(page.getByRole("dialog")).toContainText(
      "Exact account snapshot match",
    );
    await screenshot("backup-verified");
    await click("Done");
  });
  await check("tampered backup refused", async () => {
    const data = JSON.parse(await readFile(backupPath, "utf8"));
    data.payload.ciphertext = "AAAA" + data.payload.ciphertext.slice(4);
    const path = resolve("artifacts/corrupted-backup.json");
    await writeFile(path, JSON.stringify(data));
    await click("Verify or restore a backup");
    await page
      .getByLabel("Encrypted backup file", { exact: true })
      .setInputFiles(path);
    await page
      .getByLabel("Backup passphrase", { exact: true })
      .fill("synthetic backup passphrase only");
    await click("Decrypt & test restoration");
    await expect(page.getByRole("status")).toContainText(
      "Authentication failed",
    );
    await click("Close");
  });
  await check("locked state hides metadata and codes", async () => {
    await click("Lock");
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain(
      "demo@example.test",
    );
    expect(await page.locator("body").innerText()).not.toContain("287 082");
    await screenshot("locked");
  });
  await check("incorrect password stays locked", async () => {
    await page
      .getByLabel("Master password", { exact: true })
      .fill("wrong synthetic password");
    await click("Unlock vault");
    await expect(page.getByRole("status")).toContainText(
      "Authentication failed",
    );
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
  });
  await check(
    "restart requires unlock and preserves HOTP counter",
    async () => {
      await context.close();
      context = await launch();
      worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent("serviceworker"));
      page = await context.newPage();
      await page.goto(base);
      await expect(
        page.getByRole("heading", { name: "Welcome back." }),
      ).toBeVisible();
      await unlock();
      await expect(page.locator(".account")).toHaveCount(3);
      const row = page.locator(".account").filter({
        has: page.getByRole("heading", { name: "Counter", exact: true }),
      });
      await expect(row.locator(".otp")).toHaveText("287 082");
    },
  );
  await check("encrypted IndexedDB and no session key storage", async () => {
    const data = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open("otp-vault", 1);
        r.onsuccess = () => resolve(r.result);
        r.onerror = reject;
      });
      const saved = await new Promise((resolve) => {
        const r = db.transaction("vault").objectStore("vault").get("active");
        r.onsuccess = () => resolve(r.result);
      });
      db.close();
      return {
        saved,
        local: await chrome.storage.local.get(null),
        session: await chrome.storage.session.get(null),
      };
    });
    expect(JSON.stringify(data)).not.toContain(secret);
    expect(JSON.stringify(data)).not.toContain("demo@example.test");
    expect(data.session).toEqual({});
  });
  await check("page reload drops unlocked keys", async () => {
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
  });
  await check("narrow viewport has no horizontal overflow", async () => {
    await page.setViewportSize({ width: 360, height: 640 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await unlock();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
  await check("recovery into an isolated fresh profile", async () => {
    await context.close();
    const recoveredProfile = await mkdtemp(join(tmpdir(), "otp-recovery-"));
    context = await launch(recoveredProfile);
    worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    context.on("request", (request) => {
      if (/^https?:/.test(request.url())) network.push(request.url());
    });
    await page.goto(base);
    await click("Restore an encrypted backup");
    await page
      .getByLabel("Encrypted backup file", { exact: true })
      .setInputFiles(backupPath);
    await page
      .getByLabel("Backup passphrase", { exact: true })
      .fill("synthetic backup passphrase only");
    await page
      .getByLabel("New master password", { exact: true })
      .fill(password);
    await page
      .getByLabel("Confirm new master password", { exact: true })
      .fill(password);
    await click("Test & recover accounts");
    await expect(page.locator(".account")).toHaveCount(3);
    const row = page.locator(".account").filter({
      has: page.getByRole("heading", { name: "Counter", exact: true }),
    });
    await expect(row.locator(".otp")).toHaveText("287 082");
    await screenshot("recovered-fresh-profile");
  });
  await check("eight-digit codes fit narrow and medium layouts", async () => {
    await importURI(
      "otpauth://totp/Eight:synthetic?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA&issuer=Eight&digits=8&algorithm=SHA256&period=45",
    );
    for (const width of [360, 600, 760, 1200]) {
      await page.setViewportSize({ width, height: 760 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await screenshot("desktop-eight-digit");
  });
  await check("no external requests during vault workflows", async () =>
    expect(network).toEqual([]),
  );
  await check("no uncaught browser errors", async () =>
    expect(errors).toEqual([]),
  );
  await writeFile(
    "artifacts/browser-results.json",
    JSON.stringify(
      {
        checks,
        browser: context.browser()?.version(),
        platform: process.platform,
        hardware: "No physical authenticators tested",
        networkRequests: network.length,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(`${checks} browser checks passed.`);
} catch (error) {
  await page.screenshot({
    path: "artifacts/screenshots/failure.png",
    fullPage: true,
  });
  await writeFile(
    "artifacts/browser-failure.txt",
    JSON.stringify(
      {
        error: String(error),
        body: await page.locator("body").innerText(),
        errors,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await context.close();
}
