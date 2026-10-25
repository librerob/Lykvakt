import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createProtection } from "../src/ui/protection";
import { DEFAULT_KDF, type Argon2Policy } from "../src/kdf-policy";
import * as kdf from "../src/kdf";
import * as storage from "../src/storage";
import { emptyVault } from "../src/model";
import type { Session } from "../src/session";
import { context } from "./helpers/ui";
import { TestElement, testDocument } from "./helpers/dom";
beforeEach(() => {
  vi.stubGlobal("document", testDocument);
  vi.stubGlobal(
    "FormData",
    class {
      constructor(_form: unknown) {}
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("tuning waits for an explicit click, previews an unapplied result and requires password authentication to save", async () => {
  let policy: Argon2Policy = { ...DEFAULT_KDF };
  const controller = new AbortController();
  const unlock = vi.fn(async (password: string, chosen: Argon2Policy) => {
    if (password !== "synthetic correct password")
      throw new DOMException("Wrong password", "OperationError");
    policy = chosen;
  });
  const session = {
    unlocked: true,
    check() {},
    epoch: () => 0,
    cancellationSignal: () => controller.signal,
    current: () => ({ password: policy }),
    accounts: () => emptyVault(),
    unlock,
  } as unknown as Session;
  const ctx = context(session),
    errors: unknown[] = [];
  let dialog: TestElement | undefined;
  ctx.modal = (_title, node) => {
    dialog = node as TestElement;
  };
  ctx.closeDialog = vi.fn();
  ctx.render = vi.fn();
  ctx.run = async (action) => {
    try {
      await action();
    } catch (error) {
      errors.push(error);
    }
  };
  const calibrate = vi.spyOn(kdf, "calibrateProtection").mockResolvedValue({
    policy: { ...DEFAULT_KDF, t: 5 },
    measuredMs: 200,
    estimatedMs: 1000,
  });
  const commit = vi.spyOn(storage, "commit");
  const protection = createProtection(ctx),
    panel = protection.panel as unknown as TestElement;
  const choice = panel.querySelector('select[name="protection"]')!;
  expect(choice.value).toBe("recommended");
  expect(calibrate).not.toHaveBeenCalled();
  choice.value = "tune";
  choice.dispatchEvent(new Event("change"));
  expect(calibrate).not.toHaveBeenCalled();
  expect(() => protection.forPasswordChange()).toThrow("Test this computer");
  panel
    .querySelectorAll("button")
    .find((node) => node.textContent === "Test this computer")!
    .click();
  await vi.waitFor(() =>
    expect(panel.querySelector("[data-calibration-result]")!.hidden).toBe(
      false,
    ),
  );
  expect(calibrate).toHaveBeenCalledTimes(1);
  expect(unlock).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  expect(protection.forPasswordChange()).toEqual({ ...DEFAULT_KDF, t: 5 });
  panel
    .querySelectorAll("button")
    .find((node) => node.textContent === "Apply protection")!
    .click();
  const form = dialog!,
    password = form.querySelector('input[name="protectionPassword"]')!;
  password.value = "wrong password";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  await vi.waitFor(() => expect(form.getAttribute("aria-busy")).toBe("false"));
  expect(errors).toHaveLength(1);
  expect(policy).toEqual(DEFAULT_KDF);
  expect(password.value).toBe("");
  expect(ctx.closeDialog).not.toHaveBeenCalled();
  password.value = "synthetic correct password";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  await vi.waitFor(() => expect(ctx.closeDialog).toHaveBeenCalledOnce());
  expect(unlock).toHaveBeenLastCalledWith("synthetic correct password", {
    ...DEFAULT_KDF,
    t: 5,
  });
  expect(password.value).toBe("");
  expect(policy.t).toBe(5);
});
it("password change preserves an existing stronger policy when Recommended is selected", () => {
  const stronger = { ...DEFAULT_KDF, m: 131_072, t: 5 };
  const session = {
    current: () => ({ password: stronger }),
  } as unknown as Session;
  const protection = createProtection(context(session));
  expect(protection.forPasswordChange()).toEqual(stronger);
});
