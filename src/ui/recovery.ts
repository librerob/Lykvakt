import { authenticateAction } from "./reauth";
import { button, el, input, form, submit, download, readText } from "../dom";
import { load } from "../storage";
import { createEnvelope, snapshot } from "../crypto";
import { toURI, verifyBackup } from "../import";
import type { Account } from "../model";
import type { AppContext } from "./context";
export function createRecovery(
  ctx: AppContext,
  preview: (accounts: Account[]) => Promise<void>,
) {
  const { session, state, run, announce, modal, closeDialog, render } = ctx;

  function backupsView(): HTMLElement {
    const data = session.accounts();
    const health = el(
      "div",
      { class: "health" },
      el("h2", {}, "Vault health"),
      el(
        "dl",
        {},
        el("dt", {}, "Accounts"),
        el("dd", {}, String(data.accounts.length)),
        el("dt", {}, "Storage"),
        el("dd", {}, "Encrypted · AES-256-GCM"),
        el("dt", {}, "Unlock methods"),
        el(
          "dd",
          {},
          `Master password + ${session.current().passkeys.length} passkey(s)`,
        ),
        el("dt", {}, "Last matching file verification"),
        el(
          "dd",
          {},
          data.verifiedAt
            ? new Date(data.verifiedAt).toLocaleString()
            : "Not yet verified",
        ),
      ),
    );
    void snapshot(data).then((hash) => {
      if (!health.isConnected) return;
      health.append(
        el(
          "p",
          { class: "hint" },
          data.verifiedSnapshot === hash
            ? "The last tested backup matched this account snapshot. Keep the file somewhere safe; its continued availability is not monitored."
            : "Your current accounts need a matching, verified backup.",
        ),
      );
    });
    return el(
      "section",
      { class: "content stack" },
      el("h1", {}, "Backups & recovery"),
      el(
        "p",
        { class: "muted" },
        "A backup is useful when you know it restores.",
      ),
      health,
      el(
        "div",
        { class: "settings-section" },
        el("h2", {}, "Move to another authenticator"),
        el(
          "p",
          {},
          "Export every account as standard OTP links. For a scannable QR, open an account’s Edit menu. Destination apps may support different OTP settings.",
        ),
        button(
          "Export plaintext OTP links…",
          () =>
            authenticateAction(
              ctx,
              "Export every setup secret?",
              "This unencrypted file lets anyone generate your codes. It excludes favorites, groups and website approvals. Keep it private, verify the destination app, then remove the file.",
              "Export all OTP links",
              async () => {
                session.check();
                download(
                  session.accounts().accounts.map(toURI).join("\n") + "\n",
                  "lykvakt-otp-links.txt",
                );
              },
            ),
          "button text",
        ),
      ),
      el(
        "div",
        { class: "settings-section" },
        el("h2", {}, "1. Save an encrypted backup"),
        el(
          "p",
          {},
          "Includes every account, secret, algorithm, period, counter, favorite and group. Choose a separate backup passphrase.",
        ),
        button(
          "Create encrypted backup",
          () => backupExport(),
          "button primary",
        ),
      ),
      el(
        "div",
        { class: "settings-section" },
        el("h2", {}, "2. Test the file you saved"),
        el(
          "p",
          {},
          "Open the actual downloaded file. Decrypt it in memory, validate every record, generate test codes, and compare it with this vault.",
        ),
        button(
          "Verify or restore a backup",
          () => backupVerify(),
          "button tonal",
        ),
      ),
      el(
        "aside",
        { class: "notice" },
        el("strong", {}, "Keep recovery independent"),
        el(
          "p",
          {},
          "Store the file and its passphrase safely, separately from this browser. Password loss cannot be reversed. Keep website recovery codes and your old authenticator until migration is verified.",
        ),
      ),
    );
  }

  function backupExport(): void {
    const password = input("password", "Backup passphrase", "password"),
      confirmation = input(
        "confirmation",
        "Confirm backup passphrase",
        "password",
      );
    password.control.autocomplete = confirmation.control.autocomplete =
      "new-password";
    modal(
      "Create encrypted backup",
      form(
        async (fields, f) =>
          run(async () => {
            const password = String(fields.get("password"));
            if (password !== fields.get("confirmation"))
              throw new Error("Passphrases do not match.");
            const data = session.accounts(),
              epoch = session.epoch();
            let contents: string;
            try {
              contents = JSON.stringify(
                (await createEnvelope(password, data, "backup")).envelope,
              );
            } finally {
              f.reset();
            }
            session.check();
            if (epoch !== session.epoch()) return;
            download(
              contents,
              `otp-vault-backup-${new Date().toISOString().slice(0, 10)}.json`,
            );
            closeDialog();
            announce(
              "Encrypted backup exported. Verify the saved file to test restoration.",
            );
          }),
        password.wrapper,
        confirmation.wrapper,
        el(
          "p",
          { class: "hint" },
          "At least 14 characters. Passkey unlock records are excluded: this file restores using only its passphrase.",
        ),
        submit("Save encrypted file"),
      ),
    );
  }

  function backupVerify(): void {
    const file = input("file", "Encrypted backup file", "file"),
      password = input("password", "Backup passphrase", "password");
    file.control.accept = ".json";
    modal(
      "Verify backup restoration",
      form(
        async (_fields, f) =>
          run(async () => {
            const selected = file.control.files?.[0];
            if (!selected) throw new Error("Choose the backup file you saved.");
            const current = session.accounts(),
              epoch = session.epoch();
            const passwordValue = password.control.value;
            let result: Awaited<ReturnType<typeof verifyBackup>>;
            try {
              result = await verifyBackup(
                JSON.parse(await readText(selected)),
                passwordValue,
                current,
              );
            } finally {
              f.reset();
            }
            session.check();
            if (epoch !== session.epoch()) return;
            if (result.matches) {
              const updated = session.accounts();
              updated.verifiedAt = new Date().toISOString();
              updated.verifiedSnapshot = result.fingerprint;
              await session.save(updated);
            }
            modal(
              "Restoration tested",
              el(
                "div",
                { class: "stack" },
                el(
                  "p",
                  {},
                  `${result.count} account(s) decrypted, schema validated, and test codes generated.`,
                ),
                el(
                  "p",
                  {},
                  result.matches
                    ? "Exact account snapshot match with this vault."
                    : "This file differs from the current vault. It may be an older or different backup. It has not been marked as a matching backup.",
                ),
                el(
                  "p",
                  { class: "hint" },
                  "No active accounts were replaced. This test does not prove codes will be accepted by websites.",
                ),
                result.matches
                  ? null
                  : button(
                      "Preview safe merge",
                      () => run(() => preview(result.data.accounts)),
                      "button tonal",
                    ),
                button(
                  "Done",
                  () => {
                    closeDialog();
                    render();
                  },
                  "button primary",
                ),
              ),
            );
          }),
        file.wrapper,
        password.wrapper,
        submit("Decrypt & test restoration"),
      ),
    );
  }

  function recoverySetup(): void {
    const file = input("file", "Encrypted backup file", "file"),
      backup = input("backup", "Backup passphrase", "password"),
      password = input("password", "New master password", "password"),
      confirm = input("confirm", "Confirm new master password", "password");
    password.control.autocomplete = confirm.control.autocomplete =
      "new-password";
    modal(
      "Recover into a new vault",
      form(
        async (_fields, f) =>
          run(async () => {
            if (await load())
              throw new Error(
                "A vault already exists. Unlock it and use the safe merge workflow.",
              );
            const selected = file.control.files?.[0];
            if (!selected) throw new Error("Choose an encrypted backup.");
            if (password.control.value !== confirm.control.value)
              throw new Error("Passwords do not match.");
            const epoch = session.epoch();
            const result = await verifyBackup(
              JSON.parse(await readText(selected)),
              backup.control.value,
            );
            if (epoch !== session.epoch())
              throw new Error("Recovery cancelled by locking.");
            const masterPassword = password.control.value;
            f.reset();
            await session.setup(masterPassword, {
              ...result.data,
              verifiedAt: null,
              verifiedSnapshot: null,
            });
            state.exists = true;
            closeDialog();
            render();
            announce(
              `Recovered ${result.count} account(s). Verify their codes before retiring your previous authenticator.`,
            );
          }),
        file.wrapper,
        backup.wrapper,
        password.wrapper,
        confirm.wrapper,
        submit("Test & recover accounts"),
      ),
    );
  }

  return { backupsView, recoverySetup };
}
