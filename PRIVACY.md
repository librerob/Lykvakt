# Privacy

Lykvakt processes your accounts and the files you select on your device. There is no developer server, registration, advertising, telemetry or account-data upload.

## Browser access and copying

The permission set is exactly ["clipboardWrite", "storage", "alarms"]. The clipboardWrite permission is used when you choose to copy a code. Storage and alarms support the timed unlock session. There are no host or optional permissions or content scripts. Background code handles only local session state and expiry; it makes no network requests.

Lykvakt receives clipboard data only when you paste into an import form. It does not monitor or read the clipboard in the background and does not request clipboardRead. QR images you paste or drop are processed locally and are not saved as drafts. Clipboard history, clipboard managers and other apps may keep copies of codes or images you copy.

## What stays in the browser

IndexedDB stores the encrypted vault and its previous revision. localStorage stores your auto-lock choice, confirmation if you selected the browser-restart option, code-visibility and Next preview preferences, and whether you dismissed the first-run tips.

Browser storage.session holds temporary unlock material, a fingerprint of the encrypted vault and an expiry deadline. It also holds small unfinished Add account forms or pasted OTP-link drafts. Whole pasted export archives are not cached. The master password, backup passphrases and import-file passwords are never cached.

The popup and window share this temporary session so you can switch away and return without another password prompt. Lykvakt does not write it to local or sync storage. Closing a view clears its local key and form references; the shared session remains until expiry or **Lock**. The default is five minutes of inactivity. Other choices include **When the browser restarts**.

The browser clears session storage when it restarts or the extension is reloaded, disabled or updated. This does not guarantee forensic erasure from browser memory or operating-system copies.

An ordinary save keeps the previous encrypted revision in the same transaction as the new one. Changing your master password rotates the key and deletes the old copy atomically. If the current record is structurally damaged, recovery requires you to choose the older copy and enter its password. Earlier previews cannot be opened or recovered by this version. Confirmed erasure affects only local records, never external files.

Argon2id runs as bundled JavaScript in a worker, with no WebAssembly or remote code. The format and password parameters are public: they are authenticated, but not encrypted. JavaScript cannot guarantee that every copy of sensitive data has been erased from memory.

## Files you save or transfer

You choose where to save backup files. Verification opens the selected file and tests restoration without replacing your accounts. Creating an encrypted backup, exporting plaintext OTP links and revealing a transfer QR require your master password again. Plaintext exports and transfer QR codes contain setup secrets.

Changing the vault password cannot revoke copies of files you've already saved or shared. Browser sync, profile backups, other extensions, the operating system and malware are outside Lykvakt's control. There is no password reset or developer recovery service.

The [design and recovery guide](docs/design.md) describes the storage format and recovery process in more detail. Help & documentation works locally. Its optional full-guide link opens GitHub only when selected; no account information is included in that link.

## Data used by the authenticator

OTP setup secrets, vault and backup passphrases, and passwords for encrypted import files are authentication information. Optional account labels can contain usernames or email addresses. QR images and export text you select are processed locally to read supported OTP accounts. The account converter keeps only supported account fields; it doesn't save the original import file or QR image in the vault. Files you selected remain wherever you kept them outside the extension.

## Retention and removal

The local vault stays in this browser profile until you remove it. Deleting an account removes it from the current vault, but the previous encrypted revision may still contain it. A later ordinary save replaces that previous revision, and changing the master password deletes it. Uninstalling the extension removes its local browser storage. Copies in browser-profile backups and files you saved elsewhere are outside the extension's control and must be managed separately.

To remove saved backup files or plaintext exports, delete those files yourself. Clearing a form or deleting a local record cannot guarantee forensic erasure of browser or operating-system copies.

## Limited Use

Lykvakt uses user information only to provide its local authenticator, import, export and recovery features. Its use of information follows the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq#limited-uses-of-user-data), including the Limited Use requirements.

User information is not sold, used for advertising, used to determine creditworthiness or used for unrelated purposes. There is no developer backend that receives vault contents, and the extension does not automatically share them with third parties. You choose when to copy codes or save and transfer files.

## Contact

For privacy questions, open a [GitHub issue](https://github.com/librerob/lykvakt/issues) without including private account information. Report security-sensitive findings through [private vulnerability reporting](https://github.com/librerob/lykvakt/security/advisories/new). Never post real passwords, setup secrets, QR codes or vault files.
