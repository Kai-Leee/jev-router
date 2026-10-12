import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, lstatSync, existsSync,
  openSync, closeSync, fsyncSync, rmSync} from 'node:fs';
import {resolve, join, relative, dirname, basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash, randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {validateDagPlan} from '../orchestration/dag-contracts.mjs';
import {analyzeDag} from '../orchestration/artifact-dag.mjs';
import {runArtifactWorkflow} from '../orchestration/dag-workflow.mjs';
import {allocateDagOwners} from '../orchestration/dag-decision-adapter.mjs';
import {processResult} from './docker.mjs';
import {providerOutcome} from './runner.mjs';
import {claudeEnvironment} from './claude-env.mjs';
import {loadConfig, describeConfig} from '../config.mjs';
import {createJevClient, prepareDecision} from '../client.mjs';
import {createMeasuredDecider} from './telemetry.mjs';
import {createTokenBudget, validateBudgetConfig, readTokenBudgetSnapshot} from './budget.mjs';
import {acquireTokenBudget} from './budget-acquire.mjs';
import {auditPublicChecks, loadPublicAuditInputs, verifyFrozenControlEvidence} from '../../scripts/audit-dag-public-checks.mjs';

const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, ...details}); };
const sha = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const unique = values => [...new Set(values)];
const uncertain = error => error?.outcome_uncertain === true || error?.outcomeUncertain === true || error?.uncertain === true
  || ['unknown', 'uncertain'].includes(error?.status);
const safeCode = error => /^[A-Z0-9_]{1,100}$/.test(error?.code ?? error?.message ?? '') ? error.code ?? error.message : 'DAG_RUNNER_FAILED';
const PATH = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
const safeRelative = path => typeof path === 'string' && PATH.test(path) && !path.split('/').some(part => ['.', '..'].includes(part));
const ROOT = resolve(import.meta.dirname, '../..');
const CHECK_TMPFS = '/tmp:rw,exec,size=2g';
const READINESS_SOURCE = `import ast,json,pathlib,subprocess,sys
p=pathlib.Path(sys.argv[1])
assert p.is_file()
assert not p.is_symlink()
text=p.read_text()
assertions=2
if p.suffix=='.py':
    ast.parse(text)
    assertions+=1
else:
    assert text.strip()
    assertions+=1
    if p.suffix=='.toml':
        import tomllib
        tomllib.loads(text)
        assertions+=1
    elif p.suffix=='.sh':
        assert subprocess.run(['bash','-n',str(p)],capture_output=True).returncode==0
        assertions+=1
print(json.dumps({'assertions':assertions}))`;
const READINESS = `exec(${JSON.stringify(READINESS_SOURCE)})`;
const PROBE = "import sys,json,importlib.util,importlib.metadata as m; names=['httpx','attrs','jinja2','typer','ruamel.yaml','setuptools','pip']; print(json.dumps({'python':sys.version,'modules':{n:{'available':importlib.util.find_spec(n) is not None,'version':m.version(n)} for n in names}}))";

function filesUnder(path) {
  const result = [];
  const walk = directory => {
    for (const name of readdirSync(directory).sort()) {
      const full = join(directory, name), stat = lstatSync(full);
      if (stat.isSymbolicLink()) fail('DAG_UNSAFE_SOURCE');
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile() && stat.nlink === 1) result.push(full);
      else fail('DAG_UNSAFE_SOURCE');
    }
  };
  walk(path); return result;
}

export function loadDagRunManifest(path = join(ROOT, 'benchmarks/e2e-swe/manifests/d065-dag.json'), rootDir = ROOT) {
  const value = read(path), limits = value.limits;
  if (value.schema_version !== 'dag-benchmark/v1' || value.worker_profile?.model !== 'claude-opus-5-5'
      || value.worker_profile?.effort !== 'medium' || limits?.maximum_workers !== 30 || limits?.minimum_workers !== 2
      || limits?.max_concurrency !== 2 || !Number.isSafeInteger(limits.wall_timeout_seconds) || limits.wall_timeout_seconds < 1
      || !Number.isSafeInteger(limits.maximum_decisions) || limits.maximum_decisions < 1
      || !Number.isSafeInteger(limits.planning_input_tokens) || limits.planning_input_tokens < 65536
      || value.automatic_retries !== 0 || value.public_repairs !== 0
      || ![value.input, value.public_registry, value.public_checker_root, value.image_lock, value.mock_fixture].every(safeRelative)
      || typeof value.count_question !== 'string' || !value.count_question.trim()) fail('DAG_INVALID_RUN_MANIFEST');
  validateBudgetConfig(value.jev_budget, rootDir);
  return {...value, manifest_path: relative(rootDir, resolve(path)), manifest_sha256: sha(readFileSync(path))};
}

async function checkedProcess(command, args, options, runCommand = processResult) {
  const result = await runCommand(command, args, options);
  if (result.exit_code !== 0 || result.outcome_uncertain) fail('DAG_PREFLIGHT_PROCESS_FAILED', {outcome_uncertain: Boolean(result.outcome_uncertain)});
  return result;
}

async function runNamedContainer({image, argv, createArgs = [], runCommand, remaining, record = async () => {},
  eventPrefix, eventContext = {}, abortSignal, saveProcess = async () => {}}) {
  const name = `jev-d065-${randomUUID()}`;
  let container = null, raw = null, removed = false, primaryError = null;
  await record({event: `${eventPrefix}_planned`, ...eventContext, container_name: name, image_id: image.image_id});
  try {
    const created = await checkedProcess('docker', ['create', '--name', name, '--platform', `${image.os ?? 'linux'}/${image.architecture ?? 'amd64'}`, '--network', 'none', '--read-only',
      '--memory', '1g', '--cpus', '2', '--pids-limit', '256', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--tmpfs', CHECK_TMPFS, ...createArgs, '--entrypoint', argv[0], image.image_id, ...argv.slice(1)],
    {timeoutMs: remaining(), maxBytes: 1024 * 1024, killProcessTree: true, abortSignal}, runCommand);
    container = created.stdout.trim();
    if (!/^[a-f0-9]{64}$/.test(container)) fail('DAG_INVALID_CONTAINER_ID');
    await record({event: `${eventPrefix}_started`, ...eventContext, container_name: name, container_id: container, image_id: image.image_id});
    raw = await runCommand('docker', ['start', '--attach', container], {timeoutMs: remaining(), maxBytes: 8 * 1024 * 1024,
      killProcessTree: true, abortSignal});
    await saveProcess(raw);
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanup = await runCommand('docker', ['rm', '--force', container ?? name],
      {timeoutMs: 15000, maxBytes: 1024 * 1024, killProcessTree: true}).catch(() => null);
    removed = cleanup?.exit_code === 0 && !cleanup.outcome_uncertain;
    try { await record({event: `${eventPrefix}_cleaned`, ...eventContext, container_name: name, container_id: container, removed}); }
    catch (error) { primaryError ??= error; }
  }
  if (!removed) fail('DAG_CONTAINER_CLEANUP_UNCONFIRMED', {outcome_uncertain: true});
  if (primaryError) throw primaryError;
  if (raw.outcome_uncertain) fail('DAG_CONTAINER_PROCESS_UNCERTAIN', {outcome_uncertain: true});
  return raw;
}

async function probeDagEnvironment({image, runCommand, remaining, record, abortSignal}) {
  const inspected = await checkedProcess('docker', ['image', 'inspect', image.image_id],
    {timeoutMs: Math.min(remaining(), 15000), killProcessTree: true, abortSignal}, runCommand);
  if (JSON.parse(inspected.stdout)[0]?.Id !== image.image_id) fail('DAG_IMAGE_PIN_MISMATCH');
  const raw = await runNamedContainer({image, argv: ['python3', '-c', PROBE], runCommand, remaining,
    record, abortSignal, eventPrefix: 'dag_environment_container'});
  if (raw.exit_code !== 0) fail('DAG_DEPENDENCY_PROBE_FAILED');
  return {image_id: image.image_id, ...JSON.parse(raw.stdout), network: 'none', read_only: true, tmpfs: CHECK_TMPFS};
}

/** Read-only unless probe=true, which additionally runs ephemeral no-network probes. No inference. */
export async function preflightDagRun({rootDir = ROOT, manifest, probe = false, runCommand = processResult,
  record = async () => {}, abortSignal} = {}) {
  manifest ??= loadDagRunManifest(undefined, rootDir);
  if (manifest.public_controls_evidence !== undefined && !safeRelative(manifest.public_controls_evidence)) fail('DAG_INVALID_PUBLIC_EVIDENCE_PATH');
  const publicAuditOptions = {registryPath: manifest.public_registry, runnerPath: manifest.public_runner};
  const audit = auditPublicChecks({root: rootDir, controls: false, ...publicAuditOptions});
  const budget = readTokenBudgetSnapshot(validateBudgetConfig(manifest.jev_budget, rootDir));
  const config = loadConfig(), blockers = [];
  if (audit.missing_test_count || audit.missing_requirement_ids.length) blockers.push('PUBLIC_CHECK_MAPPING_INCOMPLETE');
  if (budget.blocked_code || budget.reservations_pending) blockers.push(budget.blocked_code ?? 'BUDGET_OUTSTANDING');
  const budgetVersion = manifest.jev_budget.schema_version.split('/')[1];
  const unlimited = ['v3', 'v4'].includes(budgetVersion) && manifest.jev_budget.max_input_tokens === null
    && budget.schema_version === `jev-token-budget-snapshot/${budgetVersion}` && budget.unlimited === true
    && budget.token_limit === null && budget.remaining_input_tokens === null;
  if (!unlimited && (budget.remaining_input_tokens === null || budget.remaining_input_tokens < manifest.jev_budget.reserve_input_tokens)) blockers.push('BUDGET_EXHAUSTED');
  if (!config.apiKey) blockers.push('MISSING_KEY');
  const image = read(join(rootDir, manifest.image_lock));
  if (!/^sha256:[a-f0-9]{64}$/.test(image.image_id)) fail('DAG_INVALID_IMAGE_PIN');
  const publicEnvironment = read(join(rootDir, manifest.public_checker_root, 'environment.json'));
  if (publicEnvironment.id !== manifest.public_environment_ref || publicEnvironment.image_id !== image.image_id
      || publicEnvironment.platform !== `${image.os}/${image.architecture}`
      || publicEnvironment.container?.tmpfs_options !== CHECK_TMPFS.slice('/tmp:'.length)) fail('DAG_PUBLIC_ENVIRONMENT_MISMATCH');
  let environment = null, auth = null, controls = {status: 'not_run'}, frozenControls = {status: 'not_verified'}, modelLookup = null;
  if (probe && !blockers.length) {
    try { frozenControls = verifyFrozenControlEvidence({root: rootDir, ...publicAuditOptions,
      ...(manifest.public_controls_evidence ? {path: manifest.public_controls_evidence} : {})}); }
    catch (error) { frozenControls = {status: 'blocked', code: safeCode(error)}; blockers.push('PUBLIC_CHECK_FROZEN_EVIDENCE_REQUIRED'); }
  }
  if (probe && !blockers.length) {
    const rawAuth = await checkedProcess('claude', ['auth', 'status'],
      {env: claudeEnvironment(process.env), timeoutMs: 15000, killProcessTree: true, abortSignal}, runCommand);
    const parsed = JSON.parse(rawAuth.stdout);
    auth = {logged_in: parsed.loggedIn === true, auth_method: parsed.authMethod ?? null};
    if (!auth.logged_in || auth.auth_method !== 'claude.ai') blockers.push('CLAUDE_AUTH_REQUIRED');
    const probeBegan = performance.now();
    environment = await probeDagEnvironment({image, runCommand, remaining: () => Math.max(1, 30000 - Math.floor(performance.now() - probeBegan)), record, abortSignal});
    if (Object.values(environment.modules).some(module => !module.available)) blockers.push('DAG_DEPENDENCY_UNAVAILABLE');
    controls = auditPublicChecks({root: rootDir, controls: 'normal', ...publicAuditOptions}).controls;
    if (controls.status !== 'passed') blockers.push('PUBLIC_CHECK_CONTROLS_FAILED');
    const models = await createJevClient({...config, timeoutMs: 15000}).listModels();
    modelLookup = {jev_latest_available: models.models?.some(model => model.name === 'jev-latest') === true, inference_calls: 0};
    if (!modelLookup.jev_latest_available) blockers.push('JEV_MODEL_UNAVAILABLE');
  }
  return {status: blockers.length ? 'blocked' : probe ? 'ready' : 'inspected_no_inference', mode: 'preflight',
    paid_calls: 0, blockers, live_ready: probe && blockers.length === 0, mapping: audit, controls,
    frozen_controls: frozenControls, budget, connection: describeConfig(config), auth, image, environment, model_lookup: modelLookup};
}

function artifactOrder(input) {
  const all = new Map(input.artifact_interfaces.map(item => [item.path, item]));
  if (!all.size || all.size !== input.artifact_interfaces.length || [...all.keys()].some(path => !safeRelative(path))) fail('DAG_INVALID_ATOMIC_BOUNDARIES');
  const done = new Set(), ordered = [];
  while (ordered.length < all.size) {
    const ready = [...all.values()].filter(item => !done.has(item.path) && item.dependency_paths.every(path => done.has(path)));
    if (!ready.length) fail('DAG_ATOMIC_INTERFACE_CYCLE');
    for (const item of ready) { ordered.push(item); done.add(item.path); }
  }
  return ordered;
}

/** Fixed source artifacts; actual model choices only supply worker count/ownership. */
export function buildAtomicDagPlan({input, registry, manifest, ownerByArtifact, workers}) {
  const ordered = artifactOrder(input);
  const artifactId = path => `artifact-${ordered.findIndex(item => item.path === path) + 1}`;
  const requirementByPath = new Map(ordered.map(item => [item.path, []]));
  for (const obligation of input.obligations) {
    const target = [...ordered].reverse().find(item => obligation.write_scope.includes(item.path));
    if (!target) fail('DAG_REQUIREMENT_HAS_NO_ARTIFACT');
    requirementByPath.get(target.path).push(obligation.id);
  }
  const artifacts = ordered.map((item, index) => ({id: artifactId(item.path), producer_task_id: `atomic-${index + 1}`}));
  const checks = ordered.map((item, index) => ({id: `readiness-${index + 1}`, version: '1', phase: 'contract',
    artifact_ids: [artifactId(item.path)], requirement_ids: requirementByPath.get(item.path),
    runner_ref: 'src/benchmark/dag-runner.mjs', argv: ['python3', '-c', READINESS, item.path], cwd: 'candidate',
    environment_ref: manifest.public_environment_ref, source_ref: input.source.path}));
  const tasks = ordered.map((item, index) => ({id: `atomic-${index + 1}`, kind: 'implementation', parent_id: null,
    requirement_ids: [...requirementByPath.get(item.path)], input_artifact_ids: item.dependency_paths.map(artifactId),
    output_artifact_ids: [artifactId(item.path)], check_ids: [`readiness-${index + 1}`], worker_id: ownerByArtifact[artifactId(item.path)],
    read_scope: [...item.dependency_paths], write_scope: [item.path],
    duration: {basis: 'unknown', estimate_ms: null, sample_count: 0, source_refs: []}}));
  const artifactIds = artifacts.map(item => item.id);
  for (const check of registry) {
    const suite = check.argv[check.argv.indexOf('--suite') + 1];
    if (!suite || !/^[a-z0-9-]+$/.test(suite)) fail('DAG_INVALID_PUBLIC_SUITE');
    checks.push({id: check.id, version: check.version, phase: 'integration', artifact_ids: [...artifactIds],
      requirement_ids: [...check.requirement_ids], runner_ref: check.runner_ref,
      argv: ['python3', `/checker/${manifest.public_checker_root}/run_public_checks.py`, '--suite', suite, '--binding', '/run/binding.json'],
      cwd: 'candidate', environment_ref: manifest.public_environment_ref, source_ref: check.source_ref});
  }
  tasks.push({id: 'verify-public', kind: 'verification', parent_id: null, requirement_ids: input.obligations.map(item => item.id),
    input_artifact_ids: artifactIds, output_artifact_ids: [], check_ids: registry.map(check => check.id), worker_id: null,
    read_scope: ordered.map(item => item.path), write_scope: [], duration: {basis: 'unknown', estimate_ms: null, sample_count: 0, source_refs: []}});
  const plan = validateDagPlan({schema_version: 'artifact-dag/v1', goal_revision: input.source.sha256,
    graph_revision: 'd065-prepared-v1', requirement_ids: input.obligations.map(item => item.id), worker_limit: 30,
    max_concurrency: 2, workers, tasks, artifacts, checks, unknown_relationships: []});
  analyzeDag(plan);
  const base = structuredClone(plan);
  base.tasks = [{id: 'root-impl', kind: 'implementation', parent_id: null, requirement_ids: [...plan.requirement_ids],
    input_artifact_ids: [], output_artifact_ids: artifactIds, check_ids: checks.filter(check => check.phase === 'contract').map(check => check.id),
    worker_id: workers[0].id, read_scope: unique(tasks.filter(task => task.kind === 'implementation').flatMap(task => task.read_scope)),
    write_scope: ordered.map(item => item.path), duration: {basis: 'unknown', estimate_ms: null, sample_count: 0, source_refs: []}},
  structuredClone(plan.tasks.at(-1))];
  base.artifacts = base.artifacts.map(artifact => ({...artifact, producer_task_id: 'root-impl'}));
  return {base: validateDagPlan(base), plan,
    artifactBindings: Object.fromEntries(ordered.map(item => [artifactId(item.path), {paths: [item.path]}])),
    atomic_units: ordered.map(item => ({artifact_id: artifactId(item.path), path: item.path, purpose: item.purpose,
      requirement_ids: requirementByPath.get(item.path), dependency_paths: item.dependency_paths, provenance: item.provenance ?? null}))};
}

/** Mocking decide changes only the source of choices, not ownership conservation. */
export async function prepareDagAllocation({input, registry, manifest, decide, record = async () => {}, commit}) {
  const began = performance.now(), ordered = artifactOrder(input);
  const executionModel = {atomic_task_count: ordered.length, cli_sessions_for_complete_execution: ordered.length,
    session_scope: 'fresh_per_atomic_task', conversation_reuse: false,
    worker_count_effect: 'mutual_exclusion_and_resource_assignment_only',
    worker_profile: manifest.worker_profile, execution_slots: manifest.limits.max_concurrency};
  const criteria = Object.fromEntries(Array.from({length: Math.min(ordered.length, 30) - 1}, (_, index) =>
    [String(index + 2), `${index + 2} implementation workers; fixed ${ordered.length} atomic tasks and two execution slots.`]));
  if (!Object.keys(criteria).length) fail('DAG_ROOT_WORKER_COUNT_UNAVAILABLE');
  const questionId = 'dag.worker_count.d065';
  const countResponse = await decide({model: 'jev-latest', state: {goal: input.goal, atomic_files: ordered,
    constraints: manifest.limits, execution_model: executionModel},
    questions: {[questionId]: {type: 'choice', instructions: manifest.count_question, criteria}}});
  const choice = countResponse?.answers?.[questionId];
  if (choice?.type !== 'choice' || !Object.hasOwn(criteria, choice.choice) || uncertain(countResponse)
      || countResponse?.ok === false || countResponse?.error != null
      || (countResponse?.status !== undefined && !['completed', 'success', 'succeeded'].includes(countResponse.status))) {
    fail('DAG_WORKER_COUNT_INVALID', {outcome_uncertain: uncertain(countResponse)});
  }
  const count = Number(choice.choice), workers = Array.from({length: count}, (_, index) => ({id: `worker-${index + 1}`, profile_id: manifest.worker_profile.id}));
  const bundles = ordered.map((item, index) => ({id: `artifact-${index + 1}`, obligation_ids: [`artifact-unit-${index + 1}`],
    eligible_owner_ids: workers.map(worker => worker.id), evidence_refs: [input.source.path, manifest.input, item.path]}));
  const allocation = await allocateDagOwners({bundles, owners: workers.map(worker => ({id: worker.id, capacity: Math.ceil(1.25 * ordered.length / count), minimum: 1})),
    decide: request => decide({...request, state: {...request.state, atomic_files: ordered, execution_model: executionModel}}),
    record, maxSearchNodes: manifest.limits.max_search_nodes});
  if (allocation.status !== 'completed') fail('DAG_ALLOCATION_BLOCKED');
  const assembled = buildAtomicDagPlan({input, registry, manifest, workers,
    ownerByArtifact: Object.fromEntries(allocation.assignments.map(item => [item.bundle_id, item.owner_id]))});
  const semantics = await import('../orchestration/dag-semantic-handlers.mjs');
  const semanticState = semantics.createDagSemanticState({plan: assembled.base});
  const semanticController = semantics.createDagSemanticController({state: semanticState, record, commit});
  const applied = await semanticController.apply({decision: {kind: 'split', type: 'choice', choice: 'candidate_allocated'}, payload: {
    expected_graph_revision: assembled.base.graph_revision, scope: 'root', target_task_ids: ['root-impl'],
    candidates: [{id: 'allocated', plan: assembled.plan, evidence_refs: [manifest.input, 'allocation.json']}], available_workers: workers,
    preparation: {method: 'actual_owner_choices_to_atomic_partition', source_refs: [manifest.input, 'allocation.json'],
      wall_ms: performance.now() - began, usage: null, cost: null}}});
  if (applied.status !== 'applied') fail('DAG_SEMANTIC_SPLIT_BLOCKED');
  return {...assembled, plan: applied.state.plan, allocation, count_response: countResponse, semantic_action: applied.action,
    preparation_wall_ms: performance.now() - began};
}

export async function runDagDockerCheck({image, check, candidateDirectory, pinnedDirectory, bindingDirectory, runCommand = processResult,
  remaining, record, attemptId, abortSignal, saveProcess = async () => {}}) {
  const bindingPath = join(bindingDirectory, 'binding.json');
  writeFileSync(bindingPath, JSON.stringify({schema_version: 'dag-public-command/v2', kind: 'candidate',
    candidate_root: '/candidate', environment_ref: check.environment_ref}), {mode: 0o600, flag: 'wx'});
  const raw = await runNamedContainer({image, argv: check.argv, createArgs: ['--mount', `type=bind,src=${candidateDirectory},dst=/candidate,readonly`,
      '--mount', `type=bind,src=${pinnedDirectory},dst=/checker,readonly`, '--mount', `type=bind,src=${bindingDirectory},dst=/run,readonly`,
      '--workdir', '/candidate'], remaining, runCommand, record, eventPrefix: 'dag_check_container',
    eventContext: {attempt_id: attemptId, check_id: check.id}, abortSignal, saveProcess});
  let report;
  try { report = JSON.parse(raw.stdout); } catch { fail('DAG_CHECK_REPORT_INVALID'); }
  if (uncertain(report)) fail('DAG_CHECK_REPORT_UNCERTAIN', {outcome_uncertain: true});
  return {raw, report, container_removed: true};
}

/** Validate public outcomes without claiming case coverage for initialization failure. */
export function validateDagPublicReport({check, registeredCheck, raw, report}) {
  if (uncertain(raw) || uncertain(report)) fail('DAG_CHECK_REPORT_UNCERTAIN', {outcome_uncertain: true});
  if (!registeredCheck || !Array.isArray(registeredCheck.test_ids) || !registeredCheck.test_ids.length || !raw || !report
      || report.schema_version !== 'dag-public-check-evidence/v1' || report.scope !== 'complete_suite'
      || report.product_certified !== false || report.artifact_revisions !== null
      || report.check_id !== check.id || report.check_version !== check.version || report.environment_ref !== check.environment_ref
      || !['passed', 'failed'].includes(report.status) || !Number.isSafeInteger(raw.exit_code) || raw.exit_code < 0
      || raw.outcome_uncertain !== false || report.exit_code !== raw.exit_code || report.executed !== true || report.outcome_uncertain !== false
      || JSON.stringify(report.test_ids) !== JSON.stringify(registeredCheck.test_ids) || !Array.isArray(report.cases)
      || !Number.isSafeInteger(report.assertions) || report.assertions < 0) fail('DAG_PUBLIC_EVIDENCE_INVALID');
  if (report.error !== null) {
    const error = report.error;
    if (!error || typeof error !== 'object' || Array.isArray(error) || typeof error.code !== 'string' || !error.code.trim()
        || typeof error.message !== 'string' || !error.message.trim() || report.status !== 'failed' || raw.exit_code !== 1
        || report.cases.length !== 0 || report.assertions !== 0 || report.skipped !== registeredCheck.test_ids.length
        || JSON.stringify(report.unexecuted_test_ids) !== JSON.stringify(registeredCheck.test_ids)) fail('DAG_PUBLIC_EVIDENCE_INVALID');
    return report;
  }
  if (report.skipped !== 0 || !Array.isArray(report.unexecuted_test_ids) || report.unexecuted_test_ids.length !== 0
      || report.cases.length !== registeredCheck.test_ids.length || report.cases.some((item, index) => !item
        || item.test_id !== registeredCheck.test_ids[index] || !['passed', 'failed'].includes(item.status)
        || !Number.isSafeInteger(item.assertions) || item.assertions < 0 || (item.status === 'passed' && item.assertions < 1))
      || report.assertions !== report.cases.reduce((sum, item) => sum + item.assertions, 0)
      || (report.status === 'passed' ? raw.exit_code !== 0 || report.cases.some(item => item.status !== 'passed')
        : raw.exit_code === 0 || !report.cases.some(item => item.status === 'failed'))) fail('DAG_PUBLIC_EVIDENCE_INVALID');
  return report;
}

function usageSummary(receipts) {
  const summarize = provider => {
    const rows = receipts.filter(receipt => receipt.provider === provider);
    const known = rows.filter(row => Number.isFinite(row.api_equivalent_usd));
    return {calls: rows.length, input_tokens_known_subtotal: rows.reduce((sum, row) => sum + (row.usage?.input_tokens ?? 0), 0),
      output_tokens_known_subtotal: rows.reduce((sum, row) => sum + (row.usage?.output_tokens ?? 0), 0),
      cache_creation_input_tokens_known_subtotal: rows.reduce((sum, row) => sum + (row.usage?.cache_creation_input_tokens ?? 0), 0),
      cache_read_input_tokens_known_subtotal: rows.reduce((sum, row) => sum + (row.usage?.cache_read_input_tokens ?? 0), 0),
      cache_usage_complete: provider === 'claude' ? rows.every(row => Number.isSafeInteger(row.usage?.cache_creation_input_tokens)
        && Number.isSafeInteger(row.usage?.cache_read_input_tokens)) : null,
      usage_complete: rows.every(row => row.status === 'completed' && row.usage != null),
      api_equivalent_known_subtotal_usd: known.reduce((sum, row) => sum + row.api_equivalent_usd, 0),
      api_equivalent_usd: known.length === rows.length ? known.reduce((sum, row) => sum + row.api_equivalent_usd, 0) : null,
      actual_billed_usd: null};
  };
  return {jev: summarize('jev'), claude: summarize('claude')};
}

/** Live is explicit; all adapters are trusted controller dependencies, never model text. */
export async function runDagBenchmark({rootDir = ROOT, manifest, runDir, mode, spend = false, adapters = {}} = {}) {
  manifest ??= loadDagRunManifest(undefined, rootDir);
  if (!['mock', 'live'].includes(mode) || (mode === 'live' && !spend)) fail('EXPLICIT_SPEND_REQUIRED');
  if (typeof runDir !== 'string' || !resolve(runDir).startsWith(join(resolve(rootDir), 'benchmark-runs') + '/') || existsSync(runDir)) fail('DAG_FRESH_RUN_DIRECTORY_REQUIRED');
  const runId = basename(runDir);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,70}$/.test(runId)) fail('DAG_INVALID_RUN_ID');
  const runCommand = adapters.runCommand ?? processResult;
  const runtimeFactory = adapters.runtimeFactory ?? (await import('../orchestration/dag-filesystem-runtime.mjs')).createDagFilesystemRuntime;
  mkdirSync(runDir, {mode: 0o700});
  for (const directory of ['calls', 'receipts', 'sources', 'check-bindings']) mkdirSync(join(runDir, directory), {mode: 0o700});
  const eventFd = openSync(join(runDir, 'events.jsonl'), 'wx', 0o600), receipts = [], temporary = [];
  let secret = '', runtime = null, workflow = null, finalRuntime = null, plan = null, stopCode = null, outcomeUncertain = false, sequence = 0;
  let preflight = null, allocation = null, sourcePins = [], budgetBefore = null, budgetAfter = null, publicRegistry = null;
  const started = performance.now(), startedAt = new Date().toISOString(), controller = new AbortController();
  const remaining = () => { const milliseconds = Math.floor(manifest.limits.wall_timeout_seconds * 1000 - (performance.now() - started));
    if (controller.signal.aborted) fail('DAG_RUN_CANCELLED', {outcome_uncertain: true});
    if (milliseconds < 1) fail('DAG_RUN_DEADLINE'); return milliseconds; };
  const clean = value => { let text = JSON.stringify(value); if (secret) text = text.replaceAll(secret, '[REDACTED]'); return text; };
  const save = (name, value) => { const fd = openSync(join(runDir, name), 'wx', 0o600); try { writeFileSync(fd, clean(value) + '\n'); fsyncSync(fd); } finally { closeSync(fd); } };
  const record = async event => { writeFileSync(eventFd, clean({run_id: runId, recorded_at: new Date().toISOString(), ...event}) + '\n'); fsyncSync(eventFd); };
  const onSignal = () => controller.abort('DAG_RUN_CANCELLED');
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  const budgetConfig = validateBudgetConfig(manifest.jev_budget, rootDir);
  const checkpointReceipt = async receipt => { receipts.push(receipt); save(`receipts/${receipt.id}.json`, receipt); await record({event: 'dag_provider_finished', ...receipt}); };
  try {
    preflight = mode === 'live' ? await (adapters.preflight ?? preflightDagRun)({rootDir, manifest, probe: true, runCommand, record, abortSignal: controller.signal})
      : {status: 'ready', mode: 'mock', live_ready: false, inference_calls: 0};
    save('preflight.json', preflight);
    if (mode === 'live' && preflight.live_ready !== true) fail('DAG_LIVE_PREFLIGHT_BLOCKED');
    budgetBefore = readTokenBudgetSnapshot(budgetConfig); save('budget-before.json', budgetBefore);
    const input = read(join(rootDir, manifest.input));
    if (sha(readFileSync(join(rootDir, input.source.path))) !== input.source.sha256) fail('DAG_ORIGINAL_SOURCE_CHANGED');
    const modulePaths = ['src/benchmark/dag-runner.mjs', 'scripts/dag-e2e.mjs', 'scripts/audit-dag-public-checks.mjs', 'src/orchestration/dag-filesystem-runtime.mjs',
      'src/orchestration/dag-semantic-handlers.mjs', 'src/orchestration/dag-contracts.mjs', 'src/orchestration/artifact-dag.mjs',
      'src/orchestration/dag-scheduler.mjs', 'src/orchestration/dag-workflow.mjs', 'src/orchestration/artifact-verification-gate.mjs',
      'src/orchestration/dag-decision-adapter.mjs', 'src/orchestration/artifact-transport.mjs', 'bin/artifact-worker-mcp.mjs',
      'src/benchmark/docker.mjs', 'src/benchmark/runner.mjs', 'src/benchmark/claude-env.mjs', 'src/client.mjs', 'src/config.mjs',
      'src/benchmark/telemetry.mjs', 'src/benchmark/budget.mjs', 'src/benchmark/budget-acquire.mjs', 'docs/orchestration/contracts/dag-routing.v1.json',
      'docs/orchestration/contracts/dag-routing.v2.json', manifest.manifest_path, manifest.input, input.source.path, manifest.image_lock,
      ...filesUnder(join(rootDir, manifest.public_checker_root)).map(path => relative(rootDir, path))];
    sourcePins = unique(modulePaths).map((path, index) => {
      const bytes = readFileSync(join(rootDir, path)), snapshot = `sources/${String(index + 1).padStart(3, '0')}-${basename(path)}`;
      writeFileSync(join(runDir, snapshot), bytes, {mode: 0o600, flag: 'wx'}); return {path, sha256: sha(bytes), snapshot};
    });
    save('protocol.json', {manifest, mode, run_id: runId, started_at: startedAt, sources: sourcePins,
      decomposition: manifest.decomposition_boundary, preparation_cost: 'controller development excluded; this run planning/assignment included',
      independent_grade: 'not_run_root_owned', automatic_retries: 0});
    save('inputs.json', input);
    const config = mode === 'live' ? loadConfig() : null;
    secret = config?.apiKey ?? '';
    const decide = async request => {
      remaining();
      const priorTokens = receipts.filter(receipt => receipt.provider === 'jev').reduce((sum, receipt) => sum + (receipt.usage?.input_tokens ?? 0), 0);
      if (sequence >= manifest.limits.maximum_decisions || priorTokens + manifest.jev_budget.reserve_input_tokens > manifest.limits.planning_input_tokens) fail('DAG_PLANNING_LIMIT');
      const id = `jev-${String(++sequence).padStart(3, '0')}`, attemptId = `${runId}-${id}`;
      const prepared = prepareDecision({...request, state: {source: input.source, decision: request.state}});
      if (Buffer.byteLength(prepared.serialized) > manifest.limits.max_request_bytes) fail('DAG_PAYLOAD_LIMIT');
      save(`calls/${id}.request.json`, prepared.body);
      const began = performance.now(); let held = null, response = null, submitted = false;
      await record({event: 'dag_provider_started', provider: 'jev', id, attempt_id: attemptId});
      try {
        held = await acquireTokenBudget(budgetConfig, {open: cfg => createTokenBudget(cfg, {requireExisting: true})});
        const measured = createMeasuredDecider({client: createJevClient({...config, timeoutMs: remaining(),
          fetchImpl: (url, options) => globalThis.fetch(url, {...options, signal: AbortSignal.any([options.signal, controller.signal])})}), budget: held,
          record: async event => { if (event.event === 'inference_started') submitted = true; await record(event); },
          identifiers: {run_id: runId, attempt_id: attemptId, group_id: 'd065-planning', agent_role: 'implementation'}});
        response = await measured(prepared.body, {decision_id: sequence}); save(`calls/${id}.response.json`, response);
        await checkpointReceipt({id, provider: 'jev', attempt_id: attemptId, status: 'completed', wall_ms: performance.now() - began,
          inference_started: submitted, usage: response.usage, model: response.model,
          api_equivalent_usd: response.usage.input_tokens * manifest.valuation.usd_per_million_input_tokens / 1000000,
          actual_billed_usd: null, outcome_uncertain: false});
        return response;
      } catch (error) {
        const isUncertain = uncertain(error) || (submitted && response === null);
        if (!receipts.some(receipt => receipt.id === id)) await checkpointReceipt({id, provider: 'jev', attempt_id: attemptId,
          status: isUncertain ? 'uncertain' : 'failed', code: safeCode(error), wall_ms: performance.now() - began,
          inference_started: submitted, usage: response?.usage ?? null, api_equivalent_usd: null, actual_billed_usd: null, outcome_uncertain: isUncertain});
        throw Object.assign(error, {outcome_uncertain: isUncertain});
      } finally { held?.close(); }
    };

    let artifactBindings, checkerFiles, environment;
    if (mode === 'mock') {
      plan = read(join(rootDir, manifest.mock_fixture));
      artifactBindings = Object.fromEntries(plan.artifacts.map(artifact => [artifact.id, {paths: plan.tasks.find(task => task.id === artifact.producer_task_id).write_scope}]));
      checkerFiles = [join(rootDir, manifest.mock_fixture)]; environment = {id: plan.checks[0].environment_ref};
      save('planning.json', {mode: 'mock', model_calls: 0, fixture: manifest.mock_fixture, status: 'fixture_loaded'});
    } else {
      const publicData = loadPublicAuditInputs(rootDir, {registryPath: manifest.public_registry, runnerPath: manifest.public_runner});
      publicRegistry = publicData.registry;
      const assembled = await prepareDagAllocation({input, registry: publicRegistry, manifest, decide, record,
        commit: async value => save('semantic-commit.json', value)});
      allocation = assembled.allocation; save('allocation.json', allocation);
      plan = assembled.plan; artifactBindings = assembled.artifactBindings;
      checkerFiles = [join(rootDir, 'src/benchmark/dag-runner.mjs'), ...filesUnder(join(rootDir, manifest.public_checker_root))];
      environment = {id: manifest.public_environment_ref}; save('atomic-units.json', assembled.atomic_units);
    }
    save('plan.json', plan); save('artifact-bindings.json', artifactBindings);
    const image = read(join(rootDir, manifest.image_lock));
    const probeEnvironment = async () => {
      if (mode === 'mock') return {id: environment.id, node: process.version, mode: 'mock_fixture'};
      const began = performance.now();
      const inspected = await checkedProcess('docker', ['image', 'inspect', image.image_id],
        {timeoutMs: Math.min(remaining(), 15000), killProcessTree: true, abortSignal: controller.signal}, runCommand);
      if (JSON.parse(inspected.stdout)[0]?.Id !== image.image_id) fail('DAG_IMAGE_PIN_MISMATCH');
      await record({event: 'dag_environment_identity_checked', image_id: image.image_id, wall_ms: performance.now() - began});
      return {...preflight.environment, image_id: image.image_id,
        dependency_versions_basis: 'preflight_probe_of_identical_immutable_image'};
    };
    const executeTask = async (task, context) => {
      remaining();
      if (mode === 'mock') {
        for (const path of task.write_scope) { const value = manifest.mock_files[path]; if (typeof value !== 'string') fail('DAG_MOCK_FILE_MISSING');
          mkdirSync(dirname(join(context.stageDirectory, path)), {recursive: true}); writeFileSync(join(context.stageDirectory, path), value, {mode: 0o600}); }
        return {status: 'completed', evidence_mode: 'mock_fixture'};
      }
      const id = `claude-${String(++sequence).padStart(3, '0')}`, began = performance.now();
      const cwd = mkdtempSync(join(tmpdir(), 'jev-d065-worker-')); temporary.push(cwd);
      const transport = {root: context.stageDirectory, allowedPaths: task.write_scope, readablePaths: unique([...task.read_scope, ...task.write_scope]),
        journalPath: join(runDir, 'calls', `${id}.artifacts.jsonl`), maxFileBytes: manifest.limits.max_file_bytes, maxTotalBytes: manifest.limits.max_total_bytes};
      save(`calls/${id}.transport.json`, transport);
      save(`calls/${id}.mcp.json`, {mcpServers: {artifact_worker: {command: process.execPath,
        args: [join(rootDir, 'bin/artifact-worker-mcp.mjs'), '--config', join(runDir, 'calls', `${id}.transport.json`)]}}});
      const system = 'Implement the full public specification within this task\'s exact file ownership. Read available predecessor files through artifact_worker. Use write_file to persist complete file contents individually. Only the listed paths are writable. Requirements assigned here indicate accountability within this source boundary; preserve declared producer/consumer APIs. No shell, network, installation or delegation tools are available. Do not claim tests executed: the controller runs pinned checks. Do not weaken or modify check expectations. Final response is a concise factual summary, never all source bodies.';
      const request = {source: input.source, task, requirements: input.obligations.filter(item => task.requirement_ids.includes(item.id)),
        public_test_specifications: input.tests.filter(item => item.requirement_refs.some(id => task.requirement_ids.includes(id))),
        shared_interfaces: input.artifact_interfaces, declared_scope_basis: manifest.requirement_owner_basis,
        input_artifact_revisions: context.input_artifact_revisions, requested_profile: manifest.worker_profile};
      save(`calls/${id}.request.json`, {system, request, attempt_id: context.attempt_id});
      const args = ['--print', '--restricted', '--model', manifest.worker_profile.model, '--effort', manifest.worker_profile.effort,
        '--tools', '', '--strict-mcp-config', '--mcp-config', join(runDir, 'calls', `${id}.mcp.json`), '--setting-sources', '',
        '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--no-session-persistence',
        '--output-format', 'stream-json', '--verbose', '--system-prompt', system, '--allowedTools', 'mcp__artifact_worker__write_file,mcp__artifact_worker__read_file,mcp__artifact_worker__status'];
      const streamFd = openSync(join(runDir, 'calls', `${id}.stream.jsonl`), 'wx', 0o600);
      await record({event: 'dag_provider_started', provider: 'claude', id, task_id: task.id, attempt_id: context.attempt_id, requested_profile: manifest.worker_profile});
      try {
        const raw = await runCommand('claude', args, {cwd, env: claudeEnvironment(process.env), input: JSON.stringify(request), timeoutMs: remaining(),
          maxBytes: 32 * 1024 * 1024, killProcessTree: true, abortSignal: controller.signal,
          onStdout: chunk => { writeFileSync(streamFd, chunk); fsyncSync(streamFd); }});
        writeFileSync(join(runDir, 'calls', `${id}.stderr.log`), raw.stderr, {mode: 0o600, flag: 'wx'});
        const outcome = providerOutcome(raw, manifest.worker_profile.model);
        await checkpointReceipt({id, provider: 'claude', task_id: task.id, attempt_id: context.attempt_id, status: outcome.status,
          code: outcome.code, wall_ms: performance.now() - began, usage: outcome.completion?.usage ?? null,
          requested_profile: manifest.worker_profile, observed_models: outcome.models, model_identity_verified: outcome.identity,
          api_equivalent_usd: outcome.completion?.total_cost_usd ?? null, actual_billed_usd: null,
          outcome_uncertain: outcome.status === 'uncertain'});
        if (outcome.status !== 'completed') fail(outcome.code ?? 'DAG_WORKER_FAILED', {outcome_uncertain: outcome.status === 'uncertain'});
        return {status: 'completed', invocation_id: id, summary: outcome.completion.result};
      } catch (error) {
        if (!receipts.some(receipt => receipt.id === id)) await checkpointReceipt({id, provider: 'claude', task_id: task.id, attempt_id: context.attempt_id,
          status: 'uncertain', code: safeCode(error), wall_ms: performance.now() - began, usage: null,
          api_equivalent_usd: null, actual_billed_usd: null, outcome_uncertain: true});
        throw Object.assign(error, {outcome_uncertain: uncertain(error) || !receipts.some(receipt => receipt.id === id && receipt.status === 'failed')});
      } finally { closeSync(streamFd); }
    };
    const checkTask = async (check, context) => {
      remaining(); const id = `check-${randomUUID()}`;
      let raw, report;
      if (mode === 'mock') {
        raw = await runCommand(check.argv[0], check.argv.slice(1), {cwd: join(context.candidateDirectory, check.cwd), timeoutMs: remaining(), maxBytes: 1024 * 1024});
        report = {status: raw.exit_code === 0 ? 'passed' : 'failed', assertions: raw.exit_code === 0 ? 1 : 0,
          skipped: 0, executed: true, exit_code: raw.exit_code, outcome_uncertain: Boolean(raw.outcome_uncertain), evidence_mode: 'authored_mock_fixture'};
      } else {
        const bindingDirectory = join(runDir, 'check-bindings', id); mkdirSync(bindingDirectory, {mode: 0o700});
        ({raw, report} = await runDagDockerCheck({image, check, candidateDirectory: context.candidateDirectory, pinnedDirectory: context.pinnedDirectory,
          bindingDirectory, runCommand, remaining, record, attemptId: context.attempt_id, abortSignal: controller.signal,
          saveProcess: async raw => save(`calls/${id}.process.json`, raw)}));
        if (check.phase === 'contract') report = {...report, status: raw.exit_code === 0 ? 'passed' : 'failed', executed: true, skipped: 0, outcome_uncertain: false, exit_code: raw.exit_code};
        else validateDagPublicReport({check, registeredCheck: publicRegistry.find(item => item.id === check.id), raw, report});
      }
      const evidence = {...report, check_id: check.id, check_version: check.version, environment_ref: check.environment_ref,
        artifact_revisions: context.artifact_revisions};
      save(`receipts/${id}.json`, {task_attempt_id: context.attempt_id, check_id: check.id, evidence, process: {exit_code: raw.exit_code, stderr: raw.stderr, outcome_uncertain: Boolean(raw.outcome_uncertain)}});
      return evidence;
    };
    runtime = await runtimeFactory({plan, run_id: runId, runDirectory: runDir, artifactBindings, checkerFiles,
      checkerRoot: rootDir, environment, probeEnvironment, executeTask, checkTask, record});
    await runtime.initialize();
    workflow = await runArtifactWorkflow({plan, run_id: runId, execute: runtime.execute, runCheck: runtime.runCheck,
      getRevision: runtime.getRevision, record: runtime.record});
    save('workflow.json', workflow);
    if (workflow.status !== 'completed') { stopCode = workflow.execution?.failure?.code ?? 'DAG_WORKFLOW_INCOMPLETE'; outcomeUncertain = workflow.execution?.failure?.outcome_uncertain === true; }
  } catch (error) {
    stopCode = safeCode(error); outcomeUncertain = uncertain(error);
    await record({event: 'dag_benchmark_stopped', code: stopCode, outcome_uncertain: outcomeUncertain});
  } finally {
    if (runtime) {
      try { finalRuntime = await runtime.finalize(workflow ?? {status: outcomeUncertain ? 'uncertain' : 'failed', code: stopCode});
        if (['uncertain', 'invalid'].includes(finalRuntime?.journal?.status)) { outcomeUncertain = true; stopCode ??= 'DAG_RUNTIME_JOURNAL_UNRESOLVED'; } }
      catch (error) { stopCode ??= safeCode(error); outcomeUncertain ||= uncertain(error); }
      finally { await runtime.close?.(); }
    }
    try { budgetAfter = readTokenBudgetSnapshot(budgetConfig); save('budget-after.json', budgetAfter); } catch (error) { stopCode ??= safeCode(error); }
    for (const directory of temporary) rmSync(directory, {recursive: true, force: true});
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
  }
  const sourceChanges = sourcePins.filter(item => { try { return sha(readFileSync(join(rootDir, item.path))) !== item.sha256; } catch { return true; } }).map(item => item.path);
  if (sourceChanges.length) stopCode ??= 'DAG_SOURCE_CHANGED_DURING_RUN';
  const result = {schema_version: 'dag-benchmark-result/v1', run_id: runId, mode,
    status: outcomeUncertain ? 'uncertain' : stopCode ? 'failed' : workflow?.status ?? 'failed', stop_code: stopCode,
    started_at: startedAt, finished_at: new Date().toISOString(), wall_ms: performance.now() - started,
    completion_wall_ms: null, product_success: null, independent_grade: 'not_run_root_owned',
    candidate_path: finalRuntime?.candidateDirectory ?? null, artifact_revisions: finalRuntime?.artifact_revisions ?? null,
    worker_count: plan?.workers.length ?? null, task_count: plan?.tasks.length ?? null, allocation_status: allocation?.status ?? null,
    public_check_status: mode === 'live' && workflow?.status === 'completed' && !stopCode && !outcomeUncertain ? 'passed' : 'not_completed',
    usage: usageSummary(receipts), source_changes_during_run: sourceChanges, runtime: finalRuntime,
    budget_before: budgetBefore, budget_after: budgetAfter, automatic_retries: 0, restart_supported: false};
  try { save('result.json', result); await record({event: 'dag_benchmark_completed', status: result.status, wall_ms: result.wall_ms}); }
  finally { closeSync(eventFd); }
  return result;
}
