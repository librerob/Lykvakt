# Architecture

One TypeScript extension page owns the UI, unlocked data and nonextractable CryptoKeys. Vite bundles that page and the locally loaded QR components. There is no service worker, directory dataset, remote script, website content script, native companion or message-based vault API.

The only manifest permission is `clipboardWrite`. There are no optional or host permissions. IndexedDB stores the encrypted vault without a Chrome storage permission. Theme, accent and timeout preferences use localStorage. No `chrome.storage` API, website lookup, tab URL query, scripting injection or screen capture remains.

## Vault and session

The complete account payload is an authenticated encrypted IndexedDB document. Saves encrypt fresh content, then use the vault ID and revision in a compare-and-swap transaction. Stale or concurrent writers fail rather than overwrite another window's state. Pending writes carry an abort signal from the session.

Unlock derives the password key and authenticates the existing envelope before migration. A weaker accepted KDF slot is upgraded to the configured default. A legacy vault with passkey slots is resealed with `passkeys: []` through the same revision-checked commit path. Failure of legacy slot removal leaves password access available; later saves strip the slots again. New writes reject nonempty slots. The field remains in authenticated header data for compatibility.

Password change generates a fresh random vault key and switches the session key only after the new envelope commits. Keys are never shared between extension pages. Explicit lock, inactivity, page hiding/closure and a different active tab in the full-window view remove key/data references and sensitive dialogs. Basic tab IDs and activation events support the lock without granting URL access or requiring a tabs permission. OS-lock detection is not claimed.

Async operations carry a session epoch so late results cannot reopen a locked session. Lock aborts pending abortable storage transactions; a write that has already committed cannot be undone. JavaScript cannot guarantee memory zeroization.

## Import and export

Bounded parsers accept standard OTP links, Google transfer batches, supported plaintext Aegis/2FAS exports and user-selected QR image files. Structural errors and incomplete batches throw. Invalid individual records are listed with their positions/reasons; zero valid records also throws. The user reviews valid records, duplicates and skips before an atomic save. Conflicting configurations sharing a seed/type block confirmation.

The retained `origins` account field is validated and encrypted so old records/backups round-trip. No UI consumes or edits it, and it never authorizes page access.

Encrypted backup verification decrypts the actual selected file, validates records, generates test codes and compares snapshots without replacing the vault. Plaintext OTP-link exports and transfer QR reveal require fresh master-password verification. Only a clicked code is written to the clipboard.

Web Crypto supplies HMAC, PBKDF2, AES-GCM and AES-KW. The runtime QR dependencies are `jsqr` and `qrcode` (with its bundled `dijkstrajs` dependency). No runtime cryptography package or new dependency was added. All executable assets are bundled; the CSP restricts scripts/styles/connections to the extension origin and forbids frames and objects.
