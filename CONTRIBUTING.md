# Contributing

Lykvakt is meant to stay small and work offline. Before adding a permission, remote code, WebAssembly or a runtime dependency, please discuss the change first. Keep dependencies pinned to exact versions.

Start with the [design guide](docs/design.md). Changes need to preserve authenticated encryption, typed conflicts, atomic writes, explicit recovery, code masking and verification of the backup file the user actually saved.

## Checking a change

Use Node 24, then run:

```sh
npm ci --ignore-scripts
npm run build
npm run lint
npm run format:check
npm test
```

The browser suite needs Playwright Chromium. Install it with `npx playwright install chromium`, then run `npm run test:browser`. These checks use synthetic accounts. CI also runs axe and tests tab locking in a browser with a visible window.

When fixing a security bug, add a regression test and keep the existing assertions intact. In your PR, say which checks you ran and what happened. Make it clear when a check was manual or hasn't been verified.

Never commit real passwords, OTP secrets, QR codes, plaintext exports or browser profiles, or include them in a report. For vulnerabilities, follow [SECURITY.md](SECURITY.md) rather than opening a public issue with exploit details.

Original contributions are GPL-3.0-or-later. Please keep the bundled license notices.
