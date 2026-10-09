#!/usr/bin/env node
// Offline audit of stored requests. Bytes are not provider tokens; no inference.
import {readFileSync,writeFileSync} from 'node:fs';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: events.jsonl new-report.json');
const bytes=x=>Buffer.byteLength(JSON.stringify(x),'utf8');
const rows=readFileSync(input,'utf8').trim().split('\n').map(JSON.parse)
 .filter(e=>e.event==='claude_started'&&e.label!=='planner').map(e=>{
  const r=e.request;
  if(!['goal','requirements'].every(k=>JSON.stringify(r[k])===JSON.stringify(r.brief))||JSON.stringify(r.acceptanceCriteria.originalBrief)!==JSON.stringify(r.brief)||JSON.stringify(r.evidence)!==JSON.stringify(r.completedFiles))throw Error('Expected duplicate invariant changed');
  const reduced=structuredClone(r);
  delete reduced.goal;delete reduced.requirements;delete reduced.acceptanceCriteria.originalBrief;delete reduced.evidence;
  return {label:e.label,original_request_bytes:bytes(r),deduplicated_request_bytes:bytes(reduced),removed_bytes:bytes(r)-bytes(reduced),removed_percent:(bytes(r)-bytes(reduced))/bytes(r)*100,system_bytes:Buffer.byteLength(e.system,'utf8'),field_bytes:Object.fromEntries(Object.entries(r).map(([k,v])=>[k,bytes(v)]))};
 });
const sum=k=>rows.filter(r=>r.label.startsWith('split-')).reduce((n,r)=>n+r[k],0);
const result={input,method:'Delete only equal duplicate values: goal, requirements, acceptanceCriteria.originalBrief, evidence. Keep brief and completedFiles. Hypothetical wire body; not a validated replacement for the current worker contract.',rows,split:{original_request_bytes:sum('original_request_bytes'),deduplicated_request_bytes:sum('deduplicated_request_bytes'),removed_bytes:sum('removed_bytes'),removed_percent:sum('removed_bytes')/sum('original_request_bytes')*100},limits:['JSON UTF-8 bytes, not model tokens or cost','System prompts unchanged and excluded from request denominator','No semantic selection, model execution, contract migration or cache hit validation']};
writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({rows:rows.map(({field_bytes,...r})=>r),split:result.split},null,2));
