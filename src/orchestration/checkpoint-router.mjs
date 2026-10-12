import {createHash} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';

// Process-local coordinator. Durable recovery and cross-process exactly-once are not provided.
const canonical = value => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  throw Error('NON_JSON_CHECKPOINT');
};
export const checkpointHash = value => createHash('sha256').update(canonical(value)).digest('hex');
const required = value => typeof value === 'string' && value.trim().length > 0;

export function createCheckpointRouter({adapter, decide, handlers, record, readCurrent, maxEntries=1000}) {
  if (!adapter || typeof decide !== 'function' || typeof record !== 'function' || typeof readCurrent !== 'function') throw Error('CHECKPOINT_DEPENDENCIES_REQUIRED');
  if (!Number.isInteger(maxEntries) || maxEntries < 1) throw Error('INVALID_CHECKPOINT_CAPACITY');
  handlers={...handlers};
  const executions=new Map(), decisions=new Map();
  const active=new AsyncLocalStorage();
  let queue=Promise.resolve();
  function prepare(event) {
    if (!Number.isSafeInteger(event.decisionId)||event.decisionId<1||!required(event.id)||!required(event.scope)||!required(event.executionKey)||!required(event.evidenceRevision)) throw Error('INVALID_CHECKPOINT_IDENTITY');
    const prepared=adapter.prepare(structuredClone(event));
    const key=checkpointHash({scope:event.scope,revision:event.evidenceRevision,adapter:adapter.version,request:prepared.request,policy:prepared.policy,modelIdentity:prepared.modelIdentity});
    return {...prepared,key};
  }
  async function execute(event, mode, prepared) {
    const started=performance.now();
    const receipt={event_id:event.id,execution_key:event.executionKey,scope:event.scope,evidence_revision:event.evidenceRevision,
      decision_id:null,request_hash:checkpointHash(prepared.request),cache_key:prepared.key,mode,authority:null,
      skip_reason:null,jev_attempts:0,valid_response:false,decision_used:false,handler:null,selection:null,
      resolved_model:null,usage:null,cost_usd:null,cost_basis:'unknown',status:'pending',outcome:null,
      timing_ms:{decision:0,handler:0,total:0},quality_verified:false};
    let stage='preflight',decisionStarted=null,handlerStarted=null;
    const checkCurrent=async()=>{
      const current=await readCurrent(structuredClone(event));
      if (!current || prepare(current).key!==prepared.key || current.executionKey!==event.executionKey) throw Error('STALE_CHECKPOINT');
    };
    try {
      await checkCurrent();
      await record({event:'checkpoint_started',...structuredClone(receipt)});
      decisionStarted=performance.now();
      let selection;
      if ((mode==='auto' || prepared.mandatoryDeterministic===true) && prepared.deterministic!==null) {
        selection=prepared.deterministic;receipt.authority='script';receipt.skip_reason=selection.reason;
      } else {
        const cached=mode==='auto' && prepared.modelIdentity!==null ? decisions.get(prepared.key) : null;
        if (cached) {
          selection=adapter.select(prepared,structuredClone(cached.response));
          receipt.authority='cache';receipt.skip_reason='exact_decision_reuse';receipt.decision_id=cached.decisionId;
          receipt.resolved_model=cached.response.model;
        } else {
          stage='decision';receipt.authority='jev';receipt.jev_attempts=1;receipt.decision_id=event.decisionId;
          await record({event:'checkpoint_decision_requested',...structuredClone(receipt)});
          const response=await decide(structuredClone(prepared.request),{decision_id:event.decisionId});
          receipt.resolved_model=response?.model??null;receipt.usage=response?.usage??null;
          selection=adapter.select(prepared,response);receipt.valid_response=true;
          await checkCurrent();
          // Unresolved aliases and model mismatches disable reuse; fresh validated answers remain usable.
          if (prepared.modelIdentity!==null && response.model===prepared.modelIdentity) {
            if(decisions.size>=maxEntries)decisions.delete(decisions.keys().next().value);
            decisions.set(prepared.key,{response:structuredClone(response),decisionId:event.decisionId});
          }
        }
      }
      receipt.timing_ms.decision=performance.now()-decisionStarted;
      stage='validation';
      if (!selection || !Object.hasOwn(handlers,selection.action) || typeof handlers[selection.action]!=='function') throw Error('UNREGISTERED_CHECKPOINT_HANDLER');
      await checkCurrent();
      receipt.selection=structuredClone(selection);receipt.handler=selection.action;
      await record({event:'checkpoint_dispatch_ready',...structuredClone(receipt)});
      // Recorder can be async; recheck once more after it and before invoking the handler.
      await checkCurrent();stage='handler';
      handlerStarted=performance.now();
      receipt.decision_used=receipt.authority!=='script';
      receipt.outcome=await handlers[selection.action]({event:structuredClone(event),selection:structuredClone(selection)});
      receipt.timing_ms.handler=performance.now()-handlerStarted;receipt.status='dispatched';
    } catch(error) {
      if(stage==='decision' && decisionStarted!==null)receipt.timing_ms.decision=performance.now()-decisionStarted;
      if(stage==='handler' && handlerStarted!==null)receipt.timing_ms.handler=performance.now()-handlerStarted;
      receipt.status=stage==='handler'?'execution_uncertain':'stopped';
      receipt.failure_stage=stage;receipt.error_code=/^[A-Z_]+$/.test(error.message)?error.message:'CHECKPOINT_FAILED';
      receipt.retry=false;
    }
    receipt.timing_ms.total=performance.now()-started;
    // A failed final recorder rejects the call; the execution entry remains reserved. Never auto-retry.
    await record({event:'checkpoint_finished',...structuredClone(receipt)});
    return receipt;
  }
  return {
    run(input,{mode='auto'}={}) {
      if(active.getStore())return Promise.reject(Error('REENTRANT_CHECKPOINT_NOT_ALLOWED'));
      if (!['auto','force_jev'].includes(mode))return Promise.reject(Error('INVALID_CHECKPOINT_MODE'));
      let event,prepared;
      try {event=structuredClone(input);prepared=prepare(event);} catch(error){return Promise.reject(error);}
      const executionId=checkpointHash({scope:event.scope,key:event.executionKey});
      const fingerprint=checkpointHash({key:prepared.key,mode});
      const existing=executions.get(executionId);
      if(existing) {
        if(existing.fingerprint!==fingerprint)return Promise.reject(Error('EXECUTION_KEY_CONFLICT'));
        return existing.promise.then(receipt=>({...structuredClone(receipt),duplicate_event_id:event.id,duplicate_execution:true}));
      }
      if(executions.size>=maxEntries)return Promise.reject(Error('CHECKPOINT_CAPACITY_REACHED'));
      const promise=queue.then(()=>active.run(true,()=>execute(event,mode,prepared)));
      executions.set(executionId,{fingerprint,promise});queue=promise.catch(()=>{});
      return promise.then(structuredClone);
    }
  };
}
