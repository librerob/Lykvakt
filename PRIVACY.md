# Privacy

Lykvakt minimized development preview, 24 October 2026.

Secrets, service/account identifiers, favorites, groups, legacy origins metadata and backup-verification history are stored in one authenticated encrypted IndexedDB document. Its outer envelope exposes format/version, random vault ID, revision, ciphertext size and password KDF parameters. Old envelopes may also contain legacy passkey wrapper metadata; password unlock authenticates it and attempts to strip it. New writes require an empty `passkeys` array.

Unlocked data and nonextractable CryptoKeys live only in the extension page. Appearance and timeout settings are unencrypted localStorage preferences. No Chrome storage API or sync is used. JavaScript and browser internals prevent guaranteed memory erasure.

The extension has no developer backend, telemetry, analytics, advertising, registration or cloud sync. Executable code and QR components are bundled locally. There is no directory dataset, background worker, passkey ceremony, website lookup, form filling, page injection, tab capture, camera access or external runtime request.

## Permissions

The complete manifest permission set is `["clipboardWrite"]`: a user-clicked OTP can be copied. Clipboard readers, OS history and other apps can retain that code. No clipboard reading occurs. There are no optional permissions, host permissions, `activeTab`, `tabs`, `scripting` or `storage` permission. IndexedDB and localStorage do not require Chrome's storage permission. Basic tab IDs/activation events support full-window locking without reading URLs.

## Import, export and deletion

Only user-selected QR image files and supplied import text/files are decoded. They are not uploaded or logged. Invalid records are reported before the user confirms valid accounts; structural errors and incomplete batches save nothing.

Backups have independent password encryption. Plaintext OTP-link exports and revealed transfer QRs contain setup secrets and require master-password verification. No website receives an OTP automatically. The user controls any later sharing or pasting.

Deletion replaces the active encrypted document without application trash. Browser databases, OS backups and exported files can retain older ciphertext; physical erasure is not guaranteed. Password change rotates the active vault key but does not revoke older exported copies. Uninstalling removes browser-managed local storage, so verify an independently stored backup first.
