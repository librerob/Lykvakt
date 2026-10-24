# Validation record

Development checks on 24 October 2026:

- Strict TypeScript and Vite build passed.
- 94 Vitest tests passed locally using the thread pool. Tests include RFC 4226 vectors, all RFC 6238 SHA variants, independent Node HMAC comparisons, strict Base32/URI parsing, import conflicts, encryption/tampering, password rewrapping, serialized backup round trips, locked session isolation, stale writer rejection, and phishing/public/private-suffix cases.
- npm audit reported zero known vulnerabilities in the dependency graph at the time checked. This is not an audit of the source.
- Runtime package validation checks MV3, exact permission lists, required files and forbidden dynamic/remote code patterns.

The initial Vite 8 native bundler was blocked by Windows application-control policy. The maintained Vite 7 build uses pinned WebAssembly aliases for Rollup/esbuild instead. Vitest’s fork/temp cache failed in this sandbox; the thread pool passed. Local Chrome for Testing execution was also blocked by OS application-control policy, so browser integration is delegated to the public GitHub Actions test runner, not claimed as a local success.

`tests/browser.mjs` loads the actual unpacked extension in Chromium with generated secrets. It checks setup, reference OTPs, favorites/search, duplicates, malformed import preservation, QR, HOTP advancement/persistence, restart locking, ciphertext storage, backup download/verification/tamper rejection, themes, axe rules, overflow and network silence. Screenshots and reports are synthetic-only workflow artifacts. Physical authenticator, native permission prompts and screen-reader testing still require supervised work. Passing axe does not establish WCAG conformance.

No independent security audit, physical biometric tests, exhaustive migration interoperability, fuzzing or long-duration usage study has occurred. Actual synthetic Windows/Node measurements for 500 accounts: unlock 178.12 ms, generate 500 OTPs 16.80 ms, encrypted backup 100.86 ms, verify and compare backup 187.57 ms. These single-run measurements do not establish popup startup, browser memory, idle CPU, low-end-device performance, or hardware compatibility.
