import { beforeEach, expect, it } from "vitest";
import {
  SessionBroker,
  trustedSessionSender,
  type BrokerIO,
} from "../src/session-broker";
import {
  base64,
  createEnvelope,
  importVaultKey,
  random,
  seal,
} from "../src/crypto";
import { emptyVault } from "../src/model";
import {
  envelopeBinding,
  type SessionState,
  type CachedUnlock,
} from "../src/session-cache";
let now: number, state: unknown, alarm: number;
let envelope: Awaited<ReturnType<typeof createEnvelope>>["envelope"];
let raw: Uint8Array<ArrayBuffer>;
let io: BrokerIO, broker: SessionBroker;
beforeEach(async () => {
  now = 1_000_000;
  state = undefined;
  alarm = 0;
  raw = random(32);
  envelope = await seal(
    {
      format: "otp-vault",
      version: 2,
      kind: "vault",
      id: "test",
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
    alarm: async (value) => {
      alarm = value;
    },
    now: () => now,
  };
  broker = new SessionBroker(io);
});
async function remember(timeout = 300_000) {
  const epoch = await broker.request({ action: "begin" }, "one");
  return (await broker.request(
    {
      action: "remember",
      epoch,
      binding: await envelopeBinding(envelope),
      key: base64(raw),
      timeout,
    },
    "one",
  )) as CachedUnlock;
}
it("stores only session unlock material and restores it after worker reconstruction", async () => {
  const cached = await remember();
  expect(alarm).toBe(now + 300_000);
  broker = new SessionBroker(io);
  expect(await broker.request({ action: "resume" }, "two")).toEqual(cached);
  expect(JSON.stringify(state)).not.toContain("password");
  expect(Object.keys((state as SessionState).unlock!).sort()).toEqual([
    "binding",
    "checkedAt",
    "epoch",
    "expires",
    "id",
    "key",
    "revision",
    "timeout",
    "touched",
  ]);
});
it("checks the deadline before restore even when the alarm has not fired", async () => {
  await remember();
  now += 300_000;
  expect(await broker.request({ action: "resume" }, "two")).toBeUndefined();
  expect((state as SessionState).unlock).toBeUndefined();
  expect(alarm).toBe(0);
});
it("rejects an expired touch instead of extending the unlocked lifetime", async () => {
  const cached = await remember();
  now += 300_001;
  await expect(
    broker.request(
      { action: "touch", epoch: cached.epoch, timeout: 300_000 },
      "one",
    ),
  ).rejects.toThrow("session ended");
  expect((state as SessionState).unlock).toBeUndefined();
});
it("rejects clock rollback instead of extending a cached session", async () => {
  await remember();
  now--;
  expect(await broker.request({ action: "resume" }, "two")).toBeUndefined();
});
it("manual lock rotates the lease and prevents a pending password unlock from publishing", async () => {
  const epoch = await broker.request({ action: "begin" }, "one");
  await broker.request({ action: "lock" }, "two");
  await expect(
    broker.request(
      {
        action: "remember",
        epoch,
        binding: await envelopeBinding(envelope),
        key: base64(raw),
        timeout: 300_000,
      },
      "one",
    ),
  ).rejects.toThrow();
  expect((state as SessionState).unlock).toBeUndefined();
});
it("does not restore the cache against a changed encrypted vault", async () => {
  await remember();
  envelope = { ...envelope, revision: 1 };
  await expect(broker.request({ action: "resume" }, "two")).rejects.toThrow();
  expect((state as SessionState).unlock).toBeUndefined();
});
it("binds to the whole encrypted record, including same-revision tampering", async () => {
  await remember();
  envelope = {
    ...envelope,
    payload: { ...envelope.payload, iv: base64(random(12)) },
  };
  await expect(broker.request({ action: "resume" }, "two")).rejects.toThrow();
});
it("never offers corruption recovery through a remembered key", async () => {
  await remember();
  io.active = async () => undefined;
  await expect(broker.request({ action: "resume" }, "two")).rejects.toThrow();
  expect((state as SessionState).unlock).toBeUndefined();
});
it("ordinary saves move the binding to the next revision without changing the key", async () => {
  const cached = await remember(),
    previous = envelope;
  envelope = await seal(
    { ...envelope, revision: 1 },
    await importVaultKey(raw),
    emptyVault(),
  );
  const updated = (await broker.request(
    {
      action: "update",
      epoch: cached.epoch,
      previous: await envelopeBinding(previous),
      binding: await envelopeBinding(envelope),
    },
    "one",
  )) as CachedUnlock;
  expect(updated.key).toBe(cached.key);
  expect(updated.revision).toBe(1);
  expect(await broker.request({ action: "resume" }, "two")).toEqual(updated);
});
it("rejects a skipped revision update", async () => {
  const cached = await remember(),
    previous = envelope;
  envelope = { ...envelope, revision: 2 };
  await expect(
    broker.request(
      {
        action: "update",
        epoch: cached.epoch,
        previous: await envelopeBinding(previous),
        binding: await envelopeBinding(envelope),
      },
      "one",
    ),
  ).rejects.toThrow();
});
it("a stale alarm cannot clear a session whose deadline was extended by real activity", async () => {
  const cached = await remember();
  now += 100_000;
  const touched = (await broker.request(
    { action: "touch", epoch: cached.epoch, timeout: 300_000 },
    "one",
  )) as CachedUnlock;
  now = cached.expires;
  await broker.request({ action: "expire" }, "alarm");
  expect((state as SessionState).unlock).toEqual(touched);
  expect(alarm).toBe(touched.expires);
});
it("recreates the same deadline after worker restart, never a fresh five minutes", async () => {
  const cached = await remember();
  alarm = 0;
  now += 100_000;
  broker = new SessionBroker(io);
  await broker.request({ action: "expire" }, "worker");
  expect(alarm).toBe(cached.expires);
});
it("the explicit browser-session choice has no inactivity alarm", async () => {
  const cached = await remember(0);
  now += 86_400_000;
  expect(alarm).toBe(0);
  expect(await broker.request({ action: "resume" }, "two")).toEqual({
    ...cached,
    checkedAt: now,
  });
});
it("a browser restart with empty session storage cannot restore a key", async () => {
  await remember();
  state = undefined;
  broker = new SessionBroker(io);
  expect(await broker.request({ action: "resume" }, "two")).toBeUndefined();
});
it.each([
  null,
  {},
  { epoch: 1 },
  { epoch: "x", source: "one", unlock: { key: "bad" } },
])("fails closed for malformed session state %j", async (value) => {
  state = value;
  expect(await broker.request({ action: "resume" }, "two")).toBeUndefined();
  expect((state as SessionState).unlock).toBeUndefined();
});
it("does not return unlock material if session storage fails", async () => {
  await remember();
  io.read = async () => {
    throw new Error("unavailable");
  };
  await expect(broker.request({ action: "resume" }, "two")).rejects.toThrow(
    "unavailable",
  );
});
it("does not publish unlock material when the expiry alarm cannot be scheduled", async () => {
  const epoch = await broker.request({ action: "begin" }, "one");
  io.alarm = async () => {
    throw new Error("unavailable");
  };
  await expect(
    broker.request(
      {
        action: "remember",
        epoch,
        binding: await envelopeBinding(envelope),
        key: base64(raw),
        timeout: 300_000,
      },
      "one",
    ),
  ).rejects.toThrow();
  expect((state as SessionState).unlock).toBeUndefined();
});
const id = "abcdefghijklmnopabcdefghijklmnop";
const sender = {
  id,
  url: "chrome-extension://" + id + "/index.html?window",
  documentId: "doc",
  frameId: 0,
};
it("accepts only the extension's own top-level vault documents", () => {
  expect(trustedSessionSender(sender, id)).toBe(true);
  expect(trustedSessionSender({ ...sender, frameId: undefined }, id)).toBe(
    true,
  );
});
it.each([
  { id: "other" },
  { url: "https://example.test/index.html" },
  { url: "chrome-extension://" + id + "/other.html" },
  { url: "chrome-extension://other/index.html" },
  { url: "invalid" },
  { frameId: 1 },
  { documentId: undefined },
])(
  "rejects a sender outside the narrow vault-document boundary: %j",
  (value) => {
    expect(trustedSessionSender({ ...sender, ...value }, id)).toBe(false);
  },
);

it("keeps only the allowlisted enrollment fields, and clears drafts on lock", async () => {
  const cached = await remember();
  const draft = {
    mode: "add",
    fields: { issuer: "Example", secret: "JBSWY3DPEHPK3PXP" },
  };
  await broker.request(
    { action: "draft", epoch: cached.epoch, value: draft },
    "one",
  );
  expect(
    ((await broker.request({ action: "resume" }, "two")) as CachedUnlock).draft,
  ).toEqual(draft);
  await broker.request({ action: "lock" }, "two");
  expect(JSON.stringify(state)).not.toContain(draft.fields.secret);
});
it.each([
  { mode: "add", fields: { password: "never cache this" } },
  { mode: "import", fields: { sourcePassword: "never cache this" } },
  { mode: "add", fields: { secret: "x".repeat(4097) } },
  { mode: "import", fields: { payload: "x".repeat(64001) } },
  { mode: "other", fields: {} },
  { mode: "add", fields: {}, extra: "not allowed" },
])("rejects sensitive or unbounded draft fields: %j", async (value) => {
  const cached = await remember();
  await expect(
    broker.request({ action: "draft", epoch: cached.epoch, value }, "one"),
  ).rejects.toThrow();
  expect((state as SessionState).unlock).toBeUndefined();
});
it("does not extend the deadline when remembering an unfinished form", async () => {
  const cached = await remember();
  now += 100_000;
  await broker.request(
    {
      action: "draft",
      epoch: cached.epoch,
      value: { mode: "import", fields: { payload: "otpauth://totp/test" } },
    },
    "one",
  );
  expect((state as SessionState).unlock!.expires).toBe(cached.expires);
});
it("a delayed storage read cannot revive a session that expires while verifying", async () => {
  const cached = await remember(),
    active = io.active;
  io.active = async () => {
    const value = await active();
    now += 300_001;
    return value;
  };
  await expect(
    broker.request(
      { action: "verify", epoch: cached.epoch, binding: cached.binding },
      "one",
    ),
  ).rejects.toThrow();
});

it("a delayed old lease cannot revoke a newer password-authenticated session", async () => {
  const old = await remember();
  await broker.request({ action: "lock" }, "two");
  const latest = await remember();
  await expect(
    broker.request(
      { action: "touch", epoch: old.epoch, timeout: 300_000 },
      "one",
    ),
  ).rejects.toThrow();
  expect((state as SessionState).unlock).toEqual(latest);
  await broker.request({ action: "lock", epoch: old.epoch }, "one");
  expect((state as SessionState).unlock).toEqual(latest);
});
it("a stale view's binding cannot revoke the current valid cached revision", async () => {
  const old = await remember(),
    previous = envelope;
  envelope = { ...envelope, revision: 1 };
  await broker.request(
    {
      action: "update",
      epoch: old.epoch,
      previous: old.binding,
      binding: await envelopeBinding(envelope),
    },
    "one",
  );
  await expect(
    broker.request(
      {
        action: "verify",
        epoch: old.epoch,
        binding: await envelopeBinding(previous),
      },
      "two",
    ),
  ).rejects.toThrow();
  expect((state as SessionState).unlock?.revision).toBe(1);
});
