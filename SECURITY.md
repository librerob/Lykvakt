# Security policy

This preview has not undergone an independent security audit. Do not migrate important accounts into it yet. Automated tests and AI-assisted review are not an audit.

Please use GitHub’s private vulnerability-reporting facility if enabled on this repository. If it is unavailable, open an issue asking for a private reporting channel without posting secrets, exploit payloads or private vaults. Do not attach real OTP seeds, passwords, recovery codes or production backups.

Only the latest development revision is maintained. There is no production support promise or security-response SLA. Confirmed issues should receive a reproducible synthetic test, a fix, regression validation and a clear advisory where warranted.

See the [threat model](docs/threat-model.md) and [cryptographic format](docs/cryptography.md). Browser-profile theft is mitigated by password-based encryption; an unlocked compromised browser or machine remains outside that protection. Back up before uninstalling, changing extension origin or attempting recovery.
