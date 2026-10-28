import { trustedSessionSender } from "./session-broker";
export async function sessionSource(
  sender: chrome.runtime.MessageSender,
  id: string,
  popups: () => Promise<chrome.runtime.ExtensionContext[]>,
): Promise<string | undefined> {
  if (trustedSessionSender(sender, id)) return sender.documentId;
  const origin = "chrome-extension://" + id;
  // Toolbar messages omit tab metadata; resolve their identity through Chrome.
  if (
    sender.id !== id ||
    sender.origin !== origin ||
    sender.url !== origin + "/index.html" ||
    sender.tab !== undefined ||
    sender.frameId !== undefined ||
    sender.documentId !== undefined
  )
    return undefined;
  const matches = (await popups()).filter(
    (context) =>
      context.contextType === "POPUP" &&
      context.documentUrl === sender.url &&
      context.documentOrigin === origin &&
      context.tabId === -1 &&
      (context.frameId === 0 || context.frameId === -1) &&
      typeof context.documentId === "string" &&
      context.documentId.length > 0,
  );
  return matches.length === 1 ? matches[0]!.documentId : undefined;
}
