import { expect, it } from "vitest";
import { AUTO_LOCK_OPTIONS, autoLockTimeout } from "../src/lock-policy";

it.each([0, 60_000, 300_000, 900_000, 1_800_000, 3_600_000])(
  "accepts the configured auto-lock choice %i",
  (value) => expect(autoLockTimeout(value)).toBe(value),
);
it.each([NaN, Infinity, -1, 1, 60_001, 1.5])(
  "uses window lifetime for an invalid preference %s",
  (value) => expect(autoLockTimeout(value)).toBe(0),
);
it("names the no-timer choice by its actual window lifetime", () => {
  expect(AUTO_LOCK_OPTIONS["0"]).toBe("When this window closes");
});
