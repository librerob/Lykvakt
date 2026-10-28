import { validateDraft, type EnrollmentDraft } from "../session-cache";
import type { AppContext } from "./context";
export function enrollmentDraft(
  ctx: AppContext,
  node: HTMLFormElement,
  mode: EnrollmentDraft["mode"],
): HTMLFormElement {
  if (!ctx.isExtension) return node;
  let saved = ctx.session.draft();
  if (saved?.mode === mode) {
    try {
      saved = validateDraft(saved);
    } catch {
      saved = undefined;
      ctx.session.rememberDraft();
    }
  }
  if (saved?.mode === mode) {
    for (const control of node.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea"))
      if (Object.hasOwn(saved.fields, control.name)) {
        control.value = saved.fields[control.name]!;
        control.dispatchEvent(new Event("change"));
      }
  }
  const remember = () => {
    if (node.isConnected === false) return;
    if (
      mode === "import" &&
      [...node.querySelectorAll<HTMLInputElement>('input[type="file"]')].some(
        (control) => control.files?.length,
      )
    ) {
      ctx.session.rememberDraft();
      return;
    }
    const fields: Record<string, string> = {};
    for (const control of node.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea")) {
      if (
        !control.name ||
        ["file", "qr", "sourcePassword"].includes(control.name)
      )
        continue;
      fields[control.name] = control.value;
    }
    let draft: EnrollmentDraft;
    try {
      draft = validateDraft({ mode, fields });
    } catch {
      ctx.session.rememberDraft();
      return;
    }
    ctx.session.rememberDraft(draft);
  };
  void Promise.resolve().then(() => {
    if (node.isConnected) remember();
  });
  node.addEventListener("input", remember);
  node.addEventListener("change", remember);
  return node;
}
