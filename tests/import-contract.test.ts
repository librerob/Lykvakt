import { it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
const sourceRoot = new URL("../src/", import.meta.url);
const walk = (dir: URL): URL[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(new URL(entry.name + "/", dir))
      : [new URL(entry.name, dir)],
  );
it("ships no network API or WebAssembly runtime and keeps exactly the existing dependencies", () => {
  for (const file of walk(sourceRoot).filter((file) =>
    file.pathname.endsWith(".ts"),
  )) {
    const code = readFileSync(file, "utf8");
    expect(code).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(|\bWebAssembly\b/,
    );
  }
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  expect(pkg.dependencies).toEqual({
    "@noble/hashes": "2.4.0",
    jsqr: "1.4.0",
    qrcode: "1.5.4",
  });
  const manifest = JSON.parse(
    readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8"),
  );
  expect(manifest.permissions).toEqual(["clipboardWrite", "storage", "alarms"]);
});
