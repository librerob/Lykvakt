# OTP Vault 0.1.0-rc.1

Unaudited development preview for dedicated test accounts. Keep your existing authenticator and independent service recovery codes.

Includes an encrypted local vault, RFC TOTP/HOTP generation, previewed URI/manual/QR imports, search/favorites/groups, themes, encrypted backups and an isolated saved-file restoration test. The package has no backend, telemetry, host permissions or content scripts.

Experimental passkey unlock uses actual WebAuthn PRF-derived key unwrapping. Physical Windows Hello, Touch ID and FIDO2 hardware remain unverified. Password unlock and passkey-independent backups are retained. Website support is checked locally against a bundled 2FA Directory snapshot; automatic badges request optional tabs permission explicitly.

See docs/validation.md for executed checks and docs/compatibility.md for limits. Google transfer QR batches, encrypted third-party migrations, proprietary OTP formats, autofill, cloud sync, native integration and vault-key rotation remain deferred.

Extract the Chrome ZIP, then use chrome://extensions → Developer mode → Load unpacked. This is an unpacked development distribution, not a signed CRX or a Chrome Web Store approval. Verify the companion SHA-256 file. Do not reinstall or remove a working vault before testing a separately saved backup.
