# Contributing

Use Node 24. Run `npm ci --ignore-scripts`, then `npm run build`, `npm run lint`, `npm run format:check` and `npm test`. `npm run test:browser` needs Playwright Chromium and uses synthetic accounts. CI also runs axe and headed tab locking.

Keep code small, offline and exact-pinned. Discuss permissions, remote code, WebAssembly or runtime dependencies before adding them. Preserve authenticated encryption, typed conflicts, atomic writes, explicit recovery, masking and saved-file backup verification; read [the design](docs/design.md).

Add security regression tests without weakening retained assertions. Report observed results; distinguish manual or unverified checks. Never commit or report real passwords, OTP secrets, QR codes, plaintext exports or browser profiles. Use [SECURITY.md](SECURITY.md) for vulnerabilities.

Original contributions are GPL-3.0-or-later. Keep bundled license notices.
