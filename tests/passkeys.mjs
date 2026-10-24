import { chromium, expect } from "@playwright/test";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
const extension = resolve("dist");
const password = "synthetic passkey test password";
const profile = await mkdtemp(join(tmpdir(), "otp-prf-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
let page;
let checks = 0;
async function click(name) {
  await page.getByRole("button", { name, exact: true }).click();
}
async function slots() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open("otp-vault", 1);
      r.onsuccess = () => resolve(r.result);
    });
    const value = await new Promise((resolve) => {
      const r = db.transaction("vault").objectStore("vault").get("active");
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return { count: value.passkeys.length, revision: value.revision };
  });
}
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  page = await context.newPage();
  await page.goto(
    `chrome-extension://${new URL(worker.url()).hostname}/index.html?window`,
  );
  await page.getByLabel("Create a master password").fill(password);
  await page.getByLabel("Confirm master password").fill(password);
  await click("Create encrypted vault");
  await expect(page.getByText("A fresh start.")).toBeVisible();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable", { enableUI: false });
  const prf = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf: true,
      hasHmacSecret: true,
    },
  });
  await click("Settings");
  await page.getByText("Experimental passkey unlock", { exact: true }).click();
  await click("Enroll a passkey");
  await page
    .getByLabel("Confirm master password", { exact: true })
    .fill("wrong password");
  await click("Start secure enrollment");
  await expect(page.getByRole("status")).toContainText("Authentication failed");
  expect((await slots()).count).toBe(0);
  checks++;
  console.log("PASS enrollment requires actual master password");
  await page
    .getByLabel("Confirm master password", { exact: true })
    .fill(password);
  await click("Start secure enrollment");
  await expect(page.getByRole("status")).toContainText("PRF round-trip passed");
  expect((await slots()).count).toBe(1);
  checks++;
  console.log(
    "PASS extension-origin virtual PRF repeated wrap/unwrap enrollment",
  );
  await click("Lock");
  await click("Try passkey unlock");
  await expect(
    page.getByRole("heading", { name: "Authenticator", exact: true }),
  ).toBeVisible();
  checks++;
  console.log("PASS virtual PRF unlock decrypts the vault");
  await cdp.send("WebAuthn.removeVirtualAuthenticator", {
    authenticatorId: prf.authenticatorId,
  });
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf: false,
    },
  });
  await click("Settings");
  await page.getByText("Experimental passkey unlock", { exact: true }).click();
  const before = await slots();
  await click("Enroll a passkey");
  await page
    .getByLabel("Confirm master password", { exact: true })
    .fill(password);
  await click("Start secure enrollment");
  await expect(page.getByRole("status")).toContainText("does not support PRF");
  expect(await slots()).toEqual(before);
  checks++;
  console.log("PASS non-PRF authenticator refused without changing vault");
  await click("Close");
  await click("Revoke");
  await click("Revoke");
  await expect.poll(async () => (await slots()).count).toBe(0);
  checks++;
  console.log("PASS passkey wrapper revocation");
  await click("Lock");
  await page.getByLabel("Master password", { exact: true }).fill(password);
  await click("Unlock vault");
  await expect(
    page.getByRole("heading", { name: "Authenticator", exact: true }),
  ).toBeVisible();
  checks++;
  console.log("PASS master-password recovery remains available");
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/passkey-results.json",
    JSON.stringify(
      {
        checks,
        environment: "Chromium CDP virtual authenticator only",
        physicalHardwareTested: false,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (page)
    await page.screenshot({
      path: "artifacts/screenshots/passkey-failure.png",
      fullPage: true,
    });
  throw error;
} finally {
  await context.close();
}
