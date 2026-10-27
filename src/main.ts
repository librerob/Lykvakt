import { DialogLifetime } from "./dialog";
import { dialogOperation } from "./ui/context";
import { OldFormatError } from "./format";
import "./style.css";
import { button, el, technicalDetails } from "./dom";
import { offlineHelp } from "./ui/offline-help";
import { friendlyError } from "./help";
import { focusVault, installEscape } from "./keyboard";
import { preferenceEnabled } from "./preferences";
import { preferredAutoLockTimeout } from "./lock-policy";
import { isPopupMode, installViewLock } from "./view-mode";
import { Session } from "./session";
import { load, isRecoveryOffer, isOldVault } from "./storage";
import { createAccounts } from "./ui/accounts";
import { createRecovery } from "./ui/recovery";
import { createSettings } from "./ui/settings";
import { createWelcome } from "./ui/welcome";
import type { AppContext, AppState } from "./ui/context";
const root = document.querySelector<HTMLDivElement>("#app")!;
const session = new Session();
const state: AppState = {
  exists: false,
  view: "codes",
  firstRunTip: preferenceEnabled("firstRunTips"),
};
let dialog: HTMLDialogElement | undefined;
const dialogLifetime = new DialogLifetime();
let status: HTMLElement;
const isExtension = !!globalThis.chrome?.runtime?.id;
const isPopup = isPopupMode(location.search);
document.body.classList.add(isPopup ? "popup-mode" : "window-mode");
session.timeout = preferredAutoLockTimeout();
async function run(action: () => void | Promise<void>): Promise<void> {
  const originDialog = dialog;
  try {
    await action();
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === "AbortError") ||
      (originDialog && !originDialog.isConnected)
    )
      return;
    if (error instanceof OldFormatError && state.oldVault) return;
    const message = friendlyError(error);
    announce(message.message, true, message.technical);
    if (error instanceof OldFormatError)
      (dialog?.querySelector(".dialog-status") ?? status).append();
  }
}

function announce(message: string, error = false, technical?: string): void {
  const liveStatus =
    dialog?.querySelector<HTMLElement>(".dialog-status") ?? status;
  liveStatus.replaceChildren(
    el("p", {}, message),
    ...(technical ? [technicalDetails(el("p", {}, technical))] : []),
  );
  liveStatus.className =
    (error ? "status error" : "status") + (dialog ? " dialog-status" : "");
}

function closeDialog(): void {
  const previous = dialog;
  dialog = undefined;
  dialogLifetime.close();
  previous?.querySelectorAll("form").forEach((form) => form.reset());
  previous?.close();
  previous?.remove();
  status?.setAttribute("role", "status");
  status?.setAttribute("aria-live", "polite");
}

function modal(title: string, content: Node): void {
  closeDialog();
  dialogLifetime.open();
  const titleNode = el("h2", { id: "dialog-title" }, title);
  dialog = el(
    "dialog",
    { "aria-labelledby": "dialog-title" },
    el(
      "div",
      { class: "dialog-head" },
      titleNode,
      button("Close", closeDialog, "button text"),
    ),
    content,
    el("div", {
      class: "status dialog-status",
      role: "status",
      "aria-live": "polite",
    }),
  );
  status.removeAttribute("role");
  status.removeAttribute("aria-live");
  const currentDialog = dialog;
  currentDialog.addEventListener("cancel", (event) => {
    // Escape must abort synchronously, before the native queued close event.
    event.preventDefault();
    if (dialog === currentDialog) closeDialog();
  });
  currentDialog.addEventListener(
    "close",
    () => {
      if (dialog === currentDialog) closeDialog();
    },
    { once: true },
  );
  document.body.append(dialog);
  dialog.showModal();
}

function confirmAction(
  title: string,
  message: string,
  label: string,
  action: (signal: AbortSignal) => Promise<void>,
): void {
  modal(
    title,
    el(
      "div",
      { class: "stack" },
      el("p", {}, message),
      button(
        label,
        () =>
          run(async () => {
            const signal = dialogOperation(ctx);
            await action(signal);
            if (!signal.aborted) closeDialog();
          }),
        "button primary",
      ),
    ),
  );
}
const ctx: AppContext = {
  session,
  state,
  isExtension,
  isPopup,
  isVisible: () => !document.hidden,
  run,
  announce,
  modal,
  closeDialog,
  dialogSignal: () => dialogLifetime.signal(),
  render,
  confirmAction,
};
const accounts = createAccounts(ctx);
const recovery = createRecovery(ctx, accounts.preview, accounts.importAccounts);
const settings = createSettings(ctx);
const welcome = createWelcome(ctx, recovery.recoverySetup);
installEscape(document, accounts.clearSearch, () => !!dialog);

session.onlock = () => {
  state.backupDismissed = false;
  accounts.clear();
  closeDialog();

  render();
};
function refreshWindow(): void {
  if (!session.unlocked) return;
  try {
    session.check();
    if (state.view === "codes" && !document.hidden) void run(accounts.tick);
  } catch {
    // Expiry already rendered the locked view.
  }
}
installViewLock(
  isPopup,
  session,
  document,
  window,
  accounts.mask,
  refreshWindow,
);

for (const event of ["pointerdown", "keydown"])
  document.addEventListener(
    event,
    () => {
      if (session.unlocked) {
        try {
          session.check();
          session.touch();
        } catch {
          /* Lock already rendered. */
        }
      }
    },
    { passive: true },
  );
setInterval(() => {
  if (session.unlocked) {
    try {
      session.check();
      if (state.view === "codes" && !document.hidden) void run(accounts.tick);
    } catch {
      /* Expired session. */
    }
  }
}, 1000);

function render(): void {
  const title = el(
    "div",
    { class: "wordmark" },
    el("img", { src: "icons/32.png", width: "32", height: "32", alt: "" }),
    el("div", {}, el("strong", {}, "Lykvakt")),
  );
  const tools = el(
    "div",
    { class: "header-actions" },
    button(
      "Help & documentation",
      () => modal("Help & documentation", offlineHelp(isPopup)),
      "button text help-link",
    ),
  );
  if (session.unlocked)
    tools.append(button("Lock", () => session.lock(), "button tonal"));
  const header = el("header", {}, title, tools);
  status = el("div", {
    class: "status",
    role: "status",
    "aria-live": "polite",
  });
  const main = el("main");
  if (!session.unlocked) main.append(welcome.locked());
  else {
    const nav = el("nav", { "aria-label": "Vault" });
    for (const [key, title] of [
      ["codes", "Authenticator"],
      ["backups", "Backup"],
      ["settings", "Settings"],
    ] as const) {
      const tab = button(
        title,
        () => {
          closeDialog();
          state.view = key;
          accounts.clear();
          render();
        },
        "nav-item" + (state.view === key ? " selected" : ""),
      );
      if (state.view === key) tab.setAttribute("aria-current", "page");
      nav.append(tab);
    }
    main.append(
      nav,
      state.view === "codes"
        ? accounts.codesView()
        : state.view === "backups"
          ? recovery.backupsView()
          : settings.settingsView(),
    );
  }
  root.replaceChildren(
    header,
    main,
    status,
    el(
      "footer",
      {},
      el(
        "span",
        { class: "local-footer" },
        el("span", { class: "local-dot" }),
        "Local vault · No account · No telemetry",
      ),
    ),
  );
  if (!dialog) focusVault(root, session.unlocked, state.view);
}
void run(async () => {
  // A load error must not expose setup over an existing vault.
  state.exists = true;
  const loaded = await load();
  state.exists = !!loaded;
  state.oldVault = loaded && isOldVault(loaded) ? loaded : undefined;
  state.recovery = loaded && isRecoveryOffer(loaded) ? loaded : undefined;
  render();
});
render();
