import { readFile, writeFile } from "node:fs/promises";
for (const name of ["jsqr", "qrcode", "dijkstrajs", "@noble/hashes"]) {
  const license = await readFile(
    `node_modules/${name}/${name === "dijkstrajs" ? "LICENSE.md" : "LICENSE"}`,
    "utf8",
  );
  const pkg = JSON.parse(
    await readFile(`node_modules/${name}/package.json`, "utf8"),
  );
  await writeFile(
    `public/licenses/${name.replace("/", "-").replace("@", "")}.txt`,
    `${name} ${pkg.version}\n\n${license}`,
  );
}
