import { expect, it, vi } from "vitest";
import { enrollmentDraft } from "../src/ui/enrollment-draft";
import type { AppContext } from "../src/ui/context";
function fixture(saved?: unknown) {
  const fields = [
    { name: "issuer", value: "Example", dispatchEvent: vi.fn() },
    { name: "label", value: "account", dispatchEvent: vi.fn() },
    { name: "secret", value: "JBSWY3DPEHPK3PXP", dispatchEvent: vi.fn() },
    { name: "sourcePassword", value: "never remember", dispatchEvent: vi.fn() },
    { name: "file", value: "private-file.json", dispatchEvent: vi.fn() },
  ];
  const node = Object.assign(new EventTarget(), {
    querySelectorAll: () => fields,
  });
  const remember = vi.fn();
  const ctx = {
    isExtension: true,
    session: { draft: () => saved, rememberDraft: remember },
  } as unknown as AppContext;
  enrollmentDraft(ctx, node as unknown as HTMLFormElement, "add");
  return { fields, node, remember };
}
it("remembers manual setup fields but never file passwords or selections", () => {
  const f = fixture();
  f.node.dispatchEvent(new Event("input"));
  expect(f.remember).toHaveBeenCalledWith({
    mode: "add",
    fields: { issuer: "Example", label: "account", secret: "JBSWY3DPEHPK3PXP" },
  });
});
it("restores an unfinished manual-entry draft only into the matching form", () => {
  const f = fixture({
    mode: "add",
    fields: { issuer: "Remembered", secret: "ABC" },
  });
  expect(f.fields[0]!.value).toBe("Remembered");
  expect(f.fields[2]!.value).toBe("ABC");
  const other = fixture({
    mode: "import",
    fields: { issuer: "Must not cross forms" },
  });
  expect(other.fields[0]!.value).toBe("Example");
});
it("oversized pasted fields are not retained as stale smaller drafts", () => {
  const f = fixture();
  f.fields[2]!.value = "x".repeat(4097);
  f.node.dispatchEvent(new Event("input"));
  expect(f.remember).toHaveBeenCalledWith();
});
it("ordinary local development does not cache enrollment fields", () => {
  const node = new EventTarget(),
    remember = vi.fn();
  enrollmentDraft(
    {
      isExtension: false,
      session: { rememberDraft: remember },
    } as unknown as AppContext,
    node as HTMLFormElement,
    "add",
  );
  node.dispatchEvent(new Event("input"));
  expect(remember).not.toHaveBeenCalled();
});

it("does not cache file-derived import text even if the user edits the textarea", () => {
  const remember = vi.fn();
  const file = { name: "file", value: "private.json", files: [{}] };
  const area = { name: "payload", value: "private file contents" };
  const node = Object.assign(new EventTarget(), {
    querySelectorAll: (selector: string) =>
      selector === 'input[type="file"]' ? [file] : [file, area],
  });
  const ctx = {
    isExtension: true,
    session: { draft: () => undefined, rememberDraft: remember },
  } as unknown as AppContext;
  enrollmentDraft(ctx, node as unknown as HTMLFormElement, "import");
  node.dispatchEvent(new Event("input"));
  expect(remember).toHaveBeenCalledWith();
  expect(JSON.stringify(remember.mock.calls)).not.toContain(
    "private file contents",
  );
});
