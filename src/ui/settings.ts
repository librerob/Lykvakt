import { button, el, input, select, form, submit } from "../dom";
import { rotatePassword } from "../crypto";
import type { AppContext } from "./context";
export function createSettings(ctx: AppContext) {
  const { session, isExtension, run, announce, modal, closeDialog, render } =
    ctx;
  let theme = localStorage.getItem("theme") ?? "system";
  let accent = localStorage.getItem("accent") ?? "pink";
  function setTheme() {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.accent = accent;
  }
  setTheme();

  function settingsView(): HTMLElement {
    const themeSelect = select(
      "theme",
      "Appearance",
      {
        system: "System",
        light: "Light",
        dark: "Dark",
        amoled: "AMOLED · true black",
      },
      theme,
    );
    themeSelect.control.addEventListener("change", () => {
      theme = themeSelect.control.value;
      localStorage.setItem("theme", theme);
      setTheme();
    });
    const accentSelect = select(
      "accent",
      "Accent",
      {
        pink: "Shock pink · default",
        green: "Forest",
        blue: "Blue",
        violet: "Violet",
        rose: "Rose",
        teal: "Teal",
        neutral: "Neutral",
      },
      accent,
    );
    accentSelect.control.addEventListener("change", () => {
      accent = accentSelect.control.value;
      localStorage.setItem("accent", accent);
      setTheme();
    });
    const timeout = select(
      "timeout",
      "Lock after inactivity",
      {
        "60000": "1 minute",
        "300000": "5 minutes",
        "900000": "15 minutes",
        "1800000": "30 minutes",
      },
      String(session.timeout),
    );
    timeout.control.addEventListener("change", () => {
      session.timeout = Number(timeout.control.value);
      localStorage.setItem("timeout", String(session.timeout));
    });
    const automatic = el("input", { type: "checkbox", id: "automatic" });
    if (isExtension) {
      void chrome.storage.local.get("automatic").then((p) => {
        automatic.checked = !!p.automatic;
      });
      automatic.addEventListener("change", () =>
        run(async () => {
          if (automatic.checked) {
            const allowed = await chrome.permissions.request({
              permissions: ["tabs"],
            });
            automatic.checked = allowed;
            await chrome.storage.local.set({ automatic: allowed });
          } else {
            await chrome.storage.local.set({ automatic: false });
            await chrome.permissions.remove({ permissions: ["tabs"] });
          }
        }),
      );
    } else automatic.disabled = true;
    return el(
      "section",
      { class: "content stack" },
      el("h1", {}, "Settings"),
      el(
        "div",
        { class: "settings-section stack" },
        el("h2", {}, "Make it yours"),
        themeSelect.wrapper,
        accentSelect.wrapper,
      ),
      el(
        "div",
        { class: "settings-section stack" },
        el("h2", {}, "Vault security"),
        timeout.wrapper,
        el(
          "p",
          { class: "hint" },
          "Also locks immediately when this page is hidden or closed. Keys are never saved in session storage. No OS-lock detection is claimed.",
        ),
        button(
          "Change master password",
          () => changePassword(),
          "button tonal",
        ),
      ),
      el(
        "div",
        { class: "settings-section stack" },
        el("h2", {}, "Website awareness"),
        el(
          "label",
          { class: "switch-label", for: "automatic" },
          automatic,
          "Automatic toolbar indicators",
        ),
        el(
          "p",
          { class: "hint" },
          "Optional tabs permission gives access to the URLs of all open tabs. Addresses are checked against the bundled directory on this device. No visits are stored or sent. Manual checks use activeTab when you open the popup. No notifications or page injection.",
        ),
      ),
      el(
        "aside",
        { class: "notice" },
        el(
          "strong",
          {},
          `Development preview · ${isExtension ? chrome.runtime.getManifest().version : "development"}`,
        ),
        el(
          "p",
          {},
          "No independent audit. TOTP can be phished, and malware on this computer can read unlocked codes. Your device clock must be correct.",
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
            const epoch = session.epoch();
            try {
              if (next.control.value !== confirm.control.value)
                throw new Error("Passwords do not match.");
              const rotation = await rotatePassword(
                session.current(),
                current.control.value,
                next.control.value,
              );
              session.check();
              if (epoch !== session.epoch()) return;
              await session.save(
                session.accounts(),
                (h) => ({ ...h, password: rotation.password, passkeys: [] }),
                rotation.key,
              );
              session.check();
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
        next.wrapper,
        confirm.wrapper,
        submit("Change password"),
      ),
    );
  }

  return { settingsView };
}
