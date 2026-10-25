# Lykvakt 0.3.0-rc.1 — unaudited development preview

**Use test accounts only. Keep your existing authenticator, service recovery codes and independently stored verified backups. This build has not had an independent security audit.**

- New vaults, backups and password changes use Argon2id in a bundled JavaScript worker. Recommended protection uses 64 MiB, three passes and one lane. No WebAssembly is shipped or used by the extension.
- Supported older PBKDF2 files still open. Vault unlock attempts an authenticated upgrade. Transient write failures preserve access and show a dismissible retry reminder; typed revision conflicts reject the stale unlock. Successful upgrades discard superseded local recovery copies atomically.
- Optional local tuning shows measured and estimated times before an authenticated save. Stronger existing protection is retained.
- Optional Next preview for time-based codes starts off and follows the current code's reveal/masking state. Copy always uses the current code; HOTP counters are never advanced automatically.
- Open with Ctrl+Shift+Y, or Command+Shift+Y on Mac. Rebind at chrome://extensions/shortcuts. Enter after a non-empty account search copies the first match and names the account; Escape clears search before closing a popup.
- Native keyboard-accessible help, plain-language errors and busy messages, and a dismissible first-run backup checklist.
- Recovery warns about older HOTP counters and ignores unusable active revisions without bypassing conflict checks.

The complete manifest permission set remains ["clipboardWrite"], used to copy a selected code after a click or search Enter. There are no optional or host permissions, remote code, developer servers or telemetry.

See the [plain-English guide](plain-english-guide.md), [compatibility](compatibility.md), [validation](validation.md) and [recovery](recovery.md). Automated checks are not an independent audit or exhaustive interoperability certification. No Store submission or production-support promise is made.
