import { expect, it, vi } from "vitest";
import jsQR from "jsqr";
import { decodeQRs } from "../src/qr-engine";
vi.mock("jsqr", () => ({ default: vi.fn() }));
it("rejects more than twenty detections rather than silently returning a partial image", () => {
  vi.mocked(jsQR).mockReturnValue({
    data: "otpauth://test",
    location: {
      topLeftCorner: { x: 0, y: 0 },
      topRightCorner: { x: 1, y: 0 },
      bottomLeftCorner: { x: 0, y: 1 },
      bottomRightCorner: { x: 1, y: 1 },
    },
  } as NonNullable<ReturnType<typeof jsQR>>);
  const image = {
    data: new Uint8ClampedArray(10 * 10 * 4).fill(255),
    width: 10,
    height: 10,
  };
  expect(() => decodeQRs(image)).toThrow("Too many QR codes");
  expect(jsQR).toHaveBeenCalledTimes(21);
  expect(image.data.every((value) => value === 0)).toBe(true);
});
