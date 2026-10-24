# Moving accounts, scanning and filling

Lykvakt 0.2.0-rc.1 is an unaudited development preview.

## Import

- Standard `otpauth://` TOTP/HOTP links: one per line, a text file or QR images.
- Google Authenticator: choose Transfer accounts → Export accounts on the phone. Save private images of every transfer QR, then select them together in Import accounts. Every batch part must be present exactly once. Different batches, incomplete batches and conflicting accounts are refused without saving anything. SHA-1/256/512, six/eight digits and nonnegative signed-int64 HOTP counters are supported; transfer format version 1 only. Transfer TOTP periods are 30 seconds because the format has no period field. MD5, unspecified algorithms/digits/types and malformed records are refused.
- Unencrypted Aegis envelope v1/database v3 and 2FAS schema v4 exports. Encrypted third-party files require decryption/export in the source app first.

Compare the previewed codes with the source app, import, create and verify an encrypted backup, then test login before removing the source authenticator. A matching generated code is not a successful website login.

## Export

Edit an account → Show transfer QR reveals a standard OTP QR for the destination app’s scanner. Edit also exports its plaintext OTP link. Recovery → Export plaintext OTP links exports every account with its algorithm, digits, period or exact counter. These formats contain secrets. Favorites, groups and website approvals require an encrypted Lykvakt backup. Google’s proprietary batch QR export and native Aegis/2FAS export formats are not generated. Destination apps may not honor every standard OTP parameter; compare settings and codes. Test physical phone migration before relying on it.

## Scan the visible website

Open Lykvakt with Chrome’s toolbar button on the HTTPS setup page, unlock, then click Scan this tab. The visible area is captured once, decoded locally and discarded without persistence. Only authenticator payloads proceed to an import preview; arbitrary URLs are never opened. Up to 20 readable QR codes in one image are supported, bounded by image dimensions. Very small, overlapping, off-screen or obscured codes can require zooming or a cropped image. A changed tab/address aborts capture. No passive/background screen capture occurs. The full-window view cannot capture a different tab; use the toolbar popup.

## Fill a code

Open the toolbar popup on the HTTPS sign-in page and click Fill on the intended account. First use requires confirmation of the exact origin, including a nondefault port. Approval is encrypted with the account; subdomains receive no implicit approval. Edit → Remove website approvals revokes them.

Only one visible, enabled, writable, empty top-frame input explicitly marked `autocomplete="one-time-code"` is supported. Hidden/password fields, ambiguous matches, short fields, segmented boxes, frames and guessed selectors are refused. Use Copy when filling cannot be done safely. No code is filled merely by visiting a page or opening the extension. The page receives only the selected code on a click; it never receives the setup secret. The extension emits input/change events and never submits a form. A website’s own scripts may react to those events. OTP remains phishable and website approval cannot make a compromised site safe.

## Existing vaults

Database identity and encrypted-envelope format stay unchanged. Payload schema 1 is read as schema 2 with no approved websites; backup-verification health resets until a new file is verified. Subsequent saves use schema 2, which older previews reject. Back up before upgrading and keep the same installed extension identity. A different unpacked folder or Store identity can have separate storage and passkey credentials.
