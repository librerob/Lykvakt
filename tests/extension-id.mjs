import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
// Match the extension's own worker, not a browser-internal extension or tab.
export async function extensionId(context) {
  const directory = process.env.EXTENSION_DIST || "dist";
  const manifest = JSON.parse(
    await readFile(directory + "/manifest.json", "utf8"),
  );
  let id;
  await expect
    .poll(
      async () => {
        for (const worker of context.serviceWorkers()) {
          const match = worker
            .url()
            .match(/^chrome-extension:\/\/([a-p]{32})\/background\.js$/);
          if (!match) continue;
          const name = await worker
            .evaluate(() => chrome.runtime.getManifest().name)
            .catch(() => undefined);
          if (name === manifest.name) {
            id = match[1];
            return true;
          }
        }
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return id;
}
