import { OldFormatError, oldFormatMessage } from "./format";
import { StorageConflictError } from "./storage";

export const emptySearchMessage =
  "Type part of an account name, then press Enter to copy its code.";
export const backupCompatibilityMessage =
  "Backups made with this version need this version or newer to restore.";
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
  if (
    error instanceof Error &&
    /^(Your session ended\.|Your vault was (?:saved|created)\.|Password protection (?:could not|took too long))/.test(
      error.message,
    )
  )
    return { message: error.message, technical: error.name };
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
  if (error instanceof Error && /password.*length/i.test(error.message))
    return {
      message:
        "Enter a password of up to 1,024 characters. A long, unique passphrase is recommended.",
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
  if (
    error instanceof Error &&
    /^(QR reading|No readable QR code|Too many QR codes|QR image dimensions|Image decoding unavailable)/.test(
      error.message,
    )
  )
    return { message: error.message, technical: original };
  return {
    message:
      "We could not finish that action. Check your password and selected file, then try again. Keep your existing vault and backups.",
    technical: original,
  };
}
