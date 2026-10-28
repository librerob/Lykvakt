import { readFile, readdir, stat } from "node:fs/promises";
import assert from "node:assert/strict";
const target = process.argv[2] || "chrome";
assert(
  ["chrome", "edge", "firefox"].includes(target),
  "Unknown browser target.",
);
const directory = target === "chrome" ? "dist" : "dist-" + target;
const manifest = JSON.parse(
  await readFile(directory + "/manifest.json", "utf8"),
);
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ["clipboardWrite", "storage", "alarms"]);
assert.equal(manifest.optional_permissions, undefined);
assert.equal(manifest.optional_host_permissions, undefined);
assert.deepEqual(
  manifest.background,
  target === "firefox"
    ? {
        scripts: ["background.js"],
        type: "module",
      }
    : { service_worker: "background.js", type: "module" },
);
if (target === "firefox") {
  assert.equal(manifest.minimum_chrome_version, undefined);
  assert.deepEqual(manifest.browser_specific_settings, {
    gecko: {
      id: "lykvakt@librerob.github.io",
      strict_min_version: "153.0",
      data_collection_permissions: { required: ["none"] },
    },
  });
} else {
  assert.equal(manifest.minimum_chrome_version, "120");
  assert.equal(manifest.browser_specific_settings, undefined);
}
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.content_scripts, undefined);
assert.equal(manifest.externally_connectable, undefined);
assert.equal(manifest.web_accessible_resources, undefined);
assert(
  !manifest.content_security_policy.extension_pages.includes(
    "wasm-unsafe-eval",
  ),
);
for (const path of [
  "index.html",
  ...(manifest.background.scripts || [manifest.background.service_worker]),
  manifest.action.default_popup,
  ...Object.values(manifest.icons),
])
  assert((await stat(directory + "/" + path)).isFile());
const engines = [];
async function scan(dir) {
  let bytes = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = dir + "/" + entry.name;
    if (entry.isDirectory()) {
      bytes += await scan(path);
      continue;
    }
    assert(!/\.wasm$/i.test(path), "Forbidden binary module: " + path);
    assert(
      !/kdf-engine[^/]*\.js$/i.test(path),
      "Forbidden main-thread KDF chunk: " + path,
    );
    const contents = await readFile(path);
    bytes += contents.length;
    if (/\.(js|html)$/.test(path)) {
      const code = contents.toString();
      if (/\b(?:argon2InitialHash|argon2idAsync|deriveKeyHere)\b/.test(code))
        engines.push(path);
      assert(
        !/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/.test(
          code,
        ),
        "Forbidden network API: " + path,
      );
      assert(
        !/\bWebAssembly\b/.test(code),
        "Forbidden compiled runtime: " + path,
      );
      assert(
        !/\beval\s*\(|new Function\s*\(|https?:\/\/[^\s"']+\.js\b|(?:chrome|browser)\.storage\.(?:local|sync)/.test(
          code,
        ),
        "Forbidden runtime behavior: " + path,
      );
    }
  }
  return bytes;
}
const bytes = await scan(directory);

assert.equal(engines.length, 1, "Ship exactly one Argon2 implementation.");
assert.match(
  engines[0],
  /\/argon2\.worker-[\w-]+\.js$/,
  "Argon2 belongs only in its worker.",
);
console.log(
  "One Argon2 implementation, in " + engines[0] + "; no main-thread engine.",
);

console.log(
  `Manifest and bundled runtime checks passed. ${bytes} unpacked bytes.`,
);
