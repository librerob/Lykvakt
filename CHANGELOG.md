# Changelog

## 0.2.0-rc.1 — 25 October 2026

Unaudited development preview. Use test accounts only and keep your existing authenticator and verified backups.

- Rotate the vault key on master-password change and atomically remove the stale local recovery copy. Ordinary saves retain the previous encrypted revision for explicitly confirmed recovery.
- Separate KDF validation bounds from the new-slot default, normalize new passwords with a legacy unlock fallback, and make authenticated-header ordering deterministic.
- Require master-password re-authentication for plaintext secret exports and QR reveal. Mask codes by default, add a backup reminder and generate seven-word passphrases locally.
- Report skipped import entries; support common Google transfer defaults. Add session cancellation, storage rollback, parser fuzz and contrast coverage.
- Remove passkey unlock, Fill, Scan this tab, tab capture, website detection, directory data, toolbar badges and the background service worker. Remove the optional tabs, scripting, activeTab and storage permissions; only clipboardWrite remains.
- Replace light/dark/system themes and accent options with one true-black and pink appearance. Refresh screenshots and current-build documentation.

## 0.2.0-rc.1 — 24 October 2026

Lykvakt identity and angular pink/black lock; pink accents by default. Explicit visible-tab QR import, complete Google Authenticator transfer-batch import, standard transfer QR/plaintext bulk export, and exact-origin-approved OTP filling. Payload schema 2 adds encrypted website approvals and reads old schema 1 vaults.

## 0.1.0-rc.1 — 24 October 2026

Initial unaudited development preview: encrypted local vault, RFC OTP generation, account management, bounded previewed imports, local QR decoding, encrypted backup/restore verification, themes and bundled website-support lookup. Experimental WebAuthn PRF enrollment includes repeated key-unwrapping validation. Physical hardware support and production release approval remain outstanding.
