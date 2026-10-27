import { chromium, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { extensionId } from "./extension-id.mjs";
const output = resolve(process.argv[2] || "artifacts/popup-performance.json");
const profile = await mkdtemp(join(tmpdir(), "lykvakt-performance-")),
  extension = resolve("dist");
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROMIUM_PATH || undefined,
  channel: process.env.CHROMIUM_PATH ? undefined : "chromium",
  headless: true,
  viewport: { width: 400, height: 580 },
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
try {
  const id = await extensionId(context),
    url = `chrome-extension://${id}/index.html`;
  await context.addInitScript(() => {
    const sample = (globalThis.__vaultSample = {});
    let waiting = false,
      submit;
    document.addEventListener(
      "submit",
      () => {
        submit = performance.now();
      },
      true,
    );
    const inspect = () => {
      const ready =
        document.querySelector('input[type="password"]') &&
        document.querySelector('button[type="submit"]:not(:disabled)');
      const unlocked = submit && document.querySelector('input[name="search"]');
      if (waiting || (!ready && !unlocked)) return;
      waiting = true;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          waiting = false;
          if (
            ready &&
            sample.interactivePaint === undefined &&
            document.querySelector('input[type="password"]')
          )
            sample.interactivePaint = performance.now();
          if (
            unlocked &&
            sample.unlockPaint === undefined &&
            document.querySelector('input[name="search"]')
          )
            sample.unlockPaint = performance.now() - submit;
        }),
      );
    };
    new MutationObserver(inspect).observe(document, {
      childList: true,
      subtree: true,
    });
    document.addEventListener("DOMContentLoaded", inspect);
  });
  const password = "synthetic popup performance password";
  const setup = await context.newPage();
  await setup.goto(url);
  await setup
    .getByLabel("Create a master password", { exact: true })
    .fill(password);
  await setup
    .getByLabel("Confirm master password", { exact: true })
    .fill(password);
  await setup
    .getByRole("button", { name: "Create encrypted vault", exact: true })
    .click();
  await expect(
    setup.getByRole("button", { name: "+ Add account", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  if (
    !(await setup
      .getByRole("button", { name: "Import accounts", exact: true })
      .count())
  )
    await setup.getByRole("button", { name: "Backup", exact: true }).click();
  await setup
    .getByRole("button", { name: "Import accounts", exact: true })
    .click();
  await setup
    .getByLabel("OTP URIs or export text")
    .fill(
      "otpauth://totp/Performance:synthetic?secret=JBSWY3DPEHPK3PXP&issuer=Performance",
    );
  await setup
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await setup
    .getByRole("button", { name: "Import 1 account(s)", exact: true })
    .click();
  await setup.close();
  const samples = [];
  for (let i = 0; i < 18; i++) {
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(
      () => globalThis.__vaultSample?.interactivePaint !== undefined,
    );
    const sample = await page.evaluate(() => ({
      interactivePaintMs: globalThis.__vaultSample.interactivePaint,
      firstContentfulPaintMs:
        performance.getEntriesByName("first-contentful-paint")[0]?.startTime ??
        null,
    }));
    if (i >= 3) {
      if (samples.length < 5) {
        await page
          .getByLabel("Master password", { exact: true })
          .fill(password);
        await page
          .getByRole("button", { name: "Unlock vault", exact: true })
          .click();
        await page.waitForFunction(
          () => globalThis.__vaultSample?.unlockPaint !== undefined,
          undefined,
          { timeout: 60_000 },
        );
        sample.unlockMs = await page.evaluate(
          () => globalThis.__vaultSample.unlockPaint,
        );
      }
      samples.push(sample);
    }
    await page.close();
  }
  const summary = (key) => {
    const values = samples
      .map((s) => s[key])
      .filter((n) => typeof n === "number")
      .sort((a, b) => a - b);
    return {
      n: values.length,
      median: values[Math.floor(values.length / 2)],
      p95: values[Math.ceil(values.length * 0.95) - 1],
    };
  };
  const result = {
    browser: context.browser().version(),
    platform: process.platform,
    samples,
    interactivePaintMs: summary("interactivePaintMs"),
    firstContentfulPaintMs: summary("firstContentfulPaintMs"),
    unlockMs: summary("unlockMs"),
    scope:
      "Headless 400x580 popup document, warm browser profile, three warmups and fifteen fresh pages. Interactive paint is two frame callbacks after enabled password/submit controls exist. Five real unlocks include worker derivation and account rendering. Not a physical toolbar or window-compositor measurement.",
  };
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} finally {
  await context.close();
}
