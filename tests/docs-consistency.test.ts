import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");
it("keeps the exact permission set and reserved shortcut without background or page access", () => {
  const m = JSON.parse(read("public/manifest.json"));
  expect(m.permissions).toEqual(["clipboardWrite"]);
  for (const key of [
    "background",
    "host_permissions",
    "optional_permissions",
    "optional_host_permissions",
    "content_scripts",
  ])
    expect(m[key]).toBeUndefined();
  expect(m.commands._execute_action.suggested_key).toEqual({
    default: "Ctrl+Shift+Y",
    mac: "Command+Shift+Y",
  });
  const csp = m.content_security_policy.extension_pages;
  for (const rule of [
    "default-src 'self'",
    "script-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
  ])
    expect(csp).toContain(rule);
  expect(csp).not.toMatch(/unsafe-eval|unsafe-inline|wasm-unsafe-eval|https?:/);
  expect(read("scripts/check-package.mjs")).toContain("\\.wasm$");
  expect(read("scripts/check-package.mjs")).toContain("WebAssembly");
});
it.each(["README.md", "docs/design.md"])(
  "%s states the intentional old-preview format break",
  (path) => {
    if (path === "README.md") {
      expect(read(path)).toContain(
        "[design and recovery guide](docs/design.md)",
      );
    } else {
      expect(read(path)).toContain("Earlier previews cannot be opened");
      expect(read(path)).toContain("Export plaintext OTP links");
    }
  },
);

it("uses the Lykvakt name and a release version without preview branding", () => {
  const m = JSON.parse(read("public/manifest.json"));
  const pkg = JSON.parse(read("package.json"));
  expect(m.name).toBe("Lykvakt");
  expect(m.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(pkg.version).toBe(m.version);
  expect(m.version_name).toBeUndefined();
  expect(m.description).toContain("Steam support");
  expect(m.description.length).toBeLessThanOrEqual(132);
  expect(read("index.html")).toContain("<title>Lykvakt</title>");
  for (const file of ["public/manifest.json", "index.html", "src/main.ts"])
    expect(read(file)).not.toMatch(
      /development preview|unaudited|test accounts only/i,
    );
});
it("keeps the Store description focused without an importer brand list", () => {
  const listing = read("docs/store/listing-draft.md");
  expect(listing).toContain("Steam support");
  expect(listing).toContain("compatible export files");
  expect(listing).not.toMatch(
    /\b(?:Aegis|2FAS|andOTP|Bitwarden|Raivo|Ente|FreeOTP|Proton|Stratum)\b/i,
  );
  expect(listing).not.toMatch(
    /development preview|unaudited|use test accounts|Steam sign-in/i,
  );
});
