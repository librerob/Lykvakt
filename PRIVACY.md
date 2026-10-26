# Privacy

Lykvakt processes your accounts and the files you select on your device. There is no developer server, registration, advertising, telemetry or account-data upload. It has not been submitted to or approved by the Chrome Web Store.

## Browser access and copying

The permission set is exactly ["clipboardWrite"]. There are no host or optional permissions, background workers or content scripts. Copying a code requires a click, or a non-empty search followed by Enter. The confirmation names the account.

Lykvakt never reads the clipboard. Clipboard history, clipboard managers and other apps may keep copies of codes you copy.

## What stays in the browser

IndexedDB stores the encrypted vault and its previous revision. localStorage stores your timeout, code-visibility, Next preview and first-run-tip preferences. Keys are held only while the vault is unlocked; closing or hiding the page locks it.

An ordinary save keeps the previous encrypted revision in the same transaction as the new one. Changing your master password rotates the key and deletes the old copy atomically. If the current record is structurally damaged, recovery requires you to choose the older copy and enter its password. Earlier previews cannot be opened or recovered by this version. Confirmed erasure affects only local records, never external files.

Argon2id runs as bundled JavaScript in a worker, with no WebAssembly or remote code. The format and password parameters are public: they are authenticated, but not encrypted. JavaScript cannot guarantee that every copy of sensitive data has been erased.

## Files you save or transfer

You choose where to save backup files. Verification opens the selected file and tests restoration without replacing your accounts. Creating an encrypted backup, exporting plaintext OTP links and revealing a transfer QR require your master password again. Plaintext exports and transfer QR codes contain setup secrets.

Changing the vault password cannot revoke copies of files you've already saved or shared. Browser sync, profile backups, other extensions, the operating system and malware are outside Lykvakt's control. There is no password reset or developer recovery service.

The [design and recovery guide](docs/design.md) describes the storage format and recovery process in more detail.
