import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  base64,
  importVaultKey,
  random,
  seal,
  type Envelope,
} from "../src/crypto";
import { emptyVault } from "../src/model";
import { SessionBroker, type BrokerIO } from "../src/session-broker";
import {
  envelopeBinding,
  type CachedUnlock,
  type SessionState,
} from "../src/session-cache";
let now: number,
  state: SessionState | undefined,
  io: BrokerIO,
  broker: SessionBroker,
  initial: CachedUnlock,
  envelope: Envelope;
beforeEach(async () => {
  now = 1_000_000;
  state = undefined;
  const raw = random(32);
  try {
    envelope = await seal(
      {
        format: "otp-vault",
        version: 2,
        kind: "vault",
        id: "clock-fixture",
        revision: 0,
        password: {
          kdf: "Argon2id",
          m: 65536,
          t: 3,
          p: 1,
          salt: base64(random(32)),
          iv: base64(random(12)),
          wrapped: base64(random(48)),
        },
      },
      await importVaultKey(raw),
      emptyVault(),
    );
    io = {
      read: async () => structuredClone(state),
      write: async (value) => {
        state = structuredClone(value);
      },
      active: async () => envelope,
      alarm: async () => {},
      now: () => now,
    };
    broker = new SessionBroker(io);
    const epoch = await broker.request({ action: "begin" }, "one");
    initial = (await broker.request(
      {
        action: "remember",
        epoch,
        binding: await envelopeBinding(envelope),
        key: base64(raw),
        timeout: 300_000,
      },
      "one",
    )) as CachedUnlock;
  } finally {
    raw.fill(0);
  }
});
afterEach(() => vi.restoreAllMocks());
it.each(["resume", "verify"])(
  "%s persists the successful clock observation and a reconstructed broker rejects a backwards step",
  async (action) => {
    now += 200_000;
    const observed = (await broker.request(
      { action, epoch: initial.epoch, binding: initial.binding },
      "two",
    )) as CachedUnlock;
    expect(observed.checkedAt).toBe(now);
    expect(state!.unlock!.checkedAt).toBe(now);
    now -= 100_000;
    broker = new SessionBroker(io);
    expect(await broker.request({ action: "resume" }, "three")).toBeUndefined();
    expect(state!.unlock).toBeUndefined();
  },
);
it("rejects a backwards step during an asynchronous encrypted-record check", async () => {
  now += 100_000;
  io.active = async () => {
    now--;
    return envelope;
  };
  await expect(broker.request({ action: "resume" }, "two")).rejects.toThrow(
    "session ended",
  );
  expect(state!.unlock).toBeUndefined();
});
it("never returns a verified key if saving its clock observation fails", async () => {
  io.write = async () => {
    throw new Error("clock write failed");
  };
  await expect(broker.request({ action: "resume" }, "two")).rejects.toThrow(
    "clock write failed",
  );
});
it("read-only verification preserves the inactivity deadline and draft while updating only its observation", async () => {
  const draft = {
    mode: "import" as const,
    fields: { payload: "otpauth://totp/test" },
  };
  await broker.request(
    { action: "draft", epoch: initial.epoch, value: draft },
    "one",
  );
  now += 150_000;
  await broker.request(
    { action: "verify", epoch: initial.epoch, binding: initial.binding },
    "two",
  );
  expect(state!.unlock).toEqual({ ...initial, checkedAt: now, draft });
});
