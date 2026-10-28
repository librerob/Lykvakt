import { unbase64, type Envelope } from "./crypto";
import { autoLockTimeout } from "./lock-policy";
import { extensionOrigin } from "./extension-origin";
import {
  envelopeBinding,
  validateDraft,
  type CachedUnlock,
  type SessionState,
} from "./session-cache";
export interface BrokerIO {
  read(): Promise<unknown>;
  write(state: SessionState): Promise<void>;
  active(): Promise<Envelope | undefined>;
  alarm(expires: number): Promise<void>;
  now(): number;
}
const failed = () => new Error("Your session ended. Unlock the vault again.");
export class SessionBroker {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly io: BrokerIO) {}
  request(message: unknown, source: string): Promise<unknown> {
    const work = this.queue.then(() => this.handle(message, source));
    this.queue = work.then(
      () => undefined,
      () => undefined,
    );
    return work;
  }
  private async clear(source: string): Promise<SessionState> {
    const state = { epoch: crypto.randomUUID(), source };
    await this.io.write(state);
    await this.io.alarm(0);
    return state;
  }
  private valid(value: unknown): value is SessionState {
    if (!value || typeof value !== "object") return false;
    const state = value as SessionState,
      u = state.unlock;
    if (typeof state.epoch !== "string" || typeof state.source !== "string")
      return false;
    if (!u) return true;
    try {
      const bytes = unbase64(u.key, 32);
      try {
        if (bytes.length !== 32) return false;
      } finally {
        bytes.fill(0);
      }
      if (u.draft) validateDraft(u.draft);
    } catch {
      return false;
    }
    return (
      u.epoch === state.epoch &&
      typeof u.key === "string" &&
      typeof u.binding === "string" &&
      typeof u.id === "string" &&
      Number.isSafeInteger(u.revision) &&
      u.revision >= 0 &&
      Number.isSafeInteger(u.timeout) &&
      autoLockTimeout(u.timeout) === u.timeout &&
      Number.isSafeInteger(u.touched) &&
      Number.isSafeInteger(u.expires) &&
      Number.isSafeInteger(u.checkedAt) &&
      u.checkedAt >= u.touched &&
      (u.timeout === 0 ? u.expires === 0 : u.expires === u.touched + u.timeout)
    );
  }
  private async state(source: string): Promise<SessionState> {
    const stored = await this.io.read();
    if (!this.valid(stored)) return this.clear(source);
    if (stored.unlock) {
      const now = this.io.now(),
        u = stored.unlock;
      if (now < u.checkedAt || (u.expires > 0 && now >= u.expires))
        return this.clear(source);
    }
    return stored;
  }
  private async binding(): Promise<{ envelope: Envelope; binding: string }> {
    const envelope = await this.io.active();
    if (!envelope) throw failed();
    return { envelope, binding: await envelopeBinding(envelope) };
  }
  private async require(
    state: SessionState,
    epoch?: unknown,
  ): Promise<CachedUnlock> {
    const u = state.unlock;
    if (!u || (epoch !== undefined && epoch !== state.epoch)) throw failed();
    const active = await this.binding();
    const now = this.io.now();
    if (
      active.binding !== u.binding ||
      now < u.checkedAt ||
      (u.expires > 0 && now >= u.expires)
    )
      throw failed();
    return { ...u, checkedAt: now };
  }
  private async handle(input: unknown, source: string): Promise<unknown> {
    if (!input || typeof input !== "object") throw failed();
    const m = input as Record<string, unknown>;
    if (m.action === "lock") {
      if (m.epoch !== undefined) {
        const current = await this.io.read();
        if (!this.valid(current) || current.epoch !== m.epoch) return undefined;
      }
      return this.clear(source);
    }
    const state = await this.state(source);
    if (m.action === "begin") return state.epoch;
    if (m.action === "expire") {
      if (state.unlock) await this.io.alarm(state.unlock.expires);
      return undefined;
    }
    if (m.action !== "resume" && m.epoch !== state.epoch) throw failed();
    if (
      m.action === "verify" &&
      state.unlock &&
      m.binding !== state.unlock.binding
    )
      throw failed();
    try {
      if (m.action === "resume") {
        if (!state.unlock) return undefined;
        return await this.require(state);
      }
      if (m.action === "remember") {
        const active = await this.binding();
        if (
          active.binding !== m.binding ||
          typeof m.key !== "string" ||
          typeof m.timeout !== "number" ||
          autoLockTimeout(m.timeout) !== m.timeout
        )
          throw failed();
        const raw = unbase64(m.key, 32);
        try {
          if (raw.length !== 32) throw failed();
        } finally {
          raw.fill(0);
        }
        const now = this.io.now();
        const unlock: CachedUnlock = {
          epoch: state.epoch,
          key: m.key,
          binding: active.binding,
          id: active.envelope.id,
          revision: active.envelope.revision,
          timeout: m.timeout,
          touched: now,
          checkedAt: now,
          expires: m.timeout ? now + m.timeout : 0,
        };
        await this.io.alarm(unlock.expires);
        await this.io.write({ ...state, source, unlock });
        return unlock;
      }
      if (m.action === "update") {
        const u = state.unlock,
          active = await this.binding();
        if (
          !u ||
          u.binding !== m.previous ||
          active.binding !== m.binding ||
          active.envelope.id !== u.id ||
          active.envelope.revision !== u.revision + 1
        )
          throw failed();
        const now = this.io.now();
        if (now < u.touched || (u.expires && now >= u.expires)) throw failed();
        const unlock = {
          ...u,
          binding: active.binding,
          revision: active.envelope.revision,
          checkedAt: now,
        };
        delete unlock.draft;
        await this.io.write({ ...state, source, unlock });
        return unlock;
      }
      const u =
        m.action === "touch" || m.action === "draft"
          ? state.unlock
          : await this.require(state, m.epoch);
      if (!u) throw failed();
      if (m.action === "draft") {
        const unlock = { ...u, checkedAt: this.io.now() };
        if (m.value === undefined) delete unlock.draft;
        else unlock.draft = validateDraft(m.value);
        await this.io.write({ ...state, source, unlock });
        return undefined;
      }
      if (m.action === "verify") {
        if (m.binding !== u.binding) throw failed();
        return u;
      }
      if (m.action === "touch") {
        if (
          typeof m.timeout !== "number" ||
          autoLockTimeout(m.timeout) !== m.timeout
        )
          throw failed();
        const now = this.io.now();
        if (now < u.touched || (u.expires > 0 && now >= u.expires))
          throw failed();
        const unlock = {
          ...u,
          timeout: m.timeout,
          touched: now,
          checkedAt: now,
          expires: m.timeout ? now + m.timeout : 0,
        };
        await this.io.alarm(unlock.expires);
        await this.io.write({ ...state, source, unlock });
        return unlock;
      }
      throw failed();
    } catch (error) {
      // An invalid lease must never revive a session, even after worker restart.
      await this.clear(source);
      throw error;
    }
  }
}
export function trustedSessionSender(
  sender: chrome.runtime.MessageSender,
  id: string,
  root = "chrome-extension://" + id + "/",
): boolean {
  if (
    sender.id !== id ||
    !sender.documentId ||
    (sender.frameId !== undefined && sender.frameId !== 0)
  )
    return false;
  try {
    const u = new URL(sender.url ?? "");
    const origin = extensionOrigin(root);
    return (
      !!origin &&
      u.protocol + "//" + u.host === origin &&
      !u.username &&
      !u.password &&
      u.pathname === "/index.html"
    );
  } catch {
    return false;
  }
}
