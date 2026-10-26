# Store draft — not submitted

Lykvakt is a small offline TOTP/HOTP and Steam sign-in authenticator with masked codes, encrypted local storage and backups you can test restoring. Click a compact row to copy; reveal is separate. Keyboard controls, native help and a single black/pink appearance keep it simple.

Unaudited preview: use test accounts and keep your existing authenticator. TOTP is phishable and there is no password reset.

Earlier previews cannot be opened by this version. Export accounts from the old app through Recovery → Export plaintext OTP links, then import into a fresh vault here. If you no longer have the old version, reinstall it in the same folder (same extension), export through Recovery → Export plaintext OTP links, then update.

Permissions: exactly ["clipboardWrite"]. No host/optional permissions, background worker, remote code, WebAssembly, telemetry, advertising, subscriptions or developer server.

Argon2id and Web Crypto AES-GCM/AES-KW protect the local vault. Selected import files are recognised and processed locally. Supported inputs: OTP link lists, QR images, complete Google transfers, plaintext or password-protected Aegis/2FAS, andOTP, Bitwarden OTP fields only, Raivo JSON, Proton Authenticator plaintext JSON, Stratum plaintext JSON and Steam .maFile. Preview shows skipped entries before saving. These readers have synthetic-fixture coverage; real exports have not been verified.

Steam support is for sign-in codes only, not trade/market confirmations. Setup secrets usually come from another authenticator or a .maFile; Steam’s own app does not show them. Plaintext export and transfer QR require fresh master-password verification.

See [privacy](../../PRIVACY.md), [design](../design.md) and the real synthetic [screenshots](../screenshots/). Store payment, upload, publisher verification, asset sizing and submission remain manual and unverified.
