import { DialogLifetime } from "../../src/dialog";
import { helpCopy, type HelpTopic } from "../../src/help";
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
    attributes: _attributes,
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
  const lifetime = new DialogLifetime();
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
      lifetime.open();
      ui.dialog = content;
    },
    closeDialog() {
      lifetime.close();
      ui.dialog = undefined;
    },
    dialogSignal: () => lifetime.signal(),
    render() {},
    confirmAction(_title, _message, label, action) {
      lifetime.open();
      button(label, () => action(lifetime.signal()));
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
  const data = new FormData();
  for (const [name, field] of ui.fields) data.set(name, field.value);
  await ui.submit(data, {
    reset() {
      for (const f of ui.fields.values()) f.value = "";
    },
  } as HTMLFormElement);
}

// Structural counterparts of the native details helpers for the existing UI harness.
export function technicalDetails(...children: unknown[]) {
  return el(
    "details",
    { "data-technical": "", class: "technical-details" },
    el("summary", {}, "Technical details"),
    ...children,
  );
}
export function helpBlock(topic: HelpTopic, title = "What does this mean?") {
  const copy: { text: string[]; technical?: string[] } = helpCopy[topic];
  return el(
    "details",
    { "data-help": topic },
    el("summary", {}, title),
    ...copy.text.map((text) => el("p", {}, text)),
    copy.technical
      ? technicalDetails(...copy.technical.map((text) => el("p", {}, text)))
      : null,
  );
}
