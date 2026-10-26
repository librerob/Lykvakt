# Store listing draft — not submitted

Lykvakt is a small offline authenticator for TOTP, HOTP and Steam sign-in codes. It keeps your accounts in an encrypted vault on your device and asks for just one browser permission: copying to the clipboard.

Codes start hidden. Click an account row to copy its code, or reveal it separately when you need to read it. The app has encrypted backups you can test, keyboard controls, built-in help and a single black-and-pink appearance.

This is an unaudited preview. Use test accounts and keep your existing authenticator. TOTP codes can be phished, and there is no password reset.

## Moving your accounts

Imports are recognised and processed locally. Supported inputs include OTP links, QR images, complete Google transfers, plaintext or password-protected Aegis and 2FAS files, andOTP, Bitwarden OTP fields only, Raivo JSON, Proton Authenticator plaintext JSON, Stratum plaintext JSON and Steam .maFile files. You'll see skipped entries before deciding what to save. Compatibility tests use synthetic fixtures; real exports remain unverified.

Earlier previews cannot be opened by this version. Before updating, open the old app and choose **Recovery → Export plaintext OTP links**, then import that file into a fresh vault. If you no longer have the old version, reinstall it in the same folder (the same extension), export through **Recovery → Export plaintext OTP links**, then update.

Steam support covers sign-in codes, not trade or market confirmations. Steam's own app doesn't show its setup secret; that usually comes from another authenticator or a .maFile. Creating an encrypted backup, exporting plaintext OTP links and revealing a transfer QR ask for your master password again.

## Privacy and security

The permission set is exactly ["clipboardWrite"]. Lykvakt has no host or optional permissions, background worker, remote code, WebAssembly, telemetry, advertising, subscriptions or developer server. Argon2id and Web Crypto AES-GCM/AES-KW protect the vault.

For details, see the [privacy policy](../../PRIVACY.md), [design guide](../design.md) and [extension screenshots](../screenshots/). The screenshots use synthetic accounts.

This is draft listing copy, not a claim of Store approval. Store payment, upload, publisher verification, asset sizing and submission still need to be completed and checked manually.
