import { trustedSessionSender } from "./session-broker";
import { extensionOrigin } from "./extension-origin";
export async function sessionSource(
  sender: chrome.runtime.MessageSender,
  id: string,
  popups: () => Promise<chrome.runtime.ExtensionContext[]>,
  root = "chrome-extension://" + id + "/",
): Promise<string | undefined> {
  if (trustedSessionSender(sender, id, root)) return sender.documentId;
  const origin = extensionOrigin(root);
  // Some toolbar messages omit tab metadata; ask the browser for their identity.
  if (
    !origin ||
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
