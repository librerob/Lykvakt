# Compatibility

| Environment / capability              | Status                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Chromium 120+ / Manifest V3           | Build target; observed integration results are recorded in [validation](validation.md)                                  |
| Linux Chrome for Testing 156.0.8078.4 | 34 browser scenarios, the AMOLED axe check and one headed tab-lock check passed in the linked CI run                    |
| Windows development host              | Build, lint, formatting and unit tests passed; local browser launch was blocked, so browser success is attributed to CI |
| Firefox / Safari                      | No supported package or validation                                                                                      |
| Chrome Web Store                      | No submission or approval                                                                                               |

## Existing vaults and backups

The IndexedDB identity and `otp-vault` encrypted-envelope format remain stable. Payload schema 1 is read as schema 2; new saves use schema 2. A migrated account snapshot requires new backup verification. Older builds may not read newer payloads.

For legacy compatibility, new envelopes retain an empty `passkeys` array, and old slots are authenticated and stripped on password unlock when saving succeeds.

If cleanup persistence fails, password access remains available and a later save retries it. Legacy metadata has no UI behavior. Password normalization first tries NFKC and can retry the original raw encoding for old archives when the forms differ.

Changing an unpacked folder or extension identity can create separate browser-local data. Preserve the existing installation and verify an independent encrypted backup before changing it. There is no guaranteed OS-lock signal; locks follow the page/session events described in [architecture](architecture.md).

## Moving accounts

See [migration](migration.md) for the supported Aegis, 2FAS, Google transfer, OTP-link and QR flows. Destination apps may interpret OTP settings differently. No exhaustive phone interoperability certification or independent security audit is claimed.
