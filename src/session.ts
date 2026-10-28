import {
  createEnvelope,
  decryptEnvelope,
  headerOf,
  importVaultKey,
  open,
  seal,
  unbase64,
  type Envelope,
  type Header,
} from "./crypto";
import { emptyVault, validateData, type VaultData } from "./model";
import { OldFormatError } from "./format";
import * as storage from "./storage";
import type {
  CachedUnlock,
  EnrollmentDraft,
  SessionCache,
} from "./session-cache";

export class Session {
  private key?: CryptoKey;
  private envelope?: Envelope;
  private data?: VaultData;
  private recovery?: storage.RecoveryOffer;
  private generation = 0;
  private cancellation = new AbortController();
  private writing = false;
  private lastActivity = 0;
  private lastActivityWall = 0;
  private shared?: Omit<CachedUnlock, "key">;
  private lease?: string;
  private sharedDeadline = 0;
  private sharedWallDeadline = 0;
  private touching = false;
  private lastSharedTouch = 0;
  timeout = 0;
  onlock = () => {};
  constructor(private readonly cache?: SessionCache) {
    if (cache)
      cache.onstate = (state) => {
        if (!this.lease) return;
        const u = state.unlock;
        if (
          state.epoch !== this.lease ||
          !u ||
          (this.envelope &&
            (u.id !== this.envelope.id ||
              u.revision !== this.envelope.revision))
        )
          this.detach();
        else if (this.key) this.accept(u);
      };
  }
  private accept(value: CachedUnlock): void {
    const remaining = value.expires
      ? Math.max(0, value.expires - value.checkedAt)
      : 0;
    const sameDeadline = this.shared?.expires === value.expires;
    const mono = remaining ? performance.now() + remaining : 0;
    const wall = remaining ? Date.now() + remaining : 0;
    this.sharedDeadline =
      sameDeadline && this.sharedDeadline
        ? Math.min(this.sharedDeadline, mono)
        : mono;
    this.sharedWallDeadline =
      sameDeadline && this.sharedWallDeadline
        ? Math.min(this.sharedWallDeadline, wall)
        : wall;
    const { key: _key, ...metadata } = value;
    this.shared = metadata;
    this.lease = value.epoch;
    this.timeout = value.timeout;
  }
  draft(): EnrollmentDraft | undefined {
    return this.shared?.draft ? structuredClone(this.shared.draft) : undefined;
  }
  rememberDraft(value?: EnrollmentDraft): void {
    if (!this.cache || !this.lease || !this.key) return;
    if (this.shared) this.shared.draft = value;
    const epoch = this.generation;
    void this.cache.draft(this.lease, value).catch(() => {
      if (epoch === this.generation) this.detach();
    });
  }
  async setTimeout(value: number): Promise<void> {
    this.check();
    const epoch = this.generation;
    if (this.cache && this.lease) {
      const updated = await this.cache.touch(this.lease, value);
      if (epoch !== this.generation) return;
      this.accept(updated);
    }
    this.timeout = value;
  }
  get unlocked(): boolean {
    return !!this.key;
  }
  epoch(): number {
    return this.generation;
  }
  cancellationSignal(): AbortSignal {
    return this.cancellation.signal;
  }
  touch(): void {
    if (!this.key) return;
    this.lastActivity = performance.now();
    this.lastActivityWall = Date.now();
    if (
      this.cache &&
      this.lease &&
      !this.touching &&
      Date.now() - this.lastSharedTouch >= 1000
    ) {
      this.touching = true;
      const epoch = this.generation;
      this.lastSharedTouch = Date.now();
      void this.cache
        .touch(this.lease, this.timeout)
        .then((value) => {
          if (epoch === this.generation) this.accept(value);
        })
        .catch(() => {
          if (epoch === this.generation) this.detach();
        })
        .finally(() => {
          this.touching = false;
        });
    }
  }
  check(): void {
    const expired = this.shared
      ? this.shared.expires > 0 &&
        (Date.now() >= this.sharedWallDeadline ||
          performance.now() >= this.sharedDeadline)
      : this.timeout > 0 &&
        (performance.now() - this.lastActivity >= this.timeout ||
          Date.now() - this.lastActivityWall >= this.timeout);
    if (this.key && expired) {
      this.detach();
      void this.cache?.expire().catch(() => {});
    }
    if (!this.key || !this.data || !this.envelope)
      throw new Error("Unlock the vault to continue.");
  }
  async validate(): Promise<void> {
    this.check();
    if (this.cache && this.lease) {
      const epoch = this.generation;
      try {
        const value = await this.cache.verify(this.lease, this.envelope!);
        if (epoch !== this.generation) throw new Error("Unlock cancelled.");
        this.accept(value);
        this.check();
      } catch (error) {
        if (epoch === this.generation) this.detach();
        throw error;
      }
    }
  }
  // Closing a view drops its local references without revoking the shared timer.
  detach(): void {
    this.generation++;
    this.cancellation.abort();
    this.cancellation = new AbortController();
    this.key = undefined;
    this.data = undefined;
    this.envelope = undefined;
    this.recovery = undefined;
    this.shared = undefined;
    this.lease = undefined;
    this.onlock();
  }
  lock(): void {
    this.detach();
    void this.cache?.clear().catch(() => {});
  }
  accounts(): VaultData {
    this.check();
    return structuredClone(this.data!);
  }
  current(): Envelope {
    this.check();
    return structuredClone(this.envelope!);
  }
  async resume(): Promise<boolean> {
    if (!this.cache) return false;
    const epoch = this.generation;
    let raw: Uint8Array<ArrayBuffer> | undefined;
    try {
      const saved = await storage.load();
      if (!saved || storage.isOldVault(saved) || storage.isRecoveryOffer(saved))
        return false;
      const cached = await this.cache.resume();
      if (!cached) return false;
      if (epoch !== this.generation) throw new Error("Unlock cancelled.");
      this.lease = cached.epoch;
      raw = unbase64(cached.key, 32);
      if (raw.length !== 32) throw new Error("Invalid session key.");
      const key = await importVaultKey(raw),
        data = await open(saved, key);
      const value = await this.cache.verify(cached.epoch, saved);
      if (epoch !== this.generation) throw new Error("Unlock cancelled.");
      this.key = key;
      this.data = data;
      this.envelope = saved;
      this.accept(value);
      this.check();
      return true;
    } catch {
      if (epoch !== this.generation) return false;
      const lease = this.lease;
      this.detach();
      if (lease) await this.cache.clear(lease).catch(() => {});
      return false;
    } finally {
      raw?.fill(0);
    }
  }
  async setup(
    password: string,
    data = emptyVault(),
    operation?: AbortSignal,
  ): Promise<void> {
    const epoch = this.generation,
      signal = operation
        ? AbortSignal.any([this.cancellation.signal, operation])
        : this.cancellation.signal;
    let raw: Uint8Array<ArrayBuffer> | undefined;
    try {
      signal.throwIfAborted();
      if (this.cache) this.lease = await this.cache.begin();
      const result = await createEnvelope(
        password,
        data,
        "vault",
        signal,
        this.cache
          ? (bytes) => {
              raw = bytes.slice();
            }
          : undefined,
      );
      signal.throwIfAborted();
      if (epoch !== this.generation)
        throw new Error("Setup cancelled by locking.");
      await storage.commit(result.envelope, undefined, signal);
      if (epoch !== this.generation) return;
      if (operation?.aborted) {
        this.lock();
        return;
      }
      if (this.cache && raw && this.lease) {
        const value = await this.cache.remember(
          this.lease,
          result.envelope,
          raw,
          this.timeout,
        );
        signal.throwIfAborted();
        if (epoch !== this.generation)
          throw new Error("Setup cancelled by locking.");
        this.accept(value);
      }
      this.key = result.key;
      this.data = data;
      this.envelope = result.envelope;
      this.lastActivity = performance.now();
      this.lastActivityWall = Date.now();
    } finally {
      raw?.fill(0);
    }
  }
  async unlock(
    password: string,
    confirmedRecovery?: storage.RecoveryOffer,
  ): Promise<void> {
    const epoch = this.generation,
      signal = this.cancellation.signal;
    let raw: Uint8Array<ArrayBuffer> | undefined;
    try {
      if (this.cache) this.lease = await this.cache.begin();
      const loaded = await storage.load();
      if (epoch !== this.generation) throw new Error("Unlock cancelled.");
      if (!loaded) throw new Error("No vault exists.");
      if (storage.isOldVault(loaded)) throw new OldFormatError();
      const recovery = storage.isRecoveryOffer(loaded) ? loaded : undefined;
      if (recovery && !confirmedRecovery)
        throw new storage.RecoveryRequired(recovery);
      if (
        confirmedRecovery &&
        (!recovery ||
          !storage.sameActive(recovery.active, confirmedRecovery.active) ||
          !storage.sameActive(recovery.previous, confirmedRecovery.previous))
      )
        throw new storage.StorageConflictError();
      const saved = recovery ? recovery.previous : (loaded as Envelope);
      const result = await decryptEnvelope(
        saved,
        password,
        "vault",
        signal,
        this.cache
          ? (bytes) => {
              raw = bytes.slice();
            }
          : undefined,
      );
      if (epoch !== this.generation) throw new Error("Unlock cancelled.");
      const latest = await storage.load();
      if (epoch !== this.generation) throw new Error("Unlock cancelled.");
      const unchanged = recovery
        ? latest &&
          storage.isRecoveryOffer(latest) &&
          storage.sameActive(latest.active, recovery.active) &&
          storage.sameActive(latest.previous, recovery.previous)
        : latest &&
          !storage.isRecoveryOffer(latest) &&
          !storage.isOldVault(latest) &&
          storage.sameActive(latest, saved);
      if (!unchanged) {
        this.lock();
        throw new Error("Your vault changed in another window. Unlock again.", {
          cause: new storage.StorageConflictError(),
        });
      }
      if (this.cache && !recovery && raw && this.lease) {
        const value = await this.cache.remember(
          this.lease,
          saved,
          raw,
          this.timeout,
        );
        if (epoch !== this.generation) throw new Error("Unlock cancelled.");
        this.accept(value);
      } else if (this.cache) {
        await this.cache.clear();
        this.lease = undefined;
      }
      this.recovery = recovery;
      this.key = result.key;
      this.data = result.data;
      this.envelope = result.envelope;
      this.lastActivity = performance.now();
      this.lastActivityWall = Date.now();
    } finally {
      raw?.fill(0);
    }
  }
  async save(
    data: VaultData,
    changeHeader?: (h: Header) => Header,
    nextKey?: CryptoKey,
    operation?: AbortSignal,
  ): Promise<void> {
    this.check();
    operation?.throwIfAborted();
    if (this.writing) throw new Error("A save is already in progress.");
    this.writing = true;
    const epoch = this.generation,
      signal = operation
        ? AbortSignal.any([this.cancellation.signal, operation])
        : this.cancellation.signal,
      previous = this.envelope!;
    let saved = false;
    try {
      await this.validate();
      const active = this.recovery?.active as Partial<Envelope> | undefined;
      const activeRevision =
        Number.isSafeInteger(active?.revision) &&
        active!.revision! >= 0 &&
        active!.revision! < Number.MAX_SAFE_INTEGER - 2
          ? active!.revision!
          : 0;
      const header = {
        ...headerOf(previous),
        revision: Math.max(previous.revision, activeRevision) + 1,
      };
      const validated = validateData(data);
      const next = await seal(
        changeHeader ? changeHeader(header) : header,
        nextKey ?? this.key!,
        validated,
      );
      await this.validate();
      signal.throwIfAborted();
      if (epoch !== this.generation)
        throw new Error("Save cancelled by locking.");
      if (nextKey && nextKey !== this.key && this.cache) {
        await this.cache.clear();
        this.lease = undefined;
        this.shared = undefined;
      }
      await storage.commit(
        next,
        this.recovery ?? previous,
        signal,
        nextKey !== undefined && nextKey !== this.key,
      );
      saved = true;
      if (epoch !== this.generation)
        throw new Error("Save cancelled by locking.");
      this.key = nextKey ?? this.key;
      this.recovery = undefined;
      this.envelope = next;
      this.data = validated;
      if (this.cache && this.lease) {
        try {
          const value = await this.cache.update(this.lease, previous, next);
          if (epoch !== this.generation)
            throw new Error("Save cancelled by locking.");
          this.accept(value);
        } catch (error) {
          const lease = this.lease;
          this.detach();
          if (lease) await this.cache.clear(lease);
          throw new Error("Your vault was saved. Unlock again to continue.", {
            cause: error,
          });
        }
      }
    } catch (error) {
      if (epoch !== this.generation || this.cancellation.signal.aborted)
        throw new Error(
          saved
            ? "Your vault was saved. Unlock again to continue."
            : "Save cancelled by locking.",
          { cause: error },
        );
      operation?.throwIfAborted();
      throw error;
    } finally {
      this.writing = false;
    }
  }
}
