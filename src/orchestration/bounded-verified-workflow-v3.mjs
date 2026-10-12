import {allocateSequentialV3} from './sequential-allocation-v3.mjs';
import {executeVerifiedEnvelope} from './worker-verification-gate.mjs';
import {inspectPublicCheckCoverage,runWorkerPublicChecks} from './public-check-registry.mjs';
import {sequentialEnvelopeV3 as sequentialEnvelope} from './sequential-envelope-v3.mjs';
import {validateRecursiveInput} from './recursive-task-tests.mjs';

// Reuse the existing pure envelope validator, not its CLI or paid runner.
// Registry/runCheck/revision callbacks are controller-owned, never worker output.
export async function runBoundedVerifiedWorkflowV3({input, profiles, decide, allPaths, registry,
  execute, runCheck, getArtifactRevision, record=async()=>{}, policy, maxConcurrency=2}) {
  input = validateRecursiveInput(input);
  if ([decide,execute,runCheck,getArtifactRevision,record].some(f=>typeof f!=='function')
    || !Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1
    || !Array.isArray(allPaths) || !allPaths.length || new Set(allPaths).size!==allPaths.length
    || allPaths.some(p=>typeof p!=='string'||p.startsWith('/')||p.split('/').some(x=>!x||x==='.'||x==='..'))
    || input.obligations.some(o=>o.write_scope.some(p=>!allPaths.includes(p)))) {
    throw Object.assign(Error('INVALID_WORKFLOW_CONFIGURATION'),{code:'INVALID_WORKFLOW_CONFIGURATION'});
  }
  const coverage = inspectPublicCheckCoverage({testIds:input.tests.map(t=>t.id),registry});
  if (coverage.status !== 'ready') {
    const blocked = {status:'blocked',code:'PUBLIC_CHECK_MAPPING_MISSING',missing_test_ids:coverage.missing_test_ids,
      planning_started:false,execution_started:false};
    await record({event:'workflow_preflight_blocked',...blocked});
    return blocked;
  }
  const plan = await allocateSequentialV3({input,profiles,decide,record,policy});
  const envelope = sequentialEnvelope({input,plan,allPaths,profiles});
  const execution = await executeVerifiedEnvelope({envelope,execute,getArtifactRevision,record,maxConcurrency,
    verify:(task,{expectedArtifactRevision})=>runWorkerPublicChecks({task,registry,artifactRevision:expectedArtifactRevision,runCheck,record})});
  return {status:execution.status,plan,envelope,execution,planning_started:true,execution_started:true,
    product_success:null,independent_grade:'not_run'};
}
