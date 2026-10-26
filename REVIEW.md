# Reviewer brief

Lykvakt is a personal offline Chrome vault for TOTP, HOTP and Steam sign-in codes.
This is an unaudited preview. There is no independent audit.
A critical read of the encryption, recovery and import boundaries would help.
Please report wrong assumptions, unsafe edge cases and unclear instructions.
Use synthetic accounts and keep your working authenticator.

## Read in this order

1. [docs/design.md](docs/design.md): format contracts, limits and recovery rules.
2. [src/crypto.ts](src/crypto.ts): header authentication, wrapping and encryption.
3. [src/session.ts](src/session.ts): unlock, lock cancellation and save state.
4. [src/storage.ts](src/storage.ts): transactions, conflicts and older copies.
5. [src/kdf-policy.ts](src/kdf-policy.ts): password costs and their bounds.
6. [src/kdf.ts](src/kdf.ts) and [src/argon2.worker.ts](src/argon2.worker.ts): worker setup, results and cancellation.
7. [src/import-encrypted.ts](src/import-encrypted.ts): Aegis and 2FAS decryption.
8. [src/steam.ts](src/steam.ts): Steam sign-in code generation.
9. The tests below, which pin these paths rather than prove the whole design safe.

- Encryption: tests/crypto.test.ts, tests/canonical.test.ts, tests/password-change.test.ts, tests/rotation-copy.test.ts.
- Password work: tests/argon2.test.ts, tests/kdf-worker.test.ts, tests/kdf-buffers.test.ts.
- State and recovery: tests/session.test.ts, tests/storage.test.ts, tests/recovery-copy.test.ts, tests/old-format.test.ts.
- Imports: tests/import-formats.test.ts, tests/import-encrypted.test.ts, tests/import-fuzz.test.ts, tests/fuzz.test.ts.
- Codes: tests/otp.test.ts, tests/migration.test.ts, tests/steam.test.ts, tests/steam-ui.test.ts.
- Interface: tests/countdown.test.ts, tests/code-visibility.test.ts, tests/browser.mjs and tests/visibility.mjs.

## Claims and limits

These are the claims in the design guide; passing tests is not an audit.
The manifest permissions are exactly ["clipboardWrite"].
Runtime code is bundled locally; no WebAssembly or remote code is shipped.

TOTP is phishable. A compromised device or hostile extension update can read unlocked data.
There is no password reset, escrow or recovery server.
JavaScript strings, library internals, browser-managed copies, garbage collection and OS paging prevent guaranteed zeroization.
That means JavaScript cannot guarantee that memory has been wiped.
There is no trusted anti-rollback anchor.

Every import parser follows the linked upstream specifications or export code.
All fixtures in tests/fixtures/ are synthetic. None was obtained from a real user export.
Source inspection and synthetic round trips do not certify phone interoperability.

## Questions to investigate

1. Is header authentication complete? In src/crypto.ts, inspect passwordAAD(),
   headerOf(), seal() and open(). Is anything missing from AAD? Check the
   AES-GCM password wrapper, AES-KW vault-key wrapping of content keys and
   AES-GCM content encryption together.
2. Are memory, passes and lanes bounded correctly in validateArgon2() in
   src/kdf-policy.ts? Follow argon2Key() in src/kdf.ts into the worker.
   What work or allocation can a hostile backup force before rejection?
3. Can recovery accept an unsafe rollback or downgrade? Follow load(),
   commit() and sameActive() in src/storage.ts and Session.unlock()/save().
   Account for the lack of a trusted anti-rollback anchor and older HOTP counters.
4. Can old-format handling or imports lose data? Inspect isOlderFormat() in
   src/format.ts, eraseOldVault() in src/storage.ts, the confirmation in
   src/ui/welcome.ts, and preview() in src/ui/enrollment.ts.
5. Are hostile import files bounded before expensive work? Follow boundedJSON()
   and readImport() in src/import-formats.ts into decryptImport(), aegis() and
   twofas() in src/import-encrypted.ts. Check size, nesting, scrypt costs,
   fixed PBKDF2 work, parser edge cases and lock cancellation.

## Report findings

Use [private vulnerability reporting](https://github.com/librerob/Lykvakt/security/advisories/new)
for security-sensitive findings. Use [normal issues](https://github.com/librerob/Lykvakt/issues)
for non-sensitive bugs or unclear documentation. Never send real secrets or profiles.
Include the version, browser/OS, synthetic steps and expected/observed behavior.
Confirmed findings get a regression test and credit if wanted.

## Run the checks

Use Node 24 and Chrome 120+, as described in README.md.

```sh
npm ci --ignore-scripts
npm run build
npm run lint
npm run format:check
npm test
npx playwright install chromium
npm run test:browser
```

CI also runs axe and the headed tab-lock check. Manual and unverified limits
are listed in docs/design.md; do not treat CI as evidence for untested behavior.
