import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Session, VaultCreatedError } from "../src/session";
import type { SessionCache } from "../src/session-cache";
import * as storage from "../src/storage";
import * as imports from "../src/import";
import { emptyVault } from "../src/model";
import { friendlyError } from "../src/help";
import { createWelcome } from "../src/ui/welcome";
import { createRecovery } from "../src/ui/recovery";
import { context, resetUI, send, set, ui } from "./helpers/ui";
vi.mock("../src/dom", async () => ({
  ...(await import("./helpers/ui")),
  readText: async () => "{}",
}));
beforeEach(() => {
  resetUI();
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const password = "synthetic durable setup password";
it("post-commit session failure preserves the vault, revokes the lease and wipes raw key bytes", async () => {
  let captured: Uint8Array | undefined;
  const clear = vi.fn(async () => {});
  const cache = {
    onstate: () => {},
    begin: async () => "lease",
    clear,
    remember: async (_lease: string, _envelope: unknown, raw: Uint8Array) => {
      captured = raw;
      throw new Error("temporary session write failure");
    },
  } as unknown as SessionCache;
  const session = new Session(cache);
  await expect(session.setup(password)).rejects.toBeInstanceOf(
    VaultCreatedError,
  );
  const saved = await storage.load();
  expect(saved).toHaveProperty("format", "otp-vault");
  expect(session.unlocked).toBe(false);
  expect(() => session.accounts()).toThrow("Unlock");
  expect(clear).toHaveBeenCalledWith("lease");
  expect(captured!.every((value) => value === 0)).toBe(true);
  const reopened = new Session();
  await reopened.unlock(password);
  expect(reopened.unlocked).toBe(true);
  expect(reopened.current()).toEqual(saved);
  expect(await storage.load()).toEqual(saved);
}, 60_000);
it("a failed durable commit is not reported as a created vault", async () => {
  vi.spyOn(storage, "commit").mockRejectedValueOnce(new Error("disk failure"));
  const session = new Session();
  await expect(session.setup(password)).rejects.toThrow("disk failure");
  expect(await storage.load()).toBeUndefined();
  expect(session.unlocked).toBe(false);
}, 60_000);
it("Lock during session publication still prevents setup from unlocking", async () => {
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cache = {
    onstate: () => {},
    begin: async () => "lease",
    clear: async () => {},
    remember: async () => {
      entered();
      await held;
      throw new Error("late session failure");
    },
  } as unknown as SessionCache;
  const session = new Session(cache);
  const setup = session.setup(password);
  const rejected = expect(setup).rejects.toBeInstanceOf(VaultCreatedError);
  await started;
  session.lock();
  release();
  await rejected;
  expect(session.unlocked).toBe(false);
  expect(await storage.load()).toHaveProperty("format", "otp-vault");
}, 60_000);
it.each(["setup", "restore"])(
  "%s switches to an existing-vault screen after a durable creation error",
  async (mode) => {
    const failure = new VaultCreatedError(
      new Error("temporary session failure"),
    );
    const session = {
      unlocked: false,
      setup: vi.fn().mockRejectedValue(failure),
      epoch: () => 0,
      cancellationSignal: () => new AbortController().signal,
    } as unknown as Session;
    const ctx = context(session);
    ctx.state.exists = false;
    ctx.render = vi.fn();
    if (mode === "setup") {
      createWelcome(ctx, () => {}).locked();
      set("password", password);
      set("confirmation", password);
      await expect(send()).rejects.toBe(failure);
    } else {
      vi.spyOn(imports, "verifyBackup").mockResolvedValueOnce({
        data: emptyVault(),
        count: 0,
        matches: null,
        fingerprint: "synthetic",
      });
      createRecovery(ctx, async () => {}).recoverySetup();
      Object.assign(ui.fields.get("file")!, { files: [{}] });
      set("password", password);
      set("confirm", password);
      set("backup", "synthetic backup password");
      await send();
      expect(ui.dialog).toBeUndefined();
      expect(ui.messages).toContain(failure.message);
    }
    expect(ctx.state.exists).toBe(true);
    expect(ctx.render).toHaveBeenCalled();
    expect(friendlyError(failure).message).toBe(failure.message);
    expect(ui.fields.get("password")!.value).toBe("");
  },
);
