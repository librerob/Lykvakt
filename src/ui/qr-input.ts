export function qrImageInput(
  target: HTMLElement,
  read: (files: File[]) => Promise<void>,
  explain: (message: string) => void,
): void {
  target.addEventListener("paste", (event) => {
    const files = [...((event as ClipboardEvent).clipboardData?.files ?? [])];
    if (!files.length) return;
    event.preventDefault();
    void read(files);
  });
  target.addEventListener("dragover", (event) => event.preventDefault());
  target.addEventListener("drop", (event) => {
    event.preventDefault();
    const files = [...((event as DragEvent).dataTransfer?.files ?? [])];
    if (files.length) void read(files);
    else
      explain(
        "This drop contains no image file. Copy the QR image and paste it here, or choose an image file. Links are not downloaded.",
      );
  });
}
