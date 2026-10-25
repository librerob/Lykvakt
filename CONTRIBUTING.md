# Contributing

Use Node 24, `npm ci --ignore-scripts`, then the checks in the README. Tests must use synthetic secrets. Keep runtime dependencies small, bundled and license-compatible.

Changes to the encrypted format, import semantics, permissions or lock lifecycle need a design explanation, failure tests and a recovery analysis. Do not silently downgrade KDF parameters, change OTP settings or discard unsupported imported records. New migration adapters need versioned fixtures from the source application before broad compatibility claims.

Documentation must describe the implemented build. Run `tests/docs-consistency.test.ts` through `npm test`, update links when moving a guide, and record observed validation separately from untested behavior. Dated release history belongs in CHANGELOG.md.

Use ordinary, descriptive commits. Do not publish real vaults or private signing keys. Security reports belong in a private channel; see SECURITY.md. Contributions are licensed GPL-3.0-or-later.
