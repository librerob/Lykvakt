import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrowserSession } from "../src/browser-session";
import { SESSION_KEY, SESSION_MESSAGE } from "../src/session-cache";
let changed: (changes: Record<string, unknown>, area: string) => void;
let send: ReturnType<typeof vi.fn>, reload: ReturnType<typeof vi.fn>;
beforeEach(() => {
  send = vi.fn(async () => ({
    ok: true,
    source: "own-document",
    value: "lease",
  }));
  reload = vi.fn();
  vi.stubGlobal("chrome", {
    runtime: { sendMessage: send, reload },
    storage: {
      onChanged: {
        addListener: (listener: typeof changed) => {
          changed = listener;
        },
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
it("uses only the narrow local session protocol", async () => {
  const cache = new BrowserSession();
  expect(await cache.begin()).toBe("lease");
  expect(send).toHaveBeenCalledWith({ type: SESSION_MESSAGE, action: "begin" });
});
it("ignores its own storage event and unrelated storage areas", async () => {
  const cache = new BrowserSession(),
    callback = vi.fn();
  cache.onstate = callback;
  await cache.begin();
  changed(
    { [SESSION_KEY]: { newValue: { epoch: "x", source: "own-document" } } },
    "session",
  );
  changed(
    { [SESSION_KEY]: { newValue: { epoch: "x", source: "other" } } },
    "local",
  );
  expect(callback).not.toHaveBeenCalled();
  const state = { epoch: "x", source: "other" };
  changed({ [SESSION_KEY]: { newValue: state } }, "session");
  expect(callback).toHaveBeenCalledWith(state);
});
it("external deletion of session memory invalidates open views", () => {
  const cache = new BrowserSession(),
    callback = vi.fn();
  cache.onstate = callback;
  changed({ [SESSION_KEY]: { oldValue: { epoch: "x" } } }, "session");
  expect(callback).toHaveBeenCalledWith({ epoch: "", source: "storage" });
});
it("rejected session operations never return cached key material", async () => {
  send.mockResolvedValue({ ok: false, value: "must not return" });
  const cache = new BrowserSession();
  await expect(cache.resume()).rejects.toThrow("session ended");
});
it("an unconfirmed explicit revocation reloads the extension to clear session memory", async () => {
  send.mockRejectedValue(new Error("storage unavailable"));
  const cache = new BrowserSession();
  await expect(cache.clear()).rejects.toThrow("restarted");
  expect(reload).toHaveBeenCalledOnce();
});
it("each explicit Lock revokes the current session", async () => {
  const cache = new BrowserSession();
  await cache.clear();
  await cache.clear();
  expect(send).toHaveBeenCalledTimes(2);
});

it("Lock bypasses a pending request instead of waiting behind saved drafts", async () => {
  let release!: () => void;
  send.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () =>
          resolve({ ok: true, source: "own-document", value: "old-lease" });
      }),
  );
  const cache = new BrowserSession(),
    beginning = cache.begin();
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  const locked = cache.clear();
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1]![0].action).toBe("lock");
  await locked;
  release();
  await beginning;
});

it("dispatches the latest draft immediately rather than leaving it in a closing popup's queue", async () => {
  let release!: () => void;
  send.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () =>
          resolve({ ok: true, source: "own-document", value: "lease" });
      }),
  );
  const cache = new BrowserSession(),
    beginning = cache.begin();
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  const draft = cache.draft("lease", {
    mode: "add",
    fields: { issuer: "Example" },
  });
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1]![0]).toMatchObject({
    action: "draft",
    value: { mode: "add", fields: { issuer: "Example" } },
  });
  await draft;
  release();
  await beginning;
});
