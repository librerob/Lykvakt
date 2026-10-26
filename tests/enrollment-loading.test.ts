import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createAccounts } from "../src/ui/accounts";
import { emptyVault } from "../src/model";
import type { Session } from "../src/session";
import { context } from "./helpers/ui";
import { testDocument, TestElement } from "./helpers/dom";
let accounts: ReturnType<typeof createAccounts>;
beforeEach(() => {
  vi.stubGlobal("document", testDocument);
  vi.stubGlobal("localStorage", { getItem: () => null });
});
afterEach(() => {
  accounts?.clear();
  vi.unstubAllGlobals();
});
function setup() {
  let unlocked = true,
    epoch = 0;
  const session = {
    get unlocked() {
      return unlocked;
    },
    accounts: () => emptyVault(),
    epoch: () => epoch,
    check() {
      if (!unlocked) throw new Error("Unlock the vault to continue.");
    },
  } as unknown as Session;
  const ctx = context(session),
    errors: unknown[] = [];
  ctx.modal = vi.fn();
  ctx.run = async (action) => {
    try {
      await action();
    } catch (error) {
      errors.push(error);
    }
  };
  accounts = createAccounts(ctx);
  const view = accounts.codesView() as unknown as TestElement;
  const click = (name: string) =>
    view
      .querySelectorAll("button")
      .find((b) => b.textContent === name)!
      .click();
  return {
    ctx,
    click,
    errors,
    lock: () => {
      unlocked = false;
      epoch++;
      accounts.clear();
    },
  };
}
it("after the first lazy load, account dialogs and their keyboard help are ready in the click handler", async () => {
  const { ctx, click, errors } = setup();
  click("Import accounts");
  await vi.waitFor(() =>
    expect(ctx.modal).toHaveBeenCalledWith(
      "Import accounts",
      expect.anything(),
    ),
  );
  vi.mocked(ctx.modal).mockClear();
  click("+ Add account");
  expect(ctx.modal).toHaveBeenCalledWith("Add account", expect.anything());
  expect(errors).toEqual([]);
});
it("locking while the first enrollment import is pending prevents opening its dialog", async () => {
  const { ctx, click, errors, lock } = setup();
  click("Import accounts");
  lock();
  await vi.waitFor(() => expect(errors).toHaveLength(1));
  expect(ctx.modal).not.toHaveBeenCalled();
});
