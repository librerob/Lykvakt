import { authenticateAction } from "./reauth";
import {
  button,
  el,
  input,
  select,
  form,
  submit,
  download,
  readText,
} from "../dom";
import { codeFor } from "../otp";
import { validateAccount, type Account } from "../model";
import {
  parseImport,
  previewImport,
  toURI,
  type SkippedEntry,
} from "../import";
import type { AppContext } from "./context";
export function createEnrollment(ctx: AppContext, drawAccounts: () => void) {
  const { session, run, announce, modal, closeDialog, render, confirmAction } =
    ctx;

  function addAccount(): void {
    const issuer = input("issuer", "Service name"),
      label = input("label", "Account identifier"),
      secret = input("secret", "Setup key", "password");
    label.control.required = secret.control.required = true;
    secret.control.autocomplete = "off";
    const algorithm = select(
      "algorithm",
      "Algorithm",
      {
        "SHA-1": "SHA-1 (standard OTP)",
        "SHA-256": "SHA-256",
        "SHA-512": "SHA-512",
      },
      "SHA-1",
    );
    const digits = select("digits", "Digits", { "6": "6", "8": "8" }, "6");
    const type = select(
      "type",
      "Type",
      { totp: "TOTP · time based", hotp: "HOTP · counter based" },
      "totp",
    );
    const period = input("period", "Period in seconds", "number", "30"),
      counter = input("counter", "HOTP counter", "text", "0");
    const group = input("group", "Group (optional)");
    modal(
      "Add account",
      form(
        async (data) =>
          run(async () => {
            const account = validateAccount({
              id: crypto.randomUUID(),
              issuer: data.get("issuer"),
              label: data.get("label"),
              secret: data.get("secret"),
              type: data.get("type"),
              algorithm: data.get("algorithm"),
              digits: Number(data.get("digits")),
              period: Number(data.get("period")),
              counter: data.get("counter"),
              favorite: false,
              group: data.get("group"),
            });
            await preview([account]);
          }),
        el(
          "p",
          { class: "muted" },
          "Enter the setup key supplied by the service.",
        ),
        issuer.wrapper,
        label.wrapper,
        secret.wrapper,
        el(
          "details",
          {},
          el("summary", {}, "Advanced options"),
          el(
            "div",
            { class: "stack" },
            type.wrapper,
            algorithm.wrapper,
            digits.wrapper,
            period.wrapper,
            counter.wrapper,
            group.wrapper,
          ),
        ),
        submit("Preview account"),
        button("Use a URI or QR image", () => importAccounts(), "button text"),
      ),
    );
  }

  async function preview(
    accounts: Account[],
    skipped: SkippedEntry[] = [],
  ): Promise<void> {
    session.check();
    const previewEpoch = session.epoch();
    const result = previewImport(accounts, session.accounts().accounts);
    if (result.conflicts)
      throw new Error(
        `${result.conflicts} conflicting account(s) share an existing secret but differ in metadata or OTP settings. Nothing was imported. Resolve them in the source export first.`,
      );
    const rows = el("div", { class: "preview-list" });
    for (const a of result.accounts) {
      const code = await codeFor(a);
      rows.append(
        el(
          "article",
          {},
          el("strong", {}, a.issuer || a.label),
          el("p", {}, a.label),
          el(
            "small",
            {},
            `${a.type.toUpperCase()} · ${a.algorithm} · ${a.digits} digits · ${a.type === "hotp" ? "counter " + a.counter : a.period + " seconds"}`,
          ),
          el("p", { class: "otp small" }, code),
        ),
      );
    }
    session.check();
    if (previewEpoch !== session.epoch()) return;
    modal(
      "Review import",
      el(
        "div",
        { class: "stack" },
        el(
          "p",
          {},
          `${result.accounts.length} new account(s). ${result.duplicates} exact duplicate(s) will be skipped. ${skipped.length} skipped entry(s).`,
        ),
        el(
          "p",
          { class: "hint" },
          "Compare codes with your existing authenticator before removing it. A preview does not verify acceptance by the service.",
        ),
        skipped.length
          ? el(
              "ul",
              {},
              ...skipped.map((entry) =>
                el("li", {}, `Account ${entry.index}: ${entry.reason}`),
              ),
            )
          : null,
        rows,
        result.accounts.length
          ? button(
              "Import " + result.accounts.length + " account(s)",
              () =>
                run(async () => {
                  const data = session.accounts();
                  const checked = previewImport(result.accounts, data.accounts);
                  if (checked.conflicts || checked.duplicates)
                    throw new Error("Vault changed. Preview the import again.");
                  data.accounts.push(...checked.accounts);
                  await session.save(data);
                  closeDialog();
                  render();
                  announce(
                    "Accounts imported. Create and verify a new encrypted backup.",
                  );
                }),
              "button primary",
            )
          : null,
      ),
    );
    if (skipped.length)
      announce(
        `${skipped.length} skipped. Account ${skipped[0]!.index}: ${skipped[0]!.reason} Review all reasons before importing.`,
      );
  }

  function importAccounts(): void {
    const format = select(
      "format",
      "Import format",
      {
        uri: "OTP links / Google Authenticator transfer",
        aegis: "Aegis · unencrypted v1 / database v3",
        "2fas": "2FAS · unencrypted schema 4",
      },
      "uri",
    );
    const area = el("textarea", {
      name: "payload",
      rows: "4",
      spellcheck: "false",
      autocomplete: "off",
      placeholder: "otpauth://totp/…",
    });
    const file = input("file", "Or select an export file", "file");
    file.control.accept = ".txt,.json";
    const qr = input("qr", "Read a QR image locally", "file");
    qr.control.accept = "image/png,image/jpeg,image/webp";
    qr.control.multiple = true;
    qr.control.addEventListener("change", () =>
      run(async () => {
        const epoch = session.epoch();
        const files = [...(qr.control.files ?? [])];
        if (
          files.length > 100 ||
          files.reduce((n, f) => n + f.size, 0) > 24_000_000
        )
          throw new Error(
            "Choose up to 100 QR images, at most 24 MB in total.",
          );
        if (files.length) {
          const { readQRs } = await import("../qr");
          const values: string[] = [];
          for (const f of files) values.push(...(await readQRs(f)));
          session.check();
          if (epoch !== session.epoch()) return;
          const imported = parseImport(values.join("\n"), "uri");
          await preview(imported.accounts, imported.skipped);
        }
      }),
    );
    modal(
      "Import accounts",
      form(
        async (data) =>
          run(async () => {
            const epoch = session.epoch();
            const f = file.control.files?.[0];
            const payload = f ? await readText(f) : String(data.get("payload"));
            session.check();
            if (epoch !== session.epoch()) return;
            const imported = parseImport(
              payload,
              String(data.get("format")) as "uri" | "aegis" | "2fas",
            );
            await preview(imported.accounts, imported.skipped);
          }),
        format.wrapper,
        el(
          "label",
          { class: "field" },
          el("span", {}, "OTP URIs or export text"),
          area,
        ),
        file.wrapper,
        qr.wrapper,
        el(
          "p",
          { class: "hint" },
          "All parsing happens on this device. For Google Authenticator, choose Transfer accounts → Export accounts on your phone, then select images of every transfer QR together. Encrypted third-party exports are not supported. Invalid entries are listed for review before saving valid accounts. Incomplete batches and conflicting imports save nothing.",
        ),
        submit("Preview import"),
      ),
    );
  }

  function editAccount(id: string): void {
    const a = session.accounts().accounts.find((x) => x.id === id)!;
    const issuer = input("issuer", "Service name", "text", a.issuer),
      label = input("label", "Account identifier", "text", a.label),
      group = input("group", "Group", "text", a.group);
    modal(
      "Edit account",
      form(
        async (fields) =>
          run(async () => {
            const data = session.accounts(),
              entry = data.accounts.find((x) => x.id === id)!;
            entry.issuer = String(fields.get("issuer"));
            entry.label = String(fields.get("label"));
            entry.group = String(fields.get("group"));
            await session.save(data);
            closeDialog();
            drawAccounts();
          }),
        issuer.wrapper,
        label.wrapper,
        group.wrapper,
        el(
          "p",
          { class: "hint" },
          `${a.type.toUpperCase()} · ${a.algorithm} · ${a.digits} digits. OTP settings are preserved.`,
        ),
        submit("Save changes"),
        button(
          "Show transfer QR…",
          () =>
            authenticateAction(
              ctx,
              "Reveal account QR?",
              "This QR contains the setup secret. Anyone who scans it can generate codes. Scan it in the destination app, compare codes, then close this dialog.",
              "Reveal QR",
              async () => {
                const epoch = session.epoch();
                const entry = session
                  .accounts()
                  .accounts.find((x) => x.id === id)!;
                const QRCode = await import("qrcode");
                const uri = toURI(entry);
                if (uri.length > 1500)
                  throw new Error(
                    "This setup key is too large for a practical QR. Export its OTP link instead.",
                  );
                const image = await QRCode.toDataURL(uri, {
                  width: 320,
                  margin: 4,
                  errorCorrectionLevel: "M",
                });
                session.check();
                if (epoch !== session.epoch()) return;
                modal(
                  "Account transfer QR",
                  el(
                    "div",
                    { class: "stack" },
                    el("p", {}, entry.issuer + " · " + entry.label),
                    el("img", {
                      src: image,
                      alt: "Secret account transfer QR",
                      class: "transfer-qr",
                    }),
                    el(
                      "p",
                      { class: "hint" },
                      "Standard otpauth QR. Check algorithm, digits, period and counter support in the destination app. Favorites and groups are not transferred.",
                    ),
                  ),
                );
              },
            ),
          "button text",
        ),
        button(
          "Export plaintext OTP URI…",
          () =>
            authenticateAction(
              ctx,
              "Export secret in plaintext?",
              "Anyone with this file can generate codes for this account. Keep it private and remove the file when migration is complete.",
              "Export this account",
              async () => {
                session.check();
                const entry = session
                  .accounts()
                  .accounts.find((x) => x.id === id)!;
                download(toURI(entry), "otp-account.txt");
              },
            ),
          "button text",
        ),
        button(
          "Delete account…",
          () =>
            confirmAction(
              "Delete this account?",
              "Make sure another authenticator or service recovery code works first. This removes the encrypted record without a trash copy. Browser storage cannot guarantee forensic erasure.",
              "Delete account",
              async () => {
                const data = session.accounts();
                data.accounts = data.accounts.filter((x) => x.id !== id);
                await session.save(data);
                drawAccounts();
              },
            ),
          "button danger",
        ),
      ),
    );
  }

  return { addAccount, preview, importAccounts, editAccount };
}
