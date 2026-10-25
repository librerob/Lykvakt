import { readFile } from "node:fs/promises";
// No background worker is needed by the extension. Discover the loaded ID from
// Chromium's extension-manager DOM rather than adding a worker or permissions.
export async function extensionId(context) {
  const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
  const listing = await context.newPage();
  try {
    await listing.goto("chrome://extensions/");
    const item = listing
      .locator("extensions-item")
      .filter({ hasText: manifest.name });
    await item.waitFor({ state: "attached" });
    const id = await item.getAttribute("id");
    if (!/^[a-p]{32}$/.test(id ?? ""))
      throw new Error("Loaded extension ID not found.");
    return id;
  } finally {
    await listing.close();
  }
}
