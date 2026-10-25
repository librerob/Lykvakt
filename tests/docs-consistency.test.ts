import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const removed = [
  "scan this tab",
  "fill a code",
  "autofill",
  "2fa directory",
  "toolbar indicator",
  "website detection",
  "activeTab",
  "scripting permission",
  "tabs permission",
  "AMOLED theme option",
  "accent",
];
// Exact sentence exceptions, never whole-file exemptions. These three guides
// explain authenticated-header compatibility, archive reads and its threat model.
const legacyFiles = new Set([
  "docs/cryptography.md",
  "docs/compatibility.md",
  "docs/threat-model.md",
]);
const legacySentence =
  "For legacy compatibility, new envelopes retain an empty `passkeys` array, and old slots are authenticated and stripped on password unlock when saving succeeds.";
function documents(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return documents(path);
    return entry.name.toLowerCase() === "changelog.md" ? [] : [path];
  });
}
it("live documentation contains no removed-feature terms outside exact legacy sentences", () => {
  const files = ["README.md", "PRIVACY.md", "SECURITY.md", "CONTRIBUTING.md"]
    .map((path) => join(root, path))
    .concat(documents(join(root, "docs")));
  const violations: string[] = [];
  for (const path of files) {
    const name = relative(root, path).split(sep).join("/");
    let text = readFileSync(path, "utf8");
    for (const term of removed)
      if (text.toLowerCase().includes(term.toLowerCase()))
        violations.push(`${name}: removed term "${term}"`);
    if (legacyFiles.has(name)) {
      if (text.split(legacySentence).length !== 2)
        violations.push(
          `${name}: expected exactly one legacy compatibility sentence`,
        );
      text = text.replace(legacySentence, "");
    }
    if (/passkey/i.test(text))
      violations.push(`${name}: passkey outside the legacy sentence allowlist`);
    if (/migration-and-fill\.md/i.test(text))
      violations.push(`${name}: outdated migration link`);
  }
  expect(violations).toEqual([]);
});

it("current documentation matches the bundled-JavaScript, permission, shortcut and help contracts", () => {
  const read = (path: string) => readFileSync(join(root, path), "utf8");
  const manifest = JSON.parse(read("public/manifest.json"));
  expect(manifest.permissions).toEqual(["clipboardWrite"]);
  for (const field of [
    "optional_permissions",
    "optional_host_permissions",
    "host_permissions",
    "background",
    "content_scripts",
  ])
    expect(manifest[field]).toBeUndefined();
  expect(manifest.commands._execute_action.description).toBe("Open Lykvakt");
  expect(manifest.commands._execute_action.suggested_key).toEqual({
    default: "Ctrl+Shift+Y",
    mac: "Command+Shift+Y",
  });
  expect(manifest.content_security_policy.extension_pages).not.toContain(
    "wasm-unsafe-eval",
  );
  expect(read("README.md")).toContain("docs/plain-english-guide.md");
  expect(read("README.md")).toMatch(/no WebAssembly/i);
  expect(read("docs/compatibility.md")).toContain(
    "Older Lykvakt builds cannot open Argon2id",
  );
  expect(read("docs/compatibility.md")).toContain(
    "This build reads supported older PBKDF2 vaults and backups",
  );
  expect(read("docs/plain-english-guide.md")).toContain(
    "chrome://extensions/shortcuts",
  );
  expect(read("src/dom.ts")).toContain("What does this mean?");
  expect(read("src/dom.ts")).toContain("data-help");
  expect(read("src/dom.ts")).toContain("Technical details");
  expect(read("src/help.ts")).toContain("Caps Lock");
  expect(read("scripts/check-package.mjs")).toContain("\\.wasm$");
  expect(read("scripts/check-package.mjs")).toContain("WebAssembly");
  expect(
    JSON.parse(read("package.json")).dependencies["@noble/hashes"],
  ).toMatch(/^\d+\.\d+\.\d+$/);
});

it.each([
  "README.md",
  "docs/compatibility.md",
  "docs/release-notes.md",
  "docs/store/listing-draft.md",
])("%s retains the older-build Argon2id compatibility warning", (file) => {
  expect(readFileSync(join(root, file), "utf8")).toContain(
    "Older Lykvakt builds cannot open Argon2id vaults or backups.",
  );
});
