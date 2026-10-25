# Compatibility

The build targets Chromium 120+ and Manifest V3. Observed local and browser results, including their exact revisions, are recorded in [validation](validation.md). Firefox and Safari have no supported package. There has been no Chrome Web Store submission or approval.

## Existing vaults and backups

This build reads supported older PBKDF2 vaults and backups, including the frozen legacy fixtures. IndexedDB identity, envelope format otp-vault and envelope version 1 remain unchanged. Payload schema 1 reads into schema 2; migrated account snapshots need new backup verification.

New vaults, backups and password changes use Argon2id. Password unlock upgrades a PBKDF2 vault when it can safely save the result. A transient upgrade-write failure leaves authenticated access available with a dismissible reminder and is retried on a later unlock. A typed revision conflict clears the stale session and asks for a fresh unlock. Verifying a backup does not rewrite the file or save an upgrade.

For legacy compatibility, new envelopes retain an empty `passkeys` array, and old slots are authenticated and stripped on password unlock when saving succeeds.

Only legacy PBKDF2 slots can retry the original raw password encoding after a normalization-changing authentication failure. Argon2id uses NFKC only.

Changing an unpacked folder or extension identity can create separate browser-local data. Verify an independent encrypted backup before changing an installation. There is no guaranteed OS-lock signal; see [architecture](architecture.md) for page/session locking.

## Local workers and keyboard shortcuts

Argon2id uses bundled JavaScript in a module Web Worker, with no WebAssembly or additional manifest permission. Local performance depends on the browser, memory pressure and device; calibration is optional and its result is an estimate.

Ctrl+Shift+Y is the suggested action shortcut; Mac uses Command+Shift+Y. Chrome or the operating system can reserve a conflicting key, and another extension can take it. Rebind at chrome://extensions/shortcuts. A newly opened popup starts locked because keys are scoped to its page; an already unlocked view focuses search. Enter copies only after a non-empty account search and announces the copied account.

## Moving accounts

See [migration](migration.md) for supported Aegis, 2FAS, Google transfer, OTP-link and QR flows. Destination apps can interpret OTP parameters differently. No exhaustive phone interoperability certification or independent security audit is claimed.
