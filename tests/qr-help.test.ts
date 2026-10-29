import { expect, it } from "vitest";
import { friendlyError } from "../src/help";
it.each([
  "QR reading took too long. Try a smaller, cropped image.",
  "No readable QR code found. Zoom in or use a cropped QR image.",
  "QR reading could not start. Reload this extension and try again.",
])(
  "QR failures give useful guidance without suggesting an incorrect password: %s",
  (message) => {
    expect(friendlyError(new Error(message))).toMatchObject({ message });
  },
);
