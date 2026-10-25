# Threat model

Protected assets: OTP seeds, HOTP counters, metadata, vault keys and readable backups. Trusted components: the OS, browser isolation, Web Crypto, shipped code and build chain. This is a first-party engineering description, not an independent audit.

The sole manifest permission is `clipboardWrite`. There are no optional/host permissions, worker, directory feature, page injection, tab capture, camera, passkey provider or developer backend. User-selected QR files and exports are processed locally.

| Scenario                                        | Mitigation                                                                               | Remaining exposure                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Stolen closed profile or backup                 | Password KDF, random vault key, authenticated encryption and independent backup password | Offline guessing; ciphertext size and envelope metadata                                     |
| Malware, hostile debugger or compromised update | Browser isolation and nonextractable CryptoKeys                                          | Hostile code can read unlocked data; JavaScript cannot guarantee erasure                    |
| Phishing website                                | No website access, fill, capture or vault message API                                    | The user can still paste an OTP into a phishing page; same-device factors reduce separation |
| Clipboard reader/history                        | Copy only after a click; no clipboard reading                                            | OS and other apps may retain copied codes                                                   |
| Hostile import/image                            | File/dimension/count bounds, validated records, visible skipped-entry report and preview | Parser/decoder defects; no comprehensive fuzzing or phone interoperability certification    |
| Tampered ciphertext/header                      | AES-GCM/AES-KW authentication and strict schema                                          | Corruption/deletion can deny access; no trusted anti-rollback anchor                        |
| Stale/concurrent write                          | Revision-checked transaction and single pending save                                     | Another window may show stale data until reopened                                           |
| Lock during async operation                     | Epoch guards and abort signals for pending storage writes                                | Already committed transactions cannot be rolled back; no guaranteed OS-lock signal          |
| Lost password/profile                           | Independently stored encrypted backup and saved-file restoration test                    | No password reset or server recovery; loss of every usable copy can lose accounts           |
| Accidental plaintext export                     | Fresh master-password verification and explicit warning                                  | Anyone holding the exported secret can generate codes                                       |
| Dependency/build compromise                     | Small runtime set, lockfile, no install scripts, pinned CI actions                       | Pinning and vulnerability feeds do not prove safety                                         |

Password change rotates the vault key atomically; an old envelope/password key cannot open later documents. Older snapshots and independent backups retain their original credentials. KDF validation accepts a fixed minimum of 600,000 and maximum of 5,000,000 iterations; the current new-slot default is 600,000. Raising that default does not invalidate accepted old archives. NFKC is tried first, with a raw-string authentication fallback for legacy passwords when the forms differ; this can require two bounded derivations.

Legacy passkey slots remain readable only as authenticated header metadata. Password unlock attempts a revision-checked reseal with an empty array. A failed strip does not block password access and does not bypass epoch/cancellation checks. New writes require an empty array. Removing wrappers does not rotate the vault key or revoke a previously stolen key; password change performs key rotation. Old `origins` metadata is preserved only for schema compatibility and grants no website access.

Header canonicalization and snapshot ordering use deterministic code-unit comparison. Existing ASCII header bytes remain identical. Frozen legacy fixtures cover password unlock, raw Unicode passwords, old payload schema and slot migration. An independent review, adversarial fuzzing, recovery drills and manual screen-reader testing remain necessary before important-account use.
