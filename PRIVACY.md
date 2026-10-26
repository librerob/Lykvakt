# Privacy

Accounts and selected files are processed locally: no developer server, registration, ads, telemetry or account-data upload. No Chrome Web Store submission or approval is claimed.

Permission: exactly ["clipboardWrite"]. No host/optional permissions, background worker or content scripts. Copy requires a click or non-empty search plus Enter; confirmation names the account. Lykvakt never reads the clipboard. Clipboard history and other apps may retain codes.

IndexedDB holds the encrypted vault and previous revision. localStorage holds timeout, code-visibility, Next and first-run-tip preferences. Keys exist only while unlocked; closing or hiding the page locks it.

Saves preserve the previous encrypted revision atomically. Password change rotates the key and deletes that copy atomically. Structural recovery needs explicit selection and a password. Earlier previews cannot be opened or recovered. Confirmed erasure affects local records, never external files.

Argon2id uses bundled JavaScript in a worker, without WebAssembly or remote code. Public format/password parameters are authenticated, not encrypted. JavaScript cannot guarantee erasure.

Backups are user-saved files; verification tests one without replacing accounts. Plaintext export and transfer QR require password verification and contain secrets. Password change cannot revoke retained files.

Browser sync/profile backups, other extensions, the OS and malware are outside the app's control. There is no password reset or developer recovery service. See [design and recovery](docs/design.md).
