import { button, el, input, form, submit } from "../dom";
import { load } from "../storage";
import type { PasskeySlot } from "../crypto";
import { unlockPasskey } from "../passkeys";
import type { AppContext } from "./context";
export function createWelcome(ctx: AppContext, recoverySetup: () => void) {
  const { session, state, fullWindow, run, render, modal, closeDialog } = ctx;

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
            if (state.exists) await session.unlock(password);
            else {
              await session.setup(password);
              state.exists = true;
            }
          } finally {
            f.reset();
          }
          if (session.unlocked) {
            state.view = "codes";
            render();
          }
        }),
      password.wrapper,
      state.exists ? null : confirmation.wrapper,
      submit(state.exists ? "Unlock vault" : "Create encrypted vault"),
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
    if (state.exists && fullWindow)
      panel.append(
        button(
          "Try passkey unlock",
          () =>
            run(async () => {
              const epoch = session.epoch(),
                saved = await load();
              if (!saved?.passkeys.length)
                throw new Error(
                  "No passkey enrolled for this extension. Unlock with your master password.",
                );
              const unlock = async (slot: PasskeySlot) => {
                const result = await unlockPasskey(saved, slot);
                await session.unlockWith(result.key, saved, result.data, epoch);
                closeDialog();
                state.view = "codes";
                render();
              };
              if (saved.passkeys.length === 1) await unlock(saved.passkeys[0]!);
              else
                modal(
                  "Choose a passkey",
                  el(
                    "div",
                    { class: "stack" },
                    ...saved.passkeys.map((slot, index) =>
                      button(
                        `Use passkey ${index + 1}`,
                        () => run(() => unlock(slot)),
                        "button tonal",
                      ),
                    ),
                  ),
                );
            }),
          "button tonal",
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
