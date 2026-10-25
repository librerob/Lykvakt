# Design and recovery

Lykvakt is an unaudited development preview. Use test accounts, keep your existing authenticator, and retain independently verified backups. TOTP is phishable. A compromised device or hostile extension update can read unlocked data. There is no password reset, escrow or recovery server.

## Before updating

**Export your accounts from the old version before updating. Earlier previews cannot be opened by this version.** This is an intentional format break.

1. Open the working old version and unlock it.
2. Choose Recovery → Export plaintext OTP links and enter its master password.
3. Keep that file private: anyone holding it can generate the same codes.
4. Open this version, confirm erasing the old local vault only when ready, and create a fresh vault.
5. Choose Import accounts, review the OTP-link file, and save.
6. Compare the accounts and codes, save and test an independent encrypted backup, then remove temporary exports.

PBKDF2 is not supported. There is no legacy reader, password-encoding fallback or automatic data migration. The extension recognizes earlier envelopes before password work, shows the migration instructions and offers no older-revision recovery for them. Selecting an old backup produces the same explanation.

Erase the old vault and start fresh requires a second explicit confirmation. It deletes the two local encrypted records atomically only if they still match the offer. A concurrent change cancels erasure. It never deletes a file outside this browser.

## Small, offline architecture

One TypeScript/Vite extension page owns its Session, DOM and keys. It locks when hidden or closed, on tab activation elsewhere, after idle expiry, and before opening another window. No unlock key survives closing the popup. There is no guaranteed OS-lock signal.

The manifest permissions are exactly ["clipboardWrite"]. There are no host/optional permissions, background/service worker, content scripts, developer backend, advertising or telemetry. Clipboard writes follow an explicit click or a non-empty search plus Enter; the confirmation names the account. Clipboard history and other apps may retain the copied value.

Ctrl+Shift+Y is the suggested action shortcut, with Command+Shift+Y on Mac. Change it at chrome://extensions/shortcuts. Keyboard-layout, OS or other-extension shortcuts can still conflict. Escape clears a search first, then closes a popup. Native dialog Escape remains native.

QR scanning/export, generated-passphrase words and the Argon2 implementation load only when used. Runtime code is bundled locally; no WebAssembly or remote code is shipped. The strict CSP permits local scripts and styles, local/data/blob images, no frames, no objects and no form destinations.

The runtime dependencies remain exact-pinned @noble/hashes (its Argon2 module only), jsQR and QRCode. Their license notices and the EFF wordlist attribution are packaged in licenses/. Build tools are separate from the extension runtime.

## Format and keys

The envelope uses format "otp-vault", version 2. Every remaining header field is authenticated: format, version, kind, vault ID, revision and the entire password slot. The slot contains kdf, m, t, p, salt, iv and wrapped. The encrypted payload contains key, iv and ciphertext. Extra or missing keys are rejected.

New slots always use Argon2id v0x13, 65,536 KiB (64 MiB), three passes, one lane and 32-byte output. Stored costs must be integers within 19,456–262,144 KiB, two–ten passes and exactly one lane; validation rejects hostile costs before allocation. There are no strength choices, calibration or unlock-time upgrades.

Passwords use NFKC-normalized UTF-8 only. New passwords require 14–1024 characters. The optional seven-word generator uses unbiased rejection sampling over the EFF wordlist and browser-provided random bytes.

A random 32-byte vault key is imported as nonextractable AES-256-KW. The password-derived nonextractable AES-256-GCM key protects it with a fresh 32-byte salt, 12-byte IV and 128-bit tag. Password-wrapper AAD binds the format, version, purpose, ID, kind, salt and all password costs.

Every save generates a fresh AES-256-GCM content key and 12-byte IV, authenticates the canonical header, encrypts the validated data once, then wraps the content key with the vault key. The content key is extractable only for that wrapping operation; recovered content keys are nonextractable.

Canonical JSON sorts object keys by plain code-unit comparison and preserves array order. Account snapshots use the same deterministic comparison.

Payload schema 3 contains accounts, verifiedAt and verifiedSnapshot. Accounts have exactly id, issuer, label, secret, type, algorithm, digits, period, counter, favorite and group. IDs are unique; counters are precise unsigned 64-bit strings; files/counts/text fields are bounded. Website associations and earlier payload schemas are rejected.

## Derivation and locking

A bundled one-job module Web Worker derives the password key, imports it immediately and returns only a nonextractable CryptoKey. The non-browser fallback uses the yielding JavaScript primitive for tests and benchmarks.

Locking aborts pending work, terminates the worker and changes the Session epoch. Late results cannot reopen the session, save or expose a secret. Raw key, password and decoded payload buffers are cleared in finally blocks where practical.

JavaScript strings, library internals, browser-managed copies, garbage collection and OS paging prevent guaranteed zeroization. Nonextractable keys do not protect an unlocked page from hostile code.

A long, unique password still matters. Argon2's memory requirement adds work to offline guessing; local unlock time is not an attacker's GPU cost.

## Saving, conflicts and older revisions

IndexedDB stores active and previous in one existing object store. Ordinary commits preserve the previous encrypted envelope byte-for-byte in the same strict transaction as the new active write. Both operations succeed or neither does.

Compare-and-swap checks the actual active ID/revision. Concurrent saves are rejected, and a typed StorageConflictError rejects a stale save without replacing its Session snapshot; lock and unlock before retrying. Unlock rechecks the selected record after derivation. It does not write.

Structural damage or a missing active record can offer a valid previous revision of the current format. The app never silently selects it. The user must choose recovery and authenticate its password. A bad password never triggers fallback.

Recovery can miss recent changes. HOTP counters may be behind: never reuse a code already submitted. The next save promotes the recovered copy while still comparing against the actual active record.

Only a nonnegative safe active revision below Number.MAX_SAFE_INTEGER - 2 influences recovery numbering; unusable values do not bypass conflict checks. There is no trusted anti-rollback anchor.

Password change verifies the current password, generates a fresh vault key and slot, then commits the resealed data atomically. That same transaction deletes previous, so recovery cannot retain the superseded key. Failure leaves both stored records and the old Session key unchanged. The next ordinary save preserves a copy under the new key. Independently retained old exports cannot be revoked.

## Codes and compact controls

Each account has one compact row. Clicking or pressing its copy target copies the current code without revealing it. The small code control explicitly reveals/hides it and has an accessible name. Reveal re-masks after 30 seconds, navigation or lock. Always show codes remains optional and starts off.

A small stepped ring shows the TOTP period. The last five seconds use pink plus a visible text label; information never relies on color alone. HOTP rows show their counter. More is a native details disclosure containing Edit, favorite and confirmed counter advancement.

Next-code preview is optional and starts off. It stays hidden with the current code and supports custom periods, six/eight digits and SHA-1/256/512. It never appears for HOTP, and Copy always uses the current code.

System fonts, tabular numerals, a black/pink palette and visible focus indicators keep the interface calm. Text, controls and borders have contrast tests; reduced-motion mode has no animations. Native help and disclosures work by keyboard. Passing axe does not certify all accessibility.

## Backups and moving accounts

An encrypted backup uses independent key material and its own password. Save it outside this browser, with its password separately. This version requires current-format files; older preview files need the export/import path above.

Verify or restore a backup opens the actual selected file in memory, validates every account and generates test codes. It compares the account snapshot without replacing accounts. Only an exact match marks the current snapshot verified.

The reminder appears when no backup was verified or accounts changed. HOTP advancement changes the snapshot intentionally. The app cannot know whether a previously tested external file still exists.

Fresh-profile recovery creates an independent local vault only when none exists. A different backup can be reviewed for a safe merge; conflicts are not silently overwritten.

Standard OTP links preserve OTP settings; per-account transfer QR and bulk plaintext export require fresh master-password verification. These exports contain secrets. They do not preserve every app's groups/favorites.

Supported imports: OTP links, user-selected QR images, complete Google transfer batches, and supported unencrypted Aegis/2FAS exports. Preview reports every skipped entry and requires confirmation. Encrypted third-party exports and proprietary Steam/Battle.net formats are unsupported.

Compare destination codes/settings before retiring an authenticator. Import compatibility is not exhaustive phone interoperability certification.

## Verification and measurements

Run npm ci --ignore-scripts, build, lint, format:check and test. The suite retains known-answer Argon2id/OTP vectors, tamper/bounds tests, key rotation, backup verification, storage conflicts/rollback, explicit recovery, masking and cancellation coverage.

Parser fuzzing is deterministic and bounded: each call must return a valid result or throw an Error within the existing per-call budget. It is not exhaustive adversarial review.

Browser CI uses the actual unpacked extension and synthetic accounts. It checks keyboard flows, menu/row behavior, compact height, masking, old-format refusal/confirmed erasure, axe and a real headed tab-switch lock.

CI also builds the pre-change main revision and measures both popup documents on the same runner. First interactive paint is the first paint opportunity after a password field and enabled primary button exist. Repeated fresh popup-document pages use the same warmed browser profile. Results include first-contentful-paint entries and end-to-end unlock samples; they are not physical toolbar/window-compositor or broad-device guarantees.

Manual screen-reader use, physical shortcut activation/collisions, broad device performance, exhaustive app interoperability, long-duration storage tests and an independent security audit remain unverified. Real screenshots use synthetic accounts and are in screenshots/.
