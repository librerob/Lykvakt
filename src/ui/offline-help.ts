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
        ? "You can close this popup and reopen it without entering your password again until the session expires. The default is 5 minutes of inactivity. Lock ends the session in every view."
        : "This window shares the timed unlock session with the popup. Settings lets you change the timer; Lock ends the session in every view.",
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
      "Backup contains Import accounts, export and encrypted backups. Paste setup links or export text here. Choose Open in a window to choose a file for export-file imports, QR images or backup restoration; the window uses your current unlock session.",
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
