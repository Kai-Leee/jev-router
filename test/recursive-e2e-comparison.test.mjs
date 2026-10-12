import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isIndependentCompletion,publishedSnapshot,summarizeUsage} from '../scripts/recursive-e2e-comparison.mjs';

const valid=()=>({grade:{grading_status:'completed',resolved:true,reward:1,expected_test_count:63,observed_test_records:63,expected_test_count_observed:true,
  summary:{tests:63,passed:63,failed:0,skipped:0,pending:0,other:0},verifier_process_returncode:0,container_removed:true,
  task_id:'openapi_python_client',upstream_commit:'pinned',image:{image_id:'image',image_digest:'digest'},workspace:'/candidate',network:'none',fresh_verifier:true,model_calls:0},
  process:{exit_code:0,outcome_uncertain:false},image:{image_id:'image',image_digest:'digest'},upstreamCommit:'pinned',workspace:'/candidate'});
test('completion requires all grade, count, cleanup, identity and process evidence',()=>{
  assert.equal(isIndependentCompletion(valid()),true);
  for(const [field,value] of [['expected_test_count',62],['observed_test_records',62],['container_removed',false],['upstream_commit','other'],['workspace','/other'],['network','bridge'],['fresh_verifier',false],['model_calls',1]]){
    const x=valid();x.grade[field]=value;assert.equal(isIndependentCompletion(x),false,field);
  }
  for(const field of ['failed','skipped','pending','other']){const x=valid();x.grade.summary[field]=1;assert.equal(isIndependentCompletion(x),false,field);}
  const x=valid();x.process.outcome_uncertain=true;assert.equal(isIndependentCompletion(x),false);
  const y=valid();y.grade.image.image_id='other';assert.equal(isIndependentCompletion(y),false);
});
test('published snapshot ignores transient atomic-write artifacts and missing paths',()=>{
  const dir=mkdtempSync(join(tmpdir(),'d057-snapshot-test-'));
  try{writeFileSync(join(dir,'a.py'),'x=1');writeFileSync(join(dir,'.artifact-transient.tmp'),'partial');
    const files=publishedSnapshot(dir,['a.py','missing.py']);assert.equal(files.length,1);assert.equal(files[0].path,'a.py');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('unknown invocation cost is not silently converted to a complete zero total',()=>{
  const r=summarizeUsage([{status:'uncertain',usage:null,api_equivalent_usd:null}]);
  assert.equal(r.tokens_complete,false);assert.equal(r.api_equivalent_usd,null);assert.equal(r.actual_billed_usd,null);
});
