# Validation record

## Current development branch

A fresh local source snapshot passed npm ci --ignore-scripts, build, lint, format:check and all 269 tests in 29 files. The install audited 176 packages and reported zero vulnerabilities. The runtime package guard and ZIP packaging also passed. The [full feature PR run](https://github.com/librerob/otp-vault/actions/runs/40210914031) passed on commit 887a90ff641a0678766d7e6862e9a3d4c615263c: all 269 unit tests, all 41 browser scenarios in Chrome for Testing 156.0.8078.4 on Linux, the existing AMOLED axe scan and both expanded-help axe scans with zero violations, the actual headed tab-lock check, bench and packaging. The browser artifact recorded zero external requests and no uncaught errors; npm audit reported zero vulnerabilities.

The preceding security-fix build passed [full PR CI](https://github.com/librerob/otp-vault/actions/runs/40205186659): 186 unit tests, 34 browser scenarios, the existing AMOLED axe scan with zero violations, the headed tab-lock check, and an audit with zero reported vulnerabilities. Those results describe that PBKDF2 build, not the new Argon2id interface.

## Checks included in this change

Known-answer Argon2id vector, authenticated slot tampering and bounded parameters before allocation; real-default create/unlock and password rotation; supported frozen PBKDF2 files; best-effort upgrade retries; worker cancellation and buffer cleanup; pure calibration clamp tests with injected clock/probe; independent HMAC next-code boundaries, masking and preference persistence; focus/Enter/Escape behavior; rendered primary-UI language checks; and exact manifest/runtime constraints.

The parser fuzz suite retains every prior case and adds an Argon2id envelope seed: seven entry points, 5,000 deterministic mutations each, 35,000 calls total. The Error-only, account-validity and 250 ms per-call budgets remain unchanged. This is bounded regression coverage, not an independent audit.

The package guard checks exact clipboardWrite-only permissions, absent host/optional/background entries, required local files, no compiled binary modules, no WebAssembly allowance in the CSP, and no WebAssembly references or forbidden dynamic/remote code in bundled JavaScript.

KDF integration tests alone have user-approved finite time budgets up to 60 seconds for real JavaScript derivations. No assertion, fixture, cost bound or fuzz per-call budget is weakened. Test concurrency remains limited to two workers.

## Local benchmark

Node v24.22.1 on Windows, with 500 synthetic accounts: the default 64 MiB / three-pass / one-lane Argon2id derivation measured 1,213.59 ms. Create took 1,319.20 ms, unlock 2,522.76 ms, encrypted backup 2,382.80 ms and verification 2,271.61 ms. These are one-run Node measurements, not browser startup or low-end-device guarantees.

## Limits

The default local Playwright Chromium executable was absent. A test:browser attempt using installed Windows Chrome stopped before any scenario: extension discovery timed out after 30 seconds because the unpacked extension was not found. No local browser success is claimed; Linux CI remains the source for browser evidence. Manual screen-reader testing, physical shortcut activation, exhaustive app interoperability, low-end-device performance, long-duration storage testing and an independent security audit remain unverified. Passing axe is not full WCAG certification. Use test accounts only and keep your existing authenticator and independent verified backups.
