import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
export async function verifyReleaseAssets(directory, version, commit) {
  assert.match(commit, /^[a-f0-9]{40}$/, "Invalid release commit.");
  const checked = [];
  for (const target of ["chrome", "edge", "firefox", "source"]) {
    const name = "lykvakt-" + version + "-" + target + ".zip";
    const path = join(
      directory,
      target === "source" ? "firefox" : target,
      name,
    );
    const bytes = await readFile(path);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    assert.equal(
      (await readFile(path + ".sha256", "utf8")).trim(),
      sha256 + "  " + name,
      "Release checksum mismatch: " + name,
    );
    const files = unzipSync(bytes);
    if (target === "source") {
      assert(
        strFromU8(files["README-BUILD.txt"]).startsWith(
          "Lykvakt source at commit " + commit + "\n",
        ),
        "Source package commit mismatch.",
      );
      assert.equal(
        JSON.parse(strFromU8(files["package.json"])).version,
        version,
        "Source package version mismatch.",
      );
    } else {
      const manifest = JSON.parse(strFromU8(files["manifest.json"]));
      assert.equal(
        manifest.version,
        version,
        "Extension version mismatch: " + name,
      );
      assert.deepEqual(manifest.permissions, [
        "clipboardWrite",
        "storage",
        "alarms",
      ]);
      assert.equal(
        !!manifest.browser_specific_settings,
        target === "firefox",
        "Wrong browser package: " + name,
      );
      assert.equal(
        manifest.commands._execute_action.suggested_key.default,
        target === "edge" ? "Ctrl+Shift+7" : "Ctrl+Shift+Y",
        "Wrong shortcut target: " + name,
      );
    }
    checked.push({ name, sha256 });
  }
  return checked;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const version = JSON.parse(await readFile("package.json", "utf8")).version;
  const commit = process.argv[3];
  const checked = await verifyReleaseAssets(process.argv[2], version, commit);
  const section = (await readFile("CHANGELOG.md", "utf8")).split(/\n## /)[1];
  assert(section, "Missing release notes.");
  await writeFile(
    "release-notes.md",
    "## " +
      section +
      "\nBuilt from commit: " +
      commit +
      "\n\nSHA-256:\n\n" +
      checked.map((file) => "- " + file.name + ": " + file.sha256).join("\n") +
      "\n",
  );
  console.log(
    "Verified Chrome, Edge, Firefox and matching source ZIPs at " + commit,
  );
}
