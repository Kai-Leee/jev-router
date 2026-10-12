const fail = code => {throw Object.assign(Error(code), {code});};
const text = x => typeof x === 'string' && x.trim().length > 0;

// Registry and runner are controller-owned. Never accept worker-supplied pass flags
// as executable evidence. A mapping is not proof that its assertion is adequate.
export function inspectPublicCheckCoverage({testIds, registry}) {
  if (!Array.isArray(testIds) || !testIds.length || testIds.some(id => !text(id)) || new Set(testIds).size !== testIds.length
    || !Array.isArray(registry)) fail('INVALID_PUBLIC_CHECK_REGISTRY');
  const checks = new Map();
  for (const check of registry) {
    if (!check || !text(check.id) || checks.has(check.id) || check.origin !== 'public_specification'
      || !text(check.source_ref) || !text(check.runner_ref) || !Array.isArray(check.test_ids) || !check.test_ids.length
      || check.test_ids.some(id => !text(id)) || new Set(check.test_ids).size !== check.test_ids.length) fail('INVALID_PUBLIC_CHECK_REGISTRY');
    checks.set(check.id, check);
  }
  const selected = [...checks.values()].filter(c => c.test_ids.some(id => testIds.includes(id)));
  const missing = testIds.filter(id => !selected.some(c => c.test_ids.includes(id)));
  return {status: missing.length ? 'blocked' : 'ready', missing_test_ids: missing, checks: selected};
}

export async function runWorkerPublicChecks({task, registry, artifactRevision, runCheck, record = async () => {}}) {
  if (!text(artifactRevision) || typeof runCheck !== 'function' || typeof record !== 'function') fail('INVALID_PUBLIC_CHECK_RUNNER');
  const coverage = inspectPublicCheckCoverage({testIds: task.test_ids, registry});
  if (coverage.status !== 'ready') {
    await record({event:'public_check_mapping_missing',task_id:task.id,test_ids:coverage.missing_test_ids});
    fail('PUBLIC_CHECK_MAPPING_MISSING');
  }
  const runs = [];
  for (const check of coverage.checks) {
    await record({event:'public_check_started',task_id:task.id,check_id:check.id,artifact_revision:artifactRevision});
    const result = await runCheck(structuredClone(check), {task, artifactRevision});
    const passed = result?.exit_code === 0 && result.executed === true && result.outcome_uncertain === false
      && result.skipped === 0 && Number.isSafeInteger(result.assertions) && result.assertions > 0;
    const run = {check_id:check.id,test_ids:check.test_ids,status:passed?'passed':'failed',result};
    runs.push(run);
    await record({event:'public_check_finished',task_id:task.id,...run,artifact_revision:artifactRevision});
    if (!passed) throw Object.assign(Error('PUBLIC_BOUNDARY_CHECK_FAILED'), {code:'PUBLIC_BOUNDARY_CHECK_FAILED',outcomeUncertain:result?.outcome_uncertain === true});
  }
  return {artifact_revision:artifactRevision, runs, evidence:task.test_ids.map(test_id => ({test_id,status:'passed',executed:true,exit_code:0,
    check_id:runs.filter(r=>r.test_ids.includes(test_id)).map(r=>r.check_id).join('+'),artifact_revision:artifactRevision}))};
}
