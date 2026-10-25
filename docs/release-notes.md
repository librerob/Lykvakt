# Lykvakt 0.2.0-rc.1 — unaudited development preview

**Use test accounts only. Keep your existing authenticator, service recovery codes and independently stored verified backups. This build has not had an independent security audit.**

This build is an offline TOTP/HOTP vault with a single true-black and pink appearance. Its complete manifest permission set is `["clipboardWrite"]`, used only to copy a selected code after a click. There are no optional or host permissions, developer servers or telemetry.

- Master-password unlock and authenticated local encryption, with page/inactivity locking and revision-checked atomic saves.
- Fresh vault-key rotation on password change; the older local recovery copy is removed in the same transaction. Exported backups keep their original passphrases.
- Explicit password-authenticated recovery from a readable previous encrypted revision when the active envelope is structurally unreadable.
- Codes hidden by default, timed keyboard-operable reveal and copying without reveal.
- Setup keys, standard OTP links, user-selected QR images, complete Google Authenticator transfer batches and supported plaintext Aegis/2FAS exports.
- Import previews with visible skipped-entry reports, duplicate handling and blocking configuration conflicts.
- Per-account transfer QR and plaintext OTP export after master-password re-authentication.
- Encrypted backups with actual saved-file restoration testing and an account-snapshot backup reminder.
- Local seven-word passphrase generation using the bundled EFF wordlist and browser-provided random values.

KDF compatibility bounds, Unicode password handling, deterministic authenticated-header encoding, session cancellation and parser fuzz tests cover specific failure cases. Automated results are not an audit or exhaustive phone interoperability certification. See [validation](validation.md), [migration](migration.md) and [recovery](recovery.md).

The repository remains `librerob/otp-vault`. No Chrome Web Store submission or production-support promise is made.
