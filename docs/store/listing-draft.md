# Chrome Web Store preparation (not submitted)

The product name and publisher identity still need final review. These texts describe the current preview; they are not a Store approval or an invitation to move critical accounts.

## Short description

Offline authenticator with an encrypted local vault and encrypted backups you can test restoring.

## Description

Lykvakt is an open-source development preview for dedicated test accounts. Generate TOTP and HOTP codes offline, organize accounts, and save encrypted backups protected by a passphrase you choose. Open the actual saved file to test restoration without replacing your active accounts.

Secrets and account metadata stay encrypted in the local browser profile. The extension has no developer backend, telemetry, advertising, account registration or paid tier. Website-support checks use bundled 2FA Directory data. Optional automatic toolbar indicators require access to open-tab addresses and check those addresses locally.

Passkey unlock is experimental and requires real WebAuthn PRF output. Physical Windows Hello, Touch ID and security-key support has not been validated. A password remains available; exported backups do not depend on a passkey.

No independent security audit has occurred. Keep your existing authenticator, service recovery codes and a separately stored, verified backup. TOTP is not phishing-resistant. A compromised computer can expose unlocked secrets.

## Privacy fields

Use PRIVACY.md as the authoritative policy. Locally processed authentication information is sensitive even when it is never sent to the developer. Store questionnaire answers must accurately distinguish local handling from collection/transmission; verify the live dashboard wording before submission.

Required permissions: activeTab for user-triggered site lookup, visible-tab QR capture and filling; scripting for an explicitly selected OTP filled into an approved origin; storage for one local feature preference; clipboardWrite for a clicked code. Optional tabs grants URL visibility for all open tabs, used only for local support badges. No standing host access, automatically registered content scripts, camera or clipboard-read permission is requested. Captures stay local; a selected OTP is disclosed to the approved website on an explicit Fill click.

## Assets and remaining portal work

Original icon files are in public/icons/ at 16, 32, 48 and 128 pixels, with editable SVG source. Genuine synthetic-account screenshots are produced by the Chromium suite. Final Store screenshot dimensions, promotional tiles, public policy hosting, stable extension identity and branding must be completed after review. No Store upload, payment or submission has been performed.
