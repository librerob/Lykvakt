import base from "../public/manifest.json";
export type BrowserTarget = "chrome" | "edge" | "firefox";
export function browserTarget(mode: string): BrowserTarget {
  if (mode === "firefox" || mode === "edge" || mode === "chrome") return mode;
  if (mode === "production" || mode === "development") return "chrome";
  throw new Error("Unknown browser target: " + mode);
}
export function outputDirectory(target: BrowserTarget): string {
  return target === "chrome" ? "dist" : "dist-" + target;
}
export function browserManifest(
  target: BrowserTarget,
): Record<string, unknown> {
  const manifest: Record<string, unknown> = structuredClone(base);
  if (target === "edge")
    manifest.commands = {
      _execute_action: {
        ...base.commands._execute_action,
        suggested_key: { default: "Ctrl+Shift+7", mac: "Command+Shift+7" },
      },
    };
  if (target === "firefox") {
    delete manifest.minimum_chrome_version;
    manifest.commands = structuredClone(base.commands);
    (
      manifest.commands as typeof base.commands & {
        _execute_action: { suggested_key: { linux?: string } };
      }
    )._execute_action.suggested_key.linux = "Ctrl+Shift+7";
    manifest.background = { scripts: ["background.js"], type: "module" };
    manifest.browser_specific_settings = {
      gecko: {
        id: "lykvakt@librerob.github.io",
        strict_min_version: "153.0",
        data_collection_permissions: { required: ["none"] },
      },
    };
  }
  return manifest;
}
