# Chrome Web Store preparation (not submitted)

These texts describe the cleanup branch. No Store upload, payment, submission or approval has occurred.

## Short description

Offline TOTP/HOTP authenticator with a password-encrypted local vault and encrypted backups you can test restoring.

## Description

Lykvakt is an open-source development preview for test accounts. Generate TOTP/HOTP codes offline, organize accounts, import setup keys or user-selected QR images, and save encrypted backups with a passphrase you choose. Open the actual saved file to test restoration without replacing your accounts. The interface has one true-black AMOLED appearance with the pink accent from the Lykvakt logo.

Password verification is required before plaintext setup-secret export or transfer QR reveal. Password change rotates the vault key. Existing password-protected vaults and backups remain readable; legacy passkey slots are authenticated and then stripped on password unlock when persistence succeeds. Passkey unlock/enrollment is no longer available.

The extension has no server, telemetry, advertising, registration, subscription or paid tier. It does not look up websites, fill forms, capture tabs or inject page scripts. Keep your existing authenticator, service recovery codes and separately stored verified backups. No independent security audit has occurred, and TOTP remains phishable.

## Permissions and privacy

The exact manifest permission set is `["clipboardWrite"]`, used only to copy a selected OTP after a click. There are no optional or host permissions: no `activeTab`, `tabs`, `scripting` or `storage`. The extension has no background service worker. The encrypted vault uses IndexedDB; code-visibility/timeout preferences use localStorage. QR import uses files explicitly selected by the user, with no camera or screen access.

Use [PRIVACY.md](../../PRIVACY.md) as the policy. Authentication information is sensitive even when handled only locally. Verify the live Store questionnaire wording and public policy hosting before submission.

## Remaining portal work

The name and publisher identity need final review. Icons are in `public/icons/`; browser CI produces genuine synthetic-account screenshots. Final Store asset dimensions, promotional tiles, public policy hosting and a stable Store extension identity remain to be completed. Older screenshots/release notes may show features removed by this branch.
