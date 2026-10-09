import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {EventEmitter} from 'node:events';
import {createDashboardServer,createLatestSnapshotSender} from '../src/dashboard/server.mjs';

async function serve(t,options={}) {
  const server=createDashboardServer({snapshot:()=>({schema_version:'jev-dashboard/v1',generated_at:new Date().toISOString(),runs:[],warnings:[]}),updateIntervalMs:20,heartbeatIntervalMs:25,...options});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return {server,port:server.address().port};
}
function get(port,path='/api/snapshot',headers={},method='GET') {
  return new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port,path,headers,method},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});
    req.on('error',reject);req.end();
  });
}
async function stream(t,port,headers={}) {
  let req;
  const response=await new Promise((resolve,reject)=>{
    req=request({hostname:'127.0.0.1',port,path:'/api/events',headers},resolve);req.on('error',reject);req.end();
  });
  const events=[],waiters=[];let buffer='';
  response.setEncoding('utf8');
  response.on('data',chunk=>{
    buffer+=chunk;let split;
    while((split=buffer.indexOf('\n\n'))>=0){
      const block=buffer.slice(0,split);buffer=buffer.slice(split+2);
      const fields=Object.fromEntries(block.split('\n').filter(line=>line.includes(':')).map(line=>{const i=line.indexOf(':');return [line.slice(0,i),line.slice(i+1).trimStart()];}));
      if(!fields.event)continue;
      const event={event:fields.event,id:fields.id,data:JSON.parse(fields.data)};events.push(event);
      for(const waiter of [...waiters])if(waiter.predicate(event)){waiters.splice(waiters.indexOf(waiter),1);clearTimeout(waiter.timer);waiter.resolve(event);}
    }
  });
  t.after(()=>{req.destroy();response.destroy();for(const waiter of waiters){clearTimeout(waiter.timer);waiter.reject(new Error('stream closed'));}});
  return {response,events,close:()=>{req.destroy();response.destroy();},next(predicate,timeout=2000){
    const existing=events.find(predicate);if(existing)return Promise.resolve(existing);
    return new Promise((resolve,reject)=>{const waiter={predicate,resolve,reject};waiter.timer=setTimeout(()=>{waiters.splice(waiters.indexOf(waiter),1);reject(new Error('event wait timeout'));},timeout);waiters.push(waiter);});
  }};
}

test('SSE exposes complete snapshots with epoch/revision and heartbeat without fabricating run health',async t=>{
  const {port}=await serve(t,{snapshot:()=>({schema_version:'jev-dashboard/v1',generated_at:new Date().toISOString(),runs:[{id:'synthetic-failed',kind:'synthetic',status:'failed'}],warnings:[]})});
  const client=await stream(t,port);
  assert.equal(client.response.statusCode,200);assert.match(client.response.headers['content-type'],/text\/event-stream/);
  assert.equal(client.response.headers['x-accel-buffering'],'no');assert.equal(client.response.headers['cache-control'],'no-store');
  const first=await client.next(event=>event.event==='snapshot');
  assert.match(first.id,/^[a-f0-9-]{36}:1$/);assert.equal(first.data.transport.revision,1);assert.equal(first.data.runs[0].status,'failed');
  const heartbeat=await client.next(event=>event.event==='heartbeat');assert.equal(heartbeat.data.collector_status,'ok');
  assert.equal(heartbeat.id,undefined);assert.equal(heartbeat.data.revision,1);
  assert.equal(client.events.filter(event=>event.event==='snapshot').length,1,'generated_at alone does not republish or advance revision');
});

test('SSE sends a changed whole state and GET returns the same revision, never delta usage',async t=>{
  let calls=1;
  const {port}=await serve(t,{snapshot:()=>({schema_version:'jev-dashboard/v1',generated_at:new Date().toISOString(),runs:[{id:'run',calls}],warnings:[]})});
  const client=await stream(t,port);const first=await client.next(event=>event.event==='snapshot');
  calls=2;
  const next=await client.next(event=>event.event==='snapshot'&&event.data.transport.revision>first.data.transport.revision);
  assert.equal(next.data.runs[0].calls,2);assert.equal(next.data.runs.length,1);
  const polled=JSON.parse((await get(port)).body);assert.deepEqual(polled.transport,next.data.transport);assert.equal(polled.runs[0].calls,2);
});

test('old cursor receives an explicit latest-only reset, matching cursor still receives a full snapshot',async t=>{
  let change=0;const {port}=await serve(t,{snapshot:()=>({schema_version:'jev-dashboard/v1',runs:[{change}],warnings:[]})});
  const initial=JSON.parse((await get(port)).body);change++;
  const updated=JSON.parse((await get(port)).body);
  const old=await stream(t,port,{'Last-Event-ID':`${initial.transport.epoch}:${initial.transport.revision}`});
  const reset=await old.next(event=>event.event==='reset');assert.equal(reset.data.replay,'latest_snapshot_only');
  const full=await old.next(event=>event.event==='snapshot');assert.equal(full.data.runs[0].change,1);old.close();
  const matching=await stream(t,port,{'Last-Event-ID':`${updated.transport.epoch}:${updated.transport.revision}`});
  await matching.next(event=>event.event==='snapshot');assert.equal(matching.events.some(event=>event.event==='reset'),false);
});

test('different server epoch forces reset instead of comparing unrelated revisions',async t=>{
  const before=await serve(t),after=await serve(t);
  const previous=JSON.parse((await get(before.port)).body).transport;
  const client=await stream(t,after.port,{'Last-Event-ID':`${previous.epoch}:${previous.revision}`});
  const reset=await client.next(event=>event.event==='reset');assert.notEqual(reset.data.epoch,previous.epoch);
  const full=await client.next(event=>event.event==='snapshot');assert.equal(full.data.transport.epoch,reset.data.epoch);
});

test('collector failure is fixed-code degraded transport; recovery publishes even unchanged state',async t=>{
  let fail=false;const {port}=await serve(t,{snapshot:()=>{if(fail)throw new Error('SECRET_RAW_PATH_OR_ERROR');return {schema_version:'jev-dashboard/v1',runs:[],warnings:[]};}});
  const client=await stream(t,port);const initial=await client.next(event=>event.event==='snapshot');fail=true;
  const error=await client.next(event=>event.event==='stream_error');assert.deepEqual(error.data,{code:'DASHBOARD_READ_FAILED'});
  await client.next(event=>event.event==='heartbeat'&&event.data.collector_status==='degraded');
  const fallback=await get(port);assert.equal(fallback.status,500);assert.equal(fallback.body.includes('SECRET'),false);
  fail=false;
  const recovered=await client.next(event=>event.event==='snapshot'&&event.data.transport.revision>initial.data.transport.revision);
  assert.deepEqual(recovered.data.runs,[]);assert.equal(JSON.stringify(client.events).includes('SECRET'),false);
});

test('event route rejects unsafe cursor, foreign origin, writes; HEAD opens no subscription',async t=>{
  const {port}=await serve(t);
  assert.equal((await get(port,'/api/events',{'Last-Event-ID':'../../secret'})).status,400);
  assert.equal((await get(port,'/api/events',{Origin:'https://attacker.example'})).status,403);
  assert.equal((await get(port,'/api/events',{},'POST')).status,405);
  const head=await get(port,'/api/events',{},'HEAD');assert.equal(head.status,200);assert.equal(head.body,'');
});

test('bounded subscriber count rejects excess connections and releases a disconnected slot',async t=>{
  const {port}=await serve(t,{maxClients:1});const one=await stream(t,port);await one.next(event=>event.event==='snapshot');
  assert.equal((await get(port,'/api/events')).status,503);one.close();
  // Wait for server-side close to be observed, without assuming a socket close is synchronous.
  let two;
  for(let i=0;i<20;i++){
    await new Promise(resolve=>setTimeout(resolve,5));
    const candidate=await stream(t,port);if(candidate.response.statusCode===200){two=candidate;break;}candidate.close();
  }
  assert.ok(two);await two.next(event=>event.event==='snapshot');
});

class Sink extends EventEmitter {
  writes=[];destroyed=false;accept=false;
  write(value){this.writes.push(value);return this.accept;}
  destroy(){this.destroyed=true;this.emit('close');}
}
test('slow subscriber retains only latest unsent snapshot and drops heartbeat while blocked',()=>{
  const sink=new Sink();const sender=createLatestSnapshotSender(sink,{maxFrameBytes:100,stallTimeoutMs:1000});
  sender.send('snapshot-1');sender.send('snapshot-2');sender.send('snapshot-3');sender.send('heartbeat',{replace:false});
  assert.deepEqual(sink.writes,['snapshot-1']);assert.equal(sender.pendingBytes,Buffer.byteLength('snapshot-3'));
  sink.accept=true;sink.emit('drain');assert.deepEqual(sink.writes,['snapshot-1','snapshot-3']);assert.equal(sender.pendingBytes,0);
  sender.close();assert.equal(sink.listenerCount('drain'),0);assert.equal(sink.listenerCount('close'),0);
});
test('oversized frame closes instead of retaining unbounded bytes',()=>{
  const sink=new Sink();let closed=0;const sender=createLatestSnapshotSender(sink,{maxFrameBytes:8,onClose:()=>closed++});
  sender.send('012345678');sender.close();assert.equal(sink.destroyed,true);assert.equal(closed,1);assert.equal(sender.pendingBytes,0);assert.deepEqual(sink.writes,[]);
});
test('backpressure deadline closes a stalled subscriber and cleans retained state',async()=>{
  const sink=new Sink();const sender=createLatestSnapshotSender(sink,{stallTimeoutMs:15});sender.send('one');sender.send('two');
  await new Promise(resolve=>setTimeout(resolve,35));assert.equal(sender.closed,true);assert.equal(sink.destroyed,true);assert.equal(sender.pendingBytes,0);
});
test('server close terminates open event streams and collector timers',async t=>{
  const {server,port}=await serve(t);const client=await stream(t,port);await client.next(event=>event.event==='snapshot');
  await new Promise(resolve=>server.close(resolve));assert.equal(server.listening,false);
});
