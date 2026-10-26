import { OldFormatError, oldFormatMessage } from "./format";
import { StorageConflictError } from "./storage";

export const emptySearchMessage =
  "Type part of an account name, then press Enter to copy its code.";
export const backupCompatibilityMessage =
  "Backups made with this version need this version or newer to restore.";

export const helpCopy = {
  account: {
    text: [
      "Use the setup key or QR code the service gives you when you turn on two-step sign-in. It is different from the short sign-in code.",
      "Copy advanced settings exactly from the service; do not guess. Review the account before saving.",
    ],
  },
  import: {
    text: [
      "Choose an export from your old authenticator or paste a setup link. Lykvakt recognises the format.",
      "Review what will be added or skipped before saving. Keep your old authenticator until you have checked the new one.",
    ],
  },
  moving: {
    text: [
      "Authy and Microsoft Authenticator have no official export of sign-in setup secrets.",
      "Third-party Authy tools can make setup-link lists for import. Use them at your own risk, with test accounts first. Lykvakt does not provide or verify them.",
      "For Microsoft Authenticator, set up each service again from its security settings. Keep your existing authenticator until you have tested every account.",
    ],
  },
  steam: {
    text: [
      "Steam support makes sign-in codes only. It cannot approve trades or market confirmations.",
      "Steam's own app does not show its setup secret. It usually has to come from another authenticator or a .maFile export. Keep the file private: it can contain other sensitive Steam data. Only the sign-in secret and account name are imported.",
    ],
  },
  password: {
    text: [
      "This password opens your vault on this device. Use a long phrase that you do not use anywhere else.",
      "Keep a safe written copy. There is no reset button or way to recover a forgotten password.",
    ],
  },
  backup: {
    text: [
      "A backup is a locked account file. It has its own password, which can differ from your vault password.",
      "Save the file somewhere outside this browser, such as a USB drive. Keep its password somewhere separate.",
    ],
    technical: [
      "Files use format 2 and payload schema 3, with Argon2id at 64 MiB, three passes and one lane, plus AES-256-GCM and AES-KW.",
    ],
  },
  verify: {
    text: [
      "Choose the backup file you saved and enter its password. Lykvakt opens it in memory and compares it with your accounts.",
      "This test does not replace accounts. It can show that an older file is missing a new account.",
    ],
  },
  export: {
    text: [
      "These links and QR codes hold your sign-in secret. Anyone with a copy can make the same codes.",
      "Use them only to move to another authenticator. Check the new app, then remove temporary files and close the QR view.",
    ],
  },
  nextCode: {
    text: [
      "This shows the next code. Wait until the current code expires before using it.",
      "Both codes stay hidden until revealed. Copy uses the current code. Counter-based accounts have no next-code preview.",
    ],
  },
  shortcut: {
    text: [
      "Use Ctrl+Shift+Y to open Lykvakt, or Command+Shift+Y on a Mac. If another app uses that key, Chrome may leave it unassigned.",
      "Choose your key at chrome://extensions/shortcuts. After unlocking, search for an account, then press Enter to copy the first match's current code. The message names the account. An empty search copies nothing.",
    ],
  },
  olderCopy: {
    text: [
      "Saving keeps a recent locked copy in this browser. If the current copy cannot be read, you can choose the older one and enter its password.",
      "It may not include your latest changes. Counter-based codes may be behind: do not reuse a code you already submitted.",
    ],
  },
  timeout: {
    text: [
      "Lykvakt locks after this long without a click or key press. Five minutes is a sensible starting point.",
      "Hiding or closing this page locks it right away. Unlock again with your password when you need a code.",
    ],
  },
  oldFormat: {
    text: [
      "Earlier previews used a different file format. Before updating, export your accounts using the old app. If you no longer have it, reinstall the old version in the same folder (same extension), export, then update.",
      "Export OTP links from Recovery in the old app, erase this old local vault only when you are ready, then import the links into a new vault. The exported file contains secrets; keep it private and remove temporary copies after checking the new vault.",
    ],
  },
  security: {
    text: [
      "Codes can be stolen by a fake sign-in page. Check the site before entering a code.",
      "Software on a compromised device may read unlocked accounts. Keep your device updated and save an independent backup.",
    ],
  },
  tipsPassword: {
    text: [
      "Remember your vault password and keep a safe written copy. There is no reset service.",
    ],
  },
  tipsBackup: {
    text: [
      "Save a locked backup file somewhere outside this browser. Keep its password separately, so one lost device does not take both copies.",
    ],
  },
  tipsVerify: {
    text: [
      "Choose Verify or restore a backup and test the actual saved file. This checks that its password works without replacing your accounts.",
    ],
  },
} satisfies Record<string, { text: string[]; technical?: string[] }>;
export type HelpTopic = keyof typeof helpCopy;
export const busyCopy = {
  setup:
    "Locking your vault with your password… this takes a moment on purpose, to help protect it.",
  unlock: "Unlocking… this can take a second or two.",
  backup: "Locking your backup with its password… this can take a moment.",
  verify:
    "Opening and checking your backup… your accounts will stay as they are.",
};
export function friendlyError(error: unknown): {
  message: string;
  technical: string;
} {
  if (error instanceof Error && error.name === "ImportLimitError")
    return {
      message: error.message,
      technical:
        "Aegis scrypt import limit: N is a power of two from 2 to 65536; r 1–8; p 1–4; N × r × p ≤ 524288; 65 MiB scratch memory.",
    };
  if (error instanceof Error && error.name === "UnrecognizedImportError")
    return { message: error.message, technical: "Unrecognised import format." };
  const original =
    error instanceof Error ? error.name + ": " + error.message : String(error);
  if (error instanceof OldFormatError)
    return { message: oldFormatMessage, technical: original };
  if (
    error instanceof Error &&
    ["OperationError", "DataError"].includes(error.name)
  )
    return {
      message:
        "That password didn't work, or the file is damaged. Check Caps Lock and try again with a backup you trust. There is no reset, so we cannot recover a forgotten password.",
      technical: "Authentication failed. " + original,
    };
  if (
    error instanceof Error &&
    (error.name === "AbortError" || /cancelled|aborted/i.test(error.message))
  )
    return {
      message:
        "That action stopped because the vault locked. Unlock it and try again.",
      technical: original,
    };
  if (
    error instanceof Error &&
    /current vault could not be read/.test(error.message)
  )
    return {
      message:
        "A recent copy may be available. Read the recovery message and choose whether to unlock that copy.",
      technical: original,
    };
  if (error instanceof SyntaxError)
    return {
      message:
        "We could not read that file. Choose an unchanged export or backup and try again. Your accounts have not been changed.",
      technical: original,
    };
  if (error instanceof Error && error.cause instanceof StorageConflictError)
    return { message: error.message, technical: original };
  if (
    error instanceof Error &&
    /changed in another window|Vault changed/.test(error.message)
  )
    return {
      message:
        "Another vault window saved a change. Lock and unlock this window, then try again.",
      technical: original,
    };
  if (
    error instanceof Error &&
    /password.*length|at least 14/i.test(error.message)
  )
    return {
      message:
        "Use a unique password with at least 14 characters. A few words can be easier to remember; you can also choose Generate.",
      technical: original,
    };
  if (
    error instanceof Error &&
    /passwords do not match|passphrases do not match/i.test(error.message)
  )
    return {
      message:
        "The two passwords do not match. Enter the same password in both boxes and try again.",
      technical: original,
    };
  if (
    error instanceof Error &&
    /Choose |Select |Compare |incomplete|all \d+ QR|Account \d+|conflict|skipped/i.test(
      error.message,
    )
  )
    return {
      message:
        error.message + " Review the selected file or entries, then try again.",
      technical: original,
    };
  return {
    message:
      "We could not finish that action. Check your password and selected file, then try again. Keep your existing vault and backups.",
    technical: original,
  };
}
