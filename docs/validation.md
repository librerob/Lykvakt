# Validation record

## Current checks

The local suite for this documentation update passes build, lint, formatting and **168 Vitest tests in 21 files**, including the new documentation consistency guard. Runtime code is unchanged by this update.

Current checks cover RFC OTP vectors and independent HMAC references; bounded Base32/URI/transfer parsing; partial import reports and conflicts; encryption, tampering and legacy fixtures; password normalization and key rotation; atomic previous-copy recovery and rotation cleanup; session locking, cancellation and stale writes; secret-export re-authentication; code masking; backup reminders; passphrase generation; and CSS contrast.

`tests/fuzz.test.ts` runs 5,000 seeded mutations each for OTP URI parsing, URI/Aegis/2FAS imports, Google transfer decoding and envelope validation: 30,000 calls total. It requires Error objects for failures, valid account results and completion within a 250 ms per-call budget. This is bounded regression coverage, not exhaustive image-decoder fuzzing or an independent audit.

The package check validates Manifest V3, the exact `["clipboardWrite"]` permission set, required bundled files and forbidden remote/dynamic-code patterns. `tests/docs-consistency.test.ts` checks the live documentation, with dated changelog history excluded.

## Observed CI evidence

The [latest green CI run observed when preparing this update](https://github.com/librerob/otp-vault/actions/runs/40179869571) tested commit `2a78ae1f6a9266802e377e9c76755678fd048757` on Linux Chrome for Testing 156.0.8078.4. It passed **167 unit tests in 20 files** before the documentation guard was added, plus:

- 34 browser scenarios against the actual unpacked extension and synthetic accounts.
- Setup, reference OTP generation, account management, local QR images, complete Google transfer batches, re-authenticated QR/plaintext export and HOTP advancement/persistence.
- Masked-code copying, keyboard reveal and expiry, remasking on navigation/lock, and the persistent always-show preference.
- Encrypted backup download, saved-file verification, tamper rejection and fresh-profile restoration.
- Explicit recovery of an older encrypted revision after active-envelope corruption.
- The single AMOLED view’s axe scan, with zero violations under the existing WCAG tags and no disabled rules.
- Narrow/eight-digit layouts, zero observed external requests and zero uncaught errors.
- A separate headed Chromium tab-switch lock check.
- Dependency audit with zero reported vulnerabilities at that time, plus the synthetic benchmark and packaging scripts.

See [branch CI](https://github.com/librerob/otp-vault/actions?query=branch%3Acleanup-1) for results on newer revisions. The earlier run’s count does not include the new documentation test. [Screenshots](screenshots.md) are actual synthetic-account captures from a successful browser run.

## Limits

Local Windows browser launch was blocked, so browser results above are attributed to Linux CI. Manual screen-reader testing, exhaustive destination-app migration tests, long-duration storage testing, low-end-device performance and an independent security audit remain unverified. Passing axe does not establish full WCAG conformance. Use test accounts only and keep your existing authenticator and independent backups.
