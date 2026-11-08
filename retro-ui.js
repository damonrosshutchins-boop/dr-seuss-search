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
 ["slide","🧩","15 Puzzle","original"]
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
  shown++;const file=type==="retro"?"retro-arcade.html":"offline-arcade.html";
  offlineGrid.append(card(icon,title,"No Wi-Fi · no ROM",
    ()=>openPage(file,id,title)));
 }
 $("retro-count").textContent=shown+" of "+OFFLINE.length+" offline games";
 $("retro-empty").hidden=shown!==0;
}
function setCategory(kind){
 const emu=kind==="emulators";
 $("retro-offline-section").hidden=emu;
 $("retro-emulator-section").hidden=!emu;
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
emulatorGrid.append(card("💻","FreeDOS (built-in games)","v86 · preloaded disk image",()=>{
 const vm=window.DSSVM;
 const system=vm?.SYSTEMS?.find(s=>s.name==="FreeDOS");
 if(!system){
  $("retro-cache-status").textContent="FreeDOS emulator is not ready yet.";
  return;
 }
 dialog.close();
 window.openVMTab?.();
 void vm.bootV86({name:system.name,opts:system.opts,mem:Math.max(64,system.mem)});
}));
dialog.addEventListener("close",()=>hideRetro(false));
listOffline();

const cacheButton=$("retro-cache-dos"),cacheStatus=$("retro-cache-status");
cacheButton.addEventListener("click",async()=>{
 cacheButton.disabled=true;
 cacheStatus.textContent="Preparing DOSBox emulator assets…";
 try{
  if(!("serviceWorker" in navigator)||location.protocol!=="https:")
   throw new Error("HTTPS and service-worker support are required.");
  const workerUrl=new URL("sw.js?v=greeneggs-retro-arcade-20261107",base);
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