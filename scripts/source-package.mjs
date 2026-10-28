import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
import { createHash } from "node:crypto";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
assert.equal(
  git("status", "--porcelain"),
  "",
  "Source package requires a clean checkout.",
);
const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .sort();
const mtime = new Date("2026-01-01T00:00:00Z");
const files = {};
for (const path of paths)
  files[path] = [new Uint8Array(await readFile(path)), { mtime }];
const commit = git("rev-parse", "HEAD");
files["README-BUILD.txt"] = [
  strToU8(
    "Lykvakt source at commit " +
      commit +
      "\n\nRequires Node.js 24 and npm.\n\nnpm ci --ignore-scripts\nnpm run build:firefox\nnpm run package:firefox\n\nThe Firefox extension is built into dist-firefox/. Its upload ZIP is in artifacts/. No source files are downloaded or generated from private services. Build-time WebAssembly tooling is not shipped in the extension.\n",
  ),
  { mtime },
];
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const path = "artifacts/lykvakt-" + version + "-source.zip";
await mkdir("artifacts", { recursive: true });
const zip = zipSync(files, { level: 9 });
await writeFile(path, zip);
await writeFile(
  path + ".sha256",
  createHash("sha256").update(zip).digest("hex") +
    "  " +
    path.split("/").at(-1) +
    "\n",
);
console.log(path + ": " + zip.length + " bytes; source " + commit);
