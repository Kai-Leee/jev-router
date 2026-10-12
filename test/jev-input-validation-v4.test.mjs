import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateJevInput,auditJevInputs} from '../scripts/validate-jev-input.mjs';
import {prepareDecision} from '../src/client.mjs';

function sized(size) {
  const request={state:'x',questions:{owner:{type:'choice',instructions:'Choose an existing owner.',criteria:{a:'First owner.',b:'Second owner.'}}}};
  request.state+='x'.repeat(size-Buffer.byteLength(prepareDecision(request).serialized));return request;
}
function temporary(t) {const path=mkdtempSync(join(tmpdir(),'jev-v4-validation-'));t.after(()=>rmSync(path,{recursive:true,force:true}));return path;}
const cli=args=>spawnSync(process.execPath,['scripts/validate-jev-input.mjs',...args],{encoding:'utf8'});
function recorded(t,{version='v3',stage='repair',bytes=86809,called=false}={}) {
  const run=temporary(t);mkdirSync(join(run,'calls'));mkdirSync(join(run,'receipts'));
  const request=sized(bytes),admission=validateJevInput(request,{policy:version,stage}).admission;
  const write=(path,value)=>writeFileSync(join(run,path),JSON.stringify(value));
  write('calls/jev-0001.request.json',request);write('calls/jev-0001.token-admission.json',admission);
  write('receipts/jev-0001.json',{id:'jev-0001',provider:'jev',stage,inference_started:called,status:called?'completed':'failed',
    code:called?null:'ADAPTIVE_TOKEN_PREFLIGHT_BLOCKED',outcome_uncertain:false,usage:called?{input_tokens:1}:null,
    ...(called?{model:'jev-1.13.0'}:{})});
  if(called)write('calls/jev-0001.response.json',{model:'jev-1.13.0',receipt:{method:'POST',destination:'https://jev-ai.pro/api/v1/systemone',status:200,automaticRetries:0}});
  return {run,request,admission,write};
}

test('CLI keeps v3 default and requires explicit v4 for unbounded local sizing and repair_owners',t=>{
  const directory=temporary(t),path=join(directory,'request.json');writeFileSync(path,JSON.stringify(sized(86809)));
  const old=cli(['--request',path,'--stage','repair']);assert.equal(old.status,2);assert.equal(JSON.parse(old.stdout).policy.version,'v3');
  const current=cli(['--request',path,'--stage','repair','--policy','v4']);assert.equal(current.status,0);
  const result=JSON.parse(current.stdout);assert.equal(result.summary.admitted_observations,1);assert.equal(result.summary.admitted_estimates,0);
  assert.equal(result.summary.requests_with_warnings,1);assert.equal(result.connection.key_loaded,false);assert.deepEqual(result.performed_calls,{GET:0,POST:0});
  assert.equal(cli(['--request',path,'--stage','repair_owners']).status,1);
  assert.equal(cli(['--request',path,'--stage','repair_owners','--policy','v4']).status,0);
  assert.equal(cli(['--request',path,'--stage','repair','--policy','v5']).status,1);
  assert.equal(cli(['--request',path,'--stage','repair','--policy','v4','--policy','v4']).status,1);
  writeFileSync(path,JSON.stringify(sized(256001)));
  assert.equal(cli(['--request',path,'--stage','repair','--policy','v4']).status,2);
});

test('v4 reassessment replays a historical v3 refusal separately without rewriting its accepted version or POST history',t=>{
  const fixture=recorded(t),before=readFileSync(join(fixture.run,'calls/jev-0001.token-admission.json'));
  const old=auditJevInputs({runs:[fixture.run]}),current=auditJevInputs({runs:[fixture.run],policy:'v4'});
  assert.equal(old.audit_complete,true);assert.equal(old.summary.blocked,1);
  assert.equal(current.audit_complete,true);assert.equal(current.summary.blocked,0);assert.equal(current.summary.admitted_observations,1);
  assert.equal(current.summary.historical_local_refusals,1);assert.equal(current.summary.historical_post_200,0);
  const row=current.requests[0];assert.equal(row.historical.recorded_policy_version,'v3');assert.equal(row.historical.selected_policy_version,'v4');
  assert.equal(row.historical.admission_replay_matches,true);assert.equal(row.historical.reassessed_under_different_policy,true);
  assert.equal(row.historical.inference_started,false);assert.equal(row.validation.admission.inference_allowed,true);
  assert.deepEqual(readFileSync(join(fixture.run,'calls/jev-0001.token-admission.json')),before);
  assert.equal(current.summary.changed_input_files,0);assert.deepEqual(current.performed_calls,{GET:0,POST:0});
});

test('run replay recognizes v4 owner stage while a default v3 reassessment remains blocked',t=>{
  const fixture=recorded(t,{version:'v4',stage:'repair_owners',called:true});
  const current=auditJevInputs({runs:[fixture.run],policy:'v4'});assert.equal(current.audit_complete,true);
  assert.equal(current.summary.historical_post_200,1);assert.equal(current.summary.admitted_observations,1);
  const old=auditJevInputs({runs:[fixture.run]});assert.equal(old.audit_complete,true);assert.equal(old.summary.blocked,1);
  assert.equal(old.requests[0].historical.admission_replay_matches,true);
  assert.ok(old.requests[0].validation.admission.reason_codes.includes('JEV_TOKEN_ADMISSION_STAGE_UNVERIFIED'));
  const changed={...fixture.admission,policy_source:{...fixture.admission.policy_source,sha256:'0'.repeat(64)}};
  fixture.write('calls/jev-0001.token-admission.json',changed);
  assert.ok(auditJevInputs({runs:[fixture.run],policy:'v4'}).issues.some(issue=>issue.code==='SAVED_ADMISSION_REPLAY_MISMATCH'));
  fixture.write('calls/jev-0001.token-admission.json',{...fixture.admission,schema_version:'unknown'});
  assert.ok(auditJevInputs({runs:[fixture.run],policy:'v4'}).issues.some(issue=>issue.code==='SAVED_POLICY_UNSUPPORTED'));
});
