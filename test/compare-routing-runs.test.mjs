import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
test('paired comparator rejects unrelated grade and unmatched prompt conditions',()=>{
 const base=mkdtempSync(join(tmpdir(),'routing-pair-'));
 const put=(p,v)=>writeFileSync(p,JSON.stringify(v));
 try{
 const dirs=['a','b'].map(n=>join(base,n)),grades=['ga','gb'].map(n=>join(base,n));
 for(let x=0;x<2;x++){mkdirSync(dirs[x]);mkdirSync(grades[x]);put(join(dirs[x],'inputs.json'),{briefHash:'b',model:'opus',effort:'medium',inputMode:'projected',workerSha256:'w',questionsSha256:'q',maxConcurrency:2});put(join(dirs[x],'result.json'),{status:'generated_ungraded',planHash:'p',planning_reused:true,planning_ms:0,routing:{authority:x?'jev':'claude',threshold:.65,decision_elapsed_ms:x?1:2,claude_decision_calls:x?0:1,jev_decision_calls:x?1:0,probability:.7},arms:[{mode:'split',wall_ms:10,receipts:[{usage:{input_tokens:1,cache_creation_input_tokens:2,cache_read_input_tokens:0,output_tokens:3}}]}],receipts:[{api_equivalent_usd:.1}]});put(join(dirs[x],'split-decision.json'),{response:{usage:{input_tokens:4}}});put(join(grades[x],'result.json'),{workspace:join(dirs[x],'candidate-split'),task_id:'t',upstream_commit:'u',image:{image_digest:'i'},grading_status:'completed',elapsed_sec:1,resolved:true,reward:1});}
 const run=out=>spawnSync(process.execPath,[resolve('scripts/compare-routing-runs.mjs'),dirs[0],grades[0],dirs[1],grades[1],join(base,out)],{encoding:'utf8'});
 assert.equal(run('valid.json').status,0);assert.equal(JSON.parse(readFileSync(join(base,'valid.json'))).paired_claude_decision_calls_avoided,1);
 const g=JSON.parse(readFileSync(join(grades[1],'result.json')));g.workspace=join(dirs[0],'candidate-split');put(join(grades[1],'result.json'),g);assert.notEqual(run('invalid-grade.json').status,0);
 g.workspace=join(dirs[1],'candidate-split');put(join(grades[1],'result.json'),g);const i=JSON.parse(readFileSync(join(dirs[1],'inputs.json')));i.workerSha256='different';put(join(dirs[1],'inputs.json'),i);assert.notEqual(run('invalid-input.json').status,0);
 }finally{rmSync(base,{recursive:true,force:true});}
});
