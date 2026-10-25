import { readFile, readdir, stat } from "node:fs/promises";
import assert from "node:assert/strict";
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ["clipboardWrite"]);
assert.equal(manifest.optional_permissions, undefined);
assert.equal(manifest.optional_host_permissions, undefined);
assert.equal(manifest.background, undefined);
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.content_scripts, undefined);
assert.equal(manifest.externally_connectable, undefined);
assert.equal(manifest.web_accessible_resources, undefined);
assert(
  !manifest.content_security_policy.extension_pages.includes(
    "wasm-unsafe-eval",
  ),
);
for (const path of ["index.html", ...Object.values(manifest.icons)])
  assert((await stat("dist/" + path)).isFile());
async function scan(dir) {
  let bytes = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = dir + "/" + entry.name;
    if (entry.isDirectory()) {
      bytes += await scan(path);
      continue;
    }
    assert(!/\.wasm$/i.test(path), "Forbidden binary module: " + path);
    const contents = await readFile(path);
    bytes += contents.length;
    if (/\.(js|html)$/.test(path)) {
      const code = contents.toString();
      assert(
        !/\bWebAssembly\b/.test(code),
        "Forbidden compiled runtime: " + path,
      );
      assert(
        !/\beval\s*\(|new Function\s*\(|https?:\/\/[^\s"']+\.js\b|chrome\.storage\.sync/.test(
          code,
        ),
        "Forbidden runtime behavior: " + path,
      );
    }
  }
  return bytes;
}
console.log(
  `Manifest and bundled runtime checks passed. ${await scan("dist")} unpacked bytes.`,
);
