# Validation record

Development checks on 24 October 2026:

- Strict TypeScript and Vite build passed.
- 94 Vitest tests passed locally using the thread pool. Tests include RFC 4226 vectors, all RFC 6238 SHA variants, independent Node HMAC comparisons, strict Base32/URI parsing, import conflicts, encryption/tampering, password rewrapping, serialized backup round trips, locked session isolation, stale writer rejection, and phishing/public/private-suffix cases.
- npm audit reported zero known vulnerabilities in the dependency graph at the time checked. This is not an audit of the source.
- Runtime package validation checks MV3, exact permission lists, required files and forbidden dynamic/remote code patterns.

The initial Vite 8 native bundler was blocked by Windows application-control policy. The maintained Vite 7 build uses pinned WebAssembly aliases for Rollup/esbuild instead. Vitest’s fork/temp cache failed in this sandbox; the thread pool passed. Local Chrome for Testing execution was also blocked by OS application-control policy, so browser integration is delegated to the public GitHub Actions test runner, not claimed as a local success.

`tests/browser.mjs` loads the actual unpacked extension in Chromium with generated secrets. It checks setup, reference OTPs, favorites/search, duplicates, malformed import preservation, QR, HOTP advancement/persistence, restart locking, ciphertext storage, backup download/verification/tamper rejection, themes, axe rules, overflow and network silence. Screenshots and reports are synthetic-only workflow artifacts. Physical authenticator, native permission prompts and screen-reader testing still require supervised work. Passing axe does not establish WCAG conformance.

No independent security audit, physical biometric tests, exhaustive migration interoperability, fuzzing or long-duration usage study has occurred. Actual synthetic Windows/Node measurements for 500 accounts: unlock 178.12 ms, generate 500 OTPs 16.80 ms, encrypted backup 100.86 ms, verify and compare backup 187.57 ms. These single-run measurements do not establish popup startup, browser memory, idle CPU, low-end-device performance, or hardware compatibility.

## Browser evidence

[Validated workflow run](https://github.com/librerob/otp-vault/actions/runs/40109486330) passed all checks on Linux Chrome for Testing 156.0.8078.4:

- 25 core browser checks, including fresh-profile recovery, eight-digit layouts at 360/600/760/1200 pixels, zero observed external requests, and zero uncaught errors.
- Six CDP virtual-authenticator checks: master-password enrollment gate, repeated PRF key wrap/unwrap, actual PRF unlock, rejection of a non-PRF authenticator without changing the vault, wrapper revocation, and password fallback.
- A separate headed Chromium test switched tabs through the real tabs API and verified locking.
- axe reported zero applicable automated-rule violations in light, dark and AMOLED account-list views. Manual screen-reader testing and full WCAG conformance remain unverified.

Earlier runs exposed an ambiguous select label, a headless visibility-test limitation and the lack of dependable visibility events for extension pages. Explicit labels and a native tab-activation lock trigger addressed the product issues. Accessibility scanning runs within the same page so its own temporary tabs do not trigger the lock. A later screenshot inspection caught a malformed search placeholder; the text and source line-ending policy were corrected before release preparation.

The passkey results establish behavior with Chromium's virtual authenticator only. No physical Windows Hello, Touch ID, external FIDO2 key or third-party passkey provider was tested. Native optional-permission prompts, long-term storage failure, comprehensive third-party migration fixtures, image-decoder fuzzing, clipboard-manager behavior, popup startup/memory/idle CPU and an independent audit remain outstanding.
