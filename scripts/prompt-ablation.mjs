#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,copyFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {processResult} from '../src/benchmark/docker.mjs';
import {claudeEnvironment} from '../src/benchmark/claude-env.mjs';
import {providerOutcome} from '../src/benchmark/runner.mjs';
import {buildWorkerInput} from '../src/orchestration/worker-inputs.mjs';
import {validateFiles} from '../src/orchestration/live-file-workers.mjs';
const root=resolve(new URL('..',import.meta.url).pathname);
const sha=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const contract=read(join(root,'docs/orchestration/contracts/worker-task.v3.json'));
const envelope=`Follow the supplied worker contract and frozen plan. You have NO tools. Return only JSON {"files":[{"path":"owned relative path","content":"complete file content"}],"artifacts":["owned relative path"],"observed_checks":[],"blockers":[],"uncertainty":["Checks unexecuted: no tools"],"summary":"brief summary and unexecuted checks"}. Supply EVERY assigned file, only assigned paths. Do not return Markdown fences. Artifacts must list exactly all returned file paths. observed_checks must be empty because no tools are available. Never claim executed tests. Worker contract:\n`;
const variants={baseline:envelope+JSON.stringify(contract)};
variants.compact_contract=envelope+JSON.stringify({instructions:contract.instructions});
const noOutput=structuredClone(contract);delete noOutput.requiredOutput;delete noOutput.outputDescriptions;
variants.output_dedup=`Follow the supplied worker contract. You have NO tools. Return only JSON following request.outputContract. Supply EVERY assigned file, only assigned paths. Do not return Markdown fences. Artifacts must list exactly all returned file paths. observed_checks must be empty because no tools are available. Never claim executed tests. Worker contract:\n`+JSON.stringify(noOutput);
const noMeta=structuredClone(contract);delete noMeta.applicationNotes;delete noMeta.research;
variants.local_metadata=envelope+JSON.stringify(noMeta);
const noTools=structuredClone(contract);const unused='When tools are available, inspect relevant source and tests before changing behavior and record actual checks, commands, exit codes and evidence. ';
if(!noTools.instructions.includes(unused))throw Error('TEMPLATE_CHANGED');
noTools.instructions=noTools.instructions.replace(unused,'');
noTools.outputDescriptions.observed_checks='No tools are available: observed_checks must be an empty array. Report unexecuted checks in uncertainty.';
variants.no_tools_template=envelope+JSON.stringify(noTools);
const frozen=read(join(root,'benchmark-runs/d029-tree-01/frozen-plan.json'));
const inputs=read(join(root,'benchmark-runs/d029-tree-01/inputs.json'));
const task=frozen.plan.tasks.find(t=>t.id==='packaging');
const {request}=buildWorkerInput({plan:frozen.plan,task,brief:inputs.brief,completedFiles:[],profile:{model:'claude-opus-5-5',effort:'medium'},mode:'projected',executionMode:'split'});
const referenceFiles=frozen.plan.tasks.filter(t=>t.id!=='packaging').flatMap(t=>t.paths).map(path=>({path,content:readFileSync(join(root,'benchmark-runs/d029-tree-01/candidate-split',path))}));
const names=Object.keys(variants);
const orders=[names,[...names.slice(2),...names.slice(0,2)],[...names.slice(4),...names.slice(0,4)],[...names.slice(1),names[0]]];
const [outArg,spend]=process.argv.slice(2);if(!outArg)throw Error('Usage: new-output [--spend]');
const out=resolve(outArg);mkdirSync(out,{recursive:false,mode:0o700});
const save=(p,x)=>writeFileSync(join(out,p),JSON.stringify(x,null,2)+'\n',{flag:'wx',mode:0o600});
const sizes=names.map(name=>({name,system_bytes:Buffer.byteLength(variants[name]),request_bytes:Buffer.byteLength(JSON.stringify(request)),system_sha256:sha(variants[name])}));
save('protocol.json',{script_sha256:sha(readFileSync(new URL(import.meta.url),'utf8')),base_commit:'80eb79ae43ac5ba05c181447f25bd8112aed1aad',reference_file_hashes:Object.fromEntries(referenceFiles.map(f=>[f.path,createHash('sha256').update(f.content).digest('hex')])),request,request_hash:sha(request),variants,sizes,orders,model:'claude-opus-5-5',effort:'medium',planned_calls:20,scope:'packaging only; other 8 integration files frozen from D029',limitations:['Four repeats of one task, not four independent tasks','Shared provider cache is not reset; order rotated but not fully balanced','No retries on uncertain paid outcomes','Each candidate changes only system prompt; variants are independent, not cumulative','Full contract trimming changes wording; quality equivalence requires verification']});
if(spend!=='--spend'){console.log(JSON.stringify({status:'prepared_no_calls',sizes}));process.exit(0);}
const results=[];
outer: for(let round=0;round<4;round++)for(const name of orders[round]){
 const id=`r${round+1}-${name}`,cwd=mkdtempSync(join(tmpdir(),'jev-d033-')),mcpFile=join(cwd,'empty-mcp.json');writeFileSync(mcpFile,'{"mcpServers":{}}');
 save(`${id}.request.json`,{system:variants[name],request,cwd});
 console.log(JSON.stringify({event:'start',id,completed:results.length}));
 const args=['--print','--restricted','--model','claude-opus-5-5','--effort','medium','--tools','','--strict-mcp-config','--mcp-config',mcpFile,'--setting-sources','','--disable-slash-commands','--no-chrome','--permission-mode','dontAsk','--permission-prompts','none','--no-session-persistence','--output-format','stream-json','--verbose','--system-prompt',variants[name]];
 const start=performance.now();const raw=await processResult('claude',args,{cwd,env:claudeEnvironment(process.env),input:JSON.stringify(request),timeoutMs:180000,killProcessTree:true,maxBytes:4*1024*1024});
 const wall_ms=performance.now()-start;
 writeFileSync(join(out,`${id}.stdout.jsonl`),raw.stdout,{flag:'wx',mode:0o600});writeFileSync(join(out,`${id}.stderr.log`),raw.stderr,{flag:'wx',mode:0o600});
 const outcome=providerOutcome(raw,'claude-opus-5-5'),final=outcome.completion;
 const row={id,round:round+1,variant:name,status:outcome.status,wall_ms,provider_api_ms:final?.duration_api_ms??null,usage:final?.usage??null,api_equivalent_usd:final?.total_cost_usd??null,models:outcome.models??[],valid_output:false,error:null};
 if(outcome.status==='completed')try{
  const response=JSON.parse(final.result.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
  const files=validateFiles(response,task.paths);row.response=response;
  const candidate=join(out,id,'candidate');mkdirSync(candidate,{recursive:true,mode:0o700});
  for(const f of referenceFiles){const dest=join(candidate,f.path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,f.content,{flag:'wx'});}
  for(const f of files){const dest=join(candidate,f.path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,f.content,{flag:'wx',mode:0o600});}
  row.valid_output=true;row.candidate=candidate;row.generated_file_hashes=Object.fromEntries(files.map(f=>[f.path,sha(f.content)]));
 }catch(e){row.error='INVALID_GENERATED_OUTPUT';}
 results.push(row);save(`${id}.receipt.json`,row);
 console.log(JSON.stringify({event:'completed',id,status:row.status,valid_output:row.valid_output,wall_ms,cost:row.api_equivalent_usd}));
 if(outcome.status!=='completed'){save('stopped.json',{reason:'provider_failure_no_retry',results});process.exitCode=1;break outer;}
}
save('result.json',{status:results.length===20?'completed':'stopped',results,actual_calls:results.length,jev_calls:0});
