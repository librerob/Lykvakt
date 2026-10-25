# Cryptography and format v1

Original application framing around Web Crypto primitives; no independent security audit has occurred.

## Keys and authenticated data

A fresh vault uses 32 random key bytes. A PBKDF2-HMAC-SHA256 password key wraps them with AES-256-GCM, a random 32-byte salt, 12-byte IV and 128-bit tag. Wrapper AAD binds format/version, purpose, vault ID, archive kind and KDF parameters. The vault key is imported as nonextractable AES-256-KW.

Every save generates a fresh AES-256-GCM content key and random 12-byte IV, encrypts the validated payload once, then wraps the content key with AES-KW. The complete canonical header is content AAD, including revision and compatibility metadata. Removing header fields before authentication would break decryption.

For legacy compatibility, new envelopes retain an empty `passkeys` array, and old slots are authenticated and stripped on password unlock when saving succeeds.

The read path accepts only the bounded legacy structure needed to authenticate original AAD. Cleanup increments the revision and follows the same compare-and-swap path as a KDF upgrade. A failed legacy cleanup leaves password access available; a later save retries it. Cleanup alone does not rotate the vault key or revoke a key recovered from an older copy.

## Passwords and rotation

Validation uses a fixed minimum of 600,000 PBKDF2 iterations and a maximum of 5,000,000; new slots currently use 600,000. Raising the new-slot default does not raise the compatibility floor. Successful password unlock upgrades a weaker accepted slot and reseals its authenticated header. Failed ordinary KDF-upgrade commits leave the session locked; combined legacy cleanup remains best effort. Backup verification does not persist upgrades.

New slots derive from NFKC-normalized UTF-8 passwords. Unlock tries NFKC first and, on authentication failure when normalization changes the string, can retry the raw encoding for an old archive. New master/backup passphrases require 14–1024 input characters. The optional generator chooses seven distinct EFF words with unbiased rejection sampling over `crypto.getRandomValues`. Temporary raw key and UTF-8 arrays are cleared in finally blocks where practical.

Password change verifies the current password, generates a fresh vault key and password wrapper, and reseals atomically. The same transaction deletes the older local recovery copy. Failure leaves both stored copies and the session key unchanged; session key adoption follows a successful commit. The next ordinary save creates a previous copy under the new key. A key recovered from an old envelope/password cannot decrypt later saves, but independently retained old files cannot be revoked.

PBKDF2 is CPU-bound rather than memory-hard. No broad-device calibration or equivalence to a memory-hard KDF is claimed.

## Canonicalization, payloads and recovery

Canonical JSON sorts object keys by plain JavaScript code-unit comparison and preserves array order. Existing lowercase ASCII header keys keep byte-identical encodings. Snapshot ordering uses the same comparison. Tests pin sample-header bytes and restore frozen legacy archives.

Payload schema 1 is read into schema 2; new saves use schema 2. Legacy account metadata remains validated and encrypted for compatibility, without granting page access. Encrypted backups use independent key material and their own passphrases. Verification authenticates the selected file, validates records and compares account snapshots.

Ordinary saves preserve the exact previous encrypted envelope in the active-write transaction. Structural corruption can offer that older copy; selection and password authentication are explicit. Promotion still compares against the actual active record. There is no trusted anti-rollback anchor or guaranteed forensic erasure.

## Limits

The complete manifest permission set is `["clipboardWrite"]`. Plaintext OTP-link export and transfer QR reveal require master-password re-authentication; temporary verified key bytes and the password input are cleared before a secret is exposed.

JavaScript strings, garbage collection, browser internals and OS paging prevent guaranteed zeroization. Nonextractable keys cannot protect against hostile code in an unlocked extension. There is no password reset, escrow, developer backend or weak recovery bypass.
