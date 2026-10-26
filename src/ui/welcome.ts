import { busyCopy } from "../help";
import { OldFormatError, oldFormatMessage } from "../format";
import { savePreference } from "../preferences";
import { withGenerator } from "./passphrase";
import { button, el, input, form, submit, helpBlock } from "../dom";
import { RecoveryRequired, load, isOldVault, eraseOldVault } from "../storage";
import type { AppContext } from "./context";

export function createWelcome(ctx: AppContext, recoverySetup: () => void) {
  const { session, state, run, render } = ctx;
  function oldVault(): HTMLElement {
    return el(
      "section",
      { class: "welcome stack" },
      el("h1", {}, "Earlier preview"),
      el("p", {}, oldFormatMessage),
      helpBlock("oldFormat"),
      button(
        "Erase the old vault and start fresh",
        () => {
          const expected = state.oldVault!;
          ctx.confirmAction(
            "Erase the old vault?",
            "This permanently removes the old local vault and its local recovery copy. Export your accounts using the old app first. No file outside this browser is erased.",
            "Erase old vault",
            async (signal) => {
              await eraseOldVault(expected, signal);
              session.lock();
              state.oldVault = undefined;
              state.recovery = undefined;
              state.exists = false;
              ctx.closeDialog();
              render();
            },
          );
        },
        "button tonal",
      ),
    );
  }
  function locked(): HTMLElement {
    if (state.oldVault) return oldVault();
    const password = input(
      "password",
      state.exists ? "Master password" : "Create a master password",
      "password",
    );
    password.control.required = true;
    password.control.autocomplete = state.exists
      ? "current-password"
      : "new-password";
    password.control.minLength = state.exists ? 1 : 14;
    password.control.maxLength = 1024;
    const confirmation = input(
      "confirmation",
      "Confirm master password",
      "password",
    );
    confirmation.control.autocomplete = "new-password";
    confirmation.control.required = true;
    const signIn = form(
      async (data, f) =>
        run(async () => {
          const value = String(data.get("password"));
          if (!state.exists && value !== data.get("confirmation"))
            throw new Error("Passwords do not match.");
          try {
            ctx.announce(state.exists ? busyCopy.unlock : busyCopy.setup);
            if (state.exists) await session.unlock(value, state.recovery);
            else {
              await session.setup(value);
              state.exists = true;
              state.firstRunTip = true;
              savePreference("firstRunTips", "true");
            }
          } catch (error) {
            if (error instanceof RecoveryRequired) {
              state.recovery = error.offer;
              render();
            }
            if (error instanceof OldFormatError) {
              const stored = await load();
              state.oldVault =
                stored && isOldVault(stored) ? stored : undefined;
              render();
            }
            throw error;
          } finally {
            f.reset();
          }
          if (session.unlocked) {
            state.recovery = undefined;
            state.view = "codes";
            render();
          }
        }),
      state.recovery
        ? el(
            "p",
            { class: "notice" },
            new RecoveryRequired(state.recovery).message,
          )
        : null,
      state.recovery ? helpBlock("olderCopy") : null,
      state.exists ? password.wrapper : withGenerator(password),
      helpBlock("password"),
      state.exists ? null : confirmation.wrapper,
      submit(
        state.recovery
          ? "Unlock older copy"
          : state.exists
            ? "Unlock vault"
            : "Create encrypted vault",
      ),
    );
    return el(
      "section",
      { class: "welcome stack" },
      el(
        "div",
        { class: "brand-mark", "aria-hidden": "true" },
        el("img", { src: "icons/128.png", width: "64", height: "64", alt: "" }),
      ),
      el("p", { class: "eyebrow" }, "SECURITY WITHOUT THE CLUTTER"),
      el("h1", {}, state.exists ? "Welcome back." : "Your codes. Your vault."),
      signIn,
      state.exists
        ? null
        : button("Restore an encrypted backup", recoverySetup, "button text"),
    );
  }
  return { locked };
}
