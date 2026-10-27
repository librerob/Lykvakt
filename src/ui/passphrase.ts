import { button, el } from "../dom";
export function withGenerator(field: {
  wrapper: HTMLElement;
  control: HTMLInputElement;
}): HTMLElement {
  const shown = el("div", { "data-generated-passphrase": "", role: "status" });
  let request = 0;
  const clear = () => {
    request++;
    shown.style.minHeight = `${shown.getBoundingClientRect().height}px`;
    shown.replaceChildren();
  };
  field.control.addEventListener("input", clear);
  field.control.addEventListener("blur", clear);
  const generate = button(
    "Generate",
    async () => {
      const ticket = ++request;
      try {
        const { generatePassphrase } = await import("../passphrase");
        if (ticket !== request || field.control.isConnected === false) return;
        const phrase = generatePassphrase();
        field.control.value = phrase;
        field.control.focus();
        shown.replaceChildren(
          el(
            "p",
            { class: "notice" },
            el(
              "strong",
              {},
              "Write this down before continuing. This passphrase is shown once.",
            ),
            el("code", { class: "generated-passphrase" }, phrase),
          ),
        );
      } catch {
        if (ticket === request)
          shown.replaceChildren(
            el(
              "p",
              {},
              "The suggested password could not load. Enter your own long password.",
            ),
          );
      }
    },
    "button tonal",
  );
  generate.addEventListener("blur", () => {
    request++;
  });
  return el(
    "div",
    {},
    el("div", { class: "password-generator" }, field.wrapper, generate),
    el(
      "p",
      { class: "hint" },
      "Choose your password length. We recommend a long, unique passphrase (14+ characters).",
    ),
    shown,
  );
}
