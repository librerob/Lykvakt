import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createAccounts } from "../src/ui/accounts";
import { parseURI } from "../src/import";
import { codeFor } from "../src/otp";
import { emptyVault } from "../src/model";
import type { Session } from "../src/session";
import { context } from "./helpers/ui";
import { testDocument, TestElement } from "./helpers/dom";
let accounts: ReturnType<typeof createAccounts>;
const writeText = vi.fn(async () => {});
beforeEach(() => {
  vi.stubGlobal("document", testDocument);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (key === "showNextCode" ? "true" : null),
  });
  vi.spyOn(Date, "now").mockReturnValue(26000);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  accounts?.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("Steam keeps masking, copy without reveal, next preview, countdown, remasking and lock clearing", async () => {
  const data = emptyVault();
  const a = parseURI(
    "otpauth://steam/Steam:test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&digits=5&period=30",
  );
  data.accounts.push(a);
  const session = {
    unlocked: true,
    accounts: () => structuredClone(data),
    check() {},
    epoch: () => 0,
  } as unknown as Session;
  const ctx = context(session);
  accounts = createAccounts(ctx);
  const view = accounts.codesView() as unknown as TestElement;
  await accounts.tick();
  const code = view.querySelector(".otp")!,
    next = view.querySelector(".next-code")!;
  expect(code.textContent).toBe("•• •••");
  expect(code.getAttribute("aria-label")).toContain("hidden");
  view.querySelector(".row-copy")!.click();
  await vi.waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(/^[23456789BCDFGHJKMNPQRTVWXY]{5}$/),
    ),
  );
  expect(code.textContent).toBe("•• •••");
  code.click();
  await accounts.tick();
  const current = await codeFor(a, 26000),
    later = await codeFor(a, 56000);
  await vi.waitFor(() =>
    expect(code.textContent).toBe(current.slice(0, 2) + " " + current.slice(2)),
  );
  expect(next.hidden).toBe(false);
  expect(next.querySelector(".next-code-value")!.textContent).toBe(
    later.slice(0, 2) + " " + later.slice(2),
  );
  expect(
    view.querySelector(".remaining")!.getAttribute("aria-label"),
  ).toContain("4 seconds");
  expect(view.querySelector(".ring-number")!.textContent).toBe("4");
  await vi.advanceTimersByTimeAsync(30000);
  expect(code.textContent).toBe("•• •••");
  code.click();
  await accounts.tick();
  accounts.clear();
  expect(code.textContent).toBe("•• •••");
  expect(next.hidden).toBe(true);
});

it("manual Steam entry hides settings that cannot be changed", async () => {
  const { createEnrollment } = await import("../src/ui/enrollment");
  const ctx = context({} as Session);
  let form: TestElement | undefined;
  ctx.modal = (_title, node) => {
    form = node as unknown as TestElement;
  };
  createEnrollment(ctx, () => {}).addAccount();
  const type = form!.querySelector('select[name="type"]')!;
  type.value = "steam";
  type.dispatchEvent(new Event("change"));
  for (const name of ["algorithm", "digits", "period", "counter"]) {
    const field = form!.querySelector(`[name="${name}"]`)!;
    expect(field.parentElement!.hidden).toBe(true);
  }
  expect(form!.textContent).toContain("sign-in codes only");
});
