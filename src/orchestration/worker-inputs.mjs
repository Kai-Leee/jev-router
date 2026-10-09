import {createHash} from 'node:crypto';

const fail = code => { throw new Error(code); };
const json = value => JSON.stringify(value);
const bytes = value => Buffer.byteLength(json(value), 'utf8');
const hash = value => createHash('sha256').update(json(value)).digest('hex');
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every(x => b.includes(x));
function pathCheck(path) {
  if (typeof path !== 'string' || !path || path.length > 240 || !/^[-a-zA-Z0-9_./]+$/.test(path) || path.startsWith('/') || path.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.git'))) fail('INVALID_ARTIFACT_PATH');
}
function checkPlan(plan) {
  if (!plan || !Array.isArray(plan.tasks) || !plan.tasks.length || typeof plan.integrationInstructions !== 'string' || !plan.integrationInstructions.trim()) fail('INVALID_PLAN');
  const byId = new Map(), owners = new Map();
  for (const task of plan.tasks) {
    if (!task || typeof task.id !== 'string' || !task.id || byId.has(task.id) || typeof task.description !== 'string' || !task.description.trim() || !Array.isArray(task.paths) || !task.paths.length || !Array.isArray(task.dependsOn)) fail('INVALID_TASK');
    byId.set(task.id, task);
    for (const path of task.paths) {
      pathCheck(path);
      if ([...owners.keys()].some(p => p === path || p.startsWith(path + '/') || path.startsWith(p + '/'))) fail('OVERLAPPING_OWNERSHIP');
      owners.set(path, task.id);
    }
  }
  for (const task of plan.tasks) if (new Set(task.dependsOn).size !== task.dependsOn.length || task.dependsOn.some(id => !byId.has(id) || id === task.id)) fail('INVALID_DEPENDENCY');
  const visited = new Set(), active = new Set();
  function visit(id) {
    if (active.has(id)) fail('CYCLIC_PLAN');
    if (visited.has(id)) return;
    active.add(id);
    for (const dependency of byId.get(id).dependsOn) visit(dependency);
    active.delete(id); visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
  return {byId, owners};
}

/** Pure materialization: manifest is local provenance, never part of the prompt.
 * Full original brief remains once: no verified requirement-to-task mapping exists.
 * A dependency declaration is a context contract, not proof of semantic sufficiency.
 */
export function buildWorkerInput({plan, task, brief, completedFiles = [], profile, mode, requirements, executionMode}) {
  if (!['deduplicated', 'projected'].includes(mode)) fail('INVALID_INPUT_MODE');
  if (requirements !== undefined) fail('UNVERIFIED_REQUIREMENT_MAPPING');
  if (brief === undefined || brief === null || typeof profile?.model !== 'string' || !profile.model || typeof profile?.effort !== 'string' || !profile.effort) fail('MISSING_WORKER_INPUT');
  const {byId, owners} = checkPlan(plan);
  if (!task || !Array.isArray(task.paths) || !Array.isArray(task.dependsOn)) fail('INVALID_TASK');
  const canonical = byId.get(task.id);
  if(executionMode!==undefined&&!['single','split'].includes(executionMode))fail('INVALID_EXECUTION_MODE');
  const single = (executionMode==='single'||(!canonical&&executionMode!=='split')) && task.id === 'single' && typeof task.description === 'string' && sameSet(task.paths, [...owners.keys()]) && task.dependsOn.length === 0;
  if (!single && (!canonical || json(task) !== json(canonical))) fail('TASK_PLAN_MISMATCH');
  const dependencyIds = new Set();
  function include(id) {
    if (dependencyIds.has(id)) return;
    dependencyIds.add(id);
    for (const parent of byId.get(id).dependsOn) include(parent);
  }
  for (const id of task.dependsOn) include(id);
  const expectedPaths = plan.tasks.filter(t => dependencyIds.has(t.id)).flatMap(t => t.paths);
  if (!Array.isArray(completedFiles)) fail('INVALID_COMPLETED_FILES');
  const seen = new Set();
  for (const file of completedFiles) {
    if (!file || typeof file.content !== 'string') fail('INVALID_COMPLETED_FILE');
    pathCheck(file.path);
    if (seen.has(file.path) || !owners.has(file.path) || task.paths.includes(file.path)) fail('INVALID_COMPLETED_FILE');
    seen.add(file.path);
  }
  if (expectedPaths.some(path => !seen.has(path))) fail('MISSING_DEPENDENCY_FILE');
  const selected = completedFiles.filter(file => mode === 'deduplicated' || expectedPaths.includes(file.path));
  const excluded = completedFiles.filter(file => !selected.includes(file));
  const request = structuredClone({
    inputVersion: 'worker-input-v3', brief,
    ...(mode === 'deduplicated' || single ? {plan} : {integrationInstructions: plan.integrationInstructions}),
    task, model: profile.model, effort: profile.effort, completedFiles: selected,
    outputContract: {
      files: [{path: 'owned relative path', content: 'complete file contents'}],
      artifacts: task.paths, observed_checks: [], blockers: [],
      uncertainty: ['No tools available; checks are unexecuted.'],
      summary: 'Generated files; no checks executed.'
    }
  });
  return {request, manifest: {
    version: 'worker-input-manifest-v1', inputVersion: request.inputVersion, mode, taskId: task.id,
    single, requirementProjection: 'full-original-brief-once-no-verified-mapping',
    dependencyIds: [...dependencyIds], expectedDependencyPaths: expectedPaths,
    selectedPaths: selected.map(f => f.path), excludedPaths: excluded.map(f => f.path),
    sourceHashes: {encoding: 'sha256-of-JSON.stringify-utf8', plan: hash(plan), brief: hash(brief), task: hash(task), completedFiles: hash(completedFiles), profile: hash(profile)},
    requestSha256: hash(request),
    bytes: {encoding: 'UTF-8 JSON.stringify, not provider tokens', request: bytes(request), brief: bytes(brief), plan: bytes(plan), completedFiles: bytes(completedFiles), selectedCompletedFiles: bytes(selected), excludedCompletedFiles: bytes(excluded)},
    limitations: ['Declared dependency completeness is checked; semantic dependency correctness is unverified.', 'Source hashes and byte measurements do not prove provider caching, token savings, or quality.']
  }};
}
