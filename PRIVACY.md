# Privacy

Lykvakt development preview, 25 October 2026.

OTP secrets, service/account identifiers, favorites, groups, legacy metadata and backup-verification history are stored in an authenticated encrypted IndexedDB document. Its envelope exposes format/version, random vault ID, revision, ciphertext size and password KDF parameters. Argon2id memory/pass settings are authenticated but plaintext; optional local tuning can reveal an approximate machine-speed setting.

Ordinary saves retain the previous encrypted envelope in the same database for explicit corruption recovery. Password change rotates the vault key and deletes that older copy in the same transaction. Successful password-protection upgrades also remove superseded local recovery copies atomically; a transient optional-upgrade write failure leaves authenticated access available with a retry reminder. A revision conflict clears the stale session and requires a fresh unlock. This does not erase exported files, OS backups or browser-managed remnants.

Unlocked data and nonextractable CryptoKeys live in the extension page. Code-visibility, next-code-preview, timeout and first-run-tip preferences use unencrypted localStorage. Protection settings are stored in the authenticated file header; choosing or testing a setting does not save it without password authentication. JavaScript strings, browser internals and OS paging prevent guaranteed memory erasure.

There is no developer backend, telemetry, analytics, advertising, registration or cloud sync. Executable code, the JavaScript Argon2id worker, QR components and the passphrase wordlist are bundled locally. The extension ships and uses no WebAssembly. The worker returns a nonextractable key, is terminated when its operation ends or is cancelled, and makes no network requests. Calibration runs only after an explicit click and uses throwaway random inputs. Imported files and account data are not uploaded or logged.

## Permissions

The complete manifest permission set is `["clipboardWrite"]`, for copying a selected OTP after a click or Enter in a non-empty account search. The confirmation names the copied account. The extension does not read the clipboard. OS history, other apps and clipboard managers may retain copied codes. There are no optional or host permissions.

Full-window locking uses tab IDs and activation events without reading page URLs. The vault uses IndexedDB and UI preferences use localStorage.

## Import, export and deletion

Only supplied text/files and user-selected QR image files are decoded. Invalid individual records are reported before the user confirms an import. Structural errors and incomplete transfer batches save nothing.

Encrypted backups have independent passphrases. Plaintext OTP-link exports and transfer QRs contain setup secrets and require master-password verification. The user controls any later sharing or pasting.

Deleting an account replaces the active encrypted document; there is no application trash. The previous revision or independently saved copies can still contain it. Browser databases and OS backups can retain older ciphertext, so physical erasure is not guaranteed. Uninstalling removes browser-managed local data: verify an independently stored backup first.
