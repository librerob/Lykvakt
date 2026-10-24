# Lykvakt 0.2.0-rc.1 — unaudited preview

A coined Nordic-inspired name, an original angular lock icon in shock pink and black, and pink Material-inspired accents by default. The repository remains `librerob/otp-vault`.

- Import Google Authenticator version-1 transfer QR batches, with complete-batch validation and atomic preview.
- Scan a visible HTTPS tab explicitly from the toolbar popup; QR decoding stays local.
- Fill a selected OTP into one empty, marked code field after exact-origin approval. No automatic filling or form submission.
- Reveal individual standard transfer QRs and export all accounts as plaintext OTP links after confirmation.
- Encrypted website approvals and backwards reading of payload schema 1; new saves use schema 2. Existing vault database/envelope identity stays stable. Older previews cannot read new payloads.

Keep existing authenticators and verified encrypted backups. Physical phone migration and real biometric providers still require manual validation. No independent security audit or Web Store submission has occurred. See `docs/validation.md` for measured results and `docs/migration-and-fill.md` for compatibility limits.
