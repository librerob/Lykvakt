export function bindSearch(
  input: HTMLInputElement,
  copyFirst: () => Promise<void>,
  emptySearch: () => void = () => {},
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
    if (!input.value.trim()) {
      emptySearch();
      return;
    }
    void copyFirst();
  });
}
export function focusVault(
  root: ParentNode,
  unlocked: boolean,
  view: string,
): void {
  const search = root.querySelector<HTMLInputElement>('input[name="search"]');
  const target = !unlocked
    ? root.querySelector<HTMLInputElement>('input[type="password"]')
    : view === "codes"
      ? ((search?.hidden ? null : search) ??
        root.querySelector<HTMLButtonElement>(".account-tools button"))
      : null;
  target?.focus({ preventScroll: true });
}
export function installEscape(
  target: EventTarget,
  clearSearch: () => boolean,
  dialogOpen: () => boolean,
): void {
  target.addEventListener("keydown", (incoming) => {
    const event = incoming as KeyboardEvent;
    if (event.key !== "Escape" || dialogOpen()) return;
    event.preventDefault();
    clearSearch();
  });
}
