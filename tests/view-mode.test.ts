import { expect, it, vi } from "vitest";
import { installViewLock, isPopupMode } from "../src/view-mode";
it.each(["", "?other=window"])("uses popup mode for %s", (search) =>
  expect(isPopupMode(search)).toBe(true),
);
it.each(["?window", "?window=1"])(
  "uses explicit window mode for %s",
  (search) => expect(isPopupMode(search)).toBe(false),
);
it.each([true, false])("locks on pagehide in popup=%s", (mode) => {
  const page = Object.assign(new EventTarget(), { hidden: false });
  const view = new EventTarget();
  const session = { lock: vi.fn() };
  installViewLock(mode, session, page, view, vi.fn(), vi.fn());
  view.dispatchEvent(new Event("pagehide"));
  expect(session.lock).toHaveBeenCalledOnce();
});
it.each([true, false])(
  "hide and blur use the correct policy in popup=%s",
  (mode) => {
    const page = Object.assign(new EventTarget(), { hidden: false });
    const view = new EventTarget();
    const session = { lock: vi.fn() },
      mask = vi.fn(),
      resume = vi.fn();
    installViewLock(mode, session, page, view, mask, resume);
    page.hidden = true;
    page.dispatchEvent(new Event("visibilitychange"));
    view.dispatchEvent(new Event("blur"));
    expect(mode ? session.lock : mask).toHaveBeenCalledTimes(2);
    expect(mode ? mask : session.lock).not.toHaveBeenCalled();
    page.hidden = false;
    page.dispatchEvent(new Event("visibilitychange"));
    view.dispatchEvent(new Event("focus"));
    expect(resume).toHaveBeenCalledTimes(2);
  },
);
