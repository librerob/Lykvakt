# Contributing

Use Node 24, `npm ci --ignore-scripts`, then the checks in the README. Tests contain only synthetic secrets. Keep runtime dependencies small, bundled and license-compatible.

Changes to the encrypted format, import semantics, permissions or lock lifecycle need a design explanation, failure tests and a recovery analysis. Do not silently downgrade KDF parameters, change OTP settings, or discard unsupported imported records. New migration adapters need versioned fixtures from the source application before broad compatibility claims.

Use ordinary, descriptive commits. Do not publish real vaults or private signing keys. Security reports belong in a private channel; see SECURITY.md. Contributions are licensed GPL-3.0-or-later.
