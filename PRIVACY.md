# Privacy

Lykvakt processes accounts and selected files locally. There is no developer server, registration, advertising, telemetry or account-data upload.

The manifest permission set is exactly ["clipboardWrite"]. There are no host/optional permissions, background worker or content scripts. Clipboard writes follow a click or Enter after a non-empty account search; the confirmation names the account. The extension never reads the clipboard. Clipboard history and other apps may keep copied values.

The encrypted vault and its previous revision use IndexedDB. Timeout, code-visibility, next-code and first-run-tip preferences use localStorage. Keys exist only while the page is unlocked. Closing or hiding it locks the Session.

Ordinary saves keep the previous encrypted revision atomically. Password change rotates the key and removes that local copy in the same transaction. Structural recovery requires explicit selection and a password. Earlier-preview vaults are not opened or recovered; erasing them requires a separate confirmation and never deletes external files.

Argon2id runs in bundled JavaScript, normally in a local worker. There is no WebAssembly or remote runtime code. Public format/password parameters are authenticated but not encrypted. JavaScript cannot guarantee memory erasure.

Backups are files you choose to save. Verification tests a selected saved file without replacing accounts. Plaintext export and transfer QR require fresh password verification; those outputs contain secrets. Password changes cannot revoke independently retained files.

Browser sync/profile backups, installed extensions, the OS and malware are outside the app's control. There is no password reset or developer recovery service.

See [design and recovery](docs/design.md). No Chrome Web Store submission or approval is claimed.
