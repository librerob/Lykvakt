import { SetupKeyLengthError } from "./otp";
import type { Account } from "./model";
export interface SkippedEntry {
  index: number;
  reason: string;
}
export interface ImportResult {
  accounts: Account[];
  skipped: SkippedEntry[];
}
export class NoValidAccountsError extends Error {
  constructor(readonly skipped: SkippedEntry[]) {
    super("No valid accounts found. Nothing was imported.");
    this.name = "NoValidAccountsError";
  }
}
export function collectImport<T>(
  entries: T[],
  parse: (entry: T) => Account,
  reason?: string,
  indexes?: number[],
): ImportResult {
  const result: ImportResult = { accounts: [], skipped: [] };
  entries.forEach((entry, i) => {
    try {
      result.accounts.push(parse(entry));
    } catch (error) {
      result.skipped.push({
        index: indexes?.[i] ?? i + 1,
        reason:
          (error instanceof SetupKeyLengthError ? error.message : reason) ??
          (error instanceof Error
            ? error.message
            : "Invalid or unsupported account."),
      });
    }
  });
  return result;
}
export function requireAccounts(result: ImportResult): ImportResult {
  if (!result.accounts.length) throw new NoValidAccountsError(result.skipped);
  return result;
}
