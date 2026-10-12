import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateDagPlan, publicCheckMapping} from '../src/orchestration/dag-contracts.mjs';

const fixture = JSON.parse(readFileSync(new URL('../examples/dag/contract-fixture.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('../docs/orchestration/contracts/artifact-dag.v1.schema.json', import.meta.url), 'utf8'));
const plan = () => structuredClone(fixture);
function reject(change, code) {
  const candidate = plan();
  change(candidate);
  assert.throws(() => validateDagPlan(candidate), error => {
    assert.equal(error.code, code);
    assert.equal(typeof error.path, 'string');
    return true;
  });
}
const registry = () => fixture.checks.map((check, index) => ({
  ...structuredClone(check), origin: 'public_specification', test_ids: [`test-${index + 1}`],
}));

test('frozen fixture validates and callers receive an independent deep clone', () => {
  const source = plan();
  const before = JSON.stringify(source);
  const validated = validateDagPlan(source);
  assert.deepEqual(validated, source);
  assert.notEqual(validated, source);
  validated.tasks[0].duration.source_refs.push('new-ref');
  validated.checks[0].argv[0] = 'changed';
  validated.unknown_relationships.push({task_ids: ['build-core', 'build-ui'], reason: 'new', evidence_refs: []});
  assert.equal(JSON.stringify(source), before);
});

test('published schema closes every record and matches the frozen fixture keys', () => {
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  const records = [[schema, fixture], [schema.$defs.task, fixture.tasks[0]], [schema.$defs.worker, fixture.workers[0]],
    [schema.$defs.artifact, fixture.artifacts[0]], [schema.$defs.check, fixture.checks[0]],
    [schema.$defs.duration, fixture.tasks[0].duration],
    [schema.$defs.unknownRelationship, {task_ids: [], reason: '', evidence_refs: []}]];
  for (const [definition, value] of records) {
    assert.equal(definition.additionalProperties, false);
    assert.deepEqual([...definition.required].sort(), Object.keys(value).sort());
    assert.deepEqual(Object.keys(definition.properties).sort(), Object.keys(value).sort());
  }
  assert.equal(schema.properties.tasks.maxItems, undefined);
  assert.equal(schema.properties.workers.maxItems, 30);
});

test('fixture commands execute real assertions and reject defective artifacts in an isolated temporary workspace', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dag-contract-checks-'));
  const output = join(directory, 'examples/dag/output');
  mkdirSync(output, {recursive: true});
  const write = (core, ui) => {
    writeFileSync(join(output, 'core.json'), JSON.stringify(core));
    writeFileSync(join(output, 'ui.json'), JSON.stringify(ui));
  };
  const run = () => fixture.checks.map(check => {
    const result = spawnSync(check.argv[0], check.argv.slice(1), {cwd: join(directory, check.cwd), encoding: 'utf8', timeout: 5000});
    assert.ifError(result.error);
    return result.status;
  });
  try {
    write({value: 7}, {label: 'value:7'});
    assert.deepEqual(run(), [0, 0, 0]);
    write({value: 8}, {label: 'value:7'});
    assert.deepEqual(run(), [1, 0, 1]);
    write({value: 7}, {label: 'value:8'});
    assert.deepEqual(run(), [0, 1, 1]);
    write({value: 7}, {label: 'value:7'});
    rmSync(join(output, 'core.json'));
    assert.deepEqual(run(), [1, 0, 1]);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});

test('unrecognized fields and missing fields never silently change the execution contract', () => {
  const paths = [p => p, p => p.tasks[0], p => p.workers[0], p => p.artifacts[0], p => p.checks[0], p => p.tasks[0].duration];
  for (const select of paths) {
    reject(p => {select(p).depends_on = ['build-core'];}, 'DAG_INVALID_FIELDS');
    for (const key of Object.keys(select(plan()))) reject(p => {delete select(p)[key];}, 'DAG_INVALID_FIELDS');
  }
  reject(p => {p.schema_version = 'artifact-dag/v2';}, 'DAG_SCHEMA_VERSION');
});

test('strict JSON records reject sparse arrays, hidden metadata and accessor mutation', () => {
  reject(p => {delete p.workers[1];}, 'DAG_INVALID_ARRAY');
  reject(p => {p.tasks.extra = 'ignored-by-JSON';}, 'DAG_INVALID_ARRAY');
  reject(p => {Object.defineProperty(p, 'graph_revision', {value: 'hidden', enumerable: false});}, 'DAG_INVALID_FIELDS');
  let called = 0;
  const p = plan();
  Object.defineProperty(p, 'goal_revision', {get: () => {called++; return 'mutated';}, enumerable: true});
  assert.throws(() => validateDagPlan(p), {code: 'DAG_INVALID_FIELDS'});
  assert.equal(called, 0);
});

test('worker bound is independent of unlimited task count and verification nodes', () => {
  const p = plan();
  for (let index = 0; index < 40; index++) {
    const task = structuredClone(p.tasks[0]);
    const check = structuredClone(p.checks[0]);
    task.id = `extra-task-${index}`;
    task.requirement_ids = [];
    task.output_artifact_ids = [`extra-artifact-${index}`];
    task.check_ids = [`extra-check-${index}`];
    check.id = task.check_ids[0];
    check.artifact_ids = [...task.output_artifact_ids];
    check.requirement_ids = [];
    p.tasks.push(task);
    p.artifacts.push({id: task.output_artifact_ids[0], producer_task_id: task.id});
    p.checks.push(check);
  }
  const result = validateDagPlan(p);
  assert.equal(result.tasks.length, 43);
  assert.equal(result.workers.length, 2);
  assert.equal(result.tasks[2].worker_id, null);
  p.worker_limit = 2;
  assert.doesNotThrow(() => validateDagPlan(p));
});

test('worker pool 30 and concurrency 30 allowed, neither permits worker 31', () => {
  const p = plan();
  while (p.workers.length < 30) p.workers.push({id: `extra-worker-${p.workers.length}`, profile_id: 'fixture-local'});
  p.max_concurrency = 30;
  assert.doesNotThrow(() => validateDagPlan(p));
  p.workers.push({id: 'worker-31', profile_id: 'fixture-local'});
  assert.throws(() => validateDagPlan(p), {code: 'DAG_WORKER_LIMIT'});
  for (const value of [0, 31, 1.5, NaN, Infinity, '30']) reject(v => {v.worker_limit = value;}, 'DAG_INVALID_INTEGER');
  for (const value of [0, 31, 1.5, NaN, Infinity, '2']) reject(v => {v.max_concurrency = value;}, 'DAG_INVALID_INTEGER');
  reject(v => {v.worker_limit = 1; v.max_concurrency = 2;}, 'DAG_INVALID_INTEGER');
  reject(v => {v.worker_limit = 1; v.max_concurrency = 1;}, 'DAG_WORKER_LIMIT');
  reject(v => {v.workers = [];}, 'DAG_WORKER_LIMIT');
});

test('identifiers distinguish reused workers from tasks and artifacts', () => {
  reject(p => {p.tasks[0].id = p.workers[0].id;}, 'DAG_IDENTITY_COLLISION');
  reject(p => {p.artifacts[0].id = p.workers[0].id;}, 'DAG_IDENTITY_COLLISION');
  reject(p => {p.tasks[0].id = p.artifacts[0].id;}, 'DAG_IDENTITY_COLLISION');
  reject(p => {p.tasks[0].worker_id = null;}, 'DAG_IMPLEMENTATION_WORKER_REQUIRED');
  reject(p => {p.tasks[0].worker_id = 'absent-worker';}, 'DAG_UNKNOWN_REFERENCE');
  reject(p => {p.tasks[0].id = 'invalid task';}, 'DAG_INVALID_ID');
  reject(p => {p.tasks[0].id = '__proto__';}, 'DAG_INVALID_ID');
});

test('each goal requirement has exactly one implementation owner, verification may repeat it', () => {
  assert.deepEqual(validateDagPlan(fixture).tasks[2].requirement_ids, fixture.requirement_ids);
  reject(p => {p.requirement_ids.push('unowned');}, 'DAG_REQUIREMENT_OWNERSHIP');
  reject(p => {p.tasks[1].requirement_ids.push('requirement-core');}, 'DAG_REQUIREMENT_OWNERSHIP');
  reject(p => {p.tasks[0].requirement_ids.push('unknown-requirement');}, 'DAG_UNKNOWN_REFERENCE');
  reject(p => {p.tasks[0].requirement_ids = []; p.checks[0].requirement_ids = [];}, 'DAG_REQUIREMENT_OWNERSHIP');
});

test('every task requirement and output artifact is covered by a producer-assigned check in v1', () => {
  reject(p => {p.checks[0].requirement_ids = [];}, 'DAG_REQUIREMENT_CHECK_MISSING');
  reject(p => {p.checks[0].artifact_ids = [];}, 'DAG_ARTIFACT_CHECK_MISSING');
  reject(p => {p.checks[0].requirement_ids.push('requirement-ui');}, 'DAG_CHECK_REQUIREMENT_OUTSIDE_TASK');
  reject(p => {p.tasks[2].requirement_ids = [];}, 'DAG_CHECK_REQUIREMENT_OUTSIDE_TASK');
});

test('artifact producers and outputs agree exactly once, with no self inputs', () => {
  reject(p => {p.artifacts[0].producer_task_id = 'build-ui';}, 'DAG_ARTIFACT_OWNERSHIP');
  reject(p => {p.tasks[1].output_artifact_ids.push('artifact-core');}, 'DAG_ARTIFACT_OWNERSHIP');
  reject(p => {p.artifacts.push({id: 'orphan-artifact', producer_task_id: 'build-core'});}, 'DAG_ARTIFACT_OWNERSHIP');
  reject(p => {p.artifacts.push({id: 'dangling-artifact', producer_task_id: 'absent-task'});}, 'DAG_UNKNOWN_REFERENCE');
  reject(p => {p.tasks[0].input_artifact_ids.push('artifact-core');}, 'DAG_SELF_ARTIFACT_INPUT');
  reject(p => {p.tasks[0].input_artifact_ids.push('absent-artifact');}, 'DAG_UNKNOWN_REFERENCE');
  reject(p => {p.tasks[0].output_artifact_ids.push('absent-artifact');}, 'DAG_UNKNOWN_REFERENCE');
});

test('checks have one task owner and cannot require future or unlisted artifacts', () => {
  reject(p => {p.tasks[1].check_ids.push('check-core');}, 'DAG_CHECK_ASSIGNMENT');
  reject(p => {p.checks.push({...structuredClone(p.checks[0]), id: 'unassigned-check'});}, 'DAG_CHECK_ASSIGNMENT');
  reject(p => {p.tasks[0].check_ids.push('absent-check');}, 'DAG_UNKNOWN_REFERENCE');
  reject(p => {p.tasks[0].check_ids = [];}, 'DAG_INVALID_ARRAY');
  reject(p => {p.checks[0].artifact_ids.push('artifact-ui');}, 'DAG_CHECK_ARTIFACT_UNAVAILABLE');
  reject(p => {p.checks[0].artifact_ids.push('absent-artifact');}, 'DAG_UNKNOWN_REFERENCE');
  reject(p => {p.checks[0].requirement_ids.push('absent-requirement');}, 'DAG_UNKNOWN_REFERENCE');
  reject(p => {p.checks[0].phase = 'integration';}, 'DAG_INTEGRATION_TASK_REQUIRED');
});

test('duplicate collections, references and declarations reject instead of silently deduplicating', () => {
  for (const key of ['workers', 'tasks', 'artifacts', 'checks']) reject(p => {p[key].push(structuredClone(p[key][0]));}, 'DAG_DUPLICATE_ID');
  reject(p => {p.requirement_ids.push(p.requirement_ids[0]);}, 'DAG_DUPLICATE_VALUE');
  for (const key of ['requirement_ids', 'output_artifact_ids', 'check_ids', 'write_scope']) {
    reject(p => {p.tasks[0][key].push(p.tasks[0][key][0]);}, 'DAG_DUPLICATE_VALUE');
  }
  for (const key of ['artifact_ids', 'requirement_ids']) reject(p => {p.checks[0][key].push(p.checks[0][key][0]);}, 'DAG_DUPLICATE_VALUE');
});

test('parent hierarchy is organizational and has no implicit artifact dependency', () => {
  const p = plan();
  p.tasks[1].parent_id = 'build-core';
  const result = validateDagPlan(p);
  assert.deepEqual(result.tasks[1].input_artifact_ids, []);
  reject(v => {v.tasks[1].parent_id = 'absent-parent';}, 'DAG_UNKNOWN_REFERENCE');
  reject(v => {v.tasks[0].parent_id = 'build-core';}, 'DAG_PARENT_CYCLE');
  reject(v => {v.tasks[0].parent_id = 'build-ui'; v.tasks[1].parent_id = 'build-core';}, 'DAG_PARENT_CYCLE');
});

test('unknown relationships remain explicit evidence-bearing records and preserve unrelated branches', () => {
  const p = plan();
  p.unknown_relationships = [{task_ids: ['build-core', 'build-ui'], reason: 'Input relationship has not been established.', evidence_refs: []}];
  const result = validateDagPlan(p);
  assert.deepEqual(result.unknown_relationships, p.unknown_relationships);
  assert.equal(result.tasks.length, 3);
  assert.deepEqual(result.tasks[2].input_artifact_ids, ['artifact-core', 'artifact-ui']);
  const relation = () => ({task_ids: ['build-core', 'build-ui'], reason: 'Unresolved source relation.', evidence_refs: ['public-source-clause-1']});
  reject(v => {delete v.unknown_relationships;}, 'DAG_INVALID_FIELDS');
  reject(v => {v.unknown_relationships = [relation(), {...relation(), task_ids: ['build-ui', 'build-core']}];}, 'DAG_DUPLICATE_UNKNOWN_RELATION');
  reject(v => {v.unknown_relationships = [{...relation(), task_ids: ['build-core', 'build-core']}];}, 'DAG_DUPLICATE_VALUE');
  reject(v => {v.unknown_relationships = [{...relation(), task_ids: ['build-core', 'missing']}];}, 'DAG_UNKNOWN_REFERENCE');
  reject(v => {v.unknown_relationships = [{...relation(), task_ids: ['build-core', 'build-ui', 'verify-integration']}];}, 'DAG_INVALID_UNKNOWN_RELATION');
  reject(v => {v.unknown_relationships = [{...relation(), reason: ''}];}, 'DAG_INVALID_STRING');
  reject(v => {v.unknown_relationships = [{...relation(), independently_safe: true}];}, 'DAG_INVALID_FIELDS');
});

test('all scope and check paths reject absolute, traversal, empty, encoded, glob and URL aliases', () => {
  const invalid = ['/tmp/work', '.', '..', 'src/./a', 'src/../a', 'src//a', 'src/', 'src\\a',
    'C:/repo', '~/repo', 'file:///repo', 'src/%2e%2e/a', 'src/*.mjs', 'src/[ab].js', 'src/{a,b}',
    'src/a#fragment', 'src/a?query', 'src/ a', 'src/a /b', 'e\u0301/file'];
  const paths = [(p, value) => {p.tasks[0].read_scope = [value];}, (p, value) => {p.tasks[0].write_scope = [value];},
    (p, value) => {p.checks[0].cwd = value;}, (p, value) => {p.checks[0].source_ref = value;}];
  for (const value of invalid) for (const setter of paths) reject(p => setter(p, value), 'DAG_INVALID_PATH');
  // Exercise the schema's regex separately; NFC is explicitly a semantic rule.
  const schemaPath = new RegExp(schema.$defs.path.pattern, 'u');
  for (const value of invalid.filter(value => value.normalize('NFC') === value)) assert.equal(schemaPath.test(value), false, value);
  for (const value of ['', ' ', 'src/\u0000file', 'src/\nfile']) for (const setter of paths) reject(p => setter(p, value), 'DAG_INVALID_STRING');
  const p = plan();
  p.tasks[0].read_scope = ['src/.hidden', '자료/단위 테스트.mjs', 'src/a-b_1.js'];
  for (const value of p.tasks[0].read_scope) assert.equal(schemaPath.test(value), true, value);
  assert.doesNotThrow(() => validateDagPlan(p));
});

test('check runner requires concrete command, environment, version and source metadata', () => {
  for (const key of ['runner_ref', 'environment_ref', 'version', 'source_ref', 'cwd']) {
    reject(p => {p.checks[0][key] = '';}, 'DAG_INVALID_STRING');
  }
  reject(p => {p.checks[0].argv = [];}, 'DAG_INVALID_ARRAY');
  reject(p => {p.checks[0].argv = 'node tests.js';}, 'DAG_INVALID_ARRAY');
  reject(p => {p.checks[0].argv = ['node', ''];}, 'DAG_INVALID_STRING');
  reject(p => {p.checks[0].phase = 'hidden';}, 'DAG_INVALID_CHECK_PHASE');
  const p = plan();
  p.checks[0].argv = ['node', '-e', 'assert.ok(true)', '-e'];
  assert.doesNotThrow(() => validateDagPlan(p)); // Repeated argv is not a duplicate ID.
});

test('unknown duration is null, observed duration needs actual sample provenance, estimates are finite', () => {
  const p = plan();
  p.tasks[0].duration = {basis: 'unknown', estimate_ms: null, sample_count: 0, source_refs: []};
  assert.equal(validateDagPlan(p).tasks[0].duration.estimate_ms, null);
  p.tasks[0].duration = {basis: 'observed', estimate_ms: 42, sample_count: 3, source_refs: ['offline-run-1']};
  assert.equal(validateDagPlan(p).tasks[0].duration.sample_count, 3);
  for (const value of [-1, Infinity, NaN, '30', null]) reject(v => {v.tasks[0].duration.estimate_ms = value;}, 'DAG_INVALID_DURATION');
  reject(v => {v.tasks[0].duration.basis = 'unknown';}, 'DAG_INVALID_DURATION');
  reject(v => {v.tasks[0].duration = {basis: 'unknown', estimate_ms: null, sample_count: 1, source_refs: []};}, 'DAG_INVALID_DURATION');
  reject(v => {v.tasks[0].duration = {basis: 'observed', estimate_ms: 1, sample_count: 0, source_refs: ['run']};}, 'DAG_INVALID_DURATION');
  reject(v => {v.tasks[0].duration = {basis: 'observed', estimate_ms: 1, sample_count: 1, source_refs: []};}, 'DAG_INVALID_DURATION');
});

test('public coverage reports mapped clauses without asserting readiness or running commands', () => {
  const source = registry();
  const input = {requirement_ids: [...fixture.requirement_ids], test_ids: ['test-1', 'test-2', 'test-3']};
  const result = publicCheckMapping(input, source);
  assert.equal(result.status, 'mapped');
  assert.equal(result.mapping_only, true);
  assert.deepEqual(result.missing_requirement_ids, []);
  assert.deepEqual(result.missing_test_ids, []);
  assert.equal(result.checks.length, 3);
  assert.equal(Object.hasOwn(result, 'ready'), false);
  result.checks[0].argv.push('modified');
  assert.notDeepEqual(source[0].argv, result.checks[0].argv);
  assert.deepEqual(input, {requirement_ids: [...fixture.requirement_ids], test_ids: ['test-1', 'test-2', 'test-3']});
});

test('public coverage reports exact missing requirements and tests including an empty registry', () => {
  const input = {requirement_ids: ['requirement-core', 'missing-requirement'], test_ids: ['test-1', 'missing-test']};
  const result = publicCheckMapping(input, registry());
  assert.equal(result.status, 'blocked');
  assert.equal(result.mapping_only, true);
  assert.deepEqual(result.missing_requirement_ids, ['missing-requirement']);
  assert.deepEqual(result.missing_test_ids, ['missing-test']);
  const empty = publicCheckMapping(input, []);
  assert.deepEqual(empty.missing_requirement_ids, input.requirement_ids);
  assert.deepEqual(empty.missing_test_ids, input.test_ids);
  assert.deepEqual(empty.checks, []);
});

test('many public descriptions may map to one suite and overlapping suites do not invent coverage', () => {
  const checks = registry();
  checks[0].test_ids.push('test-2');
  const result = publicCheckMapping({requirement_ids: [], test_ids: ['test-1', 'test-2']}, [checks[0]]);
  assert.equal(result.status, 'mapped');
  assert.equal(result.checks.length, 1);
  const overlap = publicCheckMapping({requirement_ids: [], test_ids: ['test-2', 'test-4']}, checks);
  assert.deepEqual(overlap.missing_test_ids, ['test-4']);
  assert.equal(overlap.checks.length, 2);
});

test('public mapping rejects hidden origins, metadata shortcuts, duplicate suites and empty demand', () => {
  const input = {requirement_ids: [], test_ids: ['test-1']};
  assert.throws(() => publicCheckMapping({requirement_ids: [], test_ids: []}, []), {code: 'DAG_EMPTY_PUBLIC_MAPPING'});
  assert.throws(() => publicCheckMapping({...input, force_ready: true}, []), {code: 'DAG_INVALID_FIELDS'});
  assert.throws(() => publicCheckMapping({requirement_ids: [], test_ids: ['test-1', 'test-1']}, []), {code: 'DAG_DUPLICATE_VALUE'});
  for (const origin of ['hidden_grader', 'worker_report', '', null]) {
    const checks = registry(); checks[0].origin = origin;
    assert.throws(() => publicCheckMapping(input, checks), {code: 'DAG_INVALID_CHECK_ORIGIN'});
  }
  const checks = registry();
  checks.push(structuredClone(checks[0]));
  assert.throws(() => publicCheckMapping(input, checks), {code: 'DAG_DUPLICATE_ID'});
  const shortcut = registry(); delete shortcut[0].argv;
  assert.throws(() => publicCheckMapping(input, shortcut), {code: 'DAG_INVALID_FIELDS'});
});
