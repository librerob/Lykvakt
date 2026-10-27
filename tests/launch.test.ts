import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openVault } from "../src/launch";

const url = "chrome-extension://" + "a".repeat(32) + "/index.html?window";
let api: {
  runtime: {
    getURL: ReturnType<typeof vi.fn>;
    getContexts: ReturnType<typeof vi.fn>;
  };
  tabs: { update: ReturnType<typeof vi.fn> };
  windows: {
    get: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};
beforeEach(() => {
  api = {
    runtime: { getURL: vi.fn(() => url), getContexts: vi.fn(async () => []) },
    tabs: { update: vi.fn(async () => ({})) },
    windows: {
      get: vi.fn(async () => ({ state: "normal" })),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
  };
  vi.stubGlobal("chrome", api);
});
afterEach(() => vi.unstubAllGlobals());
it("opens a dedicated vault window without inspecting website tabs", async () => {
  await openVault();
  expect(api.runtime.getContexts).toHaveBeenCalledWith({ documentUrls: [url] });
  expect(api.windows.create).toHaveBeenCalledWith({
    url,
    type: "popup",
    width: 440,
    height: 800,
    focused: true,
  });
  expect(api.tabs.update).not.toHaveBeenCalled();
});
it("focuses the existing vault window instead of replacing its unlocked page", async () => {
  api.runtime.getContexts.mockResolvedValue([
    { documentUrl: url, tabId: 7, windowId: 4 },
  ]);
  await openVault();
  expect(api.tabs.update).toHaveBeenCalledWith(7, { active: true });
  expect(api.windows.update).toHaveBeenCalledWith(4, { focused: true });
  expect(api.windows.create).not.toHaveBeenCalled();
});
it.each([
  { documentUrl: "https://example.test", tabId: 7, windowId: 4 },
  { documentUrl: url, tabId: -1, windowId: 4 },
  { documentUrl: url, tabId: 7, windowId: NaN },
])("does not focus an unrelated or invalid context: %j", async (context) => {
  api.runtime.getContexts.mockResolvedValue([context]);
  await openVault();
  expect(api.tabs.update).not.toHaveBeenCalled();
  expect(api.windows.create).toHaveBeenCalledOnce();
});
it("opens a replacement if the previous vault window closed during lookup", async () => {
  api.runtime.getContexts.mockResolvedValue([
    { documentUrl: url, tabId: 7, windowId: 4 },
  ]);
  api.tabs.update.mockRejectedValue(new Error("Tab closed"));
  await openVault();
  expect(api.windows.create).toHaveBeenCalledOnce();
});
it("reports window creation errors without opening another destination", async () => {
  api.windows.create.mockRejectedValue(new Error("Window creation failed"));
  await expect(openVault()).rejects.toThrow("Window creation failed");
  expect(api.windows.create).toHaveBeenCalledOnce();
});

it("restores a minimized vault window while keeping its page", async () => {
  api.runtime.getContexts.mockResolvedValue([
    { documentUrl: url, tabId: 7, windowId: 4 },
  ]);
  api.windows.get.mockResolvedValue({ state: "minimized" });
  await openVault();
  expect(api.windows.update).toHaveBeenCalledWith(4, {
    focused: true,
    state: "normal",
  });
  expect(api.windows.create).not.toHaveBeenCalled();
});
