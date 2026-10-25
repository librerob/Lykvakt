import { button, el } from "../dom";
import { generatePassphrase } from "../passphrase";

export function withGenerator(field: {
  wrapper: HTMLElement;
  control: HTMLInputElement;
}): HTMLElement {
  const shown = el("div", { "data-generated-passphrase": "", role: "status" });
  const clear = () => {
    // Keep a centered dialog still between pointer-down (blur) and pointer-up.
    shown.style.minHeight = `${shown.getBoundingClientRect().height}px`;
    shown.replaceChildren();
  };
  field.control.addEventListener("input", clear);
  field.control.addEventListener("blur", clear);
  return el(
    "div",
    {},
    el(
      "div",
      { class: "password-generator" },
      field.wrapper,
      button(
        "Generate",
        () => {
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
        },
        "button tonal",
      ),
    ),
    shown,
  );
}
