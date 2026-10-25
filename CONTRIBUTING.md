# Contributing

Use Node 24. Install with npm ci --ignore-scripts, then run npm run build, npm run lint, npm run format:check and npm test. Browser tests require Playwright Chromium; npm run test:browser uses synthetic accounts. CI also runs axe and a headed tab-lock check.

Keep the extension offline, exact-pinned and small. Do not add permissions, remote code, WebAssembly or runtime dependencies without an explicit design discussion. Preserve authenticated encryption, typed conflicts, atomic writes, explicit recovery, masking and saved-file backup verification.

Add regression tests for security changes. Do not weaken retained security assertions or invent browser/benchmark results. Separate observed checks from manual/unverified behavior. Read [the design](docs/design.md).

Never include real passwords, OTP secrets, QR codes, plaintext exports or browser profiles in commits or issue reports. Report vulnerabilities using [SECURITY.md](SECURITY.md).

Original contributions are GPL-3.0-or-later. Preserve bundled license notices.
