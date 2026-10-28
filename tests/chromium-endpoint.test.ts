import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { debuggingEndpoint } from "./chromium-endpoint.mjs";
const profiles: string[] = [];
const child = () =>
  Object.assign(new EventEmitter(), { stderr: new PassThrough() });
async function profile(contents?: string) {
  const path = await mkdtemp(join(tmpdir(), "lykvakt-endpoint-"));
  profiles.push(path);
  if (contents !== undefined)
    await writeFile(join(path, "DevToolsActivePort"), contents);
  return path;
}
afterEach(async () => {
  for (const path of profiles.splice(0)) {
    if (
      dirname(resolve(path)) !== resolve(tmpdir()) ||
      !basename(path).startsWith("lykvakt-endpoint-")
    )
      throw new Error("Unexpected test cleanup path.");
    await rm(path, { recursive: true, force: true });
  }
});
it("connects through the browser's port file when stderr contains no endpoint", async () => {
  const process = child();
  expect(
    await debuggingEndpoint(
      process,
      await profile("43121\n/devtools/browser/native-id\n"),
    ),
  ).toBe("ws://127.0.0.1:43121/devtools/browser/native-id");
  expect(process.listenerCount("exit")).toBe(0);
  expect(process.stderr.listenerCount("data")).toBe(0);
});
it("keeps the existing stderr endpoint path", async () => {
  const process = child(),
    ready = debuggingEndpoint(process, await profile());
  process.stderr.write(
    "diagnostic noise\nDevTools listening on ws://127.0.0.1:43122/devtools/browser/stderr-id\n",
  );
  expect(await ready).toBe("ws://127.0.0.1:43122/devtools/browser/stderr-id");
});
it("propagates browser launch errors without extending the startup budget", async () => {
  const process = child(),
    ready = debuggingEndpoint(process, await profile());
  const rejected = expect(ready).rejects.toThrow("spawn failed");
  process.emit("error", new Error("spawn failed"));
  await rejected;
});
it("rejects a browser exit rather than accepting an invalid port record", async () => {
  const process = child(),
    ready = debuggingEndpoint(
      process,
      await profile("70000\nhttps://example.test/\n"),
    );
  const resolved = vi.fn();
  void ready.then(resolved, () => {});
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(resolved).not.toHaveBeenCalled();
  const rejected = expect(ready).rejects.toThrow("Browser exited: 1");
  process.emit("exit", 1);
  await rejected;
});
