import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAccounts } from "../src/ui/accounts";
import { createSettings } from "../src/ui/settings";
import { emptyVault } from "../src/model";
import { encodeBase32 } from "../src/otp";
import { parseURI } from "../src/import";
import { DEFAULT_KDF } from "../src/kdf-policy";
import type { Session } from "../src/session";
import { TestElement, testDocument } from "./helpers/dom";
import { context } from "./helpers/ui";
const prefs = new Map<string, string>();
const writeText = vi.fn(async () => {});
const instances: ReturnType<typeof createAccounts>[] = [];
beforeEach(() => {
  prefs.clear();
  writeText.mockClear();
  vi.stubGlobal("document", testDocument);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => prefs.get(k) ?? null,
    setItem: (k: string, v: string) => prefs.set(k, v),
  });
  vi.spyOn(Date, "now").mockReturnValue(0);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  for (const instance of instances) instance.clear();
  instances.length = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function reference(
  secret: string,
  algorithm: string,
  digits: number,
  counter: number,
): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(algorithm.replace("-", "").toLowerCase(), secret)
    .update(message)
    .digest();
  return ((mac.readUInt32BE(mac.at(-1)! & 15) & 0x7fffffff) % 10 ** digits)
    .toString()
    .padStart(digits, "0");
}
const format = (value: string) =>
  value.slice(0, value.length / 2) + " " + value.slice(value.length / 2);
function fixture(
  algorithm = "SHA-256",
  period = 45,
  digits = 8,
  type = "totp",
  secret = "12345678901234567890123456789012",
) {
  const data = emptyVault();
  const account = parseURI(
    "otpauth://" +
      type +
      "/Target:user?secret=" +
      encodeBase32(new TextEncoder().encode(secret)) +
      "&algorithm=" +
      algorithm.replace("-", "") +
      "&digits=" +
      digits +
      (type === "hotp" ? "&counter=0" : "&period=" + period),
  );
  data.accounts.push(account);
  const session = {
    unlocked: true,
    accounts: () => structuredClone(data),
    check() {},
    epoch: () => 0,
    current: () => ({ password: DEFAULT_KDF }),
    timeout: 300_000,
  } as unknown as Session;
  const ctx = context(session),
    accounts = createAccounts(ctx);
  instances.push(accounts);
  const view = accounts.codesView() as unknown as TestElement;
  return { account, accounts, view, session, ctx };
}
it.each([
  ["SHA-256", 45, "12345678901234567890123456789012"],
  [
    "SHA-512",
    60,
    "1234567890123456789012345678901234567890123456789012345678901234",
  ],
])(
  "next-code preview matches independent %s HMAC at custom period %s boundaries",
  async (algorithm, period, secret) => {
    prefs.set("showNextCode", "true");
    const { accounts, view } = fixture(algorithm, period, 8, "totp", secret);
    const code = view.querySelector(".otp")!,
      next = view.querySelector(".next-code")!;
    expect(next.hidden).toBe(true);
    expect(next.querySelector(".next-code-value")!.textContent).toBe("");
    code.click();
    for (const now of [
      0,
      period * 1000 - 1,
      period * 1000,
      period * 1000 + 1,
    ]) {
      vi.mocked(Date.now).mockReturnValue(now);
      await accounts.tick();
      const current = Math.floor(now / 1000 / period);
      expect(code.textContent).toBe(
        format(reference(secret, algorithm, 8, current)),
      );
      expect(next.hidden).toBe(false);
      expect(next.getAttribute("aria-label")).toBe(
        "Next code, valid after the current one expires",
      );
      expect(next.querySelector(".next-code-value")!.textContent).toBe(
        format(reference(secret, algorithm, 8, current + 1)),
      );
    }
  },
);
it("preview is off by default and remains absent while current codes are masked", async () => {
  const { accounts, view } = fixture();
  const code = view.querySelector(".otp")!,
    next = view.querySelector(".next-code")!;
  await accounts.tick();
  expect(next.hidden).toBe(true);
  prefs.set("showNextCode", "true");
  await accounts.tick();
  expect(code.textContent).toBe("••• •••");
  expect(next.hidden).toBe(true);
  expect(next.querySelector(".next-code-value")!.textContent).toBe("");
  code.click();
  await accounts.tick();
  expect(next.hidden).toBe(false);
  code.click();
  await accounts.tick();
  expect(next.hidden).toBe(true);
  expect(next.querySelector(".next-code-value")!.textContent).toBe("");
});
it("reveal expiry, navigation and lock clear next codes immediately", async () => {
  prefs.set("showNextCode", "true");
  const { accounts, view } = fixture();
  const code = view.querySelector(".otp")!,
    next = view.querySelector(".next-code")!;
  code.click();
  await accounts.tick();
  expect(next.hidden).toBe(false);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(code.textContent).toBe("••• •••");
  expect(next.hidden).toBe(true);
  expect(next.querySelector(".next-code-value")!.textContent).toBe("");
  code.click();
  await accounts.tick();
  expect(next.hidden).toBe(false);
  accounts.clear();
  expect(next.hidden).toBe(true);
  expect(next.querySelector(".next-code-value")!.textContent).toBe("");
});
it("copy still copies only the current code without revealing either code", async () => {
  prefs.set("showNextCode", "true");
  const { accounts, view } = fixture();
  await accounts.tick();
  view
    .querySelectorAll("button")
    .find((n) => n.textContent === "Copy")!
    .click();
  // Let the real Web Crypto HMAC finish without advancing the reveal clock.
  await vi.waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(
      reference("12345678901234567890123456789012", "SHA-256", 8, 0),
    ),
  );
  expect(view.querySelector(".otp")!.textContent).toBe("••• •••");
  expect(view.querySelector(".next-code")!.hidden).toBe(true);
});
it("HOTP rows have no next-code node or automatic counter advancement", async () => {
  prefs.set("showNextCode", "true");
  prefs.set("alwaysShowCodes", "true");
  const { accounts, view, session } = fixture("SHA-256", 45, 8, "hotp");
  await accounts.tick();
  expect(view.querySelector(".next-code")).toBeNull();
  expect(session.accounts().accounts[0]!.counter).toBe("0");
});
it("the preview preference persists through settings re-render and handles unavailable localStorage", () => {
  const { session } = fixture();
  let view = createSettings(
    context(session),
  ).settingsView() as unknown as TestElement;
  let control = view.querySelector('input[name="showNextCode"]')!;
  expect(control.checked).toBe(false);
  control.checked = true;
  control.dispatchEvent(new Event("change"));
  expect(prefs.get("showNextCode")).toBe("true");
  view = createSettings(
    context(session),
  ).settingsView() as unknown as TestElement;
  control = view.querySelector('input[name="showNextCode"]')!;
  expect(control.checked).toBe(true);
  vi.stubGlobal("localStorage", {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  });
  view = createSettings(
    context(session),
  ).settingsView() as unknown as TestElement;
  control = view.querySelector('input[name="showNextCode"]')!;
  expect(control.checked).toBe(false);
  control.checked = true;
  expect(() => control.dispatchEvent(new Event("change"))).not.toThrow();
});
