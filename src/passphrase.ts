import words from "./eff-wordlist.json";

export function generatePassphrase(): string {
  const selected = new Set<string>();
  const raw = new Uint16Array(1);
  // Discard the incomplete range so every word has exactly eight possible draws.
  const limit = 65_536 - (65_536 % words.length);
  try {
    while (selected.size < 7) {
      crypto.getRandomValues(raw);
      if (raw[0]! < limit) selected.add(words[raw[0]! % words.length]!);
    }
    return [...selected].join("-");
  } finally {
    raw.fill(0);
  }
}
