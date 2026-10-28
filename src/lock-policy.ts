import { readPreference } from "./preferences";
export const AUTO_LOCK_OPTIONS: Record<string, string> = {
  "0": "When the browser restarts",
  "60000": "1 minute",
  "300000": "5 minutes",
  "900000": "15 minutes",
  "1800000": "30 minutes",
  "3600000": "1 hour",
};

export function autoLockTimeout(value: number): number {
  return Object.hasOwn(AUTO_LOCK_OPTIONS, String(value)) ? value : 300_000;
}

export function preferredAutoLockTimeout(shared = false): number {
  const stored = readPreference("timeout");
  if (
    shared &&
    stored.trim() === "0" &&
    readPreference("sessionTimeoutConfirmed") !== "true"
  )
    return 300_000;
  return autoLockTimeout(stored.trim() ? Number(stored) : NaN);
}
