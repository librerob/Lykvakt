export function bindSearch(
  input: HTMLInputElement,
  copyFirst: () => Promise<void>,
): void {
  input.addEventListener("keydown", (event) => {
    if (
      event.key !== "Enter" ||
      event.isComposing ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey
    )
      return;
    event.preventDefault();
    void copyFirst();
  });
}
export function focusVault(
  root: ParentNode,
  unlocked: boolean,
  view: string,
): void {
  const target = !unlocked
    ? root.querySelector<HTMLInputElement>('input[type="password"]')
    : view === "codes"
      ? root.querySelector<HTMLInputElement>('input[name="search"]')
      : null;
  target?.focus({ preventScroll: true });
}
export function installEscape(
  target: EventTarget,
  clearSearch: () => boolean,
  closePopup: () => void,
  dialogOpen: () => boolean,
): void {
  target.addEventListener("keydown", (incoming) => {
    const event = incoming as KeyboardEvent;
    if (event.key !== "Escape" || dialogOpen()) return;
    event.preventDefault();
    if (!clearSearch()) closePopup();
  });
}
