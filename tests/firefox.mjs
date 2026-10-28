import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, mkdtemp, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const axe = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
await mkdir("artifacts/screenshots", { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "lykvakt-firefox-"));
const downloads = resolve("artifacts/firefox-downloads");
await mkdir(downloads, { recursive: true });
const manifest = JSON.parse(
  await readFile("dist-firefox/manifest.json", "utf8"),
);
const id = manifest.browser_specific_settings.gecko.id;
const widget =
  id.toLowerCase().replace(/[^a-z0-9_-]/g, "_") + "-browser-action";
const executable = process.env.GECKODRIVER_PATH || "geckodriver";
const server = spawn(
  executable,
  ["--host", "127.0.0.1", "--port", "0", "--allow-system-access"],
  { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
let log = "";
const started = new Promise((resolve, reject) => {
  const timer = setTimeout(
    () => reject(new Error("Geckodriver startup timeout: " + log)),
    30_000,
  );
  server.once("error", (e) => {
    clearTimeout(timer);
    reject(e);
  });
  server.once("exit", (code) => {
    clearTimeout(timer);
    reject(new Error("Geckodriver exited " + code + ": " + log));
  });
  const read = (chunk) => {
    log = (log + chunk.toString()).slice(-48_000);
    const match = log.match(/Listening on 127\.0\.0\.1:(\d+)/);
    if (match) {
      clearTimeout(timer);
      resolve("http://127.0.0.1:" + match[1]);
    }
  };
  server.stdout.on("data", read);
  server.stderr.on("data", read);
});
let endpoint,
  session,
  root,
  popup = false,
  capabilities,
  checks = 0;
async function request(path, body, method = "POST") {
  const response = await fetch(endpoint + path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(90_000),
  });
  const result = await response.json();
  if (!response.ok || result.value?.error)
    throw new Error(path + ": " + JSON.stringify(result.value));
  return result.value;
}
const command = (path, body = {}, method) =>
  request("/session/" + session + path, body, method);
async function system(script, args = []) {
  return command("/execute/async", {
    script:
      "const done=arguments[arguments.length-1];Promise.resolve().then(async()=>{" +
      script +
      "}).then(value=>done({value}),error=>done({failure:String(error)}));",
    args,
  }).then((r) => {
    if (r.failure) throw new Error(r.failure);
    return r.value;
  });
}
async function start() {
  const value = await request("/session", {
    capabilities: {
      alwaysMatch: {
        browserName: "firefox",
        "moz:firefoxOptions": {
          ...(process.env.FIREFOX_PATH
            ? { binary: process.env.FIREFOX_PATH }
            : {}),
          args: ["-profile", profile],
          prefs: {
            "browser.download.folderList": 2,
            "browser.download.dir": downloads,
            "browser.download.useDownloadDir": true,
            "browser.helperApps.neverAsk.saveToDisk":
              "application/json,text/plain",
            "browser.download.always_ask_before_handling_new_types": false,
            "browser.shell.checkDefaultBrowser": false,
            "browser.aboutwelcome.enabled": false,
          },
        },
      },
    },
  });
  session = value.sessionId;
  capabilities = value.capabilities;
  assert(Number.parseInt(capabilities.browserVersion) >= 153);
  await command("/timeouts", { script: 60_000 });
  assert.equal(
    await command("/moz/addon/install", {
      path: resolve("artifacts/lykvakt-" + manifest.version + "-firefox.zip"),
      temporary: true,
    }),
    id,
  );
  await command("/moz/context", { context: "chrome" });
  root = await system(
    "return WebExtensionPolicy.getByID(arguments[0]).getURL('');",
    [id],
  );
  assert.match(root, /^moz-extension:\/\//);
  await system(
    "const w=Services.wm.getMostRecentWindow('navigator:browser');w.gBrowser.selectedBrowser.loadURI(Services.io.newURI(arguments[0]),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});",
    [root + "index.html?window&test-bootstrap"],
  );
  popup = false;
  await wait(
    "document.querySelector('#app')?.getAttribute('aria-busy') === 'false'",
  );
  await evaluate(
    "(()=>{window.__lykvaktSenders=[];browser.runtime.onMessage.addListener((m,s)=>{if(m?.type==='lykvakt-session'&&m.action==='begin')window.__lykvaktSenders.push({id:s.id,url:s.url,origin:s.origin,documentId:s.documentId,frameId:s.frameId,hasTab:!!s.tab});return false;});})()",
  );
}
async function evaluate(expression) {
  const result = await system(
    "const w=Services.wm.getMostRecentWindow('navigator:browser');const b=" +
      (popup
        ? "w.document.querySelector('browser[webextension-view-type=popup]')"
        : "w.gBrowser.selectedBrowser") +
      ";if(!b?.browsingContext?.currentWindowGlobal)throw Error('Extension view not ready');" +
      "return b.browsingContext.currentWindowGlobal.getActor('MarionetteCommands').executeScript(arguments[0],[],{async:true,timeout:60000,newSandbox:true});",
    [
      "const done=arguments[arguments.length-1];const browser=window.browser;Promise.resolve().then(async()=>(" +
        expression +
        ")).then(value=>done(JSON.stringify({value})),error=>done(JSON.stringify({failure:String(error)})));",
    ],
  );
  const parsed = JSON.parse(result);
  if (parsed.failure) throw new Error(parsed.failure);
  return parsed.value;
}
async function wait(expression, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  let error;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expression)) return;
    } catch (e) {
      error = e;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    "Firefox condition timed out: " +
      expression +
      (error ? ": " + error.message : ""),
  );
}
async function fill(selector, value) {
  await wait(
    "Boolean(document.querySelector(" + JSON.stringify(selector) + "))",
  );
  await evaluate(
    "(()=>{const n=document.querySelector(" +
      JSON.stringify(selector) +
      ");n.value=" +
      JSON.stringify(value) +
      ";n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
}
async function click(text) {
  const find =
    "[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===" +
    JSON.stringify(text) +
    " && !b.disabled)";
  await wait("Boolean(" + find + ")");
  await evaluate("(" + find + ").click()");
}
async function check(name, action) {
  await action();
  checks++;
  console.log("PASS Firefox " + name);
}
async function openPopup() {
  await system(
    "const w=[...Services.wm.getEnumerator('navigator:browser')].find(w=>w.toolbar.visible);const CustomizableUI=w.CustomizableUI;CustomizableUI.addWidgetToArea(arguments[0],CustomizableUI.AREA_NAVBAR);w.focus();",
    [widget],
  );
  const element = await command("/element", {
    using: "css selector",
    value: "#" + widget + " .unified-extensions-item-action-button",
  });
  const elementId =
    element["element-6066-11e4-a52e-4f735466cecf"] ?? Object.values(element)[0];
  assert.equal(typeof elementId, "string");
  await command("/element/" + encodeURIComponent(elementId) + "/click");
  popup = true;
  await wait(
    "document.querySelector('#app')?.getAttribute('aria-busy') === 'false'",
  );
  const contexts = await evaluate(
    "browser.runtime.getContexts({contextTypes:['POPUP']})",
  );
  const live = contexts.find(
    (c) => c.documentUrl === root + "index.html" && c.documentId,
  );
  assert(live);
  const reply = await evaluate(
    "browser.runtime.sendMessage({type:'lykvakt-session',action:'begin'})",
  );
  assert.equal(reply.ok, true);
  assert.equal(reply.source, live.documentId);
}
async function closePopup() {
  await system(
    "const w=Services.wm.getMostRecentWindow('navigator:browser');for(const p of w.document.querySelectorAll('panel'))if(p.state==='open' && p.querySelector('browser[webextension-view-type=popup]'))p.hidePopup();",
  );
  popup = false;
}
async function screenshot(name) {
  const data = await system(
    "const w=Services.wm.getMostRecentWindow('navigator:browser');const b=" +
      (popup
        ? "w.document.querySelector('browser[webextension-view-type=popup]')"
        : "w.gBrowser.selectedBrowser") +
      ";const bitmap=await b.browsingContext.currentWindowGlobal.drawSnapshot(null,1,'white');const c=w.document.createElementNS('http://www.w3.org/1999/xhtml','canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d').drawImage(bitmap,0,0);bitmap.close();return c.toDataURL('image/png').split(',')[1];",
  );
  await writeFile(
    "artifacts/screenshots/firefox-" + name + ".png",
    Buffer.from(data, "base64"),
  );
}
async function accessibility(name) {
  // Run the same installed axe rules; no rules are disabled for Firefox.
  const result = await evaluate(
    "(()=>{" +
      String.fromCharCode(10) +
      axe +
      String.fromCharCode(10) +
      ";return window.axe.run(document);})()",
  );
  await writeFile(
    "artifacts/axe-firefox-" + name + ".json",
    JSON.stringify(result.violations, null, 2),
  );
  assert.deepEqual(result.violations, []);
}
const password = "synthetic Firefox master password";
const nextPassword = "new synthetic Firefox master password";
const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const uri =
  "otpauth://totp/Firefox:synthetic?secret=" + secret + "&issuer=Firefox";
try {
  endpoint = await started;
  await start();
  await check("manifest permissions and native popup setup", async () => {
    assert.deepEqual(
      await evaluate("browser.runtime.getManifest().permissions"),
      ["clipboardWrite", "storage", "alarms"],
    );
    await openPopup();
    await fill("input[name=password]", password);
    await fill("input[name=confirmation]", password);
    await click("Create encrypted vault");
    await wait(
      "Boolean(document.querySelector('.empty-state')) || [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='+ Add account')",
    );
    await accessibility("setup-complete");
  });
  await check("draft survives actual popup closure and reopening", async () => {
    await click("+ Add account");
    await fill("input[name=issuer]", "Firefox draft");
    await fill("input[name=secret]", secret);
    await wait(
      "(await browser.storage.session.get('unlockSession')).unlockSession?.unlock?.draft?.fields?.secret === " +
        JSON.stringify(secret),
    );
    await closePopup();
    await openPopup();
    await wait(
      "document.querySelector('input[name=issuer]')?.value === 'Firefox draft'",
    );
    assert.equal(
      await evaluate("document.querySelector('input[name=password]')"),
      null,
    );
    await click("Close");
  });
  await check("paste import, save and correct TOTP", async () => {
    await click("Backup");
    await click("Import accounts");
    await fill("textarea[name=payload]", uri);
    await click("Preview import");
    await click("Import 1 account(s)");
    await wait("document.querySelectorAll('.account').length === 1");
    assert.match(
      await evaluate("document.querySelector('.otp').textContent"),
      /[\u2022]/,
    );
    await evaluate("document.querySelector('.otp').click()");
    const now = await evaluate("Date.now()");
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
    const digest = createHmac("sha1", Buffer.from("12345678901234567890"))
      .update(counter)
      .digest();
    const offset = digest.at(-1) & 15;
    const code = String(
      (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000,
    ).padStart(6, "0");
    await wait(
      "document.querySelector('.otp').textContent.replace(/\\s/g,'') === " +
        JSON.stringify(code),
    );
    await evaluate("document.querySelector('.otp').click()");
    await evaluate("document.querySelector('.row-copy').click()");
    await wait(
      "[...document.querySelectorAll('.status')].some(n=>n.textContent.includes('Copied code for Firefox'))",
    );
    assert.match(
      await evaluate("document.querySelector('.otp').textContent"),
      /[\u2022]/,
    );
    await screenshot("popup");
    await accessibility("popup");
  });
  await check("shared Lock and wrong/right password", async () => {
    await click("Lock");
    await closePopup();
    await wait("Boolean(document.querySelector('input[name=password]'))");
    assert.equal(
      await evaluate(
        "(await browser.storage.session.get('unlockSession')).unlockSession?.unlock",
      ),
      undefined,
    );
    await openPopup();
    await fill("input[name=password]", "wrong password");
    await click("Unlock vault");
    await wait(
      "document.querySelector('.status').textContent.includes('Authentication failed')",
    );
    assert.equal(
      await evaluate("document.querySelector('input[name=password]').value"),
      "",
    );
    await fill("input[name=password]", password);
    await click("Unlock vault");
    await wait("document.querySelectorAll('.account').length === 1");
  });
  await check("file controls hand off to a dedicated window", async () => {
    await click("Backup");
    await click("Verify or restore a backup");
    await wait(
      "[...document.querySelectorAll('button')].some(b=>b.textContent==='Open in a window to choose a file')",
    );
    assert.equal(
      await evaluate("document.querySelector('input[type=file]')"),
      null,
    );
    await click("Open in a window to choose a file");
    popup = false;
    await wait(
      "[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Lock')",
    );
    await click("Backup");
    await click("Verify or restore a backup");
    await wait("Boolean(document.querySelector('input[type=file]'))");
    await click("Close");
  });
  await check(
    "reauthentication blocks export, then encrypted backup verifies",
    async () => {
      await click("Create encrypted backup");
      await fill("input[name=masterPassword]", "wrong password");
      await fill("input[name=password]", "synthetic backup password");
      await fill("input[name=confirmation]", "synthetic backup password");
      await click("Save encrypted file");
      await wait(
        "[...document.querySelectorAll('.status')].some(n=>n.textContent.includes('Authentication failed'))",
      );
      assert.equal((await readdir(downloads)).length, 0);
      await fill("input[name=masterPassword]", password);
      await fill("input[name=password]", "synthetic backup password");
      await fill("input[name=confirmation]", "synthetic backup password");
      await click("Save encrypted file");
      await wait("!document.querySelector('dialog')");
      let bytes;
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const files = (await readdir(downloads)).filter((f) =>
          f.endsWith(".json"),
        );
        if (files.length === 1) {
          bytes = await readFile(join(downloads, files[0]), "utf8");
          try {
            JSON.parse(bytes);
            break;
          } catch {}
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert(bytes, "Encrypted backup download completed");
      assert.equal(JSON.parse(bytes).kind, "backup");
      assert(!bytes.includes(secret));
      await click("Verify or restore a backup");
      await evaluate(
        "(()=>{const dt=new DataTransfer();dt.items.add(new File([" +
          JSON.stringify(bytes) +
          "],'synthetic-backup.json',{type:'application/json'}));const n=document.querySelector('input[type=file]');n.files=dt.files;n.dispatchEvent(new Event('change',{bubbles:true}));})()",
      );
      await fill("input[name=password]", "synthetic backup password");
      await click("Decrypt & test restoration");
      await wait(
        "document.querySelector('dialog').textContent.includes('Exact account snapshot match')",
      );
      await click("Done");
      await click("Authenticator");
    },
  );
  await check("deadline enforced even if an alarm was delayed", async () => {
    await evaluate(
      "(async()=>{const {unlockSession:s}=await browser.storage.session.get('unlockSession');s.unlock.touched=Date.now()-300001;s.unlock.expires=s.unlock.touched+s.unlock.timeout;s.unlock.checkedAt=s.unlock.touched;await browser.alarms.clear('vault-expiry');await browser.storage.session.set({unlockSession:s});})()",
    );
    await openPopup();
    await wait("Boolean(document.querySelector('input[name=password]'))");
    await fill("input[name=password]", password);
    await click("Unlock vault");
    await wait("document.querySelectorAll('.account').length === 1");
    await closePopup();
    await wait("document.querySelectorAll('.account').length === 1");
  });
  await check(
    "password rotation revokes reopening and keeps saved accounts",
    async () => {
      await click("Settings");
      await click("Change master password");
      await fill("input[name=current]", password);
      await fill("input[name=next]", nextPassword);
      await fill("input[name=confirm]", nextPassword);
      await click("Change password");
      await wait("!document.querySelector('dialog')");
      await openPopup();
      await fill("input[name=password]", password);
      await click("Unlock vault");
      await wait(
        "[...document.querySelectorAll('.status')].some(n=>n.textContent.includes('Authentication failed'))",
      );
      await fill("input[name=password]", nextPassword);
      await click("Unlock vault");
      await wait("document.querySelectorAll('.account').length === 1");
      await closePopup();
    },
  );
  await check(
    "no unlock material in persistent extension storage",
    async () => {
      assert.deepEqual(await evaluate("browser.storage.local.get(null)"), {});
      assert.deepEqual(await evaluate("browser.storage.sync.get(null)"), {});
    },
  );
  await command("", undefined, "DELETE");
  session = undefined;
  await start();
  await check(
    "full browser restart requires password and preserves encrypted accounts",
    async () => {
      await wait("Boolean(document.querySelector('input[name=password]'))");
      assert.equal(
        await evaluate(
          "(await browser.storage.session.get('unlockSession')).unlockSession?.unlock",
        ),
        undefined,
      );
      await fill("input[name=password]", nextPassword);
      await click("Unlock vault");
      await wait("document.querySelectorAll('.account').length === 1");
      await screenshot("window");
      await accessibility("window");
    },
  );
  await writeFile(
    "artifacts/firefox-results.json",
    JSON.stringify(
      {
        passed: true,
        checks,
        browser: capabilities.browserVersion,
        geckodriver: capabilities["moz:geckodriverVersion"],
        nativePopup: true,
        permissions: manifest.permissions,
      },
      null,
      2,
    ),
  );
  console.log(
    checks + " Firefox checks passed in " + capabilities.browserVersion,
  );
} catch (error) {
  const wasPopup = popup;
  popup = false;
  const senders = session
    ? await evaluate("window.__lykvaktSenders").catch((e) => String(e))
    : undefined;
  popup = wasPopup;
  await writeFile(
    "artifacts/firefox-failure.json",
    JSON.stringify(
      {
        error: error.stack,
        checks,
        popup,
        senders,
        browser: capabilities?.browserVersion,
        log,
        status: session
          ? await evaluate(
              "[...document.querySelectorAll('.status')].map(n=>n.textContent)",
            ).catch((e) => String(e))
          : undefined,
        views: session
          ? await system(
              "return [...Services.wm.getEnumerator('navigator:browser')].map(w=>({browsers:[...w.document.querySelectorAll('browser')].map(b=>({id:b.id,view:b.getAttribute('webextension-view-type'),url:b.currentURI?.spec})),panels:[...w.document.querySelectorAll('panel')].filter(p=>p.state==='open').map(p=>p.id)}));",
            ).catch((e) => String(e))
          : undefined,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  if (session) await command("", undefined, "DELETE").catch(() => {});
  server.kill();
}
