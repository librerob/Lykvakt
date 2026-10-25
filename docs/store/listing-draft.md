# Store draft — not submitted

Lykvakt is a small offline TOTP/HOTP authenticator with masked codes, encrypted local storage and backups you can test restoring. Click a compact row to copy; reveal is separate. Keyboard controls, native help and a single black/pink appearance keep it simple.

Unaudited preview: use test accounts and keep your existing authenticator. TOTP is phishable and there is no password reset.

Earlier previews cannot be opened by this version. Export accounts from the old app through Recovery → Export plaintext OTP links, then import into a fresh vault here.

Permissions: exactly ["clipboardWrite"]. No host/optional permissions, background worker, remote code, WebAssembly, telemetry, advertising, subscriptions or developer server.

Argon2id and Web Crypto AES-GCM/AES-KW protect the local vault. Selected import files are processed locally. Plaintext export and transfer QR require fresh master-password verification.

See [privacy](../../PRIVACY.md), [design](../design.md) and the real synthetic [screenshots](../screenshots/). Store payment, upload, publisher verification, asset sizing and submission remain manual and unverified.
