# Backups and recovery

See the [plain-English guide](plain-english-guide.md) for the first-run checklist and explanations of the help controls.

1. Keep service recovery codes separately from this browser.
2. Create an encrypted backup with a unique, strong passphrase.
3. Save the file outside the browser profile and keep a second offline copy.
4. In Recovery, select the actual saved file and test restoration with its passphrase.
5. Compare accounts, settings and codes before retiring another authenticator.

A restoration test authenticates and decrypts the selected file, validates every record, generates test OTPs and compares the full account snapshot, including HOTP counters and metadata. It does not replace active accounts. A matching verification records a timestamp and snapshot; these do not prove continued file availability or successful service login.

The Authenticator view reminds you when no backup has been verified or the account snapshot has changed. HOTP counter advances change the snapshot intentionally. Re-test a matching saved file after account changes.

## Local previous-copy recovery

An ordinary save atomically keeps the preceding encrypted envelope in the same browser database. If the active envelope is structurally unreadable or missing, a readable older revision is offered explicitly. Choose Unlock older copy and use that copy’s password. An incorrect password never causes an automatic fallback. The next save promotes the authenticated older copy with revision-conflict checks.

If you use counter-based (HOTP) accounts, their counters may be behind. Do not reuse codes you already submitted. Malformed or exhausted active revisions do not prevent promotion, and the transaction still checks the actual active record.

Password change rotates the vault key and removes the older local copy atomically. Successful password-protection upgrades also discard superseded local copies. The next ordinary save begins a new previous-copy chain. These copies are not independent backups and can disappear with the browser profile. Previously exported backups keep their own passphrases.

## Password protection and versions

New backup files use Argon2id at the recommended 64 MiB / three-pass setting and have their own password. This build opens supported older PBKDF2 backups without rewriting them. Older Lykvakt builds cannot open new Argon2id files; keep compatible software and verify an independent backup before changing an installation. Optional local tuning applies to the vault only after master-password authentication.

## Restoring or moving accounts

During initial setup, a readable encrypted backup can create a fresh vault under a new master password. With an existing unlocked vault, a different backup can be previewed for merge; active accounts are not silently replaced. Conflicting settings block confirmation. A stale HOTP backup may require careful service-side resynchronization; do not blindly advance many counters.

See [migration](migration.md) for supported Aegis, 2FAS, Google transfer, OTP-link and QR import/export flows. Plaintext links and transfer QRs expose seeds and require master-password re-authentication before export/reveal.

The app has no password-reset service. JavaScript cannot guarantee erasure of strings or browser-managed memory. If you lose the master password but retain an independently readable backup, restore into a separate installation. Never uninstall the only working vault to troubleshoot. Deletion has no application trash or guaranteed forensic erasure.
