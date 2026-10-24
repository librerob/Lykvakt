# Cryptography and format v1

This is a design description, not a security certification. The format is original application framing around standard Web Crypto primitives. Do not use it for important accounts until independently reviewed.

## Keys and encryption

At creation, Web Crypto generates 32 random vault-key bytes. A PBKDF2-HMAC-SHA256 password key encrypts those bytes with AES-256-GCM, a fresh 32-byte salt, a fresh 12-byte IV and a 128-bit tag. The password wrapper’s associated data binds format, version, purpose, vault ID, archive kind and KDF parameters. The unwrapped vault key is imported as a nonextractable AES-256-KW CryptoKey.

Every save generates a fresh AES-256-GCM content key and 12-byte random IV. That content key encrypts the complete JSON document exactly once, then is wrapped with the vault key using standard AES-KW. Fresh content keys avoid repeatedly using a long-lived GCM key across ordinary saves. Random key/nonce collisions are still probabilistic, not mathematically impossible. The implementation does not promise an impossible absolute collision guarantee.

The full canonical header, including all credential slots and revision, is authenticated as content AAD. Removing/changing a password/passkey slot or changing metadata without resealing fails authentication. AES-KW authenticates the wrapped content key; GCM authenticates the plaintext and header. Canonical JSON recursively sorts keys using the documented English comparison and preserves array order; version 1 readers must use the same canonicalization.

Format outline:

```text
format, version, kind (vault/backup), id, revision
password: kdf, iterations, salt, iv, wrapped vault key
passkeys: credential IDs, PRF salts, IDs, IVs, wrapped vault keys
payload: wrapped content key, IV, authenticated ciphertext
```

Unknown envelope fields/versions/KDFs, wrong lengths and noncanonical Base64 are rejected. PBKDF2 iterations must be between the fixed compatibility minimum of 600,000 and maximum of 5,000,000 to reject downgrades and bound hostile-file work. Password strings are encoded as UTF-8 without normalization. New master/backup passphrases require 14–1024 characters. No password or derived key is persisted.

## Why PBKDF2 in this preview

Argon2id is preferable for resistance to parallel password guessing. Popout Authenticator demonstrates an MV3 `hash-wasm` implementation (64 MiB, three passes); MV3 is therefore not an inherent obstacle. This preview deliberately uses native Web Crypto PBKDF2 at 600,000 iterations to keep runtime cryptography dependencies and WASM permission surface small. This is an explicit CPU-only trade-off, not an Argon2 equivalence claim. Local measurements are in validation; no broad-device calibration has occurred. A future Argon2 slot must be a versioned, reviewed addition, with no silent downgrade of existing parameters.

Changing the master password first verifies the current password, generates a fresh random vault key, creates its new password wrapper, removes every passkey wrapper, and reseals atomically. The session switches to the new key only after a successful revision-checked commit. Old-envelope keys cannot decrypt subsequent saves. Passkeys must be re-enrolled. Existing backup files retain their independent passphrases. Explicit vault-key rotation is not implemented. The safest current migration is a verified backup restored into a separate fresh installation; old copies remain decryptable with their old credentials.

## Passkeys (experimental)

The extension omits RP ID fields, following Chromium’s extension-origin default. No relying-party domain or website host permission is used. Creation and assertions require user verification. Assertions also require user-presence and user-verification flags. Client data is checked against the current challenge, operation and exact extension origin.

The actual 32-byte PRF result passes through HKDF-SHA256 with a random salt and an origin/purpose-specific info string to produce an AES-GCM wrapping key. AAD binds the vault ID, origin, credential ID, slot ID and PRF input salt. A signature or biometric success flag never substitutes for this secret. Enrollment first proves the master password, then uses two distinct assertions: wrap using the first PRF result, unwrap using the second, compare the recovered key and decrypt the existing vault. Only then is the wrapper committed. Up to five wrappers can be stored and revoked.

Credentials are bound to this extension’s origin/ID. Development directory changes, another browser profile’s unpacked identity, or a Web Store ID can invalidate them. Never enroll a real credential expecting automatic Store migration. Backups exclude all passkey wrappers and always restore with a backup password. Revocation cannot invalidate a stolen older vault snapshot. A failed enrollment can leave an unused credential in the passkey provider, which users may remove there.

## Memory and recovery limits

Temporary byte arrays are overwritten where practical. JavaScript strings, garbage collection, browser internals and OS paging prevent guaranteed zeroization. CryptoKey nonextractability reduces accidental export; it cannot protect against hostile code executing in the unlocked extension.

There is no password reset, escrow or weak bypass. A compromised device, provider or approved extension update can defeat runtime protections. Strong independent service recovery remains essential.

The new-slot default is separate from these validation bounds and is currently 600,000. Successful password unlock upgrades a weaker accepted slot to the configured default and reseals/commits the authenticated header before opening the session. This rewrap preserves the vault key and passkey slots; password changes separately rotate the vault key. Existing backups remain accepted when the default increases, and backup verification does not write upgrades.
