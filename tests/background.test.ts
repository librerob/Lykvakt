import { it, expect, vi } from "vitest";
vi.mock("../src/directory", () => ({
  loadDirectory: vi.fn(async () => ({ "github.com": { methods: ["totp"] } })),
  lookup: (url: string) =>
    url === "https://github.com/"
      ? { domain: "github.com", entry: { methods: ["totp"] } }
      : undefined,
}));
function fixture() {
  let permission = true,
    automatic = true;
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const event = (name: string) => ({
    addListener: (fn: (...args: unknown[]) => void) => handlers.set(name, fn),
  });
  const action = {
    setBadgeText: vi.fn(async () => {}),
    setBadgeBackgroundColor: vi.fn(async () => {}),
    setTitle: vi.fn(async () => {}),
  };
  vi.stubGlobal("chrome", {
    action,
    storage: {
      local: { get: vi.fn(async () => ({ automatic })) },
      onChanged: event("storage"),
    },
    permissions: {
      contains: vi.fn(async () => permission),
      onAdded: event("added"),
      onRemoved: event("revoked"),
    },
    tabs: {
      query: vi.fn(async () => [{ id: 1, url: "https://github.com/" }]),
      get: vi.fn(async () => ({ url: "https://github.com/" })),
      onUpdated: event("updated"),
      onActivated: event("activated"),
      onRemoved: event("removed"),
    },
    runtime: { onStartup: event("startup"), onInstalled: event("installed") },
  });
  return {
    handlers,
    action,
    revoke: () => {
      permission = false;
    },
    disable: () => {
      automatic = false;
    },
  };
}
it("applies only the latest navigation badge for a tab", async () => {
  vi.resetModules();
  const { handlers, action } = fixture();
  await import("../src/background");
  handlers.get("updated")!(1, { url: "https://github.com/" }, {});
  handlers.get("updated")!(
    1,
    { url: "https://github.com.attacker.example/" },
    {},
  );
  await vi.waitFor(() => expect(action.setBadgeText).toHaveBeenCalledTimes(1));
  expect(action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 1, text: "" });
  vi.unstubAllGlobals();
});
it("clears indicators on permission revocation and preference disabling", async () => {
  vi.resetModules();
  const { handlers, action, revoke, disable } = fixture();
  await import("../src/background");
  handlers.get("updated")!(1, { url: "https://github.com/" }, {});
  await vi.waitFor(() =>
    expect(action.setBadgeText).toHaveBeenLastCalledWith({
      tabId: 1,
      text: "2FA",
    }),
  );
  revoke();
  handlers.get("revoked")!();
  await vi.waitFor(() =>
    expect(action.setBadgeText).toHaveBeenLastCalledWith({
      tabId: 1,
      text: "",
    }),
  );
  disable();
  handlers.get("storage")!({ automatic: { newValue: false } }, "local");
  await vi.waitFor(() =>
    expect(action.setTitle).toHaveBeenLastCalledWith({
      tabId: 1,
      title: "OTP Vault",
    }),
  );
  vi.unstubAllGlobals();
});
