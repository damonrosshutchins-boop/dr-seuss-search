'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = __dirname;
const PORT = Number(process.env.PORT || 10000);
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
function headers(res,status,extra={}) {
  res.writeHead(status,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',...extra});
}
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  // Old PIN-login bookmarks now lead back to the unprotected homepage.
  if(pathname==='/login' && (req.method==='GET'||req.method==='HEAD')){
    headers(res,302,{'Location':'/'});res.end();return;
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
server.listen(PORT,'0.0.0.0',()=>console.log('Render Scramjet hosting listening on '+PORT));
