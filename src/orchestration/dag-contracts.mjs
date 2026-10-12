// Controller-owned, offline contract checks. Neither a valid plan nor complete
// public mapping certifies execution, assertion adequacy, or filesystem isolation.
const PLAN_KEYS = ['schema_version', 'goal_revision', 'graph_revision', 'requirement_ids', 'worker_limit',
  'max_concurrency', 'workers', 'tasks', 'artifacts', 'checks', 'unknown_relationships'];
const TASK_KEYS = ['id', 'kind', 'parent_id', 'requirement_ids', 'input_artifact_ids', 'output_artifact_ids',
  'check_ids', 'worker_id', 'read_scope', 'write_scope', 'duration'];
const CHECK_KEYS = ['id', 'version', 'phase', 'artifact_ids', 'requirement_ids', 'runner_ref', 'argv',
  'cwd', 'environment_ref', 'source_ref'];
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function fail(code, path, detail) {
  throw Object.assign(new Error(`${code}: ${path}${detail ? ` (${detail})` : ''}`), {code, path});
}

function object(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('DAG_INVALID_OBJECT', path);
  const own = Reflect.ownKeys(value);
  if (own.some(key => typeof key !== 'string' || !keys.includes(key))
    || keys.some(key => !Object.hasOwn(value, key))) fail('DAG_INVALID_FIELDS', path);
  for (const key of own) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('DAG_INVALID_FIELDS', path);
  }
}

function nonempty(value, path) {
  if (typeof value !== 'string' || value.trim() !== value || !value.length || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail('DAG_INVALID_STRING', path);
  }
}

function identifier(value, path) {
  nonempty(value, path);
  if (!ID_PATTERN.test(value)) fail('DAG_INVALID_ID', path);
}

function array(value, path, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum) fail('DAG_INVALID_ARRAY', path);
  if (Reflect.ownKeys(value).length !== value.length + 1) fail('DAG_INVALID_ARRAY', path);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('DAG_INVALID_ARRAY', path);
  }
}

function list(value, path, validator = identifier, minimum = 0) {
  array(value, path, minimum);
  for (const [index, entry] of value.entries()) validator(entry, `${path}[${index}]`);
  if (new Set(value).size !== value.length) fail('DAG_DUPLICATE_VALUE', path);
}

function relativePath(value, path) {
  nonempty(value, path);
  const segments = value.split('/');
  // No absolute, dot, URL/drive, encoded, glob, or home aliases. Filesystem
  // symlinks and case-insensitive aliases require enforcement by the adapter.
  if (value.normalize('NFC') !== value || /[\\:%~*?\[\]{}#]/u.test(value)
    || segments.some(segment => !segment || segment === '.' || segment === '..' || segment.trim() !== segment)) {
    fail('DAG_INVALID_PATH', path);
  }
}

function integer(value, path, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail('DAG_INVALID_INTEGER', path);
}

function duration(value, path) {
  object(value, ['basis', 'estimate_ms', 'sample_count', 'source_refs'], path);
  if (!['unknown', 'estimate', 'observed'].includes(value.basis)) fail('DAG_INVALID_DURATION', path);
  integer(value.sample_count, `${path}.sample_count`, 0);
  list(value.source_refs, `${path}.source_refs`, nonempty);
  if (value.basis === 'unknown') {
    if (value.estimate_ms !== null || value.sample_count !== 0) fail('DAG_INVALID_DURATION', path);
  } else if (!Number.isFinite(value.estimate_ms) || value.estimate_ms < 0) {
    fail('DAG_INVALID_DURATION', path);
  }
  if (value.basis === 'observed' && (!value.sample_count || !value.source_refs.length)) fail('DAG_INVALID_DURATION', path);
}

function checkRecord(check, path, publicRecord = false) {
  object(check, publicRecord ? [...CHECK_KEYS, 'test_ids', 'origin'] : CHECK_KEYS, path);
  identifier(check.id, `${path}.id`);
  nonempty(check.version, `${path}.version`);
  if (!['contract', 'local', 'integration'].includes(check.phase)) fail('DAG_INVALID_CHECK_PHASE', path);
  list(check.artifact_ids, `${path}.artifact_ids`);
  list(check.requirement_ids, `${path}.requirement_ids`);
  nonempty(check.runner_ref, `${path}.runner_ref`);
  array(check.argv, `${path}.argv`, 1);
  check.argv.forEach((argument, index) => nonempty(argument, `${path}.argv[${index}]`));
  relativePath(check.cwd, `${path}.cwd`);
  nonempty(check.environment_ref, `${path}.environment_ref`);
  relativePath(check.source_ref, `${path}.source_ref`);
  if (publicRecord) {
    if (check.origin !== 'public_specification') fail('DAG_INVALID_CHECK_ORIGIN', path);
    list(check.test_ids, `${path}.test_ids`, identifier, 1);
  }
}

function indexRecords(records, path, validator) {
  array(records, path);
  const result = new Map();
  records.forEach((record, index) => {
    validator(record, `${path}[${index}]`);
    if (result.has(record.id)) fail('DAG_DUPLICATE_ID', `${path}[${index}].id`);
    result.set(record.id, record);
  });
  return result;
}

function references(ids, known, path) {
  for (const id of ids) if (!known.has(id)) fail('DAG_UNKNOWN_REFERENCE', path, id);
}

/** Validate the JSON plan, preserving task order and returning an independent clone.
 * Semantic artifact cycles are rejected by analyzeDag, not inferred from parents.
 */
export function validateDagPlan(plan) {
  object(plan, PLAN_KEYS, 'plan');
  if (plan.schema_version !== 'artifact-dag/v1') fail('DAG_SCHEMA_VERSION', 'plan.schema_version');
  nonempty(plan.goal_revision, 'plan.goal_revision');
  nonempty(plan.graph_revision, 'plan.graph_revision');
  list(plan.requirement_ids, 'plan.requirement_ids', identifier, 1);
  integer(plan.worker_limit, 'plan.worker_limit', 1, 30);
  integer(plan.max_concurrency, 'plan.max_concurrency', 1, plan.worker_limit);

  const workers = indexRecords(plan.workers, 'plan.workers', (worker, path) => {
    object(worker, ['id', 'profile_id'], path);
    identifier(worker.id, `${path}.id`);
    identifier(worker.profile_id, `${path}.profile_id`);
  });
  if (!workers.size || workers.size > plan.worker_limit) fail('DAG_WORKER_LIMIT', 'plan.workers');
  const tasks = indexRecords(plan.tasks, 'plan.tasks', (task, path) => {
    object(task, TASK_KEYS, path);
    identifier(task.id, `${path}.id`);
    if (!['implementation', 'verification'].includes(task.kind)) fail('DAG_INVALID_TASK_KIND', path);
    if (task.parent_id !== null) identifier(task.parent_id, `${path}.parent_id`);
    for (const field of ['requirement_ids', 'input_artifact_ids', 'output_artifact_ids', 'check_ids']) {
      list(task[field], `${path}.${field}`, identifier, field === 'check_ids' ? 1 : 0);
    }
    if (task.worker_id !== null) identifier(task.worker_id, `${path}.worker_id`);
    if (task.kind === 'implementation' && task.worker_id === null) fail('DAG_IMPLEMENTATION_WORKER_REQUIRED', path);
    list(task.read_scope, `${path}.read_scope`, relativePath);
    list(task.write_scope, `${path}.write_scope`, relativePath);
    duration(task.duration, `${path}.duration`);
  });
  if (!tasks.size) fail('DAG_INVALID_ARRAY', 'plan.tasks');
  const artifacts = indexRecords(plan.artifacts, 'plan.artifacts', (artifact, path) => {
    object(artifact, ['id', 'producer_task_id'], path);
    identifier(artifact.id, `${path}.id`);
    identifier(artifact.producer_task_id, `${path}.producer_task_id`);
  });
  const checks = indexRecords(plan.checks, 'plan.checks', checkRecord);
  const requirements = new Set(plan.requirement_ids);
  const requirementOwners = new Map();
  const outputOwners = new Map();
  const checkOwners = new Map();
  // Distinguish execution identities even when a worker is reused by many tasks.
  for (const id of tasks.keys()) if (workers.has(id) || artifacts.has(id)) fail('DAG_IDENTITY_COLLISION', 'plan.tasks', id);
  for (const id of artifacts.keys()) if (workers.has(id)) fail('DAG_IDENTITY_COLLISION', 'plan.artifacts', id);

  for (const task of tasks.values()) {
    const path = `task:${task.id}`;
    if (task.worker_id !== null) references([task.worker_id], workers, `${path}.worker_id`);
    if (task.parent_id !== null) {
      references([task.parent_id], tasks, `${path}.parent_id`);
      if (task.parent_id === task.id) fail('DAG_PARENT_CYCLE', `${path}.parent_id`);
    }
    references(task.requirement_ids, requirements, `${path}.requirement_ids`);
    references(task.input_artifact_ids, artifacts, `${path}.input_artifact_ids`);
    references(task.output_artifact_ids, artifacts, `${path}.output_artifact_ids`);
    references(task.check_ids, checks, `${path}.check_ids`);
    if (task.kind === 'implementation') for (const id of task.requirement_ids) {
      if (requirementOwners.has(id)) fail('DAG_REQUIREMENT_OWNERSHIP', path, id);
      requirementOwners.set(id, task.id);
    }
    for (const id of task.output_artifact_ids) {
      if (outputOwners.has(id) || artifacts.get(id).producer_task_id !== task.id) fail('DAG_ARTIFACT_OWNERSHIP', path, id);
      outputOwners.set(id, task.id);
    }
    for (const id of task.input_artifact_ids) {
      if (artifacts.get(id).producer_task_id === task.id) fail('DAG_SELF_ARTIFACT_INPUT', path, id);
    }
    const available = new Set([...task.input_artifact_ids, ...task.output_artifact_ids]);
    const checkedRequirements = new Set();
    const checkedArtifacts = new Set();
    for (const id of task.check_ids) {
      if (checkOwners.has(id)) fail('DAG_CHECK_ASSIGNMENT', path, id);
      checkOwners.set(id, task.id);
      const check = checks.get(id);
      references(check.artifact_ids, artifacts, `check:${id}.artifact_ids`);
      references(check.requirement_ids, requirements, `check:${id}.requirement_ids`);
      if (check.phase === 'integration' && task.kind !== 'verification') fail('DAG_INTEGRATION_TASK_REQUIRED', path, id);
      for (const artifactId of check.artifact_ids) {
        if (!available.has(artifactId)) fail('DAG_CHECK_ARTIFACT_UNAVAILABLE', path, artifactId);
        checkedArtifacts.add(artifactId);
      }
      for (const requirementId of check.requirement_ids) {
        if (!task.requirement_ids.includes(requirementId)) fail('DAG_CHECK_REQUIREMENT_OUTSIDE_TASK', path, requirementId);
        checkedRequirements.add(requirementId);
      }
    }
    for (const id of task.requirement_ids) if (!checkedRequirements.has(id)) fail('DAG_REQUIREMENT_CHECK_MISSING', path, id);
    for (const id of task.output_artifact_ids) if (!checkedArtifacts.has(id)) fail('DAG_ARTIFACT_CHECK_MISSING', path, id);
  }
  for (const id of requirements) if (!requirementOwners.has(id)) fail('DAG_REQUIREMENT_OWNERSHIP', 'plan.requirement_ids', id);
  for (const artifact of artifacts.values()) {
    references([artifact.producer_task_id], tasks, `artifact:${artifact.id}.producer_task_id`);
    if (!outputOwners.has(artifact.id)) fail('DAG_ARTIFACT_OWNERSHIP', 'plan.artifacts', artifact.id);
  }
  for (const id of checks.keys()) if (!checkOwners.has(id)) fail('DAG_CHECK_ASSIGNMENT', 'plan.checks', id);
  const parentResolved = new Set();
  for (const id of tasks.keys()) {
    const trail = new Set();
    let next = id;
    while (next !== null && !parentResolved.has(next)) {
      if (trail.has(next)) fail('DAG_PARENT_CYCLE', `task:${id}.parent_id`);
      trail.add(next);
      next = tasks.get(next).parent_id;
    }
    for (const taskId of trail) parentResolved.add(taskId);
  }
  array(plan.unknown_relationships, 'plan.unknown_relationships');
  const unknownPairs = new Set();
  plan.unknown_relationships.forEach((relation, index) => {
    const path = `plan.unknown_relationships[${index}]`;
    object(relation, ['task_ids', 'reason', 'evidence_refs'], path);
    list(relation.task_ids, `${path}.task_ids`, identifier, 2);
    if (relation.task_ids.length !== 2) fail('DAG_INVALID_UNKNOWN_RELATION', path);
    references(relation.task_ids, tasks, `${path}.task_ids`);
    nonempty(relation.reason, `${path}.reason`);
    list(relation.evidence_refs, `${path}.evidence_refs`, nonempty);
    const key = JSON.stringify([...relation.task_ids].sort());
    if (unknownPairs.has(key)) fail('DAG_DUPLICATE_UNKNOWN_RELATION', path);
    unknownPairs.add(key);
  });
  return structuredClone(plan);
}

/** Public clause coverage only. No command is executed, and mapped is not ready. */
export function publicCheckMapping(input, registry) {
  object(input, ['requirement_ids', 'test_ids'], 'input');
  list(input.requirement_ids, 'input.requirement_ids');
  list(input.test_ids, 'input.test_ids');
  if (!input.requirement_ids.length && !input.test_ids.length) fail('DAG_EMPTY_PUBLIC_MAPPING', 'input');
  const checks = indexRecords(registry, 'registry', (check, path) => checkRecord(check, path, true));
  const selected = [...checks.values()].filter(check => check.requirement_ids.some(id => input.requirement_ids.includes(id))
    || check.test_ids.some(id => input.test_ids.includes(id)));
  const missingRequirements = input.requirement_ids.filter(id => !selected.some(check => check.requirement_ids.includes(id)));
  const missingTests = input.test_ids.filter(id => !selected.some(check => check.test_ids.includes(id)));
  return structuredClone({
    status: missingRequirements.length || missingTests.length ? 'blocked' : 'mapped',
    mapping_only: true,
    missing_requirement_ids: missingRequirements,
    missing_test_ids: missingTests,
    checks: selected,
  });
}
