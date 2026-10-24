// Serialized by chrome.scripting. Keep this function self-contained; only a code
// and its explicitly approved origin enter the page. No secrets or account data.
export function fillCode(expectedOrigin: string, code: string): boolean {
  if (
    location.origin !== expectedOrigin ||
    location.protocol !== "https:" ||
    window !== window.top ||
    !/^(?:[0-9]{6}|[0-9]{8})$/.test(code)
  )
    return false;
  const candidates = [
    ...document.querySelectorAll<HTMLInputElement>(
      'input[autocomplete="one-time-code"]',
    ),
  ].filter((input) => {
    const style = getComputedStyle(input);
    return (
      ["text", "tel", "number", ""].includes(input.type) &&
      !input.disabled &&
      !input.readOnly &&
      !input.closest('[inert], [aria-hidden="true"]') &&
      style.visibility === "visible" &&
      style.display !== "none" &&
      input.getClientRects().length > 0 &&
      input.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    );
  });
  // Deliberately conservative: no guessed fields, segmented boxes or overwrites.
  if (candidates.length !== 1) return false;
  const input = candidates[0]!;
  if (
    input.value !== "" ||
    (input.maxLength >= 0 && input.maxLength < code.length)
  )
    return false;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setter) return false;
  setter.call(input, code);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}
