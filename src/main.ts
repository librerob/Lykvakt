import { OldFormatError } from "./format";
import "./style.css";
import { button, el, helpBlock, technicalDetails } from "./dom";
import { friendlyError } from "./help";
import { focusVault, installEscape } from "./keyboard";
import { preferenceEnabled, readPreference } from "./preferences";
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
let status: HTMLElement;
const isExtension = !!globalThis.chrome?.runtime?.id;
const fullWindow = new URL(location.href).searchParams.has("window");
const storedTimeout = Number(readPreference("timeout"));
session.timeout = [60_000, 300_000, 900_000, 1_800_000].includes(storedTimeout)
  ? storedTimeout
  : 300_000;
async function run(action: () => void | Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof OldFormatError && state.oldVault) return;
    const message = friendlyError(error);
    announce(message.message, true, message.technical);
    if (error instanceof OldFormatError)
      (dialog?.querySelector(".dialog-status") ?? status).append(
        helpBlock("oldFormat"),
      );
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
  dialog?.close();
  dialog?.remove();
  dialog = undefined;
  status?.setAttribute("role", "status");
  status?.setAttribute("aria-live", "polite");
}

function modal(title: string, content: Node): void {
  closeDialog();
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
  action: () => Promise<void>,
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
            await action();
            closeDialog();
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
  fullWindow,
  run,
  announce,
  modal,
  closeDialog,
  render,
  confirmAction,
};
const accounts = createAccounts(ctx);
const recovery = createRecovery(ctx, accounts.preview);
const settings = createSettings(ctx);
const welcome = createWelcome(ctx, recovery.recoverySetup);
installEscape(
  document,
  accounts.clearSearch,
  () => {
    if (isExtension && !fullWindow) window.close();
  },
  () => !!dialog,
);

session.onlock = () => {
  accounts.clear();
  closeDialog();

  render();
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) session.lock();
});
window.addEventListener("pagehide", () => session.lock());
if (isExtension) {
  void chrome.tabs.getCurrent().then((current) => {
    if (current?.id === undefined) return;
    chrome.tabs.onActivated.addListener((active) => {
      if (active.windowId === current.windowId && active.tabId !== current.id)
        session.lock();
    });
  });
}

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
      if (state.view === "codes") void run(accounts.tick);
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
    el(
      "div",
      {},
      el("strong", {}, "Lykvakt"),
      el("span", { class: "preview" }, "DEVELOPMENT PREVIEW"),
    ),
  );
  const tools = el("div", { class: "header-actions" });
  if (!fullWindow && isExtension)
    tools.append(
      button(
        "Open window",
        () => {
          session.lock();
          void chrome.tabs.create({
            url: chrome.runtime.getURL("index.html?window"),
          });
        },
        "button text",
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
      ["backups", "Recovery"],
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
      el("span", { class: "local-dot" }),
      "Local vault · No account · No telemetry",
    ),
  );
  if (!dialog) focusVault(root, session.unlocked, state.view);
}
void run(async () => {
  // Until loading succeeds, never offer setup over a damaged existing database.
  state.exists = true;
  const loaded = await load();
  state.exists = !!loaded;
  state.oldVault = loaded && isOldVault(loaded) ? loaded : undefined;
  state.recovery = loaded && isRecoveryOffer(loaded) ? loaded : undefined;
  render();
});
render();
