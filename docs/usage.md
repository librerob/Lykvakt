# Using Lykvakt

Lykvakt keeps your authenticator accounts in an encrypted vault on this device. The toolbar button, Ctrl+Shift+Y, or Command+Shift+Y on Mac opens a small popup.

## Opening and locking

The popup locks when it closes, hides or loses focus. In Settings, choose **Open in a window** to keep Lykvakt open while you switch apps or tabs. This separate window asks for your password and defaults to a five-minute inactivity timer.

In **Settings → Auto-lock**, you can choose 1, 5, 15 or 30 minutes, or 1 hour of inactivity. Choose **When this window closes** to turn off the timer. Existing timer choices are kept when you update. Use **Lock** before leaving your computer.

Each view holds its own unlocked key in memory. Reloading or closing it loses the key, and reopening asks for your password. Chrome may also discard a page. No unlock key or password is saved to remember the session across a browser restart.

Closing another Chrome window does not necessarily quit Chrome while Lykvakt's window is still open. For a timed lock, Chrome can suspend background pages; the deadline is also checked before the next operation and when you return.

## Passwords

You choose the length of a new vault or backup password. It must be non-empty; the 1,024-character maximum bounds input size. We recommend a long, unique passphrase of at least 14 characters. Short passwords are easier to guess if somebody obtains your encrypted file.

**Generate** offers seven randomly chosen words. Write the phrase down before continuing, then confirm it. The suggestion disappears when you leave the field. Passwords are normalized consistently, so avoid relying on visually similar characters as different passwords.

There is no password reset or developer recovery service. Keep the password and a verified backup somewhere safe.

## Adding or importing accounts

Use the setup key or QR image supplied when you enable two-step sign-in on a service. This is different from the short code used to sign in.

Open **Backup → Import accounts**. Pasting setup links or export text works in either mode. File imports, QR images and backup-file selection require the explicit window: choose **Open in a window to choose a file**, unlock there, then choose the file. Chrome can close a popup while a native file chooser is open. Review the accounts and every skipped entry before saving. Check the new codes before retiring your existing authenticator. The [design guide](design.md#import-contracts-and-sources) explains format support and limits.

Steam support covers authentication codes, not trade or market confirmations. Its setup secret normally comes from a compatible export or another authenticator. Files containing it can also hold other sensitive data, so keep them private.

## Codes, copying and counters

Click an account row to copy the current code. The confirmation names the account. Clipboard managers and other apps may retain copied values.

Codes start hidden. Reveal a code separately to read it; timed reveals hide after 30 seconds. Switching away masks revealed codes in the window; leaving the popup locks it. **Always show codes** and the **Next** preview are optional settings. Copy always uses the current code.

Search for part of an account name and press Enter to copy the first match. An empty search copies nothing. Change the suggested shortcut at chrome://extensions/shortcuts if another app uses it.

HOTP accounts use a counter. Copying does not advance it. Confirm **More → Advance counter** only after the service consumes that code. Do not reuse a counter value you already submitted.

## Backups

In **Backup**, create an encrypted backup with a separate passphrase. You must confirm the master password before exporting account secrets.

Save the file outside the browser. Then choose **Verify or restore a backup**, open the actual saved file and enter its backup passphrase. Verification tests the file and compares its accounts without replacing your active vault. A matching result does not prove that websites will accept the codes.

To recover into a fresh vault, choose **Restore an encrypted backup** on setup. An existing vault uses a reviewed merge. Keep website recovery codes and independently stored backups.

## Moving accounts out

**Export plaintext OTP links** and an account's transfer QR contain setup secrets. Confirm the master password first. Anybody holding the file or QR can generate the same codes.

Check that the destination supports your account settings, verify its codes and remove temporary plaintext copies. Favorites and groups are not included in portable OTP links.

## Older copies and older versions

The browser keeps a previous encrypted revision for corruption recovery. If offered, you must choose it and enter its password. It can be missing recent changes; HOTP counters may be behind, so do not reuse submitted codes.

Very old preview formats need export through the working old app. See [migration and recovery](design.md#before-updating) before erasing an old vault. Changing labels or updating the UI does not add a legacy reader.

## Security and privacy

A fake sign-in page can steal a code, and compromised software can read unlocked data. Check the site before entering a code. There has been no independent security audit; the [security policy](../SECURITY.md), [privacy policy](../PRIVACY.md) and [design guide](design.md) explain the limits.

The extension's only permission is clipboardWrite. It has no content scripts, host permissions, background service worker or automatic account-data upload. It never reads or changes websites. The explicit Open in a window action only finds and focuses Lykvakt's own extension window.

The vault and code generation work offline. Essential help is bundled in the app and works offline. The optional full-guide link opens GitHub in a browser tab and needs an internet connection.
