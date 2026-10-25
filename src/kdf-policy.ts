export const MIN_ITERATIONS = 600_000;
export const DEFAULT_ITERATIONS = 2_000_000;
export const MAX_ITERATIONS = 5_000_000;
export const MIN_MEMORY_KIB = 19_456;
export const MAX_MEMORY_KIB = 262_144;
export interface PBKDF2Policy {
  kdf: "PBKDF2-SHA256";
  iterations: number;
}
export interface Argon2Policy {
  kdf: "Argon2id";
  m: number;
  t: number;
  p: 1;
}
export type KDFPolicy = PBKDF2Policy | Argon2Policy;
export const DEFAULT_KDF: Readonly<Argon2Policy> = Object.freeze({
  kdf: "Argon2id",
  m: 65_536,
  t: 3,
  p: 1,
});
export const EXTRA_KDF: Readonly<Argon2Policy> = Object.freeze({
  kdf: "Argon2id",
  m: 131_072,
  t: 3,
  p: 1,
});
function bounded(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error(
      "These password-protection settings are not supported. Try a compatible backup.",
    );
  return value;
}
export function validateArgon2(
  policy: Argon2Policy,
  calibration = false,
): Argon2Policy {
  if (!policy || policy.kdf !== "Argon2id" || policy.p !== 1)
    throw new Error(
      "These password-protection settings are not supported. Try a compatible backup.",
    );
  return {
    kdf: "Argon2id",
    m: bounded(policy.m, MIN_MEMORY_KIB, MAX_MEMORY_KIB),
    t: bounded(policy.t, calibration ? 1 : 2, 10),
    p: 1,
  };
}
export function kdfPolicy(policy: KDFPolicy | number): KDFPolicy {
  if (typeof policy === "number")
    return {
      kdf: "PBKDF2-SHA256",
      iterations: bounded(policy, MIN_ITERATIONS, MAX_ITERATIONS),
    };
  if (policy?.kdf === "Argon2id") return validateArgon2(policy);
  if (policy?.kdf === "PBKDF2-SHA256")
    return {
      kdf: policy.kdf,
      iterations: bounded(policy.iterations, MIN_ITERATIONS, MAX_ITERATIONS),
    };
  throw new Error(
    "These password-protection settings are not supported. Try a compatible backup.",
  );
}
// Ordinary unlock can strengthen an existing slot, never silently lower either cost.
export function upgradePolicy(
  current: KDFPolicy,
  requested: KDFPolicy | number,
): KDFPolicy | undefined {
  const desired = kdfPolicy(requested);
  if (desired.kdf === "Argon2id") {
    if (current.kdf === "PBKDF2-SHA256") return desired;
    if (current.m < desired.m || current.t < desired.t)
      return {
        ...desired,
        m: Math.max(current.m, desired.m),
        t: Math.max(current.t, desired.t),
      };
  } else if (
    current.kdf === "PBKDF2-SHA256" &&
    current.iterations < desired.iterations
  ) {
    return desired;
  }
  return undefined;
}
export function calibratedPolicy(
  memory: number,
  elapsedMs: number,
): Argon2Policy {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0)
    throw new Error("The speed test did not finish reliably. Try it again.");
  return validateArgon2({
    kdf: "Argon2id",
    m: memory,
    t: Math.min(10, Math.max(3, Math.round(1000 / elapsedMs))),
    p: 1,
  });
}
