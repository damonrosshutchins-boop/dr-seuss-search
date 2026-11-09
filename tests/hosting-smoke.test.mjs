import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
let processHandle;
let baseUrl;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

before(async () => {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  reservation.close();
  await once(reservation, "close");
  baseUrl = `http://127.0.0.1:${port}`;
  processHandle = spawn(process.execPath, [join(projectRoot, "server.js")], {
    cwd: projectRoot, env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  for (let i = 0; i < 80; i++) {
    if (processHandle.exitCode !== null) throw new Error("Web server stopped during startup");
    try {
      const response = await fetch(baseUrl + "/");
      if (response.status === 200) return;
    } catch {}
    await pause(50);
  }
  throw new Error("Render web server did not start");
});

after(() => { if (processHandle && processHandle.exitCode === null) processHandle.kill(); });

test("Render permits own-origin frames without allowing cross-origin frames", async () => {
  const res = await fetch(baseUrl + "/");
  assert.equal(res.headers.get("x-frame-options"), "SAMEORIGIN");
});

test("Render serves the application home page", async () => {
  const res = await fetch(baseUrl + "/");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Dr\.\s*Seuss Search|Scramjet/);
});

test("Render serves Scramjet's .mjs transport modules as JavaScript", async () => {
  for (const file of ["/libcurl/index.mjs", "/epoxy/index.mjs"]) {
    const res = await fetch(baseUrl + file);
    assert.equal(res.status, 200, file);
    assert.match(res.headers.get("content-type") || "", /javascript/, file);
    assert.ok((await res.arrayBuffer()).byteLength > 0, file);
  }
});

test("Render serves Scramjet's service-worker JavaScript with root scope", async () => {
  const res = await fetch(baseUrl + "/sw.js");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /javascript/);
  assert.equal(res.headers.get("service-worker-allowed"), "/");
});

test("Render serves the browser WASM asset", async () => {
  const res = await fetch(baseUrl + "/scram/scramjet.wasm.wasm");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /wasm/);
});

test("virtual Scramjet paths do not become misleading static-file 404s", async () => {
  const res = await fetch(baseUrl + "/scramjet/https%3A%2F%2Fexample.org%2F");
  assert.equal(res.status, 503);
});

test("source code and deployment configuration are not served publicly", async () => {
  for (const file of ["/server.js", "/render.yaml", "/package.json"]) {
    const res = await fetch(baseUrl + file);
    assert.equal(res.status, 403, file);
  }
});

test("Scramjet's worker activation is not blocked on optional offline downloads", async () => {
  const src = await readFile(join(projectRoot, "sw.js"), "utf8");
  const start = src.indexOf('self.addEventListener("install"');
  const end = src.indexOf('self.addEventListener("activate"', start);
  assert.ok(start >= 0 && end > start);
  const install = src.slice(start, end);
  assert.match(install, /self\.skipWaiting\(\)/);
  assert.doesNotMatch(install, /prepareOfflineGames\(\)/);
});

test("admin relay access requires approved origins and refuses anonymous callers", async () => {
  const endpoint = baseUrl + "/api/admin/relay-access";
  const disallowed = await fetch(endpoint, {
    method:"POST", headers:{"Content-Type":"application/json","Origin":"https://unapproved.example"},
    body:JSON.stringify({code:"invalid", accessToken:"invalid"})
  });
  assert.equal(disallowed.status,403);
  const preflight = await fetch(endpoint, {
    method:"OPTIONS",headers:{"Origin":"https://damonrosshutchins-boop.github.io","Access-Control-Request-Method":"POST"}
  });
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get("access-control-allow-origin"),"https://damonrosshutchins-boop.github.io");
  const anonymous = await fetch(endpoint, {
    method:"POST",headers:{"Content-Type":"application/json","Origin":"https://damonrosshutchins-boop.github.io"},
    body:JSON.stringify({code:"invalid",accessToken:"invalid"})
  });
  assert.ok([403,503].includes(anonymous.status));
  const response = await anonymous.json();
  assert.equal(response.ok,false);
});
test("admin relay code remains outside public GitHub files", async () => {
  const source = await readFile(join(projectRoot,"server.js"),"utf8");
  assert.match(source, /process\.env\.RENDER_ADMIN_RELAY_CODE/);
  assert.doesNotMatch(source,/DAMONTHEGOAT/);
  const page = await readFile(join(projectRoot,"index.html"),"utf8");
  assert.match(page,/id="s-admin-relay-code"/);
  assert.doesNotMatch(page,/DAMONTHEGOAT/);
});

test("Scramjet worker rewriter initializes when config arrives via message first", async () => {
  // Upstream v1 regression: loadConfig() returned early when the controller
  // had sent this.config before the worker's first fetch, leaving $W undefined.
  const bundle = await readFile(join(projectRoot, "scram", "scramjet.all.js"), "utf8");
  const script = await readFile(join(projectRoot, "sw.js"), "utf8");
  assert.match(bundle, /loadConfig\(\)\{if\(!this\.config\)/);
  assert.doesNotMatch(bundle, /loadConfig\(\)\{if\(this\.config\)return;/);
  assert.match(bundle, /isInternalConfigReady\(\)/);
  assert.match(script, /rewriterReady = scramjet\.isInternalConfigReady\(\)/);
});

test("worker readiness checks real route health rather than comparing script URLs", async () => {
  const app = await readFile(join(projectRoot, "app.js"), "utf8");
  const html = await readFile(join(projectRoot, "index.html"), "utf8");
  assert.match(app, /checkControllingScramjetWorker\(controller\)/);
  assert.match(app, /response\.rewriterReady === true/);
  assert.doesNotMatch(app, /controller\.scriptURL === expected/);
  assert.match(html, /id="repair-scramjet"/);
  assert.match(html, /Open the public Render-hosted Scramjet website/);
});

test("Veloci AI has a dedicated, on-demand internal workspace with direct fallback", async () => {
  const html = await readFile(join(projectRoot, "index.html"), "utf8");
  const app = await readFile(join(projectRoot, "app.js"), "utf8");
  const css = await readFile(join(projectRoot, "style.css"), "utf8");
  assert.match(html, /id="open-ai"/);
  assert.match(html, /id="ai-workspace"/);
  assert.match(html, /id="ai-frame"[^>]*loading="lazy"/);
  assert.match(html, /sandbox="allow-scripts allow-forms allow-same-origin/);
  assert.match(html, /https:\/\/veloci-search-flow\.base44\.app\//);
  assert.match(html, /id="ai-open-original"/);
  assert.match(app, /function openAITab\(\)/);
  assert.match(app, /tab\.type === "ai"/);
  assert.match(app, /if \(!frame\.getAttribute\("src"\)\) frame\.src = VELOCI_AI_URL/);
  assert.match(css, /\.ai-workspace\[hidden\]/);
});
