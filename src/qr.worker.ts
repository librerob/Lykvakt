import { decodeQRs } from "./qr-engine";
import { checkQRFile, checkQRDimensions } from "./qr-policy";
const scope = self as unknown as {
  onmessage: (event: MessageEvent<Blob>) => void;
  postMessage: (value: { values?: string[]; error?: string }) => void;
};
scope.onmessage = (event) => {
  void read(event.data).then(
    (values) => scope.postMessage({ values }),
    (error: unknown) =>
      scope.postMessage({
        error:
          error instanceof Error
            ? error.message
            : "Image decoding unavailable.",
      }),
  );
};
async function read(file: Blob): Promise<string[]> {
  checkQRFile(file);
  const bitmap = await createImageBitmap(file);
  let canvas: OffscreenCanvas | undefined;
  try {
    checkQRDimensions(bitmap.width, bitmap.height);
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Image decoding unavailable.");
    context.drawImage(bitmap, 0, 0);
    return decodeQRs(context.getImageData(0, 0, bitmap.width, bitmap.height));
  } finally {
    bitmap.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
}
