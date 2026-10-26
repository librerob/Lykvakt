# Store draft — not submitted

Lykvakt is a small offline TOTP/HOTP and Steam sign-in authenticator. Codes start hidden. Click a compact row to copy; reveal separately. Encrypted local storage, testable backups, keyboard controls, native help and one black/pink appearance keep it small.

Unaudited preview: use test accounts and keep your existing authenticator. TOTP is phishable; there is no password reset.

Earlier previews cannot be opened by this version. Before updating, use the old app's Recovery → Export plaintext OTP links, then import into a fresh vault. If needed, reinstall the old version in the same folder (same extension), export through Recovery → Export plaintext OTP links, then update.

Permission: exactly ["clipboardWrite"]. No host/optional permissions, background worker, remote code, WebAssembly, telemetry, ads, subscriptions or developer server. Argon2id and Web Crypto AES-GCM/AES-KW protect the vault.

Files are recognised and processed locally: OTP links, QR images, complete Google transfers, plaintext or password-protected Aegis/2FAS, andOTP, Bitwarden OTP fields only, Raivo JSON, Proton Authenticator plaintext JSON, Stratum plaintext JSON and Steam .maFile. Review skipped entries before saving. Coverage uses synthetic fixtures; real exports remain unverified.

Steam makes sign-in codes only, not trade/market confirmations. Its app does not show the secret; it usually comes from another authenticator or .maFile. Plaintext export and transfer QR require the master password again.

Read [privacy](../../PRIVACY.md), [design](../design.md) and the synthetic extension [screenshots](../screenshots/). Store payment, upload, publisher verification, asset sizing and submission remain manual and unverified.
