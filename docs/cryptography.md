# Cryptography and format v1

Original application framing around bundled cryptographic code and Web Crypto; no independent security audit has occurred.

## Password protection

New vaults, backups and master-password changes use Argon2id version 0x13 with 32-byte output. Recommended parameters are m=65,536 KiB (64 MiB), t=3 and p=1. Extra strong uses 131,072 KiB, t=3 and p=1. The exact-pinned @noble/hashes 2.4.0 Argon2 module is bundled as JavaScript with its MIT license. The extension ships and uses no WebAssembly.

Stored Argon2id parameters must be safe integers: m=19,456–262,144 KiB, t=2–10 and p=1. Exact-field validation rejects missing, extra and out-of-range fields before starting a worker or allocating the working matrix. The implementation also passes an explicit memory budget to the primitive.

PBKDF2-HMAC-SHA256 slots retain their original authenticated encoding and accept the fixed 600,000–5,000,000 iteration range. They remain readable for compatibility. The exported legacy test policy retains a 2,000,000-iteration default; the application creates new slots with Argon2id.

## Keys and authenticated data

A fresh vault uses 32 random key bytes, imported as nonextractable AES-256-KW. The password-derived AES-256-GCM key wraps them using a random 32-byte salt, 12-byte IV and 128-bit tag. Wrapper AAD binds format/version, purpose, vault ID, archive kind, KDF and salt. PBKDF2 binds iterations; Argon2id binds m, t and p. Envelope version remains 1.

Every save generates a fresh AES-256-GCM content key and random 12-byte IV, encrypts the validated payload once, then wraps that content key with AES-KW. The complete canonical header is payload AAD. Header fields must be authenticated before migration or removal.

For legacy compatibility, new envelopes retain an empty `passkeys` array, and old slots are authenticated and stripped on password unlock when saving succeeds.

## Derivation, normalization and cancellation

Argon2id normally runs in a bundled one-job module Web Worker. The worker imports its 32-byte result immediately as a nonextractable AES-GCM key and sends only that CryptoKey to the page. A Node-only or worker-unavailable path uses the yielding async primitive. Derived output and UTF-8 password bytes are cleared in finally blocks on success and failure; the primitive also clears its working matrix on normal completion.

Locking aborts the current operation, terminates its browser worker and advances the session epoch. Late work cannot reopen the session or expose a secret. Termination, JavaScript strings, garbage collection, library internals, browser memory and OS paging prevent guaranteed zeroization; this is best-effort cleanup, not forensic erasure.

New passwords use NFKC-normalized UTF-8. Only legacy PBKDF2 slots can retry the raw encoding after a normalization-changing authentication failure. Argon2id never retries a second memory-heavy raw-string derivation. New passwords require 14–1024 input characters. The optional seven-word generator uses unbiased rejection sampling over browser-provided random values.

## Authenticated upgrades and rotation

Password unlock first authenticates and decrypts the stored vault. PBKDF2 slots then migrate to Argon2id through the revision-checked upgrade path. Weaker accepted Argon2id slots are strengthened, keeping the maximum existing/requested memory and pass costs so unlock never silently lowers either cost.

After successful authentication, upgrade preparation and non-conflict write failures are best effort. A typed compare-and-swap conflict rejects the stale unlock, clears session keys and data, and asks for a fresh unlock. Other write failures keep the original stored envelope as the session envelope and permit access. The read-only upgradePending state records a prepared upgrade that could not be saved; a later successful or unnecessary upgrade clears it. Lock cancellation takes precedence over either failure and clears pending state. A successful upgrade or legacy-slot cleanup deletes the previous encrypted copy in the same transaction, and the next ordinary save preserves only the upgraded envelope. Backup verification never persists an upgrade.

Password change verifies the current password, creates a fresh random vault key and Argon2id slot, and reseals atomically. The same transaction removes the older local copy. Failure retains both stored copies and the old session key. A key recovered from an old envelope/password cannot decrypt later saves, but independently retained files cannot be revoked.

## Optional local tuning

Calibration runs only after Test this computer. It derives once with t=1, a chosen 64/128/256 MiB memory setting, and throwaway random password/salt bytes. It measures performance.now(), then suggests t=clamp(round(1000/measuredMs),3,10). A one-pass probe is never accepted as a stored slot.

The measured and estimated times are shown before any save. Apply protection requires the current master password and the authenticated upgrade path; password change can also adopt the selected policy. Existing stronger protection is retained. The clock and probe are injectable for tests, which do not run a real calibration by default.

Parameters are plaintext authenticated metadata. A tuned setting can reveal approximate machine speed. Local timing does not throttle an attacker's GPU or optimized native code; it is not an attacker-cost equivalence. Argon2id's memory requirement raises offline-guessing cost but does not replace a long, unique password.

## Canonicalization and recovery

Canonical JSON sorts keys by JavaScript code-unit comparison and preserves array order. Snapshot ordering uses the same comparison. Tests pin the old sample header's exact bytes and restore frozen legacy archives.

Payload schema 1 reads into schema 2. Backups use independent key material and passwords. Verification authenticates the selected file, validates every record and compares the account snapshot without replacing accounts.

Ordinary saves retain the exact previous encrypted envelope in the active-write transaction. Structural corruption can offer it only with explicit choice and password authentication. Recovery warns that HOTP counters may lag and codes already submitted must not be reused.

Promotion still compares against the actual active record. Only a nonnegative safe active revision below Number.MAX_SAFE_INTEGER - 2 influences numbering; malformed or exhausted active revisions are ignored without bypassing compare-and-swap. There is no trusted anti-rollback anchor.

The manifest permission set remains exactly ["clipboardWrite"]. Plaintext secret export and QR reveal require fresh master-password verification. Clipboard writes follow a click or Enter in search. Nonextractable keys cannot protect unlocked data from hostile extension code or a compromised device.
