import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readSnapshot} from './reader.mjs';

const staticRoot=new URL('../../dashboard/',import.meta.url);
const assets=new Map([['/',['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]]);
const eventFrame=(name,data,id)=>`${id?`id: ${id}\n`:''}event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const positive=(value)=>Number.isSafeInteger(value)&&value>0;

/** A slow subscriber retains at most one latest unsent frame; heartbeats never queue. */
export function createLatestSnapshotSender(response,{maxFrameBytes=4*1024*1024,stallTimeoutMs=30000,onClose=()=>{}}={}) {
  if(!positive(maxFrameBytes)||!positive(stallTimeoutMs))throw new Error('INVALID_STREAM_LIMIT');
  let blocked=false,pending=null,timer=null,closed=false;
  const finish=()=>{
    if(closed)return;closed=true;pending=null;clearTimeout(timer);
    response.off('drain',drain);response.off('close',finish);onClose();
  };
  const close=()=>{finish();response.destroy();};
  const write=frame=>{
    if(closed)return;
    try {
      if(!response.write(frame)) {
        blocked=true;
        clearTimeout(timer);timer=setTimeout(close,stallTimeoutMs);timer.unref?.();
      }
    } catch {close();}
  };
  const drain=()=>{
    if(closed)return;
    blocked=false;clearTimeout(timer);timer=null;
    const latest=pending;pending=null;if(latest!==null)write(latest);
  };
  response.on('drain',drain);response.on('close',finish);
  return {
    send(frame,{replace=true}={}) {
      if(closed)return;
      if(typeof frame!=='string'||Buffer.byteLength(frame)>maxFrameBytes){close();return;}
      if(blocked){if(replace)pending=frame;return;}
      write(frame);
    },
    close,
    get pendingBytes(){return pending===null?0:Buffer.byteLength(pending);},
    get closed(){return closed;}
  };
}

export function createDashboardServer({roots,snapshot=()=>readSnapshot(roots),updateIntervalMs=1000,heartbeatIntervalMs=15000,
  stallTimeoutMs=30000,maxFrameBytes=4*1024*1024,maxClients=16}={}) {
  if(![updateIntervalMs,heartbeatIntervalMs,stallTimeoutMs,maxFrameBytes,maxClients].every(positive))throw new Error('INVALID_STREAM_CONFIG');
  const epoch=randomUUID();
  let revision=0,latest=null,fingerprint=null,collectorHealthy=true,updateTimer=null,heartbeatTimer=null;
  const subscribers=new Set();
  const latestId=()=>`${epoch}:${revision}`;
  const stopTimers=()=>{clearInterval(updateTimer);clearInterval(heartbeatTimer);updateTimer=null;heartbeatTimer=null;};
  const publish=(frame,options)=>{for(const subscriber of subscribers)subscriber.send(frame,options);};
  const collect=()=>{
    const raw=snapshot();
    if(raw?.schema_version!=='jev-dashboard/v1'||!Array.isArray(raw.runs))throw new Error('INVALID_SNAPSHOT');
    const nextFingerprint=JSON.stringify({...raw,generated_at:undefined,transport:undefined});
    const changed=fingerprint!==nextFingerprint||!collectorHealthy;
    if(changed){if(revision>=Number.MAX_SAFE_INTEGER)throw new Error('REVISION_LIMIT');revision++;}
    const candidate={...raw,transport:{epoch,revision}};
    const frame=eventFrame('snapshot',candidate,`${epoch}:${revision}`);
    if(Buffer.byteLength(frame)>maxFrameBytes)throw new Error('SNAPSHOT_TOO_LARGE');
    latest=candidate;fingerprint=nextFingerprint;collectorHealthy=true;
    if(changed)publish(frame);
    return latest;
  };
  const collectionFailure=()=>{
    if(collectorHealthy)publish(eventFrame('stream_error',{code:'DASHBOARD_READ_FAILED'}));
    collectorHealthy=false;
  };
  const startTimers=()=>{
    if(updateTimer)return;
    updateTimer=setInterval(()=>{try{collect();}catch{collectionFailure();}},updateIntervalMs);updateTimer.unref?.();
    heartbeatTimer=setInterval(()=>publish(eventFrame('heartbeat',{
      server_observed_at:new Date().toISOString(),collector_status:collectorHealthy?'ok':'degraded',epoch,revision
    }),{replace:false}),heartbeatIntervalMs);heartbeatTimer.unref?.();
  };
  const server=createServer((req,res)=>{
    const port=server.address()?.port;
    const allowedHosts=[`127.0.0.1:${port}`,`localhost:${port}`];
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if(!allowedHosts.includes(req.headers.host)||(req.headers.origin&&!allowedHosts.map(host=>`http://${host}`).includes(req.headers.origin))) {
      res.writeHead(403);res.end('Forbidden');return;
    }
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
    const path=req.url?.split('?')[0];
    try {
      if(path==='/api/events') {
        const cursor=req.headers['last-event-id'];
        if(cursor!==undefined&&(typeof cursor!=='string'||cursor.length>96||!(/^[a-f0-9-]{36}:[1-9][0-9]{0,15}$/).test(cursor))) {
          res.writeHead(400,{'Content-Type':'application/json'});res.end('{"error":"INVALID_EVENT_CURSOR"}');return;
        }
        if(req.method==='HEAD'){res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8'});res.end();return;}
        if(subscribers.size>=maxClients){res.writeHead(503,{'Content-Type':'application/json','Retry-After':'3'});res.end('{"error":"DASHBOARD_CLIENT_LIMIT"}');return;}
        collect();
        res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','X-Accel-Buffering':'no'});res.flushHeaders();
        const sender=createLatestSnapshotSender(res,{maxFrameBytes,stallTimeoutMs,onClose:()=>{
          subscribers.delete(sender);if(!subscribers.size)stopTimers();
        }});
        subscribers.add(sender);
        const reset=cursor&&cursor!==latestId()?eventFrame('reset',{reason:'cursor_unavailable',epoch,revision,replay:'latest_snapshot_only'}):'';
        sender.send(`retry: 3000\n\n${reset}${eventFrame('snapshot',latest,latestId())}`);
        if(subscribers.size)startTimers();return;
      }
      let body;
      if(path==='/api/snapshot'){res.setHeader('Content-Type','application/json; charset=utf-8');body=JSON.stringify(collect());}
      else if(assets.has(path)) {const [name,type]=assets.get(path);res.setHeader('Content-Type',type);body=readFileSync(fileURLToPath(new URL(name,staticRoot)));}
      else {res.writeHead(404);res.end('Not found');return;}
      res.writeHead(200);res.end(req.method==='HEAD'?undefined:body);
    } catch {
      if(path==='/api/snapshot'||path==='/api/events')collectionFailure();
      if(res.headersSent){res.destroy();return;}
      res.writeHead(500,{'Content-Type':'application/json'});res.end('{"error":"DASHBOARD_READ_FAILED"}');
    }
  });
  const close=server.close.bind(server);
  server.close=(...args)=>{stopTimers();for(const subscriber of [...subscribers])subscriber.close();return close(...args);};
  server.on('close',stopTimers);
  return server;
}
