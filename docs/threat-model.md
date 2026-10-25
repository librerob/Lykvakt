# Threat model

Protected assets are OTP seeds, counters, metadata, vault keys and readable backups. Trusted components include the OS, browser isolation, Web Crypto, the bundled Argon2id implementation, shipped code and build chain. This is an engineering description, not an independent audit.

The manifest permission set is exactly ["clipboardWrite"]. There are no optional or host permissions, no developer backend and no remote code. A local module worker performs password derivation; it has no service-worker role or network task.

| Scenario                                | Mitigation                                                                             | Remaining exposure                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Stolen closed profile or backup         | Memory-hard Argon2id for new slots, random vault key and authenticated encryption      | Offline guessing remains possible; legacy files retain their original protection    |
| Hostile password parameters             | Exact-field and integer bounds before allocation; fixed p=1 and explicit memory budget | An accepted maximum-cost file can still consume substantial bounded time and memory |
| Malware, debugger or compromised update | Browser isolation and nonextractable keys                                              | Hostile code can read unlocked data; JavaScript cannot guarantee erasure            |
| Phishing                                | User-controlled copying and pasting                                                    | TOTP remains phishable; same-device factors reduce separation                       |
| Clipboard reader/history                | Copy only after a click or search Enter; no clipboard reading                          | OS history and other apps may retain codes                                          |
| Hostile import/image                    | Size/count/dimension bounds, preview and skipped-entry report                          | Parser/decoder defects and incomplete interoperability coverage                     |
| Tampered ciphertext/header              | Authenticated encryption and strict schema, including protection parameters            | Corruption/deletion can deny access; no trusted anti-rollback anchor                |
| Corrupted active copy                   | Explicit password-authenticated older-copy recovery                                    | Older data or HOTP counters can lag; do not reuse submitted codes                   |
| Stale/concurrent write                  | Typed revision conflict, stale-unlock rejection and one pending save                                      | Another window may need reopening                                                   |
| Lock during derivation or save          | Worker termination, abort signals and epoch guards                                     | Completed commits cannot be undone; no guaranteed OS-lock signal                    |
| Lost password/profile                   | Independent backup and saved-file restoration test                                     | No reset service; losing every usable copy can lose accounts                        |
| Accidental secret export                | Fresh master-password verification and explicit warning                                | Anyone holding the exported seed can generate codes                                 |
| Dependency/build compromise             | Exact-pinned runtime dependencies, lockfile and pinned CI actions                      | Pinning and vulnerability feeds do not prove safety                                 |

Password change rotates the vault key and atomically removes the older local copy. Unlock upgrades also remove superseded recovery copies atomically. Independently retained snapshots and backups keep their original credentials. The local previous copy is not an independent backup or secure-deletion mechanism.

For legacy compatibility, new envelopes retain an empty `passkeys` array, and old slots are authenticated and stripped on password unlock when saving succeeds.

A typed compare-and-swap conflict rejects a stale upgrade unlock and clears session keys and data; another unlock is required. Other optional write failures preserve authenticated access to the original envelope and expose read-only pending-upgrade state, which clears after a successful or unnecessary upgrade. Lock cancellation takes precedence over both outcomes. A later unlock retries the upgrade. Removing an old wrapper alone does not revoke a previously recovered vault key; password change performs that rotation.

Argon2id defaults to 64 MiB, three passes and one lane. Accepted stored bounds are 19,456–262,144 KiB, two–ten passes and one lane. Legacy PBKDF2 reads remain bounded to 600,000–5,000,000 iterations. Only legacy PBKDF2 can retry a raw string after NFKC normalization.

Calibration is opt-in, uses throwaway inputs and never applies a result without authentication. Public parameters can reveal an approximate machine-speed setting. A one-second local target does not make an attacker's GPU or optimized implementation take one second per guess.

Next-code preview is off by default, remains hidden with the current code, and never advances a HOTP counter. It is a convenience, not another security factor. Copy and the keyboard shortcut continue to use the current code only.

The extension uses no WebAssembly. Clearing byte arrays and terminating workers cannot guarantee erasure of strings, internal working memory, browser-managed copies or OS pages.

Parser fuzzing and known-answer tests are bounded regression coverage, not exhaustive adversarial review. Independent review, manual screen-reader testing, recovery drills, low-end-device performance and long-duration storage testing remain necessary before important-account use.
