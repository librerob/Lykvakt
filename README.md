# Lykvakt

A small offline TOTP/HOTP authenticator with a password-encrypted local vault.

**Unaudited development preview. Use test accounts and keep your existing authenticator and recovery codes.**

## Features

- RFC 4226 HOTP and RFC 6238 TOTP, SHA-1/256/512, six/eight digits and custom periods.
- Password unlock, authenticated encryption, idle/page locking and atomic revision-checked saves.
- Fresh vault-key rotation on password change; separate encrypted backup passphrases.
- Setup keys, standard OTP links, user-selected QR images, Google Authenticator transfer batches, and supported plaintext Aegis/2FAS exports.
- Import preview with explicit skipped-entry reports; incomplete batches and conflicting configurations are refused.
- Search, favorites, groups, editing and confirmed deletion.
- Clicked code copying; password re-authentication before plaintext OTP export or transfer QR reveal.
- Encrypted backups with restoration testing against the actual saved file.
- System, light, dark and true-black AMOLED themes with pink accents by default.

The only manifest permission is **`clipboardWrite`**, for copying a selected code. There are no optional or host permissions, background worker, directory lookups, website filling, tab capture, passkeys, cloud sync, telemetry or server.

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

Browser tests use an actual unpacked extension and synthetic accounts. Install Playwright Chromium with `npx playwright install chromium`, or set `CHROMIUM_PATH` to a compatible Chrome for Testing executable. CI also runs a headed tab-switch lock check.

## Recovery and compatibility

Save an encrypted backup outside the browser, then use Recovery → Verify or restore a backup to test that exact file. Keep its passphrase separately. There is no password reset or recovery server. Plaintext OTP links and transfer QRs expose setup secrets; compare codes and settings in the destination app before removing another authenticator.

Password unlock remains compatible with older vaults and backups. The authenticated `passkeys` field is retained: new writes require `[]`. On password unlock, legacy vault slots are stripped through a revision-checked reseal. A failed strip does not block password unlock and a later save retries. Passkey unlock/enrollment is removed. Legacy `origins` metadata stays in the encrypted schema for compatibility and has no website functionality.

Encrypted third-party exports and proprietary Steam/Battle.net formats are unsupported. Google transfers must include every batch part. There is a defensive 2,000-account / 8 MB text-import bound; image imports have separate size/dimension bounds. No independent audit or exhaustive phone interoperability certification has occurred. TOTP is phishable; a compromised browser or device can read unlocked secrets.

See [architecture](docs/architecture.md), [cryptography](docs/cryptography.md), [threat model](docs/threat-model.md) and [privacy](PRIVACY.md). Older release notes and research describe earlier previews and their removed features.

Original code is GPL-3.0-or-later. The coined name Lykvakt remains a working name; no trademark clearance is claimed. Bundled QR components retain their license notices.
