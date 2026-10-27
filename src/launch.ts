export async function openVault(): Promise<void> {
  const url = chrome.runtime.getURL("index.html?window");
  const contexts = await chrome.runtime.getContexts({ documentUrls: [url] });
  const existing = contexts.find(
    (context) =>
      context.documentUrl === url &&
      Number.isSafeInteger(context.tabId) &&
      context.tabId >= 0 &&
      Number.isSafeInteger(context.windowId) &&
      context.windowId >= 0,
  );
  if (existing) {
    try {
      await chrome.tabs.update(existing.tabId, { active: true });
      const window = await chrome.windows.get(existing.windowId);
      await chrome.windows.update(
        existing.windowId,
        window.state === "minimized"
          ? { focused: true, state: "normal" }
          : { focused: true },
      );
      return;
    } catch {
      // The vault window may have closed after the context lookup.
    }
  }
  await chrome.windows.create({
    url,
    type: "popup",
    width: 440,
    height: Math.min(700, globalThis.screen?.availHeight || 700),
    focused: true,
  });
}
