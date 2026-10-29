import { afterEach, beforeEach, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import { readQRs } from "../src/qr";
import { decodeQRs } from "../src/qr-engine";
import { checkQRFile, QR_DECODE_TIMEOUT } from "../src/qr-policy";
class TestWorker {
  static all: TestWorker[] = [];
  static failStart = false;
  static failPost = false;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn(() => {
    if (TestWorker.failPost) throw new Error("clone failed");
  });
  constructor() {
    if (TestWorker.failStart) throw new Error("worker failed");
    TestWorker.all.push(this);
  }
}
const file = () => new Blob(["synthetic"], { type: "image/png" });
beforeEach(() => {
  TestWorker.all = [];
  TestWorker.failStart = TestWorker.failPost = false;
  vi.stubGlobal("Worker", TestWorker);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("runs image work in a worker and terminates it after success", async () => {
  const pending = readQRs(file());
  const worker = TestWorker.all[0]!;
  worker.onmessage!({ data: { values: ["otpauth://synthetic"] } });
  await expect(pending).resolves.toEqual(["otpauth://synthetic"]);
  expect(worker.postMessage).toHaveBeenCalledOnce();
  expect(worker.terminate).toHaveBeenCalledOnce();
});
it("rejects invalid files before starting a worker", async () => {
  await expect(
    readQRs(new Blob(["<svg/>"], { type: "image/svg+xml" })),
  ).rejects.toThrow("PNG, JPEG or WebP");
  const oversized = file();
  Object.defineProperty(oversized, "size", { value: 18_000_001 });
  expect(() => checkQRFile(oversized)).toThrow("18 MB");
  expect(TestWorker.all).toEqual([]);
});
it("does not fall back to decoding on the UI thread when Worker is unavailable", async () => {
  vi.stubGlobal("Worker", undefined);
  await expect(readQRs(file())).rejects.toThrow("QR reading could not start");
});
it.each(["start", "post", "error", "messageerror"])(
  "fails cleanly on worker %s errors",
  async (kind) => {
    TestWorker.failStart = kind === "start";
    TestWorker.failPost = kind === "post";
    const pending = readQRs(file());
    const worker = TestWorker.all[0];
    if (kind === "error") worker!.onerror!();
    if (kind === "messageerror") worker!.onmessageerror!();
    await expect(pending).rejects.toThrow("QR reading could not start");
    if (worker) expect(worker.terminate).toHaveBeenCalledOnce();
  },
);
it("rejects an already-cancelled read without a worker", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(readQRs(file(), controller.signal)).rejects.toHaveProperty(
    "name",
    "AbortError",
  );
  expect(TestWorker.all).toEqual([]);
});
it("cancellation terminates an in-flight decoder and ignores a late reply", async () => {
  const controller = new AbortController();
  const pending = readQRs(file(), controller.signal);
  const worker = TestWorker.all[0]!;
  controller.abort();
  worker.onmessage!({ data: { values: ["late secret"] } });
  await expect(pending).rejects.toHaveProperty("name", "AbortError");
  expect(worker.terminate).toHaveBeenCalledOnce();
});
it("enforces a ten-second deadline even if the decoder never replies", async () => {
  vi.useFakeTimers();
  const pending = readQRs(file());
  const assertion = expect(pending).rejects.toThrow("took too long");
  await vi.advanceTimersByTimeAsync(QR_DECODE_TIMEOUT);
  await assertion;
  expect(TestWorker.all[0]!.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it.each([
  { values: [7] },
  { values: [] },
  { error: "No readable QR code found." },
])(
  "rejects unusable worker replies without leaving the worker running: %j",
  async (data) => {
    const pending = readQRs(file());
    const worker = TestWorker.all[0]!;
    worker.onmessage!({ data });
    await expect(pending).rejects.toThrow("No readable QR");
    expect(worker.terminate).toHaveBeenCalledOnce();
  },
);
function pixels(values: string[]) {
  const matrices = values.map(
    (value) => QRCode.create(value, { errorCorrectionLevel: "M" }).modules,
  );
  const cell = Math.max(...matrices.map((m) => m.size)) * 3 + 24;
  const columns = Math.min(values.length, 5),
    width = cell * columns,
    height = cell * Math.ceil(values.length / columns);
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let k = 0; k < matrices.length; k++) {
    const m = matrices[k]!;
    const left = (k % columns) * cell + 12,
      top = Math.floor(k / columns) * cell + 12;
    for (let y = 0; y < m.size; y++)
      for (let x = 0; x < m.size; x++)
        if (m.data[y * m.size + x])
          for (let dy = 0; dy < 3; dy++)
            for (let dx = 0; dx < 3; dx++) {
              const p = ((top + y * 3 + dy) * width + left + x * 3 + dx) * 4;
              data[p] = data[p + 1] = data[p + 2] = 0;
            }
  }
  return { data, width, height };
}
it("decodes real QR images with different payloads and wipes their pixels", () => {
  for (const values of [["otpauth://one"], ["otpauth://two"]]) {
    const image = pixels(values);
    expect(decodeQRs(image).sort()).toEqual(values.sort());
    expect(image.data.every((n) => n === 0)).toBe(true);
  }
});
it.each([
  [6001, 1],
  [4000, 4000],
  [0, 1],
])(
  "rejects excessive or invalid dimensions %ix%i and wipes the buffer",
  (width, height) => {
    const data = new Uint8ClampedArray([255, 255, 255, 255]);
    expect(() => decodeQRs({ data, width, height })).toThrow("dimensions");
    expect([...data]).toEqual([0, 0, 0, 0]);
  },
);
it("rejects blank images and clears their pixel data", () => {
  const image = {
    data: new Uint8ClampedArray(100 * 100 * 4).fill(255),
    width: 100,
    height: 100,
  };
  expect(() => decodeQRs(image)).toThrow("No readable QR code");
  expect(image.data.every((n) => n === 0)).toBe(true);
});
