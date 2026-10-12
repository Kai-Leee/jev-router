#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {allocateSequentialV3} from '../src/orchestration/sequential-allocation-v3.mjs';
import {runBoundedVerifiedWorkflowV3} from '../src/orchestration/bounded-verified-workflow-v3.mjs';
import {encodePlanningState,decodePlanningState} from '../src/orchestration/planning-state-codec.mjs';
import {prepareDecision} from '../src/client.mjs';
import {profilesFromCatalog} from './sequential-e2e.mjs';
const root=resolve(import.meta.dirname,'..'),read=p=>JSON.parse(readFileSync(resolve(root,p)));
const input=read('benchmarks/e2e-swe/manifests/d056-obligations.json');
const profiles=profilesFromCatalog(read('docs/orchestration/contracts/models.v2.json'));
const events=[],requests=[];
const plan=await allocateSequentialV3({input,profiles,record:async e=>events.push(e),decide:async r=>{
  const state=encodePlanningState(r.state);
  if(!isDeepStrictEqual(r.state,decodePlanningState(state)))throw Error('ROUNDTRIP_FAILED');
  const prepared=prepareDecision({model:'jev-latest',state:JSON.stringify(state),questions:r.questions});
  requests.push({stage:r.stage,node_id:r.node_id,questions:Object.keys(r.questions).length,wire_bytes:Buffer.byteLength(prepared.serialized)});
  return {answers:Object.fromEntries(Object.keys(r.questions).map(key=>{
    let choice;
    if(r.stage==='count')choice='30';
    else if(r.stage==='profile')choice=profiles.find(p=>p.effort==='medium').id;
    else {
      const index=r.state.remaining_obligation_ids.indexOf(r.state.assignment_questions[key]);
      const n=r.node_id==='worker_1'&&r.stage==='allocate'?65:Math.ceil(r.state.remaining_obligation_ids.length/(r.state.reserve_for_later_workers+1));
      choice=index<n?'include':'exclude';
    }
    return [key,{type:'choice',choice}];
  }))};
}});
let forbiddenCalls=0;
const unused=async()=>{forbiddenCalls++;throw Error('PREFLIGHT_MUST_BLOCK');};
const productPreflight=await runBoundedVerifiedWorkflowV3({input,profiles,allPaths:[...new Set(input.obligations.flatMap(o=>o.write_scope))],registry:[],decide:unused,execute:unused,runCheck:unused,getArtifactRevision:unused});
const result={mode:'offline_mock_decisions_no_inference',live_calls:0,product_preflight:productPreflight,callbacks_invoked_after_missing_mapping:forbiddenCalls,
  plan:{count:plan.count,cap:plan.maximum_obligations_per_worker,coverage:plan.coverage,tasks:plan.tasks.map(t=>({id:t.id,obligations:t.obligation_ids.length,tests:t.test_ids.length,depends_on:t.depends_on,bounds:t.allocation_bounds}))},
  rejected_selections:events.filter(e=>e.event==='allocation_selection_rejected'),requests,maximum_wire_bytes:Math.max(...requests.map(r=>r.wire_bytes)),roundtrip_all:true,
  limitations:['Mock choices, not actual Jev decisions or savings.','Cardinality cap is not time/effort balance.','No product executable checks registered; no development dispatched.','Shared tests may require integration prerequisites; registry readiness is not semantic validation.']};
if(process.argv.includes('--write'))writeFileSync(resolve(root,'benchmark-runs/d061-preflight/result.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify(result,null,2));
