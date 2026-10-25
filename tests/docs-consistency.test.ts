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
