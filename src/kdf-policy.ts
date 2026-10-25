export interface Argon2Policy {
  kdf: "Argon2id";
  m: number;
  t: number;
  p: 1;
}
export const DEFAULT_KDF: Readonly<Argon2Policy> = Object.freeze({
  kdf: "Argon2id",
  m: 65_536,
  t: 3,
  p: 1,
});
export function validateArgon2(policy: Argon2Policy): Argon2Policy {
  if (
    !policy ||
    policy.kdf !== "Argon2id" ||
    policy.p !== 1 ||
    !Number.isSafeInteger(policy.m) ||
    policy.m < 19_456 ||
    policy.m > 262_144 ||
    !Number.isSafeInteger(policy.t) ||
    policy.t < 2 ||
    policy.t > 10
  )
    throw new Error("Unsupported password-protection settings.");
  return { kdf: "Argon2id", m: policy.m, t: policy.t, p: 1 };
}
