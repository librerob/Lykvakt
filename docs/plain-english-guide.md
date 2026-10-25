# Plain-English guide

Lykvakt keeps sign-in codes on this computer. This is an unaudited development preview: use test accounts only and keep your existing authenticator.

## Start with these three things

1. Remember your vault password. A long phrase you use nowhere else is a good choice; Generate can suggest one. Keep a safe written copy because there is no password reset.
2. Save an encrypted backup somewhere outside this browser. It is a locked copy of your accounts with its own password. Keep that password separately from the file.
3. Choose Verify or restore a backup and select the real file you saved. This checks that the file opens and matches your accounts. It does not replace them.

The first-run tip card repeats these steps. Choose Got it to dismiss it. Open What does this mean? beside a setting whenever you want a short explanation.

## Find and copy a code

Unlock with your master password. Search for the service or account name, then choose Copy. You can also type part of an account name and press Enter in the search box to copy the first match. An empty search copies nothing, and the message names the account copied.

Codes start hidden. Choose a row's code to reveal it for 30 seconds; copying does not reveal it. Hiding or closing the page locks the vault.

The optional Show next code setting starts off. Turn it on if you want to see the code for the following time period when you reveal a code. Wait until the current one expires before using Next. Copy always copies the current code. Counter-based accounts do not have a Next preview.

## Open with the keyboard

The suggested key is Ctrl+Shift+Y, or Command+Shift+Y on Mac. Another extension or the operating system can take that key. Open chrome://extensions/shortcuts to choose your own.

When locked, the password box gets focus. After unlocking, search gets focus. Escape clears a search first, then closes the popup; a full-window page stays open. In a dialog, Escape closes the dialog.

## Choose password protection

Recommended is already selected and is the right starting point. Extra strong uses more temporary memory and takes longer to unlock.

Tune for this computer is optional. Choose Test this computer, wait for the result, and review its estimated time. Nothing is saved until you choose Apply protection and enter your master password. The result is an estimate, not a speed guarantee. An existing stronger setting is kept.

Changing protection does not change your password or sign-in codes. If you change your master password, the vault's protection is renewed too. Existing backup files still use their own original passwords.

## Understand reminders and older copies

If a security upgrade cannot be saved, your vault stays usable and shows a reminder. You can dismiss it; Lykvakt will try again at your next unlock. If another window changed the vault instead, unlock again so you use the latest copy.

The backup reminder means your accounts changed, or you have not tested a backup yet. Save and test a new file. Using a counter-based account changes its saved counter, so an older backup can become out of date.

An older-copy offer means the current local copy could not be read. Read the message before choosing Unlock older copy. That copy can miss recent changes. For counter-based accounts, do not reuse a code you already submitted.

## Move accounts

Use Import accounts to review supported OTP links, QR images, Google transfer batches, or unencrypted Aegis/2FAS exports before saving. Skipped records are shown for review.

Use a transfer QR for one account, or Recovery → Export plaintext OTP links for all accounts. These exports contain setup secrets: anyone holding them can generate your codes. Enter your master password to confirm, verify the destination app, and remove temporary files afterwards.

An encrypted Lykvakt backup is for restoring with compatible Lykvakt software. Standard OTP links and QR codes are for transfers to another authenticator. See [moving accounts](migration.md) for the supported formats and limits.

## If a password does not work

Check Caps Lock and try again. For a backup, use that file's password; it can differ from your vault password. Try an unchanged backup if a file may be damaged.

Your existing accounts stay in place when an action fails. Technical details is collapsed by default and can help with a bug report. Do not share your passwords, setup secrets, QR codes or unprotected exports in a report.
