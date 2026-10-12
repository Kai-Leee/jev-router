// One live routing decision; never dispatch implementation through a known broken transport.
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createTokenBudget,readTokenBudgetSnapshot} from '../src/benchmark/budget.mjs';
import {createMeasuredDecider} from '../src/benchmark/telemetry.mjs';
import {createJevClient} from '../src/client.mjs';
import {loadConfig} from '../src/config.mjs';
import {selectExecution} from '../src/orchestration/routing-policy.mjs';
const [output,flag]=process.argv.slice(2);
if(!output||flag!=='--spend')throw Error('USAGE_OUTPUT_SPEND_REQUIRED');
const dir=resolve(output);mkdirSync(dir,{mode:0o700});
const save=(name,value)=>writeFileSync(join(dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const source='benchmark-runs/d042-auto-01/split-request.json';
const questionPath='docs/orchestration/contracts/split-confidence.v2.json';
const previous=read(source), config=read('benchmark-runs/d042-auto-config.json');
const request={model:'jev-latest',state:{...previous.state,executionEvidence:{source:'D042 actual terminal receipts and parsing audit',previousAttempts:[{strategy:'single',authority:'claude',providerStatus:'completed',filesMaterialized:0},{strategy:'single',authority:'jev',providerStatus:'completed',filesMaterialized:0}],observedFailure:'Both worker streams hit output token limit and CLI continuation; final result was not parseable as artifact JSON. No files materialized. Not a timeout.',currentImplementation:'No-tools file generation. Single merges all 16 files. Split uses frozen task ownership (6, 2, 1, 7 files) and identical final JSON parser for each child. No continuation recovery, incremental file writing or repair loop.',transportRepairVerified:false,splitTaskArtifactFeasibilityMeasured:false,gradeStatus:'Not run: no candidate',permittedActions:['split','single','defer']}},questions:read(questionPath).questions};
save('request.json',request);save('provenance.json',{questionPath,questionSha256:createHash('sha256').update(readFileSync(questionPath)).digest('hex'),source,sourceSha256:createHash('sha256').update(readFileSync(source)).digest('hex'),executionScope:'one routing decision; worker transport unresolved',threshold:.65,thresholdBasis:'provisional experiment, not calibrated'});
save('budget-before.json',readTokenBudgetSnapshot(config.jev_budget));
const budget=createTokenBudget(config.jev_budget);
try {
 const decide=createMeasuredDecider({client:createJevClient(loadConfig()),budget,record:async e=>appendFileSync(join(dir,'events.jsonl'),JSON.stringify(e)+'\n',{mode:0o600}),identifiers:{run_id:'d044-choice-audit',attempt_id:'d044-choice-audit-01',group_id:'d044-confidence',agent_role:'implementation'}});
 const response=await decide(request,{decision_id:1});save('response.json',response);
 const policies=[.5,.65,.8].map(threshold=>selectExecution({authority:'jev',threshold,answers:response.answers,decisionBasis:'confidence'}));
 const selection=policies[1];save('result.json',{status:selection.modes.length?'selected_pending_transport_verification':'needs_evidence',selection,policies,handler:selection.modes.length?'require_transport_verification':'collect_evidence',outcome:{blockers:['D042 artifact continuation is not recovered by current parser','Split child output feasibility not measured'],nextAction:'Verify bounded artifact transport before worker dispatch',workerCalls:0,taskComplete:false}});
 console.log(JSON.stringify({selection,usage:response.usage,receipt:response.receipt,workerCalls:0}));
} catch(error){save('stopped.json',{code:error.code??'AUDIT_FAILED',outcomeUncertain:error.outcomeUncertain??null,retry:false});throw error;}
finally{budget.close();save('budget-after.json',readTokenBudgetSnapshot(config.jev_budget));}
