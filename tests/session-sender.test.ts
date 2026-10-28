import { expect, it, vi } from "vitest";
import { sessionSource } from "../src/session-sender";
const id = "abcdefghijklmnopabcdefghijklmnop";
const origin = "chrome-extension://" + id;
const sender: chrome.runtime.MessageSender = {
  id,
  url: origin + "/index.html",
  origin,
};
const popup: chrome.runtime.ExtensionContext = {
  contextId: "popup-context",
  contextType: "POPUP",
  documentId: "popup-document",
  documentUrl: sender.url,
  documentOrigin: origin,
  frameId: 0,
  tabId: -1,
  windowId: -1,
  incognito: false,
};
it("resolves a real toolbar sender without tab metadata through Chrome's live popup registry", async () => {
  const popups = vi.fn(async () => [popup]);
  expect(await sessionSource(sender, id, popups)).toBe("popup-document");
  expect(popups).toHaveBeenCalledOnce();
});
it("uses the same browser document identity for every request from that popup", async () => {
  const popups = async () => [{ ...popup }];
  expect(await sessionSource(sender, id, popups)).toBe(
    await sessionSource(sender, id, popups),
  );
  expect(await sessionSource(sender, id, popups)).toBe("popup-document");
});
it("keeps the existing top-level tab sender path without querying popup contexts", async () => {
  const popups = vi.fn(async () => []);
  expect(
    await sessionSource(
      { ...sender, documentId: "tab-document", frameId: 0 },
      id,
      popups,
    ),
  ).toBe("tab-document");
  expect(popups).not.toHaveBeenCalled();
});
it.each([
  { id: "another-extension" },
  { url: "https://example.test/index.html" },
  { url: origin + "/other.html" },
  { url: origin + "/index.html?window" },
  { origin: "https://example.test" },
  { origin: "null" },
  { origin: undefined },
  { frameId: 1 },
  { frameId: 0 },
  { documentId: "" },
  { tab: { id: 1 } },
])(
  "rejects an unverified non-tab sender without consulting session memory: %j",
  async (change) => {
    const popups = vi.fn(async () => [popup]);
    expect(
      await sessionSource(
        { ...sender, ...change } as chrome.runtime.MessageSender,
        id,
        popups,
      ),
    ).toBeUndefined();
    expect(popups).not.toHaveBeenCalled();
  },
);
it.each(
  [
    [],
    [popup, { ...popup, documentId: "another-document" }],
    [{ ...popup, contextType: "TAB" }],
    [{ ...popup, documentId: undefined }],
    [{ ...popup, documentUrl: origin + "/other.html" }],
    [{ ...popup, documentOrigin: "null" }],
    [{ ...popup, frameId: 2 }],
    [{ ...popup, tabId: 1 }],
  ].map((contexts) => ({ contexts })),
)(
  "rejects missing, ambiguous or mismatched Chrome popup contexts: %j",
  async ({ contexts }) => {
    expect(
      await sessionSource(
        sender,
        id,
        async () => contexts as chrome.runtime.ExtensionContext[],
      ),
    ).toBeUndefined();
  },
);
it("does not turn a registry failure into permission to read the session", async () => {
  await expect(
    sessionSource(sender, id, async () => {
      throw new Error("Registry unavailable");
    }),
  ).rejects.toThrow("Registry unavailable");
});

it("accepts Chrome's non-tab popup context without a frame number", async () => {
  expect(
    await sessionSource(sender, id, async () => [{ ...popup, frameId: -1 }]),
  ).toBe("popup-document");
});
