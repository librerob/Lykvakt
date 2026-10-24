import { button, el, input, select, form, submit } from "../dom";
import { makePasswordSlot, unwrapPassword } from "../crypto";
import { enroll } from "../passkeys";
import type { AppContext } from "./context";
export function createSettings(ctx: AppContext) {
  const {
    session,
    isExtension,
    fullWindow,
    run,
    announce,
    modal,
    closeDialog,
    render,
    confirmAction,
  } = ctx;
  let theme = localStorage.getItem("theme") ?? "system";
  let accent = localStorage.getItem("accent") ?? "green";
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
    const slots = el("div", { class: "stack" });
    for (const [i, slot] of session.current().passkeys.entries())
      slots.append(
        el(
          "div",
          { class: "inline" },
          el("span", {}, "Passkey " + (i + 1)),
          button(
            "Revoke",
            () =>
              confirmAction(
                "Revoke passkey unlock?",
                "This removes its encrypted key wrapper from this vault. Remove the credential separately in your authenticator if desired. The master password remains available.",
                "Revoke",
                async () => {
                  await session.save(session.accounts(), (h) => ({
                    ...h,
                    passkeys: h.passkeys.filter((x) => x.id !== slot.id),
                  }));
                  render();
                },
              ),
            "button text",
          ),
        ),
      );
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
        "details",
        { class: "settings-section" },
        el("summary", {}, "Experimental passkey unlock"),
        el(
          "div",
          { class: "stack" },
          el(
            "p",
            {},
            "Uses WebAuthn PRF to unwrap the vault key. Requires a compatible authenticator and this extension’s stable origin. No real Windows Hello, Touch ID or security-key hardware has been validated for this preview.",
          ),
          el(
            "p",
            { class: "hint" },
            "Use a full window. Enrollment requires your master password and two successful authentication requests. Development and Store extension IDs may differ; keep your password and backup.",
          ),
          slots,
          button("Enroll a passkey", () => passkeyEnrollment(), "button tonal"),
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
        el("strong", {}, "Development preview · 0.1.0-rc.1"),
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
            if (next.control.value !== confirm.control.value)
              throw new Error("Passwords do not match.");
            const e = session.current(),
              epoch = session.epoch();
            const raw = await unwrapPassword(e, current.control.value);
            try {
              const password = await makePasswordSlot(
                raw,
                next.control.value,
                e.id,
                "vault",
              );
              session.check();
              if (epoch !== session.epoch()) return;
              await session.save(session.accounts(), (h) => ({
                ...h,
                password,
              }));
            } finally {
              raw.fill(0);
              f.reset();
            }
            closeDialog();
            announce(
              "Master password changed. Existing backup files still use their original passphrase.",
            );
          }),
        current.wrapper,
        next.wrapper,
        confirm.wrapper,
        submit("Change password"),
      ),
    );
  }

  function passkeyEnrollment(): void {
    if (!fullWindow) {
      announce("Open the full window, unlock, and enroll from Settings.", true);
      return;
    }
    if (session.current().passkeys.length >= 5) {
      announce(
        "Revoke a passkey before enrolling another (maximum five).",
        true,
      );
      return;
    }
    const password = input("password", "Confirm master password", "password");
    modal(
      "Enroll passkey unlock",
      form(
        async (_fields, f) =>
          run(async () => {
            const e = session.current(),
              epoch = session.epoch();
            const raw = await unwrapPassword(e, password.control.value);
            f.reset();
            try {
              const slot = await enroll(e, raw);
              session.check();
              if (epoch !== session.epoch()) return;
              await session.save(session.accounts(), (h) => ({
                ...h,
                passkeys: [...h.passkeys, slot],
              }));
            } finally {
              raw.fill(0);
            }
            closeDialog();
            render();
            announce(
              "PRF round-trip passed. Passkey wrapper enrolled for this extension origin.",
            );
          }),
        password.wrapper,
        el(
          "p",
          { class: "hint" },
          "If PRF is unavailable, no unlock method is saved. Your provider may retain a credential from an unsuccessful enrollment; remove it there if needed.",
        ),
        submit("Start secure enrollment"),
      ),
    );
  }

  return { settingsView };
}
