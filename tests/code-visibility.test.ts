import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Session } from "../src/session";
import { createAccounts } from "../src/ui/accounts";
import { context } from "./helpers/ui";
import { emptyVault } from "../src/model";
import { parseURI } from "../src/import";
class Node {
  children: (Node | string)[];
  attrs: Record<string, string>;
  textContent = "";
  dataset: Record<string, string>;
  action?: () => unknown;
  classList = { toggle() {} };
  constructor(
    public tag: string,
    attrs: Record<string, string> = {},
    ...children: (Node | string)[]
  ) {
    this.attrs = attrs;
    this.children = children.filter(Boolean);
    this.dataset = { account: attrs["data-account"]! };
    this.textContent = children.filter((x) => typeof x === "string").join("");
  }
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  append(...children: Node[]) {
    this.children.push(...children);
  }
  replaceChildren(...children: Node[]) {
    this.children = children;
  }
  addEventListener() {}
  querySelectorAll(selector: string): Node[] {
    const match = (n: Node) =>
      selector === "[data-account]"
        ? !!n.dataset.account
        : n.attrs.class?.split(" ").includes(selector.slice(1));
    return this.children
      .filter((x) => x instanceof Node)
      .flatMap((n) => [
        ...(match(n) ? [n] : []),
        ...n.querySelectorAll(selector),
      ]);
  }
  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0];
  }
}
vi.mock("../src/dom", () => ({
  el: (...args: ConstructorParameters<typeof Node>) => new Node(...args),
  button: (label: string, action: () => unknown, cls: string) => {
    const n = new Node("button", { type: "button", class: cls }, label);
    n.action = action;
    return n;
  },
  helpBlock: () => new Node("details"),
  input: () => ({
    control: { addEventListener() {} },
    wrapper: new Node("label"),
  }),
}));
vi.mock("../src/ui/enrollment", () => ({ createEnrollment: () => ({}) }));
vi.mock("../src/otp", async (original) => ({
  ...(await original<typeof import("../src/otp")>()),
  codeFor: async () => "123456",
}));
let preference = "false";
const writeText = vi.fn(async () => {});
beforeEach(() => {
  vi.useFakeTimers();
  preference = "false";
  writeText.mockClear();
  vi.stubGlobal("localStorage", { getItem: () => preference });
  vi.stubGlobal("navigator", { clipboard: { writeText } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function setup() {
  const data = emptyVault();
  data.accounts.push(
    parseURI("otpauth://totp/Test:user?secret=JBSWY3DPEHPK3PXP"),
  );
  const session = {
    unlocked: true,
    accounts: () => data,
    check() {},
    epoch: () => 0,
  } as unknown as Session;
  const accounts = createAccounts(context(session));
  const view = accounts.codesView() as unknown as Node;
  await accounts.tick();
  return { accounts, view, code: view.querySelector(".otp")!, session };
}
it("masks by default with an accessible keyboard-operable control and copies without revealing", async () => {
  const { view, code } = await setup();
  expect(code.textContent).toBe("••• •••");
  expect(code.tag).toBe("button");
  expect(code.attrs.type).toBe("button");
  expect(code.attrs["aria-label"]).toBe("Reveal code for Test user (hidden)");
  const copy = view
    .querySelectorAll(".button")
    .find((n) => n.textContent === "Copy")!;
  await copy.action!();
  expect(writeText).toHaveBeenCalledWith("123456");
  expect(code.textContent).toBe("••• •••");
});
it("reveals on demand then re-masks at 30 seconds", async () => {
  const { code, accounts } = await setup();
  await code.action!();
  expect(code.textContent).toBe("123 456");
  await vi.advanceTimersByTimeAsync(29_999);
  expect(code.textContent).toBe("123 456");
  await vi.advanceTimersByTimeAsync(1);
  expect(code.textContent).toBe("••• •••");
  await accounts.tick();
  expect(code.textContent).toBe("••• •••");
});
it("clears reveal state and timers when leaving or locking the view", async () => {
  const { code, accounts } = await setup();
  await code.action!();
  accounts.clear();
  expect(vi.getTimerCount()).toBe(0);
  const view = accounts.codesView() as unknown as Node;
  await accounts.tick();
  expect(view.querySelector(".otp")!.textContent).toBe("••• •••");
});
it("uses the explicit always-show preference without starting reveal timers", async () => {
  preference = "true";
  const { code } = await setup();
  expect(code.textContent).toBe("123 456");
  await code.action!();
  expect(vi.getTimerCount()).toBe(0);
});
