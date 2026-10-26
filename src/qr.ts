import jsQR from "jsqr";
export async function readQRs(
  file: Blob,
  signal?: AbortSignal,
): Promise<string[]> {
  signal?.throwIfAborted();
  if (
    file.size > 18_000_000 ||
    !["image/png", "image/jpeg", "image/webp"].includes(file.type)
  )
    throw new Error("Choose a PNG, JPEG or WebP image under 18 MB.");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  try {
    signal?.throwIfAborted();
    if (
      bitmap.width * bitmap.height > 12_000_000 ||
      bitmap.width > 6000 ||
      bitmap.height > 6000
    )
      throw new Error(
        "QR image dimensions are too large. Use a cropped image.",
      );
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Image decoding unavailable.");
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const found: string[] = [];
    try {
      for (let n = 0; n <= 20; n++) {
        signal?.throwIfAborted();
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
    } finally {
      image.data.fill(0);
    }
    if (!found.length)
      throw new Error(
        "No readable QR code found. Zoom in or use a cropped QR image.",
      );
    return found;
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
export async function readQR(file: File): Promise<string> {
  const values = await readQRs(file);
  if (values.length !== 1) throw new Error("Expected one QR code.");
  return values[0]!;
}
