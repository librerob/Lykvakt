# Lykvakt

A small offline TOTP/HOTP authenticator with a password-encrypted local vault.

Lykvakt is a coined Nordic-inspired name, meant to evoke a watch over your keys.

**Unaudited development preview. Use test accounts only and keep your existing authenticator and recovery codes.**

New to this? Start with the [plain-English guide](docs/plain-english-guide.md).

## Features

- RFC 4226 HOTP and RFC 6238 TOTP, SHA-1/256/512, six/eight digits and custom periods.
- Argon2id password protection, optional local tuning, authenticated encryption, idle/page locking and atomic revision-checked saves.
- Fresh vault-key rotation on password change, with atomic removal of the older local recovery copy.
- Explicit recovery from an encrypted previous revision when the current envelope cannot be read.
- Setup keys, standard OTP links, user-selected QR images, Google Authenticator transfer batches, and supported plaintext Aegis/2FAS exports.
- Import preview with skipped-entry reports, duplicate detection and blocking configuration conflicts.
- Search, favorites, groups, editing and confirmed deletion.
- Codes hidden by default, keyboard-operable timed reveal and code copying without reveal.
- Optional next-code preview for time-based accounts; Copy always uses the current code.
- A popup keyboard shortcut, search Enter to copy the first match, and native keyboard-accessible help.
- Friendly progress/errors and a dismissible first-run backup checklist.
- Master-password re-authentication before plaintext OTP export or transfer QR reveal.
- Encrypted backups, saved-file restoration tests and an in-vault reminder when the verified account snapshot is out of date.
- Local generation of seven-word passphrases from the bundled EFF list.
- One true-black and pink appearance.

The complete manifest permission set is **`["clipboardWrite"]`**, used only to copy a selected code. There are no optional or host permissions. Processing stays local, with no developer server, telemetry or cloud account. New password protection runs in a bundled JavaScript worker; no WebAssembly is shipped or used by the extension.

## Screenshots

These are real extension captures with synthetic test accounts.

![Authenticator with hidden codes](docs/screenshots/accounts-amoled.png)

![Saved backup restoration verified](docs/screenshots/backup-verified.png)

See [all interface screenshots](docs/screenshots.md) for setup, locked and full-window views.

## A personal project

I built Lykvakt for myself and use it daily. I plan to keep it personal and independent, and to maintain it for the long term.

Portability is part of the design. The vault runs locally without a developer account or server, and you can move your accounts to a compatible authenticator using standard OTP links or individual QR codes. The source is available under GPL-3.0-or-later for others to maintain or fork.

Keep an encrypted backup outside your browser and its passphrase separately. Before switching authenticators, verify the destination's settings and test a service login. See [moving accounts](docs/migration.md) for supported imports, exports and their limits.

## Build and test

Use Node 24 and the pinned npm lockfile:

```sh
npm ci --ignore-scripts
npm run build
npm run lint
npm run format:check
npm test
npm run test:browser
npm run package
```

Load `dist/` through `chrome://extensions` → Developer mode → Load unpacked. Extract a packaged ZIP before loading it. This is an unpacked development distribution, not a signed CRX or a Web Store listing.

Browser tests use the actual unpacked extension and synthetic accounts. Install Playwright Chromium with `npx playwright install chromium`, or set `CHROMIUM_PATH` to a compatible Chrome for Testing executable. CI also runs a headed tab-switch lock check. See the [validation record](docs/validation.md) for observed results and limitations.

## Keyboard shortcut

Open with **Ctrl+Shift+Y**, or **Command+Shift+Y on Mac**. The suggested key is absent from [Chrome's published built-in shortcut list](https://support.google.com/chrome/answer/157179?hl=en); another extension or the operating system can still take it. Rebind it at chrome://extensions/shortcuts. The locked view focuses the password; after unlock, search gets focus. Type part of an account name, then Enter copies the first match without revealing it and announces the account. An empty search copies nothing. Escape clears search first, then closes the popup.

## Moving accounts and recovery

See [migration](docs/migration.md) for supported import/export formats and transfer steps. Compare the destination app’s settings and codes before retiring another authenticator.

Save an encrypted backup outside the browser, then use Recovery → Verify or restore a backup to test that exact file. Keep its passphrase separately. Password changes protect future vault saves; previously exported backups keep their original passphrases. Local recovery copies are not independent backups. There is no password reset or recovery server.

Password unlock remains compatible with supported older vaults and backups. New vaults, backups and successful upgrades use Argon2id. See [format compatibility](docs/compatibility.md). Encrypted third-party exports and proprietary Steam/Battle.net formats are unsupported. Google transfers require every batch part. Text imports are bounded to 2,000 accounts and 8 MB; QR images have separate size/dimension bounds.

No independent audit or exhaustive phone interoperability certification has occurred. TOTP is phishable; a compromised browser or device can read unlocked secrets.

See [architecture](docs/architecture.md), [cryptography](docs/cryptography.md), [threat model](docs/threat-model.md), [recovery](docs/recovery.md) and [privacy](PRIVACY.md).

Original code is GPL-3.0-or-later. Lykvakt is a coined working name; no trademark clearance is claimed. Bundled components and the EFF wordlist retain their license notices.
