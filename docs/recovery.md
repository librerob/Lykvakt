# Backups, imports and recovery

1. Keep the service’s recovery codes separately from this browser.
2. Export an encrypted backup using a unique, strong passphrase.
3. Save that file outside the browser profile. Keep a second offline copy.
4. Select the saved file in the restore test, supply its passphrase, and confirm the result matches the active vault.
5. Compare OTPs against your existing authenticator or a test service before retiring another copy.

A successful test authenticates/decrypts the actual file, validates every record, counts accounts, generates deterministic test OTPs at a fixed timestamp and compares the full account snapshot (including counters and metadata). The active vault is not replaced. Its encrypted health metadata remembers the last matching test. That timestamp does not prove the file remains available or that websites accept the codes. Any account change makes the remembered snapshot stale.

During setup, a readable backup can create a fresh vault under a new master password. If a vault already exists, backup recovery offers a previewed merge only. Matching seed/type with different settings is a conflict and blocks import. HOTP counters are never reset, inferred or automatically advanced. A stale HOTP backup requires careful service-side resynchronization; do not blindly advance many counters.

Supported: version-1 Lykvakt encrypted backups, standard `otpauth://totp` / `hotp` lines and images containing one such URI. Synthetic adapter fixtures cover unencrypted Aegis envelope v1/database v3 and unencrypted 2FAS schema 4. Check every count and configuration after using either adapter. No encrypted Aegis/2FAS, Google transfer batches, Authenticator-Extension encrypted backup, CXF or proprietary Steam/Battle.net migration is advertised.

Single-account plaintext URI export is behind a warning. It carries the seed and must be handled as a password. Plain third-party export files and QR images also contain secrets; delete/move them securely according to your device policy after verifying migration.

The app never knows the master/backup passphrase after the operation. There is no reset service. If you forget the master password but have a readable independent backup, restore into a separate installation. Never uninstall the only working vault to troubleshoot. Deletion has no application trash or guaranteed forensic erasure; old backups can retain old secrets.
