import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(dir + "/" + e.name) : [dir + "/" + e.name],
  );
const lines = (paths) =>
  paths.reduce(
    (n, p) =>
      n +
      readFileSync(p, "utf8").split("\n").length -
      Number(readFileSync(p, "utf8").endsWith("\n")),
    0,
  );
const src = walk("src"),
  tests = walk("tests").filter((p) => /\.(ts|mjs)$/.test(p));
const docs = [
  ...readdirSync(".").filter((p) => /\.md$/.test(p)),
  ...walk("docs").filter((p) => /\.md$/.test(p)),
];
const dist = walk("dist").map((path) => {
  const bytes = readFileSync(path);
  return {
    path: path.slice(5),
    raw: bytes.length,
    gzip: gzipSync(bytes).length,
  };
});
const result = {
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  sourceTsLines: lines(src.filter((p) => /\.ts$/.test(p))),
  cssLines: lines(src.filter((p) => /\.css$/.test(p))),
  testLines: lines(tests),
  docsLines: lines(docs),
  dist,
  rawTotal: dist.reduce((n, p) => n + p.raw, 0),
  gzipTotal: dist.reduce((n, p) => n + p.gzip, 0),
};
mkdirSync("artifacts", { recursive: true });
writeFileSync(
  resolve(process.argv[2] || "artifacts/metrics.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));
