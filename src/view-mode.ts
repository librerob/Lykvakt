import type { Session } from "./session";
export function isPopupMode(search: string): boolean {
  return !new URLSearchParams(search).has("window");
}
export function installViewLock(
  isPopup: boolean,
  session: Pick<Session, "lock">,
  page: Pick<Document, "hidden" | "addEventListener">,
  view: Pick<Window, "addEventListener">,
  mask: () => void,
  resume: () => void,
): void {
  const leave = () => (isPopup ? session.lock() : mask());
  page.addEventListener("visibilitychange", () => {
    if (page.hidden) leave();
    else resume();
  });
  view.addEventListener("blur", leave);
  view.addEventListener("focus", resume);
  view.addEventListener("pagehide", () => session.lock());
}
