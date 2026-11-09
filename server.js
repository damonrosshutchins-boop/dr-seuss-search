'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = __dirname;
const PORT = Number(process.env.PORT || 10000);
const types = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8',
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
  'Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN',...extra});
}
// An additional code check for the EXISTING admin-only relay preference.
// This endpoint does not host a Wisp tunnel or make arbitrary destinations accessible.
const ADMIN_RELAY_CODE = process.env.RENDER_ADMIN_RELAY_CODE || '';
const ADMIN_ORIGINS = new Set([
  'https://damonrosshutchins-boop.github.io',
  'https://seuss-scramjet-private.onrender.com'
]);
const SUPABASE_URL = 'https://cihzaevtdoquseoxxdqf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TKOD-qL58VJU9c4R952W_w_Tw7qbqgL';
const failedAdminChecks = new Map();
function equalsCode(candidate, expected) {
  const a = crypto.createHash('sha256').update(candidate).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
async function verifiedAdmin(token) {
  if (typeof token !== 'string' || token.length > 4000 || token.length < 20) return false;
  const headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token };
  try {
    // Verify the JWT identity, then verify the *current* site admin membership.
    const who = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers, signal: AbortSignal.timeout(7000)
    });
    if (!who.ok) return false;
    const user = await who.json();
    if (!user || !user.id) return false;
    const role = await fetch(SUPABASE_URL + '/rest/v1/rpc/site_check_admin', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(7000)
    });
    return role.ok && (await role.json()) === true;
  } catch { return false; }
}
function sendAdminResponse(res, status, body, origin) {
  const extra = { 'Content-Type': 'application/json; charset=utf-8', Vary:'Origin' };
  if (ADMIN_ORIGINS.has(origin)) extra['Access-Control-Allow-Origin'] = origin;
  headers(res, status, extra);
  res.end(JSON.stringify(body));
}
function adminAccessRequest(req, res) {
  const origin = req.headers.origin || '';
  if (!ADMIN_ORIGINS.has(origin)) {
    sendAdminResponse(res,403,{ok:false,error:'Not allowed'},origin);
    return;
  }
  if (req.method === 'OPTIONS') {
    headers(res,204,{
      'Access-Control-Allow-Origin':origin,
      'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type',
      'Access-Control-Max-Age':'300',
      Vary:'Origin'
    });
    res.end();return;
  }
  if (req.method !== 'POST') {
    sendAdminResponse(res,405,{ok:false,error:'Method not allowed'},origin);
    return;
  }
  if (!ADMIN_RELAY_CODE) {
    sendAdminResponse(res,503,{ok:false,error:'Admin verification not configured'},origin);
    return;
  }
  const key = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = failedAdminChecks.get(key) || {count:0, until:0};
  if (now > entry.until) {entry.count=0;entry.until=0;}
  if (entry.count >= 6 && now < entry.until) {
    sendAdminResponse(res,429,{ok:false,error:'Too many attempts'},origin);
    return;
  }
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString('utf8');
    if (body.length > 8000) req.destroy();
  });
  req.on('end', async () => {
    let candidate = '', token = '';
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed.code === 'string' && parsed.code.length <= 256) candidate = parsed.code;
      if (typeof parsed.accessToken === 'string') token = parsed.accessToken;
    } catch {}
    const codeOk = equalsCode(candidate, ADMIN_RELAY_CODE);
    const adminOk = codeOk && await verifiedAdmin(token);
    if (!adminOk) {
      entry.count += 1;
      entry.until = Date.now() + 10 * 60 * 1000;
      failedAdminChecks.set(key,entry);
      if (failedAdminChecks.size > 500) failedAdminChecks.clear();
      sendAdminResponse(res,403,{ok:false,error:'Admin access could not be verified'},origin);
      return;
    }
    failedAdminChecks.delete(key);
    sendAdminResponse(res,200,{ok:true},origin);
  });
}

const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/admin/relay-access'){
    adminAccessRequest(req,res);return;
  }
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
