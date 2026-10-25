import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { bindSearch } from "../src/keyboard";
import { input } from "../src/dom";
import { emptySearchMessage } from "../src/help";
import { createAccounts } from "../src/ui/accounts";
import { parseURI } from "../src/import";
import { emptyVault } from "../src/model";
import type { Session } from "../src/session";
import { context, resetUI, ui } from "./helpers/ui";
import { keyEvent, TestElement, testDocument } from "./helpers/dom";

const instances: ReturnType<typeof createAccounts>[] = [];
const writeText = vi.fn(async () => {});
beforeEach(() => {
  resetUI();
  writeText.mockClear();
  vi.stubGlobal("document", testDocument);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  vi.stubGlobal("localStorage", { getItem: () => null });
});
afterEach(() => {
  instances.forEach((accounts) => accounts.clear());
  instances.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(["", "   ", " \t\n "])(
  "Enter with %j search text never calls the copy path",
  (text) => {
    const field = input("search", "Search accounts", "search").control;
    field.value = text;
    const copy = vi.fn(async () => {});
    const empty = vi.fn();
    bindSearch(field, copy, empty);
    const event = keyEvent("Enter");
    (field as unknown as TestElement).dispatchEvent(event);
    expect(copy).not.toHaveBeenCalled();
    expect(empty).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  },
);
function view(issuer = "Example") {
  const data = emptyVault();
  data.accounts = [
    parseURI(
      "otpauth://hotp/first?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&counter=0",
    ),
  ];
  data.accounts[0]!.issuer = issuer;
  const session = {
    unlocked: true,
    check() {},
    epoch: () => 0,
    accounts: () => structuredClone(data),
  } as unknown as Session;
  const accounts = createAccounts(context(session));
  instances.push(accounts);
  return accounts.codesView() as unknown as TestElement;
}
it("the vault prompts for an account search, then names the copied match without revealing", async () => {
  const root = view();
  const search = root.querySelector('input[name="search"]')!;
  for (const value of ["", "   "]) {
    search.value = value;
    search.dispatchEvent(new Event("input"));
    search.dispatchEvent(keyEvent("Enter"));
    expect(writeText).not.toHaveBeenCalled();
    expect(ui.messages.at(-1)).toBe(emptySearchMessage);
    expect(root.querySelector(".otp")!.textContent).toBe("••• •••");
  }
  search.value = " first ";
  search.dispatchEvent(new Event("input"));
  search.dispatchEvent(keyEvent("Enter"));
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("755224"));
  expect(ui.messages.at(-1)).toBe(
    "Copied code for Example first. Clipboard managers may keep a copy.",
  );
  expect(root.querySelector(".otp")!.textContent).toBe("••• •••");
});
it("an explicit Copy button still works with an empty search and names accounts without an issuer", async () => {
  const root = view("");
  root
    .querySelectorAll("button")
    .find((button) => button.textContent === "Copy")!
    .click();
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("755224"));
  expect(ui.messages.at(-1)).toBe(
    "Copied code for first. Clipboard managers may keep a copy.",
  );
  expect(root.querySelector(".otp")!.textContent).toBe("••• •••");
});
it("a non-empty search with no match cannot copy another account", () => {
  const root = view();
  const search = root.querySelector('input[name="search"]')!;
  search.value = "not-an-account";
  search.dispatchEvent(new Event("input"));
  search.dispatchEvent(keyEvent("Enter"));
  expect(writeText).not.toHaveBeenCalled();
  expect(ui.messages.at(-1)).toBe(
    "No matching account. Try a different search.",
  );
});
