import assert from "node:assert/strict";
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root=dirname(dirname(fileURLToPath(import.meta.url)));
let server=null;
let browser=null;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function freePort(){
  const s=createServer();
  s.listen(0,"127.0.0.1");
  await once(s,"listening");
  const port=s.address().port;
  const closed=once(s,"close");
  s.close();
  await closed;
  return port;
}
async function testBrowserOrigin(label,url,scope){
  const page=await browser.newPage();
  const consoleErrors=[];
  page.on("pageerror",e=>consoleErrors.push(e.message));
  try{
    const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:45000});
    assert.equal(response?.status(),200,label+" homepage did not load");
    if (label === "Render-compatible Node server") {
      const ai = await page.evaluate(() => ({
        button: !!document.querySelector("#open-ai"),
        sectionHidden: document.querySelector("#ai-workspace")?.hidden,
        frameSrc: document.querySelector("#ai-frame")?.getAttribute("src"),
        directLink: document.querySelector("#ai-open-original")?.href,
        sandbox: document.querySelector("#ai-frame")?.getAttribute("sandbox")
      }));
      assert.equal(ai.button, true, "AI workspace button missing");
      assert.equal(ai.sectionHidden, true, "AI workspace should be hidden until opened");
      assert.equal(ai.frameSrc, null, "AI app must not load before user action");
      assert.equal(ai.directLink, "https://veloci-search-flow.base44.app/");
      assert.match(ai.sandbox, /allow-scripts/);
      const lavenderCard = await page.evaluate(() =>
        Array.from(document.querySelectorAll("#web-os-grid .os-card"))
          .find(item => item.textContent.includes("LavenderOS"))?.textContent || "");
      assert.match(lavenderCard, /LavenderOS/, "LavenderOS must appear in Web Desktops");
      // Click from the DOM without depending on remote website availability.
      await page.route("https://itzzshiloh.github.io/LavenderOS-test/**", route =>
        route.fulfill({ status: 200, contentType:"text/html", body:"<html><body>LavenderOS test frame</body></html>" }));
      await page.evaluate(() => {
        const card = Array.from(document.querySelectorAll("#web-os-grid .os-card"))
          .find(item => item.textContent.includes("LavenderOS"));
        card?.click();
      });
      await page.waitForFunction(() => !!document.querySelector("#vm-web-host iframe"),{timeout:7000});
      const lavender = await page.evaluate(() => ({
        src: document.querySelector("#vm-web-host iframe")?.src,
        sandbox: document.querySelector("#vm-web-host iframe")?.getAttribute("sandbox"),
        referrer: document.querySelector("#vm-web-host iframe")?.referrerPolicy,
        fallback: document.querySelector("#vm-web-fallback a")?.href
      }));
      assert.equal(lavender.src,"https://itzzshiloh.github.io/LavenderOS-test/LavenderOS.html");
      assert.equal(lavender.fallback,lavender.src);
      assert.equal(lavender.referrer,"no-referrer");
      assert.equal(lavender.sandbox,"allow-scripts allow-same-origin allow-forms allow-popups");
      const recovery = await page.evaluate(() => ({
        reload: document.querySelector("#vm-web-reload")?.textContent,
        focus: document.querySelector("#vm-web-focus")?.textContent,
        loading: document.querySelector("#vm-web-host iframe")?.loading
      }));
      assert.match(recovery.reload, /Reload desktop/);
      assert.match(recovery.focus, /Focus desktop/);
      assert.equal(recovery.loading, "eager");
      await page.evaluate(() => document.querySelector("#vm-web-reload").click());
      await page.waitForFunction(() =>
        document.querySelector("#vm-web-host iframe")?.src ===
        "https://itzzshiloh.github.io/LavenderOS-test/LavenderOS.html");
      await page.evaluate(() => document.querySelector("#vm-web-focus").click());
    }
    const output=await page.evaluate(async ({scope})=>{
      const at=p=>new URL(p,location.origin+scope).pathname;
      const loaded=async url=>{
        await new Promise((resolve,reject)=>{
          const script=document.createElement("script");
          script.src=url;
          script.onload=resolve;
          script.onerror=()=>reject(new Error("Failed loading "+url));
          document.head.append(script);
        });
      };
      if(!window.$scramjetLoadController)
        await loaded(at("scram/scramjet.all.js"));
      const { ScramjetController }=window.$scramjetLoadController();
      const instance=new ScramjetController({
        prefix:at("scramjet/"),
        files:{
          wasm:at("scram/scramjet.wasm.wasm"),
          all:at("scram/scramjet.all.js"),
          sync:at("scram/scramjet.sync.js")
        }
      });
      await instance.init();
      const scriptUrl=at("sw.js")+"?v=browser-smoke-20261108";
      await navigator.serviceWorker.register(scriptUrl,{
        scope,updateViaCache:"none"
      });
      await navigator.serviceWorker.ready;
      const expected=new URL(scriptUrl,location.origin).href;
      const started=Date.now();
      while(Date.now()-started<18000){
        const ctrl=navigator.serviceWorker.controller;
        if(ctrl?.state==="activated" && ctrl.scriptURL===expected)break;
        await new Promise(resolve=>setTimeout(resolve,150));
      }
      const worker=navigator.serviceWorker.controller;
      if(!worker || worker.scriptURL!==expected)
        throw new Error("Correct service worker never controlled the page: "+
          (worker?.scriptURL||"none")+" expected "+expected);
      // Reproduce the bug on a new worker: a controller update message
      // assigns this.config before loadConfig() handles the route check.
      if(scope==="/") await instance.modifyConfig({});
      const reply=await new Promise((resolve,reject)=>{
        const channel=new MessageChannel();
        const timer=setTimeout(()=>reject(new Error("Worker route-check timed out")),8500);
        channel.port1.onmessage=e=>{
          clearTimeout(timer);
          channel.port1.close();
          resolve(e.data);
        };
        worker.postMessage({type:"dss-scramjet-route-check"},[channel.port2]);
      });
      return {reply,controller:worker.scriptURL,scope};
    },{scope});
    assert.equal(output.reply?.ok,true,label+" worker route check failed: "+JSON.stringify(output.reply));
    // The test worker deliberately has a different query/version than app.js.
    // A working controller must not be rejected for this harmless difference.
    if(label === "Render-compatible Node server")
      assert.equal(await page.evaluate(() => verifyProxyWorker()), true,
        label+" rejected a functional controller because its script URL differs");
    if (label === "Render-compatible Node server")
      assert.equal(output.reply.rewriterReady,true,label+" worker config was not initialized for rewrite requests");
    assert.equal(output.reply.prefix,scope+"scramjet/",label+" route prefix");
    console.log("PASS "+label+": browser worker active and Scramjet route check true",JSON.stringify(output));
    if(consoleErrors.length)
      console.log("NOTE "+label+" page errors (may include missing optional authentication service):",consoleErrors.slice(0,4));
  }finally{await page.close();}
}

try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const port=await freePort();
  server=spawn(process.execPath,[join(root,"server.js")],{
    cwd:root,env:{...process.env,PORT:String(port)},stdio:"ignore"
  });
  const local="http://127.0.0.1:"+port;
  let ready=false;
  for(let i=0;i<90;i++){
    try{const r=await fetch(local+"/");if(r.status===200){ready=true;break;}}catch{}
    await sleep(90);
  }
  assert.ok(ready,"Local Render-compatible server failed to start");
  await testBrowserOrigin("Render-compatible Node server",local+"/","/");
  await testBrowserOrigin("Deployed GitHub Pages",
    "https://damonrosshutchins-boop.github.io/dr-seuss-search/",
    "/dr-seuss-search/");
}finally{
  if(browser)await browser.close();
  if(server)server.kill();
}
