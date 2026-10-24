import { siteOrigin } from "./model";
export interface WebsiteTab {
  id: number;
  windowId: number;
  url: string;
  origin: string;
}
export async function currentWebsite(): Promise<WebsiteTab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || tab.id === undefined || tab.windowId === undefined)
    throw new Error("Open Lykvakt from the toolbar on the website first.");
  return {
    id: tab.id,
    windowId: tab.windowId,
    url: tab.url,
    origin: siteOrigin(tab.url),
  };
}
export async function unchangedWebsite(target: WebsiteTab): Promise<void> {
  const current = await currentWebsite();
  if (
    current.id !== target.id ||
    current.windowId !== target.windowId ||
    current.url !== target.url
  )
    throw new Error(
      "The active page changed. Open the extension on the intended website again.",
    );
}
export async function captureWebsite(): Promise<Blob> {
  const target = await currentWebsite();
  const screenshot = await chrome.tabs.captureVisibleTab(target.windowId, {
    format: "png",
  });
  await unchangedWebsite(target);
  // No fetch, storage, worker messages or uploads: decode the local data URL only.
  if (
    !screenshot.startsWith("data:image/png;base64,") ||
    screenshot.length > 24_000_000
  )
    throw new Error(
      "This page image is too large. Use a cropped QR image instead.",
    );
  const binary = atob(screenshot.slice(22));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "image/png" });
  bytes.fill(0);
  return blob;
}
