import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { documentationLink, technicalDetails, el } from "../src/dom";
import { DOCUMENTATION_URL } from "../src/documentation";
import { friendlyError } from "../src/help";
import { createSettings } from "../src/ui/settings";
import { createWelcome } from "../src/ui/welcome";
import { createRecovery } from "../src/ui/recovery";
import { createEnrollment } from "../src/ui/enrollment";
import { DEFAULT_KDF } from "../src/kdf-policy";
import { emptyVault } from "../src/model";
import { parseURI } from "../src/import";
import type { Session } from "../src/session";
import { context } from "./helpers/ui";
import { primaryText, TestElement, testDocument } from "./helpers/dom";
beforeEach(() => {
  vi.stubGlobal("document", testDocument);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem() {} });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("the documentation link is a native, isolated link to the GitHub guide", () => {
  const link = documentationLink() as unknown as TestElement;
  expect(link.tagName).toBe("A");
  expect(link.textContent).toBe("Full documentation on GitHub");
  expect(link.getAttribute("href")).toBe(DOCUMENTATION_URL);
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
});

it("rendered primary screens and secret-export forms contain no cryptography jargon outside Technical details", () => {
  const data = emptyVault();
  data.accounts.push(
    parseURI("otpauth://totp/Test:user?secret=JBSWY3DPEHPK3PXP"),
  );
  const session = {
    unlocked: true,
    timeout: 300_000,
    accounts: () => structuredClone(data),
    current: () => ({ password: DEFAULT_KDF }),
    check() {},
    epoch: () => 0,
  } as unknown as Session;
  const ctx = context(session),
    views: TestElement[] = [];
  ctx.modal = (_title, node) => {
    views.push(node as TestElement);
  };
  const recovery = createRecovery(ctx, async () => {});
  views.push(createSettings(ctx).settingsView() as unknown as TestElement);
  views.push(recovery.backupsView() as unknown as TestElement);
  ctx.state.exists = false;
  views.push(createWelcome(ctx, () => {}).locked() as unknown as TestElement);
  ctx.state.exists = true;
  ctx.state.recovery = {
    kind: "recovery",
    previous: { revision: 4 } as never,
    active: {},
  };
  views.push(createWelcome(ctx, () => {}).locked() as unknown as TestElement);
  ctx.state.oldVault = {
    kind: "old-format",
    active: { format: "otp-vault", version: 1 },
    previous: undefined,
  };
  views.push(createWelcome(ctx, () => {}).locked() as unknown as TestElement);
  const enrollment = createEnrollment(ctx, () => {});
  enrollment.addAccount();
  enrollment.importAccounts();
  enrollment.editAccount(data.accounts[0]!.id);
  for (const name of [
    "Create encrypted backup",
    "Verify or restore a backup",
    "Export plaintext OTP links…",
  ]) {
    const root = views[1]!;
    root
      .querySelectorAll("button")
      .find((node) => node.textContent === name)!
      .click();
  }
  const edit = views.find((view) =>
    view
      .querySelectorAll("button")
      .some((node) => node.textContent === "Show transfer QR…"),
  )!;
  edit
    .querySelectorAll("button")
    .find((node) => node.textContent === "Show transfer QR…")!
    .click();
  const forbidden =
    /\b(?:Argon2id|PBKDF2|KDF|AES|GCM|AAD|envelope|nonce|iterations|WASM)\b/i;
  for (const view of views) expect(primaryText(view)).not.toMatch(forbidden);
  expect(views.length).toBeGreaterThanOrEqual(8);
});
it("technical error details stay separate from the friendly next step", () => {
  const error = new DOMException(
    "nonce and AAD authentication failed",
    "OperationError",
  );
  const result = friendlyError(error);
  expect(result.message).toContain("Caps Lock");
  expect(result.message).toContain("try again");
  expect(result.technical).toContain(error.message);
  const node = el(
    "div",
    {},
    el("p", {}, result.message),
    technicalDetails(el("p", {}, result.technical)),
  ) as unknown as TestElement;
  expect(primaryText(node)).not.toMatch(/nonce|AAD|OperationError/);
  expect(node.textContent).toContain(error.message);
});

it("Backup shows a plain-language version note beside Save an encrypted backup", () => {
  const session = { accounts: () => emptyVault() } as unknown as Session;
  const view = createRecovery(
    context(session),
    async () => {},
  ).backupsView() as unknown as TestElement;
  const section = view
    .querySelectorAll(".settings-section")
    .find(
      (node) =>
        node.querySelector("h2")?.textContent === "1. Save an encrypted backup",
    )!;
  const note = section.querySelector(".hint")!;
  expect(note.textContent).toBe(
    "Backups made with this version need this version or newer to restore.",
  );
  expect(note.hidden).toBe(false);
  expect(primaryText(section)).toContain(note.textContent);
  expect(primaryText(note)).not.toMatch(
    /\b(?:Argon2id|PBKDF2|KDF|AES|GCM|AAD|envelope|nonce|iterations|WASM)\b/i,
  );
});

it("setup and settings omit preview branding and repeated inline help", () => {
  const session = {
    accounts: () => emptyVault(),
    current: () => ({ password: DEFAULT_KDF }),
    timeout: 300_000,
  } as unknown as Session;
  const ctx = context(session);
  ctx.state.exists = false;
  const setup = createWelcome(ctx, () => {}).locked() as unknown as TestElement;
  const settings = createSettings(ctx).settingsView() as unknown as TestElement;
  for (const view of [setup, settings])
    expect(view.textContent).not.toMatch(
      /development preview|unaudited|test accounts only/i,
    );
  expect(setup.querySelectorAll("[data-help]")).toHaveLength(0);
  expect(settings.querySelectorAll("[data-help]")).toHaveLength(0);
  expect(settings.textContent).toContain("there is no password reset");
});
