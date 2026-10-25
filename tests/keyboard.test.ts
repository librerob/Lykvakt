import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { bindSearch, focusVault, installEscape } from "../src/keyboard";
import { el, input } from "../src/dom";
import { createAccounts } from "../src/ui/accounts";
import { emptyVault } from "../src/model";
import { parseURI } from "../src/import";
import type { Session } from "../src/session";
import { context } from "./helpers/ui";
import { keyEvent, TestElement, testDocument } from "./helpers/dom";
beforeEach(() => {
  vi.stubGlobal("document", testDocument);
  testDocument.activeElement = null;
  vi.stubGlobal("localStorage", { getItem: () => null });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("declares only clipboardWrite and a reserved popup command with platform-specific keys", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8"),
  );
  expect(manifest.permissions).toEqual(["clipboardWrite"]);
  for (const field of [
    "host_permissions",
    "optional_permissions",
    "optional_host_permissions",
    "background",
    "content_scripts",
  ])
    expect(manifest[field]).toBeUndefined();
  expect(manifest.commands).toEqual({
    _execute_action: {
      suggested_key: { default: "Ctrl+Shift+Y", mac: "Command+Shift+Y" },
      description: "Open Lykvakt",
    },
  });
});
it("focuses the password when locked and search when the code view is unlocked", () => {
  const password = input("password", "Master password", "password"),
    search = input("search", "Search accounts", "search");
  const root = el("div", {}, password.wrapper, search.wrapper);
  focusVault(root, false, "codes");
  expect(testDocument.activeElement).toBe(password.control);
  focusVault(root, true, "codes");
  expect(testDocument.activeElement).toBe(search.control);
});
it("Enter copies the first matching current code without revealing it", async () => {
  const writeText = vi.fn(async () => {});
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  vi.spyOn(Date, "now").mockReturnValue(0);
  const data = emptyVault();
  data.accounts = [
    parseURI(
      "otpauth://hotp/A:first?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&counter=0",
    ),
    parseURI(
      "otpauth://hotp/Z:second?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&counter=1",
    ),
  ];
  const session = {
    unlocked: true,
    check() {},
    epoch: () => 0,
    accounts: () => structuredClone(data),
  } as unknown as Session;
  const accounts = createAccounts(context(session));
  const view = accounts.codesView() as unknown as TestElement;
  const search = view.querySelector('input[name="search"]')!;
  search.value = "first";
  search.dispatchEvent(new Event("input"));
  search.dispatchEvent(keyEvent("Enter"));
  await vi.waitFor(() => expect(writeText).toHaveBeenLastCalledWith("755224"));
  expect(view.querySelector(".otp")!.textContent).toBe("••• •••");
  search.value = "second";
  search.dispatchEvent(new Event("input"));
  search.dispatchEvent(keyEvent("Enter"));
  await vi.waitFor(() => expect(writeText).toHaveBeenLastCalledWith("287082"));
  expect(view.querySelector(".otp")!.textContent).toBe("••• •••");
  accounts.clear();
});
it("Escape clears a search before closing the popup and leaves native dialog Escape alone", () => {
  const target = new EventTarget(),
    close = vi.fn();
  let searching = true,
    dialog = false;
  const clear = vi.fn(() => {
    const had = searching;
    searching = false;
    return had;
  });
  installEscape(target, clear, close, () => dialog);
  const first = keyEvent("Escape");
  target.dispatchEvent(first);
  expect(first.defaultPrevented).toBe(true);
  expect(close).not.toHaveBeenCalled();
  target.dispatchEvent(keyEvent("Escape"));
  expect(close).toHaveBeenCalledOnce();
  dialog = true;
  const event = keyEvent("Escape");
  target.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(close).toHaveBeenCalledOnce();
});
it("search Enter ignores composition and modified shortcuts", () => {
  const field = input("search", "Search accounts", "search").control;
  const copy = vi.fn(async () => {});
  bindSearch(field, copy);
  for (const extra of [
    { isComposing: true },
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true },
  ])
    (field as unknown as TestElement).dispatchEvent(keyEvent("Enter", extra));
  expect(copy).not.toHaveBeenCalled();
});
