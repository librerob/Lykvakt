import { extensionId } from "./extension-id.mjs";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHmac } from "node:crypto";
import QRCode from "qrcode";

const extension = resolve(process.env.EXTENSION_DIST || "dist");
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
const id = await extensionId(context);
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
  if (name === "Copy") {
    await page.locator(".row-copy").click({ position: { x: 12, y: 12 } });
    return;
  }
  if (
    name === "Import accounts" &&
    !(await page.getByRole("button", { name, exact: true }).count())
  )
    await page.getByRole("button", { name: "Backup", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
  if (name === "Lock")
    await expect(
      page.getByLabel("Master password", { exact: true }),
    ).toBeVisible();
}
async function unlock() {
  await expect(page.locator("#app")).toHaveAttribute("aria-busy", "false");
  if (
    await page
      .getByRole("button", { name: "Unlock vault", exact: true })
      .count()
  ) {
    await page.getByLabel("Master password", { exact: true }).fill(password);
    await click("Unlock vault");
  }
  await expect(
    page.getByRole("button", { name: "+ Add account", exact: true }),
  ).toBeVisible();
}
async function openImportOn(target) {
  if (
    !(await target
      .getByRole("button", { name: "Import accounts", exact: true })
      .count())
  )
    await target.getByRole("button", { name: "Backup", exact: true }).click();
  await target
    .getByRole("button", { name: "Import accounts", exact: true })
    .click();
}
async function closeImport() {
  await click("Close");
  await click("Authenticator");
}
async function storedVault() {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("otp-vault", 1);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("vault", "readonly"),
            get = tx.objectStore("vault").get("active");
          tx.oncomplete = () => {
            resolve(get.result);
            db.close();
          };
          tx.onabort = () => {
            reject(tx.error);
            db.close();
          };
        };
      }),
  );
}
async function importURI(value) {
  await click("Import accounts");
  await page.getByLabel("OTP URIs or export text").fill(value);
  await click("Preview import");
  await expect(page.getByRole("dialog")).toContainText("Review import");
  await click("Import 1 account(s)");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "+ Add account", exact: true }),
  ).toBeVisible();
}
async function openMore(row) {
  const details = row.locator(".account-more");
  if ((await details.getAttribute("open")) === null)
    await details.locator("summary").click();
}
async function plainPrimaryUI() {
  const text = await page.evaluate(() => {
    const body = document.body.cloneNode(true);
    body.querySelectorAll("[data-technical]").forEach((node) => node.remove());
    return body.textContent;
  });
  expect(text).not.toMatch(
    /\b(?:Argon2id|PBKDF2|KDF|AES|GCM|AAD|envelope|nonce|iterations|WASM)\b/i,
  );
}
async function keyboardDetails(scope = page, leaveOpen = false) {
  const blocks = scope.locator("details[data-technical]");
  const opened = [];
  for (let i = 0; i < (await blocks.count()); i++) {
    const block = blocks.nth(i);
    if (!(await block.isVisible())) continue;
    const summary = block.locator(":scope > summary");
    expect(
      await summary.evaluate((node) => node.tabIndex),
    ).toBeGreaterThanOrEqual(0);
    await summary.focus();
    if ((await block.getAttribute("open")) !== null)
      await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(block).toHaveAttribute("open", "");
    await expect(block.locator(":scope > p").first()).toBeVisible();
    opened.push(block);
  }
  await plainPrimaryUI();
  if (!leaveOpen)
    for (const block of opened.reverse()) {
      await block.locator(":scope > summary").focus();
      await page.keyboard.press("Enter");
      await expect(block).not.toHaveAttribute("open", "");
    }
}
async function documentationHelp() {
  await page
    .getByRole("button", { name: "Help & documentation", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "These tips work offline.",
  );
  const link = page.getByRole("link", {
    name: "Full documentation on GitHub",
    exact: true,
  });
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute(
    "href",
    "https://github.com/librerob/lykvakt/blob/main/docs/usage.md",
  );
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await link.focus();
  await expect(link).toBeFocused();
  await helpAxe("offline-help");
  await click("Close");
}
async function helpAxe(name) {
  const results = await new AxeBuilder({ page })
    .setLegacyMode()
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  await writeFile(
    "artifacts/axe-help-" + name + ".json",
    JSON.stringify(results.violations, null, 2),
  );
  expect(results.violations).toEqual([]);
}
async function screenshot(name) {
  const old = page.viewportSize();
  const popup = await page
    .locator("body")
    .evaluate((n) => n.classList.contains("popup-mode"));
  await page.setViewportSize({ width: 400, height: popup ? 580 : 700 });
  await page.screenshot({
    path: `artifacts/screenshots/${name}.png`,
    fullPage: false,
  });
  if (old) await page.setViewportSize(old);
}

// Playwright changes document clocks but not service-worker clocks. Keep the
// worker on the same synthetic timeline; the one-second lead absorbs transport
// and virtual-clock scheduling skew. Exact deadline boundaries have unit tests.
async function syncWorkerClock() {
  const time = (await page.evaluate(() => Date.now())) - 1000;
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  await worker.evaluate((now) => {
    const start = performance.now();
    Date.now = () => now + Math.floor(performance.now() - start);
  }, time);
}

async function sharedProfile(action) {
  const prior = page;
  const isolated = await launch(
    await mkdtemp(join(tmpdir(), "lykvakt-shared-")),
  );
  const reopen = async () => {
    const view = await isolated.newPage();
    view.on("pageerror", (error) => errors.push(error.message));
    await view.goto(`chrome-extension://${id}/index.html`);
    await expect(view.locator("#app")).toHaveAttribute("aria-busy", "false");
    return view;
  };
  try {
    page = await reopen();
    await page
      .getByLabel("Create a master password", { exact: true })
      .fill(password);
    await page
      .getByLabel("Confirm master password", { exact: true })
      .fill(password);
    await click("Create encrypted vault");
    await expect(
      page.getByRole("button", { name: "Lock", exact: true }),
    ).toBeVisible();
    await action({ isolated, reopen });
  } finally {
    await isolated.close();
    page = prior;
    await page.bringToFront();
  }
}

try {
  await page.clock.install();
  await syncWorkerClock();
  await page.goto(base);
  await check("MV3 setup screen", async () => {
    await expect(
      page.getByRole("heading", { name: "Your codes. Your vault." }),
    ).toBeVisible();
    await screenshot("setup");
  });
  await check(
    "setup uses the Lykvakt name without preview branding",
    async () => {
      const manifest = await page.evaluate(() => chrome.runtime.getManifest());
      expect(manifest.name).toBe("Lykvakt");
      expect(manifest.version).toBe("0.5.5");
      expect(manifest.version_name).toBeUndefined();
      await expect(page).toHaveTitle("Lykvakt");
      await expect(page.locator("body")).not.toContainText(
        /development preview|test accounts only|unaudited/i,
      );
    },
  );
  await check(
    "the suggested vault shortcut is assigned without a browser shortcut collision",
    async () => {
      const commands = await page.evaluate(() => chrome.commands.getAll());
      expect(
        commands.find((command) => command.name === "_execute_action")
          ?.shortcut,
      ).toBe(
        process.env.EXTENSION_DIST === "dist-edge"
          ? "Ctrl+Shift+7"
          : "Ctrl+Shift+Y",
      );
    },
  );
  await check(
    "setup focuses the password and offers one keyboard-accessible documentation link",
    async () => {
      await expect(
        page.getByLabel("Create a master password", { exact: true }),
      ).toBeFocused();
      const generator = await page.locator(".password-generator").boundingBox();
      const hint = await page
        .locator(".password-generator + .hint")
        .boundingBox();
      expect(hint.y - generator.y - generator.height).toBeGreaterThanOrEqual(8);
      await documentationHelp();
    },
  );
  await check(
    "setup generates a passphrase and shows it only until leaving the field",
    async () => {
      await click("Generate");
      const field = page.getByLabel("Create a master password", {
        exact: true,
      });
      await expect(field).not.toHaveValue("");
      const generated = await field.inputValue();
      expect(generated.length).toBeGreaterThanOrEqual(27);
      await expect(page.locator(".generated-passphrase")).toHaveText(generated);
      await expect(
        page.getByText(
          "Write this down before continuing. This passphrase is shown once.",
        ),
      ).toBeVisible();
      await page.getByLabel("Confirm master password", { exact: true }).focus();
      await expect(page.locator(".generated-passphrase")).toHaveCount(0);
      await expect(field).toHaveAttribute("type", "password");
    },
  );
  await check("password-encrypted setup", async () => {
    await page.getByLabel("Create a master password").fill(password);
    await page.getByLabel("Confirm master password").fill(password);
    await click("Create encrypted vault");
    await expect(page.getByText("A fresh start.")).toBeVisible();
    await screenshot("empty");
  });
  await check(
    "first-run guidance is keyboard accessible and dismissal survives reopening",
    async () => {
      const tips = page.getByRole("complementary", { name: "Getting started" });
      await expect(tips).toBeVisible();
      await expect(page.locator(".empty")).toHaveCount(1);
      await expect(
        page.getByLabel("Search accounts", { exact: true }),
      ).toBeHidden();
      await expect(
        page.getByRole("button", { name: "☆ Favorites", exact: true }),
      ).toBeHidden();
      await expect(page.locator(".backup-notice")).toBeHidden();
      await expect(
        page.getByRole("button", { name: "+ Add account", exact: true }),
      ).toBeFocused();
      await keyboardDetails();
      await click("Got it");
      await expect(tips).toHaveCount(0);
      await click("Lock");
      await page.reload();
      await expect(
        page.getByLabel("Master password", { exact: true }),
      ).toBeFocused();
      await unlock();
      await expect(tips).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "+ Add account", exact: true }),
      ).toBeFocused();
    },
  );
  await check("standard URI preview and import", async () => {
    await importURI(uri);
    await expect(
      page.getByRole("heading", { name: "GitHub", exact: true }),
    ).toBeVisible();
  });
  await check(
    "compact rows copy by keyboard, expose native More controls and show a stepped expiry ring",
    async () => {
      const row = page.locator(".account").first();
      expect(
        await row.evaluate((node) => node.getBoundingClientRect().height),
      ).toBeLessThanOrEqual(64);
      expect(
        await row.evaluate((node) => node.getBoundingClientRect().height),
      ).toBeLessThanOrEqual(56);
      expect(
        await row
          .locator(".otp")
          .evaluate((node) => getComputedStyle(node).borderTopWidth),
      ).toBe("0px");
      expect(
        await row
          .locator(".otp")
          .evaluate((node) => getComputedStyle(node).backgroundColor),
      ).toBe("rgba(0, 0, 0, 0)");
      const search = page.getByLabel("Search accounts", { exact: true });
      await search.focus();
      expect(
        await search.evaluate((node) => getComputedStyle(node).outlineWidth),
      ).toBe("2px");
      await row.locator(".row-copy").focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("status")).toContainText(
        "Copied code for GitHub demo@example.test",
      );
      await expect(row.locator(".otp")).toHaveText("••• •••");
      const more = row.locator(".account-more"),
        summary = more.locator("summary");
      const target = await summary.boundingBox();
      expect(target.width).toBeGreaterThanOrEqual(36);
      expect(target.height).toBeGreaterThanOrEqual(36);
      await expect(summary).toHaveAccessibleName(
        "More for GitHub demo@example.test",
      );
      await expect(summary).toHaveText("⋯");
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(more).toHaveAttribute("open", "");
      await expect(
        more.getByRole("button", { name: "Edit", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Enter");
      await expect(more).not.toHaveAttribute("open", "");
      const now = await page.evaluate(() => Date.now()),
        start = Math.floor(now / 30000) * 30000 + 30000;
      await page.clock.setSystemTime(start + 25000);
      await syncWorkerClock();
      await page.clock.runFor(1001);
      await expect(row).toHaveClass(/expiring/);
      await expect(row.locator(".ring-number")).toHaveText("4");
      await expect(row.locator(".remaining")).toHaveAccessibleName(
        /4 seconds remaining, expiring soon/,
      );
      expect(
        await row.locator("svg").evaluate((node) => node.namespaceURI),
      ).toBe("http://www.w3.org/2000/svg");
      await screenshot("accounts-expiring");
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(
        await row
          .locator(".ring-progress")
          .evaluate((node) => getComputedStyle(node).transitionDuration),
      ).toBe("0s");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.clock.setSystemTime(start + 31001);
      await syncWorkerClock();
    },
  );
  await check(
    "empty and whitespace search Enter never writes to the clipboard",
    async () => {
      const search = page.getByLabel("Search accounts", { exact: true });
      await page.evaluate(() => {
        globalThis.__originalClipboardWrite = navigator.clipboard.writeText;
        globalThis.__emptySearchWrites = 0;
        navigator.clipboard.writeText = async () => {
          globalThis.__emptySearchWrites++;
        };
      });
      try {
        for (const value of ["", "   "]) {
          await search.fill(value);
          await search.press("Enter");
          await expect(page.getByRole("status")).toContainText(
            "Type part of an account name, then press Enter to copy its code.",
          );
          expect(
            await page.evaluate(() => globalThis.__emptySearchWrites),
          ).toBe(0);
          await expect(page.locator(".account .otp")).toHaveText("••• •••");
        }
      } finally {
        await page.evaluate(() => {
          navigator.clipboard.writeText = globalThis.__originalClipboardWrite;
          delete globalThis.__originalClipboardWrite;
          delete globalThis.__emptySearchWrites;
        });
        await search.fill("");
      }
    },
  );
  await check(
    "search Enter copies a current code without reveal and Escape clears the search",
    async () => {
      const search = page.getByLabel("Search accounts", { exact: true });
      await expect(search).toBeFocused();
      await search.fill("GitHub");
      await search.press("Enter");
      await expect(page.getByRole("status")).toContainText(
        "Copied code for GitHub demo@example.test. Clipboard managers may keep a copy.",
      );
      await expect(page.locator(".account .otp")).toHaveText("••• •••");
      await search.press("Escape");
      await expect(search).toHaveValue("");
      await expect(search).toBeFocused();
    },
  );
  await check(
    "codes start hidden; copy does not reveal; keyboard reveal expires",
    async () => {
      const code = page.locator(".account .otp");
      await expect(code).toHaveText("••• •••");
      await expect(code).toHaveAccessibleName(
        "Reveal code for GitHub demo@example.test (hidden)",
      );
      await click("Copy");
      await expect(page.getByRole("status")).toContainText(
        "Copied code for GitHub demo@example.test. Clipboard managers may keep a copy.",
      );
      await expect(code).toHaveText("••• •••");
      await code.focus();
      await page.keyboard.press("Enter");
      await expect(code).toHaveText(/\d{3} \d{3}/);
      // A browser clock advances the reveal timer without a real 30-second wait.
      await code.click();
      await expect(code).toHaveText("••• •••");
      await code.click();
      await expect(code).toHaveText(/\d{3} \d{3}/);
      await page.clock.runFor(30_001);
      await syncWorkerClock();
      await expect(code).toHaveText("••• •••");
      await page.clock.resume();
      await syncWorkerClock();
    },
  );
  await check(
    "unverified accounts show a non-blocking Backup reminder",
    async () => {
      await expect(page.locator(".backup-notice")).toContainText(
        "Backup not verified.",
      );
      await expect(page.locator(".backup-notice")).toBeVisible();
      await click("Review backup");
      await expect(
        page.getByRole("heading", { name: "Backup", exact: true }),
      ).toBeVisible();
      await click("Authenticator");
    },
  );
  await check(
    "the slim backup reminder can be dismissed until lock",
    async () => {
      expect(
        (await page.locator(".backup-notice").boundingBox()).height,
      ).toBeLessThanOrEqual(32);
      await page
        .getByRole("button", { name: "Dismiss backup reminder", exact: true })
        .click();
      await expect(page.locator(".backup-notice")).toBeHidden();
      await click("Settings");
      await click("Authenticator");
      await expect(page.locator(".backup-notice")).toBeHidden();
      await click("Lock");
      await unlock();
      await expect(page.locator(".backup-notice")).toBeVisible();
    },
  );
  await check("independent TOTP reference", async () => {
    await page.locator(".account .otp").click();
    const seconds = await page.evaluate(() => Math.floor(Date.now() / 1000)),
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
    await openMore(page.locator(".account").first());
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
    await closeImport();
  });
  await check("malformed import preserves data", async () => {
    await click("Import accounts");
    await page.getByLabel("OTP URIs or export text").fill(uri + "\ninvalid");
    await click("Preview import");
    await expect(page.getByRole("status")).toContainText("Account 2");
    await closeImport();
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
  await check(
    "Google transfer QR batches require every part before preview",
    async () => {
      const transfers = [
        "otpauth-migration://offline?data=Cj4KFDEyMzQ1Njc4OTAxMjM0NTY3ODkwEhhHaXRIdWI6ZGVtb0BleGFtcGxlLnRlc3QaBkdpdEh1YiABKAEwAhABGAIgACh7",
        "otpauth-migration://offline?data=CiQKCkhlbGxvId6tvu8SDFFSOnN5bnRoZXRpYxoCUVIgASgBMAIQARgCIAEoew%3D%3D",
      ];
      const images = await Promise.all(
        transfers.map((uri, index) =>
          QRCode.toBuffer(uri).then((buffer) => ({
            name: `google-${index}.png`,
            mimeType: "image/png",
            buffer,
          })),
        ),
      );
      const beforeImport = await storedVault();
      await click("Import accounts");
      await page.getByLabel("Read a QR image locally").setInputFiles(images[0]);
      await expect(page.getByRole("status")).toContainText("all 2 QR codes");
      expect(await storedVault()).toEqual(beforeImport);
      await page.getByLabel("Read a QR image locally").setInputFiles(images);
      await expect(page.getByRole("dialog")).toContainText(
        "2 exact duplicate(s)",
      );
      await expect(page.getByRole("dialog")).toContainText("0 new account(s)");
      await closeImport();
      await expect(page.locator(".account")).toHaveCount(2);
    },
  );
  await check(
    "oversized Google transfer field lists are rejected without saving accounts",
    async () => {
      const before = await page.locator(".account").count();
      const raw = [];
      for (let field = 10; field < 3010; field++) {
        let tag = field * 8;
        do {
          raw.push((tag & 127) | (tag > 127 ? 128 : 0));
          tag = Math.floor(tag / 128);
        } while (tag);
        raw.push(1);
      }
      const transfer =
        "otpauth-migration://offline?data=" +
        encodeURIComponent(Buffer.from(raw).toString("base64"));
      await click("Import accounts");
      await page
        .getByLabel("Or select an export file", { exact: true })
        .setInputFiles({
          name: "synthetic-bounded-transfer.txt",
          mimeType: "text/plain",
          buffer: Buffer.from(transfer),
        });
      await click("Preview import");
      await expect(page.locator(".dialog-status")).toContainText(
        "Too many transfer fields",
      );
      await expect(page.getByRole("dialog")).not.toContainText("Review import");
      await closeImport();
      await expect(page.locator(".account")).toHaveCount(before);
    },
  );
  await check("account QR export round trip", async () => {
    const row = page
      .locator(".account")
      .filter({ has: page.getByRole("heading", { name: "QR", exact: true }) });
    await openMore(row);
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await click("Show transfer QR…");
    const deniedDownloads = [];
    const recordDenied = (download) => deniedDownloads.push(download);
    page.on("download", recordDenied);
    await page
      .getByLabel("Master password", { exact: true })
      .fill("wrong synthetic password");
    await click("Reveal QR");
    await expect(page.getByRole("status")).toContainText(
      "Authentication failed",
    );
    expect({
      qrImages: await page.locator(".transfer-qr").count(),
      downloads: deniedDownloads.length,
    }).toEqual({ qrImages: 0, downloads: 0 });
    page.off("download", recordDenied);
    await page.getByLabel("Master password", { exact: true }).fill(password);
    await click("Reveal QR");
    const source = await page.locator(".transfer-qr").getAttribute("src");
    expect(source).toMatch(/^data:image\/png;base64,/);
    await closeImport();
    await click("Import accounts");
    await page.getByLabel("Read a QR image locally").setInputFiles({
      name: "roundtrip.png",
      mimeType: "image/png",
      buffer: Buffer.from(source.split(",")[1], "base64"),
    });
    await expect(page.getByRole("dialog")).toContainText(
      "1 exact duplicate(s)",
    );
    await closeImport();
  });
  await check(
    "portable bulk export includes precise OTP settings",
    async () => {
      await click("Backup");
      await click("Export plaintext OTP links…");
      const deniedDownloads = [];
      const recordDenied = (download) => deniedDownloads.push(download);
      page.on("download", recordDenied);
      await page
        .getByLabel("Master password", { exact: true })
        .fill("wrong synthetic password");
      await click("Export all OTP links");
      await expect(page.getByRole("status")).toContainText(
        "Authentication failed",
      );
      expect({
        passwordPrompt: await page
          .getByLabel("Master password", { exact: true })
          .isVisible(),
        downloads: deniedDownloads.length,
      }).toEqual({ passwordPrompt: true, downloads: 0 });
      page.off("download", recordDenied);
      await page.getByLabel("Master password", { exact: true }).fill(password);
      const waiting = page.waitForEvent("download");
      await click("Export all OTP links");
      const download = await waiting;
      const path = resolve("artifacts/synthetic-otp-links.txt");
      await download.saveAs(path);
      const content = await readFile(path, "utf8");
      expect(content.trim().split("\n")).toHaveLength(2);
      expect(content).toContain("secret=" + secret);
      await click("Authenticator");
    },
  );
  await check("HOTP explicit advancement", async () => {
    await importURI(
      `otpauth://hotp/Counter:synthetic?secret=${secret}&counter=0&issuer=Counter`,
    );
    const row = page.locator(".account").filter({
      has: page.getByRole("heading", { name: "Counter", exact: true }),
    });
    await row.locator(".otp").click();
    await expect(row.locator(".otp")).toHaveText("755 224");
    await openMore(row);
    await row
      .getByRole("button", { name: "Advance counter…", exact: true })
      .click();
    await click("Advance once");
    await expect(row.locator(".otp")).toHaveText("••• •••");
    await row.locator(".otp").click();
    await expect(row.locator(".otp")).toHaveText("287 082");
  });
  await check(
    "removed capabilities are absent from the manifest and settings",
    async () => {
      const manifest = await page.evaluate(() => chrome.runtime.getManifest());
      expect(manifest.permissions).toEqual([
        "clipboardWrite",
        "storage",
        "alarms",
      ]);
      expect(manifest.optional_permissions).toBeUndefined();
      expect(manifest.background).toEqual({
        service_worker: "background.js",
        type: "module",
      });
      expect(manifest.host_permissions).toBeUndefined();
      expect(manifest.content_scripts).toBeUndefined();
      expect(manifest.externally_connectable).toBeUndefined();
      await expect(
        page.getByRole("button", { name: "Fill", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Scan this tab", exact: true }),
      ).toHaveCount(0);
      await click("Settings");
      await expect(
        page.getByText("Experimental passkey unlock", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Website awareness", exact: true }),
      ).toHaveCount(0);
      await click("Authenticator");
    },
  );
  await check("amoled appearance and accessibility", async () => {
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).backgroundColor,
      ),
    ).toBe("rgb(0, 0, 0)");
    await screenshot("accounts-amoled");
    const results = await new AxeBuilder({ page })
      .setLegacyMode()
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    await writeFile(
      "artifacts/axe-amoled.json",
      JSON.stringify(results.violations, null, 2),
    );
    expect(results.violations).toEqual([]);
  });
  await check(
    "change-password and backup forms generate only new passwords",
    async () => {
      await click("Settings");
      await click("Change master password");
      await click("Generate");
      await expect(
        page.getByLabel("New master password", { exact: true }),
      ).not.toHaveValue("");
      const generated = await page
        .getByLabel("New master password", { exact: true })
        .inputValue();
      expect(generated.length).toBeGreaterThanOrEqual(27);
      await expect(page.locator(".generated-passphrase")).toHaveText(generated);
      await expect(
        page.getByLabel("Current master password", { exact: true }),
      ).toHaveValue("");
      await click("Close");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await click("Backup");
      await click("Create encrypted backup");
      await click("Generate");
      await expect(
        page.getByLabel("Backup passphrase", { exact: true }),
      ).not.toHaveValue("");
      const backup = await page
        .getByLabel("Backup passphrase", { exact: true })
        .inputValue();
      expect(backup.length).toBeGreaterThanOrEqual(27);
      await expect(page.locator(".generated-passphrase")).toHaveText(backup);
      await click("Close");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    },
  );
  await check(
    "encrypted backup creation requires the current master password",
    async () => {
      await click("Backup");
      await click("Create encrypted backup");
      await page
        .getByLabel("Master password", { exact: true })
        .fill("wrong synthetic password");
      await page
        .getByLabel("Backup passphrase", { exact: true })
        .fill("synthetic backup passphrase only");
      await page
        .getByLabel("Confirm backup passphrase", { exact: true })
        .fill("synthetic backup passphrase only");
      let downloads = 0;
      const count = () => downloads++;
      page.on("download", count);
      try {
        await click("Save encrypted file");
        await expect(page.locator(".dialog-status")).toContainText(
          "password didn't work",
        );
        await expect(
          page.getByLabel("Master password", { exact: true }),
        ).toHaveValue("");
        expect(downloads).toBe(0);
      } finally {
        page.off("download", count);
        await click("Close");
      }
    },
  );
  let backupPath;
  await check("encrypted backup download", async () => {
    await page.getByRole("button", { name: "Backup", exact: true }).click();
    await click("Create encrypted backup");
    await page.getByLabel("Master password", { exact: true }).fill(password);
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
  await check(
    "a near-limit encrypted file restores all 2000 accounts without replacing the active vault",
    async () => {
      await click("Verify or restore a backup");
      await page
        .getByLabel("Encrypted backup file", { exact: true })
        .setInputFiles(resolve("artifacts/review-large-backup.json"));
      await page
        .getByLabel("Backup passphrase", { exact: true })
        .fill("synthetic large backup password");
      await click("Decrypt & test restoration");
      await expect(page.getByRole("dialog")).toContainText(
        "2000 account(s) decrypted",
        { timeout: 60000 },
      );
      await expect(page.getByRole("dialog")).toContainText(
        "This file differs from the current vault",
      );
      await expect(page.locator(".account")).toHaveCount(0);
      await click("Done");
    },
  );
  await check(
    "a verified snapshot clears the reminder until an account changes",
    async () => {
      await click("Authenticator");
      await expect(page.locator(".backup-notice")).toBeHidden();
      await openMore(
        page.locator(".account").filter({
          has: page.getByRole("heading", { name: "GitHub", exact: true }),
        }),
      );
      const star = page.getByRole("button", { name: /favorite: GitHub/ });
      const original = await star.getAttribute("aria-label");
      await star.click();
      await expect(
        page
          .locator(".account")
          .filter({
            has: page.getByRole("heading", { name: "GitHub", exact: true }),
          })
          .locator(".favorite"),
      ).not.toHaveAttribute("aria-label", original);
      await openMore(
        page.locator(".account").filter({
          has: page.getByRole("heading", { name: "GitHub", exact: true }),
        }),
      );
      await expect(
        page.getByRole("button", { name: original, exact: true }),
      ).toHaveCount(0);
      await expect(page.locator(".backup-notice")).toBeVisible();
      await star.click();
      await expect(
        page
          .locator(".account")
          .filter({
            has: page.getByRole("heading", { name: "GitHub", exact: true }),
          })
          .locator(".favorite"),
      ).toHaveAttribute("aria-label", original);
      await openMore(
        page.locator(".account").filter({
          has: page.getByRole("heading", { name: "GitHub", exact: true }),
        }),
      );
      await expect(
        page.getByRole("button", { name: original, exact: true }),
      ).toBeVisible();
      await expect(page.locator(".backup-notice")).toBeHidden();
      await click("Backup");
    },
  );
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
      page = await context.newPage();
      await page.clock.install();
      await syncWorkerClock();
      await page.goto(base);
      await expect(
        page.getByRole("heading", { name: "Welcome back." }),
      ).toBeVisible();
      await unlock();
      await expect(page.locator(".account")).toHaveCount(3);
      const row = page.locator(".account").filter({
        has: page.getByRole("heading", { name: "Counter", exact: true }),
      });
      await row.locator(".otp").click();
      await expect(row.locator(".otp")).toHaveText("287 082");
    },
  );
  await check("encrypted IndexedDB and minimal permissions", async () => {
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
        permissions: chrome.runtime.getManifest().permissions,
      };
    });
    expect(JSON.stringify(data)).not.toContain(secret);
    expect(JSON.stringify(data)).not.toContain("demo@example.test");
    expect(data.permissions).toEqual(["clipboardWrite", "storage", "alarms"]);
  });
  await check(
    "page reload restores only an unexpired shared unlock session",
    async () => {
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Lock", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Master password", { exact: true }),
      ).toHaveCount(0);
    },
  );
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
    page = await context.newPage();
    await page.clock.install();
    await syncWorkerClock();
    page.on("pageerror", (error) => errors.push(error.message));
    context.on("request", (request) => {
      if (/^https?:/.test(request.url())) network.push(request.url());
    });
    await page.goto(base);
    await click("Restore an encrypted backup");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Generate", exact: true })
      .click();
    await expect(
      page.getByLabel("New master password", { exact: true }),
    ).not.toHaveValue("");
    const generatedMaster = await page
      .getByLabel("New master password", { exact: true })
      .inputValue();
    expect(generatedMaster.length).toBeGreaterThanOrEqual(27);
    await expect(
      page.getByLabel("Backup passphrase", { exact: true }),
    ).toHaveValue("");
    await expect(page.locator(".generated-passphrase")).toHaveText(
      generatedMaster,
    );
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
    await row.locator(".otp").click();
    await expect(row.locator(".otp")).toHaveText("287 082");
    await screenshot("recovered-fresh-profile");
  });
  await check(
    "reveal clears on view changes and lock; always-show preference persists",
    async () => {
      await click("Authenticator");
      const codes = page.locator(".account .otp");
      await expect(codes.first()).toHaveText("••• •••");
      await codes.first().click();
      await expect(codes.first()).toHaveText(/\d{3} \d{3}/);
      await click("Settings");
      const preference = page.getByLabel("Always show codes", { exact: true });
      await expect(preference).not.toBeChecked();
      await click("Authenticator");
      await expect(codes.first()).toHaveText("••• •••");
      await codes.first().click();
      await click("Lock");
      await unlock();
      await expect(codes.first()).toHaveText("••• •••");
      await click("Settings");
      await preference.check();
      await click("Authenticator");
      await expect(codes.first()).toHaveText(/\d{3} \d{3}/);
      await page.reload();
      await unlock();
      await expect(codes.first()).toHaveText(/\d{3} \d{3}/);
      await click("Settings");
      await expect(preference).toBeChecked();
      await preference.uncheck();
      await click("Authenticator");
      await expect(codes.first()).toHaveText("••• •••");
    },
  );
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
  await check(
    "optional next-code preview preserves masking, settings and current-only copy",
    async () => {
      await click("Settings");
      const setting = page.getByLabel("Show next code", { exact: true });
      await expect(setting).not.toBeChecked();
      await setting.check();
      await click("Authenticator");
      const row = page.locator(".account").filter({
        has: page.getByRole("heading", { name: "Eight", exact: true }),
      });
      const next = row.locator(".next-code");
      await expect(row.locator(".otp")).toHaveText("••• •••");
      await expect(next).toBeHidden();
      await row.locator(".otp").click();
      await expect(next).toBeVisible();
      await expect(next).toHaveAccessibleName(
        "Next code, valid after the current one expires",
      );
      await expect
        .poll(async () => {
          const now = await page.evaluate(() => Date.now());
          const message = Buffer.alloc(8);
          message.writeBigUInt64BE(BigInt(Math.floor(now / 45_000) + 1));
          const mac = createHmac("sha256", "12345678901234567890123456789012")
            .update(message)
            .digest();
          const value = ((mac.readUInt32BE(mac.at(-1) & 15) & 0x7fffffff) % 1e8)
            .toString()
            .padStart(8, "0");
          return (
            (await row.locator(".next-code-value").textContent()) ===
            value.slice(0, 4) + " " + value.slice(4)
          );
        })
        .toBe(true);
      await row.locator(".row-copy").click({ position: { x: 12, y: 12 } });
      await expect(page.getByRole("status")).toContainText(
        "Copied code for Eight synthetic. Clipboard managers may keep a copy.",
      );
      await row.locator(".otp").click();
      await expect(next).toBeHidden();
      await expect(row.locator(".next-code-value")).toHaveText("");
      const hotp = page.locator(".account").filter({
        has: page.getByRole("heading", { name: "Counter", exact: true }),
      });
      await expect(hotp.locator(".next-code")).toHaveCount(0);
      await page.setViewportSize({ width: 360, height: 760 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.reload();
      await unlock();
      await expect(next).toBeHidden();
      await click("Settings");
      await expect(setting).toBeChecked();
      await setting.uncheck();
      await click("Authenticator");
    },
  );
  await check(
    "settings, backup and export remain keyboard accessible with axe checks",
    async () => {
      await click("Settings");
      await keyboardDetails(page, true);
      await helpAxe("settings");
      await keyboardDetails();
      await click("Backup");
      await expect(
        page.getByText(
          "Backups made with this version need this version or newer to restore.",
          { exact: true },
        ),
      ).toBeVisible();
      await keyboardDetails(page, true);
      await helpAxe("recovery");
      await keyboardDetails();
      for (const name of [
        "Create encrypted backup",
        "Verify or restore a backup",
        "Export plaintext OTP links…",
      ]) {
        await click(name);
        await keyboardDetails(page.getByRole("dialog"));
        await click("Close");
      }
      await click("Authenticator");
      for (const name of ["+ Add account", "Import accounts"]) {
        await click(name);
        await keyboardDetails(page.getByRole("dialog"));
        await click("Close");
      }
      await click("Authenticator");
      await openMore(page.locator(".account").first());
      await page
        .locator(".account")
        .first()
        .getByRole("button", { name: "Edit", exact: true })
        .click();
      await click("Show transfer QR…");
      await keyboardDetails(page.getByRole("dialog"));
      await click("Close");
    },
  );
  await check(
    "older vault requires explicit recovery confirmation",
    async () => {
      const revision = await page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => {
          const r = indexedDB.open("otp-vault", 1);
          r.onsuccess = () => resolve(r.result);
          r.onerror = reject;
        });
        try {
          return await new Promise((resolve, reject) => {
            const tx = db.transaction("vault", "readwrite"),
              store = tx.objectStore("vault");
            const active = store.get("active"),
              previous = store.get("previous");
            active.onsuccess = () =>
              store.put(
                {
                  ...active.result,
                  payload: { ...active.result.payload, ciphertext: "bad" },
                },
                "active",
              );
            tx.oncomplete = () => resolve(previous.result.revision);
            tx.onabort = tx.onerror = reject;
          });
        } finally {
          db.close();
        }
      });
      await page.reload();
      await expect(
        page.getByText(
          `The current vault could not be read. An older copy from revision ${revision} exists. Unlock it to recover?`,
        ),
      ).toBeVisible();
      await expect(
        page.getByText(
          "If you use counter-based (HOTP) accounts, their counters may be behind. Do not reuse codes you already submitted.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Unlock vault", exact: true }),
      ).toHaveCount(0);
      await expect(page.locator(".account")).toHaveCount(0);
      await page
        .getByLabel("Master password", { exact: true })
        .fill("wrong synthetic password");
      await click("Unlock older copy");
      await expect(page.getByRole("status")).toContainText(
        "Authentication failed",
      );
      await expect(page.locator(".account")).toHaveCount(0);
      await keyboardDetails();
      await page.getByLabel("Master password", { exact: true }).fill(password);
      await click("Unlock older copy");
      await expect(page.locator(".account")).toHaveCount(3);
      await openMore(
        page.locator(".account").filter({
          has: page.getByRole("heading", { name: "GitHub", exact: true }),
        }),
      );
      const star = page.getByRole("button", { name: /favorite: GitHub/ });
      const original = await star.getAttribute("aria-label");
      await star.click();
      await expect(
        page
          .locator(".account")
          .filter({
            has: page.getByRole("heading", { name: "GitHub", exact: true }),
          })
          .locator(".favorite"),
      ).not.toHaveAttribute("aria-label", original);
      await openMore(
        page.locator(".account").filter({
          has: page.getByRole("heading", { name: "GitHub", exact: true }),
        }),
      );
      await expect(
        page.getByRole("button", { name: original, exact: true }),
      ).toHaveCount(0);
      await click("Lock");
      await unlock();
      await expect(page.locator(".account")).toHaveCount(3);
    },
  );
  await check(
    "earlier previews show migration help, never recover automatically, and erase only after confirmation",
    async () => {
      const prior = page,
        isolated = await launch(
          await mkdtemp(join(tmpdir(), "otp-old-format-")),
        );
      isolated.on("request", (request) => {
        if (/^https?:/.test(request.url())) network.push(request.url());
      });
      page = await isolated.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.goto(base);
        await page
          .getByLabel("Create a master password", { exact: true })
          .fill(password);
        await page
          .getByLabel("Confirm master password", { exact: true })
          .fill(password);
        await click("Create encrypted vault");
        await expect(
          page.getByRole("button", { name: "+ Add account", exact: true }),
        ).toBeVisible({ timeout: 60000 });
        const old = {
          format: "otp-vault",
          version: 1,
          id: "earlier-preview",
          revision: 9,
        };
        async function records(replace) {
          return page.evaluate(async (replacement) => {
            const db = await new Promise((resolve, reject) => {
              const r = indexedDB.open("otp-vault", 1);
              r.onsuccess = () => resolve(r.result);
              r.onerror = () => reject(r.error);
            });
            try {
              return await new Promise((resolve, reject) => {
                const tx = db.transaction(
                    "vault",
                    replacement ? "readwrite" : "readonly",
                  ),
                  store = tx.objectStore("vault");
                const active = store.get("active"),
                  previous = store.get("previous");
                if (replacement)
                  active.onsuccess = () => {
                    store.put(active.result, "previous");
                    store.put(replacement, "active");
                  };
                tx.oncomplete = () =>
                  resolve({
                    active: replacement || active.result,
                    previous: replacement ? active.result : previous.result,
                  });
                tx.onabort = tx.onerror = () => reject(tx.error);
              });
            } finally {
              db.close();
            }
          }, replace);
        }
        const expected = await records(old);
        await page.reload();
        await expect(
          page.getByRole("heading", { name: "Earlier preview", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText("This vault was made by an earlier preview", {
            exact: false,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Unlock older copy", exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByLabel("Master password", { exact: true }),
        ).toHaveCount(0);
        expect(await records()).toEqual(expected);
        await keyboardDetails();
        await helpAxe("old-format");
        await screenshot("old-format");
        await click("Erase the old vault and start fresh");
        await expect(page.getByRole("dialog")).toContainText(
          "permanently removes",
        );
        expect(await records()).toEqual(expected);
        await click("Close");
        expect(await records()).toEqual(expected);
        await click("Erase the old vault and start fresh");
        await click("Erase old vault");
        await expect(
          page.getByLabel("Create a master password", { exact: true }),
        ).toBeVisible();
        expect(await records()).toEqual({
          active: undefined,
          previous: undefined,
        });
        await page
          .getByLabel("Create a master password", { exact: true })
          .fill(password);
        await page
          .getByLabel("Confirm master password", { exact: true })
          .fill(password);
        await click("Create encrypted vault");
        await expect(
          page.getByRole("button", { name: "+ Add account", exact: true }),
        ).toBeVisible({ timeout: 60000 });
        const before = await records();
        await click("Backup");
        await click("Verify or restore a backup");
        await page
          .getByLabel("Encrypted backup file", { exact: true })
          .setInputFiles({
            name: "earlier-preview.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify({ ...old, kind: "backup" })),
          });
        await page
          .getByLabel("Backup passphrase", { exact: true })
          .fill("synthetic earlier backup password");
        await click("Decrypt & test restoration");
        await expect(page.getByRole("status")).toContainText(
          "made by an earlier preview",
        );
        await expect(
          page.getByLabel("Backup passphrase", { exact: true }),
        ).toHaveValue("");
        await keyboardDetails(page.getByRole("dialog"));
        expect(await records()).toEqual(before);
        await click("Close");
      } finally {
        await isolated.close();
        page = prior;
        await page.bringToFront();
      }
    },
  );
  await check(
    "auto-detected formats preview locally, unknown files explain the next step, and encrypted files require the source password",
    async () => {
      const prior = page;
      const isolated = await launch(
        await mkdtemp(join(tmpdir(), "lykvakt-imports-")),
      );
      isolated.on("request", (request) => {
        if (/^https?:/.test(request.url())) network.push(request.url());
      });
      page = await isolated.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.goto(base);
        await page
          .getByLabel("Create a master password", { exact: true })
          .fill(password);
        await page
          .getByLabel("Confirm master password", { exact: true })
          .fill(password);
        await click("Create encrypted vault");
        await expect(
          page.getByRole("button", { name: "+ Add account", exact: true }),
        ).toBeVisible({ timeout: 60000 });
        const previewFile = async (name) => {
          await click("Import accounts");
          await expect(
            page.getByLabel("Import format", { exact: true }),
          ).toHaveCount(0);
          await page
            .getByLabel("Or select an export file", { exact: true })
            .setInputFiles(resolve("tests/fixtures/" + name));
          await click("Preview import");
        };
        for (const [name, title, count] of [
          ["andotp.json", "andOTP plaintext JSON", 1],
          ["bitwarden.json", "Bitwarden JSON (OTP fields only)", 2],
          ["raivo.json", "Raivo OTP JSON", 1],
          ["proton.json", "Proton Authenticator plaintext JSON", 1],
          ["stratum.json", "Stratum plaintext JSON", 1],
          ["aegis.json", "Aegis", 2],
          ["2fas.json", "2FAS", 1],
          ["ente.txt", "OTP links", 1],
          ["freeotp.txt", "OTP links", 1],
          ["freeotpplus.txt", "OTP links", 1],
        ]) {
          await previewFile(name);
          await expect(page.getByRole("dialog")).toContainText(
            "Detected format: " + title,
          );
          await expect(page.getByRole("dialog")).toContainText(
            count + " new account(s)",
          );
          if (name === "bitwarden.json")
            await expect(page.getByRole("dialog")).toContainText(
              "1 skipped entry(s)",
            );
          await closeImport();
          await expect(page.locator(".account")).toHaveCount(0);
        }
        await click("Import accounts");
        await page
          .getByLabel("OTP URIs or export text")
          .fill('{"unrelated":"synthetic"}');
        await click("Preview import");
        await expect(page.getByRole("status")).toContainText(
          "couldn't recognise",
        );
        await keyboardDetails(page.getByRole("dialog"), true);
        await helpAxe("import-help");
        await screenshot("import-help");
        await closeImport();
        for (const name of ["aegis", "2fas"]) {
          const beforeRead = await storedVault();
          await previewFile(name + "-encrypted.json");
          const source = page.getByLabel("Export file password", {
            exact: true,
          });
          await expect(source).toBeVisible();
          await source.fill("wrong source password");
          await click("Preview import");
          await expect(page.getByRole("status")).toContainText(
            "password didn't work",
          );
          await expect(source).toHaveValue("");
          expect(await storedVault()).toEqual(beforeRead);
          await expect(page.locator(".account")).toHaveCount(0);
          await source.fill("synthetic source password å");
          await click("Preview import");
          await expect(page.getByRole("dialog")).toContainText("Review import");
          await expect(page.getByRole("dialog")).toContainText(
            "Detected format: " + (name === "aegis" ? "Aegis" : "2FAS"),
          );
          expect(await storedVault()).toEqual(beforeRead);
          await closeImport();
          await expect(page.locator(".account")).toHaveCount(0);
        }
        await previewFile("steam.maFile");
        await expect(page.getByRole("dialog")).toContainText(
          "Steam · 5 characters · 30 seconds",
        );
        await click("Import 1 account(s)");
        const row = page.locator(".account");
        await expect(row).toHaveCount(1);
        await expect(row.locator(".otp")).toHaveText("•• •••");
        await row.locator(".row-copy").click({ position: { x: 12, y: 12 } });
        await expect(page.getByRole("status")).toContainText(
          "Copied code for Steam synthetic-steam",
        );
        await expect(row.locator(".otp")).toHaveText("•• •••");
        await click("Settings");
        await page.getByLabel("Show next code", { exact: true }).check();
        await click("Authenticator");
        await row.locator(".otp").click();
        await expect(row.locator(".otp")).toHaveText(
          /^[23456789BCDFGHJKMNPQRTVWXY]{2} [23456789BCDFGHJKMNPQRTVWXY]{3}$/,
        );
        await expect(row.locator(".next-code")).toBeVisible();
        await expect(row.locator(".next-code-value")).toHaveText(
          /^[23456789BCDFGHJKMNPQRTVWXY]{2} [23456789BCDFGHJKMNPQRTVWXY]{3}$/,
        );
        await expect(row.locator(".remaining")).toHaveAccessibleName(
          /seconds remaining/,
        );
        await helpAxe("steam-codes");
        await screenshot("steam-codes");
        await openMore(row);
        await row.getByRole("button", { name: "Edit", exact: true }).click();
        await click("Show transfer QR…");
        await page
          .getByLabel("Master password", { exact: true })
          .fill(password);
        await click("Reveal QR");
        await expect(page.getByRole("dialog")).toContainText(
          "Only apps supporting otpauth://steam",
        );
        const image = await page.locator(".transfer-qr").getAttribute("src");
        await click("Close");
        await click("Import accounts");
        await page
          .getByLabel("Read a QR image locally", { exact: true })
          .setInputFiles({
            name: "synthetic-steam.png",
            mimeType: "image/png",
            buffer: Buffer.from(image.split(",")[1], "base64"),
          });
        await expect(page.getByRole("dialog")).toContainText(
          "1 exact duplicate(s)",
        );
        await expect(page.getByRole("dialog")).toContainText(
          "0 new account(s)",
        );
        await click("Close");
        await click("Lock");
        await unlock();
        await expect(page.locator(".account .otp")).toHaveText("•• •••");
      } finally {
        await isolated.close();
        page = prior;
        await page.bringToFront();
      }
    },
  );
  await check(
    "compact row lanes stay separate for long names, all code lengths, large counters and Next at 360, 400 and 480 px",
    async () => {
      const prior = page,
        isolated = await launch(
          await mkdtemp(join(tmpdir(), "lykvakt-row-polish-")),
        );
      isolated.on("request", (request) => {
        if (/^https?:/.test(request.url())) network.push(request.url());
      });
      page = await isolated.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        const start = Date.UTC(2026, 0, 1);
        const worker =
          isolated.serviceWorkers()[0] ||
          (await isolated.waitForEvent("serviceworker"));
        const setWorkerTime = (time) =>
          worker.evaluate((now) => {
            Date.now = () => now;
          }, time);
        await setWorkerTime(start + 1000);
        await page.clock.setFixedTime(start + 1000);

        await page.goto(base);
        await page
          .getByLabel("Create a master password", { exact: true })
          .fill(password);
        await page
          .getByLabel("Confirm master password", { exact: true })
          .fill(password);
        await click("Create encrypted vault");
        await expect(
          page.getByRole("button", { name: "+ Add account", exact: true }),
        ).toBeVisible({ timeout: 60000 });
        await click("Got it");
        const issuer =
            "Long service name for a synthetic layout test " + "X".repeat(150),
          label = "synthetic-account-" + "y".repeat(175);
        const specs = [
          ["Clock", "synthetic-six", "totp", 6, "period=30"],
          ["Eight", "synthetic-eight", "totp", 8, "period=45"],
          ["Steam", "synthetic-five", "steam", 5, "period=30"],
          [
            "Counter",
            "synthetic-hotp",
            "hotp",
            6,
            "counter=18446744073709551614",
          ],
          [issuer, label, "totp", 6, "period=30"],
        ];
        const links = specs.map(
          ([issuer, label, type, digits, settings], index) =>
            `otpauth://${type}/${encodeURIComponent(issuer + ":" + label)}?secret=${"A".repeat(31) + "ABCDE"[index]}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${digits}&${settings}`,
        );
        await click("Import accounts");
        await page.getByLabel("OTP URIs or export text").fill(links.join("\n"));
        await click("Preview import");
        await click("Import 5 account(s)");
        await click("Settings");
        await page.getByLabel("Show next code", { exact: true }).check();
        await click("Authenticator");
        const rows = page.locator(".account");
        await expect(rows).toHaveCount(5);
        const assertLanes = async () => {
          for (const row of await rows.all()) {
            const geometry = await row.evaluate((row) => {
              const box = (node) => {
                const b = node.getBoundingClientRect();
                return { x: b.x, y: b.y, width: b.width, height: b.height };
              };
              const parts = [
                ".account-name",
                ".code-cell",
                ".remaining",
                ".account-more > summary",
              ].map((selector) => box(row.querySelector(selector)));
              const code = row.querySelector(".otp"),
                range = document.createRange();
              range.selectNodeContents(code);
              const next = row.querySelector(".next-code");
              return {
                parts,
                row: box(row),
                code: box(code),
                text: box(range),
                next: next && !next.hidden ? box(next) : null,
              };
            });
            expect(geometry.row.height).toBeLessThanOrEqual(56);
            expect(geometry.parts[3].width).toBeGreaterThanOrEqual(36);
            expect(geometry.parts[3].height).toBeGreaterThanOrEqual(36);
            for (let i = 0; i < geometry.parts.length - 1; i++)
              expect(
                geometry.parts[i].x + geometry.parts[i].width,
              ).toBeLessThanOrEqual(geometry.parts[i + 1].x);
            expect(geometry.text.x).toBeGreaterThanOrEqual(geometry.parts[1].x);
            expect(geometry.text.x + geometry.text.width).toBeLessThanOrEqual(
              geometry.parts[1].x + geometry.parts[1].width + 0.5,
            );
            if (geometry.next)
              expect(geometry.next.width).toBeLessThanOrEqual(
                geometry.parts[1].width,
              );
            expect(geometry.code.y).toBeGreaterThanOrEqual(geometry.row.y);
            expect(geometry.code.y + geometry.code.height).toBeLessThanOrEqual(
              geometry.row.y + geometry.row.height,
            );
          }
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
        };
        for (const width of [360, 400, 480]) {
          await page.setViewportSize({ width, height: 760 });
          for (const visible of [false, true]) {
            for (const row of await rows.all()) {
              const code = row.locator(".otp");
              if ((await code.getAttribute("aria-pressed")) !== String(visible))
                await code.click();
              await expect(code).toHaveAttribute(
                "aria-pressed",
                String(visible),
              );
            }
            await assertLanes();
            if (width === 400 && !visible) await screenshot("accounts-amoled");
            if (width === 400 && visible) {
              const long = rows.filter({
                has: page.getByRole("heading", { name: issuer, exact: true }),
              });
              await expect(long.locator("h2")).toHaveAttribute("title", issuer);
              await expect(long.locator(".account-name p")).toHaveAttribute(
                "title",
                label,
              );
              await expect(long.locator(".account-name")).toHaveAccessibleName(
                issuer + " " + label,
              );
              expect(
                await long
                  .locator("h2")
                  .evaluate((node) => getComputedStyle(node).textOverflow),
              ).toBe("ellipsis");
              await screenshot("long-name");
              await screenshot("steam-row");
            }
          }
        }
        await page.setViewportSize({ width: 400, height: 760 });
        await page.clock.setFixedTime(start + 26000);
        await setWorkerTime(start + 26000);
        const clock = rows.filter({
          has: page.getByRole("heading", { name: "Clock", exact: true }),
        });
        await expect(clock.locator(".ring-number")).toHaveText("4");
        await expect(clock.locator(".remaining")).toHaveAccessibleName(
          "4 seconds remaining, expiring soon",
        );
        await expect(clock.locator(".expiring-label")).toHaveCount(0);
        await assertLanes();
        await screenshot("accounts-expiring");
        for (const motion of ["no-preference", "reduce"]) {
          await page.emulateMedia({ reducedMotion: motion });
          const style = await clock
            .locator(".ring-progress")
            .evaluate((node) => ({
              animation: getComputedStyle(node).animationName,
              transition: getComputedStyle(node).transitionDuration,
            }));
          expect(style).toEqual({ animation: "none", transition: "0s" });
        }
        await helpAxe("compact-rows");
      } finally {
        await isolated.close();
        page = prior;
        await page.bringToFront();
      }
    },
  );
  await check(
    "Close and Escape cancel pending exports and password changes without downloads or writes",
    async () => {
      const prior = page,
        isolated = await launch(
          await mkdtemp(join(tmpdir(), "lykvakt-dialog-cancel-")),
        );
      isolated.on("request", (request) => {
        if (/^https?:/.test(request.url())) network.push(request.url());
      });
      page = await isolated.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      let downloads = 0;
      page.on("download", () => downloads++);
      try {
        await page.goto(base);
        await page
          .getByLabel("Create a master password", { exact: true })
          .fill(password);
        await page
          .getByLabel("Confirm master password", { exact: true })
          .fill(password);
        await click("Create encrypted vault");
        await expect(
          page.getByRole("button", { name: "+ Add account", exact: true }),
        ).toBeVisible({ timeout: 60000 });
        await click("Got it");
        await importURI(uri);
        const stored = () =>
          page.evaluate(
            () =>
              new Promise((resolve, reject) => {
                const r = indexedDB.open("otp-vault", 1);
                r.onerror = () => reject(r.error);
                r.onsuccess = () => {
                  const db = r.result,
                    tx = db.transaction("vault", "readonly"),
                    store = tx.objectStore("vault"),
                    a = store.get("active"),
                    p = store.get("previous");
                  tx.oncomplete = () => {
                    resolve({ active: a.result, previous: p.result });
                    db.close();
                  };
                  tx.onabort = () => reject(tx.error);
                };
              }),
          );
        const before = await stored();
        for (const kind of ["plaintext", "backup", "password", "qr"]) {
          if (kind === "password") {
            await click("Settings");
            await click("Change master password");
            await page
              .getByLabel("Current master password", { exact: true })
              .fill(password);
            await page
              .getByLabel("New master password", { exact: true })
              .fill("synthetic cancelled new master password");
            await page
              .getByLabel("Confirm new master password", { exact: true })
              .fill("synthetic cancelled new master password");
          } else if (kind === "qr") {
            await click("Authenticator");
            await openMore(page.locator(".account").first());
            await page
              .getByRole("button", { name: "Edit", exact: true })
              .click();
            await click("Show transfer QR…");
            await page
              .getByLabel("Master password", { exact: true })
              .fill(password);
          } else {
            await click("Backup");
            await click(
              kind === "backup"
                ? "Create encrypted backup"
                : "Export plaintext OTP links…",
            );
            await page
              .getByLabel("Master password", { exact: true })
              .fill(password);
            if (kind === "backup") {
              await page
                .getByLabel("Backup passphrase", { exact: true })
                .fill("synthetic cancelled backup password");
              await page
                .getByLabel("Confirm backup passphrase", { exact: true })
                .fill("synthetic cancelled backup password");
            }
          }
          await page.evaluate(() => {
            const post = Worker.prototype.postMessage;
            window.__reviewKdfTerminated = false;
            Worker.prototype.postMessage = function (...args) {
              Worker.prototype.postMessage = post;
              const worker = this,
                terminate = worker.terminate.bind(worker);
              worker.terminate = () => {
                window.__reviewKdfTerminated = true;
                terminate();
              };
              window.__releaseReviewKdf = () => {
                try {
                  post.apply(worker, args);
                } catch {}
                delete window.__releaseReviewKdf;
              };
            };
          });
          await click(
            kind === "password"
              ? "Change password"
              : kind === "qr"
                ? "Reveal QR"
                : kind === "backup"
                  ? "Save encrypted file"
                  : "Export all OTP links",
          );
          await expect
            .poll(() => page.evaluate(() => typeof window.__releaseReviewKdf))
            .toBe("function");
          if (kind === "qr") {
            await page.evaluate(() => {
              document
                .querySelector("dialog")
                .addEventListener("cancel", () => {
                  window.__reviewCancelledSynchronously =
                    window.__reviewKdfTerminated;
                });
            });
            await page.keyboard.press("Escape");
            expect(
              await page.evaluate(() => window.__reviewCancelledSynchronously),
            ).toBe(true);
          } else await click("Close");
          await expect(page.getByRole("dialog")).toHaveCount(0);
          await expect
            .poll(() => page.evaluate(() => window.__reviewKdfTerminated))
            .toBe(true);
          await page.evaluate(() => window.__releaseReviewKdf());
          expect(downloads).toBe(0);
          expect(await stored()).toEqual(before);
          await expect(page.locator(".transfer-qr")).toHaveCount(0);
        }
        await click("Lock");
        await unlock();
      } finally {
        await isolated.close();
        page = prior;
        await page.bringToFront();
      }
    },
  );
  await check(
    "incompatible transfer names require consent and do not rename saved accounts",
    async () => {
      const prior = page,
        isolated = await launch(
          await mkdtemp(join(tmpdir(), "lykvakt-transfer-names-")),
        );
      isolated.on("request", (request) => {
        if (/^https?:/.test(request.url())) network.push(request.url());
      });
      page = await isolated.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      let downloads = 0;
      page.on("download", () => downloads++);
      try {
        await page.goto(base);
        await page
          .getByLabel("Create a master password", { exact: true })
          .fill(password);
        await page
          .getByLabel("Confirm master password", { exact: true })
          .fill(password);
        await click("Create encrypted vault");
        await expect(
          page.getByRole("button", { name: "+ Add account", exact: true }),
        ).toBeVisible({ timeout: 60000 });
        await click("Got it");
        await click("+ Add account");
        await page
          .getByLabel("Service name", { exact: true })
          .fill("Example: Personal ");
        await page
          .getByLabel("Account identifier", { exact: true })
          .fill("alice:work");
        await page.getByLabel("Setup key", { exact: true }).fill(secret);
        await click("Preview account");
        await click("Import 1 account(s)");
        await click("Backup");
        await click("Export plaintext OTP links…");
        await expect(page.getByRole("dialog")).toContainText(
          "Your saved names will stay unchanged",
        );
        await page
          .getByLabel("Master password", { exact: true })
          .fill(password);
        await click("Export all OTP links");
        expect(downloads).toBe(0);
        await expect(page.getByRole("dialog")).toBeVisible();
        await page
          .getByLabel("Use these transfer names", { exact: true })
          .check();
        const waiting = page.waitForEvent("download");
        await click("Export all OTP links");
        const saved = await waiting;
        const path = resolve("artifacts/synthetic-transfer-names.txt");
        await saved.saveAs(path);
        const link = new URL((await readFile(path, "utf8")).trim());
        expect(link.searchParams.get("issuer")).toBe("Example  Personal");
        expect(decodeURIComponent(link.pathname)).toBe(
          "/Example  Personal:alice work",
        );
        expect(link.searchParams.get("secret")).toBe(secret);
        await click("Authenticator");
        await expect(page.locator(".account h2")).toHaveAttribute(
          "title",
          "Example: Personal ",
        );
        await expect(page.locator(".account-name p")).toHaveAttribute(
          "title",
          "alice:work",
        );
      } finally {
        await isolated.close();
        page = prior;
        await page.bringToFront();
      }
    },
  );
  await check(
    "password forms wait for vault metadata on setup and restart",
    async () => {
      const isolated = await launch(
        await mkdtemp(join(tmpdir(), "lykvakt-load-gate-")),
      );
      const startup = await isolated.newPage();
      startup.on("pageerror", (error) => errors.push(error.message));
      try {
        await startup.addInitScript(() => {
          const open = indexedDB.open.bind(indexedDB);
          let first = true;
          indexedDB.open = (...args) => {
            const request = open(...args);
            if (first) {
              first = false;
              Object.defineProperty(request, "onsuccess", {
                configurable: true,
                set(handler) {
                  request.addEventListener(
                    "success",
                    (event) => {
                      window.__releaseVaultLoad = () => {
                        delete window.__releaseVaultLoad;
                        handler.call(request, event);
                      };
                    },
                    { once: true },
                  );
                },
              });
            }
            return request;
          };
        });
        for (const existing of [false, true]) {
          if (existing) {
            await startup
              .getByRole("button", { name: "Lock", exact: true })
              .click();
            await startup.reload();
          } else await startup.goto(`chrome-extension://${id}/index.html`);
          await expect
            .poll(() =>
              startup.evaluate(() => typeof window.__releaseVaultLoad),
            )
            .toBe("function");
          await expect(startup.locator("#app")).toHaveAttribute(
            "aria-busy",
            "true",
          );
          await expect(startup.locator('input[type="password"]')).toHaveCount(
            0,
          );
          await expect(
            startup.getByText("Opening your vault…", { exact: true }),
          ).toBeVisible();
          await startup.evaluate(() => window.__releaseVaultLoad());
          await expect(startup.locator("#app")).toHaveAttribute(
            "aria-busy",
            "false",
          );
          if (existing) {
            await startup
              .getByLabel("Master password", { exact: true })
              .fill("x");
            await startup
              .getByRole("button", { name: "Unlock vault", exact: true })
              .click();
          } else {
            await startup
              .getByLabel("Create a master password", { exact: true })
              .fill("x");
            await startup
              .getByLabel("Confirm master password", { exact: true })
              .fill("x");
            await startup
              .getByRole("button", {
                name: "Create encrypted vault",
                exact: true,
              })
              .click();
          }
          await expect(
            startup.getByRole("button", { name: "+ Add account", exact: true }),
          ).toBeVisible();
        }
      } finally {
        await isolated.close();
        await page.bringToFront();
      }
    },
  );
  await check(
    "popup pastes imports and shares its timed session with the file-selection window",
    async () => {
      const isolated = await launch(
        await mkdtemp(join(tmpdir(), "lykvakt-popup-")),
      );
      try {
        const popup = await isolated.newPage();
        await popup.setViewportSize({ width: 400, height: 580 });
        await popup.goto(`chrome-extension://${id}/index.html`);
        await popup
          .getByLabel("Create a master password", { exact: true })
          .fill("x");
        await popup
          .getByLabel("Confirm master password", { exact: true })
          .fill("x");
        await popup
          .getByRole("button", { name: "Create encrypted vault", exact: true })
          .click();
        await popup
          .getByRole("button", { name: "Backup", exact: true })
          .click();
        await popup
          .getByRole("button", {
            name: "Verify or restore a backup",
            exact: true,
          })
          .click();
        await expect(
          popup.getByRole("button", {
            name: "Open in a window to choose a file",
            exact: true,
          }),
        ).toBeVisible();
        await expect(popup.locator('input[type="file"]')).toHaveCount(0);
        await popup.getByRole("button", { name: "Close", exact: true }).click();
        await openImportOn(popup);
        await expect(popup.locator('input[type="file"]')).toHaveCount(0);
        await expect(
          popup.getByText(
            "Your browser can close this small popup while you pick a file. The window uses your current unlock session.",
          ),
        ).toBeVisible();
        const links = Array.from(
          { length: 12 },
          (_, i) =>
            `otpauth://totp/Example${i}:synthetic?secret=JBSWY3DPEHPK3PX${String.fromCharCode(65 + i)}&issuer=Example${i}`,
        ).join("\n");
        await popup.getByLabel("OTP URIs or export text").fill(links);
        await popup
          .getByRole("button", { name: "Preview import", exact: true })
          .click();
        await popup
          .getByRole("button", { name: "Import 12 account(s)", exact: true })
          .click();
        await expect(popup.locator(".account")).toHaveCount(12);
        const headerY = (await popup.locator("header").boundingBox()).y;
        await popup.locator(".account-list").evaluate((n) => {
          n.scrollTop = n.scrollHeight;
        });
        expect(
          await popup.locator(".account-list").evaluate((n) => n.scrollTop),
        ).toBeGreaterThan(0);
        expect((await popup.locator("header").boundingBox()).y).toBe(headerY);
        const last = popup.locator(".account").last();
        await last.locator("summary").click();
        await last.getByRole("button", { name: "Edit", exact: true }).click();
        await expect(popup.getByRole("dialog")).toContainText("Edit account");
        await popup.getByRole("button", { name: "Close", exact: true }).click();
        await popup.locator(".account-list").evaluate((n) => {
          n.scrollTop = 0;
        });
        await popup.screenshot({
          path: "artifacts/screenshots/popup-mode.png",
        });
        const popupAxe = await new AxeBuilder({ page: popup })
          .setLegacyMode()
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        await writeFile(
          "artifacts/axe-popup.json",
          JSON.stringify(popupAxe.violations, null, 2),
        );
        expect(popupAxe.violations).toEqual([]);
        await openImportOn(popup);
        await popup
          .getByRole("button", {
            name: "Open in a window to choose a file",
            exact: true,
          })
          .click();
        await expect
          .poll(() => isolated.pages().some((p) => p.url() === base))
          .toBe(true);
        const vault = isolated.pages().find((p) => p.url() === base);
        await vault.setViewportSize({ width: 400, height: 700 });
        await expect(
          vault.getByLabel("Master password", { exact: true }),
        ).toHaveCount(0);

        await expect(vault.locator(".account")).toHaveCount(12);
        await expect(vault.getByRole("dialog")).toContainText(
          "Import accounts",
        );
        await expect(vault.getByLabel("OTP URIs or export text")).toHaveValue(
          "",
        );
        await vault.getByRole("button", { name: "Close", exact: true }).click();
        await vault.screenshot({
          path: "artifacts/screenshots/window-mode.png",
        });
        await vault
          .getByRole("button", { name: "Settings", exact: true })
          .click();
        await expect(
          vault.getByLabel("Auto-lock", { exact: true }),
        ).toHaveValue("300000");
        await expect(
          vault.getByRole("button", { name: "Open in a window", exact: true }),
        ).toHaveCount(0);
        await expect(popup.locator("body")).toHaveClass("popup-mode");
        await vault.bringToFront();
        await vault
          .getByRole("button", { name: "Authenticator", exact: true })
          .click();
        await openImportOn(vault);
        await expect(vault.locator('input[type="file"]')).toHaveCount(2);
        await expect(
          vault.getByRole("button", {
            name: "Open in a window to choose a file",
            exact: true,
          }),
        ).toHaveCount(0);
      } finally {
        await isolated.close();
        await page.bringToFront();
      }
    },
  );
  await check(
    "a chosen inactivity timer locks the vault and can be disabled",
    async () => {
      await click("Settings");
      const timeout = page.getByLabel("Auto-lock", { exact: true });
      await expect(timeout).toHaveValue("300000");
      await screenshot("settings");
      await timeout.selectOption("60000");
      await expect
        .poll(() =>
          page.evaluate(
            async () =>
              (await chrome.storage.session.get("unlockSession")).unlockSession
                ?.unlock?.timeout,
          ),
        )
        .toBe(60000);
      await page.clock.fastForward(61_000);
      await syncWorkerClock();
      await expect(
        page.getByRole("heading", { name: "Welcome back." }),
      ).toBeVisible();
      await unlock();
      await click("Settings");
      await expect(page.getByLabel("Auto-lock", { exact: true })).toHaveValue(
        "60000",
      );
      await page.getByLabel("Auto-lock", { exact: true }).selectOption("0");
      await expect
        .poll(() =>
          page.evaluate(
            async () =>
              (await chrome.storage.session.get("unlockSession")).unlockSession
                ?.unlock?.timeout,
          ),
        )
        .toBe(0);
      await page.clock.fastForward(3_700_000);
      await syncWorkerClock();
      await expect(
        page.getByRole("button", { name: "Lock", exact: true }),
      ).toBeVisible();
      await click("Authenticator");
    },
  );
  await check(
    "explicit window opening reuses the vault and supports a chosen short password",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "lykvakt-window-"));
      const isolated = await launch(directory);
      const vaultUrl = base;
      const popupUrl = `chrome-extension://${id}/index.html`;
      const open = async () => {
        const popup = await isolated.newPage();
        await popup.goto(popupUrl);
        await expect(popup.locator("#app")).toHaveAttribute(
          "aria-busy",
          "false",
        );
        if (
          await popup
            .getByRole("button", {
              name: "Create encrypted vault",
              exact: true,
            })
            .count()
        ) {
          await popup
            .getByLabel("Create a master password", { exact: true })
            .fill("x");
          await popup
            .getByLabel("Confirm master password", { exact: true })
            .fill("x");
          await popup
            .getByRole("button", {
              name: "Create encrypted vault",
              exact: true,
            })
            .click();
        } else if (
          await popup
            .getByRole("button", { name: "Unlock vault", exact: true })
            .count()
        ) {
          await popup.getByLabel("Master password", { exact: true }).fill("x");
          await popup
            .getByRole("button", { name: "Unlock vault", exact: true })
            .click();
        }
        await popup
          .getByRole("button", { name: "Settings", exact: true })
          .click();
        await popup
          .getByRole("button", { name: "Open in a window", exact: true })
          .click();
        await expect
          .poll(() => isolated.pages().some((p) => p.url() === vaultUrl))
          .toBe(true);
        const opened = isolated.pages().find((p) => p.url() === vaultUrl);
        // Let the window action finish before destroying its sender.
        await expect
          .poll(() =>
            opened.evaluate(
              async () => (await chrome.windows.getCurrent()).state,
            ),
          )
          .toBe("normal");
        await popup.close();
        return opened;
      };
      try {
        const vault = await open();
        await expect(
          vault.getByLabel("Master password", { exact: true }),
        ).toHaveCount(0);

        await expect(
          vault.getByRole("button", { name: "+ Add account", exact: true }),
        ).toBeVisible();
        const other = await isolated.newPage();
        await other.goto("about:blank");
        await other.bringToFront();
        await vault.bringToFront();
        await expect(
          vault.getByRole("button", { name: "+ Add account", exact: true }),
        ).toBeVisible();
        await vault.evaluate(async () => {
          const current = await chrome.windows.getCurrent();
          await chrome.windows.update(current.id, { state: "minimized" });
        });
        await expect
          .poll(() =>
            vault.evaluate(
              async () => (await chrome.windows.getCurrent()).state,
            ),
          )
          .toBe("minimized");
        await open();
        await expect
          .poll(() =>
            vault.evaluate(
              async () => (await chrome.windows.getCurrent()).state,
            ),
          )
          .toBe("normal");
        expect(
          isolated.pages().filter((p) => p.url() === vaultUrl),
        ).toHaveLength(1);
        await expect(
          vault.getByRole("button", { name: "+ Add account", exact: true }),
        ).toBeVisible();
        await vault.close();
        const reopened = await open();
        await expect(
          reopened.getByLabel("Master password", { exact: true }),
        ).toHaveCount(0);

        await expect(
          reopened.getByRole("button", { name: "+ Add account", exact: true }),
        ).toBeVisible();
      } finally {
        await isolated.close();
        await page.bringToFront();
      }
    },
  );
  await check(
    "documentation is keyboard accessible without repeated inline help",
    async () => {
      await context.setOffline(true);
      try {
        await documentationHelp();
      } finally {
        await context.setOffline(false);
      }
      await expect(page.locator("[data-help]")).toHaveCount(0);
      await expect(
        page.getByText("What does this mean?", { exact: true }),
      ).toHaveCount(0);
      await plainPrimaryUI();
    },
  );

  await check(
    "popup closure and worker restart preserve a bounded enrollment draft without another password",
    () =>
      sharedProfile(async ({ isolated, reopen }) => {
        await click("+ Add account");
        await page
          .getByLabel("Service name", { exact: true })
          .fill("Draft example");
        await page
          .getByLabel("Account identifier", { exact: true })
          .fill("synthetic");
        await page
          .getByLabel("Setup key", { exact: true })
          .fill("JBSWY3DPEHPK3PXP");
        await expect
          .poll(() =>
            page.evaluate(
              async () =>
                (await chrome.storage.session.get("unlockSession"))
                  .unlockSession?.unlock?.draft?.fields?.secret,
            ),
          )
          .toBe("JBSWY3DPEHPK3PXP");
        await page.close();
        page = await reopen();
        await expect(page.getByRole("dialog")).toContainText("Add account");
        await expect(
          page.getByLabel("Service name", { exact: true }),
        ).toHaveValue("Draft example");
        await expect(page.getByLabel("Setup key", { exact: true })).toHaveValue(
          "JBSWY3DPEHPK3PXP",
        );
        await expect(
          page.getByLabel("Master password", { exact: true }),
        ).toHaveCount(0);
        expect(
          await page.evaluate(async () => ({
            local: await chrome.storage.local.get(null),
            sync: await chrome.storage.sync.get(null),
          })),
        ).toEqual({ local: {}, sync: {} });
        await page.close();
        const driver = await isolated.browser().newBrowserCDPSession();
        const worker = (
          await driver.send("Target.getTargets")
        ).targetInfos.find(
          (t) =>
            t.type === "service_worker" &&
            t.url === `chrome-extension://${id}/background.js`,
        );
        expect(worker).toBeDefined();
        expect(
          (
            await driver.send("Target.closeTarget", {
              targetId: worker.targetId,
            })
          ).success,
        ).toBe(true);
        await expect
          .poll(async () =>
            (await driver.send("Target.getTargets")).targetInfos.some(
              (t) => t.targetId === worker.targetId,
            ),
          )
          .toBe(false);
        page = await reopen();
        await expect(page.getByRole("dialog")).toContainText("Add account");
        await expect(
          page.getByLabel("Service name", { exact: true }),
        ).toHaveValue("Draft example");
        await expect(
          page.getByLabel("Master password", { exact: true }),
        ).toHaveCount(0);
        await click("Close");
        await expect
          .poll(() =>
            page.evaluate(
              async () =>
                (await chrome.storage.session.get("unlockSession"))
                  .unlockSession?.unlock?.draft,
            ),
          )
          .toBeUndefined();
        await driver.detach();
      }),
  );
  await check(
    "pasted export archives import normally but never survive popup closure as shared drafts",
    () =>
      sharedProfile(async ({ reopen }) => {
        const text = JSON.stringify({
          encrypted: false,
          items: [
            {
              type: 1,
              name: "Draft audit",
              login: {
                totp: "JBSWY3DPEHPK3PXP",
                password: "SYNTHETIC_UNRELATED_PASSWORD",
              },
            },
          ],
        });
        await click("Import accounts");
        await page.getByLabel("OTP URIs or export text").fill(text);
        await expect(page.getByLabel("OTP URIs or export text")).toHaveValue(
          text,
        );
        await expect
          .poll(() =>
            page.evaluate(
              async () =>
                (await chrome.storage.session.get("unlockSession"))
                  .unlockSession?.unlock?.draft,
            ),
          )
          .toBeUndefined();
        await page.close();
        page = await reopen();
        await expect(
          page.getByRole("button", { name: "Lock", exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await click("Import accounts");
        await expect(page.getByLabel("OTP URIs or export text")).toHaveValue(
          "",
        );
        await page.getByLabel("OTP URIs or export text").fill(text);
        await click("Preview import");
        await expect(page.getByRole("dialog")).toContainText(
          "1 new account(s)",
        );
        await click("Import 1 account(s)");
        await expect(page.locator(".account")).toHaveCount(1);
        expect(
          await page.evaluate(async () =>
            JSON.stringify(await chrome.storage.session.get(null)),
          ),
        ).not.toContain("SYNTHETIC_UNRELATED_PASSWORD");
      }),
  );
  await check(
    "QR images paste from the clipboard and drop as files in the popup without a shared image draft",
    () =>
      sharedProfile(async ({ isolated }) => {
        const requests = [];
        isolated.on("request", (r) => {
          if (/^https?:/.test(r.url())) requests.push(r.url());
        });
        const image = await QRCode.toBuffer(
          "otpauth://totp/Pasted:alice?secret=" + secret + "&issuer=Pasted",
          { width: 240 },
        );
        await click("Import accounts");
        const before = await stored();
        await page.bringToFront();
        await page.evaluate(async (base64) => {
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          await navigator.clipboard.write([
            new ClipboardItem({
              "image/png": new Blob([bytes], { type: "image/png" }),
            }),
          ]);
        }, image.toString("base64"));
        await page.getByLabel("OTP URIs or export text").press("Control+V");
        await expect(page.getByRole("dialog")).toContainText(
          "1 new account(s)",
        );
        expect(await stored()).toEqual(before);
        expect(
          await page.evaluate(
            async () =>
              (await chrome.storage.session.get("unlockSession")).unlockSession
                ?.unlock?.draft,
          ),
        ).toBeUndefined();
        await click("Import 1 account(s)");
        await expect(page.locator(".account")).toHaveCount(1);
        await click("Import accounts");
        await page
          .getByLabel("OTP URIs or export text")
          .evaluate((area, base64) => {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(
              new File(
                [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
                "qr.png",
                { type: "image/png" },
              ),
            );
            area.dispatchEvent(
              new DragEvent("drop", {
                bubbles: true,
                cancelable: true,
                dataTransfer,
              }),
            );
          }, image.toString("base64"));
        await expect(page.getByRole("dialog")).toContainText(
          "1 exact duplicate(s)",
        );
        await click("Close");
        await click("Import accounts");
        await page.getByLabel("OTP URIs or export text").evaluate((area) => {
          const dataTransfer = new DataTransfer();
          dataTransfer.setData(
            "text/uri-list",
            "https://example.test/private-qr.png",
          );
          area.dispatchEvent(
            new DragEvent("drop", {
              bubbles: true,
              cancelable: true,
              dataTransfer,
            }),
          );
        });
        await expect(page.getByRole("status")).toContainText(
          "Links are not downloaded",
        );
        await expect(page.getByLabel("OTP URIs or export text")).toHaveValue(
          "",
        );
        expect(requests).toEqual([]);
        await helpAxe("qr-image-paste");
        await screenshot("qr-image-paste");
        await click("Close");
      }),
  );
  await check(
    "closing an image import terminates a pending decoder without a late preview or write",
    () =>
      sharedProfile(async () => {
        await click("Import accounts");
        const before = await stored();
        await page.evaluate(() => {
          const post = Worker.prototype.postMessage;
          Worker.prototype.postMessage = function (...args) {
            if (!(args[0] instanceof Blob)) return post.apply(this, args);
            Worker.prototype.postMessage = post;
            const worker = this,
              terminate = this.terminate.bind(this);
            window.__qrStopped = false;
            this.terminate = () => {
              window.__qrStopped = true;
              terminate();
            };
            window.__qrRelease = () => {
              try {
                post.apply(worker, args);
              } catch {}
            };
          };
          const data = new DataTransfer();
          data.items.add(
            new File(["pending"], "qr.png", { type: "image/png" }),
          );
          document.querySelector('textarea[name="payload"]').dispatchEvent(
            new ClipboardEvent("paste", {
              bubbles: true,
              cancelable: true,
              clipboardData: data,
            }),
          );
        });
        await expect
          .poll(() => page.evaluate(() => typeof window.__qrRelease))
          .toBe("function");
        await click("Close");
        expect(await page.evaluate(() => window.__qrStopped)).toBe(true);
        await page.evaluate(() => window.__qrRelease());
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect(await stored()).toEqual(before);
      }),
  );
  await check(
    "manual Lock and an overdue deadline block every view without relying on an alarm",
    () =>
      sharedProfile(async ({ reopen }) => {
        const two = await reopen();
        await expect(
          two.getByRole("button", { name: "Lock", exact: true }),
        ).toBeVisible();
        await click("Lock");
        await expect(
          two.getByLabel("Master password", { exact: true }),
        ).toBeVisible();
        await expect
          .poll(() =>
            two.evaluate(async () =>
              Boolean(
                (await chrome.storage.session.get("unlockSession"))
                  .unlockSession?.unlock,
              ),
            ),
          )
          .toBe(false);
        await unlock();
        await two.reload();
        await expect(
          two.getByRole("button", { name: "Lock", exact: true }),
        ).toBeVisible();
        await page.evaluate(async () => {
          const { unlockSession: state } =
            await chrome.storage.session.get("unlockSession");
          state.unlock.touched = Date.now() - state.unlock.timeout - 1000;
          state.unlock.checkedAt = state.unlock.touched;
          state.unlock.expires = state.unlock.touched + state.unlock.timeout;
          state.source = "synthetic-expiry";
          await chrome.alarms.clear("vault-expiry");
          await chrome.storage.session.set({ unlockSession: state });
        });
        await page.reload();
        await expect(
          page.getByLabel("Master password", { exact: true }),
        ).toBeVisible();
        await expect(
          two.getByLabel("Master password", { exact: true }),
        ).toBeVisible();
        const three = await reopen();
        await expect(
          three.getByLabel("Master password", { exact: true }),
        ).toBeVisible();
        await expect(three.locator(".account")).toHaveCount(0);
        await expect
          .poll(() =>
            three.evaluate(async () =>
              Boolean(
                (await chrome.storage.session.get("unlockSession"))
                  .unlockSession?.unlock,
              ),
            ),
          )
          .toBe(false);
      }),
  );
  await check(
    "password rotation revokes the shared session and reopened views require the new password",
    () =>
      sharedProfile(async ({ reopen }) => {
        const two = await reopen();
        await expect(
          two.getByRole("button", { name: "Lock", exact: true }),
        ).toBeVisible();
        await click("Settings");
        await click("Change master password");
        await page
          .getByLabel("Current master password", { exact: true })
          .fill(password);
        await page
          .getByLabel("New master password", { exact: true })
          .fill("new synthetic password");
        await page
          .getByLabel("Confirm new master password", { exact: true })
          .fill("new synthetic password");
        await click("Change password");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(page.getByRole("status")).toContainText(
          "Master password changed",
        );
        await expect(
          two.getByLabel("Master password", { exact: true }),
        ).toBeVisible();
        await page.close();
        page = await reopen();
        await expect(
          page.getByLabel("Master password", { exact: true }),
        ).toBeVisible();
        await page
          .getByLabel("Master password", { exact: true })
          .fill(password);
        await click("Unlock vault");
        await expect(page.getByRole("status")).toContainText(
          "Authentication failed",
        );
        await expect(
          page.getByLabel("Master password", { exact: true }),
        ).toHaveValue("");
        await page
          .getByLabel("Master password", { exact: true })
          .fill("new synthetic password");
        await click("Unlock vault");
        await expect(
          page.getByRole("button", { name: "Lock", exact: true }),
        ).toBeVisible();
      }),
  );
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
