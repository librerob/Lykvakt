# Threat model

Protected assets are OTP seeds, counters, metadata, vault keys and readable backups. Trusted components are the OS, browser isolation, Web Crypto, shipped code and build chain. This is an engineering description, not an independent audit.

The complete manifest permission set is `["clipboardWrite"]`. Supplied import files and account data are processed locally. There are no optional or host permissions and no developer backend.

| Scenario                                        | Mitigation                                                                               | Remaining exposure                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Stolen closed profile or backup                 | Password KDF, random vault key, authenticated encryption and independent backup password | Offline guessing; ciphertext size and envelope metadata                  |
| Malware, hostile debugger or compromised update | Browser isolation and nonextractable keys                                                | Hostile code can read unlocked data; JavaScript cannot guarantee erasure |
| Phishing                                        | The user controls copying and later pasting                                              | TOTP remains phishable; same-device factors reduce separation            |
| Clipboard reader/history                        | Copy after a click; no clipboard reading                                                 | OS and other apps may retain copied codes                                |
| Hostile import/image                            | Size/count/dimension bounds, validation, skipped-entry report and explicit preview       | Parser/decoder defects and incomplete interoperability coverage          |
| Tampered ciphertext/header                      | Authenticated encryption and strict schema                                               | Corruption/deletion can deny access; no trusted anti-rollback anchor     |
| Corrupted active envelope                       | Explicit password-authenticated older-copy recovery                                      | The previous copy may be older, unavailable or corrupted too             |
| Stale/concurrent write                          | Revision-checked transaction and one pending save                                        | Another window may show stale data until reopened                        |
| Lock during async work                          | Epoch guards and abort signals                                                           | Committed writes cannot be undone; no guaranteed OS-lock signal          |
| Lost password/profile                           | Independently stored encrypted backup and saved-file restoration test                    | No reset service; losing every usable copy can lose accounts             |
| Accidental plaintext export                     | Fresh master-password verification and explicit warning                                  | Anyone holding the exported seed can generate codes                      |
| Dependency/build compromise                     | Small bundled runtime set, lockfile and pinned CI actions                                | Pinning and vulnerability feeds do not prove safety                      |

Password change rotates the vault key and atomically removes the older local recovery copy. An old envelope/password key cannot open subsequent saves. Independently retained snapshots and backups keep their original credentials. The local previous copy is not an independent backup or guaranteed secure deletion mechanism.

For legacy compatibility, new envelopes retain an empty `passkeys` array, and old slots are authenticated and stripped on password unlock when saving succeeds.

Failed legacy cleanup does not block password access or bypass cancellation checks. Retained schema metadata grants no access beyond the extension page. Removing old wrappers alone does not revoke a previously recovered key; password change performs that rotation.

KDF validation is bounded to 600,000–5,000,000 iterations, with a current new-slot default of 600,000. NFKC-first unlock with a legacy raw-string fallback can require two bounded derivations. Canonical header/snapshot ordering uses deterministic code-unit comparison.

The current parser fuzz suite exercises 30,000 deterministic mutations; this is bounded regression coverage, not exhaustive adversarial review. Independent review, recovery drills, manual screen-reader testing and long-duration storage testing remain necessary before important-account use.
