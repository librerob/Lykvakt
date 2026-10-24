import type { AppContext } from "../../src/ui/context";
import type { Session } from "../../src/session";
type Action = () => void | Promise<void>;
type Submit = (data: FormData, form: HTMLFormElement) => Promise<void>;
export const ui = {
  dialog: undefined as Node | undefined,
  buttons: new Map<string, Action>(),
  fields: new Map<string, { value: string }>(),
  submit: undefined as Submit | undefined,
  messages: [] as string[],
  downloads: [] as { contents: string; filename: string }[],
};
export function el(_tag: string, _attributes = {}, ...children: unknown[]) {
  return {
    children,
    isConnected: false,
    append(...nodes: unknown[]) {
      children.push(...nodes);
    },
    addEventListener() {},
  } as unknown as HTMLElement;
}
export function button(label: string, action: Action) {
  ui.buttons.set(label, action);
  return el("button");
}
export function input(
  name: string,
  _label: string,
  _type = "text",
  value = "",
) {
  const control = { value, addEventListener() {} };
  ui.fields.set(name, control);
  return {
    control: control as unknown as HTMLInputElement,
    wrapper: el("label"),
  };
}
export function select(
  name: string,
  label: string,
  _options: object,
  value: string,
) {
  return input(name, label, "select", value);
}
export function form(action: Submit, ...children: unknown[]) {
  ui.submit = action;
  return el("form", {}, ...children);
}
export function submit(label: string) {
  return el("button", {}, label);
}
export function download(contents: string, filename: string) {
  ui.downloads.push({ contents, filename });
}
export function resetUI() {
  ui.dialog = undefined;
  ui.buttons.clear();
  ui.fields.clear();
  ui.submit = undefined;
  ui.messages.length = ui.downloads.length = 0;
}
export function context(session: Session): AppContext {
  return {
    session,
    state: { exists: true, view: "settings" },
    isExtension: false,
    fullWindow: true,
    run: async (action) => {
      await action();
    },
    announce: (message) => {
      ui.messages.push(message);
    },
    modal(_title, content) {
      ui.dialog = content;
    },
    closeDialog() {},
    render() {},
    confirmAction(_title, _message, label, action) {
      button(label, action);
    },
  };
}
export async function click(label: string) {
  const action = ui.buttons.get(label);
  if (!action) throw new Error("Missing test UI action: " + label);
  await action();
}
export function set(name: string, value: string) {
  const field = ui.fields.get(name);
  if (!field) throw new Error("Missing test input: " + name);
  field.value = value;
}
export async function send() {
  if (!ui.submit) throw new Error("Missing test form.");
  await ui.submit(new FormData(), {
    reset() {
      for (const f of ui.fields.values()) f.value = "";
    },
  } as HTMLFormElement);
}
