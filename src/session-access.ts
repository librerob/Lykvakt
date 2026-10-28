import { extensionOrigin } from "./extension-origin";
export async function restrictSessionStorage(
  root: string,
  restrict: () => Promise<void>,
): Promise<void> {
  if (!extensionOrigin(root)) throw new Error("Invalid extension origin.");
  // Firefox keeps storage.session privileged and has no setAccessLevel method.
  if (root.startsWith("moz-extension:")) return;
  await restrict();
}
