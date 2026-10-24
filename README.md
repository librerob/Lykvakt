# OTP Vault

An offline browser authenticator with a password-encrypted local vault and a backup restoration test.

**Unaudited development preview. Use dedicated test accounts. Keep your existing authenticator.**

The product name is provisional. This repository contains original GPL-3.0-or-later code; bundled third-party components retain their licenses.

![Actual Chromium interface with synthetic accounts](docs/screenshots/desktop-eight-digit.png)

[Light, dark, AMOLED and recovery screenshots](docs/screenshots.md). All accounts shown are synthetic.

## What works

- RFC 4226 HOTP and RFC 6238 TOTP, SHA-1/256/512, six or eight digits, custom periods.
- Password-required setup, authenticated encryption, real locking, encrypted metadata.
- Manual setup keys, standard OTP URIs and local QR images; preview before atomic import.
- Search, favorites, groups, account editing and confirmed deletion.
- Light, dark, system and true-black AMOLED themes with six accent options.
- Encrypted file backups and isolated restoration testing against the actual saved file.
- Manual local website lookup; optional automatic toolbar indicators using a bundled 2FA Directory snapshot.
- Experimental WebAuthn PRF key unwrapping. No physical authenticator compatibility is certified.

No server, account, sync, telemetry, remote executable code, or subscription. There is a defensive 2,000-record / 8 MB input bound, not a paid account limit.

## Try it

Use Node 24 and npm. All dependencies are pinned in `package-lock.json`.

```sh
npm ci --ignore-scripts
npm test
npm run lint
npm run format:check
npm run build
npm run test:browser
npm run package
```

In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the built `dist/` directory. To install a release ZIP, extract it first and select the extracted directory. A ZIP is an unpacked development distribution, not a signed CRX or a Web Store listing.

Opening a full window from the popup locks the popup first. Unlock again there for imports, exports and passkey experiments. The vault also locks whenever its page is hidden or closed; there is no shared unlocked session across windows.

The build uses Vite with WebAssembly tooling aliases so it does not need native bundler modules. The extension itself contains no WebAssembly or cryptographic package. For local browser tests, set `CHROMIUM_PATH` to a compatible Chrome for Testing executable, or install Playwright Chromium with `npx playwright install chromium`.

## Recovery comes first

Create a backup, save it outside this browser, then open **Recovery → Verify or restore a backup** and select that exact saved file. Enter its passphrase. Verification authenticates and decrypts the archive, validates all accounts, generates test codes, and compares the complete account snapshot. It does not replace your accounts or prove a website accepts its codes.

If the browser profile is lost, choose **Restore an encrypted backup** during initial setup. If a vault already exists, unlock it and use the previewed merge. There is no silent replacement or password reset. Losing both the usable vault password and every readable backup can mean account loss.

## Limits before everyday use

No independent security audit has occurred. A compromised browser, device, dependency or extension update can steal secrets while unlocked. Keeping passwords and second factors on one device reduces separation. TOTP remains vulnerable to phishing.

Google Authenticator transfer QR batches, encrypted third-party formats, Steam/Battle.net, autofill, notifications, native messaging, cloud sync, independent recovery-key slots and explicit vault-key rotation are deferred. Plain Aegis v1/database v3 and 2FAS schema 4 adapters have synthetic fixture tests, not migration certification against every app version. Passkeys require usable PRF output and a stable extension ID; passwords and backups remain available.

Validation: 94 unit tests and 32 browser checks (including virtual PRF and a headed tab switch); see the linked validation record for environment and remaining manual work. No physical biometric support is certified.

Read [architecture](docs/architecture.md), [cryptography](docs/cryptography.md), [threat model](docs/threat-model.md), [recovery](docs/recovery.md), [research](docs/research.md), [compatibility](docs/compatibility.md) and [validation](docs/validation.md).

Data sourced from 2FA Directory by 2factorauth. Dataset provenance and license notices are bundled in `public/`. This snapshot is checked locally; visiting documentation links is an explicit browser navigation.
