import {createHash} from 'node:crypto';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
// Applies only to file collections on known worker results or artifact snapshots.
// It does not summarize goals, questions, failures, verification, or arbitrary messages.
export function projectLifecycleDecision(request){
 const result=structuredClone(request);let projected=0,sourceBytes=0;
 const projectFiles=container=>{
  if(!object(container))return;
  for(const key of ['files','artifacts']){
   if(!Array.isArray(container[key]))continue;
   container[key]=container[key].map(file=>{
    if(!object(file)||typeof file.path!=='string'||typeof file.content!=='string')return file;
    const {content,...metadata}=file,actualBytes=Buffer.byteLength(content,'utf8'),actualHash=createHash('sha256').update(content).digest('hex');projected++;sourceBytes+=actualBytes;
    // Preserve supplied metadata verbatim; compute only absent receipt fields.
    return {...metadata,...(Object.hasOwn(metadata,'bytes')?{}:{bytes:actualBytes}),...(Object.hasOwn(metadata,'sha256')?{}:{sha256:actualHash}),source_not_in_decision_context:true};
   });
  }
 };
 const state=result.state;
 if(!object(state))throw Error('INVALID_LIFECYCLE_DECISION_STATE');
 projectFiles(state.workerResult);
 const walkEvidence=items=>{
  if(!Array.isArray(items))return;
  for(const entry of items){
   if(!object(entry))continue;
   if(entry.kind==='worker_result')projectFiles(entry.result);
   if(entry.kind==='failure')projectFiles(entry.evidence);
  }
 };
 walkEvidence(state.evidence?.items);
 projectFiles(state.failure?.evidence);
 // Failure snapshots may also be nested in a confirmed failed worker result.
 projectFiles(state.workerResult?.evidence);
 state.decision_source_access={schema_version:'lifecycle-decision-projection/v1',source_code_available:false,projected_file_occurrences:projected,omitted_source_bytes:sourceBytes,instructions:'Worker file source content is intentionally absent from this decision context. File paths, hashes, sizes, worker summaries, complete goal/requirements, failures and observed verification remain. Full source is retained locally and available to scoped implementation workers, not to this decision judge. Route or request bounded repair based on supplied observations. Do not claim to have inspected omitted source or verified functional correctness. Passing syntax/ownership checks is not proof of requirement satisfaction; independent grading remains required.'};
 return result;
}
