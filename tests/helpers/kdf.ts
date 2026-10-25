import { afterEach, beforeEach } from "vitest";
import { setKdfRunner } from "../../src/kdf";
// Load after each test file installs its primitive-buffer mocks. All ordinary
// integration tests still use real Argon2, validation and buffer zeroization.
const run: NonNullable<Parameters<typeof setKdfRunner>[0]> = async (
  ...args
) => {
  const { deriveKeyHere } = await import("../../src/kdf-engine");
  return deriveKeyHere(...args);
};
setKdfRunner(run);
beforeEach(() => setKdfRunner(run));
afterEach(() => setKdfRunner(undefined));
