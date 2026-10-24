import { it, expect } from "vitest";
import { lookup, safeLink } from "../src/directory";
const directory = {
  "github.com": {
    methods: ["totp", "u2f"],
    documentation: "https://docs.github.com/",
  },
  "example.co.uk": { methods: ["totp"] },
  "xn--bcher-kva.example": { methods: ["totp"] },
  "alice.github.io": { methods: ["totp"] },
  "github.io": { methods: ["totp"] },
};
it.each([
  "https://github.com/",
  "https://login.github.com/",
  "https://GITHUB.COM./",
])("matches valid host %s", (url) =>
  expect(lookup(url, directory)?.domain).toBe("github.com"),
);
it.each([
  "https://github.com.attacker.example",
  "https://notgithub.com",
  "https://githüb.com",
  "https://github.com@evil.example",
  "file:///github.com",
  "chrome://settings",
  "javascript:alert(1)",
  "https://bob.github.io",
  "https://127.0.0.1",
  "garbage",
])("rejects phishing and unsupported hosts %s", (url) =>
  expect(lookup(url, directory)).toBeUndefined(),
);
it("respects public and private suffix boundaries", () => {
  expect(lookup("https://login.example.co.uk", directory)?.domain).toBe(
    "example.co.uk",
  );
  expect(lookup("https://alice.github.io", directory)?.domain).toBe(
    "alice.github.io",
  );
});
it("normalizes IDNs without associating lookalikes", () => {
  expect(lookup("https://bücher.example", directory)?.domain).toBe(
    "xn--bcher-kva.example",
  );
});
it.each([
  "javascript:alert(1)",
  "http://example.com",
  "https://user:password@example.com",
  "not a url",
])("rejects unsafe documentation links", (s) =>
  expect(safeLink(s)).toBeUndefined(),
);
