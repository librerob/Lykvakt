import "fake-indexeddb/auto";
import { it, expect, vi } from "vitest";
import { commit, load } from "../src/storage";
import { createEnvelope, headerOf, seal } from "../src/crypto";
import { emptyVault } from "../src/model";
import { Session } from "../src/session";
it("atomically creates and rejects stale concurrent writes", async () => {
  const initial = await createEnvelope(
    "test database passphrase",
    emptyVault(),
  );
  await commit(initial.envelope);
  await expect(commit(initial.envelope)).rejects.toThrow("changed");
  const a = await seal(
    { ...headerOf(initial.envelope), revision: 1 },
    initial.key,
    emptyVault(),
  );
  const b = await seal(
    { ...headerOf(initial.envelope), revision: 1 },
    initial.key,
    emptyVault(),
  );
  const results = await Promise.allSettled([
    commit(a, initial.envelope),
    commit(b, initial.envelope),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await load())!.revision).toBe(1);
}, 60_000);
it("requires unlocking for all sensitive session access and cancels late unlock", async () => {
  const session = new Session();
  expect(() => session.accounts()).toThrow("Unlock");
  const unlock = session.unlock("test database passphrase");
  session.lock();
  await expect(unlock).rejects.toThrow("cancelled");
  expect(session.unlocked).toBe(false);
  await session.unlock("test database passphrase");
  expect(session.unlocked).toBe(true);
  session.lock();
  expect(() => session.current()).toThrow("Unlock");
  await expect(session.save(emptyVault())).rejects.toThrow("Unlock");
}, 60_000);
it("locks on the next operation if timers were suspended", async () => {
  const session = new Session();
  await session.unlock("test database passphrase");
  session.timeout = 1;
  const tick = vi
    .spyOn(performance, "now")
    .mockReturnValue(performance.now() + 2);
  try {
    expect(() => session.accounts()).toThrow("Unlock");
    expect(session.unlocked).toBe(false);
  } finally {
    tick.mockRestore();
  }
}, 60_000);

it("monotonic inactivity expiry survives a wall-clock rollback", async () => {
  const session = new Session();
  await session.unlock("test database passphrase");
  session.timeout = 300_000;
  const monotonic = performance.now();
  const wall = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(wall - 86_400_000);
  const tick = vi
    .spyOn(performance, "now")
    .mockReturnValue(monotonic + 300_001);
  try {
    expect(() => session.accounts()).toThrow("Unlock");
  } finally {
    clock.mockRestore();
    tick.mockRestore();
  }
}, 60_000);
