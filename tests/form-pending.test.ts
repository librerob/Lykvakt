import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { form, input, button, submit, el } from "../src/dom";
import { TestElement, testDocument } from "./helpers/dom";
const NativeFormData = globalThis.FormData;
beforeEach(() => {
  vi.stubGlobal("document", testDocument);
  const query = TestElement.prototype.querySelectorAll;
  vi.spyOn(TestElement.prototype, "querySelectorAll").mockImplementation(
    function (this: TestElement, selector: string) {
      return selector.includes(",")
        ? selector.split(",").flatMap((s) => query.call(this, s.trim()))
        : query.call(this, selector);
    },
  );
  vi.stubGlobal(
    "FormData",
    class extends NativeFormData {
      constructor(node?: HTMLFormElement) {
        super();
        if (node)
          for (const control of node.querySelectorAll<HTMLInputElement>(
            "input",
          )) {
            const name = control.getAttribute("name");
            if (name && !control.disabled) this.append(name, control.value);
          }
      }
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function gate() {
  let finish!: () => void;
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}
it.each([false, true])(
  "freezes password fields and Generate, captures their values first, then restores controls on failure=%s",
  async (fail) => {
    const hold = gate(),
      password = input(
        "password",
        "Password",
        "password",
        "synthetic submitted password",
      ),
      confirmation = input(
        "confirmation",
        "Confirm",
        "password",
        "synthetic submitted password",
      ),
      generate = button("Generate", () => {}),
      save = submit("Save"),
      disabled = input("disabled", "Unavailable", "text", "ignored");
    disabled.control.disabled = true;
    let captured: FormData | undefined;
    const action = vi.fn(async (data: FormData) => {
      captured = data;
      await hold.promise;
      if (fail) throw new Error("synthetic failure");
    });
    const view = form(
      async (data, node) => {
        try {
          await action(data);
        } catch {
          node.reset();
        }
      },
      password.wrapper,
      confirmation.wrapper,
      disabled.wrapper,
      generate,
      save,
    );
    const close = button("Close", () => {});
    el("section", {}, close, view);
    view.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(captured!.get("password")).toBe("synthetic submitted password");
    expect(captured!.get("confirmation")).toBe("synthetic submitted password");
    expect(captured!.has("disabled")).toBe(false);
    expect(password.control.disabled).toBe(true);
    expect(confirmation.control.disabled).toBe(true);
    expect(generate.disabled).toBe(true);
    expect(save.disabled).toBe(true);
    expect(close.disabled).toBe(false);
    view.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(action).toHaveBeenCalledOnce();
    hold.finish();
    await vi.waitFor(() =>
      expect(view.getAttribute("aria-busy")).toBe("false"),
    );
    expect(password.control.disabled).toBe(false);
    expect(confirmation.control.disabled).toBe(false);
    expect(generate.disabled).toBe(false);
    expect(save.disabled).toBe(false);
    expect(disabled.control.disabled).toBe(true);
  },
);
it("Close stays operable and can cancel a pending password operation", async () => {
  const controller = new AbortController(),
    password = input("password", "Password", "password", "synthetic password");
  const work = gate();
  const view = form(
    async () => {
      await work.promise;
    },
    password.wrapper,
    button("Generate", () => {}),
    submit("Save"),
  );
  const close = button("Close", () => {
    controller.abort();
    work.finish();
  });
  el("section", {}, close, view);
  view.dispatchEvent(new Event("submit", { cancelable: true }));
  expect(close.disabled).toBe(false);
  close.click();
  expect(controller.signal.aborted).toBe(true);
  await vi.waitFor(() => expect(password.control.disabled).toBe(false));
});
