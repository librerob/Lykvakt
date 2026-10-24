# Compatibility

| Environment / capability                       | Status                                                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Manifest V3 / Chromium 120+ APIs               | Build target; real integration results recorded separately in validation                                                   |
| Windows host                                   | Type checking, unit tests and build executed; local Chrome for Testing launch was blocked by OS application-control policy |
| Linux Playwright Chromium                      | Passed 28 core, six virtual PRF, one headed tab-lock and four genuine toolbar capture/fill checks                          |
| macOS / Touch ID                               | Not physically tested                                                                                                      |
| Windows 10 / 11 Hello fingerprint, face or PIN | Not physically tested; PRF capability must actually yield a usable secret                                                  |
| FIDO2 keys / third-party passkey providers     | Not physically tested; user verification plus PRF required                                                                 |
| Firefox / Safari                               | No supported package or validation                                                                                         |
| Chrome Web Store                               | No submission or approval                                                                                                  |

PRF support is determined by actual returned cryptographic output and a repeatable wrap/unwrap test, not a browser or OS name. Browser support alone does not prove a particular authenticator/provider implements PRF. Password unlock remains the baseline. Credentials from a development extension origin are not portable to a different Store identity.

The UI’s auto-lock timers use local inactivity and page visibility/closure. No guaranteed OS-lock signal is implemented or claimed. Manual site detection requires activeTab authorization from opening the action popup. A full extension tab has no inherited temporary access to an unrelated site. Optional automatic indicators require tabs permission and provide directory-support information only.

See [migration and filling](migration-and-fill.md) for Google transfers, plaintext exports, exact-origin approvals, supported OTP fields and payload schema compatibility. Native optional-tabs prompts, physical phone imports and physical PRF devices remain manual gates.
