# Reviewer brief

Lykvakt is a personal offline Chrome authenticator with TOTP, HOTP and Steam support. It has not received an independent security audit, and I'd welcome a critical look at the encryption, recovery and import paths. Please point out wrong assumptions, unsafe edge cases and instructions that don't make sense.

Much of Lykvakt was developed with AI coding tools. Automated tests and AI-assisted reviews do not replace an independent security audit. Use synthetic accounts when reviewing it, and keep your working authenticator.

## Where to start

1. [docs/design.md](docs/design.md) explains the format contracts, limits and recovery rules.
2. [src/crypto.ts](src/crypto.ts) handles header authentication, key wrapping and encryption.
3. [src/session.ts](src/session.ts) handles unlock, lock cancellation and save state. [src/dialog.ts](src/dialog.ts) gives dialog operations their own cancellation lifetime.
4. [src/storage.ts](src/storage.ts) handles transactions, conflicts and older copies.
5. [src/kdf-policy.ts](src/kdf-policy.ts) defines password costs and their bounds.
6. [src/kdf.ts](src/kdf.ts) and [src/argon2.worker.ts](src/argon2.worker.ts) handle worker setup, results and cancellation.
7. [src/import-encrypted.ts](src/import-encrypted.ts) decrypts Aegis and 2FAS exports.
8. [src/steam.ts](src/steam.ts) generates Steam sign-in codes.
9. The tests below exercise these paths. They don't prove the whole design safe.

The relevant tests are grouped here so you don't have to find them from scratch:

- Encryption: tests/crypto.test.ts, tests/canonical.test.ts, tests/password-change.test.ts, tests/rotation-copy.test.ts and tests/large-base64.test.ts.
- Password work: tests/argon2.test.ts, tests/kdf-worker.test.ts and tests/kdf-buffers.test.ts.
- State and recovery: tests/session.test.ts, tests/storage.test.ts, tests/recovery-copy.test.ts, tests/old-format.test.ts, tests/dialog-cancel.test.ts and tests/backup-reauth.test.ts.
- Imports: tests/import-formats.test.ts, tests/import-encrypted.test.ts, tests/import-fuzz.test.ts, tests/fuzz.test.ts, tests/migration-budget.test.ts and tests/transfer-names.test.ts.
- Codes: tests/otp.test.ts, tests/migration.test.ts, tests/steam.test.ts and tests/steam-ui.test.ts.
- Interface: tests/countdown.test.ts, tests/code-visibility.test.ts, tests/browser.mjs and tests/visibility.mjs.

## Claims and limits

The design guide explains the claims these checks are intended to support. Passing tests is not an audit. The manifest permissions are exactly ["clipboardWrite"], and runtime code is bundled locally. No WebAssembly or remote code is shipped.

TOTP codes can be phished. A compromised device or hostile extension update can read unlocked data. There is no password reset, escrow or recovery server.

JavaScript strings, library internals, browser-managed copies, garbage collection and OS paging prevent guaranteed zeroization. In other words, JavaScript cannot guarantee that every copy has been wiped from memory. There is no trusted anti-rollback anchor.

The import parsers follow the linked upstream specifications or export code. All fixtures in tests/fixtures/ are synthetic; none came from a real user export. Inspecting source code and testing synthetic round trips doesn't certify phone interoperability.

## Questions to investigate

1. Is header authentication complete? In src/crypto.ts, inspect passwordAAD(),
   headerOf(), seal() and open(). Is anything missing from AAD? Check the
   AES-GCM password wrapper, AES-KW vault-key wrapping of content keys and
   AES-GCM content encryption together.
2. Are memory, passes and lanes bounded correctly in validateArgon2() in
   src/kdf-policy.ts? Follow argon2Key() in src/kdf.ts into the worker.
   What work or allocation can a hostile backup force before rejection?
   Include unbase64() in src/crypto.ts when checking large files.
3. Can recovery accept an unsafe rollback or downgrade? Follow load(),
   commit() and sameActive() in src/storage.ts and Session.unlock()/save().
   Account for the lack of a trusted anti-rollback anchor and older HOTP counters.
4. Can old-format handling or imports lose data? Inspect isOlderFormat() in
   src/format.ts, eraseOldVault() in src/storage.ts, the confirmation in
   src/ui/welcome.ts, and preview() in src/ui/enrollment.ts.
   Check whether closing or replacing a dialog, or locking the vault, can leave work running.
5. Are hostile import files bounded before expensive work? Follow boundedJSON()
   and readImport() in src/import-formats.ts into decryptImport(), aegis() and
   twofas() in src/import-encrypted.ts, plus parseMigration() in src/migration.ts.
   Check size, nesting, scrypt costs, fixed PBKDF2 work, field counts, parser
   edge cases and cancellation.

## Reporting findings

Please use [private vulnerability reporting](https://github.com/librerob/Lykvakt/security/advisories/new) for security-sensitive findings. [Normal issues](https://github.com/librerob/Lykvakt/issues) are fine for non-sensitive bugs or unclear documentation.

Include the version, your browser and operating system, steps using synthetic accounts, and what you expected compared with what happened. Never send real secrets or browser profiles. Confirmed findings get a regression test, and I'm happy to credit you if you'd like.

## Running the checks

Use Node 24 and Chrome 120 or newer, as described in README.md.

```sh
npm ci --ignore-scripts
npm run build
npm run lint
npm run format:check
npm test
npx playwright install chromium
npm run test:browser
```

CI also runs axe and the headed tab-lock check. The design guide lists manual and unverified checks; a passing CI run isn't evidence for behavior those checks don't cover.
