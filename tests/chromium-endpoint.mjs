import { readFile } from "node:fs/promises";
import { join } from "node:path";
// Chrome and Edge both publish this file, even when their diagnostic log is quiet.
export function debuggingEndpoint(child, profile) {
  return new Promise((resolve, reject) => {
    let output = "",
      settled = false;
    const finish = (error, endpoint) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(poll);
      child.off("error", onError);
      child.off("exit", onExit);
      child.stderr.off("data", onData);
      if (error) reject(error);
      else resolve(endpoint);
    };
    const onError = (error) => finish(error);
    const onExit = (code) =>
      finish(new Error("Browser exited: " + code + " " + output));
    const onData = (chunk) => {
      output = (output + chunk.toString()).slice(-32_000);
      const endpoint = output.match(
        /DevTools listening on (ws:\/\/[^\r\n]+)[\r\n]/,
      )?.[1];
      if (endpoint) finish(undefined, endpoint);
    };
    const fromFile = async () => {
      try {
        const [port, path] = (
          await readFile(join(profile, "DevToolsActivePort"), "utf8")
        )
          .trim()
          .split(/\r?\n/);
        if (
          /^\d{1,5}$/.test(port) &&
          Number(port) > 0 &&
          Number(port) <= 65535 &&
          /^\/devtools\/browser\/[\w-]+$/.test(path)
        )
          finish(undefined, "ws://127.0.0.1:" + port + path);
      } catch {
        /* The file appears only after browser startup. */
      }
    };
    const timeout = setTimeout(
      () =>
        finish(
          new Error("Browser did not expose its test endpoint. " + output),
        ),
      30_000,
    );
    const poll = setInterval(() => void fromFile(), 100);
    child.once("error", onError);
    child.once("exit", onExit);
    child.stderr.on("data", onData);
    void fromFile();
  });
}
