import { busyCopy } from "../help";
import { savePreference } from "../preferences";
import { withGenerator } from "./passphrase";
import { button, el, input, form, submit, helpBlock } from "../dom";
import { RecoveryRequired } from "../storage";
import { DEFAULT_KDF } from "../crypto";
import type { AppContext } from "./context";
export function createWelcome(ctx: AppContext, recoverySetup: () => void) {
  const { session, state, run, render } = ctx;

  function locked(): HTMLElement {
    const title = state.exists ? "Welcome back." : "Your codes. Your vault.";
    const subtitle = state.exists
      ? "Unlock your encrypted vault to access your codes."
      : "A quiet, private home for your two-factor codes. Protected with a password you control.";
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
          const password = String(data.get("password"));
          if (!state.exists && password !== data.get("confirmation"))
            throw new Error("Passwords do not match.");
          try {
            ctx.announce(state.exists ? busyCopy.unlock : busyCopy.setup);
            if (state.exists)
              await session.unlock(password, DEFAULT_KDF, state.recovery);
            else {
              await session.setup(password);
              state.exists = true;
              state.firstRunTip = true;
              savePreference("firstRunTips", "true");
            }
          } catch (error) {
            if (error instanceof RecoveryRequired) {
              state.recovery = error.offer;
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
    const panel = el(
      "section",
      { class: "welcome" },
      el(
        "div",
        { class: "brand-mark", "aria-hidden": "true" },
        el("img", { src: "icons/128.png", width: "64", height: "64", alt: "" }),
      ),
      el("p", { class: "eyebrow" }, "SECURITY WITHOUT THE CLUTTER"),
      el("h1", {}, title),
      el("p", { class: "muted" }, subtitle),
      signIn,
    );
    if (!state.exists)
      panel.append(
        el(
          "p",
          { class: "hint" },
          "Use a unique passphrase of at least 14 characters. There is no password reset. Save your service recovery codes separately.",
        ),
        button(
          "Restore an encrypted backup",
          () => recoverySetup(),
          "button text",
        ),
      );
    panel.append(
      el(
        "aside",
        { class: "notice" },
        el("strong", {}, "Test accounts only"),
        el(
          "p",
          {},
          "This preview has not had an independent security audit. Keep your existing authenticator and backups.",
        ),
      ),
    );
    return panel;
  }

  return { locked };
}
