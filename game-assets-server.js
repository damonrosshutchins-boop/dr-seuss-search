'use strict';
// First-party game assets only. This is not Wisp, HTTP CONNECT, or a URL proxy.
// Only the repository-owned, explicitly enumerated binary resources below can be read.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 10000);
const ROOT = __dirname;
const ORIGINS = new Set([
  'https://damonrosshutchins-boop.github.io',
  'https://seuss-scramjet-private.onrender.com'
]);
const FILES = Object.freeze({
  'v86.wasm': 'vm/v86.wasm',
  'wdosbox.wasm': 'vm/jsdos/emulators/wdosbox.wasm',
  'webrtcnet.wasm': 'vm/jsdos/emulators/webrtcnet.wasm',
  'wlibzip.wasm': 'vm/jsdos/emulators/wlibzip.wasm'
});
function reply(req,res,status,headers={},body='') {
  res.writeHead(status,{ 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'Cross-Origin-Resource-Policy':'cross-origin', ...headers });
  if(req.method==='HEAD')res.end();else res.end(body);
}
http.createServer((req,res)=>{
  const origin=req.headers.origin || '';
  const cors=ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin':origin,'Vary':'Origin' } : {};
  // Reject disallowed browser origins. Non-browser requests can only access these fixed assets.
  if(origin && !ORIGINS.has(origin))return reply(req,res,403,{},'Origin not allowed');
  if(req.method==='OPTIONS'){
    if(!ORIGINS.has(origin))return reply(req,res,403,{},'Origin not allowed');
    return reply(req,res,204,{...cors,'Access-Control-Allow-Methods':'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'});
  }
  if(req.method!=='GET' && req.method!=='HEAD')return reply(req,res,405,{'Allow':'GET, HEAD, OPTIONS'},'Method not allowed');
  // Deliberately no user-provided URLs, redirects, paths, sockets or forwarding.
  let pathname;
  try { pathname=new URL(req.url,'http://localhost').pathname; }
  catch { return reply(req,res,400,{},'Bad request'); }
  if(pathname==='/health')return reply(req,res,200,{'Content-Type':'application/json','Cache-Control':'no-store'},
    JSON.stringify({ok:true,service:'seuss-game-assets',proxy:false}));
  if(pathname==='/manifest.json')return reply(req,res,200,{...cors,'Content-Type':'application/json','Cache-Control':'public, max-age=300'},
    JSON.stringify({version:1,assets:Object.keys(FILES).map(name=>'/assets/'+name)}));
  if(!pathname.startsWith('/assets/'))return reply(req,res,404,{},'Not found');
  const name=pathname.slice('/assets/'.length);
  if(!Object.hasOwn(FILES,name))return reply(req,res,404,{},'Not found');
  const filename=path.join(ROOT,FILES[name]);
  fs.stat(filename,(err,stat)=>{
    if(err||!stat.isFile())return reply(req,res,404,{},'Asset unavailable');
    const cache={'Content-Type':'application/wasm','Content-Length':String(stat.size),
      'Cache-Control':'public, max-age=3600','Accept-Ranges':'none',...cors};
    res.writeHead(200,{'X-Content-Type-Options':'nosniff',
      'Cross-Origin-Resource-Policy':'cross-origin',...cache});
    if(req.method==='HEAD')return res.end();
    const stream=fs.createReadStream(filename);
    stream.on('error',()=>res.destroy());
    stream.pipe(res);
  });
}).listen(PORT,'0.0.0.0',()=>console.log('Restricted game asset hosting listening on '+PORT));
