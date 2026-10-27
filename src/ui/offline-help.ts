import { documentationLink, el } from "../dom";
export function offlineHelp(isPopup: boolean): HTMLElement {
  return el(
    "div",
    { class: "stack offline-help" },
    el(
      "p",
      {},
      "These tips work offline. The full guide on GitHub is optional.",
    ),
    el("h3", {}, "Opening and locking"),
    el(
      "p",
      {},
      isPopup
        ? "This small popup locks when it closes or loses focus. In Settings, choose Open in a window to keep Lykvakt open while you work."
        : "This window locks after 5 minutes of inactivity by default. Settings lets you change the timer or keep it unlocked until this window closes.",
    ),
    el("h3", {}, "Your codes"),
    el(
      "p",
      {},
      "Click an account row to copy its current code. Reveal shows it for 30 seconds. Type part of an account name and press Enter to copy the first match. Counter-based codes advance only after you confirm More → Advance counter.",
    ),
    el("h3", {}, "Import and backup"),
    el(
      "p",
      {},
      "Backup contains Import accounts, export and encrypted backups. Paste setup links or export text here. Choose Open in a window to choose a file for export-file imports, QR images or backup restoration; the window asks for your password.",
    ),
    el("h3", {}, "Keep a way back in"),
    el(
      "p",
      {},
      "There is no password reset. Keep your password and a separate encrypted backup somewhere safe. Test the saved backup in Backup → Verify or restore a backup. Plaintext exports and transfer QR images contain setup secrets; keep them private.",
    ),
    documentationLink(),
  );
}
