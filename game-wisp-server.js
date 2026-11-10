'use strict';
// Wisp (TCP-only) server with no destination allowlist.
// Kept on purpose: origin check, public-IP check (blocks localhost / Render's private
// network / cloud metadata), TCP-only, port limit, and per-client caps.
const http=require('node:http');
const dns=require('node:dns').promises;
const net=require('node:net');
const {WebSocketServer}=require('ws');
const PORT=Number(process.env.PORT||10000);
const ALLOWED_ORIGINS=new Set([
  'https://damonrosshutchins-boop.github.io',
  'https://seuss-scramjet-private.onrender.com'
]);
// Any of these paths now gives access to any public host. The old paths are kept
// so your frontend config doesn't need to change; '/wisp/' is the new generic one.
const PATHS=new Set(['/wisp/','/game-wisp/','/duckmath-wisp/','/sm64-wisp/','/approved-wisp/']);
// Destination ports clients may request. Add more here if you need them.
const ALLOWED_PORTS=new Set([80,443]);
const MAX_STREAMS=32, MAX_CLIENTS=60, MAX_PACKET=65536, WINDOW=16;
const server=http.createServer((req,res)=>{
  if(req.url==='/health' && req.method==='GET'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({ok:true,protocol:'wisp-v1',paths:[...PATHS],ports:[...ALLOWED_PORTS],tcpOnly:true}));
    return;
  }
  res.writeHead(404,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('Not found');
});
const wss=new WebSocketServer({noServer:true,maxPayload:MAX_PACKET+8,perMessageDeflate:false});
let clients=0;
function packet(type,id,payload=Buffer.alloc(0)){
  const head=Buffer.allocUnsafe(5);head.writeUInt8(type,0);head.writeUInt32LE(id,1);
  return Buffer.concat([head,payload]);
}
function write(ws,type,id,payload){
  if(ws.readyState!==ws.OPEN)return;
  if(ws.bufferedAmount>2*1024*1024){ws.close(1013,'Backpressure');return;}
  ws.send(packet(type,id,payload),{binary:true},()=>{});
}
function closeStream(ws,streams,id,reason=2){
  const stream=streams.get(id);
  if(!stream)return;
  streams.delete(id);
  stream.destroy();
  write(ws,4,id,Buffer.from([reason]));
}
function publicAddress(ip){
  if(net.isIP(ip)===4){
    const x=ip.split('.').map(Number);
    return !(x[0]===0||x[0]===10||x[0]===127||x[0]>=224||
      (x[0]===169&&x[1]===254)||(x[0]===172&&x[1]>=16&&x[1]<=31)||
      (x[0]===192&&x[1]===168)||(x[0]===100&&x[1]>=64&&x[1]<=127)||
      (x[0]===192&&x[1]===0)||(x[0]===198&&(x[1]===18||x[1]===19))||
      (x[0]===198&&x[1]===51&&x[2]===100)||(x[0]===203&&x[1]===0&&x[2]===113));
  }
  // Reject IPv6 for now: avoid IPv4-mapped / link-local / NAT64 complications.
  return false;
}
server.on('upgrade',(req,socket,head)=>{
  const origin=req.headers.origin;
  if(!PATHS.has(req.url)||!ALLOWED_ORIGINS.has(origin)||clients>=MAX_CLIENTS){
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;
  }
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
wss.on('connection',(ws,req)=>{
  clients++;
  const streams=new Map();
  const continueWindow=Buffer.alloc(4);continueWindow.writeUInt32LE(WINDOW);
  write(ws,3,0,continueWindow);
  ws.on('message',async (data,isBinary)=>{
    if(!isBinary||data.length<5||data.length>MAX_PACKET+8){ws.close(1002,'Invalid packet');return;}
    const type=data.readUInt8(0),id=data.readUInt32LE(1),body=data.subarray(5);
    if(!id){ws.close(1002,'Reserved stream');return;}
    if(type===1){
      const port=body.length>=3?body.readUInt16LE(1):0;
      const destination=body.length>3?body.subarray(3).toString('utf8'):'';
      if(streams.has(id)||streams.size>=MAX_STREAMS||body.length<4||
         body[0]!==1||!ALLOWED_PORTS.has(port)||
         destination.length===0||destination.length>253){
        write(ws,4,id,Buffer.from([0x48]));return;
      }
      try{
        // Dial the resolved numeric address, never the client's hostname. Validate
        // DNS every time to prevent private-address rebinding.
        const resolved=await dns.lookup(destination,{family:4});
        if(!publicAddress(resolved.address))throw Error('Non-public destination');
        if(ws.readyState!==ws.OPEN||streams.size>=MAX_STREAMS||streams.has(id))return;
        const peer=net.connect({host:resolved.address,port,timeout:10000});
        peer.setNoDelay(true);
        peer.pendingPackets=0;
        streams.set(id,peer);
        peer.on('data',chunk=>{
          for(let offset=0;offset<chunk.length;offset+=MAX_PACKET-5){
            write(ws,2,id,chunk.subarray(offset,offset+MAX_PACKET-5));
          }
        });
        peer.on('error',()=>closeStream(ws,streams,id,3));
        peer.on('timeout',()=>closeStream(ws,streams,id,0x47));
        peer.on('close',()=>closeStream(ws,streams,id,2));
        return;
      }catch{write(ws,4,id,Buffer.from([0x42]));return;}
    }
    const peer=streams.get(id);
    if(type===4){if(peer){streams.delete(id);peer.destroy();}return;}
    if(type!==2||!peer){write(ws,4,id,Buffer.from([0x41]));return;}
    if(body.length>MAX_PACKET-5||peer.pendingPackets>=WINDOW){
      closeStream(ws,streams,id,0x49);return;
    }
    peer.pendingPackets++;
    peer.write(body,()=>{
      if(!streams.has(id))return;
      peer.pendingPackets=Math.max(0,peer.pendingPackets-1);
      const available=Buffer.alloc(4);available.writeUInt32LE(WINDOW-peer.pendingPackets);
      write(ws,3,id,available);
    });
  });
  ws.on('close',()=>{clients--;for(const peer of streams.values())peer.destroy();streams.clear();});
  ws.on('error',()=>{ws.close();});
});
server.listen(PORT,'0.0.0.0',()=>console.log('Wisp server listening on '+PORT));
