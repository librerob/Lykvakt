# Lykvakt

A small offline TOTP/HOTP and Steam sign-in authenticator for Chrome. Lykvakt is a coined Nordic-inspired name meant to evoke watching over your keys. It is a personal, open-source project built for long-term independent use.

![Authenticator with synthetic accounts](docs/screenshots/accounts-amoled.png)

## Install and build

Requires Node 24 and Chrome 120+. There is no Chrome Web Store release.

```sh
npm ci --ignore-scripts
npm run build
```

Load `dist/` at chrome://extensions → Developer mode → Load unpacked. Build an install ZIP with `npm run package`.

## Test

```sh
npm run lint
npm run format:check
npm test
npx playwright install chromium
npm run test:browser
```

CI also runs axe, a headed tab-lock check, and repeated headless popup measurements. See the PR's actual checks for observed results.

## Use and security

Click a row to copy its current code. Reveal is separate and lasts 30 seconds. The optional next-code preview follows the same masking rules. HOTP counters advance only after confirmation in More.

Ctrl+Shift+Y opens the popup (Command+Shift+Y on Mac). Rebind at chrome://extensions/shortcuts. Type an account name before Enter-to-copy; the message names the copied account.

Save an encrypted backup outside the browser, then use Recovery to test the actual saved file. There is no password reset. Imports recognise the format automatically: OTP link lists (including Ente and FreeOTP/FreeOTP+), QR images, complete Google transfers, Aegis and 2FAS (plaintext or password-protected), andOTP plaintext JSON, Bitwarden JSON OTP fields, Raivo JSON, Proton Authenticator plaintext JSON, Stratum plaintext JSON and Steam `.maFile` files. Every import is previewed; skipped entries are reported before you save.

Steam support covers sign-in codes only, with masking, copy, countdown and optional next-code preview. It cannot approve trades or market confirmations. Steam setup links need a destination supporting `otpauth://steam`; keep another working authenticator. Parsers are based on the linked upstream formats and synthetic fixtures, not real-export interoperability testing.

Argon2id and Web Crypto AES-GCM/AES-KW protect the local vault. Permission: exactly `["clipboardWrite"]`. No server, telemetry, remote code, host permissions or WebAssembly in the extension. TOTP is phishable; a compromised device can read unlocked secrets.

## Under the hood

- **Password protection:** Argon2id runs in a dedicated worker with 64 MiB of memory, three passes and one lane. Stored costs are checked before the worker allocates memory.
- **Authenticated encryption:** Web Crypto AES-256-GCM protects the records and authenticates the vault header. Every save gets a fresh content key, wrapped with AES-256-KW under a separate vault key.
- **Atomic saves:** IndexedDB saves the new vault and its previous encrypted revision in one transaction. Revision checks reject stale writes from another window.
- **Key rotation:** Changing the master password creates a new vault key and removes the superseded local recovery copy in the same transaction.
- **Recovery you can check:** An older revision is offered for explicit recovery, never selected silently. Backup verification opens the actual file you choose and compares its accounts with your current vault.
- **Controlled secret exports:** Plaintext export and transfer QR reveal require the master password again. Codes are masked by default, and locking cancels pending work and clears the unlocked session.

Tests cover known-answer cryptography and code vectors, tampering, lock cancellation, storage conflicts and 80,000 deterministic parser mutations. The [design guide](docs/design.md) documents the formats, limits and upstream sources.

## Why I built Lykvakt

I built Lykvakt for my own daily use. I want it to stay small, work offline and ask for as little access as possible. My plan is to keep using and maintaining it for the long term.

That shapes what goes into it. Lykvakt has no content scripts, host permissions, background script or service worker. It never reads or changes web page content. There is no `externally_connectable` setting or external-message handler. Its one permission is `clipboardWrite`, so you can copy a code when you need it.

All code ships with the extension. A strict Content Security Policy blocks remote scripts and external fetch/socket connections, along with inline scripts, evaluated code, frames and embedded objects. Accounts and imports are processed on your device. There are no subscriptions, ads, telemetry or developer backend, and optional tools load only when needed.

The point of these limits is to give bugs as little browser access as possible. I want new features to fit within them and keep the code manageable. The build checks the permission list, CSP and bundled code so those limits stay part of the software.

Read the [design and recovery guide](docs/design.md), [privacy policy](PRIVACY.md), and [security policy](SECURITY.md). Original code is GPL-3.0-or-later; bundled components retain their license notices.

For a critical read of the implementation, start with [the reviewer brief](REVIEW.md).
