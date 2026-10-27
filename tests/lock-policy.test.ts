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
it("names the no-timer choice by its actual window lifetime", () => {
  expect(AUTO_LOCK_OPTIONS["0"]).toBe("When this window closes");
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
