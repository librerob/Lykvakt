import jsQR from "jsqr";
import { checkQRDimensions } from "./qr-policy";
export function decodeQRs(
  image: Pick<ImageData, "data" | "width" | "height">,
): string[] {
  const found: string[] = [];
  try {
    checkQRDimensions(image.width, image.height);
    if (image.data.length !== image.width * image.height * 4)
      throw new Error("Image decoding unavailable.");
    for (let n = 0; n <= 20; n++) {
      const qr = jsQR(image.data, image.width, image.height, {
        inversionAttempts: "attemptBoth",
      });
      if (!qr) break;
      if (n === 20)
        throw new Error("Too many QR codes. Import smaller groups.");
      found.push(qr.data);
      const corners = [
        qr.location.topLeftCorner,
        qr.location.topRightCorner,
        qr.location.bottomLeftCorner,
        qr.location.bottomRightCorner,
      ];
      const left = Math.max(
        0,
        Math.floor(Math.min(...corners.map((p) => p.x))) - 2,
      );
      const right = Math.min(
        image.width,
        Math.ceil(Math.max(...corners.map((p) => p.x))) + 2,
      );
      const top = Math.max(
        0,
        Math.floor(Math.min(...corners.map((p) => p.y))) - 2,
      );
      const bottom = Math.min(
        image.height,
        Math.ceil(Math.max(...corners.map((p) => p.y))) + 2,
      );
      for (let y = top; y < bottom; y++)
        image.data.fill(
          255,
          (y * image.width + left) * 4,
          (y * image.width + right) * 4,
        );
    }

    if (!found.length)
      throw new Error(
        "No readable QR code found. Zoom in or use a cropped QR image.",
      );
    return found;
  } finally {
    image.data.fill(0);
  }
}
