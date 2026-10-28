import { withGenerator } from "./passphrase";
import { button, el, input, select, form, submit } from "../dom";
import { preferenceEnabled, savePreference } from "../preferences";
import { busyCopy } from "../help";
import { AUTO_LOCK_OPTIONS } from "../lock-policy";
import { openVault } from "../launch";
import { rotatePassword } from "../crypto";
import { dialogOperation, type AppContext } from "./context";
export function createSettings(ctx: AppContext) {
  const { session, isExtension, run, announce, modal, closeDialog, render } =
    ctx;
  function settingsView(): HTMLElement {
    const nextCode = input("showNextCode", "Show next code", "checkbox");
    nextCode.control.checked = preferenceEnabled("showNextCode");
    nextCode.control.addEventListener("change", () =>
      savePreference("showNextCode", String(nextCode.control.checked)),
    );
    const showCodes = input("alwaysShowCodes", "Always show codes", "checkbox");
    showCodes.control.checked = preferenceEnabled("alwaysShowCodes");
    showCodes.control.addEventListener("change", () => {
      savePreference("alwaysShowCodes", String(showCodes.control.checked));
    });
    const timeout = select(
      "timeout",
      "Auto-lock",
      AUTO_LOCK_OPTIONS,
      String(session.timeout),
    );
    timeout.control.addEventListener("change", () => {
      void run(async () => {
        await session.setTimeout(Number(timeout.control.value));
        savePreference("timeout", String(session.timeout));
        savePreference("sessionTimeoutConfirmed", "true");
      });
    });
    return el(
      "section",
      { class: "content stack" },
      el("h1", {}, "Settings"),
      el(
        "div",
        { class: "settings-section stack" },
        el("h2", {}, "Make it yours"),
        showCodes.wrapper,
        nextCode.wrapper,
      ),
      el(
        "div",
        { class: "settings-section stack" },
        el("h2", {}, "Vault security"),
        timeout.wrapper,

        el(
          "p",
          { class: "hint" },
          "Stay unlocked across popup and window closures until this timer expires. The default is 5 minutes of inactivity. Lock ends the session in every view; restarting Chrome asks for your password again.",
        ),
        ctx.isPopup
          ? button("Open in a window", () => run(openVault), "button text")
          : null,
        button(
          "Change master password",
          () => run(async () => changePassword()),
          "button tonal",
        ),
      ),
      el(
        "div",
        { class: "settings-section stack" },
        el("h2", {}, "Keyboard shortcut"),
        el("p", {}, "Ctrl+Shift+Y · Command+Shift+Y on Mac"),

        isExtension
          ? button(
              "Change shortcut",
              () => {
                void chrome.tabs.create({
                  url: "chrome://extensions/shortcuts",
                });
              },
              "button tonal",
            )
          : null,
      ),
      el(
        "aside",
        { class: "notice" },
        el(
          "strong",
          {},
          `Lykvakt · ${isExtension ? chrome.runtime.getManifest().version : "development"}`,
        ),
        el(
          "p",
          {},
          "Your device clock must be correct. Keep an independent backup; there is no password reset.",
        ),
      ),
    );
  }

  function changePassword(): void {
    const current = input("current", "Current master password", "password"),
      next = input("next", "New master password", "password"),
      confirm = input("confirm", "Confirm new master password", "password");
    next.control.autocomplete = confirm.control.autocomplete = "new-password";
    modal(
      "Change master password",
      form(
        async (_fields, f) =>
          run(async () => {
            const epoch = session.epoch(),
              signal = dialogOperation(ctx);
            try {
              if (next.control.value !== confirm.control.value)
                throw new Error("Passwords do not match.");
              announce(busyCopy.setup);
              const rotation = await rotatePassword(
                session.current(),
                current.control.value,
                next.control.value,
                signal,
              );
              session.check();
              signal.throwIfAborted();
              if (epoch !== session.epoch()) return;
              await session.save(
                session.accounts(),
                (h) => ({ ...h, password: rotation.password }),
                rotation.key,
                signal,
              );
              session.check();
              signal.throwIfAborted();
              if (epoch !== session.epoch()) return;
            } finally {
              f.reset();
            }
            closeDialog();
            render();
            announce(
              "Master password changed and vault key rotated. Existing backup files still use their original passphrase.",
            );
          }),
        current.wrapper,

        withGenerator(next),
        confirm.wrapper,
        submit("Change password"),
      ),
    );
  }

  return { settingsView };
}
