import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';
import {readSnapshot} from '../src/dashboard/reader.mjs';
import {createDashboardServer} from '../src/dashboard/server.mjs';

function fixture(t){const root=mkdtempSync(join(tmpdir(),'jev-dashboard-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
const write=(root,name,value)=>writeFileSync(join(root,name),JSON.stringify(value));
test('reader exposes only sanitized metrics, not secret prompts or shell output',t=>{
  const root=fixture(t);const run=join(root,'run-one');mkdirSync(run);
  write(run,'manifest.json',{evidence_kind:'synthetic',workload:'smoke',mode:'jev',model:'claude-opus-5-5',auth:'cli',api_key:'SECRET_SENTINEL'});
  writeFileSync(join(run,'decisions.jsonl'),JSON.stringify({event:'input',mode:'jev',decision_id:1,input:{state:'SECRET_SENTINEL'},request:{key:'SECRET_SENTINEL'}})+'\n');
  writeFileSync(join(run,'.env'),'SECRET_SENTINEL');
  const snapshot=readSnapshot([root]);assert.equal(snapshot.runs.length,1);
  assert.equal(JSON.stringify(snapshot).includes('SECRET_SENTINEL'),false);assert.equal(snapshot.runs[0].kind,'synthetic');
});
test('symlinked run directories are not followed',t=>{
  const root=fixture(t),outside=fixture(t);write(outside,'result.json',{process_exit:0});
  symlinkSync(outside,join(root,'linked'));assert.equal(readSnapshot([root]).runs.length,0);
});
test('symlinked input files produce warnings without exposing targets',t=>{
  const root=fixture(t);write(root,'manifest.json',{evidence_kind:'synthetic',mode:'jev'});
  const secret=join(root,'private.json');writeFileSync(secret,'{"password":"SECRET_SENTINEL"}');symlinkSync(secret,join(root,'result.json'));
  const snapshot=readSnapshot([root]);assert.ok(snapshot.runs[0].warnings.length>0);assert.equal(JSON.stringify(snapshot).includes('SECRET_SENTINEL'),false);
});
test('truncated and malformed journals remain partial rather than complete zero',t=>{
  const root=fixture(t);write(root,'manifest.json',{evidence_kind:'synthetic',mode:'jev'});
  writeFileSync(join(root,'decisions.jsonl'),'{bad}\n{"event":"inference_started"');
  const run=readSnapshot([root]).runs[0];assert.ok(run.warnings.length>0);
  assert.equal(run.providers.find(p=>p.provider==='jev').tokens.input.value,null);
});
test('missing root is unavailable, not an invented clean empty run',t=>{
  const snapshot=readSnapshot([join(fixture(t),'absent')]);assert.equal(snapshot.runs.length,0);assert.deepEqual(snapshot.warnings,['run_root_unavailable']);
});
test('incomplete UTF-8 suffix retains preceding complete Claude observations',t=>{
  const root=fixture(t);write(root,'manifest.json',{evidence_kind:'synthetic',mode:'baseline'});
  const complete=JSON.stringify({type:'assistant',message:{id:'msg-complete',model:'claude-opus-5-5',usage:{input_tokens:100}}})+'\n';
  const pending=Buffer.concat([Buffer.from('{"type":"assistant","text":"'),Buffer.from('한').subarray(0,2)]);
  writeFileSync(join(root,'claude.stream.jsonl'),Buffer.concat([Buffer.from(complete),pending]));
  const run=readSnapshot([root]).runs[0],claude=run.providers.find(p=>p.provider==='claude');
  assert.equal(claude.tokens.input.observed,100);assert.equal(claude.tokens.input.value,null);
  assert.equal(claude.calls.observed_model_turns,1);assert.ok(run.warnings.length>0);
});
test('snapshot time marks abandoned pending calls uncertain after the wall deadline',t=>{
  const root=fixture(t);write(root,'manifest.json',{evidence_kind:'synthetic',mode:'jev',started_at:'2026-10-09T00:00:00Z',wall_timeout_seconds:60});
  writeFileSync(join(root,'decisions.jsonl'),JSON.stringify({event:'inference_started',provider:'jev',request_id:'jev-1'})+'\n');
  let clockCalls=0;const snapshot=readSnapshot([root],{now:()=>{clockCalls++;return '2026-10-09T00:02:00Z';}});
  assert.equal(clockCalls,1);assert.equal(snapshot.runs[0].status,'uncertain');
  assert.equal(snapshot.runs[0].providers.find(p=>p.provider==='jev').calls.uncertain,1);
});
function get(port,path,headers={},method='GET') {return new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port,path,method,headers},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.end();});}
async function serve(t) {
  const server=createDashboardServer({snapshot:()=>({schema_version:'jev-dashboard/v1',runs:[],warnings:[]})});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise(resolve=>server.close(resolve)));return server.address().port;
}
test('HTTP serves metric snapshot with no-store and a restrictive CSP',async t=>{
  const port=await serve(t);const r=await get(port,'/api/snapshot');assert.equal(r.status,200);
  assert.equal(JSON.parse(r.body).schema_version,'jev-dashboard/v1');assert.equal(r.headers['cache-control'],'no-store');
  assert.match(r.headers['content-security-policy'],/script-src 'self'/);
});
test('HTTP rejects foreign Host/Origin and mutation requests',async t=>{
  const port=await serve(t);
  assert.equal((await get(port,'/api/snapshot',{Host:'attacker.example'})).status,403);
  assert.equal((await get(port,'/api/snapshot',{Origin:'https://attacker.example'})).status,403);
  assert.equal((await get(port,'/api/snapshot',{},'POST')).status,405);
});
test('HTTP has no raw logs, credentials, start-run or arbitrary file route',async t=>{
  const port=await serve(t);
  for(const path of ['/api/start','/.env','/decisions.jsonl','/../package.json','/%2e%2e/package.json'])assert.equal((await get(port,path)).status,404);
});
