# Chrome Web Store preparation (not submitted)

These texts describe the current development build. No Store upload, payment, submission or approval has occurred.

## Short description

Offline TOTP/HOTP authenticator with a password-encrypted local vault and encrypted backups you can test restoring.

## Description

Lykvakt is an open-source, unaudited development preview. Use test accounts only and keep your existing authenticator. Generate TOTP/HOTP codes offline, organize accounts, import setup keys or user-selected QR images, and save encrypted backups with a passphrase you choose. Select the actual saved file to test restoration without replacing your accounts. The interface has one true-black and pink appearance, keyboard-accessible help, clear progress messages and a first-run backup checklist. New vaults and backups use Argon2id in bundled JavaScript, without WebAssembly. Optional local tuning shows a result before an authenticated save.

Codes are hidden by default, with timed reveal and copying after a click or Enter in search. Optional next-code preview follows the same masking state and never changes counter-based accounts. The suggested popup shortcut is Alt+Shift+Y (Command+Shift+Y on Mac), rebindable at chrome://extensions/shortcuts. Master-password verification is required before plaintext setup-secret export or transfer QR reveal. Password change rotates the vault key and atomically removes the older local recovery copy. Independently exported backup files retain their own passphrases. Supported older files remain readable; older Lykvakt versions cannot open new Argon2id files.

Supported imports include standard OTP links, complete Google transfer batches and supported plaintext Aegis/2FAS exports. Import previews report skipped records and require confirmation. The extension has no server, telemetry, advertising, registration, subscription or paid tier.

Keep service recovery codes and verified backups separately from the browser. There is no password reset. No independent security audit has occurred, and TOTP remains phishable.

## Permissions and privacy

The exact manifest permission set is `["clipboardWrite"]`, used only to copy a selected OTP after a click or Enter in search. There are no optional or host permissions. The encrypted vault uses IndexedDB; code-visibility, next-code, timeout and first-run-tip preferences use localStorage. Public password-protection parameters can reveal an approximate tuning-speed setting; the speed test uses throwaway random inputs and sends nothing to a server. QR decoding processes files explicitly selected by the user. Account data and imported files are not uploaded.

Use [PRIVACY.md](../../PRIVACY.md) as the policy. Authentication information remains sensitive when processed locally. Verify the live Store questionnaire wording and public policy hosting before submission.

## Remaining portal work

The name and publisher identity need final review. Icons are in `public/icons/`; browser CI produces genuine synthetic-account screenshots. Final Store asset dimensions, promotional tiles, public policy hosting and a stable Store extension identity remain to be completed.
