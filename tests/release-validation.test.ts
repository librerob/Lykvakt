import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  unlink,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { afterEach, beforeEach, expect, it } from "vitest";
import { verifyReleaseAssets } from "../scripts/verify-release.mjs";
const version = "0.0.1",
  commit = "a".repeat(40);
let root: string;
async function archive(
  target: string,
  change?: { version?: string; commit?: string; permissions?: string[] },
) {
  const name = "lykvakt-" + version + "-" + target + ".zip",
    path = join(root, target === "source" ? "firefox" : target, name);
  await mkdir(dirname(path), { recursive: true });
  const files =
    target === "source"
      ? {
          "README-BUILD.txt": strToU8(
            "Lykvakt source at commit " + (change?.commit ?? commit) + "\n",
          ),
          "package.json": strToU8(
            JSON.stringify({ version: change?.version ?? version }),
          ),
        }
      : {
          "manifest.json": strToU8(
            JSON.stringify({
              version: change?.version ?? version,
              permissions: change?.permissions ?? [
                "clipboardWrite",
                "storage",
                "alarms",
              ],
              commands: {
                _execute_action: {
                  suggested_key: {
                    default:
                      target === "edge" ? "Ctrl+Shift+7" : "Ctrl+Shift+Y",
                  },
                },
              },
              ...(target === "firefox"
                ? { browser_specific_settings: { gecko: { id: "synthetic" } } }
                : {}),
            }),
          ),
        };
  const bytes = zipSync(files);
  await writeFile(path, bytes);
  await writeFile(
    path + ".sha256",
    createHash("sha256").update(bytes).digest("hex") + "  " + name + "\n",
  );
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "lykvakt-release-"));
  for (const target of ["chrome", "edge", "firefox", "source"])
    await archive(target);
});
afterEach(async () => {
  if (
    dirname(resolve(root)) !== resolve(tmpdir()) ||
    !basename(root).startsWith("lykvakt-release-")
  )
    throw new Error("Unsafe test cleanup path.");
  await rm(root, { recursive: true, force: true });
});
it("accepts the matching browser and source packages", async () => {
  expect(
    (await verifyReleaseAssets(root, version, commit)).map((file) => file.name),
  ).toEqual(
    ["chrome", "edge", "firefox", "source"].map(
      (target) => "lykvakt-" + version + "-" + target + ".zip",
    ),
  );
});
it.each(["chrome", "edge", "firefox", "source"])(
  "refuses release preparation when the %s archive is absent",
  async (target) => {
    await unlink(
      join(
        root,
        target === "source" ? "firefox" : target,
        "lykvakt-" + version + "-" + target + ".zip",
      ),
    );
    await expect(verifyReleaseAssets(root, version, commit)).rejects.toThrow();
  },
);
it("rejects an incorrect checksum even when its ZIP is readable", async () => {
  await writeFile(
    join(root, "edge", "lykvakt-" + version + "-edge.zip.sha256"),
    "0".repeat(64) + "  lykvakt-" + version + "-edge.zip\n",
  );
  await expect(verifyReleaseAssets(root, version, commit)).rejects.toThrow(
    "checksum mismatch",
  );
});
it("rejects a mismatched extension version despite a valid checksum", async () => {
  await archive("firefox", { version: "9.9.9" });
  await expect(verifyReleaseAssets(root, version, commit)).rejects.toThrow(
    "version mismatch",
  );
});
it("rejects a source archive from a different commit", async () => {
  await archive("source", { commit: "b".repeat(40) });
  await expect(verifyReleaseAssets(root, version, commit)).rejects.toThrow(
    "commit mismatch",
  );
});
it("rejects a source archive with the wrong package version", async () => {
  await archive("source", { version: "9.9.9" });
  await expect(verifyReleaseAssets(root, version, commit)).rejects.toThrow(
    "version mismatch",
  );
});
it("rejects unexpected runtime permissions", async () => {
  await archive("chrome", {
    permissions: ["clipboardWrite", "storage", "alarms", "tabs"],
  });
  await expect(verifyReleaseAssets(root, version, commit)).rejects.toThrow();
});
it("rejects swapping Chrome and Edge ZIPs even with recomputed checksums", async () => {
  const bytes = await readFile(
      join(root, "chrome", "lykvakt-" + version + "-chrome.zip"),
    ),
    to = join(root, "edge", "lykvakt-" + version + "-edge.zip");
  await writeFile(to, bytes);
  await writeFile(
    to + ".sha256",
    createHash("sha256").update(bytes).digest("hex") +
      "  lykvakt-" +
      version +
      "-edge.zip\n",
  );
  await expect(verifyReleaseAssets(root, version, commit)).rejects.toThrow(
    "shortcut target",
  );
});
