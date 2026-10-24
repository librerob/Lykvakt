import { zipSync, strToU8 } from "fflate";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = {};
async function collect(dir, relative = "") {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name, "en"),
  )) {
    const path = relative + entry.name;
    if (entry.isDirectory()) await collect(dir + "/" + entry.name, path + "/");
    else
      files[path] = [
        new Uint8Array(await readFile(dir + "/" + entry.name)),
        { mtime: new Date("2026-01-01T00:00:00Z") },
      ];
  }
}
await collect("dist");
files["LICENSE"] = [
  strToU8(await readFile("LICENSE", "utf8")),
  { mtime: new Date("2026-01-01T00:00:00Z") },
];
await mkdir("artifacts", { recursive: true });
const path = "artifacts/lykvakt-0.2.0-rc.1-chrome.zip";
const zip = zipSync(files, { level: 9 });
await writeFile(path, zip);
await writeFile(
  path + ".sha256",
  createHash("sha256").update(zip).digest("hex") +
    "  " +
    path.split("/").at(-1) +
    "\n",
);
console.log(`${path}: ${zip.length} bytes`);
