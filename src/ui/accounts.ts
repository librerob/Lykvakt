import { button, el, svg } from "../dom";
import { bindSearch } from "../keyboard";
import { emptySearchMessage } from "../help";
import { preferenceEnabled, savePreference } from "../preferences";
import { codeFor } from "../otp";
import { needsBackup } from "./recovery";
import type { Account } from "../model";
import type { SkippedEntry } from "../import-result";
import type { AppContext } from "./context";
const groupCode = (code: string) =>
  code.length === 5
    ? code.slice(0, 2) + " " + code.slice(2)
    : code.slice(0, code.length / 2) + " " + code.slice(code.length / 2);
export function createAccounts(ctx: AppContext) {
  const { session, run, announce, confirmAction } = ctx;
  let search = "",
    favorites = false;
  let list: HTMLElement | undefined;
  let searchRow: HTMLElement | undefined;
  let searchControl: HTMLInputElement | undefined;
  let matchingIds: string[] = [];
  let displayEpoch = 0;
  let backupEpoch = 0;
  let backupNotice: HTMLElement | undefined;
  const revealed = new Map<string, ReturnType<typeof setTimeout>>();
  const masks = new Map<HTMLElement, string>();
  const alwaysShow = () => preferenceEnabled("alwaysShowCodes");
  function maskAll() {
    for (const timer of revealed.values()) clearTimeout(timer);
    revealed.clear();
  }
  const codeCache = new Map<
    string,
    { step: string; code: string; next?: string }
  >();
  type Enrollment = ReturnType<typeof import("./enrollment").createEnrollment>;
  let loadedEnrollment: Enrollment | undefined;
  function enrollment(
    action: (tools: Enrollment) => void | Promise<void>,
  ): void | Promise<void> {
    session.check();
    if (loadedEnrollment) return action(loadedEnrollment);
    const epoch = session.epoch();
    return import("./enrollment").then(({ createEnrollment }) => {
      session.check();
      if (epoch !== session.epoch())
        throw new Error("Account action cancelled by locking.");
      loadedEnrollment ??= createEnrollment(ctx, drawAccounts);
      return action(loadedEnrollment);
    });
  }
  const addAccount = () => run(() => enrollment((tools) => tools.addAccount()));
  const importAccounts = () =>
    run(() => enrollment((tools) => tools.importAccounts()));
  const editAccount = (id: string) =>
    run(() => enrollment((tools) => tools.editAccount(id)));
  const preview = async (
    accounts: Account[],
    skipped: SkippedEntry[] = [],
    signal?: AbortSignal,
  ) =>
    enrollment((tools) => tools.preview(accounts, skipped, undefined, signal));
  function mask() {
    displayEpoch++;
    maskAll();
    for (const code of list?.querySelectorAll<HTMLElement>(".otp") ?? []) {
      code.textContent = masks.get(code) ?? "••• •••";
      code.setAttribute("aria-label", "Code hidden");
      code.setAttribute("aria-pressed", "false");
    }
    for (const next of list?.querySelectorAll<HTMLElement>(".next-code") ??
      []) {
      next.hidden = true;
      next.querySelector(".next-code-value")!.textContent = "";
    }
    codeCache.clear();
  }

  function clear() {
    mask();
    backupEpoch++;
    backupNotice = undefined;
    masks.clear();
    matchingIds = [];
    searchControl = undefined;
    search = "";
    list = undefined;
    searchRow = undefined;
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
    return button(
      "Got it",
      () => {
        ctx.state.firstRunTip = false;
        savePreference("firstRunTips", "false");
        drawAccounts();
      },
      "button text",
    );
  }
  function codesView(): HTMLElement {
    if (!loadedEnrollment) {
      const epoch = session.epoch();
      void import("./enrollment")
        .then(({ createEnrollment }) => {
          if (session.unlocked && epoch === session.epoch())
            loadedEnrollment ??= createEnrollment(ctx, drawAccounts);
        })
        .catch(() => {
          /* The explicit account action reports a load failure. */
        });
    }
    const add = button("+ Add account", () => addAccount(), "button primary");
    const searchInput = el("input", {
      name: "search",
      type: "search",
      placeholder: "Search accounts",
      "aria-label": "Search accounts",
      autocomplete: "off",
    });
    searchInput.value = search;
    searchControl = searchInput;
    bindSearch(
      searchInput,
      () =>
        run(async () => {
          if (matchingIds[0]) await copyAccount(matchingIds[0]);
          else announce("No matching account. Try a different search.");
        }),
      () => announce(emptySearchMessage),
    );
    searchInput.addEventListener("input", () => {
      search = searchInput.value;
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
      { class: "backup-notice", "aria-label": "Backup reminder" },
      el("span", {}, "Backup not verified."),
      button(
        "Review backup",
        () => {
          ctx.state.view = "backups";
          clear();
          ctx.render();
        },
        "button text",
      ),
    );
    const notice = backupNotice;
    const dismiss = button(
      "×",
      () => {
        ctx.state.backupDismissed = true;
        notice.hidden = true;
      },
      "button text",
    );
    dismiss.setAttribute("aria-label", "Dismiss backup reminder");
    backupNotice.append(dismiss);
    backupNotice.hidden = true;
    searchRow = el("div", { class: "search-row" }, searchInput, filter);
    const section = el(
      "section",
      { class: "content" },
      el("h1", { class: "sr-only" }, "Accounts"),
      el(
        "div",
        { class: "account-tools" },
        add,
        button(
          "Import",
          () => {
            ctx.state.view = "backups";
            clear();
            ctx.render();
          },
          "button text",
        ),
      ),
      backupNotice,
      searchRow,
      list,
    );
    drawAccounts();
    return section;
  }

  function drawAccounts(): void {
    if (!list || !session.unlocked) return;
    const data = session.accounts();
    if (!data.accounts.length) {
      search = "";
      favorites = false;
      if (searchControl) searchControl.value = "";
    }
    maskAll();
    const notice = backupNotice,
      epoch = ++backupEpoch;
    if (notice)
      void run(async () => {
        const needed = await needsBackup(session.accounts());
        if (epoch === backupEpoch && session.unlocked)
          notice.hidden =
            !needed ||
            !!ctx.state.backupDismissed ||
            !session.accounts().accounts.length;
      });
    if (searchRow) searchRow.hidden = !session.accounts().accounts.length;
    if (searchControl)
      searchControl.hidden = !session.accounts().accounts.length;
    const accounts = data.accounts
      .filter(
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
    masks.clear();
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
      const mask = a.type === "steam" ? "•• •••" : "••• •••";
      const code = button(
        mask,
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
                  code.textContent = mask;
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
      masks.set(code, mask);
      code.setAttribute("title", "Reveal or hide this code");
      const remaining = el("span", {
        class: a.type === "hotp" ? "remaining counter" : "remaining",
        role: "img",
        ...(a.type === "hotp" ? { title: `Counter ${a.counter}` } : {}),
      });
      if (a.type !== "hotp")
        remaining.append(
          svg(
            "svg",
            {
              viewBox: "0 0 24 24",
              width: "22",
              height: "22",
              "aria-hidden": "true",
            },
            svg("circle", { cx: "12", cy: "12", r: "9", class: "ring-track" }),
            svg("circle", {
              cx: "12",
              cy: "12",
              r: "9",
              class: "ring-progress",
              pathLength: "100",
              "stroke-dasharray": "100",
            }),
          ),
          el("span", { class: "ring-number", "aria-hidden": "true" }),
        );
      const copy = button(
        "Copy",
        () => run(() => copyAccount(a.id)),
        "button row-copy",
      );
      copy.setAttribute("aria-label", `Copy code for ${label}`);
      copy.setAttribute(
        "title",
        label + (a.type === "hotp" ? ` · Counter ${a.counter}` : ""),
      );
      const favorite = button(
        a.favorite ? "★" : "☆",
        () =>
          run(async () => {
            const data = session.accounts(),
              account = data.accounts.find((x) => x.id === a.id)!;
            account.favorite = !account.favorite;
            await session.save(data);
            drawAccounts();
          }),
        "button text favorite",
      );
      favorite.setAttribute(
        "aria-label",
        `${a.favorite ? "Remove" : "Add"} favorite: ${label}`,
      );
      const actions = el(
        "div",
        { class: "row-menu stack" },
        button("Edit", () => editAccount(a.id), "button text"),
        favorite,
      );
      if (a.type === "hotp")
        actions.append(
          button(
            "Advance counter…",
            () =>
              confirmAction(
                "Advance HOTP counter?",
                `Current counter: ${a.counter}. Advance only after the service has consumed this code. Opening the vault never advances it.`,
                "Advance once",
                async (signal) => {
                  const data = session.accounts(),
                    current = data.accounts.find((x) => x.id === a.id)!;
                  current.counter = (BigInt(current.counter) + 1n).toString();
                  await session.save(data, undefined, undefined, signal);
                  signal.throwIfAborted();
                  drawAccounts();
                },
              ),
            "button text advance",
          ),
        );
      const row = el(
        "article",
        { class: "account", "data-account": a.id },
        copy,
        el(
          "div",
          { class: "account-name", role: "group", "aria-label": label },
          el("h2", { title: a.issuer || a.label }, a.issuer || a.label),
          el("p", { title: a.label }, a.label),
        ),
        el(
          "div",
          { class: "code-cell" },
          code,
          a.type !== "hotp" ? next : null,
        ),
        remaining,
        el(
          "details",
          { class: "account-more" },
          el("summary", { "aria-label": `More for ${label}` }, "⋯"),
          actions,
        ),
      );
      return row;
    });
    list.replaceChildren(...rows);
    if (!accounts.length)
      list.append(
        el(
          "div",
          {
            class: "empty",
            ...(!search && !favorites && ctx.state.firstRunTip
              ? { role: "complementary", "aria-label": "Getting started" }
              : {}),
          },
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
              : "Add a setup key or import your accounts in Backup. Keep your password and test a backup.",
          ),
          !search && !favorites ? firstRunTip() : null,
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
        const preview = preferenceEnabled("showNextCode") && a.type !== "hotp";
        if (preview && (alwaysShow() || revealed.has(a.id)) && !cached.next) {
          cached.next = await codeFor(a, now + a.period * 1000);
          if (epoch !== displayEpoch || !session.unlocked) return;
        }
        const visible = ctx.isVisible() && (alwaysShow() || revealed.has(a.id));
        const next = row.querySelector<HTMLElement>(".next-code");
        if (next) {
          next.hidden = !preview || !visible;
          const value = next.querySelector(".next-code-value")!;
          value.textContent =
            preview && visible && cached.next ? groupCode(cached.next) : "";
        }
        const code = row.querySelector(".otp")!;
        code.textContent = visible
          ? groupCode(cached.code)
          : a.type === "steam"
            ? "•• •••"
            : "••• •••";
        code.setAttribute("aria-pressed", String(visible));
        code.setAttribute(
          "aria-label",
          visible
            ? `Code for ${a.issuer} ${a.label}: ${cached.code}`
            : `Reveal code for ${a.issuer} ${a.label} (hidden)`,
        );
        const remaining = a.period - (Math.floor(now / 1000) % a.period);
        const indicator = row.querySelector(".remaining")!;
        if (a.type === "hotp") {
          indicator.textContent = a.counter;
          indicator.setAttribute("aria-label", `Counter ${a.counter}`);
        } else {
          indicator
            .querySelector(".ring-progress")!
            .setAttribute(
              "stroke-dashoffset",
              String(-100 * (1 - remaining / a.period)),
            );
          indicator.querySelector(".ring-number")!.textContent =
            remaining <= 10 ? String(remaining) : "";
          indicator.setAttribute(
            "aria-label",
            `${remaining} seconds remaining${remaining <= 5 ? ", expiring soon" : ""}`,
          );
        }
        row.classList.toggle("expiring", a.type !== "hotp" && remaining <= 5);
      }),
    );
  }

  return { codesView, tick, clear, mask, clearSearch, preview, importAccounts };
}
