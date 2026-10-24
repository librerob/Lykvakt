# Privacy

OTP Vault development preview, 24 October 2026.

Secrets, service names, identifiers, favorites, groups and backup-verification history are stored together inside an authenticated encrypted IndexedDB document. The unencrypted envelope exposes the format, random vault identifier, revision, ciphertext size, password KDF parameters and optional passkey credential identifiers/wrappers.

Unlocked data and nonextractable CryptoKeys live in the extension page’s memory. Neither `chrome.storage.session` nor browser sync receives a vault key. Theme, accent and inactivity settings are unencrypted local preferences. Optional automatic detection is an unencrypted boolean in `chrome.storage.local`.

The extension has no telemetry, analytics, advertising, accounts or developer backend. No external fetch is used at runtime. Bundled directory JSON is read from the extension package. Clicking a documentation link opens that external site, which receives the usual browser request. The browser/passkey provider can perform its own operations during a user-requested WebAuthn ceremony; OTP Vault does not control a provider’s synchronization or privacy practices.

## Permissions

| Permission        | Purpose                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`       | Read the current address after the user opens the popup, for a local directory check.                                                                                   |
| `storage`         | Save the optional automatic-indicator preference. The encrypted vault uses IndexedDB.                                                                                   |
| `clipboardWrite`  | Copy a specific OTP after a user click. Clipboard readers and history may retain it.                                                                                    |
| `tabs` (optional) | Observe addresses of open tabs for automatic local badges. This grants broader URL visibility; it is requested explicitly. Disabling the option removes the permission. |

No website host permissions, content scripts, camera access, clipboard reading, native helper, notifications or web-accessible resources are declared. No browsing history, visited-domain list or page contents are retained. Directory support indicators reveal nothing about the user’s accounts and work independently of the locked vault.

## Export and deletion

Backups are encrypted with their own password and fresh key material. A separately confirmed single-account URI export is plaintext and contains a secret. QR files and import text are processed locally and are not logged.

Deleting an account replaces the active encrypted document without an application trash. Browser databases, OS backups and old exported files may retain previous ciphertext. Physical/forensic erasure cannot be guaranteed. Uninstalling the extension removes its browser-managed local storage, so verify a usable backup first.
