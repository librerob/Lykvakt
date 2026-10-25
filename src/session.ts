import {
  DEFAULT_ITERATIONS,
  createEnvelope,
  decryptEnvelope,
  headerOf,
  seal,
  type Envelope,
  type Header,
} from "./crypto";
import { emptyVault, validateData, type VaultData } from "./model";
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
  timeout = 5 * 60_000;
  onlock = () => {};
  get unlocked(): boolean {
    return !!this.key;
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
  async setup(password: string, data = emptyVault()): Promise<void> {
    const epoch = this.generation,
      signal = this.cancellation.signal;
    const result = await createEnvelope(password, data);
    if (epoch !== this.generation)
      throw new Error("Setup was cancelled by locking.");
    await storage.commit(result.envelope, undefined, signal);
    if (epoch !== this.generation) return;
    this.key = result.key;
    this.data = data;
    this.envelope = result.envelope;
    this.touch();
  }
  async unlock(
    password: string,
    defaultIterations = DEFAULT_ITERATIONS,
    confirmedRecovery?: storage.RecoveryOffer,
  ): Promise<void> {
    const epoch = this.generation,
      signal = this.cancellation.signal;
    const loaded = await storage.load();
    if (epoch !== this.generation) throw new Error("Unlock cancelled.");
    if (!loaded) throw new Error("No vault exists.");
    const recovery = storage.isRecoveryOffer(loaded) ? loaded : undefined;
    if (recovery && !confirmedRecovery)
      throw new storage.RecoveryRequired(recovery);
    if (
      confirmedRecovery &&
      (!recovery ||
        !storage.sameActive(recovery.active, confirmedRecovery.active) ||
        !storage.sameActive(recovery.previous, confirmedRecovery.previous))
    )
      throw new Error("Vault changed. Review the recovery offer again.");
    const saved = recovery ? recovery.previous : (loaded as Envelope);
    const result = await decryptEnvelope(
      saved,
      password,
      "vault",
      recovery ? undefined : defaultIterations,
    );
    if (epoch !== this.generation) throw new Error("Unlock cancelled.");
    if (result.envelope.revision !== saved.revision) {
      try {
        await storage.commit(result.envelope, saved, signal);
      } catch (error) {
        if (!saved.passkeys.length) throw error;
        result.envelope = saved;
      }
    }
    if (epoch !== this.generation) throw new Error("Unlock cancelled.");
    this.recovery = recovery;
    this.key = result.key;
    this.data = result.data;
    this.envelope = result.envelope;
    this.touch();
  }
  epoch(): number {
    return this.generation;
  }
  async save(
    data: VaultData,
    changeHeader?: (h: Header) => Header,
    nextKey?: CryptoKey,
  ): Promise<void> {
    this.check();
    if (this.writing) throw new Error("A save is already in progress.");
    this.writing = true;
    const epoch = this.generation,
      signal = this.cancellation.signal,
      previous = this.envelope!;
    try {
      const active = this.recovery?.active as Partial<Envelope> | undefined;
      const activeRevision =
        Number.isSafeInteger(active?.revision) && active!.revision! >= 0
          ? active!.revision!
          : 0;
      const header = {
        ...headerOf(previous),
        revision: Math.max(previous.revision, activeRevision) + 1,
        passkeys: [],
      };
      const validated = validateData(data);
      const next = await seal(
        changeHeader ? changeHeader(header) : header,
        nextKey ?? this.key!,
        validated,
      );
      this.check();
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
    } finally {
      this.writing = false;
    }
  }
}
