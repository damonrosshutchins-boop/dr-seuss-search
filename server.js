'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = __dirname;
const PORT = Number(process.env.PORT || 10000);
const PIN = process.env.ACCESS_PIN;
const SECRET = process.env.SESSION_SECRET;
const TTL = 12 * 60 * 60 * 1000;
const attempts = new Map();
if (!PIN || !SECRET || SECRET.length < 32) {
  console.error('Set ACCESS_PIN and a SESSION_SECRET of at least 32 characters in Render.');
  process.exit(1);
}
const types = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp',
  '.ico':'image/x-icon', '.wasm':'application/wasm', '.txt':'text/plain; charset=utf-8',
  '.webmanifest':'application/manifest+json', '.map':'application/json',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.otf':'font/otf',
  '.mp3':'audio/mpeg', '.ogg':'audio/ogg', '.wav':'audio/wav',
  '.mp4':'video/mp4', '.webm':'video/webm', '.bin':'application/octet-stream',
  '.data':'application/octet-stream', '.rom':'application/octet-stream',
  '.nes':'application/octet-stream', '.n64':'application/octet-stream',
  '.z64':'application/octet-stream', '.v64':'application/octet-stream',
  '.gb':'application/octet-stream', '.gbc':'application/octet-stream',
  '.gba':'application/octet-stream', '.zip':'application/zip'
};
const blocked = new Set(['server.js','package.json','package-lock.json','render.yaml','.env','.gitignore']);
function eq(a,b) {
  const x=crypto.createHash('sha256').update(a).digest();
  const y=crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x,y);
}
function mac(value) {return crypto.createHmac('sha256',SECRET).update(value).digest('hex');}
function session() {const expiry=String(Date.now()+TTL);return expiry+'.'+mac(expiry);}
function authed(req) {
  const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('seuss_session='));
  if(!raw)return false;
  const parts=raw.slice(14).split('.');
  const [expiry,sig]=parts;
  return parts.length===2 && /^\d{13}$/.test(expiry||'') && Number(expiry)>Date.now()
    && /^[a-f0-9]{64}$/.test(sig||'') && eq(sig,mac(expiry));
}
function headers(res,status,extra={}) {
  res.writeHead(status,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',...extra});
}
function redirect(res,to) {headers(res,303,{'Location':to});res.end();}
function loginPage(error=false) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Seuss Search · Private Access</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#f8fafc;font:16px system-ui,sans-serif}
main{width:min(370px,calc(100% - 48px));background:#1e293b;padding:28px;border-radius:16px;box-shadow:0 15px 45px #0006}
h1{font-size:1.5rem}p{color:#cbd5e1}input,button{box-sizing:border-box;width:100%;padding:13px;border-radius:9px;font:inherit}
input{background:#0f172a;border:1px solid #64748b;color:white}
button{margin-top:14px;background:#38bdf8;border:0;color:#082f49;font-weight:700;cursor:pointer}.error{color:#fecaca}</style>
</head><body><main><h1>Private access</h1><p>Enter your access PIN to open Scramjet.</p>
${error?'<p class="error" role="alert">Invalid PIN or too many attempts. Try again shortly.</p>':''}
<form method="POST" action="/login"><label for="pin">Access PIN</label>
<input id="pin" name="pin" type="password" autocomplete="off" required autofocus maxlength="256">
<button type="submit">Unlock</button></form></main></body></html>`;
}
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/login' && req.method==='POST') {
    const key=req.socket.remoteAddress||'unknown', now=Date.now();
    const entry=attempts.get(key)||{count:0,until:0};
    if(entry.until && now>entry.until){entry.count=0;entry.until=0;}
    let body='';
    req.on('data',chunk=>{body+=chunk.toString();if(body.length>2048)req.destroy();});
    req.on('end',()=>{
      let supplied='';try{supplied=new URLSearchParams(body).get('pin')||'';}catch{}
      if((entry.count>=6 && now<entry.until)||!eq(supplied,PIN)){
        entry.count++;entry.until=now+15*60*1000;attempts.set(key,entry);
        headers(res,entry.count>=6?429:401,{'Content-Type':'text/html; charset=utf-8'});
        res.end(loginPage(true));return;
      }
      attempts.delete(key);
      headers(res,303,{'Location':'/','Set-Cookie':
        'seuss_session='+session()+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age='+TTL/1000});
      res.end();
    });return;
  }
  if(pathname==='/logout' && req.method==='POST'){
    headers(res,303,{'Location':'/login','Set-Cookie':
      'seuss_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'});
    res.end();return;
  }
  if(!authed(req)){
    if(pathname==='/login' && req.method==='GET'){
      headers(res,200,{'Content-Type':'text/html; charset=utf-8'});res.end(loginPage());
    } else redirect(res,'/login');
    return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){headers(res,405);res.end();return;}
  let decoded;try{decoded=decodeURIComponent(pathname);}catch{headers(res,400);res.end();return;}
  if(decoded.includes('\0')||decoded.includes('\\')||
     decoded.split('/').some(part=>part==='..'||part.startsWith('.'))){
    headers(res,403);res.end();return;
  }
  // Virtual Scramjet paths must be handled by the browser service worker,
  // not by Render's static file handler.
  if(decoded.startsWith('/scramjet/')){
    headers(res,503,{'Content-Type':'text/plain; charset=utf-8'});
    res.end('Scramjet service worker did not intercept this URL. Return to the Render homepage, reload, and retry Scramjet.');
    return;
  }
  const relative=decoded==='/'?'index.html':decoded.replace(/^\/+/, '');
  if(blocked.has(relative)||relative.startsWith('.')){headers(res,403);res.end();return;}
  const filename=path.resolve(ROOT,relative);
  if(!filename.startsWith(ROOT+path.sep)){headers(res,403);res.end();return;}
  fs.stat(filename,(err,stat)=>{
    if(err||!stat.isFile()){headers(res,404);res.end('Not found');return;}
    const ext=path.extname(filename).toLowerCase();
    if(!types[ext]){headers(res,403);res.end();return;}
    // Render serves the script; the service worker runs in the browser.
    const workerHeaders = filename===path.join(ROOT,'sw.js')
      ? {'Service-Worker-Allowed':'/','Cache-Control':'no-cache, no-store, must-revalidate'}
      : {};
    headers(res,200,{'Content-Type':types[ext],...workerHeaders});
    if(req.method==='HEAD'){res.end();return;}
    fs.createReadStream(filename).pipe(res);
  });
});
server.listen(PORT,'0.0.0.0',()=>console.log('Private Scramjet hosting listening on '+PORT));
