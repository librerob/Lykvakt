import { writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const url = "https://api.2fa.directory/v4/all.json";
const response = await fetch(url);
if (!response.ok)
  throw new Error(`Directory download failed: ${response.status}`);
const bytes = new Uint8Array(await response.arrayBuffer());
const source = JSON.parse(new TextDecoder().decode(bytes));
const result = {};
for (const [domain, entry] of Object.entries(source).sort(([a], [b]) =>
  a.localeCompare(b, "en"),
)) {
  if (
    !/^[a-z0-9.-]+$/.test(domain) ||
    !Array.isArray(entry.methods) ||
    !entry.methods.length
  )
    continue;
  const row = {
    methods: entry.methods.filter((m) =>
      [
        "totp",
        "sms",
        "email",
        "call",
        "u2f",
        "custom-hardware",
        "custom-software",
      ].includes(m),
    ),
  };
  if (entry.documentation) {
    const u = new URL(entry.documentation);
    if (u.protocol === "https:" && !u.username && !u.password)
      row.documentation = u.href;
  }
  result[domain] = row;
}
await mkdir("public/licenses", { recursive: true });
await writeFile("public/directory.json", JSON.stringify(result));
await writeFile(
  "public/directory-meta.json",
  JSON.stringify(
    {
      source: url,
      api: 4,
      retrieved: new Date().toISOString(),
      sourceSHA256: createHash("sha256").update(bytes).digest("hex"),
      entries: Object.keys(result).length,
      verification:
        "HTTPS retrieval with recorded SHA-256; upstream PGP signature was not verified.",
    },
    null,
    2,
  ) + "\n",
);
const license = await fetch(
  "https://raw.githubusercontent.com/2factorauth/twofactorauth/master/LICENSE.md",
);
if (!license.ok) throw new Error("Directory license unavailable.");
await writeFile("public/licenses/2fa-directory-data.txt", await license.text());
console.log(`Bundled ${Object.keys(result).length} directory domains.`);
