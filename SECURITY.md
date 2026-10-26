# Security policy

This is an unaudited development preview. Use test accounts only and keep your existing authenticator, service recovery codes and independently verified backups.

TOTP is phishable. Malware or hostile code in an unlocked extension can read secrets. Nonextractable keys and best-effort buffer clearing cannot guarantee protection from a compromised device or forensic erasure. There is no password reset or server recovery.

The extension uses fixed Argon2id defaults with bounded input costs, Web Crypto AES-GCM/AES-KW, strict schemas, authenticated headers, transactional revision checks and page-scoped keys. Read [the design](docs/design.md) for limits and recovery behavior.

Earlier previews cannot be opened by this version. Export OTP links using the old app before updating; keep them private and verify the import.

Use the repository's private vulnerability-reporting channel when available. If it is unavailable, open an issue requesting a private reporting route without exploit details or secret material. Never attach real passwords, OTP secrets, QR codes, plaintext exports or browser profiles.

Include the version, browser/OS, synthetic reproduction steps and expected/observed behavior. Automated tests, pinned dependencies and vulnerability feeds do not constitute an independent audit.

For the reading order and specific review questions, see [REVIEW.md](REVIEW.md).
