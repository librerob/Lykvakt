import { StorageConflictError } from "./storage";

export const emptySearchMessage =
  "Type part of an account name, then press Enter to copy its code.";
export const upgradePendingMessage =
  "Your vault works normally, but we couldn't finish a security upgrade. We'll try again the next time you unlock.";

export const backupCompatibilityMessage =
  "Backups made with this version need this version or newer to restore.";

export const helpCopy = {
  account: {
    text: [
      "Use the setup key or QR code shown by the service when you turn on two-step sign-in. This is different from the short code you use to sign in.",
      "Keep advanced settings exactly as given by the service; do not guess. You can review the account before saving it.",
    ],
  },
  import: {
    text: [
      "Choose an export from your old authenticator, or paste a setup link. Pick the same format as that app.",
      "Lykvakt shows what will be added or skipped before you save. Keep your old authenticator until you have checked the new one.",
    ],
  },
  password: {
    text: [
      "This password opens your vault on this device. Use a long phrase that you do not use anywhere else.",
      "Keep a safe written copy. There is no reset button, and we cannot recover a forgotten password.",
    ],
  },
  backup: {
    text: [
      "A backup is a locked copy of your accounts in a file. It has its own password, which can be different from your vault password.",
      "Save the file somewhere outside this browser, such as a USB drive. Keep its password somewhere separate.",
    ],
    technical: [
      "New backup files use Argon2id at 64 MiB, three passes and one lane, plus authenticated AES-256-GCM and AES-KW. The file stores its protection parameters.",
    ],
  },
  verify: {
    text: [
      "Choose the backup file you actually saved, then enter that file's password. We open it in memory and compare it with your accounts.",
      "This test does not replace your accounts. For example, it can tell you that an older file is missing a recently added account.",
    ],
  },
  reminder: {
    text: [
      "Your accounts have changed since the last backup you tested, or you have not tested one yet. Save a new backup and choose Verify or restore a backup to check the real file.",
      "Using a counter-based code changes its saved counter too. That can make an older backup out of date.",
    ],
  },
  export: {
    text: [
      "These links and QR codes contain the secret needed to make your sign-in codes. Anyone with a copy can make the same codes.",
      "Use them only to move to another authenticator. Check the new app, then remove temporary files and close the QR view.",
    ],
  },
  nextCode: {
    text: [
      "This shows the code that will come after the one you can use now. Wait until the current code expires before using the next one.",
      "Both codes stay hidden until you reveal them. Copy always copies the current code, and counter-based accounts have no next-code preview.",
    ],
  },
  shortcut: {
    text: [
      "Use Ctrl+Shift+Y to open Lykvakt, or Command+Shift+Y on a Mac. If another app uses that key, Chrome may leave it unassigned.",
      "Open chrome://extensions/shortcuts to choose your own key. Once unlocked, type part of an account name before pressing Enter. This copies the first match's current code and tells you which account it came from; an empty search copies nothing.",
    ],
  },
  olderCopy: {
    text: [
      "This browser keeps a recent locked copy when you save changes. If the current copy cannot be read, you can choose the older copy and enter its password.",
      "It may not include your latest changes. Counter-based codes may be behind: do not reuse a code you already submitted.",
    ],
  },
  timeout: {
    text: [
      "Lykvakt locks after this much time without a click or key press. For example, five minutes is a sensible starting point.",
      "Hiding or closing this page locks it right away. Unlock again with your password when you need a code.",
    ],
  },
  protection: {
    text: [
      "When you enter your password, the app does slow math on purpose. That is a short wait for you, but it adds work to each password guess made by someone with a stolen vault file.",
      "A stronger setting uses more time or temporary memory. Your password and sign-in codes stay the same; a long, unique password still matters.",
    ],
    technical: [
      "Argon2id version 0x13 derives 32 bytes. Recommended uses 65,536 KiB, t=3 and p=1. Extra strong uses 131,072 KiB, t=3 and p=1.",
      "Stored bounds are 19,456–262,144 KiB, t=2–10 and p=1. Calibration uses a throwaway one-pass probe, then clamps the suggested passes to 3–10. Parameters are authenticated as AAD.",
      "Local calibration does not slow an attacker's GPU to your computer's speed. Plaintext parameters can reveal an approximate speed setting. JavaScript cannot guarantee memory zeroization.",
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
  protect: "Saving your stronger protection… this can take a moment.",
  test: "Testing how fast this computer is… this can take a second or two.",
  backup: "Locking your backup with its password… this can take a moment.",
  verify:
    "Opening and checking your backup… your accounts will stay as they are.",
};
export function friendlyError(error: unknown): {
  message: string;
  technical: string;
} {
  const original =
    error instanceof Error ? error.name + ": " + error.message : String(error);
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
