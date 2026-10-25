import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const root = css.match(/:root\s*\{([^}]+)\}/)![1]!;
const properties = new Map(
  [...root.matchAll(/(--[\w-]+):\s*(#[\da-f]{6}|var\(--[\w-]+\));/gi)].map(
    (m) => [m[1]!, m[2]!],
  ),
);
function color(name: string): string {
  const value = properties.get(name);
  if (!value) throw new Error("Unknown palette color: " + name);
  return value.startsWith("var(") ? color(value.slice(4, -1)) : value;
}
function luminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(foreground: string, background: string): number {
  const a = luminance(color(foreground)),
    b = luminance(color(background));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
// All actual pairings, grouped by shared tokens: normal/large text and masked
// codes; hints/placeholders/disabled labels; pink links/status/errors/icons;
// borders; black primary-button labels, checkbox ticks and selection text.
const surfaces = ["--bg", "--surface", "--surface-alt"];
const pairs: [string, string, number][] = [
  ...["--text", "--muted", "--primary"].flatMap((fg) =>
    surfaces.map((bg) => [fg, bg, 4.5] as [string, string, number]),
  ),
  ...surfaces.map((bg) => ["--line", bg, 3] as [string, string, number]),
  ["--on-primary", "--primary", 4.5],
];
it.each(pairs)("%s against %s meets WCAG AA %f:1", (fg, bg, threshold) => {
  expect(contrast(fg, bg)).toBeGreaterThanOrEqual(threshold);
});
it("tests the logo accent and every foreground/background palette token actually used", () => {
  const svg = readFileSync(
    new URL("../public/icons/source.svg", import.meta.url),
    "utf8",
  );
  const fills = [...svg.matchAll(/<path\b[^>]*\bfill="(#[\da-f]{6})"/gi)].map(
    (m) => m[1]!.toLowerCase(),
  );
  expect([...new Set(fills)]).toEqual([color("--primary")]);
  expect(color("--tonal")).toBe(color("--surface-alt"));
  expect(color("--on-tonal")).toBe(color("--text"));
  expect(color("--danger")).toBe(color("--primary"));
  expect(color("--focus")).toBe(color("--primary"));
  expect(
    new Set(
      [...css.matchAll(/(?<!-)color:\s*var\((--[\w-]+)\)/g)].map((m) => m[1]),
    ),
  ).toEqual(
    new Set([
      "--text",
      "--muted",
      "--primary",
      "--danger",
      "--on-primary",
      "--on-tonal",
    ]),
  );
  expect(
    new Set(
      [
        ...css.matchAll(/(?<!-)background(?:-color)?:\s*var\((--[\w-]+)\)/g),
      ].map((m) => m[1]),
    ),
  ).toEqual(
    new Set(["--bg", "--surface", "--surface-alt", "--primary", "--tonal"]),
  );
  expect(properties.size).toBe(12);
});
it("keeps one dark palette, visible focus, and explicit high-contrast disabled controls", () => {
  expect(color("--bg")).toBe("#000000");
  expect(root).toContain("color-scheme: dark;");
  expect(
    readFileSync(new URL("../index.html", import.meta.url), "utf8"),
  ).toContain('<meta name="color-scheme" content="dark"');
  expect(css).not.toMatch(
    /data-theme|data-accent|prefers-color-scheme|gradient\(|box-shadow|filter:|opacity:\s*0?\./,
  );
  expect(css).toMatch(
    /:focus-visible\s*\{\s*outline: 3px solid var\(--focus\);\s*outline-offset: 3px;/,
  );
  const disabled = css.match(/\.button:disabled\s*\{([^}]+)\}/)![1]!;
  expect(disabled).toContain("opacity: 1;");
  expect(disabled).toContain("color: var(--muted);");
  expect(disabled).toContain("background: var(--surface-alt);");
  expect(disabled).toContain("border-color: var(--line);");
});

it("the normal countdown arc remains distinguishable from its visible track", () => {
  expect(contrast("--text", "--line")).toBeGreaterThanOrEqual(3);
  expect(css).toMatch(/\.ring-progress\s*\{[^}]*stroke: var\(--text\)/);
});
