import { button, el, input } from "../dom";
import { codeFor } from "../otp";
import { loadDirectory, lookup, safeLink } from "../directory";
import { createEnrollment } from "./enrollment";
import type { AppContext } from "./context";
export function createAccounts(ctx: AppContext) {
  const { session, isExtension, run, announce, confirmAction } = ctx;
  let search = "",
    favorites = false;
  let list: HTMLElement | undefined;
  let displayEpoch = 0;
  const codeCache = new Map<string, { step: string; code: string }>();
  const { addAccount, preview, importAccounts, editAccount } = createEnrollment(
    ctx,
    drawAccounts,
  );
  function clear() {
    displayEpoch++;
    codeCache.clear();
    search = "";
    list = undefined;
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

  return { codesView, tick, clear, preview };
}
