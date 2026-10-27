import { button, el } from "../dom";
import { openVault } from "../launch";
import type { AppContext } from "./context";
export function fileChoice(
  ctx: AppContext,
  ...controls: HTMLElement[]
): HTMLElement {
  if (!ctx.isPopup) return el("div", { class: "stack" }, ...controls);
  return el(
    "div",
    { class: "stack file-handoff" },
    button(
      "Open in a window to choose a file",
      () => ctx.run(openVault),
      "button tonal",
    ),
    el(
      "p",
      { class: "hint" },
      "Chrome can close this small popup while you pick a file. The window will ask for your password.",
    ),
  );
}
