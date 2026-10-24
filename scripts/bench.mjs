import { build } from "esbuild";
import { writeFile, mkdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";
await mkdir("artifacts", { recursive: true });
await build({
  entryPoints: ["src/crypto.ts", "src/import.ts", "src/otp.ts"],
  outdir: "artifacts/bench-modules",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const cryptoModule = await import("../artifacts/bench-modules/crypto.js");
const importer = await import("../artifacts/bench-modules/import.js");
const otp = await import("../artifacts/bench-modules/otp.js");
const records = Array.from({ length: 500 }, (_, i) => ({
  ...importer.parseURI(
    "otpauth://totp/Benchmark:synthetic?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  ),
  label: `synthetic-${i}`,
  id: `synthetic-${i}`,
}));
const data = {
  version: 1,
  accounts: records,
  verifiedAt: null,
  verifiedSnapshot: null,
};
const results = {
  runtime: process.version,
  platform: process.platform,
  accounts: 500,
  measurements: {},
  scope:
    "Synthetic Node Web Crypto; not popup startup, browser memory, OS hardware, or idle CPU.",
};
async function measure(name, action) {
  const start = performance.now();
  const value = await action();
  results.measurements[name] = Number((performance.now() - start).toFixed(2));
  return value;
}
const saved = await measure("createVaultMs", () =>
  cryptoModule.createEnvelope("synthetic benchmark passphrase", data),
);
await measure("unlockMs", () =>
  cryptoModule.decryptEnvelope(
    saved.envelope,
    "synthetic benchmark passphrase",
  ),
);
await measure("generate500OTPsMs", () =>
  Promise.all(records.map((a) => otp.codeFor(a, 1234567890000))),
);
await measure("search500Accounts1000TimesMs", () => {
  for (let i = 0; i < 1000; i++)
    records.filter((a) => a.label.includes("synthetic-4"));
});
const archive = await measure("backup500AccountsMs", () =>
  cryptoModule.createEnvelope(
    "synthetic benchmark backup password",
    data,
    "backup",
  ),
);
await measure("verify500AccountsMs", () =>
  importer.verifyBackup(
    JSON.parse(JSON.stringify(archive.envelope)),
    "synthetic benchmark backup password",
    data,
  ),
);
await writeFile(
  "artifacts/bench.json",
  JSON.stringify(results, null, 2) + "\n",
);
console.log(JSON.stringify(results, null, 2));
