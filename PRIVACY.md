# Privacy

Lykvakt development preview, 24 October 2026.

Secrets, service names, identifiers, favorites, groups, approved fill origins and backup-verification history are stored together inside an authenticated encrypted IndexedDB document. The unencrypted envelope exposes the format, random vault identifier, revision, ciphertext size, password KDF parameters and optional passkey credential identifiers/wrappers.

Unlocked data and nonextractable CryptoKeys live in the extension page’s memory. Neither `chrome.storage.session` nor browser sync receives a vault key. Theme, accent and inactivity settings are unencrypted local preferences. Optional automatic detection is an unencrypted boolean in `chrome.storage.local`.

The extension has no telemetry, analytics, advertising, accounts or developer backend. No external fetch is used at runtime. Bundled directory JSON is read from the extension package. Clicking a documentation link opens that external site, which receives the usual browser request. The browser/passkey provider can perform its own operations during a user-requested WebAuthn ceremony; Lykvakt does not control a provider’s synchronization or privacy practices.

## Permissions

| Permission        | Purpose                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`       | Temporary current-site access after toolbar invocation, for local lookup, explicit QR capture and approved filling.                                                     |
| `scripting`       | Inject a small function into the active page only after Fill is clicked. It receives the selected OTP and approved origin, never the secret.                            |
| `storage`         | Save the optional automatic-indicator preference. The encrypted vault uses IndexedDB.                                                                                   |
| `clipboardWrite`  | Copy a specific OTP after a user click. Clipboard readers and history may retain it.                                                                                    |
| `tabs` (optional) | Observe addresses of open tabs for automatic local badges. This grants broader URL visibility; it is requested explicitly. Disabling the option removes the permission. |

No standing website host permissions, automatically registered content scripts, camera access, clipboard reading, native helper, notifications or web-accessible resources are declared. No browsing history, visited-domain list or page contents are retained. Directory support indicators reveal nothing about the user’s accounts and work independently of the locked vault.

## Export and deletion

Backups are encrypted with their own password and fresh key material. Separately confirmed OTP-link exports and revealed transfer QRs are plaintext and contain secrets. QR files, Google transfer data, import text and user-requested visible-tab captures are processed locally and not logged or persisted. Captures can contain unrelated visible page content while being decoded. Explicit filling discloses the chosen OTP to the approved website; that site controls its own scripts.

Deleting an account replaces the active encrypted document without an application trash. Browser databases, OS backups and old exported files may retain previous ciphertext. Physical/forensic erasure cannot be guaranteed. Uninstalling the extension removes its browser-managed local storage, so verify a usable backup first.
