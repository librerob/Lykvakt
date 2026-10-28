export function extensionOrigin(root: string): string | undefined {
  try {
    const url = new URL(root);
    if (
      !["chrome-extension:", "moz-extension:"].includes(url.protocol) ||
      !url.hostname ||
      url.port ||
      url.username ||
      url.password ||
      root !== url.protocol + "//" + url.hostname + "/"
    )
      return undefined;
    return root.slice(0, -1);
  } catch {
    return undefined;
  }
}
