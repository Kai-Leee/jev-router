import {readFileSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyHistoryEvidence,verifyHistorySources} from './codex-worker-outcomes.mjs';

export const CODEX_WORKER_HISTORY_BINDING='docs/orchestration/contracts/codex-worker-outcomes-binding.v1.json';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=()=>{throw Object.assign(Error('CODEX_WORKER_HISTORY_BINDING_INVALID'),{code:'CODEX_WORKER_HISTORY_BINDING_INVALID'});};
function readBound(rootDir,path){
  if(typeof path!=='string'||isAbsolute(path)||path.split(/[\\/]/).some(p=>!p||p==='.'||p==='..'))fail();
  const root=realpathSync(rootDir),full=realpathSync(resolve(root,path)),rel=relative(root,full);
  if(isAbsolute(rel)||rel==='..'||rel.startsWith(`..${sep}`))fail();
  return readFileSync(full);
}

/** Controller-only provenance. Only the recomputed public statistical summary is sent to Jev. */
export function loadCodexWorkerHistory({rootDir,bindingPath=CODEX_WORKER_HISTORY_BINDING,checkSources=true}={}){
  const bindingBytes=readBound(rootDir,bindingPath),binding=JSON.parse(bindingBytes);
  if(binding.schema_version!=='codex-worker-outcomes-binding/v1'
    ||binding.selection_input_scope!=='public-worker-outcomes-only'
    ||!/^[a-f0-9]{64}$/.test(binding.file_sha256??'')
    ||!/^[a-f0-9]{64}$/.test(binding.snapshot_sha256??''))fail();
  const bytes=readBound(rootDir,binding.path);
  if(hash(bytes)!==binding.file_sha256)fail();
  const snapshot=JSON.parse(bytes);
  verifyHistoryEvidence(snapshot,{expectedSha256:binding.snapshot_sha256});
  if(checkSources)verifyHistorySources(snapshot);
  return {snapshot,binding,source:{path:bindingPath,sha256:hash(bindingBytes)},snapshot_source:{path:binding.path,sha256:hash(bytes)}};
}
