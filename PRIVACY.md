# Privacy

Lykvakt development preview, 25 October 2026.

OTP secrets, service/account identifiers, favorites, groups, legacy metadata and backup-verification history are stored in an authenticated encrypted IndexedDB document. Its envelope exposes format/version, random vault ID, revision, ciphertext size and password KDF parameters.

Ordinary saves retain the previous encrypted envelope in the same database for explicit corruption recovery. Password change rotates the vault key and deletes that older copy in the same transaction. This does not erase exported files, OS backups or browser-managed remnants.

Unlocked data and nonextractable CryptoKeys live in the extension page. Code-visibility and timeout preferences use unencrypted localStorage. JavaScript strings, browser internals and OS paging prevent guaranteed memory erasure.

There is no developer backend, telemetry, analytics, advertising, registration or cloud sync. Executable code, QR components and the passphrase wordlist are bundled locally. Imported files and account data are not uploaded or logged.

## Permissions

The complete manifest permission set is `["clipboardWrite"]`, for copying a selected OTP after a click. The extension does not read the clipboard. OS history, other apps and clipboard managers may retain copied codes. There are no optional or host permissions.

Full-window locking uses tab IDs and activation events without reading page URLs. The vault uses IndexedDB and UI preferences use localStorage.

## Import, export and deletion

Only supplied text/files and user-selected QR image files are decoded. Invalid individual records are reported before the user confirms an import. Structural errors and incomplete transfer batches save nothing.

Encrypted backups have independent passphrases. Plaintext OTP-link exports and transfer QRs contain setup secrets and require master-password verification. The user controls any later sharing or pasting.

Deleting an account replaces the active encrypted document; there is no application trash. The previous revision or independently saved copies can still contain it. Browser databases and OS backups can retain older ciphertext, so physical erasure is not guaranteed. Uninstalling removes browser-managed local data: verify an independently stored backup first.
