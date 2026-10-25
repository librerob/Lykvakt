import { expect, it, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import words from "../src/eff-wordlist.json";
import { generatePassphrase } from "../src/passphrase";
import { requireStrongPassword } from "../src/crypto";
afterEach(() => vi.restoreAllMocks());
it("pins all 7776 original EFF entries, including the four hyphenated words", () => {
  expect(words).toHaveLength(7776);
  expect(new Set(words).size).toBe(7776);
  expect(words.every((w) => w.length >= 3 && w.length <= 9)).toBe(true);
  expect(words.filter((w) => w.includes("-"))).toEqual([
    "drop-down",
    "felt-tip",
    "t-shirt",
    "yo-yo",
  ]);
  expect(createHash("sha256").update(words.join("\n")).digest("hex")).toBe(
    "abae49761b88f3f1ba31ef944bea1f61b795a3cd7e1cfb7d276ed45bf77967ba",
  );
});
it("rejects incomplete-range draws and duplicates instead of introducing modulo bias", () => {
  const draws = [62208, 65535, 62207, 0, 0, 1, 2, 3, 4, 5];
  const buffers: Uint16Array[] = [];
  const random = vi
    .spyOn(crypto, "getRandomValues")
    .mockImplementation((buffer) => {
      const raw = buffer as Uint16Array;
      buffers.push(raw);
      if (!draws.length) throw new Error("Unexpected random draw");
      raw[0] = draws.shift()!;
      return buffer;
    });
  const phrase = generatePassphrase();
  expect(phrase).toBe([words[7775], ...words.slice(0, 6)].join("-"));
  expect(random).toHaveBeenCalledTimes(10);
  expect(buffers.every((b) => b[0] === 0)).toBe(true);
});
it("chooses seven distinct valid words with the expected lengths and a strong output", () => {
  const indices = [
    words.indexOf("drop-down"),
    words.indexOf("felt-tip"),
    words.indexOf("t-shirt"),
    words.indexOf("yo-yo"),
    0,
    1,
    2,
  ];
  const selected = indices.map((i) => words[i]!);
  vi.spyOn(crypto, "getRandomValues").mockImplementation((buffer) => {
    (buffer as Uint16Array)[0] = indices.shift()!;
    return buffer;
  });
  const phrase = generatePassphrase();
  expect(selected).toHaveLength(7);
  expect(new Set(selected).size).toBe(7);
  expect(
    selected.every((w) => words.includes(w) && w.length >= 3 && w.length <= 9),
  ).toBe(true);
  expect(phrase).toBe(selected.join("-"));
  expect(phrase.length).toBe(
    selected.reduce((sum, word) => sum + word.length, 6),
  );
  expect(() => requireStrongPassword(phrase)).not.toThrow();
});
it("uses the browser CSPRNG and produces strong passphrases without Math.random", () => {
  vi.spyOn(Math, "random").mockImplementation(() => {
    throw new Error("Insecure RNG");
  });
  for (let i = 0; i < 30; i++) {
    const phrase = generatePassphrase();
    expect(phrase.length).toBeGreaterThanOrEqual(27);
    expect(phrase.length).toBeLessThanOrEqual(69);
    expect(() => requireStrongPassword(phrase)).not.toThrow();
    const pieces = phrase.split("-");
    const selected: string[] = [];
    for (let j = 0; j < pieces.length; j++) {
      const word = words.includes(pieces[j]!)
        ? pieces[j]!
        : pieces[j]! + "-" + pieces[++j]!;
      expect(words).toContain(word);
      selected.push(word);
    }
    expect(selected).toHaveLength(7);
    expect(new Set(selected).size).toBe(7);
  }
});
it("zeroes temporary random bytes even if the RNG fails", () => {
  let raw!: Uint16Array;
  vi.spyOn(crypto, "getRandomValues").mockImplementation((buffer) => {
    raw = buffer as Uint16Array;
    raw[0] = 123;
    throw new Error("Synthetic RNG failure");
  });
  expect(generatePassphrase).toThrow("Synthetic RNG failure");
  expect(raw[0]).toBe(0);
});
