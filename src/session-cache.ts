import { base64, canonical, type Envelope } from "./crypto";
export interface EnrollmentDraft {
  mode: "add" | "import";
  fields: Record<string, string>;
}
export function validateDraft(value: unknown): EnrollmentDraft {
  if (!value || typeof value !== "object") throw new Error("Invalid draft.");
  const d = value as EnrollmentDraft;
  const allowed =
    d.mode === "add"
      ? [
          "issuer",
          "label",
          "secret",
          "type",
          "algorithm",
          "digits",
          "period",
          "counter",
          "group",
        ]
      : d.mode === "import"
        ? ["payload"]
        : [];
  if (
    Object.keys(d).sort().join() !== "fields,mode" ||
    !allowed.length ||
    !d.fields ||
    typeof d.fields !== "object" ||
    Array.isArray(d.fields)
  )
    throw new Error("Invalid draft.");
  for (const [name, text] of Object.entries(d.fields))
    if (
      !allowed.includes(name) ||
      typeof text !== "string" ||
      text.length > (name === "payload" ? 64_000 : 4096)
    )
      throw new Error("Invalid draft.");
  if (
    d.mode === "import" &&
    !(d.fields.payload ?? "").split(/[\r\n]/).every((line) => {
      const text = line.trim();
      return (
        !text ||
        text.startsWith("otpauth:") ||
        text.startsWith("otpauth-migration:")
      );
    })
  )
    throw new Error("Only OTP setup links can be remembered.");
  return structuredClone(d);
}
export interface CachedUnlock {
  epoch: string;
  key: string;
  binding: string;
  id: string;
  revision: number;
  timeout: number;
  expires: number;
  touched: number;
  checkedAt: number;
  draft?: EnrollmentDraft;
}
export type SessionLease = Omit<CachedUnlock, "key">;
export interface SessionState {
  epoch: string;
  source: string;
  unlock?: CachedUnlock;
}
export interface SessionCache {
  onstate: (state: SessionState) => void;
  begin(): Promise<string>;
  remember(
    epoch: string,
    envelope: Envelope,
    raw: Uint8Array,
    timeout: number,
  ): Promise<CachedUnlock>;
  resume(): Promise<CachedUnlock | undefined>;
  verify(epoch: string, envelope: Envelope): Promise<CachedUnlock>;
  update(
    epoch: string,
    previous: Envelope,
    next: Envelope,
  ): Promise<CachedUnlock>;
  touch(epoch: string, timeout: number): Promise<CachedUnlock>;
  draft(epoch: string, value?: EnrollmentDraft): Promise<void>;
  clear(epoch?: string): Promise<void>;
  expire(): Promise<void>;
}
export async function envelopeBinding(envelope: Envelope): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(envelope));
  return base64(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}
export const SESSION_KEY = "unlockSession";
export const SESSION_ALARM = "vault-expiry";
export const SESSION_MESSAGE = "lykvakt-session";
