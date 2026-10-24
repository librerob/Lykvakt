import jsQR from "jsqr";

export async function readQR(file: File): Promise<string> {
  if (
    file.size > 8_000_000 ||
    !["image/png", "image/jpeg", "image/webp"].includes(file.type)
  )
    throw new Error("Choose a PNG, JPEG or WebP image under 8 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (
      bitmap.width * bitmap.height > 12_000_000 ||
      bitmap.width > 6000 ||
      bitmap.height > 6000
    )
      throw new Error("QR image dimensions are too large.");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Image decoding unavailable.");
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const result = jsQR(image.data, image.width, image.height, {
      inversionAttempts: "attemptBoth",
    });
    image.data.fill(0);
    canvas.width = 0;
    canvas.height = 0;
    if (!result) throw new Error("No readable QR code found.");
    return result.data;
  } finally {
    bitmap.close();
  }
}
