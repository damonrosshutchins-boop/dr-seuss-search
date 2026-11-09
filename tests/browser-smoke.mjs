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
