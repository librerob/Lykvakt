export const QR_DECODE_TIMEOUT = 10_000;
export function checkQRFile(file: Blob): void {
  if (
    !(file instanceof Blob) ||
    file.size > 18_000_000 ||
    !["image/png", "image/jpeg", "image/webp"].includes(file.type)
  )
    throw new Error("Choose a PNG, JPEG or WebP image under 18 MB.");
}
export function checkQRDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 12_000_000 ||
    width > 6000 ||
    height > 6000
  )
    throw new Error("QR image dimensions are too large. Use a cropped image.");
}
