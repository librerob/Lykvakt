import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAccounts } from "../src/ui/accounts";
import { createSettings } from "../src/ui/settings";
import { upgradeNotice } from "../src/ui/upgrade-notice";
import { friendlyError, upgradePendingMessage } from "../src/help";
import { DEFAULT_KDF } from "../src/kdf-policy";
import { emptyVault } from "../src/model";
import { Session } from "../src/session";
import * as storage from "../src/storage";
import { passwordVault } from "./helpers/vault";
import { context, resetUI } from "./helpers/ui";
import { primaryText, TestElement, testDocument } from "./helpers/dom";

const instances: ReturnType<typeof createAccounts>[] = [];
beforeEach(() => {
  resetUI();
  vi.stubGlobal("document", testDocument);
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("localStorage", { getItem: () => null });
});
afterEach(() => {
  instances.forEach((accounts) => accounts.clear());
  instances.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture(pending = true) {
  const session = {
    unlocked: true,
    timeout: 300_000,
    upgradePending: pending,
    upgradePendingDetail: "synthetic KDF envelope write failure",
    accounts: () => emptyVault(),
    current: () => ({ password: DEFAULT_KDF }),
    epoch: () => 0,
    check() {},
    lock: vi.fn(),
  } as unknown as Session;
  return context(session);
}
function codes(ctx: ReturnType<typeof fixture>) {
  const accounts = createAccounts(ctx);
  instances.push(accounts);
  return accounts.codesView() as unknown as TestElement;
}
it.each(["vault", "settings"])(
  "%s shows pending-upgrade copy with collapsed technical details and no primary-UI jargon",
  (screen) => {
    const ctx = fixture();
    const root =
      screen === "vault"
        ? codes(ctx)
        : (createSettings(ctx).settingsView() as unknown as TestElement);
    const notice = root.querySelector(
      '[aria-label="Security upgrade reminder"]',
    )!;
    expect(notice).not.toBeNull();
    expect(primaryText(notice)).toContain(upgradePendingMessage);
    expect(primaryText(notice)).not.toMatch(
      /\b(?:Argon2id|PBKDF2|KDF|AES|GCM|AAD|envelope|nonce|iterations|WASM)\b/i,
    );
    const detail = notice.querySelector("[data-technical]")!;
    expect(detail.hasAttribute("open")).toBe(false);
    expect(detail.textContent).toContain(
      "synthetic KDF envelope write failure",
    );
    expect(notice.querySelector("button")!.textContent).toBe(
      "Dismiss upgrade notice",
    );
  },
);
it("dismissal hides the notice across views without changing pending state or locking", () => {
  const ctx = fixture();
  const root = codes(ctx);
  const notice = root.querySelector(
    '[aria-label="Security upgrade reminder"]',
  )!;
  notice.querySelector("button")!.click();
  expect(
    root.querySelector('[aria-label="Security upgrade reminder"]'),
  ).toBeNull();
  expect(ctx.state.upgradeNoticeDismissed).toBe(true);
  expect(upgradeNotice(ctx)).toBeNull();
  expect(
    (
      createSettings(ctx).settingsView() as unknown as TestElement
    ).querySelector('[aria-label="Security upgrade reminder"]'),
  ).toBeNull();
  expect(ctx.session.upgradePending).toBe(true);
  expect(ctx.session.lock).not.toHaveBeenCalled();
});
it("a completed or unnecessary upgrade has no notice", () => {
  const ctx = fixture(false);
  expect(
    codes(ctx).querySelector('[aria-label="Security upgrade reminder"]'),
  ).toBeNull();
  expect(
    (
      createSettings(ctx).settingsView() as unknown as TestElement
    ).querySelector('[aria-label="Security upgrade reminder"]'),
  ).toBeNull();
});
it("a new unlock can show the notice again after its dismissal", () => {
  const ctx = fixture();
  const first = upgradeNotice(ctx) as unknown as TestElement;
  first.querySelector("button")!.click();
  expect(upgradeNotice(ctx)).toBeNull();
  ctx.state.upgradeNoticeDismissed = false;
  expect((upgradeNotice(ctx) as unknown as TestElement).textContent).toContain(
    upgradePendingMessage,
  );
});
it("the friendly conflict error preserves the request to unlock again", () => {
  const message = "Your vault changed in another window. Unlock again.";
  expect(
    friendlyError(
      new Error(message, { cause: new storage.StorageConflictError() }),
    ).message,
  ).toBe(message);
});
it("a typed conflict during a real default Argon2id migration stays locked", async () => {
  const password = "synthetic default Argon conflict password";
  const old = await passwordVault(password);
  await storage.commit(old);
  vi.spyOn(storage, "commit").mockRejectedValueOnce(
    new storage.StorageConflictError(),
  );
  const session = new Session();
  await expect(session.unlock(password)).rejects.toThrow(
    "Your vault changed in another window. Unlock again.",
  );
  expect(session.unlocked).toBe(false);
  expect(session.upgradePending).toBe(false);
  expect(await storage.load()).toEqual(old);
}, 60_000);
it("a transient default Argon2id migration exposes pending state and a successful retry clears it", async () => {
  const password = "synthetic default Argon retry password";
  const old = await passwordVault(password);
  await storage.commit(old);
  vi.spyOn(storage, "commit").mockRejectedValueOnce(
    new Error("synthetic transient upgrade write"),
  );
  const session = new Session();
  await session.unlock(password);
  expect(session.unlocked).toBe(true);
  expect(session.upgradePending).toBe(true);
  expect(session.current()).toEqual(old);
  expect(await storage.load()).toEqual(old);
  session.lock();
  await session.unlock(password);
  expect(session.upgradePending).toBe(false);
  expect(session.current().password).toMatchObject(DEFAULT_KDF);
  expect(await storage.load()).toEqual(session.current());
}, 60_000);
