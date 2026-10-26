# Changelog

## 0.5.0-rc.1 — 26 October 2026

Unaudited development previews: use test accounts and keep your existing authenticator and verified backups.

- Require the master password for encrypted backup creation; cancel dialog-owned secret operations and pending writes on Close, Escape or replacement. Fix large-backup Base64 handling, bound Google transfer fields, and require explicit review of transfer-only name adjustments without changing saved names.
- Polish the 56 px account rows: a 22 px clockwise countdown with seconds inside during the last ten seconds, pink in the last five, fixed lanes and full-name/counter tooltips.
- Detect supported import formats from content; show the format, preview and every skipped entry before confirmation. Keep 8 MB and 2,000-entry limits, bound JSON depth and report unknown files with help.
- Add small plaintext readers for andOTP, Bitwarden OTP fields, Raivo, Proton Authenticator and Stratum; reuse setup-link parsing for Ente and FreeOTP/FreeOTP+.
- Open password-protected Aegis (bounded, yielding scrypt/AES-GCM) and 2FAS schema 4 (Web Crypto PBKDF2/AES-GCM) locally, with cancellation and no saved source password.
- Add Steam sign-in codes, .maFile and Aegis imports, transfer links, masking, reveal, copy, countdown and next preview. No trade/market confirmations. Keep payload schema 3 and add a strictly validated account type; earlier schemas still get the existing migration screen. Older builds cannot read accounts of this new type.
- Keep permissions exactly ["clipboardWrite"], no network or WebAssembly, and the same exact-pinned dependencies. New parsers, decryption, scrypt and Steam generation load only when used.
- Upstream sources and synthetic fixtures are documented in the design guide. Real exports and phone interoperability have not been verified.

## 0.4.0-rc.1 — 25 October 2026

Before updating, export accounts from the old version through Recovery → Export plaintext OTP links. Earlier previews cannot be opened by this version. Keep the export private and verify the import before removing it. If you no longer have the old version, reinstall it in the same folder (same extension), export through Recovery → Export plaintext OTP links, then update.

- Use envelope format 2 and payload schema 3, one Argon2id default, strict authenticated headers and current-format backups only.
- Remove legacy password/payload readers, website associations, unlock upgrades, strength choices, speed tuning and retry notices.
- Explain earlier formats without treating them as corruption; erasing old local data requires a separate confirmation and a transaction conflict check.
- Compact copyable rows, explicit timed reveal, native More menus and a stepped countdown ring with a text warning near expiry.
- Preserve backup-file verification, key rotation, typed conflicts, explicit older-revision recovery, optional Next preview, keyboard controls and accessibility checks.
- Move documentation into the design and recovery guide.

## 0.3.0-rc.1 — 25 October 2026

- Add Argon2id password protection in a bundled JavaScript worker, with authenticated parameter bounds, cancellation and optional explicit local tuning. New files use 64 MiB, three passes and one lane; no WebAssembly is shipped or used by the extension.
- Keep supported PBKDF2 vaults/backups readable and upgrade vaults through the authenticated save path. Transient optional-upgrade write failures preserve password access with a dismissible retry notice; typed revision conflicts reject stale unlocks. Successful upgrades discard superseded local recovery copies atomically.
- Add optional next-code preview with the existing masking rules, plus a Ctrl+Shift+Y popup shortcut (Command+Shift+Y on Mac) and Enter-to-copy after a non-empty account search, with the copied account announced. Copy always uses the current code; HOTP counters never advance automatically.
- Add shared keyboard-accessible help, friendly errors/progress, a first-run backup checklist and a plain-English guide.
- Warn about older HOTP counters during recovery and ignore unusable active revisions without bypassing conflict checks.

## 0.2.0-rc.1 — 25 October 2026

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
