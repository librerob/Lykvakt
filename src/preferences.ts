export function readPreference(name: string, fallback = ""): string {
  try {
    return localStorage.getItem(name) ?? fallback;
  } catch {
    return fallback;
  }
}
export function savePreference(name: string, value: string): void {
  try {
    localStorage.setItem(name, value);
  } catch {
    /* Preferences are optional; the vault remains usable. */
  }
}
export const preferenceEnabled = (name: string): boolean =>
  readPreference(name) === "true";
