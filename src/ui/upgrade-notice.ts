import { button, el, technicalDetails } from "../dom";
import { upgradePendingMessage } from "../help";
import type { AppContext } from "./context";

export function upgradeNotice(ctx: AppContext): HTMLElement | null {
  if (!ctx.session.upgradePending || ctx.state.upgradeNoticeDismissed)
    return null;
  const notice = el(
    "aside",
    { class: "notice stack", "aria-label": "Security upgrade reminder" },
    el("p", {}, upgradePendingMessage),
    technicalDetails(
      el(
        "p",
        {},
        ctx.session.upgradePendingDetail ??
          "The prepared password-slot upgrade could not be committed. The original envelope was retained.",
      ),
    ),
    button(
      "Dismiss upgrade notice",
      () => {
        ctx.state.upgradeNoticeDismissed = true;
        notice.remove();
      },
      "button text",
    ),
  );
  return notice;
}
