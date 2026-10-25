export type Child = Node | string | null | undefined | false;
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, value);
  for (const child of children)
    if (child !== null && child !== undefined && child !== false)
      node.append(child);
  return node;
}
export function button(
  label: string,
  action: () => void | Promise<void>,
  className = "button",
): HTMLButtonElement {
  const node = el("button", { type: "button", class: className }, label);
  node.addEventListener("click", () => {
    void action();
  });
  return node;
}
export function input(
  name: string,
  label: string,
  type = "text",
  value = "",
): { wrapper: HTMLLabelElement; control: HTMLInputElement } {
  const control = el("input", {
    name,
    type,
    autocomplete: type === "password" ? "current-password" : "off",
    spellcheck: "false",
  });
  control.value = value;
  return {
    wrapper: el("label", { class: "field" }, el("span", {}, label), control),
    control,
  };
}
export function select(
  name: string,
  label: string,
  options: Record<string, string>,
  selected: string,
): { wrapper: HTMLLabelElement; control: HTMLSelectElement } {
  const control = el("select", { name, "aria-labelledby": `label-${name}` });
  for (const [value, title] of Object.entries(options))
    control.append(el("option", { value }, title));
  control.value = selected;
  return {
    wrapper: el(
      "label",
      { class: "field" },
      el("span", { id: `label-${name}` }, label),
      control,
    ),
    control,
  };
}
export function form(
  action: (data: FormData, form: HTMLFormElement) => Promise<void>,
  ...children: Child[]
): HTMLFormElement {
  const node = el("form", {}, ...children);
  node.addEventListener("reset", () => {
    for (const shown of node.querySelectorAll("[data-generated-passphrase]"))
      shown.replaceChildren();
  });
  node.addEventListener("submit", (event) => {
    event.preventDefault();
    const submits = [
      ...node.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
    ];
    submits.forEach((b) => (b.disabled = true));
    void action(new FormData(node), node).finally(() =>
      submits.forEach((b) => (b.disabled = false)),
    );
  });
  return node;
}
export const submit = (label: string): HTMLButtonElement =>
  el("button", { type: "submit", class: "button primary" }, label);
export function download(contents: string, name: string): void {
  const url = URL.createObjectURL(
    new Blob([contents], { type: "application/json" }),
  );
  const anchor = el("a", { href: url, download: name });
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export async function readText(file: File): Promise<string> {
  if (file.size > 8_000_000) throw new Error("File exceeds the 8 MB limit.");
  return file.text();
}
