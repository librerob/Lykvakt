import { el, input } from "../dom";
import { prepareTransfer } from "../import";
import type { Account } from "../model";
export function transferReview(accounts: Account[]) {
  const plan = prepareTransfer(accounts);
  const consent = plan.renamed.length
    ? input("transferNames", "Use these transfer names", "checkbox")
    : undefined;
  if (consent) consent.control.required = true;
  return {
    accounts: plan.accounts,
    content: consent
      ? el(
          "div",
          { class: "stack" },
          el(
            "p",
            {},
            "Some names need changes for other authenticators. Review this transfer copy. Your saved names will stay unchanged.",
          ),
          el(
            "details",
            {},
            el("summary", {}, "Review transfer names"),
            el(
              "ul",
              { class: "transfer-names" },
              ...plan.renamed.map((change) =>
                el("li", {}, `${change.from} → ${change.to}`),
              ),
            ),
          ),
          consent.wrapper,
        )
      : undefined,
    check() {
      if (consent && !consent.control.checked)
        throw new Error(
          "Review and agree to the transfer names before exporting.",
        );
    },
  };
}
