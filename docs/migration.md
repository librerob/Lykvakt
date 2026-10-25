# Moving accounts

Lykvakt is an unaudited development preview. Use test accounts only and keep your existing authenticator until the destination is verified.

## Import

- Standard `otpauth://` TOTP/HOTP links: paste one per line, choose a text file or select QR images in Import accounts.
- Google Authenticator transfer format version 1: export accounts in the source app, retain a private image of every transfer QR and select all parts together. Every part must appear exactly once in a complete, matching batch. Transfer text links can also be supplied together, separately from standard OTP links.
- Unencrypted Aegis envelope v1/database v3 and 2FAS schema v4 exports. Encrypted third-party files need an appropriate export from the source app first.

Google transfers support SHA-1/256/512, six/eight digits and nonnegative signed-int64 HOTP counters. Unspecified algorithm and digit values default to SHA-1 and six digits. Transfer TOTP periods are 30 seconds because that wire format has no period field. Unsupported account types/settings are reported as skipped entries; structural errors, incomplete batches and zero-valid-account imports fail.

Review account counts, settings, skipped-entry reasons, duplicates and conflicts before confirming. Matching seed/type with different settings blocks import. HOTP counters are preserved and never inferred or automatically advanced.

QR decoding uses images you explicitly select. There are file, image-dimension and readable-code bounds. Small or obscured QR images may need a clearer source file. Treat all source images and plaintext exports as secrets.

Compare destination settings and codes with the source, verify an encrypted backup and test a service login before retiring another authenticator. A matching generated code alone is not a successful login.

## Export

Edit an account to choose Show transfer QR or plaintext OTP URI export. Recovery → Export plaintext OTP links exports every account with its algorithm, digits, period or exact counter. Each secret-revealing action requires the current master password and an explicit warning/confirmation. These formats contain setup seeds; anyone holding them can generate codes.

Per-account QR and OTP-link exports use standard `otpauth` data. They do not carry favorites, groups or backup-verification metadata; use an encrypted Lykvakt backup to preserve that information. Google’s batch QR export and native Aegis/2FAS export formats are not generated. Destination apps may ignore standard OTP parameters, so verify their settings and behavior.

See [recovery](recovery.md) for encrypted backups and restoration testing, and [compatibility](compatibility.md) before changing an existing installation.
