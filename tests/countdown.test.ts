import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAccounts } from "../src/ui/accounts";
import { parseURI } from "../src/import";
import { emptyVault } from "../src/model";
import type { Session } from "../src/session";
import { context } from "./helpers/ui";
import { TestElement, testDocument } from "./helpers/dom";
const instances: ReturnType<typeof createAccounts>[] = [];
beforeEach(() => {
  vi.stubGlobal("document", testDocument);
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.spyOn(Date, "now").mockReturnValue(0);
});
afterEach(() => {
  instances.forEach((a) => a.clear());
  instances.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function view(type = "totp") {
  const data = emptyVault();
  data.accounts = [
    parseURI(
      `otpauth://${type}/Test:user?secret=JBSWY3DPEHPK3PXP${type === "totp" ? "&period=45" : "&counter=9007199254740993"}`,
    ),
  ];
  const session = {
    unlocked: true,
    check() {},
    epoch: () => 0,
    accounts: () => structuredClone(data),
  } as unknown as Session;
  const accounts = createAccounts(context(session));
  instances.push(accounts);
  return { accounts, root: accounts.codesView() as unknown as TestElement };
}
it("TOTP has a period-scaled ring, updated in steps with an accessible countdown", async () => {
  const { accounts, root } = view();
  await accounts.tick();
  const ring = root.querySelector(".ring-progress")!,
    remaining = root.querySelector(".remaining")!;
  expect(Number(ring.getAttribute("stroke-dashoffset"))).toBe(0);
  expect(remaining.getAttribute("aria-label")).toBe("45 seconds remaining");
  vi.spyOn(Date, "now").mockReturnValue(15_000);
  await accounts.tick();
  expect(Number(ring.getAttribute("stroke-dashoffset"))).toBeCloseTo(100 / 3);
  expect(root.querySelector(".expiring-label")!.textContent).toBe("");
});
it("the last five seconds have a visible label as well as the expiry class", async () => {
  const { accounts, root } = view();
  vi.spyOn(Date, "now").mockReturnValue(40_000);
  await accounts.tick();
  expect(root.querySelector(".account")!.className).toContain("expiring");
  expect(root.querySelector(".expiring-label")!.textContent).toBe("5s left");
  expect(
    root.querySelector(".remaining")!.getAttribute("aria-label"),
  ).toContain("expiring soon");
  vi.spyOn(Date, "now").mockReturnValue(45_000);
  await accounts.tick();
  expect(root.querySelector(".account")!.className).not.toContain("expiring");
  expect(
    Number(
      root.querySelector(".ring-progress")!.getAttribute("stroke-dashoffset"),
    ),
  ).toBe(0);
});
it("HOTP has a precise counter badge and no time ring", async () => {
  const { accounts, root } = view("hotp");
  await accounts.tick();
  expect(root.querySelector("svg")).toBeNull();
  expect(root.querySelector(".remaining")!.textContent).toBe(
    "9007199254740993",
  );
  expect(root.querySelector(".remaining")!.getAttribute("aria-label")).toBe(
    "Counter 9007199254740993",
  );
});
