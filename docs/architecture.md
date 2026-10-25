# Architecture

One TypeScript extension page owns the UI, unlocked data and nonextractable CryptoKeys. Vite bundles the page, QR components and passphrase wordlist. The complete manifest permission set is `["clipboardWrite"]`; there are no optional or host permissions.

IndexedDB stores encrypted envelopes. Code-visibility and timeout preferences use localStorage. The single true-black and pink appearance is defined in CSS. All executable assets are bundled; the CSP restricts connections, scripts and styles to the extension origin and forbids frames and objects.

## Vault and session

A save validates the account payload, encrypts it with fresh content-key material and compares the stored vault ID/revision before writing. An ordinary commit preserves the previous encrypted envelope in the same transaction. Stale or concurrent writers fail rather than overwrite another window’s state.

Loading a structurally invalid or missing active envelope can offer a readable previous revision. The user must explicitly choose it and authenticate with its password. The next save promotes it while comparing against the actual active record and advancing beyond that record’s revision. An incorrect password does not trigger recovery automatically.

Unlock authenticates the existing header before applying supported compatibility cleanup or KDF upgrades. See [cryptography](cryptography.md) for the bounded read rules. Password change generates a fresh random vault key and wrapper; the rotated active write and deletion of the older local copy are atomic. Session key adoption happens only after a successful commit.

Keys are never shared between extension pages. Explicit lock, inactivity, page hiding/closure and switching away from a full-window view remove key/data references and sensitive dialogs. Tab IDs and activation events support that lock without reading page URLs. Guaranteed OS-lock detection is not claimed.

Async work carries a session epoch and pending writes carry an abort signal. Late results cannot reopen a locked session. A write that has already committed cannot be undone. JavaScript cannot guarantee memory zeroization.

## Import and export

Bounded parsers accept standard OTP links, complete Google transfer batches, supported plaintext Aegis/2FAS exports and user-selected QR images. Invalid individual records have visible index/reason reports. Structural errors, incomplete batches and zero-valid-record files fail. The user reviews accounts, duplicates and skipped entries before an atomic save; conflicting configurations sharing a seed/type block confirmation.

Legacy account metadata remains validated and encrypted so supported old backups round-trip. It grants no access beyond the extension page.

Backup verification decrypts the actual selected file, validates records, generates test codes and compares account snapshots without replacing the vault. Plaintext OTP export and transfer QR reveal require fresh master-password verification. A code is written to the clipboard only after a click.

Web Crypto supplies HMAC, PBKDF2, AES-GCM and AES-KW. Runtime QR dependencies are `jsqr` and `qrcode`, with `dijkstrajs` bundled by the latter. There is no runtime cryptography package. Seven-word passphrases are generated locally with rejection sampling over browser-provided random values.
