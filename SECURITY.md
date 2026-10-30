# Security policy

Lykvakt is a personal project and has not received an independent security audit. Automated tests, pinned dependencies and vulnerability alerts help me catch problems, but they do not replace that review. Keep your service recovery codes and independently verified backups.

TOTP codes can be phished. Malware or hostile code on your device can read secrets while the vault is unlocked. Nonextractable keys and buffer clearing don't make a compromised device safe, and JavaScript cannot guarantee that all copies have been erased from memory. There is no password reset or server recovery.

The [design guide](docs/design.md) explains how the vault is encrypted, how saves and recovery work, and what the temporary unlock session retains. It includes the fixed Argon2id settings and bounds, Web Crypto AES-GCM/AES-KW, schema and header validation, and revision checks.

If you're moving from an earlier preview, export through the old app before updating. Keep those OTP links private and check the import before removing them.

## Reporting a vulnerability

Please [report vulnerabilities privately](https://github.com/librerob/Lykvakt/security/advisories/new). If that route is unavailable, open an issue asking how to contact me privately, without posting exploit details.

Include the version, your browser and operating system, steps using synthetic accounts, and what you expected to happen compared with what happened. Never attach real passwords, OTP secrets, QR codes, plaintext exports or browser profiles.

If you'd like to review the project more broadly, [REVIEW.md](REVIEW.md) suggests a reading order and specific questions to investigate.
