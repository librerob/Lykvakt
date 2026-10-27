import {
  createEnvelope,
  decryptEnvelope,
  headerOf,
  seal,
  type Envelope,
  type Header,
} from "./crypto";
import { emptyVault, validateData, type VaultData } from "./model";
import { OldFormatError } from "./format";
import * as storage from "./storage";

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
  timeout = 0;
  onlock = () => {};
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
    if (this.key) {
      this.lastActivity = performance.now();
      this.lastActivityWall = Date.now();
    }
  }
  check(): void {
    if (
      this.key &&
      this.timeout > 0 &&
      (performance.now() - this.lastActivity >= this.timeout ||
        Date.now() - this.lastActivityWall >= this.timeout)
    )
      this.lock();
    if (!this.key || !this.data || !this.envelope)
      throw new Error("Unlock the vault to continue.");
  }
  lock(): void {
    this.generation++;
    this.cancellation.abort();
    this.cancellation = new AbortController();
    this.key = undefined;
    this.data = undefined;
    this.envelope = undefined;
    this.recovery = undefined;
    this.onlock();
  }
  accounts(): VaultData {
    this.check();
    return structuredClone(this.data!);
  }
  current(): Envelope {
    this.check();
    return structuredClone(this.envelope!);
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
    signal.throwIfAborted();
    const result = await createEnvelope(password, data, "vault", signal);
    signal.throwIfAborted();
    if (epoch !== this.generation)
      throw new Error("Setup cancelled by locking.");
    await storage.commit(result.envelope, undefined, signal);
    if (epoch !== this.generation) return;
    if (operation?.aborted) {
      this.lock();
      return;
    }
    this.key = result.key;
    this.data = data;
    this.envelope = result.envelope;
    this.touch();
  }
  async unlock(
    password: string,
    confirmedRecovery?: storage.RecoveryOffer,
  ): Promise<void> {
    const epoch = this.generation,
      signal = this.cancellation.signal;
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
    const result = await decryptEnvelope(saved, password, "vault", signal);
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
    this.recovery = recovery;
    this.key = result.key;
    this.data = result.data;
    this.envelope = result.envelope;
    this.touch();
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
    try {
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
      this.check();
      signal.throwIfAborted();
      if (epoch !== this.generation)
        throw new Error("Save cancelled by locking.");
      await storage.commit(
        next,
        this.recovery ?? previous,
        signal,
        nextKey !== undefined && nextKey !== this.key,
      );
      if (epoch !== this.generation)
        throw new Error("Save cancelled by locking.");
      this.key = nextKey ?? this.key;
      this.recovery = undefined;
      this.envelope = next;
      this.data = validated;
    } catch (error) {
      if (epoch !== this.generation || this.cancellation.signal.aborted)
        throw new Error("Save cancelled by locking.", { cause: error });
      operation?.throwIfAborted();
      throw error;
    } finally {
      this.writing = false;
    }
  }
}
