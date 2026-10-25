# Cryptography and format v1

Original application framing around Web Crypto primitives; no independent security audit has occurred.

## Keys and authenticated data

A fresh vault uses 32 random key bytes. A PBKDF2-HMAC-SHA256 password key wraps them with AES-256-GCM, a random 32-byte salt, 12-byte IV and 128-bit tag. Wrapper AAD binds the format/version, purpose, vault ID, archive kind and KDF parameters. The vault key is imported as nonextractable AES-256-KW.

Every save generates a fresh AES-256-GCM content key and random 12-byte IV, encrypts the complete validated payload once, then wraps the content key with AES-KW. The full canonical header is content AAD, including revision and the required `passkeys` array. Removing a legacy header field before authenticating would break decryption.

```text
format: "otp-vault", version: 1, kind: vault/backup, id, revision
password: kdf, iterations, salt, iv, wrapped vault key
passkeys: [] for every new write; retained for legacy header compatibility
payload: wrapped content key, iv, authenticated ciphertext
```

`validateEnvelope` defaults to new-write rules: `passkeys` must be present and empty. The read path explicitly accepts the bounded legacy vault-slot structure so the original AAD can be authenticated. Backups continue to require an empty array. Passkey enrollment, PRF/HKDF unwrapping and passkey unlock are removed.

On successful password unlock, legacy slots are stripped by resealing with `passkeys: []` and incrementing the revision. Persistence uses the same compare-and-swap path as KDF upgrades. Legacy-strip encryption or commit failures do not block password access: the authenticated original envelope stays active and a later save retries stripping. Cancellation still prevents session resurrection. Slot removal does not rotate the vault key or revoke a key already recovered from an older copy.

## Passwords and rotation

The fixed validation floor is `MIN_ITERATIONS = 600_000`, the current new-slot default is `DEFAULT_ITERATIONS = 600_000`, and `MAX_ITERATIONS = 5_000_000` bounds each hostile-file derivation. Raising the default does not raise the compatibility floor. Successful password unlock upgrades a weaker accepted slot and reseals its authenticated header. Failed ordinary KDF-upgrade commits leave the session locked; a combined legacy-slot migration remains best effort. Backup verification does not persist upgrades.

New slots derive from NFKC-normalized UTF-8 passwords. Unlock tries NFKC first and, only on authentication failure when normalization changes the string, retries the original raw encoding for old archives. New master/backup passphrases require 14–1024 input characters. Temporary raw key and UTF-8 byte arrays are cleared in finally blocks where practical.

Password change verifies the current password, generates a fresh random vault key and password wrapper, and reseals atomically. The session switches keys only after a successful revision-checked commit. A key recovered from an old envelope and old password cannot decrypt subsequent saves. Previously exported backups keep their independent passphrases; old readable copies cannot be revoked retroactively. There is no separate standalone key-rotation action.

PBKDF2 keeps cryptographic runtime dependencies small but is CPU-bound rather than memory-hard. No broad-device KDF calibration or equivalence to a memory-hard KDF is claimed.

## Canonicalization and payloads

Canonical JSON recursively sorts object keys by plain JavaScript code-unit comparison and preserves array order. Supported header keys are lowercase ASCII, so existing header encodings remain byte-identical. Snapshots sort record IDs using the same comparison. Non-ASCII/mixed-case ID ordering can change an old health fingerprint and require new backup verification without changing ciphertext compatibility. Tests pin exact sample-header bytes and restore frozen legacy archives.

Payload schema 1 is read into schema 2; new saves use schema 2. Account metadata and the legacy `origins` field remain validated and encrypted. That field has no UI or website behavior. Encrypted backups use fresh independent key material and a separate password; restoration tests validate every record and compare account snapshots.

## Limits

The only manifest permission is `clipboardWrite`; IndexedDB and localStorage need no Chrome storage permission. There are no passkey/provider operations, host access, page injection, capture or external runtime requests. Plaintext OTP-link export and transfer QR reveal require master-password re-authentication; the verified raw bytes and password input are cleared before exposing a secret.

JavaScript strings, garbage collection, browser internals and OS paging prevent guaranteed zeroization. CryptoKey nonextractability cannot protect against hostile code executing in the unlocked extension. There is no password reset, escrow, developer backend or weak recovery bypass.
