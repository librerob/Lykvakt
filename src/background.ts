import { loadDirectory, lookup } from "./directory";

let epoch = 0;
const pending = new Map<number, number>();
async function enabled(): Promise<boolean> {
  return (
    !!(await chrome.storage.local.get("automatic")).automatic &&
    (await chrome.permissions.contains({ permissions: ["tabs"] }))
  );
}
async function update(id: number, url?: string): Promise<void> {
  const generation = epoch;
  const sequence = (pending.get(id) ?? 0) + 1;
  pending.set(id, sequence);
  try {
    const allowed = await enabled();
    const found =
      allowed && url ? lookup(url, await loadDirectory()) : undefined;
    if (generation !== epoch || pending.get(id) !== sequence) return;
    await chrome.action.setBadgeText({ tabId: id, text: found ? "2FA" : "" });
    await chrome.action.setBadgeBackgroundColor({
      tabId: id,
      color: "#285c4b",
    });
    await chrome.action.setTitle({
      tabId: id,
      title: found
        ? "This website lists two-factor authentication support"
        : "OTP Vault",
    });
  } catch {
    /* Closed and restricted tabs need no badge. */
  }
}
async function refresh(): Promise<void> {
  epoch++;
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((t) => (t.id !== undefined ? update(t.id, t.url) : undefined)),
  );
}
chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (info.url || info.status === "complete")
    void update(id, info.url ?? tab.url);
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs
    .get(tabId)
    .then((t) => update(tabId, t.url))
    .catch(() => {});
});
chrome.permissions.onRemoved.addListener(() => {
  void refresh();
});
chrome.permissions.onAdded.addListener(() => {
  void refresh();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.automatic) void refresh();
});
chrome.runtime.onStartup.addListener(() => {
  void refresh();
});
chrome.runtime.onInstalled.addListener(() => {
  void refresh();
});

chrome.tabs.onRemoved.addListener((id) => {
  pending.delete(id);
});
