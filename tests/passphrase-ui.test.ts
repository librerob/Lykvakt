import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { input } from "../src/dom";
import { withGenerator } from "../src/ui/passphrase";
import { TestElement, testDocument } from "./helpers/dom";
const generate = vi.hoisted(() =>
  vi.fn(() => "amber-birch-candle-delta-elm-frost-grove"),
);
vi.mock("../src/passphrase", () => ({ generatePassphrase: generate }));
beforeEach(() => {
  generate.mockClear();
  vi.stubGlobal("document", testDocument);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
it("an explicit Generate click loads the generator and shows its suggestion", async () => {
  const field = input("password", "New password", "password");
  const view = withGenerator(field) as unknown as TestElement;
  view.querySelector("button")!.click();
  await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
  expect(field.control.value).toBe(generate.mock.results[0]!.value);
  expect(view.querySelector(".generated-passphrase")!.textContent).toBe(
    field.control.value,
  );
  (field.control as unknown as TestElement).dispatchEvent(new Event("blur"));
  expect(view.querySelector(".generated-passphrase")).toBeNull();
});
it("leaving Generate before its import resolves cannot expose a late suggestion", async () => {
  await import("../src/passphrase");
  const field = input("password", "New password", "password");
  const view = withGenerator(field) as unknown as TestElement,
    control = view.querySelector("button")!;
  control.click();
  control.dispatchEvent(new Event("blur"));
  await new Promise((resolve) => setImmediate(resolve));
  expect(generate).not.toHaveBeenCalled();
  expect(field.control.value).toBe("");
  expect(view.querySelector(".generated-passphrase")).toBeNull();
});
