#!/usr/bin/env node
// No credentials or network: exercise every planning stage with explicit mock choices.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {runRecursivePlanning} from '../src/orchestration/recursive-task-tests.mjs';
import {encodePlanningState,decodePlanningState} from '../src/orchestration/planning-state-codec.mjs';
import {checkPlanningRequest,loadPlanningManifest} from '../src/benchmark/recursive-planning-runner.mjs';

const root=resolve(import.meta.dirname,'..');
const {manifest,input,contract}=loadPlanningManifest('benchmarks/e2e-swe/manifests/d056-planning-columnar.json',root);
const rows=[];
const plan=await runRecursivePlanning({input,contract,limits:manifest.limits,decide:async request=>{
  const encoded=encodePlanningState(request.state);
  assert.deepEqual(decodePlanningState(encoded),request.state);
  const guard={maxRequestBytes:256000,knownInputTokens:0,reserveInputTokens:0,maxPlanningInputTokens:manifest.limits.max_planning_input_tokens};
  const original=checkPlanningRequest(request,{...guard,stateFormat:'json_text'});
  const packed=checkPlanningRequest(request,{...guard,maxRequestBytes:manifest.max_request_bytes,stateFormat:'columnar_text'});
  assert.deepEqual(decodePlanningState(JSON.parse(JSON.parse(packed.serialized).state)),request.state);
  rows.push({stage:request.stage,node_id:request.node_id,original_wire_bytes:original.bytes,columnar_wire_bytes:packed.bytes});
  const [key,q]=Object.entries(request.questions)[0],choices=Object.keys(q.criteria);
  const choice=request.stage==='child_count' ? (request.state.node.depth<2 ? choices.at(-1) : '1') : choices[0];
  assert.ok(choices.includes(choice));
  return{answers:{[key]:{type:'choice',choice}}};
}});
assert.equal(plan.status,'complete');
const hash=path=>createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex');
const max=key=>Math.max(...rows.map(r=>r[key])),sum=key=>rows.reduce((n,r)=>n+r[key],0);
const result={mode:'mock_no_inference',status:plan.status,requests_checked:rows.length,
  exact_state_roundtrip:true,root_request:rows[0],max_original_wire_bytes:max('original_wire_bytes'),
  max_columnar_wire_bytes:max('columnar_wire_bytes'),total_original_wire_bytes:sum('original_wire_bytes'),
  total_columnar_wire_bytes:sum('columnar_wire_bytes'),leaf_count:plan.metrics.leaf_count,
  depth:plan.metrics.max_depth_reached,inference_calls:0,provider_tokens:null,
  limitations:'Wire bytes are measured; provider tokens, model reading accuracy and performance effects are not measured by this mock.',
  sources:['src/orchestration/planning-state-codec.mjs','src/benchmark/recursive-planning-runner.mjs','src/orchestration/recursive-task-tests.mjs','benchmarks/e2e-swe/manifests/d056-planning-columnar.json'].map(path=>({path,sha256:hash(path)})),rows};
if(process.argv[2]==='--write'&&process.argv[3])writeFileSync(resolve(root,process.argv[3]),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
else if(process.argv.length>2)throw Error('USAGE: inspect-d056-codec.mjs [--write NEW_PATH]');
console.log(JSON.stringify({...result,rows:undefined},null,2));
