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
import { parseImport, parseURI, previewImport, toURI } from "../import";
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

  async function preview(accounts: Account[]): Promise<void> {
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
    modal(
      "Review import",
      el(
        "div",
        { class: "stack" },
        el(
          "p",
          {},
          `${result.accounts.length} new account(s). ${result.duplicates} exact duplicate(s) will be skipped.`,
        ),
        el(
          "p",
          { class: "hint" },
          "Compare codes with your existing authenticator before removing it. A preview does not verify acceptance by the service.",
        ),
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
  }

  function importAccounts(): void {
    const format = select(
      "format",
      "Import format",
      {
        uri: "Standard otpauth URIs",
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
    qr.control.addEventListener("change", () =>
      run(async () => {
        const f = qr.control.files?.[0];
        if (f) {
          const { readQR } = await import("../qr");
          await preview([parseURI(await readQR(f))]);
        }
      }),
    );
    modal(
      "Import accounts",
      form(
        async (data) =>
          run(async () => {
            const f = file.control.files?.[0];
            const payload = f ? await readText(f) : String(data.get("payload"));
            const accounts = parseImport(
              payload,
              String(data.get("format")) as "uri" | "aegis" | "2fas",
            );
            await preview(accounts);
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
          "All parsing happens on this device. Google transfer QR codes and encrypted third-party exports are not supported in this preview. Invalid or conflicting records block the whole import.",
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
          "Export plaintext OTP URI…",
          () =>
            confirmAction(
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
