# Lykvakt

I built Lykvakt for my own daily use: a small offline TOTP/HOTP and Steam sign-in authenticator for Chrome. The coined, Nordic-inspired name evokes watching over your keys. I plan to keep using and maintaining this open-source project for the long term.

This is an unaudited preview. Use test accounts and keep your existing authenticator and independently verified backups.

![Authenticator with synthetic accounts](docs/screenshots/accounts-amoled.png)

## Build and test

Requires Node 24 and Chrome 120+. There is no Chrome Web Store release.

```sh
npm ci --ignore-scripts
npm run build
npm run lint
npm run format:check
npm test
npx playwright install chromium
npm run test:browser
```

Load `dist/` at chrome://extensions → Developer mode → Load unpacked. `npm run package` builds an install ZIP. CI also checks axe, headed tab locking and repeated popup measurements; see the actual runs for results.

## Use

Click a row to copy its current code. Reveal lasts 30 seconds; optional Next follows the same masking rules. HOTP advances only after confirmation in More.

Ctrl+Shift+Y opens the popup (Command+Shift+Y on Mac); rebind at chrome://extensions/shortcuts. Search before Enter-to-copy. The confirmation names the account.

Save an encrypted backup outside the browser, then test the saved file through Recovery. Imports detect supported formats and report skipped entries before confirmation. The [design and recovery guide](docs/design.md) lists every format, migration step and interoperability limit. Steam support makes sign-in codes, not trade or market confirmations.

## Under the hood

Argon2id runs in a worker with 64 MiB, three passes and one lane; stored costs are checked before allocation. Web Crypto AES-256-GCM encrypts records and authenticates the header. Each save uses a fresh content key wrapped with AES-256-KW under a separate vault key.

IndexedDB atomically saves the vault and previous encrypted revision. Revision checks reject stale writes. Password change rotates the vault key and deletes the superseded local copy in that transaction. Recovery requires an explicit choice; backup verification compares the actual file. Secret exports require the password again. Locking cancels pending work and clears the unlocked session.

TOTP is phishable. A compromised device can read unlocked secrets. There is no password reset. See the [security policy](SECURITY.md) and [reviewer brief](REVIEW.md) for limits, tests and review questions.

## Why I keep it small

I want bugs to have as little browser access as possible. Lykvakt has exactly one permission, `clipboardWrite`. It has no content scripts, host permissions, background script, service worker or external-message entry point. It never reads or changes web pages.

Code ships locally. The strict CSP blocks remote scripts and external connections; the build guards those limits. There is no WebAssembly, server, telemetry, advertising or subscription. Accounts and imports stay on your device; optional tools load when needed. More detail is in the design guide and [privacy policy](PRIVACY.md).

Original code is GPL-3.0-or-later; bundled components retain their license notices.
