# Lykvakt

A small offline TOTP/HOTP authenticator for Chrome. Lykvakt is a coined Nordic-inspired name meant to evoke watching over your keys. It is a personal, open-source project built for long-term independent use.

**Unaudited preview. Use test accounts and keep your existing authenticator.**

**Before updating: export your accounts from the old version. Earlier previews cannot be opened by this version.** In the old app, choose Recovery → Export plaintext OTP links, then import the file into a fresh vault here. Keep the export private and remove temporary copies after checking the new app.

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

Save an encrypted backup outside the browser, then use Recovery to test the actual saved file. There is no password reset. Standard OTP links, QR images, Google transfers and supported plaintext Aegis/2FAS exports make accounts portable.

Argon2id and Web Crypto AES-GCM/AES-KW protect the local vault. Permission: exactly `["clipboardWrite"]`. No server, telemetry, remote code, host permissions or WebAssembly in the extension. TOTP is phishable; a compromised device can read unlocked secrets.

Read the [design and recovery guide](docs/design.md), [privacy policy](PRIVACY.md), and [security policy](SECURITY.md). Original code is GPL-3.0-or-later; bundled components retain their license notices.
