# Security policy

I maintain Lykvakt as an unaudited development preview. Use test accounts; keep your existing authenticator, service recovery codes and independently verified backups. Tests, pinned dependencies and vulnerability feeds are not an independent audit.

TOTP is phishable. Malware or hostile code can read unlocked secrets. Nonextractable keys and buffer clearing cannot guarantee safety on a compromised device or forensic erasure. There is no password reset or server recovery.

The [design guide](docs/design.md) covers fixed, bounded Argon2id, Web Crypto AES-GCM/AES-KW, strict schemas, authenticated headers, transactional revision checks and page-scoped keys. Earlier previews need export through the old app before updating; keep OTP links private and verify the import.

Please [report vulnerabilities privately](https://github.com/librerob/Lykvakt/security/advisories/new). If unavailable, open an issue asking for a private route without exploit details. Include version, browser/OS, synthetic steps and expected/observed behavior. Never attach real passwords, OTP secrets, QR codes, plaintext exports or profiles.

Start at [REVIEW.md](REVIEW.md) for review questions and reading order.
