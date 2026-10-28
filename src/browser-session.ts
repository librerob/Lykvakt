import { base64, type Envelope } from "./crypto";
import {
  envelopeBinding,
  SESSION_KEY,
  SESSION_MESSAGE,
  type CachedUnlock,
  type EnrollmentDraft,
  type SessionCache,
  type SessionState,
} from "./session-cache";
export class BrowserSession implements SessionCache {
  onstate = (_state: SessionState) => {};
  private source?: string;
  private pending: Promise<unknown> = Promise.resolve();
  constructor() {
    chrome.storage.onChanged.addListener((changes, area) => {
      const state = changes[SESSION_KEY]?.newValue as SessionState | undefined;
      if (
        area === "session" &&
        Object.hasOwn(changes, SESSION_KEY) &&
        (!state || state.source !== this.source)
      )
        this.onstate(state ?? { epoch: "", source: "storage" });
    });
  }
  private request(action: string, values = {}): Promise<unknown> {
    const send = async () => {
      const response = await chrome.runtime.sendMessage({
        type: SESSION_MESSAGE,
        action,
        ...values,
      });
      if (!response?.ok)
        throw new Error("Your session ended. Unlock the vault again.");
      this.source = response.source;
      return response.value;
    };
    // Dispatch revocation and the latest form snapshot before a popup can close.
    const work =
      action === "lock" || action === "draft"
        ? send()
        : this.pending.then(send);
    this.pending = work.then(
      () => undefined,
      () => undefined,
    );
    return work;
  }
  async begin(): Promise<string> {
    return (await this.request("begin")) as string;
  }
  async remember(
    epoch: string,
    envelope: Envelope,
    raw: Uint8Array,
    timeout: number,
  ): Promise<CachedUnlock> {
    return (await this.request("remember", {
      epoch,
      binding: await envelopeBinding(envelope),
      key: base64(raw),
      timeout,
    })) as CachedUnlock;
  }
  async resume(): Promise<CachedUnlock | undefined> {
    return (await this.request("resume")) as CachedUnlock | undefined;
  }
  async verify(epoch: string, envelope: Envelope): Promise<CachedUnlock> {
    return (await this.request("verify", {
      epoch,
      binding: await envelopeBinding(envelope),
    })) as CachedUnlock;
  }
  async update(
    epoch: string,
    previous: Envelope,
    next: Envelope,
  ): Promise<CachedUnlock> {
    return (await this.request("update", {
      epoch,
      previous: await envelopeBinding(previous),
      binding: await envelopeBinding(next),
    })) as CachedUnlock;
  }
  async touch(epoch: string, timeout: number): Promise<CachedUnlock> {
    return (await this.request("touch", { epoch, timeout })) as CachedUnlock;
  }
  async draft(epoch: string, value?: EnrollmentDraft): Promise<void> {
    await this.request("draft", { epoch, value });
  }
  async expire(): Promise<void> {
    await this.request("expire");
  }
  async clear(epoch?: string): Promise<void> {
    try {
      await this.request("lock", { epoch });
    } catch {
      // Reload clears storage.session if Chrome cannot confirm revocation.
      chrome.runtime.reload();
      throw new Error("Lykvakt restarted to finish locking.");
    }
  }
}
