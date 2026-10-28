export function shortcutSettingsURL(root: string, userAgent: string): string {
  if (root.startsWith("moz-extension:")) return "about:addons";
  return userAgent.includes("Edg/")
    ? "edge://extensions/shortcuts"
    : "chrome://extensions/shortcuts";
}
