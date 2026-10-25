export const oldFormatMessage =
  "This vault was made by an earlier preview and can't be opened by this version. To move your accounts: use the old version, go to Recovery → Export plaintext OTP links, then import that file here. If you no longer have the old version, reinstall it in the same folder (same extension), export, then update.";
export class OldFormatError extends Error {
  constructor() {
    super(oldFormatMessage);
    this.name = "OldFormatError";
  }
}
export function isOlderFormat(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.format === "otp-vault" && record.version === 1;
}
