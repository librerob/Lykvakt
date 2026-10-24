import { readFile, writeFile } from "node:fs/promises";
for (const name of ["jsqr", "tldts", "tldts-core"]) {
  const license = await readFile(`node_modules/${name}/LICENSE`, "utf8");
  const pkg = JSON.parse(
    await readFile(`node_modules/${name}/package.json`, "utf8"),
  );
  await writeFile(
    `public/licenses/${name}.txt`,
    `${name} ${pkg.version}\n\n${license}`,
  );
}
