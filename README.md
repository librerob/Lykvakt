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

## Small by design

Lykvakt is meant to stay as small, minimal and tightly restricted as possible. It keeps setup secrets encrypted locally and generates sign-in codes. Import readers, QR tools, passphrase words and password-derivation code load only when needed.

- **One permission: `clipboardWrite`.** Copying a code is the only privileged browser operation it requests.
- **No access to web pages.** No content scripts or host permissions; it never reads or changes page content.
- **No background script or service worker.** The vault runs in its extension page and locks when that page is hidden or closed.
- **No external messaging endpoint.** There is no `externally_connectable` setting or external-message handler.
- **A strict Content Security Policy.** Only bundled scripts can run. External connections, remote scripts, inline scripts, evaluated code, frames and embedded objects are blocked.
- **No developer server, telemetry, advertising or shipped WebAssembly.** Accounts and imports are processed on your device.

This keeps browser access narrow instead of granting broad access to your sites or an always-running process. Permission, CSP and bundled-runtime checks run with every build.

Read the [design and recovery guide](docs/design.md), [privacy policy](PRIVACY.md), and [security policy](SECURITY.md). Original code is GPL-3.0-or-later; bundled components retain their license notices.
