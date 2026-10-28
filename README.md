# Lykvakt

I built Lykvakt because I wanted a small authenticator I could use every day without giving it access to the websites I visit. It keeps your authenticator accounts in an encrypted vault on your device, with TOTP, HOTP and Steam support. I use it myself and plan to keep using and maintaining it for the long term.

Lykvakt runs in **Chrome, Microsoft Edge and Firefox on desktop**. All three builds come from this repository and use the same encrypted backup format. Each browser keeps its own vault; use an encrypted backup to move your accounts between them.

The name is coined and Nordic-inspired, with the idea of watching over your keys.

![Authenticator popup with synthetic accounts](docs/screenshots/popup-mode.png)

## Build and test

You'll need Node 24. Choose the build for your browser:

| Browser           | Minimum version | Build                   | Output          | Upload ZIP                |
| ----------------- | --------------- | ----------------------- | --------------- | ------------------------- |
| Chrome            | 120             | `npm run build`         | `dist/`         | `npm run package`         |
| Microsoft Edge    | 120             | `npm run build:edge`    | `dist-edge/`    | `npm run package:edge`    |
| Firefox (desktop) | 153             | `npm run build:firefox` | `dist-firefox/` | `npm run package:firefox` |

Run `npm run build:all` to build all three. Packages are written to `artifacts/`. See the [browser build and store guide](docs/browsers.md) for the differences between targets. A build does not imply store approval.

```sh
npm ci --ignore-scripts
npm run build
npm run lint
npm run format:check
npm test
npx playwright install chromium
npm run test:browser
```

To test in Chrome or Edge, open chrome://extensions or edge://extensions, enable **Developer mode**, choose **Load unpacked** and select `dist/` or `dist-edge/` respectively.

For Firefox, open about:debugging, choose **This Firefox → Load Temporary Add-on** and select `dist-firefox/manifest.json`. Temporary add-ons are removed when Firefox closes. Permanent installation requires Mozilla signing; the Firefox ZIP is the package to submit for that review.

CI runs browser checks in Chrome, Edge and Firefox, including native popup reopening and shared locking. It also runs axe accessibility checks, headed Chromium session tests and repeated popup-document startup measurements. The workflow runs show the exact browser versions and checks that passed.

## Using Lykvakt

Click an account row to copy its current code. Codes stay hidden until you reveal them, and hide again after 30 seconds. The optional **Next** preview follows the same rules. For HOTP accounts, the counter advances only when you confirm it in **More**.

Ctrl+Shift+Y opens the popup, or Command+Shift+Y on Mac. Edge uses Ctrl+Shift+7 (Command+Shift+7 on Mac), and Firefox on Linux uses Ctrl+Shift+7, to avoid browser shortcuts. Choose **Open in a window** in Settings when you want to keep Lykvakt open or select a file. Change it through **Change shortcut** in Settings, which opens your browser's shortcut manager. To copy with Enter, type part of an account name into search first. The confirmation tells you which account was copied.

Save an encrypted backup somewhere outside the browser, then choose **Verify or restore a backup** in **Backup** to test the file you saved. Creating a backup, exporting plaintext OTP links and revealing a transfer QR all ask for your master password again.

Imports recognise supported formats and show any skipped entries before you save. The [design and recovery guide](docs/design.md) explains the formats, migration steps and compatibility limits. Steam support covers sign-in codes; it doesn't handle trade or market confirmations.

You can close the popup, copy something from a website and reopen Lykvakt without entering your password again. The shared unlock session expires after five minutes of inactivity by default. Settings offers other timers and **When the browser restarts**. **Lock** ends the session in every open view. Small unfinished Add account forms and pasted OTP setup links are remembered only during that session. Other pasted exports stay only in the open form; authentication passwords are never remembered. File and QR-image selection still uses the separate window. Password length is your choice, with a long, unique passphrase recommended. Help & documentation works offline, with an optional [full usage guide](docs/usage.md). Import, export and backups live together in **Backup**.

## Under the hood

Argon2id runs in a worker with 64 MiB of memory, three passes and one lane. Stored costs are checked before memory is allocated. Web Crypto AES-256-GCM encrypts the account data and authenticates the header. Each save gets a fresh content key, wrapped with AES-256-KW under a separate vault key.

IndexedDB saves the new vault and its previous encrypted revision in one transaction. Revision checks reject stale writes. Changing the master password rotates the vault key and removes the old local copy in the same transaction. Recovery requires your explicit choice, and backup verification checks the actual file you select. Locking cancels pending work and clears the unlocked session.

TOTP codes can be phished, and a compromised device can read unlocked secrets. There is no password reset. The [security policy](SECURITY.md) and [reviewer brief](REVIEW.md) explain these limits and the areas that need review.

## Why I keep it small

I want bugs to have as little browser access as possible. Lykvakt uses three permissions: `clipboardWrite` for copying codes, `storage` for temporary unlock sessions, and `alarms` for expiry. A small background service worker manages that session in Chrome and Edge; Firefox uses an event page. There are no content scripts, host permissions or external-message entry points. It never reads or changes web pages.

All runtime code ships with the extension. A strict CSP blocks remote scripts and external connections, and the build checks those restrictions. There is no WebAssembly, server, telemetry, advertising or subscription. Accounts and imports stay on your device, and optional tools load only when needed. The design guide and [privacy policy](PRIVACY.md) explain what is stored and where.
