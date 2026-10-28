# Store listing

Lykvakt is a small offline authenticator for your browser. Generate TOTP and counter-based HOTP codes, with Steam support, and keep your accounts in an encrypted vault on your device.

Open Lykvakt from the toolbar popup for quick codes. You can switch to a website and reopen it without entering your password again until the unlock session expires. The default is five minutes of inactivity, with other choices in Settings. A separate window handles file selection.

Codes start hidden. Click an account to copy its current code, or reveal it when you need to read it. Search, favorites, groups and keyboard controls help you find accounts quickly.

In Backup, import accounts from setup links, QR images you choose or compatible export files. Review what will be added or skipped before saving. You can also export your accounts as OTP links or a transfer QR after confirming your master password.

Save an encrypted backup with a separate passphrase, then open the saved file to test restoration without replacing your accounts.

Lykvakt uses clipboardWrite to copy codes, storage to remember the temporary unlock session, and alarms to expire it. It has no content scripts or host permissions and never reads or changes web pages. The background code manages the local session only. There is no cloud account, advertising, subscription or telemetry.

Keep your backup and its passphrase somewhere safe: there is no password reset. Steam support covers authentication codes, not trade or market confirmations.

Free and open source.
Source, supported formats and recovery guide: https://github.com/librerob/lykvakt
Privacy: https://github.com/librerob/lykvakt/blob/main/PRIVACY.md

## Submission details

Name: Lykvakt. Category: Privacy & Security. Language: English. Price: Free. Permissions are clipboardWrite, storage and alarms. No remote code is used.

The previous submission was rejected for a list of authenticator brand names in the description. This replacement describes import/export generally; the supported-format details stay in the design guide. It makes no claim of Store approval.

Permission justifications: clipboardWrite copies a code only at the user's request; storage retains temporary unlock material and small enrollment drafts in memory-only storage.session; alarms clears that session when its inactivity deadline expires. No remote server or web-page access is used.
