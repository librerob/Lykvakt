import { afterEach, expect, it, vi } from "vitest";
import {
  AUTO_LOCK_OPTIONS,
  autoLockTimeout,
  preferredAutoLockTimeout,
} from "../src/lock-policy";

it.each([0, 60_000, 300_000, 900_000, 1_800_000, 3_600_000])(
  "accepts the configured auto-lock choice %i",
  (value) => expect(autoLockTimeout(value)).toBe(value),
);
it.each([NaN, Infinity, -1, 1, 60_001, 1.5])(
  "uses the five-minute window default for an invalid preference %s",
  (value) => expect(autoLockTimeout(value)).toBe(300_000),
);
it("names the no-timer choice by its browser-session lifetime", () => {
  expect(AUTO_LOCK_OPTIONS["0"]).toBe("When the browser restarts");
});

afterEach(() => vi.unstubAllGlobals());
it.each([null, "", "  ", "garbage"])(
  "uses five minutes when the stored preference is missing or invalid: %s",
  (stored) => {
    vi.stubGlobal("localStorage", { getItem: () => stored });
    expect(preferredAutoLockTimeout()).toBe(300_000);
  },
);
it("retains an explicit saved no-timer choice", () => {
  vi.stubGlobal("localStorage", { getItem: () => "0" });
  expect(preferredAutoLockTimeout()).toBe(0);
});

it.each([null, "false", "0"])(
  "does not silently extend the old window-only zero preference to a browser session: %s",
  (marker) => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === "timeout" ? "0" : marker),
    });
    expect(preferredAutoLockTimeout(true)).toBe(300_000);
  },
);
it("retains an explicitly confirmed browser-session choice", () => {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (key === "timeout" ? "0" : "true"),
  });
  expect(preferredAutoLockTimeout(true)).toBe(0);
});
it("keeps existing timed preferences when enabling shared sessions", () => {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (key === "timeout" ? "900000" : null),
  });
  expect(preferredAutoLockTimeout(true)).toBe(900_000);
});
