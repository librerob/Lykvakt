import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const read = (name: string) =>
  readFileSync(
    new URL("../.github/workflows/" + name, import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
it("the existing required validate check fails unless Chrome and the reusable browser jobs both succeed", () => {
  const ci = read("ci.yml");
  expect(ci).toMatch(
    / {2}validate:\n {4}if: \$\{\{ always\(\) \}\}\n {4}needs: \[chrome, browsers\]/,
  );
  expect(ci).toContain('test "$CHROME_RESULT" = success');
  expect(ci).toContain('test "$BROWSER_RESULT" = success');
  expect(ci).toContain("CHROME_RESULT: ${{ needs.chrome.result }}");
  expect(ci).toContain("BROWSER_RESULT: ${{ needs.browsers.result }}");
  expect(ci).toContain("uses: ./.github/workflows/browsers.yml");
});
it("the browser workflow can be called by push, PR and release validation through the same caller", () => {
  expect(read("browsers.yml")).toMatch(/on:\n {2}workflow_call:/);
  const ci = read("ci.yml");
  expect(ci).toContain("  workflow_dispatch:");
  expect(ci).toContain("  push:");
  expect(ci).toContain("  pull_request:");
});
it("draft release preparation requires the aggregate gate and verifies all three downloaded artifacts before release commands", () => {
  const ci = read("ci.yml"),
    release = ci.slice(ci.indexOf("\n  release:"));
  expect(release).toContain("needs: validate");
  for (const name of [
    "synthetic-validation",
    "edge-validation",
    "firefox-validation",
  ])
    expect(release).toContain("name: " + name);
  expect(release).toContain(
    'node scripts/verify-release.mjs release-assets "$GITHUB_SHA"',
  );
  expect(release.indexOf("node scripts/verify-release.mjs")).toBeLessThan(
    release.indexOf("gh release view"),
  );
  expect(release).toContain("release-assets/*/*.zip");
  expect(release).toContain("--prerelease --draft");
});
