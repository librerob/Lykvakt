import { readFile, writeFile } from "node:fs/promises";
for (const name of ["jsqr", "tldts", "tldts-core", "qrcode", "dijkstrajs"]) {
  const license = await readFile(
    `node_modules/${name}/${name === "dijkstrajs" ? "LICENSE.md" : "LICENSE"}`,
    "utf8",
  );
  const pkg = JSON.parse(
    await readFile(`node_modules/${name}/package.json`, "utf8"),
  );
  await writeFile(
    `public/licenses/${name}.txt`,
    `${name} ${pkg.version}\n\n${license}`,
  );
}
