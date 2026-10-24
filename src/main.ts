import "./style.css";
import {
  button,
  el,
  input,
  select,
  form,
  submit,
  download,
  readText,
} from "./dom";
import { Session } from "./session";
import { load } from "./storage";
import { codeFor } from "./otp";
import { validateAccount, type Account } from "./model";
import {
  createEnvelope,
  makePasswordSlot,
  snapshot,
  unwrapPassword,
} from "./crypto";
import {
  parseImport,
  parseURI,
  previewImport,
  toURI,
  verifyBackup,
} from "./import";
import { readQR } from "./qr";
import { loadDirectory, lookup, safeLink } from "./directory";
import { enroll, unlockPasskey } from "./passkeys";

const root = document.querySelector<HTMLDivElement>("#app")!;
const session = new Session();
let exists = false;
let view: "codes" | "backups" | "settings" = "codes";
let search = "",
  favorites = false;
let dialog: HTMLDialogElement | undefined;
let status: HTMLElement;
let list: HTMLElement | undefined;
let displayEpoch = 0;
const codeCache = new Map<string, { step: string; code: string }>();
const isExtension = !!globalThis.chrome?.runtime?.id;
const fullWindow = new URL(location.href).searchParams.has("window");
let theme = localStorage.getItem("theme") ?? "system";
let accent = localStorage.getItem("accent") ?? "green";
function setTheme(): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = accent;
}
setTheme();
session.timeout = Number(localStorage.getItem("timeout")) || 300_000;
async function run(action: () => void | Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message =
      error instanceof SyntaxError
        ? "Invalid file syntax. No accounts were changed."
        : error instanceof Error &&
            !["OperationError", "DataError"].includes(error.name)
          ? error.message
          : "Authentication failed. Check the password or use an intact backup.";
    announce(message, true);
  }
}
function announce(message: string, error = false): void {
  status.textContent = message;
  status.className = error ? "status error" : "status";
}
function closeDialog(): void {
  dialog?.close();
  dialog?.remove();
  dialog = undefined;
}
function modal(title: string, content: Node): void {
  closeDialog();
  const titleNode = el("h2", { id: "dialog-title" }, title);
  dialog = el(
    "dialog",
    { "aria-labelledby": "dialog-title" },
    el(
      "div",
      { class: "dialog-head" },
      titleNode,
      button("Close", closeDialog, "button text"),
    ),
    content,
  );
  const currentDialog = dialog;
  currentDialog.addEventListener(
    "close",
    () => {
      if (dialog === currentDialog) closeDialog();
    },
    { once: true },
  );
  document.body.append(dialog);
  dialog.showModal();
}
session.onlock = () => {
  displayEpoch++;
  codeCache.clear();
  closeDialog();
  search = "";
  list = undefined;
  render();
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) session.lock();
});
window.addEventListener("pagehide", () => session.lock());
for (const event of ["pointerdown", "keydown"])
  document.addEventListener(
    event,
    () => {
      if (session.unlocked) {
        try {
          session.check();
          session.touch();
        } catch {
          /* Lock already rendered. */
        }
      }
    },
    { passive: true },
  );
setInterval(() => {
  if (session.unlocked) {
    try {
      session.check();
      if (view === "codes") void tick();
    } catch {
      /* Expired session. */
    }
  }
}, 1000);

function render(): void {
  const title = el(
    "div",
    { class: "wordmark" },
    el("img", { src: "icons/32.png", width: "32", height: "32", alt: "" }),
    el(
      "div",
      {},
      el("strong", {}, "OTP Vault"),
      el("span", { class: "preview" }, "DEVELOPMENT PREVIEW"),
    ),
  );
  const tools = el("div", { class: "header-actions" });
  if (!fullWindow && isExtension)
    tools.append(
      button(
        "Open window",
        () => {
          session.lock();
          void chrome.tabs.create({
            url: chrome.runtime.getURL("index.html?window"),
          });
        },
        "button text",
      ),
    );
  if (session.unlocked)
    tools.append(button("Lock", () => session.lock(), "button tonal"));
  const header = el("header", {}, title, tools);
  status = el("div", {
    class: "status",
    role: "status",
    "aria-live": "polite",
  });
  const main = el("main");
  if (!session.unlocked) main.append(locked());
  else {
    const nav = el("nav", { "aria-label": "Vault" });
    for (const [key, title] of [
      ["codes", "Authenticator"],
      ["backups", "Recovery"],
      ["settings", "Settings"],
    ] as const) {
      const tab = button(
        title,
        () => {
          closeDialog();
          view = key;
          list = undefined;
          render();
        },
        "nav-item" + (view === key ? " selected" : ""),
      );
      if (view === key) tab.setAttribute("aria-current", "page");
      nav.append(tab);
    }
    main.append(
      nav,
      view === "codes"
        ? codesView()
        : view === "backups"
          ? backupsView()
          : settingsView(),
    );
  }
  root.replaceChildren(
    header,
    main,
    status,
    el(
      "footer",
      {},
      el("span", { class: "local-dot" }),
      "Local vault · No account · No telemetry",
    ),
  );
}
function locked(): HTMLElement {
  const title = exists ? "Welcome back." : "Your codes. Your vault.";
  const subtitle = exists
    ? "Unlock your encrypted vault to access your codes."
    : "A quiet, private home for your two-factor codes. Protected with a password you control.";
  const password = input(
    "password",
    exists ? "Master password" : "Create a master password",
    "password",
  );
  password.control.required = true;
  password.control.autocomplete = exists ? "current-password" : "new-password";
  password.control.minLength = exists ? 1 : 14;
  password.control.maxLength = 1024;
  const confirmation = input(
    "confirmation",
    "Confirm master password",
    "password",
  );
  confirmation.control.autocomplete = "new-password";
  confirmation.control.required = true;
  const signIn = form(
    async (data, f) =>
      run(async () => {
        const password = String(data.get("password"));
        if (!exists && password !== data.get("confirmation"))
          throw new Error("Passwords do not match.");
        try {
          if (exists) await session.unlock(password);
          else {
            await session.setup(password);
            exists = true;
          }
        } finally {
          f.reset();
        }
        if (session.unlocked) {
          view = "codes";
          render();
        }
      }),
    password.wrapper,
    exists ? null : confirmation.wrapper,
    submit(exists ? "Unlock vault" : "Create encrypted vault"),
  );
  const panel = el(
    "section",
    { class: "welcome" },
    el(
      "div",
      { class: "brand-mark", "aria-hidden": "true" },
      el("img", { src: "icons/128.png", width: "64", height: "64", alt: "" }),
    ),
    el("p", { class: "eyebrow" }, "SECURITY WITHOUT THE CLUTTER"),
    el("h1", {}, title),
    el("p", { class: "muted" }, subtitle),
    signIn,
  );
  if (!exists)
    panel.append(
      el(
        "p",
        { class: "hint" },
        "Use a unique passphrase of at least 14 characters. There is no password reset. Save your service recovery codes separately.",
      ),
      button(
        "Restore an encrypted backup",
        () => recoverySetup(),
        "button text",
      ),
    );
  if (exists && fullWindow)
    panel.append(
      button(
        "Try passkey unlock",
        () =>
          run(async () => {
            const epoch = session.epoch(),
              saved = await load();
            if (!saved?.passkeys.length)
              throw new Error(
                "No passkey enrolled for this extension. Unlock with your master password.",
              );
            const result = await unlockPasskey(saved, saved.passkeys[0]!);
            await session.unlockWith(result.key, saved, result.data, epoch);
            render();
          }),
        "button tonal",
      ),
    );
  panel.append(
    el(
      "aside",
      { class: "notice" },
      el("strong", {}, "Test accounts only"),
      el(
        "p",
        {},
        "This preview has not had an independent security audit. Keep your existing authenticator and backups.",
      ),
    ),
  );
  return panel;
}
function codesView(): HTMLElement {
  const add = button("+ Add account", () => addAccount(), "button primary");
  const heading = el(
    "div",
    { class: "section-head" },
    el(
      "div",
      {},
      el("h1", {}, "Authenticator"),
      el("p", { class: "muted" }, "Ready when you need them."),
    ),
    add,
  );
  const searchInput = input("search", "Search accounts", "search", search);
  searchInput.control.placeholder = "Search accounts or groups";
  searchInput.control.addEventListener("input", () => {
    search = searchInput.control.value;
    drawAccounts();
  });
  const filter = button(
    favorites ? "★ Favorites" : "☆ Favorites",
    () => {
      favorites = !favorites;
      filter.textContent = favorites ? "★ Favorites" : "☆ Favorites";
      filter.setAttribute("aria-pressed", String(favorites));
      drawAccounts();
    },
    "button tonal",
  );
  filter.setAttribute("aria-pressed", String(favorites));
  list = el("div", { class: "account-list" });
  const section = el(
    "section",
    { class: "content" },
    heading,
    el("div", { class: "search-row" }, searchInput.wrapper, filter),
    list,
    button("Import accounts", () => importAccounts(), "button text"),
  );
  drawAccounts();
  if (isExtension) {
    const site = el("aside", { class: "site-note" });
    section.append(site);
    void run(async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const found = tab?.url
        ? lookup(tab.url, await loadDirectory())
        : undefined;
      if (!site.isConnected) return;
      if (!found) {
        site.textContent =
          "Website check: no directory match for this tab. This does not prove 2FA is unavailable.";
        return;
      }
      site.append(
        el("strong", {}, `${found.domain} lists 2FA support`),
        el(
          "p",
          {},
          found.entry.methods
            .map(
              (m) =>
                ({
                  totp: "Authenticator codes",
                  u2f: "Security keys",
                  sms: "SMS",
                  email: "Email",
                  call: "Phone call",
                  "custom-software": "Other software",
                  "custom-hardware": "Other hardware",
                })[m] ?? m,
            )
            .join(" · "),
        ),
      );
      const link = safeLink(found.entry.documentation);
      if (link)
        site.append(
          el(
            "a",
            { href: link, target: "_blank", rel: "noopener noreferrer" },
            "View setup instructions ↗",
          ),
        );
      site.append(
        el(
          "p",
          { class: "hint" },
          "Support does not mean your account is enrolled. Prefer phishing-resistant passkeys or security keys where available.",
        ),
        el("small", {}, "Data sourced from 2FA Directory by 2factorauth."),
      );
    });
  }
  return section;
}
function drawAccounts(): void {
  if (!list || !session.unlocked) return;
  const accounts = session
    .accounts()
    .accounts.filter(
      (a) =>
        (!favorites || a.favorite) &&
        `${a.issuer} ${a.label} ${a.group}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        a.issuer.localeCompare(b.issuer) ||
        a.label.localeCompare(b.label),
    );
  const rows = accounts.map((a) => {
    const code = el(
      "span",
      { class: "otp", "aria-label": `Code for ${a.issuer} ${a.label}` },
      "••• •••",
    );
    const remaining = el("span", {
      class: "remaining",
      "aria-label":
        a.type === "hotp" ? "Counter based code" : "Seconds remaining",
    });
    const row = el(
      "article",
      { class: "account", "data-account": a.id },
      el(
        "div",
        { class: "account-top" },
        el(
          "div",
          { class: "initials", "aria-hidden": "true" },
          (a.issuer || a.label).slice(0, 2).toUpperCase(),
        ),
        el(
          "div",
          { class: "account-name" },
          el("h2", {}, a.issuer || a.label),
          el("p", {}, a.label),
          a.group ? el("small", {}, a.group) : null,
        ),
        button(
          a.favorite ? "★" : "☆",
          () =>
            run(async () => {
              const data = session.accounts(),
                account = data.accounts.find((x) => x.id === a.id)!;
              account.favorite = !account.favorite;
              await session.save(data);
              drawAccounts();
            }),
          "button icon favorite",
        ),
        button("Edit", () => editAccount(a.id), "button text"),
      ),
      el(
        "div",
        { class: "code-row" },
        code,
        remaining,
        button(
          "Copy",
          () =>
            run(async () => {
              session.check();
              const epoch = session.epoch();
              const current = session
                .accounts()
                .accounts.find((x) => x.id === a.id)!;
              const value = await codeFor(current);
              session.check();
              if (epoch !== session.epoch()) return;
              await navigator.clipboard.writeText(value);
              announce("Code copied. Clipboard managers may keep a copy.");
            }),
          "button tonal",
        ),
      ),
    );
    const star = row.querySelector(".favorite")!;
    star.setAttribute(
      "aria-label",
      `${a.favorite ? "Remove" : "Add"} favorite: ${a.issuer} ${a.label}`,
    );
    if (a.type === "hotp")
      row.append(
        button(
          "Advance counter…",
          () =>
            confirmAction(
              "Advance HOTP counter?",
              `Current counter: ${a.counter}. Advance only after the service has consumed this code. Opening the vault never advances it.`,
              "Advance once",
              async () => {
                const data = session.accounts(),
                  current = data.accounts.find((x) => x.id === a.id)!;
                current.counter = (BigInt(current.counter) + 1n).toString();
                await session.save(data);
                drawAccounts();
              },
            ),
          "button text advance",
        ),
      );
    return row;
  });
  list.replaceChildren(...rows);
  if (!accounts.length)
    list.append(
      el(
        "div",
        { class: "empty" },
        el("div", { class: "empty-symbol", "aria-hidden": "true" }, "＋"),
        el(
          "h2",
          {},
          search || favorites ? "No matching accounts" : "A fresh start.",
        ),
        el(
          "p",
          { class: "muted" },
          search || favorites
            ? "Try a different search or filter."
            : "Add a setup key or import a QR image. Your secrets stay encrypted on this device.",
        ),
      ),
    );
  void run(tick);
}
async function tick(): Promise<void> {
  if (!list || !session.unlocked) return;
  const epoch = displayEpoch,
    target = list,
    data = session.accounts();
  const now = Date.now();
  const rows = new Map(
    [...target.querySelectorAll<HTMLElement>("[data-account]")].map((row) => [
      row.dataset.account,
      row,
    ]),
  );
  await Promise.all(
    data.accounts.map(async (a) => {
      const row = rows.get(a.id);
      if (!row) return;
      const step =
        a.type === "hotp"
          ? a.counter
          : String(Math.floor(now / 1000 / a.period));
      let cached = codeCache.get(a.id);
      if (!cached || cached.step !== step) {
        const code = await codeFor(a, now);
        if (epoch !== displayEpoch || !session.unlocked) return;
        cached = { step, code };
        codeCache.set(a.id, cached);
      }
      if (epoch !== displayEpoch || !session.unlocked) return;
      row.querySelector(".otp")!.textContent =
        cached.code.slice(0, cached.code.length / 2) +
        " " +
        cached.code.slice(cached.code.length / 2);
      const remaining = a.period - (Math.floor(now / 1000) % a.period);
      row.querySelector(".remaining")!.textContent =
        a.type === "hotp" ? "HOTP" : `${remaining}s`;
      row.classList.toggle("expiring", a.type === "totp" && remaining <= 5);
      row
        .querySelector(".remaining")!
        .setAttribute(
          "title",
          a.type === "hotp"
            ? `Counter ${a.counter}`
            : remaining <= 5
              ? "Expiring soon. Wait for the next code if needed."
              : "Seconds until the code changes",
        );
    }),
  );
}
function confirmAction(
  title: string,
  message: string,
  label: string,
  action: () => Promise<void>,
): void {
  modal(
    title,
    el(
      "div",
      { class: "stack" },
      el("p", {}, message),
      button(
        label,
        () =>
          run(async () => {
            await action();
            closeDialog();
          }),
        "button primary",
      ),
    ),
  );
}
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
      if (f) await preview([parseURI(await readQR(f))]);
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
      el("h2", {}, "1. Save an encrypted backup"),
      el(
        "p",
        {},
        "Includes every account, secret, algorithm, period, counter, favorite and group. Choose a separate backup passphrase.",
      ),
      button("Create encrypted backup", () => backupExport(), "button primary"),
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
  password.control.autocomplete = confirm.control.autocomplete = "new-password";
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
          exists = true;
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
function settingsView(): HTMLElement {
  const themeSelect = select(
    "theme",
    "Appearance",
    {
      system: "System",
      light: "Light",
      dark: "Dark",
      amoled: "AMOLED · true black",
    },
    theme,
  );
  themeSelect.control.addEventListener("change", () => {
    theme = themeSelect.control.value;
    localStorage.setItem("theme", theme);
    setTheme();
  });
  const accentSelect = select(
    "accent",
    "Accent",
    {
      green: "Forest",
      blue: "Blue",
      violet: "Violet",
      rose: "Rose",
      teal: "Teal",
      neutral: "Neutral",
    },
    accent,
  );
  accentSelect.control.addEventListener("change", () => {
    accent = accentSelect.control.value;
    localStorage.setItem("accent", accent);
    setTheme();
  });
  const timeout = select(
    "timeout",
    "Lock after inactivity",
    {
      "60000": "1 minute",
      "300000": "5 minutes",
      "900000": "15 minutes",
      "1800000": "30 minutes",
    },
    String(session.timeout),
  );
  timeout.control.addEventListener("change", () => {
    session.timeout = Number(timeout.control.value);
    localStorage.setItem("timeout", String(session.timeout));
  });
  const slots = el("div", { class: "stack" });
  for (const [i, slot] of session.current().passkeys.entries())
    slots.append(
      el(
        "div",
        { class: "inline" },
        el("span", {}, "Passkey " + (i + 1)),
        button(
          "Revoke",
          () =>
            confirmAction(
              "Revoke passkey unlock?",
              "This removes its encrypted key wrapper from this vault. Remove the credential separately in your authenticator if desired. The master password remains available.",
              "Revoke",
              async () => {
                await session.save(session.accounts(), (h) => ({
                  ...h,
                  passkeys: h.passkeys.filter((x) => x.id !== slot.id),
                }));
                render();
              },
            ),
          "button text",
        ),
      ),
    );
  const automatic = el("input", { type: "checkbox", id: "automatic" });
  if (isExtension) {
    void chrome.storage.local.get("automatic").then((p) => {
      automatic.checked = !!p.automatic;
    });
    automatic.addEventListener("change", () =>
      run(async () => {
        if (automatic.checked) {
          const allowed = await chrome.permissions.request({
            permissions: ["tabs"],
          });
          automatic.checked = allowed;
          await chrome.storage.local.set({ automatic: allowed });
        } else {
          await chrome.storage.local.set({ automatic: false });
          await chrome.permissions.remove({ permissions: ["tabs"] });
        }
      }),
    );
  } else automatic.disabled = true;
  return el(
    "section",
    { class: "content stack" },
    el("h1", {}, "Settings"),
    el(
      "div",
      { class: "settings-section stack" },
      el("h2", {}, "Make it yours"),
      themeSelect.wrapper,
      accentSelect.wrapper,
    ),
    el(
      "div",
      { class: "settings-section stack" },
      el("h2", {}, "Vault security"),
      timeout.wrapper,
      el(
        "p",
        { class: "hint" },
        "Also locks immediately when this page is hidden or closed. Keys are never saved in session storage. No OS-lock detection is claimed.",
      ),
      button("Change master password", () => changePassword(), "button tonal"),
    ),
    el(
      "details",
      { class: "settings-section" },
      el("summary", {}, "Experimental passkey unlock"),
      el(
        "div",
        { class: "stack" },
        el(
          "p",
          {},
          "Uses WebAuthn PRF to unwrap the vault key. Requires a compatible authenticator and this extension’s stable origin. No real Windows Hello, Touch ID or security-key hardware has been validated for this preview.",
        ),
        el(
          "p",
          { class: "hint" },
          "Use a full window. Enrollment requires your master password and two successful authentication requests. Development and Store extension IDs may differ; keep your password and backup.",
        ),
        slots,
        button("Enroll a passkey", () => passkeyEnrollment(), "button tonal"),
      ),
    ),
    el(
      "div",
      { class: "settings-section stack" },
      el("h2", {}, "Website awareness"),
      el(
        "label",
        { class: "switch-label", for: "automatic" },
        automatic,
        "Automatic toolbar indicators",
      ),
      el(
        "p",
        { class: "hint" },
        "Optional tabs permission gives access to the URLs of all open tabs. Addresses are checked against the bundled directory on this device. No visits are stored or sent. Manual checks use activeTab when you open the popup. No notifications or page injection.",
      ),
    ),
    el(
      "aside",
      { class: "notice" },
      el("strong", {}, "Development preview · 0.1.0-rc.1"),
      el(
        "p",
        {},
        "No independent audit. TOTP can be phished, and malware on this computer can read unlocked codes. Your device clock must be correct.",
      ),
    ),
  );
}
function changePassword(): void {
  const current = input("current", "Current master password", "password"),
    next = input("next", "New master password", "password"),
    confirm = input("confirm", "Confirm new master password", "password");
  next.control.autocomplete = confirm.control.autocomplete = "new-password";
  modal(
    "Change master password",
    form(
      async (_fields, f) =>
        run(async () => {
          if (next.control.value !== confirm.control.value)
            throw new Error("Passwords do not match.");
          const e = session.current(),
            epoch = session.epoch();
          const raw = await unwrapPassword(e, current.control.value);
          try {
            const password = await makePasswordSlot(
              raw,
              next.control.value,
              e.id,
              "vault",
            );
            session.check();
            if (epoch !== session.epoch()) return;
            await session.save(session.accounts(), (h) => ({ ...h, password }));
          } finally {
            raw.fill(0);
            f.reset();
          }
          closeDialog();
          announce(
            "Master password changed. Existing backup files still use their original passphrase.",
          );
        }),
      current.wrapper,
      next.wrapper,
      confirm.wrapper,
      submit("Change password"),
    ),
  );
}
function passkeyEnrollment(): void {
  if (!fullWindow) {
    announce("Open the full window, unlock, and enroll from Settings.", true);
    return;
  }
  if (session.current().passkeys.length >= 5) {
    announce("Revoke a passkey before enrolling another (maximum five).", true);
    return;
  }
  const password = input("password", "Confirm master password", "password");
  modal(
    "Enroll passkey unlock",
    form(
      async (_fields, f) =>
        run(async () => {
          const e = session.current(),
            epoch = session.epoch();
          const raw = await unwrapPassword(e, password.control.value);
          f.reset();
          try {
            const slot = await enroll(e, raw);
            session.check();
            if (epoch !== session.epoch()) return;
            await session.save(session.accounts(), (h) => ({
              ...h,
              passkeys: [...h.passkeys, slot],
            }));
          } finally {
            raw.fill(0);
          }
          closeDialog();
          render();
          announce(
            "PRF round-trip passed. Passkey wrapper enrolled for this extension origin.",
          );
        }),
      password.wrapper,
      el(
        "p",
        { class: "hint" },
        "If PRF is unavailable, no unlock method is saved. Your provider may retain a credential from an unsuccessful enrollment; remove it there if needed.",
      ),
      submit("Start secure enrollment"),
    ),
  );
}
void run(async () => {
  exists = !!(await load());
  render();
});
render();
