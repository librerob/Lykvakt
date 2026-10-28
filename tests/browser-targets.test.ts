import { expect, it, vi } from "vitest";
import base from "../public/manifest.json";
import {
  browserTarget,
  browserManifest,
  outputDirectory,
} from "../build/targets";
import { trustedSessionSender } from "../src/session-broker";
import { sessionSource } from "../src/session-sender";
import { restrictSessionStorage } from "../src/session-access";
import { extensionOrigin } from "../src/extension-origin";
import { shortcutSettingsURL } from "../src/shortcut-settings";
const id = "lykvakt@librerob.github.io";
const root = "moz-extension://8e8f9932-833a-4b2c-9823-328d58ba6c79/";
const sender = {
  id,
  documentId: "browser-document",
  frameId: 0,
  url: root + "index.html?window",
};
it.each(["chrome", "edge", "firefox"] as const)(
  "keeps the same permissions, CSP, popup and shortcut for %s",
  (target) => {
    const m = browserManifest(target);
    expect(m.permissions).toEqual(["clipboardWrite", "storage", "alarms"]);
    expect(m.content_security_policy).toEqual(base.content_security_policy);
    expect(m.action).toEqual(base.action);
    expect(m.commands).toEqual(
      target === "firefox"
        ? {
            _execute_action: {
              ...base.commands._execute_action,
              suggested_key: {
                ...base.commands._execute_action.suggested_key,
                linux: "Ctrl+Shift+7",
              },
            },
          }
        : target === "edge"
          ? {
              _execute_action: {
                ...base.commands._execute_action,
                suggested_key: {
                  default: "Ctrl+Shift+7",
                  mac: "Command+Shift+7",
                },
              },
            }
          : base.commands,
    );
    for (const key of [
      "host_permissions",
      "optional_permissions",
      "optional_host_permissions",
      "content_scripts",
      "externally_connectable",
      "web_accessible_resources",
    ])
      expect(m[key]).toBeUndefined();
  },
);
it("gives Firefox an event page, stable add-on ID, minimum version and no-data declaration", () => {
  const m = browserManifest("firefox");
  expect(m.minimum_chrome_version).toBeUndefined();
  expect(m.background).toEqual({ scripts: ["background.js"], type: "module" });
  expect(m.browser_specific_settings).toEqual({
    gecko: {
      id,
      strict_min_version: "153.0",
      data_collection_permissions: { required: ["none"] },
    },
  });
  expect(base.background).toEqual({
    service_worker: "background.js",
    type: "module",
  });
});
it("changes only the Edge shortcut without mutating the source manifest", () => {
  expect(browserManifest("chrome")).toEqual(base);
  const { commands, ...edge } = browserManifest("edge");
  expect(commands).toEqual({
    _execute_action: {
      description: "Open Lykvakt",
      suggested_key: { default: "Ctrl+Shift+7", mac: "Command+Shift+7" },
    },
  });
  const { commands: _commands, ...chrome } = base;
  expect(edge).toEqual(chrome);
});
it.each(["chrome", "edge", "firefox"] as const)(
  "separates the %s output directory",
  (target) => {
    expect(outputDirectory(target)).toBe(
      target === "chrome" ? "dist" : "dist-" + target,
    );
    expect(browserTarget(target)).toBe(target);
  },
);
it("defaults normal Vite modes to Chrome and rejects typos", () => {
  expect(browserTarget("production")).toBe("chrome");
  expect(browserTarget("development")).toBe("chrome");
  expect(() => browserTarget("fireofx")).toThrow("Unknown browser target");
});
it("authenticates Firefox's runtime ID separately from its browser-issued URL UUID", () => {
  expect(trustedSessionSender(sender, id, root)).toBe(true);
  expect(trustedSessionSender(sender, id)).toBe(false);
});
it.each([
  { id: "other-addon" },
  { url: "moz-extension://other/index.html" },
  { url: root + "other.html" },
  { url: "https://example.test/index.html" },
  { frameId: 1 },
  { documentId: undefined },
])("rejects a mismatched Firefox vault sender %j", (change) => {
  expect(trustedSessionSender({ ...sender, ...change }, id, root)).toBe(false);
});
it("resolves Firefox popup identity without changing the Chrome fallback", async () => {
  const origin = root.slice(0, -1);
  const popupSender = { id, origin, url: root + "index.html" };
  const popup = {
    contextType: "POPUP",
    documentUrl: popupSender.url,
    documentOrigin: origin,
    tabId: -1,
    frameId: 0,
    documentId: "firefox-popup",
  } as chrome.runtime.ExtensionContext;
  expect(await sessionSource(popupSender, id, async () => [popup], root)).toBe(
    "firefox-popup",
  );
  expect(
    await sessionSource(popupSender, id, async () => [popup, popup], root),
  ).toBeUndefined();
  expect(
    await sessionSource(
      { ...popupSender, id: "other" },
      id,
      async () => [popup],
      root,
    ),
  ).toBeUndefined();
});
it.each([
  "https://example.test/",
  "file:///",
  "invalid",
  root + "index.html",
  root + "?extra",
  "moz-extension://user@host/",
])("rejects an invalid browser root %s", async (value) => {
  expect(extensionOrigin(value)).toBeUndefined();
  expect(trustedSessionSender(sender, id, value)).toBe(false);
  const restrict = vi.fn(async () => {});
  await expect(restrictSessionStorage(value, restrict)).rejects.toThrow(
    "Invalid extension origin",
  );
  expect(restrict).not.toHaveBeenCalled();
});
it("still requires Chrome to confirm the session storage access restriction", async () => {
  const restrict = vi.fn(async () => {
    throw new Error("Access restriction failed");
  });
  await expect(
    restrictSessionStorage("chrome-extension://own/", restrict),
  ).rejects.toThrow("Access restriction failed");
  expect(restrict).toHaveBeenCalledOnce();
});
it("does not call the unsupported access-level API on Firefox's privileged session area", async () => {
  const restrict = vi.fn(async () => {
    throw new Error("unsupported");
  });
  await restrictSessionStorage(root, restrict);
  expect(restrict).not.toHaveBeenCalled();
});
it.each([
  [root, "", "about:addons"],
  [
    "chrome-extension://own/",
    "Chrome/155 Edg/155",
    "edge://extensions/shortcuts",
  ],
  ["chrome-extension://own/", "Chrome/155", "chrome://extensions/shortcuts"],
])("opens the browser's own shortcut manager", (origin, agent, expected) => {
  expect(shortcutSettingsURL(origin!, agent!)).toBe(expected);
});
