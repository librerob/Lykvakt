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
  ): Promise<void> {
    const epoch = this.generation,
      signal = this.cancellation.signal;
    const saved = await storage.load();
    if (epoch !== this.generation) throw new Error("Unlock cancelled.");
    if (!saved) throw new Error("No vault exists.");
    const result = await decryptEnvelope(
      saved,
      password,
      "vault",
      defaultIterations,
    );
    if (epoch !== this.generation) throw new Error("Unlock cancelled.");
    if (result.envelope.revision !== saved.revision)
      await storage.commit(result.envelope, saved, signal);
    if (epoch !== this.generation) throw new Error("Unlock cancelled.");
    this.key = result.key;
    this.data = result.data;
    this.envelope = result.envelope;
    this.touch();
  }
  async unlockWith(
    key: CryptoKey,
    envelope: Envelope,
    data: VaultData,
    epoch: number,
  ): Promise<void> {
    if (epoch !== this.generation) throw new Error("Unlock cancelled.");
    this.key = key;
    this.envelope = envelope;
    this.data = data;
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
      const header = { ...headerOf(previous), revision: previous.revision + 1 };
      const validated = validateData(data);
      const next = await seal(
        changeHeader ? changeHeader(header) : header,
        nextKey ?? this.key!,
        validated,
      );
      this.check();
      if (epoch !== this.generation)
        throw new Error("Save cancelled by locking.");
      await storage.commit(next, previous, signal);
      if (epoch !== this.generation)
        throw new Error("Save cancelled by locking.");
      this.key = nextKey ?? this.key;
      this.envelope = next;
      this.data = validated;
    } finally {
      this.writing = false;
    }
  }
}
