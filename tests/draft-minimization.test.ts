import { expect, it, vi } from "vitest";
import { validateDraft, type EnrollmentDraft } from "../src/session-cache";
import { enrollmentDraft } from "../src/ui/enrollment-draft";
import type { AppContext } from "../src/ui/context";
const exportText = JSON.stringify({
  encrypted: false,
  items: [
    {
      type: 1,
      login: {
        totp: "JBSWY3DPEHPK3PXP",
        password: "SYNTHETIC_UNRELATED_PASSWORD",
      },
      notes: "SYNTHETIC_PRIVATE_NOTE",
    },
  ],
});
function form(value: string, saved?: EnrollmentDraft) {
  const area = { name: "payload", value, dispatchEvent: vi.fn() };
  const node = Object.assign(new EventTarget(), {
    isConnected: true,
    querySelectorAll: (selector: string) =>
      selector === 'input[type="file"]' ? [] : [area],
  });
  const remember = vi.fn(),
    ctx = {
      isExtension: true,
      session: { draft: () => saved, rememberDraft: remember },
    } as unknown as AppContext;
  enrollmentDraft(ctx, node as unknown as HTMLFormElement, "import");
  return { area, node, remember };
}
it.each([
  exportText,
  '[{"secret":"JBSWY3DPEHPK3PXP","password":"SYNTHETIC_UNRELATED_PASSWORD"}]',
])("refuses a pasted export archive as a shared draft", (payload) => {
  expect(() =>
    validateDraft({ mode: "import", fields: { payload } }),
  ).toThrow();
});
it("does not cache a JSON textarea or change its current value", async () => {
  const f = form(exportText);
  f.node.dispatchEvent(new Event("input"));
  await Promise.resolve();
  expect(f.area.value).toBe(exportText);
  expect(f.remember).toHaveBeenCalledWith();
  expect(JSON.stringify(f.remember.mock.calls)).not.toContain(
    "SYNTHETIC_UNRELATED_PASSWORD",
  );
  expect(JSON.stringify(f.remember.mock.calls)).not.toContain(
    "SYNTHETIC_PRIVATE_NOTE",
  );
});
it("does not restore a previous build's whole-export draft", async () => {
  const f = form("", { mode: "import", fields: { payload: exportText } });
  await Promise.resolve();
  expect(f.area.value).toBe("");
  expect(JSON.stringify(f.remember.mock.calls)).not.toContain(
    "SYNTHETIC_UNRELATED_PASSWORD",
  );
});
it.each([
  "otpauth://totp/unfinished",
  "otpauth-migration://offline?data=unfinished",
  " \notpauth://totp/one\n\notpauth://totp/two\n",
])("preserves an unfinished OTP-link draft %s", async (payload) => {
  const f = form(payload);
  f.node.dispatchEvent(new Event("input"));
  await Promise.resolve();
  expect(f.remember).toHaveBeenLastCalledWith({
    mode: "import",
    fields: { payload },
  });
});
it("clears a mixed link/archive draft instead of silently retaining its unrelated fields", async () => {
  const f = form("otpauth://totp/one\n" + exportText);
  f.node.dispatchEvent(new Event("input"));
  await Promise.resolve();
  expect(f.remember).toHaveBeenLastCalledWith();
});
