import { afterEach, it, expect, vi } from "vitest";
import { captureWebsite, currentWebsite, unchangedWebsite } from "../src/tab";
afterEach(() => vi.unstubAllGlobals());
function browser(url = "https://example.test/setup") {
  const query = vi.fn().mockResolvedValue([{ id: 1, windowId: 2, url }]);
  const captureVisibleTab = vi
    .fn()
    .mockResolvedValue("data:image/png;base64,AQID");
  vi.stubGlobal("chrome", { tabs: { query, captureVisibleTab } });
  return { query, captureVisibleTab };
}
it("captures only the explicitly queried HTTPS active tab and returns a local blob", async () => {
  const api = browser();
  const blob = await captureWebsite();
  expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3]);
  expect(api.captureVisibleTab).toHaveBeenCalledWith(2, { format: "png" });
  expect(api.query).toHaveBeenCalledTimes(2);
});
it("rejects navigation or tab switches during capture", async () => {
  const api = browser();
  api.query
    .mockResolvedValueOnce([
      { id: 1, windowId: 2, url: "https://example.test/setup" },
    ])
    .mockResolvedValue([
      { id: 3, windowId: 2, url: "https://example.test/setup" },
    ]);
  await expect(captureWebsite()).rejects.toThrow("changed");
});
it("requires toolbar invocation on HTTPS and refuses browser/internal/file pages", async () => {
  for (const url of [
    "chrome://settings",
    "http://example.test",
    "file:///secret",
    "data:text/plain,hi",
  ]) {
    browser(url);
    await expect(currentWebsite()).rejects.toThrow();
  }
  const api = browser();
  api.query.mockResolvedValue([{ id: 1 }]);
  await expect(currentWebsite()).rejects.toThrow("toolbar");
});
it("does not accept a different path at a previously approved origin", async () => {
  const api = browser();
  const target = await currentWebsite();
  api.query.mockResolvedValue([
    { id: 1, windowId: 2, url: "https://example.test/other" },
  ]);
  await expect(unchangedWebsite(target)).rejects.toThrow("changed");
});
it("rejects unexpected or oversized capture data", async () => {
  const api = browser();
  api.captureVisibleTab.mockResolvedValue("data:text/plain;base64,AQID");
  await expect(captureWebsite()).rejects.toThrow("too large");
});
