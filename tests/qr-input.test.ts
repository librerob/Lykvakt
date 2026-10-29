import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { qrImageInput } from "../src/ui/qr-input";
import { createEnrollment } from "../src/ui/enrollment";
import { emptyVault } from "../src/model";
import type { Session } from "../src/session";
import { TestElement, testDocument } from "./helpers/dom";
import { context, ui, resetUI } from "./helpers/ui";
const { decode } = vi.hoisted(() => ({ decode: vi.fn() }));
vi.mock("../src/qr", () => ({ readQRs: decode }));
beforeEach(() => {
  vi.stubGlobal("document", testDocument);
  decode.mockReset();
  resetUI();
});
afterEach(() => vi.unstubAllGlobals());
function event(kind: string, files: File[] = []) {
  return Object.assign(new Event(kind, { cancelable: true }), {
    [kind === "paste" ? "clipboardData" : "dataTransfer"]: {
      files,
      getData: () => "https://example.test/secret.png",
    },
  });
}
it.each(["paste", "drop"])(
  "accepts explicitly supplied image files from %s without fetching a URL",
  async (kind) => {
    const node = new TestElement("textarea"),
      read = vi.fn(async () => {}),
      explain = vi.fn();
    qrImageInput(node as unknown as HTMLElement, read, explain);
    const file = new File(["image"], "qr.png", { type: "image/png" });
    const e = event(kind, [file]);
    node.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(read).toHaveBeenCalledWith([file]);
    expect(explain).not.toHaveBeenCalled();
  },
);
it("keeps ordinary text paste working and does not intercept it", () => {
  const node = new TestElement("textarea"),
    read = vi.fn(async () => {});
  qrImageInput(node as unknown as HTMLElement, read, vi.fn());
  const e = event("paste");
  node.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(false);
  expect(read).not.toHaveBeenCalled();
});
it("rejects URL/HTML-only drops without navigating, downloading or inserting HTML", () => {
  const node = new TestElement("textarea"),
    read = vi.fn(async () => {}),
    explain = vi.fn();
  qrImageInput(node as unknown as HTMLElement, read, explain);
  const e = event("drop");
  node.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(true);
  expect(read).not.toHaveBeenCalled();
  expect(explain).toHaveBeenCalledWith(
    expect.stringContaining("Links are not downloaded"),
  );
  expect(node.children).toEqual([]);
});
function setup() {
  let epoch = 0;
  const stop = new AbortController(),
    remembered = vi.fn(),
    save = vi.fn();
  const session = {
    epoch: () => epoch,
    check: () => {
      if (stop.signal.aborted) throw Error("Unlock");
    },
    accounts: () => emptyVault(),
    cancellationSignal: () => stop.signal,
    rememberDraft: remembered,
    save,
  } as unknown as Session;
  const ctx = context(session);
  const errors: unknown[] = [];
  ctx.run = async (action) => {
    try {
      await action();
    } catch (e) {
      errors.push(e);
    }
  };
  createEnrollment(ctx, () => {}).importAccounts();
  ctx.isExtension = true;
  const form = ui.dialog as unknown as TestElement;
  const area = form.querySelector("textarea")!;
  return {
    ctx,
    area,
    errors,
    remembered,
    save,
    lock: () => {
      epoch++;
      stop.abort();
    },
  };
}
it("pasted images go directly to confirmation without saving accounts or an image draft", async () => {
  decode.mockResolvedValue([
    "otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&issuer=Example",
  ]);
  const { area, remembered, save, errors } = setup();
  area.dispatchEvent(
    event("paste", [new File(["image"], "qr.png", { type: "image/png" })]),
  );
  await vi.waitFor(() =>
    expect((ui.dialog as unknown as TestElement).textContent).toContain(
      "1 new account(s)",
    ),
  );
  expect(save).not.toHaveBeenCalled();
  expect(remembered).toHaveBeenCalledWith();
  expect(errors).toEqual([]);
});
it("closing the dialog cancels image processing and never opens a late preview", async () => {
  let complete!: (values: string[]) => void;
  decode.mockImplementation(
    (_file, signal: AbortSignal) =>
      new Promise<string[]>((resolve, reject) => {
        complete = resolve;
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  );
  const { ctx, area, save } = setup();
  area.dispatchEvent(
    event("drop", [new File(["image"], "qr.png", { type: "image/png" })]),
  );
  await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
  ctx.closeDialog();
  complete(["otpauth://totp/Late?secret=JBSWY3DPEHPK3PXP"]);
  await Promise.resolve();
  expect(ui.dialog).toBeUndefined();
  expect(save).not.toHaveBeenCalled();
});
it("locking during an image read prevents a late preview", async () => {
  let complete!: (values: string[]) => void;
  decode.mockImplementation(
    () =>
      new Promise<string[]>((resolve) => {
        complete = resolve;
      }),
  );
  const { area, lock, save, errors } = setup();
  const original = ui.dialog;
  area.dispatchEvent(
    event("paste", [new File(["image"], "qr.png", { type: "image/png" })]),
  );
  await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
  lock();
  complete(["otpauth://totp/Late?secret=JBSWY3DPEHPK3PXP"]);
  await vi.waitFor(() => expect(errors).toHaveLength(1));
  expect(ui.dialog).toBe(original);
  expect(save).not.toHaveBeenCalled();
});
