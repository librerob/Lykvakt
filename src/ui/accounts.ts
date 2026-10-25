import { button, el, input, helpBlock } from "../dom";
import { bindSearch } from "../keyboard";
import { emptySearchMessage } from "../help";
import { upgradeNotice } from "./upgrade-notice";
import { preferenceEnabled, savePreference } from "../preferences";
import { codeFor } from "../otp";
import { needsBackup } from "./recovery";
import { createEnrollment } from "./enrollment";
import type { AppContext } from "./context";
export function createAccounts(ctx: AppContext) {
  const { session, run, announce, confirmAction } = ctx;
  let search = "",
    favorites = false;
  let list: HTMLElement | undefined;
  let searchControl: HTMLInputElement | undefined;
  let matchingIds: string[] = [];
  let displayEpoch = 0;
  let backupEpoch = 0;
  let backupNotice: HTMLElement | undefined;
  const revealed = new Map<string, ReturnType<typeof setTimeout>>();
  const alwaysShow = () => preferenceEnabled("alwaysShowCodes");
  function maskAll() {
    for (const timer of revealed.values()) clearTimeout(timer);
    revealed.clear();
  }
  const codeCache = new Map<
    string,
    { step: string; code: string; next?: string }
  >();
  const { addAccount, preview, importAccounts, editAccount } = createEnrollment(
    ctx,
    drawAccounts,
  );
  function clear() {
    displayEpoch++;
    backupEpoch++;
    backupNotice = undefined;
    maskAll();
    for (const code of list?.querySelectorAll<HTMLElement>(".otp") ?? []) {
      code.textContent = "••• •••";
      code.setAttribute("aria-label", "Code hidden");
      code.setAttribute("aria-pressed", "false");
    }
    for (const next of list?.querySelectorAll<HTMLElement>(".next-code") ??
      []) {
      next.hidden = true;
      next.querySelector(".next-code-value")!.textContent = "";
    }
    codeCache.clear();
    matchingIds = [];
    searchControl = undefined;
    search = "";
    list = undefined;
  }

  function clearSearch(): boolean {
    if (!search || !searchControl) return false;
    search = "";
    searchControl.value = "";
    drawAccounts();
    searchControl.focus();
    return true;
  }
  async function copyAccount(id: string): Promise<void> {
    session.check();
    const epoch = session.epoch();
    const current = session
      .accounts()
      .accounts.find((account) => account.id === id);
    if (!current)
      throw new Error("That account changed. Clear the search and try again.");
    const value = await codeFor(current);
    session.check();
    if (epoch !== session.epoch()) return;
    await navigator.clipboard.writeText(value);
    const name = [current.issuer, current.label].filter(Boolean).join(" ");
    announce(`Copied code for ${name}. Clipboard managers may keep a copy.`);
  }
  function firstRunTip(): HTMLElement | null {
    if (!ctx.state.firstRunTip) return null;
    const tip = el(
      "aside",
      { class: "notice stack", "aria-label": "Getting started" },
      el("h2", {}, "Three things to keep safe"),
      el("p", {}, "Remember your vault password and keep a safe written copy."),
      helpBlock("tipsPassword"),
      el("p", {}, "Save an encrypted backup somewhere outside this browser."),
      helpBlock("tipsBackup"),
      el(
        "p",
        {},
        "Choose Verify or restore a backup to test the actual file you saved.",
      ),
      helpBlock("tipsVerify"),
      button(
        "Got it",
        () => {
          ctx.state.firstRunTip = false;
          savePreference("firstRunTips", "false");
          tip.remove();
        },
        "button tonal",
      ),
    );
    return tip;
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
    searchInput.control.placeholder = "Search accounts";
    searchControl = searchInput.control;
    bindSearch(
      searchInput.control,
      () =>
        run(async () => {
          if (matchingIds[0]) await copyAccount(matchingIds[0]);
          else announce("No matching account. Try a different search.");
        }),
      () => announce(emptySearchMessage),
    );
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
    backupNotice = el(
      "aside",
      { class: "notice backup-notice" },
      el("p", {}, "Your accounts changed since your last verified backup."),
      button(
        "Go to Recovery",
        () => {
          ctx.state.view = "backups";
          clear();
          ctx.render();
        },
        "button text",
      ),
      helpBlock("reminder"),
    );
    backupNotice.hidden = true;
    const section = el(
      "section",
      { class: "content" },
      heading,
      upgradeNotice(ctx),
      firstRunTip(),
      backupNotice,
      el("div", { class: "search-row" }, searchInput.wrapper, filter),
      list,
      button("Import accounts", () => importAccounts(), "button text"),
    );
    drawAccounts();
    return section;
  }

  function drawAccounts(): void {
    if (!list || !session.unlocked) return;
    maskAll();
    const notice = backupNotice,
      epoch = ++backupEpoch;
    if (notice)
      void run(async () => {
        const needed = await needsBackup(session.accounts());
        if (epoch === backupEpoch && session.unlocked) notice.hidden = !needed;
      });
    const accounts = session
      .accounts()
      .accounts.filter(
        (a) =>
          (!favorites || a.favorite) &&
          `${a.issuer} ${a.label} ${a.group}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      )
      .sort(
        (a, b) =>
          Number(b.favorite) - Number(a.favorite) ||
          a.issuer.localeCompare(b.issuer) ||
          a.label.localeCompare(b.label),
      );
    matchingIds = accounts.map((account) => account.id);
    const rows = accounts.map((a) => {
      const next = el(
        "div",
        {
          class: "next-code",
          "aria-label": "Next code, valid after the current one expires",
        },
        el("span", { class: "hint" }, "Next"),
        el("span", { class: "next-code-value" }),
      );
      next.hidden = true;
      const label = `${a.issuer} ${a.label}`;
      const code = button(
        "••• •••",
        () =>
          run(async () => {
            session.check();
            if (alwaysShow()) return;
            const timer = revealed.get(a.id);
            if (timer !== undefined) {
              clearTimeout(timer);
              revealed.delete(a.id);
            } else {
              revealed.set(
                a.id,
                setTimeout(() => {
                  revealed.delete(a.id);
                  code.textContent = "••• •••";
                  next.hidden = true;
                  next.querySelector(".next-code-value")!.textContent = "";
                  code.setAttribute(
                    "aria-label",
                    `Reveal code for ${label} (hidden)`,
                  );
                  code.setAttribute("aria-pressed", "false");
                }, 30_000),
              );
            }
            await tick();
          }),
        "otp",
      );
      code.setAttribute("aria-label", `Reveal code for ${label} (hidden)`);
      code.setAttribute("aria-pressed", "false");
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
          button("Copy", () => run(() => copyAccount(a.id)), "button tonal"),
        ),
        a.type === "totp" ? next : null,
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
        const preview = preferenceEnabled("showNextCode") && a.type === "totp";
        if (preview && (alwaysShow() || revealed.has(a.id)) && !cached.next) {
          cached.next = await codeFor(a, now + a.period * 1000);
          if (epoch !== displayEpoch || !session.unlocked) return;
        }
        const visible = alwaysShow() || revealed.has(a.id);
        const next = row.querySelector<HTMLElement>(".next-code");
        if (next) {
          next.hidden = !preview || !visible;
          const value = next.querySelector(".next-code-value")!;
          value.textContent =
            preview && visible && cached.next
              ? cached.next.slice(0, cached.next.length / 2) +
                " " +
                cached.next.slice(cached.next.length / 2)
              : "";
        }
        const code = row.querySelector(".otp")!;
        code.textContent = visible
          ? cached.code.slice(0, cached.code.length / 2) +
            " " +
            cached.code.slice(cached.code.length / 2)
          : "••• •••";
        code.setAttribute("aria-pressed", String(visible));
        code.setAttribute(
          "aria-label",
          visible
            ? `Code for ${a.issuer} ${a.label}: ${cached.code}`
            : `Reveal code for ${a.issuer} ${a.label} (hidden)`,
        );
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

  return { codesView, tick, clear, clearSearch, preview };
}
