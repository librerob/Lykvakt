# Security policy

Lykvakt is a personal project and has not received an independent security audit. Keep your service recovery codes and independently verified backups. Tests, pinned dependencies and vulnerability feeds help catch problems, but they are not an independent audit.

TOTP codes can be phished. Malware or hostile code on your device can read secrets while the vault is unlocked. Nonextractable keys and buffer clearing don't make a compromised device safe, and JavaScript cannot guarantee that all copies have been erased from memory. There is no password reset or server recovery.

The [design guide](docs/design.md) explains the fixed Argon2id settings and their bounds, Web Crypto AES-GCM/AES-KW, strict schemas, authenticated headers, transactional revision checks and temporary, memory-only unlock sessions shared between extension views. If you're moving from an earlier preview, export through the old app before updating. Keep those OTP links private and check the import before removing them.

## Reporting a vulnerability

Please [report vulnerabilities privately](https://github.com/librerob/Lykvakt/security/advisories/new). If that route is unavailable, open an issue asking how to contact me privately, without posting exploit details.

Include the version, your browser and operating system, steps using synthetic accounts, and what you expected to happen compared with what happened. Never attach real passwords, OTP secrets, QR codes, plaintext exports or browser profiles.

If you'd like to review the project more broadly, [REVIEW.md](REVIEW.md) suggests a reading order and specific questions to investigate.
