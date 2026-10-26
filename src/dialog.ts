// Closing or replacing a dialog cancels the work started in it.
export class DialogLifetime {
  private controller = new AbortController();
  constructor() {
    this.close();
  }
  open(): void {
    this.close();
    this.controller = new AbortController();
  }
  close(): void {
    this.controller.abort(
      new DOMException(
        "Operation cancelled because its dialog closed.",
        "AbortError",
      ),
    );
  }
  signal(): AbortSignal {
    return this.controller.signal;
  }
}
