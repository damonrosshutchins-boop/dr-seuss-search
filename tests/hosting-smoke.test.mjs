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
