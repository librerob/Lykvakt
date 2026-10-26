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
