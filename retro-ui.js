/* First-party Retro Arcade & Emulators Games category.
 * All launched files are local to this repository. No ROM setup.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const dialog=$("games-dialog"),main=$("games-main-view"),retro=$("retro-view"),green=$("green-eggs-view");
const launcher=$("open-retro"),offlineGrid=$("retro-offline-grid"),emulatorGrid=$("retro-emulator-grid");
const base=new URL("./",location.href);
const OFFLINE=[
 ["brick","🧱","Brick Breaker","retro"],["blocks","🟦","Falling Blocks","retro"],
 ["invaders","👾","Pixel Invaders","retro"],["meteors","☄️","Meteor Pilot","retro"],
 ["flap","🐦","Pixel Flier","retro"],["frog","🐸","Frog Crossing","retro"],
 ["racer","🏎️","Road Dash","retro"],["catcher","🍓","Fruit Catcher","retro"],
 ["lander","🚀","Moon Landing","retro"],["maze","🗺️","Labyrinth","retro"],
 ["dodge","💎","Neon Dodger","retro"],["missile","🛡️","Sky Shield","retro"],
 ["whack","🐭","Whack-a-Critter","retro"],["simon","🔮","Pattern Memory","retro"],
 ["mines","💣","Mine Finder","retro"],["connect","🔴","Four in a Row","retro"],
 ["ttt","❎","Noughts & Crosses","retro"],["lights","💡","Lights Out","retro"],
 ["word","🔤","Word Scramble","retro"],["reaction","⚡","Reflex Test","retro"],
 ["higher","🃏","Higher or Lower","retro"],["hanoi","🪵","Tower Stacker","retro"],
 ["snake","🐍","Snake","original"],["merge","🔢","Merge Tiles","original"],
 ["pong","🏓","Paddle Rally","original"],["memory","🃏","Memory Match","original"],
 ["slide","🧩","15 Puzzle","original"],
 ["lj65","🎮","NES LJ65","nes"]
];
const EMULATORS=[
 ["digger","🟠","Digger","DOSBox · bundled game"],
 ["tyrian","🚀","Tyrian 2000","DOSBox · freeware"],
 ["doom","🎮","DOOM (Shareware)","DOSBox · shareware episode"],
 ["heretic","✨","Heretic (Shareware)","DOSBox · shareware episode"],
 ["quake","🧱","Quake (Shareware)","DOSBox · shareware episode"]
];
function card(icon,name,detail,action){
 const b=document.createElement("button");b.type="button";b.className="retro-game";
 const picture=document.createElement("span");picture.className="retro-emoji";picture.textContent=icon;
 const info=document.createElement("span");info.className="retro-info";
 const strong=document.createElement("strong");strong.textContent=name;
 const small=document.createElement("small");small.textContent=detail;
 info.append(strong,small);b.append(picture,info);b.addEventListener("click",action);
 return b;
}
function openPage(file,id,title){
 if(typeof window.openDirectSiteTab!=="function")return;
 dialog.close();
 window.openDirectSiteTab(new URL(file+"#"+encodeURIComponent(id),base).href,title);
}
function listOffline(){
 const q=$("retro-search").value.trim().toLowerCase();
 offlineGrid.replaceChildren();let shown=0;
 for(const [id,icon,title,type] of OFFLINE){
  if(!title.toLowerCase().includes(q))continue;
  shown++;const file=type==="retro"?"retro-arcade.html":type==="nes"?"nes-homebrew.html":"offline-arcade.html";
  offlineGrid.append(card(icon,title,"No Wi-Fi · no ROM",
    ()=>openPage(file,id,title)));
 }
 $("retro-count").textContent=shown+" of "+OFFLINE.length+" offline games";
 $("retro-empty").hidden=shown!==0;
}
function setCategory(kind){
 const emu=kind==="emulators",consoleMode=kind==="consoles";
 $("retro-offline-section").hidden=kind!=="offline";
 $("retro-emulator-section").hidden=!emu;
 $("retro-console-section").hidden=!consoleMode;
 document.querySelectorAll("[data-retro-category]").forEach(b=>
  b.setAttribute("aria-pressed",String(b.dataset.retroCategory===kind)));
}
function showRetro(){
 main.hidden=true;green.hidden=true;retro.hidden=false;
 dialog.classList.add("retro-open");launcher.setAttribute("aria-expanded","true");
 $("retro-search").value="";listOffline();setCategory("offline");
}
function hideRetro(restoreFocus=true){
 retro.hidden=true;main.hidden=false;dialog.classList.remove("retro-open");
 launcher.setAttribute("aria-expanded","false");
 if(restoreFocus&&dialog.open)launcher.focus();
}
launcher.addEventListener("click",showRetro);
$("retro-back").addEventListener("click",()=>hideRetro());
$("retro-search").addEventListener("input",listOffline);
document.querySelectorAll("[data-retro-category]").forEach(b=>
 b.addEventListener("click",()=>setCategory(b.dataset.retroCategory)));
for(const [id,icon,name,detail] of EMULATORS){
 emulatorGrid.append(card(icon,name,detail,()=>openPage("dos-arcade.html",id,name)));
}
for(const [name,icon,description] of [
 ["FreeDOS","💻","v86 · preloaded DOS with built-in games"],
 ["KolibriOS","🖥️","v86 · preloaded desktop with applications"]
]){
 emulatorGrid.append(card(icon,name,description,()=>{
 const vm=window.DSSVM;
 const system=vm?.SYSTEMS?.find(s=>s.name===name);
 if(!system){
  $("retro-cache-status").textContent=name+" emulator is not ready yet.";
  return;
 }
 dialog.close();
 window.openVMTab?.();
 void vm.bootV86({name:system.name,opts:system.opts,mem:Math.max(64,system.mem)});
 }));
}

/* Built-in homebrew launchers: no user-supplied ROM / BIOS requested. */
const consoleGrid=$("retro-console-grid");
const CONSOLES=[["🧩","LJ65","NES · Fully offline","nes-homebrew.html","nes"],["🔢","2048 for NES","NES · Free homebrew · browser emulator","console-emulators.html?game=2048","nes"],["🐿️","Nova the Squirrel","NES · Free homebrew · browser emulator","console-emulators.html?game=nova","nes"],["👥","Alter Ego","NES · Free homebrew · browser emulator","console-emulators.html?game=alterego","nes"],["🐦","Spacegulls","NES · Free homebrew · browser emulator","console-emulators.html?game=spacegulls","nes"],["🗺️","Retropia","NES · Creator-hosted browser game","console-emulators.html?game=retropia","nes"],["⭐","Stallar","NES · Creator-hosted browser game","console-emulators.html?game=stallar","nes"],["🧱","MIROH","NES · Creator-hosted browser game","console-emulators.html?game=miroh","nes"],["💠","Doppel Effect","NES · Creator-hosted browser game","console-emulators.html?game=doppel","nes"],["🖼️","Anomalisa","NES · Creator-hosted browser game","console-emulators.html?game=anomalisa","nes"],["🐌","SnailNES","NES · Creator-hosted browser game","console-emulators.html?game=snail","nes"],["🐍","Slide-o-Snake","NES · Creator-hosted browser game","console-emulators.html?game=slide","nes"],["🎨","DWAMBO","NES · Creator-hosted browser game","console-emulators.html?game=dwambo","nes"],["🎃","Jack and the Candy Corn","NES · Creator-hosted browser game","console-emulators.html?game=jack","nes"],["🍔","8-Bit Diner","NES · Creator-hosted browser game","console-emulators.html?game=diner","nes"],["➕","Muncher Runner","NES · Creator-hosted browser game","console-emulators.html?game=muncher","nes"],["⚪","Droll Ball","NES · Creator-hosted browser game","console-emulators.html?game=droll","nes"],["🐧","Penguin: Sokoban Adventure","NES · Creator-hosted browser game","console-emulators.html?game=penguin","nes"],["🥁","Kumi-Daiko Beatoff 64","N64 · Free homebrew · browser emulator","console-emulators.html?game=kumi","n64"],["🎉","N64brew Game Jam 2024: 20 Minigames","N64 · Free homebrew · browser emulator","console-emulators.html?game=jam","n64"],["💿","PSoXide Homebrew Demo Disc","PS1 · Creator-hosted browser game","console-emulators.html?game=psoxide","ps1"],["🧪","PS1 Open-Source Test","PS1 · Free homebrew · browser emulator","console-emulators.html?game=psxtest","ps1"],["🎵","64Beats","N64 · Select in cartridge menu · experimental","console-emulators.html?game=jam-64beats","n64"],["🪙","Coin Rush","N64 · Select in cartridge menu · experimental","console-emulators.html?game=jam-coin-rush","n64"],["🐾","FurBall","N64 · Select in cartridge menu · experimental","console-emulators.html?game=jam-furball","n64"],["⬡","Halcyon Hexagons","N64 · Select in cartridge menu · experimental","console-emulators.html?game=jam-halcyon-hexagons","n64"],["🔥","Hot Hot Hexagons","N64 · Select in cartridge menu · experimental","console-emulators.html?game=jam-hot-hot-hexagons","n64"],["🕳️","Holes","N64 · Select in cartridge menu · experimental","console-emulators.html?game=jam-holes","n64"],["🎶","Hydra Harmonics","N64 · Select in cartridge menu · experimental","console-emulators.html?game=jam-hydra-harmonics","n64"],["🧩","Land Grab","N64 · Select in cartridge menu · experimental","console-emulators.html?game=jam-land-grab","n64"],["🔑","Le Tohu-Bohu","N64 · Select in cartridge menu · experimental","console-emulators.html?game=jam-le-tohu-bohu","n64"],["🦆","Mallard","N64 · Select in cartridge menu · experimental","console-emulators.html?game=jam-mallard","n64"],["⛄","May the Best Snowman Win","N64 · Select in cartridge menu · experimental","console-emulators.html?game=jam-may-the-best-snowman-win","n64"],["🧖","Sauna Rush","N64 · Select in cartridge menu · experimental","console-emulators.html?game=jam-sauna-rush","n64"],["🐍","Sneks","N64 · Select in cartridge menu · experimental","console-emulators.html?game=jam-sneks","n64"],["🖐️","The Third Arm","N64 · Select in cartridge menu · experimental","console-emulators.html?game=jam-the-third-arm","n64"],["💎","Underground Grind","N64 · Select in cartridge menu · experimental","console-emulators.html?game=jam-underground-grind","n64"],["🚗","NitroXide","PS1 · Select in disc menu · online","console-emulators.html?game=disc-nitroxide","ps1"],["⛏️","VoXide","PS1 · Select in disc menu · online","console-emulators.html?game=disc-voxide","ps1"],["🏔️","Celeste Classic","PS1 · Select in disc menu · online","console-emulators.html?game=disc-celeste-classic","ps1"],["🧗","Celeste Classic 2","PS1 · Select in disc menu · online","console-emulators.html?game=disc-celeste-classic-2","ps1"],["🧱","PSoXide Breakout","PS1 · Select in disc menu · online","console-emulators.html?game=disc-psoxide-breakout","ps1"],["🏓","PSoXide Pong","PS1 · Select in disc menu · online","console-emulators.html?game=disc-psoxide-pong","ps1"],["👾","PSoXide Space Invaders","PS1 · Select in disc menu · online","console-emulators.html?game=disc-psoxide-space-invaders","ps1"],["🎵","GH-PSX","PS1 · Select in disc menu · online","console-emulators.html?game=disc-gh-psx","ps1"]];
const consoleSearch=$("retro-console-search"),consoleCount=$("retro-console-count");
function displayConsoleCards(){
 const q=(consoleSearch?.value||"").trim().toLowerCase();
 consoleGrid.replaceChildren();let shown=0;
 for(const [icon,name,detail,file,system] of CONSOLES){
  if(![name,detail,system].join(" ").toLowerCase().includes(q))continue;
  shown++;
  consoleGrid.append(card(icon,name,detail,()=>{
   if(typeof window.openDirectSiteTab!=="function")return;
   dialog.close();
   window.openDirectSiteTab(new URL(file,base).href,name);
  }));
 }
 if(consoleCount)consoleCount.textContent=shown+" of "+CONSOLES.length+" console game entries";
}
consoleSearch?.addEventListener("input",displayConsoleCards);
displayConsoleCards();
$("retro-cache-console").addEventListener("click",async()=>{
 const button=$("retro-cache-console"),status=$("retro-cache-console-status");
 button.disabled=true;
 status.textContent="Checking browser support and starting console cache…";
 try {
  if(!("serviceWorker" in navigator)||location.protocol!=="https:")
   throw new Error("This requires a browser supporting HTTPS service workers.");
  const url=new URL("sw.js?v=greeneggs-v86-n64-ddg-repair-20261107",base);
  const reg=await navigator.serviceWorker.register(url.href,{scope:base.pathname,updateViaCache:"none"});
  await navigator.serviceWorker.ready;
  const worker=await new Promise((resolve,reject)=>{
   const begin=Date.now(),poll=setInterval(()=>{
    const active=reg.active;
    if(active?.state==="activated"&&active.scriptURL===url.href){clearInterval(poll);resolve(active)}
    else if(Date.now()-begin>20000){clearInterval(poll);reject(new Error("Offline worker not activated. Refresh the page."))}
   },120);
  });
  const reply=await new Promise((resolve,reject)=>{
   const chan=new MessageChannel();
   const timeout=setTimeout(()=>{chan.port1.close();reject(new Error("Console download timed out."))},180000);
   chan.port1.onmessage=e=>{
    const m=e.data||{};
    if(m.type==="progress"){status.textContent="Downloaded "+m.done+"/"+m.total+" console files · "+m.failures+" unavailable";return}
    if(m.type==="done"){clearTimeout(timeout);chan.port1.close();resolve(m)}
   };
   worker.postMessage({type:"dss-install-console-homebrew"},[chan.port2]);
  });
  if(!reply.ok){
   const why=(reply.failures||[]).slice(0,3).map(f=>f.file+" ("+f.message+")").join("; ");
   throw new Error(reply.error||"Some assets could not be saved: "+why);
  }
  status.textContent="Console assets cached. NES 2048, Nova, Alter Ego, Spacegulls, and N64 Kumi-Daiko may now work offline in this browser. PS1 test support is experimental. Hosted PSoXide still needs Wi-Fi.";
 }catch(error){
  status.textContent="Console offline preparation incomplete: "+(error?.message||error);
 }finally{button.disabled=false}
});

dialog.addEventListener("close",()=>hideRetro(false));
listOffline();

const cacheButton=$("retro-cache-dos"),cacheStatus=$("retro-cache-status");
cacheButton.addEventListener("click",async()=>{
 cacheButton.disabled=true;
 cacheStatus.textContent="Preparing DOSBox emulator assets…";
 try{
  if(!("serviceWorker" in navigator)||location.protocol!=="https:")
   throw new Error("HTTPS and service-worker support are required.");
  const workerUrl=new URL("sw.js?v=greeneggs-v86-n64-ddg-repair-20261107",base);
  const registration=await navigator.serviceWorker.register(workerUrl.href,{
   scope:base.pathname,updateViaCache:"none"
  });
  await navigator.serviceWorker.ready;
  const worker=await new Promise((resolve,reject)=>{
   const start=Date.now(),poll=setInterval(()=>{
    const active=registration.active;
    if(active?.state==="activated"&&active.scriptURL===workerUrl.href){
     clearInterval(poll);resolve(active);
    }else if(Date.now()-start>20000){
     clearInterval(poll);reject(new Error("New worker didn't activate. Reload and try again."));
    }
   },120);
  });
  const result=await new Promise((resolve,reject)=>{
   const channel=new MessageChannel();
   const timer=setTimeout(()=>{
    channel.port1.close();reject(new Error("DOS asset download timed out. Retry while online."));
   },150000);
   channel.port1.onmessage=e=>{
    const m=e.data||{};
    if(m.type==="progress"){
     cacheStatus.textContent="Saved "+m.completed+"/"+m.total+" · "+m.file;
    }else if(m.type==="done"){
     clearTimeout(timer);channel.port1.close();resolve(m);
    }
   };
   worker.postMessage({type:"dss-install-offline-dos"},[channel.port2]);
  });
  if(!result.ok){
   const failures=(result.failed||[]).slice(0,3).map(f=>f.file).join(", ");
   throw new Error(result.error||"Couldn't save "+failures);
  }
  cacheStatus.textContent="18 DOS assets saved! Five DOS titles can now load from cache without Wi-Fi. Open the DOS Arcade page directly.";
 }catch(error){
  cacheStatus.textContent="Offline DOS setup failed: "+(error?.message||error);
 }finally{cacheButton.disabled=false}
});
})();