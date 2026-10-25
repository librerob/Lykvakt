# Security policy

This is an unaudited development preview. Use test accounts only and keep your existing authenticator and recovery codes. Automated tests and AI-assisted review are not an independent security audit.

Use GitHub’s private vulnerability-reporting facility if enabled on this repository. If it is unavailable, open an issue asking for a private reporting channel without posting secrets, exploit payloads or private vaults. Do not attach real OTP seeds, passwords, recovery codes or production backups.

Only the latest development revision is maintained. There is no production support promise or security-response SLA. Confirmed issues should receive a reproducible synthetic test, a fix, regression validation and a clear advisory where warranted.

See the [threat model](docs/threat-model.md) and [cryptographic format](docs/cryptography.md). Password-based encryption protects a closed vault against profile theft; it cannot protect unlocked secrets from a compromised browser or machine. Key rotation protects future saves and removes the older local recovery copy, but it cannot revoke independently saved files.

Keep and verify an encrypted backup before uninstalling, changing extension origin or attempting recovery. The local previous revision is a recovery aid, not an independent backup.
