import { SessionBroker } from "./session-broker";
import { sessionSource } from "./session-sender";
import { SESSION_KEY, SESSION_ALARM, SESSION_MESSAGE } from "./session-cache";
import { load, isOldVault, isRecoveryOffer } from "./storage";
const ready = chrome.storage.session.setAccessLevel({
  accessLevel: "TRUSTED_CONTEXTS",
});
const broker = new SessionBroker({
  read: async () => {
    await ready;
    return (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY];
  },
  write: async (state) => {
    await ready;
    await chrome.storage.session.set({ [SESSION_KEY]: state });
  },
  active: async () => {
    const e = await load();
    return e && !isOldVault(e) && !isRecoveryOffer(e) ? e : undefined;
  },
  alarm: async (expires) => {
    await chrome.alarms.clear(SESSION_ALARM);
    if (expires) await chrome.alarms.create(SESSION_ALARM, { when: expires });
  },
  now: Date.now,
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== SESSION_MESSAGE) return;
  void sessionSource(sender, chrome.runtime.id, () =>
    chrome.runtime.getContexts({
      contextTypes: ["POPUP"],
      documentUrls: [sender.url!],
    }),
  )
    .then(async (source) => {
      if (!source) {
        respond({ ok: false });
        return;
      }
      const value = await broker.request(message, source);
      respond({ ok: true, source, value });
    })
    .catch(() => respond({ ok: false }));
  return true;
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SESSION_ALARM)
    void broker
      .request({ action: "expire" }, "alarm")
      .catch(() => chrome.runtime.reload());
});
// Recreate a lost alarm after worker restart; this never extends the deadline.
void broker
  .request({ action: "expire" }, "worker")
  .catch(() => chrome.runtime.reload());
