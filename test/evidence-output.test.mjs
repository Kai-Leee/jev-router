import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEvidenceOutput} from '../src/benchmark/evidence-output.mjs';
const evidence={revision:'v2',items:[{id:'source',content:'a report'}]};
const good=()=>({evidence_revision:'v2',observed_facts:[{fact:'A report exists.',evidence_ids:['source']}],missing_evidence:[]});
test('valid IDs pass while plausible invented citation is rejected',()=>{
 assert.equal(validateEvidenceOutput(good(),evidence).valid,true);
 const bad=good();bad.observed_facts[0].evidence_ids=['caller-supplied revision field (no evidence ID)'];
 assert.deepEqual(validateEvidenceOutput(bad,evidence),{valid:false,errors:['observed_facts[0]:UNKNOWN_OR_MISSING_EVIDENCE_ID']});
});
test('stale revision and malformed or empty reference entries fail',()=>{
 const bad=good();bad.evidence_revision='v1';bad.missing_evidence=[{gap:'missing',evidence_ids:[]}];
 assert.equal(validateEvidenceOutput(bad,evidence).errors.length,2);
 assert.equal(validateEvidenceOutput(null,evidence).valid,false);
});
