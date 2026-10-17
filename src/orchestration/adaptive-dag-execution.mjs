import {createHash} from 'node:crypto';
import {chmod, lstat, mkdir, open, readFile, readdir, realpath, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {isDeepStrictEqual} from 'node:util';
import {validateDagPlan} from './dag-contracts.mjs';
import {analyzeDag} from './artifact-dag.mjs';
import {createDagFilesystemRuntime} from './dag-filesystem-runtime.mjs';
import {runArtifactWorkflow} from './dag-workflow.mjs';
import {buildAdaptiveRepairScope} from './adaptive-repair-scope.mjs';
import {adaptiveOutcomeUncertain, adaptiveTerminalCause} from './adaptive-failure.mjs';
import {buildArtifactRepairWorkerContext} from './adaptive-artifact-repair.mjs';
import {buildArtifactRepairWorkerContext as buildArtifactRepairWorkerContextV2} from './adaptive-artifact-repair-v2.mjs';
import {buildAdaptiveCausalRepairScope, buildCausalRepairHistory,
  buildCausalRepairWorkerContext} from './adaptive-causal-repair.mjs';
import {inferAdaptiveRepairOwners, applyInferredRepairOwners,
  buildInferredRepairWorkerContext} from './adaptive-inferred-repair.mjs';
import {packRepairOwnerRequest, planRepairOwnerRequest, ADAPTIVE_REPAIR_BUDGET_EXCEEDED, ADAPTIVE_REPAIR_BUDGET_POLICIES} from './adaptive-repair-budget.mjs';
import {assessAdaptiveFailureRecovery, acceptAdaptiveRecoveryEvidence, adaptiveWorkerRecoveryIdentity,
  validateAdaptiveRecoveryRequest, loadAdaptiveFailureRecoveryPolicy, recoveryDigest} from './adaptive-failure-recovery.mjs';
import {workerMentionedExpansion, EXPANDED_UNION_ID} from './adaptive-inferred-scope.mjs';
import {collectPublicOwnerEvidence, attachPublicOwnerEvidence, applyPublicOwnerEvidenceScope, assertPublicOwnerEvidenceCoverage} from './adaptive-public-owner-evidence.mjs';
import {PARTIAL_REPAIR_POLICY, buildPartialReadinessRepair, buildPartialRepairWorkerContext} from './adaptive-partial-repair.mjs';
import {VERIFIED_REPAIR_CONTEXT_POLICY, buildVerifiedRepairContext,
  attachVerifiedRepairContext} from './adaptive-verified-repair-context.mjs';

const clone = value => structuredClone(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash('sha256').update(Buffer.isBuffer(value) ? value : JSON.stringify(canonical(value))).digest('hex');
const bytesDigest = value => createHash('sha256').update(value).digest('hex');
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, outcome_uncertain: false, ...details}); };
const uncertain = value => value?.outcome_uncertain === true || value?.outcomeUncertain === true || value?.uncertain === true ||
  ['unknown', 'uncertain'].includes(value?.status);
const knownFailure = new Set(['ARTIFACT_CHECK_NOT_PASSED', 'ARTIFACT_EXECUTION_NOT_COMPLETED',
  'DAG_RUNTIME_ARTIFACT_MISSING', 'DAG_RUNTIME_ARTIFACT_EMPTY']);

function preparePlan(input) {
  const plan = validateDagPlan(input), analysis = analyzeDag(plan);
  if (!analysis.dependency_model_complete) fail('ADAPTIVE_EXECUTION_UNRESOLVED_RELATION');
  const verification = plan.tasks.filter(task => task.kind === 'verification');
  const ids = plan.artifacts.map(artifact => artifact.id);
  if (verification.length !== 1 || verification[0].output_artifact_ids.length ||
      !isDeepStrictEqual([...verification[0].input_artifact_ids].sort(), [...ids].sort())) {
    fail('ADAPTIVE_EXECUTION_INTEGRATION_SCOPE');
  }
  const task = verification[0], publicChecks = task.check_ids.map(id => plan.checks.find(check => check.id === id));
  if (publicChecks.some(check => check.phase !== 'integration' ||
      !isDeepStrictEqual([...check.artifact_ids].sort(), [...ids].sort()) ||
      check.environment_ref !== publicChecks[0].environment_ref)) fail('ADAPTIVE_EXECUTION_PUBLIC_CHECK_SCOPE');
  const aggregate = {
    id: `adaptive-public-aggregate-${digest(publicChecks).slice(0, 16)}`, version: digest(publicChecks), phase: 'integration',
    artifact_ids: ids, requirement_ids: clone(task.requirement_ids),
    runner_ref: 'src/orchestration/adaptive-dag-execution.mjs', argv: ['controller:collect-all-public-checks'],
    cwd: publicChecks[0].cwd, environment_ref: publicChecks[0].environment_ref,
    source_ref: 'src/orchestration/adaptive-dag-execution.mjs',
  };
  if (plan.checks.some(check => check.id === aggregate.id)) fail('ADAPTIVE_EXECUTION_CHECK_COLLISION');
  plan.checks.push(aggregate);
  task.check_ids.unshift(aggregate.id);
  return {plan: validateDagPlan(plan), publicChecks, aggregate, analysis};
}

// D065 has already audited a captured stage before this function is used. The
// independent manifest also detects changes after that runtime has been closed.
async function scopedManifest(root, scopes) {
  const files = [], directories = [], seen = new Set();
  async function visit(path) {
    const absolute = join(root, path), stat = await lstat(absolute);
    if (stat.isSymbolicLink() || await realpath(absolute) !== absolute || seen.has(path.toLowerCase())) {
      fail('ADAPTIVE_EXECUTION_SNAPSHOT_ALIAS', {path});
    }
    seen.add(path.toLowerCase());
    if (stat.isDirectory()) {
      directories.push(path);
      for (const name of (await readdir(absolute)).sort()) await visit(`${path}/${name}`);
    } else if (stat.isFile() && stat.nlink === 1) {
      const bytes = await readFile(absolute);
      files.push({path, size: bytes.length, sha256: bytesDigest(bytes), executable: !!(stat.mode & 0o111)});
    } else fail('ADAPTIVE_EXECUTION_SNAPSHOT_ALIAS', {path});
  }
  for (const path of scopes) await visit(path);
  return {files: files.sort((a, b) => a.path.localeCompare(b.path)), directories: directories.sort()};
}

async function repairSourceFiles(exported, bindings, plan, {recovery = false, includeTemplates = false} = {}) {
  if (!exported?.candidateDirectory) return [];
  const sources = [];
  for (const artifact of plan.artifacts) {
    const revision = exported.artifact_revisions?.[artifact.id];
    if (!revision) continue;
    const manifest = await scopedManifest(exported.candidateDirectory, bindings[artifact.id].paths);
    if (digest(manifest) !== revision) fail('ADAPTIVE_REPAIR_SCOPE_REVISION_DRIFT');
    for (const file of manifest.files.filter(file => recovery || file.path.endsWith('.py')
      || includeTemplates && /\.(?:jinja|j2|jinja2)$/.test(file.path))) {
      if (!recovery && file.size > 262144) fail('ADAPTIVE_REPAIR_SCOPE_SOURCE_LIMIT');
      const content = await readFile(join(exported.candidateDirectory, file.path));
      if (bytesDigest(content) !== file.sha256) fail('ADAPTIVE_REPAIR_SCOPE_REVISION_DRIFT');
      let text;
      try { text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(content); }
      catch (error) { if (recovery) continue; throw error; }
      sources.push({artifact_id: artifact.id, artifact_revision: revision, path: file.path,
        sha256: file.sha256, content: text});
    }
  }
  return sources;
}

async function seedSnapshot(snapshot, stageDirectory) {
  for (const artifact of Object.values(snapshot.artifacts)) {
    const actual = await scopedManifest(snapshot.directory, artifact.paths);
    if (!isDeepStrictEqual(actual, artifact.manifest) || digest(actual) !== artifact.revision) {
      fail('ADAPTIVE_EXECUTION_PRIOR_REVISION_DRIFT');
    }
    for (const path of actual.directories) await mkdir(join(stageDirectory, path), {recursive: true, mode: 0o700});
    for (const file of actual.files) {
      const target = join(stageDirectory, file.path), bytes = await readFile(join(snapshot.directory, file.path));
      if (bytesDigest(bytes) !== file.sha256) fail('ADAPTIVE_EXECUTION_PRIOR_REVISION_DRIFT');
      await mkdir(dirname(target), {recursive: true, mode: 0o700});
      await writeFile(target, bytes, {flag: 'wx', mode: file.executable ? 0o755 : 0o644});
      await chmod(target, file.executable ? 0o755 : 0o644);
    }
    if (!isDeepStrictEqual(await scopedManifest(snapshot.directory, artifact.paths), actual)) {
      fail('ADAPTIVE_EXECUTION_PRIOR_REVISION_DRIFT');
    }
  }
}

// Same read-only, world-traversable directory modes as runtime stages, so a
// checker container user other than the host owner can read the batch inputs.
async function readonlyDirectories(path) {
  for (const entry of await readdir(path, {withFileTypes: true})) if (entry.isDirectory()) await readonlyDirectories(join(path, entry.name));
  await chmod(path, 0o555);
}

async function causalReadSources(workerContext, snapshots, plan, bindings) {
  const required = workerContext.required_read_artifacts;
  if (!Array.isArray(required) || !isDeepStrictEqual(required.map(item => item.artifact_id), workerContext.required_read_artifact_ids)) {
    fail('ADAPTIVE_CAUSAL_READ_REQUIREMENTS');
  }
  const sources = [], seen = new Set();
  for (const item of required) {
    const owner = plan.artifacts.find(artifact => artifact.id === item.artifact_id)?.producer_task_id;
    const snapshot = snapshots.get(owner), artifact = snapshot?.artifacts[item.artifact_id];
    if (!snapshot?.verified || owner !== item.owner_task_id || !artifact || artifact.revision !== item.revision
      || !isDeepStrictEqual(item.paths, bindings[item.artifact_id]?.paths)
      || !isDeepStrictEqual(item.paths, artifact.paths)) fail('ADAPTIVE_CAUSAL_READ_REVISION');
    const observed = await scopedManifest(snapshot.directory, artifact.paths);
    if (!isDeepStrictEqual(observed, artifact.manifest) || digest(observed) !== item.revision) fail('ADAPTIVE_CAUSAL_READ_REVISION');
    for (const file of observed.files) {
      if (seen.has(file.path)) fail('ADAPTIVE_CAUSAL_READ_PATH_COLLISION'); seen.add(file.path);
      sources.push({path: file.path, root: snapshot.directory, sha256: file.sha256});
    }
  }
  return sources;
}

const INFERRED_SCOPE_POLICIES = ['public-inferred-owner-v1', 'public-inferred-owner-v2', 'public-inferred-owner-v3'];
const INFERRED_ARTIFACT_POLICIES = ['inferred-v1', 'inferred-v2', 'inferred-v3'];
const pathsOverlap = (left, right) => left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);

// D076 read_scope candidate-v1: every verified file of the failed candidate becomes
// a read-only overlay unless it is already readable or writable in the stage.
async function candidateReadSources(snapshots, plan, taken) {
  const sources = [], claimed = [...taken];
  for (const artifact of plan.artifacts) {
    const snapshot = snapshots.get(artifact.producer_task_id), entry = snapshot?.artifacts[artifact.id];
    if (!snapshot?.verified || !entry) continue;
    const observed = await scopedManifest(snapshot.directory, entry.paths);
    if (!isDeepStrictEqual(observed, entry.manifest) || digest(observed) !== entry.revision) fail('ADAPTIVE_REPAIR_READ_SCOPE_REVISION');
    for (const file of observed.files) if (!claimed.some(path => pathsOverlap(path, file.path))) {
      claimed.push(file.path); sources.push({path: file.path, root: snapshot.directory, sha256: file.sha256});
    }
  }
  return sources;
}

const validWorkerReport = report => report && typeof report === 'object' && typeof report.final_response === 'string'
  && Array.isArray(report.denied_read_paths) && report.denied_read_paths.every(path => typeof path === 'string');

// D076 worker_diagnostics report-v1: what this round's repair workers said, mapped to
// artifact ids by exact file path. The statements are unverified and only inform the owner.
function workerDiagnostics(reports, snapshots) {
  const owners = new Map();
  for (const snapshot of snapshots.values()) for (const [id, artifact] of Object.entries(snapshot.artifacts)) {
    for (const file of artifact.manifest.files) owners.set(file.path, id);
  }
  const ids = paths => [...new Set(paths.map(path => owners.get(path)).filter(Boolean))].sort();
  return {schema_version: 'adaptive-worker-diagnostics/v1', basis: 'unverified_statements_of_this_round_repair_workers',
    entries: reports.map(report => ({task_id: report.task_id, repaired_artifact_ids: clone(report.repaired_artifact_ids),
      denied_read_paths: clone(report.denied_read_paths), denied_read_artifact_ids: ids(report.denied_read_paths),
      mentioned_artifact_ids: ids([...owners.keys()].filter(path => report.final_response.includes(path))),
      final_response_excerpt: report.final_response.slice(0, 1000)}))};
}

// D083 scope_expansion worker-mentioned-v1. The owner-inference module stays byte-identical (prompt policies pin it), so
// the expanded union is added here before any repair decision and both scope seals are re-issued with the expansion in the proof.
function withWorkerMentionedScope({candidates, analysis}, {plan, diagnostics, persistent_failure_keys}) {
  const index = candidates.findIndex(candidate => candidate.id === 'repair-inferred-owners');
  if (index < 0) return {candidates, analysis};
  const union = candidates[index];
  const expansion = workerMentionedExpansion({baseArtifactIds: union.artifact_ids, plan, diagnostics, persistentFailureKeys: persistent_failure_keys});
  if (!expansion) return {candidates, analysis};
  const order = plan.artifacts.map(row => row.id), artifact_ids = expansion.artifact_ids;
  const reads = new Set(analysis.causal.chains.filter(chain => chain.nodes.some(node => artifact_ids.includes(node.artifact_id)))
    .flatMap(chain => chain.nodes.map(node => node.artifact_id)));
  const expanded = {...clone(union), id: EXPANDED_UNION_ID, artifact_ids,
    task_ids: plan.tasks.filter(task => task.kind === 'implementation' && task.output_artifact_ids.some(id => artifact_ids.includes(id))).map(task => task.id),
    read_artifact_ids: order.filter(id => reads.has(id)),
    reason: 'Repair the inferred union plus artifacts that the previous repair workers named while its failures persisted; preserve unknown failures and all other artifacts.',
    scope_expansion: expansion.info};
  const {sha256: priorOwnership, ...ownership} = analysis.inferred_ownership;
  ownership.choice_bindings = {...ownership.choice_bindings, [EXPANDED_UNION_ID]: digest(expanded)};
  ownership.scope_expansion = {policy: expansion.info.policy, prior_sha256: priorOwnership, candidate_id: EXPANDED_UNION_ID};
  const inferredOwnership = {...ownership, sha256: digest(ownership)};
  const {sha256: _priorCausal, ...causal} = analysis.causal;
  causal.inferred_owner_scope_sha256 = inferredOwnership.sha256;
  causal.choice_bindings = {...causal.choice_bindings, [EXPANDED_UNION_ID]: digest(expanded)};
  return {candidates: [...candidates.slice(0, index + 1), expanded, ...candidates.slice(index + 1)],
    analysis: {...analysis, inferred_ownership: inferredOwnership, causal: {...causal, sha256: digest(causal)}}};
}

function repairFileChanges(before, after, plan) {
  const changes = [];
  for (const artifact of plan.artifacts) {
    const left = before.get(artifact.producer_task_id)?.artifacts[artifact.id], right = after.get(artifact.producer_task_id)?.artifacts[artifact.id];
    if (!left || !right) fail('ADAPTIVE_CAUSAL_HISTORY_SNAPSHOT_MISSING');
    const paths = [...new Set([...left.manifest.files, ...right.manifest.files].map(file => file.path))].sort();
    for (const path of paths) {
      const a = left.manifest.files.find(file => file.path === path), b = right.manifest.files.find(file => file.path === path);
      if (a?.sha256 !== b?.sha256 || a?.executable !== b?.executable) changes.push({artifact_id: artifact.id, path,
        before_sha256: a?.sha256 ?? null, after_sha256: b?.sha256 ?? null,
        before_executable: a?.executable ?? null, after_executable: b?.executable ?? null});
    }
  }
  return changes;
}

function validatePreparedRound(original, prepared, selected) {
  if (!prepared || typeof prepared !== 'object' || Object.keys(prepared).length !== 1 || !prepared.plan) fail('ADAPTIVE_REPAIR_PROFILE_PLAN_INVALID');
  let plan;
  try { plan = validateDagPlan(prepared.plan); }
  catch (error) { fail(error.code ?? 'ADAPTIVE_REPAIR_PROFILE_PLAN_INVALID'); }
  const restored = clone(plan), changes = [];
  for (const [index, worker] of plan.workers.entries()) {
    const prior = original.workers[index];
    if (worker.id !== prior?.id) fail('ADAPTIVE_REPAIR_PROFILE_PLAN_INVALID');
    if (worker.profile_id !== prior.profile_id) {
      const owners = original.tasks.filter(task => task.worker_id === worker.id);
      if (!owners.length || owners.some(task => !selected.has(task.id) || task.kind !== 'implementation')) fail('ADAPTIVE_REPAIR_PROFILE_UNSELECTED');
      changes.push({worker_id: worker.id, task_ids: owners.map(task => task.id), before: prior.profile_id, after: worker.profile_id});
    }
    restored.workers[index].profile_id = prior.profile_id;
  }
  if (!isDeepStrictEqual(restored, original)) fail('ADAPTIVE_REPAIR_PROFILE_PLAN_DRIFT');
  return {plan, changes};
}

function checkedEnvelope(check, result) {
  if (uncertain(result)) return {...clone(result), check_id: check.id, check_version: check.version,
    environment_ref: check.environment_ref, outcome_uncertain: true};
  const report = result?.evidence ?? result;
  const value = {check_id: result?.check_id ?? report?.check_id, check_version: result?.check_version ?? report?.check_version,
    environment_ref: result?.environment_ref ?? report?.environment_ref, status: result?.status,
    executed: result?.executed ?? report?.executed, exit_code: result?.exit_code ?? report?.exit_code,
    assertions: result?.assertions ?? report?.assertions, skipped: result?.skipped ?? report?.skipped,
    outcome_uncertain: result?.outcome_uncertain, evidence: clone(report)};
  if (value.check_id !== check.id || value.check_version !== check.version || value.environment_ref !== check.environment_ref ||
      !['passed', 'failed'].includes(value.status) || typeof value.executed !== 'boolean' ||
      !Number.isSafeInteger(value.assertions) || value.assertions < 0 || !Number.isSafeInteger(value.skipped) || value.skipped < 0 ||
      !Number.isSafeInteger(value.exit_code) || value.outcome_uncertain !== false ||
      (value.status === 'passed' && (!value.executed || value.exit_code !== 0 || !value.assertions || value.skipped)) ||
      (value.status === 'failed' && value.exit_code === 0)) fail('ADAPTIVE_EXECUTION_INVALID_CHECK_REPORT');
  return value;
}

// Bounded fan-out in list order. After the first throw or uncertain value no new
// item starts, and every started callback settles before this returns. A slot may
// hold both a value and a later error (for example a failed completion record).
async function settleBounded(items, limit, run) {
  const slots = [];
  let next = 0, halted = false;
  const lane = async () => {
    while (!halted && next < items.length) {
      const slot = slots[next] = {}, item = items[next++];
      try { await run(item, slot); } catch (error) { slot.error = error; }
      halted ||= 'error' in slot || uncertain(slot.value);
    }
  };
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, lane));
  return slots;
}

function closure(plan, taskIds) {
  const selected = new Set(taskIds), producer = new Map(plan.artifacts.map(artifact => [artifact.id, artifact.producer_task_id]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of plan.tasks) if (task.kind === 'implementation' && !selected.has(task.id) &&
        task.input_artifact_ids.some(id => selected.has(producer.get(id)))) {
      selected.add(task.id); changed = true;
    }
  }
  return plan.tasks.filter(task => task.kind === 'implementation' && selected.has(task.id)).map(task => task.id);
}

function repairCandidates(plan, failure, publicChecks, testRequirements) {
  const leaves = plan.tasks.filter(task => task.kind === 'implementation'), owners = new Set(failure.failed_task_ids);
  const refs = [], requirements = new Set();
  for (const item of failure.public_evidence.filter(item => item.status === 'failed')) {
    const check = publicChecks.find(check => check.id === item.check_id), report = item.evidence;
    const testIds = [...(report?.cases ?? []).filter(test => test.status === 'failed').map(test => test.id ?? test.test_id),
      ...(report?.unexecuted_test_ids ?? [])].filter(Boolean);
    let exact = testIds.length > 0;
    for (const id of testIds) {
      const mapped = testRequirements[id];
      if (!Array.isArray(mapped) || !mapped.length) { exact = false; continue; }
      mapped.forEach(requirement => requirements.add(requirement));
      refs.push(`test:${id}`);
    }
    if (!exact) check.requirement_ids.forEach(id => requirements.add(id));
    refs.push(`check:${check.id}`);
  }
  for (const task of leaves) if (task.requirement_ids.some(id => requirements.has(id))) owners.add(task.id);
  const direct = leaves.filter(task => owners.has(task.id)).map(task => task.id);
  const targeted = closure(plan, direct), all = leaves.map(task => task.id);
  const candidates = [];
  if (direct.length) candidates.push({id: 'repair-failure-owners', task_ids: direct,
    reason: 'Repair only owners in the known local or public failure scope; unexecuted cases are not observed failures. Carry unchanged consumer bytes into fresh input snapshots and rerun every check.',
    evidence_refs: [...new Set([...refs, ...failure.failed_task_ids.map(id => `task:${id}`)])]});
  if (targeted.length && !isDeepStrictEqual(direct, targeted)) candidates.push({id: 'repair-failure-owners-and-consumers', task_ids: targeted,
    reason: 'Repair owners of known failed public requirements or local tasks and invalidate every downstream consumer.',
    evidence_refs: [...new Set([...refs, ...failure.failed_task_ids.map(id => `task:${id}`)])]});
  if (!isDeepStrictEqual(targeted, all)) candidates.push({id: 'repair-all-leaves', task_ids: all,
    reason: 'Repair all implementation leaves using only the current public failure evidence.',
    evidence_refs: [...new Set(refs.length ? refs : failure.failed_task_ids.map(id => `task:${id}`))]});
  return candidates;
}

/** Execute only committed, caller-owned plans. Providers, containment, public
 * report validation and independent grading remain outside this controller. */
export async function runAdaptiveDagExecution(options) {
  const {plan: original, publicChecks, aggregate} = preparePlan(options.plan);
  const {run_id, executeTask, checkTask, decideRepair, probeEnvironment, maxRepairRounds} = options;
  if (typeof run_id !== 'string' || !run_id || typeof options.runDirectory !== 'string' ||
      !Number.isSafeInteger(maxRepairRounds) || maxRepairRounds < 0 ||
      [executeTask, checkTask, probeEnvironment].some(callback => typeof callback !== 'function') ||
      (maxRepairRounds > 0 && typeof decideRepair !== 'function') ||
      (options.repairScopePolicy !== undefined && !['minimal-public-v1', 'public-causal-v1', 'public-inferred-owner-v1', 'public-inferred-owner-v2', 'public-inferred-owner-v3'].includes(options.repairScopePolicy)) ||
      (options.artifactRepairPolicy !== undefined && !['artifact-v1', 'artifact-v2', 'causal-v1', 'inferred-v1', 'inferred-v2', 'inferred-v3'].includes(options.artifactRepairPolicy)) ||
      ((options.repairScopePolicy === 'public-causal-v1') !== (options.artifactRepairPolicy === 'causal-v1')) ||
      ((options.repairScopePolicy === 'public-inferred-owner-v1') !== (options.artifactRepairPolicy === 'inferred-v1')) ||
      ((options.repairScopePolicy === 'public-inferred-owner-v2') !== (options.artifactRepairPolicy === 'inferred-v2')) ||
      ((options.repairScopePolicy === 'public-inferred-owner-v3') !== (options.artifactRepairPolicy === 'inferred-v3')) ||
      (INFERRED_SCOPE_POLICIES.includes(options.repairScopePolicy) && typeof options.decideRepairOwners !== 'function') ||
      (options.publicOwnerEvidencePolicy !== undefined && (options.publicOwnerEvidencePolicy !== 'public-source-v1' || !INFERRED_SCOPE_POLICIES.includes(options.repairScopePolicy))) ||
      (options.partialRepairPolicy !== undefined && options.partialRepairPolicy !== PARTIAL_REPAIR_POLICY) ||
      (options.repairDispatchPolicy !== undefined && (options.repairDispatchPolicy !== VERIFIED_REPAIR_CONTEXT_POLICY
        || !INFERRED_SCOPE_POLICIES.includes(options.repairScopePolicy))) ||
      (options.beforeRepairDecision !== undefined && typeof options.beforeRepairDecision !== 'function') ||
      (options.prepareRoundPlan !== undefined && typeof options.prepareRoundPlan !== 'function') ||
      (options.projectRepairFailure !== undefined && typeof options.projectRepairFailure !== 'function') ||
      (options.failureRecoveryPolicy !== undefined && options.failureRecoveryPolicy !== 'evidence-loop-v1') ||
      (options.recoverFailure !== undefined && typeof options.recoverFailure !== 'function') ||
      (options.record !== undefined && typeof options.record !== 'function') || options.planning?.dispatch_allowed === false ||
      (options.publicCheckConcurrency !== undefined && (!Number.isSafeInteger(options.publicCheckConcurrency) || options.publicCheckConcurrency < 1)) ||
      (options.batchChecks !== undefined && typeof options.batchChecks !== 'function') ||
      (options.repairBudget !== undefined && (!INFERRED_ARTIFACT_POLICIES.includes(options.artifactRepairPolicy)
        || !ADAPTIVE_REPAIR_BUDGET_POLICIES.includes(options.repairBudget?.policy) || Object.keys(options.repairBudget).length !== 1)) ||
      (options.repairFeedback !== undefined && (!INFERRED_ARTIFACT_POLICIES.includes(options.artifactRepairPolicy)
        || !options.repairFeedback || typeof options.repairFeedback !== 'object' || !Object.keys(options.repairFeedback).length
        || Object.entries(options.repairFeedback).some(([key, value]) => ({read_scope: 'candidate-v1', worker_diagnostics: 'report-v1',
          scope_expansion: 'worker-mentioned-v1'})[key] !== value)
        || (options.repairFeedback.scope_expansion && !options.repairFeedback.worker_diagnostics)))) {
    fail('ADAPTIVE_EXECUTION_INVALID_CONFIG');
  }
  const bindings = clone(options.artifactBindings), planning = clone(options.planning ?? {plan: options.plan, artifactBindings: bindings});
  const requirements = new Set(original.requirement_ids), testRequirements = clone(options.testRequirements ?? {});
  for (const value of Object.values(testRequirements)) if (!Array.isArray(value) || !value.length || value.some(id => !requirements.has(id))) {
    fail('ADAPTIVE_EXECUTION_TEST_REQUIREMENTS');
  }
  const forward = options.record ?? (async () => {}), requested = resolve(options.runDirectory);
  await mkdir(requested, {recursive: true});
  const directory = join(await realpath(requested), 'adaptive-execution');
  try { await mkdir(directory, {mode: 0o700}); }
  catch (error) {
    if (error.code === 'EEXIST') fail('ADAPTIVE_EXECUTION_RESTART_BLOCKED', {outcome_uncertain: true, replay_allowed: false});
    throw error;
  }
  const handle = await open(join(directory, 'journal.jsonl'), 'wx', 0o600);
  for (const path of [directory, dirname(directory)]) {
    const entry = await open(path, 'r');
    try { await entry.sync(); } finally { await entry.close(); }
  }
  let queue = Promise.resolve(), sequence = 0, priorHash = null;
  async function record(event) {
    const item = {...clone(event), run_id, at_ms: performance.now()};
    const append = queue.then(async () => {
      const body = {...item, sequence: ++sequence, previous_hash: priorHash}, row = {...body, hash: digest(body)};
      await handle.write(`${JSON.stringify(row)}\n`); await handle.sync(); priorHash = row.hash;
      await forward(clone(row));
    });
    queue = append.catch(() => {});
    return append;
  }
  const rounds = [], actions = [], snapshots = new Map(), attempted = new Set(), repairAttempts = [];
  const recoveryEnabled = options.failureRecoveryPolicy === 'evidence-loop-v1';
  const recoveryActions = [], workerInputs = new Set(), recoveryAttempts = new Set();
  const inferredPolicy = INFERRED_SCOPE_POLICIES.includes(options.repairScopePolicy);
  const ownerInputPolicy = inferredPolicy ? options.artifactRepairPolicy : undefined;
  const causalPolicy = inferredPolicy || options.repairScopePolicy === 'public-causal-v1';
  let repairHistory = causalPolicy ? buildCausalRepairHistory({planning, artifactBindings: bindings}) : null;
  let profilePlan = clone(original);
  const operations = {implementation: 0, repair: 0, carry_forward: 0};
  let selected = new Set(), selectedAction = null, previousFailure = null, previousRepairInputContext = null, result;
  async function recoveryAssessment(round, failure, extras = {}) {
    const previousAction = selectedAction ? {...clone(selectedAction), artifact_ids: selectedAction.artifact_ids
      ?? round.plan.tasks.filter(task => selectedAction.task_ids.includes(task.id)).flatMap(task => task.output_artifact_ids)} : null;
    const assessment = assessAdaptiveFailureRecovery({failure, previous_failure: previousFailure,
      previous_action: previousAction, repair_history: repairHistory, historical_repair_history: options.historicalRepairHistory, ...extras});
    round.recovery_assessment = clone(assessment);
    await record({event: 'adaptive_failure_recovery_assessed', round_index: round.round_index, assessment});
    return assessment;
  }
  async function recover(round, failure, candidates, assessment, extras = {}) {
    const stage = extras.stage ?? assessment.terminal_cause.stage;
    const action = {round_index: round.round_index, stage, action: assessment.action, condition: assessment.condition,
      failure_identity_sha256: assessment.failure_identity_sha256, status: assessment.status};
    const stop = async reason => {
      action.status = assessment.action === 'reconcile_request' ? 'reconcile_request' : 'needs_evidence';
      action.reason = reason; recoveryActions.push(clone(action));
      round.recovery_state = clone(action); round.prior_public_failure = clone(failure);
      round.status = assessment.terminal_cause.outcome_uncertain || failure.outcome_uncertain ? 'uncertain' : 'failed';
      round.outcome_uncertain = round.status === 'uncertain';
      round.terminal_cause = assessment.terminal_cause.code === 'ADAPTIVE_RUN_FAILED' || knownFailure.has(assessment.terminal_cause.code)
        ? adaptiveTerminalCause({code: 'ADAPTIVE_RECOVERY_EVIDENCE_REQUIRED', outcome_uncertain: round.outcome_uncertain}, {stage})
        : clone(assessment.terminal_cause);
      await record({event: 'adaptive_failure_recovery_blocked', ...clone(action), worker_callback_started: false});
      return {ready: false};
    };
    if (assessment.status === 'continue') {
      if (extras.failed_decision || extras.callback_allowed === false) return stop('FAILED_DECISION_CANNOT_USE_NORMAL_DISPATCH_PATH');
      return {ready: true};
    }
    if (assessment.action === 'reconcile_request') return stop('RECONCILIATION_REQUIRED_NO_AUTOMATIC_REPLAY');
    // Account, connection and environment repair cannot be proven by source
    // prose. Record the required handler without silently retrying providers.
    const allowed = ['rebuild_relevant_input', 'inspect_new_failure_path', 'inspect_no_write_cause',
      'inspect_causal_path', 'collect_missing_decision_evidence'];
    if (!allowed.includes(assessment.action)) return stop('EXTERNAL_EVIDENCE_REQUIRED');
    if (extras.unsupported_recovery) {
      action.unsupported_recovery = clone(extras.unsupported_recovery);
      return stop('PROFILE_INPUT_REBUILD_UNSUPPORTED');
    }
    if (!options.recoverFailure || extras.callback_allowed === false) return stop('RECOVERY_CALLBACK_UNAVAILABLE');
    const attemptIdentity = recoveryDigest({action: action.action, failure: action.failure_identity_sha256,
      evidence: failure.recovery_evidence ?? [], failed_request: extras.failed_request ?? null});
    if (recoveryAttempts.has(attemptIdentity)) return stop('RECOVERY_INPUT_ALREADY_ATTEMPTED');
    recoveryAttempts.add(attemptIdentity);
    await record({event: 'adaptive_failure_recovery_requested', ...clone(action), input_sha256: attemptIdentity});
    try {
      const sourceFiles = (await repairSourceFiles(round.exported, bindings, round.plan, {recovery: true}))
        .map(({artifact_id, path, artifact_revision, sha256, content}) => ({artifact_id, path, revision: artifact_revision, sha256, text: content}));
      // The callback may transform its input. It never owns the controller
      // source bytes or the authority snapshots used to verify its response.
      const recoveryInput = {action: assessment.action, stage, failure,
        terminal_cause: assessment.terminal_cause, planning, artifactBindings: bindings,
        candidates, repair_history: repairHistory, previous_action: selectedAction,
        historical_repair_history: options.historicalRepairHistory ?? null, historical_binding: assessment.historical_binding,
        sourceFiles, ...(extras.failed_request ? {failed_request: extras.failed_request} : {})};
      const response = await options.recoverFailure(clone(recoveryInput),
      {round_index: round.round_index, stage, input_sha256: attemptIdentity});
      if (uncertain(response)) {
        assessment.action = action.action = 'reconcile_request'; assessment.terminal_cause.outcome_uncertain = true;
        return stop('RECOVERY_OUTCOME_UNCERTAIN');
      }
      if (response?.status !== 'ready') return stop(response?.reason ?? 'RECOVERY_NEEDS_EVIDENCE');
      let accepted = null, rebuild = null;
      if (response.evidence?.length) {
        accepted = acceptAdaptiveRecoveryEvidence({failure, sourceFiles, artifactBindings: bindings, evidence: response.evidence});
        if (accepted.status === 'ready') Object.assign(failure, accepted.failure);
      }
      if (assessment.action === 'rebuild_relevant_input' && response.input_rebuild) {
        rebuild = validateAdaptiveRecoveryRequest({input_rebuild: response.input_rebuild, failed_request: extras.failed_request});
      }
      if (assessment.action === 'rebuild_relevant_input' ? !rebuild : accepted?.status !== 'ready') {
        return stop(accepted?.reason ?? 'NO_CHANGED_REQUEST_OR_NEW_EVIDENCE');
      }
      action.status = 'ready'; action.input_sha256 = attemptIdentity;
      action.new_evidence_sha256 = accepted?.evidence_sha256 ?? null;
      action.new_evidence_count = accepted?.added_count ?? 0;
      action.input_rebuild = rebuild ? {recovery: clone(rebuild.recovery), report: clone(rebuild.report)} : null;
      recoveryActions.push(clone(action)); round.recovery_state = clone(action);
      round.prior_public_failure = clone(failure);
      await record({event: 'adaptive_failure_recovery_completed', ...clone(action)});
      return {ready: true, rebuild};
    } catch (error) {
      if (adaptiveOutcomeUncertain(error, {fallback: true})) {
        assessment.action = action.action = 'reconcile_request'; assessment.terminal_cause.outcome_uncertain = true;
      }
      return stop(error.code ?? 'RECOVERY_HANDLER_FAILED');
    }
  }
  try {
    await record({event: 'adaptive_execution_started', phase: 'started', max_repair_rounds: maxRepairRounds,
      plan_sha256: digest(options.plan), artifact_bindings_sha256: digest(bindings)});
    for (let roundIndex = 0; roundIndex <= maxRepairRounds; roundIndex++) {
      let plan = clone(profilePlan);
      plan.graph_revision = `${original.graph_revision}:adaptive-round-${roundIndex}`;
      const roundDirectory = join(directory, `round-${roundIndex}`), roundRunId = `${run_id}:round-${roundIndex}`;
      const captured = new Map(), cachedChecks = new Map(), publicEvidence = [], localEvidence = [], roundOperations = [], workerReports = [];
      const previousSnapshots = new Map(snapshots);
      // Opt-in batchChecks: one invocation covers several non-integration checks
      // whose artifact bytes are already fixed. Each check still passes through
      // runtime.runCheck and reuses only its own result for identical revisions.
      const batchedChecks = new Map();
      let roundStartBatch = null, batchSequence = 0;
      const launchCheckBatch = (mode, checks, context, {prepare, verify} = {}) => {
        const batch_id = `${roundRunId}:check-batch-${++batchSequence}`, check_ids = checks.map(check => check.id);
        const revisions = Object.fromEntries(checks.flatMap(check => check.artifact_ids).map(id => [id, context.artifact_revisions[id]]));
        const promise = (async () => {
          const start = performance.now();
          await record({event: 'adaptive_check_batch_started', phase: 'started', round_index: roundIndex, batch_id, mode,
            check_ids, artifact_revisions: revisions});
          let results;
          try {
            await prepare?.();
            const response = await options.batchChecks(clone(checks), {...clone(context), round_index: roundIndex, batch_id, mode});
            if (!response?.results || typeof response.results !== 'object' ||
                Object.keys(response.results).some(id => !check_ids.includes(id))) fail('ADAPTIVE_CHECK_BATCH_INVALID');
            results = Object.fromEntries(checks.filter(check => Object.hasOwn(response.results, check.id))
              .map(check => [check.id, checkedEnvelope(check, response.results[check.id])]));
            await verify?.();
          } catch (error) {
            // Known batch failure: every covered check runs singly. Unknown outcome
            // is never replaced by a fresh run; each covered check stays uncertain.
            const outcome_uncertain = adaptiveOutcomeUncertain(error);
            await record({event: 'adaptive_check_batch_completed', phase: outcome_uncertain ? 'uncertain' : 'failed',
              round_index: roundIndex, batch_id, mode, code: error?.code ?? 'ADAPTIVE_CHECK_BATCH_FAILED', outcome_uncertain,
              duration_ms: performance.now() - start});
            return outcome_uncertain ? {uncertain: error?.code ?? 'ADAPTIVE_CHECK_BATCH_UNCERTAIN'} : {};
          }
          await record({event: 'adaptive_check_batch_completed', phase: 'completed', round_index: roundIndex, batch_id, mode,
            statuses: Object.fromEntries(Object.entries(results).map(([id, value]) => [id, value.status])),
            duration_ms: performance.now() - start});
          return {results};
        })();
        promise.catch(() => {}); // Only a journal failure rejects; consumers still observe it.
        for (const check of checks) batchedChecks.set(check.id, {batch_id, promise,
          revisions: Object.fromEntries(check.artifact_ids.map(id => [id, revisions[id]]))});
        return promise;
      };
      const batchedCheck = async (check, context) => {
        const current = item => item.artifact_ids.every(id => batchedChecks.get(item.id)?.revisions[id] === context.artifact_revisions[id]);
        if (!current(check)) {
          // Missing or stale: batch this task's remaining checks on its own stage.
          const peers = context.task.check_ids.map(id => plan.checks.find(item => item.id === id))
            .filter(item => item.phase !== 'integration' && !current(item));
          if (peers.length > 1) launchCheckBatch('task', peers, context);
        }
        const entry = batchedChecks.get(check.id);
        if (!entry) return null;
        const fallback = async reason => { await record({event: 'adaptive_check_batch_fallback', round_index: roundIndex,
          batch_id: entry.batch_id, check_id: check.id, attempt_id: context.attempt_id, reason}); return null; };
        if (check.artifact_ids.some(id => entry.revisions[id] !== context.artifact_revisions[id])) return fallback('ARTIFACT_REVISION_CHANGED');
        const outcome = await entry.promise;
        if (outcome.uncertain) return {status: 'uncertain', outcome_uncertain: true, code: outcome.uncertain};
        if (!outcome.results?.[check.id]) return fallback('BATCH_RESULT_UNAVAILABLE');
        const result = clone(outcome.results[check.id]), batch = result.evidence?.batch;
        await record({event: 'adaptive_check_batch_result_used', round_index: roundIndex, batch_id: entry.batch_id,
          check_id: check.id, attempt_id: context.attempt_id, artifact_revisions: entry.revisions, ...(batch ? {batch} : {})});
        // Downstream evidence keeps the single-run shape (the owner projection admits only known evidence
        // fields); batch identity stays in this event and in the batch report.
        if (batch) delete result.evidence.batch;
        return result;
      };
      let runtime, initialization, workflow, exported, runtimeJournal, fatal = null;
      let profilePreparationStarted = false, profilePreparationCompleted = false;
      let repairContext = {selected_action: clone(selectedAction), failed_public_reports: clone(previousFailure?.public_evidence ?? []),
        failed_task_ids: clone(previousFailure?.failed_task_ids ?? []), selected_task_ids: [...selected],
        invalidated_task_ids: closure(plan, [...selected]),
        previous_artifact_revisions: Object.fromEntries([...snapshots.values()].flatMap(snapshot =>
          Object.entries(snapshot.artifacts).map(([id, artifact]) => [id, artifact.revision])))};
      try {
        if (roundIndex > 0 && options.prepareRoundPlan) {
          profilePreparationStarted = true;
          await record({event: 'adaptive_repair_profile_preparation_started', round_index: roundIndex, selected_task_ids: [...selected]});
          const prepared = await options.prepareRoundPlan({plan: clone(plan), round_index: roundIndex,
            selected_task_ids: [...selected], selected_action: clone(selectedAction),
            failure: clone(previousFailure), repair_history: clone(repairHistory)});
          const checked = validatePreparedRound(plan, prepared, selected); plan = checked.plan; profilePlan = clone(plan);
          planning.plan.workers = clone(plan.workers);
          if (planning.execution_context?.profile_policy === 'per_task_jev_selection') {
            planning.execution_context.worker_profiles = clone(plan.workers);
          }
          await record({event: 'adaptive_repair_profile_plan_prepared', round_index: roundIndex, changes: checked.changes,
            plan_sha256: digest(plan), selected_task_ids: [...selected]});
          profilePreparationCompleted = true;
        }
        await record({event: 'adaptive_round_started', phase: 'started', round_index: roundIndex, graph_revision: plan.graph_revision,
          selected_action: selectedAction, plan, artifact_bindings: bindings});
        const artifactWorkers = new Map();
        const partialRepair = selectedAction?.policy === PARTIAL_REPAIR_POLICY;
        if (previousFailure && options.artifactRepairPolicy) {
          const unready = plan.tasks.filter(task => task.kind === 'implementation' && !selected.has(task.id) && !snapshots.get(task.id)?.verified);
          if (unready.length && !partialRepair) fail('ADAPTIVE_ARTIFACT_REPAIR_UNREADY_UNSELECTED_TASK', {task_ids: unready.map(task => task.id)});
          for (const id of selected) {
            if (partialRepair) {
              artifactWorkers.set(id, buildPartialRepairWorkerContext({plan, failure: previousFailure, candidate: selectedAction,
                task: plan.tasks.find(task => task.id === id), snapshots, artifactBindings: bindings}));
              continue;
            }
            const buildWorkerContext = inferredPolicy ? buildInferredRepairWorkerContext : causalPolicy ? buildCausalRepairWorkerContext
              : options.artifactRepairPolicy === 'artifact-v2' ? buildArtifactRepairWorkerContextV2 : buildArtifactRepairWorkerContext;
            artifactWorkers.set(id, buildWorkerContext({planning, failure: previousFailure,
              candidate: selectedAction, task: plan.tasks.find(task => task.id === id), artifactBindings: bindings,
              ...(inferredPolicy ? {ownerInputPolicy, ...(options.repairInputPolicy ? {repairInputPolicy: options.repairInputPolicy,
                ...(previousRepairInputContext ? {repairInputContext: previousRepairInputContext} : {})} : {})} : {})}));
          }
        }
        if (previousFailure && options.projectRepairFailure && !options.artifactRepairPolicy) {
          const projected = await options.projectRepairFailure(clone(previousFailure));
          if (!projected?.failure || typeof projected.failure !== 'object' || !projected.report || typeof projected.report !== 'object') {
            fail('ADAPTIVE_REPAIR_CONTEXT_PROJECTION');
          }
          const {failed_public_reports, failed_task_ids, ...contextBase} = repairContext;
          repairContext = {...contextBase, failure: clone(projected.failure), projected_report: clone(projected.report)};
          await record({event: 'adaptive_repair_context_projected', round_index: roundIndex, report: clone(projected.report)});
        }
        runtime = await createDagFilesystemRuntime({plan, artifactBindings: bindings, run_id: roundRunId, runDirectory: roundDirectory,
          checkerRoot: options.checkerRoot, checkerFiles: options.checkerFiles, environment: options.environment, probeEnvironment,
          record: event => record({event: 'adaptive_workflow_event', round_index: roundIndex, payload: event}),
          executeTask: async (task, context) => {
            const prior = snapshots.get(task.id), isSelected = selected.has(task.id);
            const operation = prior?.verified && !isSelected ? 'carry_forward'
              : isSelected && attempted.has(task.id) ? 'repair' : 'implementation';
            if (prior) await seedSnapshot(prior, context.stageDirectory);
            captured.set(task.id, {task: clone(task), context: clone(context), operation});
            let workerIdentity = null;
            if (recoveryEnabled && operation === 'repair') {
              workerIdentity = adaptiveWorkerRecoveryIdentity({task: artifactWorkers.get(task.id)?.task ?? task,
                failure: previousFailure, selected_action: selectedAction, input_artifact_revisions: context.input_artifact_revisions});
              if (workerInputs.has(workerIdentity.semantic_worker_input_sha256)) {
                fatal = {code: 'ADAPTIVE_RECOVERY_DUPLICATE_WORKER_INPUT', outcome_uncertain: false};
                await record({event: 'adaptive_worker_duplicate_blocked', round_index: roundIndex, task_id: task.id,
                  ...clone(workerIdentity), worker_callback_started: false});
                return {status: 'failed', ...fatal};
              }
            }
            operations[operation]++;
            roundOperations.push({task_id: task.id, attempt_id: context.attempt_id, operation,
              prior_input_artifact_revisions: clone(prior?.input_artifact_revisions ?? null),
              prior_validation_input_artifact_revisions: clone(prior?.validation_input_artifact_revisions ?? null),
              current_input_artifact_revisions: clone(context.input_artifact_revisions)});
            await record({event: 'adaptive_leaf_operation', phase: 'started', round_index: roundIndex,
              task_id: task.id, attempt_id: context.attempt_id, operation, write_scope: task.write_scope,
              input_artifact_revisions: context.input_artifact_revisions,
              prior_input_artifact_revisions: prior?.input_artifact_revisions ?? null,
              prior_validation_input_artifact_revisions: prior?.validation_input_artifact_revisions ?? null,
              repair_context: repairContext});
            if (operation === 'carry_forward') return {status: 'completed'};
            let workerTask = task, workerRepairContext = repairContext, artifactRepair = null;
            if (isSelected && options.artifactRepairPolicy) {
              artifactRepair = artifactWorkers.get(task.id);
              workerTask = artifactRepair.task;
              workerRepairContext = {artifact_repair: artifactRepair.context};
              const inherited = task.output_artifact_ids.filter(id => !workerTask.output_artifact_ids.includes(id));
              if (inherited.length && !prior) {
                fatal = {code: 'ADAPTIVE_ARTIFACT_REPAIR_SEED_MISSING', outcome_uncertain: false};
                return {status: 'failed', ...fatal};
              }
              await record({event: 'adaptive_artifact_repair_prepared', round_index: roundIndex, task_id: task.id,
                attempt_id: context.attempt_id, artifact_ids: workerTask.output_artifact_ids,
                allowed_write_paths: workerTask.write_scope, inherited_artifact_ids: inherited, report: artifactRepair.report});
            }
            attempted.add(task.id);
            let extraReads = [], candidateReads = [];
            try {
              if (causalPolicy && artifactRepair) extraReads = await causalReadSources(artifactRepair.context, previousSnapshots, plan, bindings);
              if (options.repairFeedback?.read_scope && artifactRepair) candidateReads = await candidateReadSources(previousSnapshots, plan,
                [...workerTask.read_scope, ...workerTask.write_scope, ...extraReads.map(source => source.path)]);
            } catch (error) {
              fatal = {code: error.code ?? 'ADAPTIVE_CAUSAL_READ_FAILED', outcome_uncertain: false};
              await record({event: 'adaptive_causal_read_sources_rejected', round_index: roundIndex,
                task_id: task.id, attempt_id: context.attempt_id, code: fatal.code, worker_callback_started: false});
              return {status: 'failed', ...fatal};
            }
            if (causalPolicy && artifactRepair) await record({event: 'adaptive_causal_read_sources_verified', round_index: roundIndex,
              task_id: task.id, attempt_id: context.attempt_id, read_artifacts: artifactRepair.context.required_read_artifacts,
              sources: extraReads.map(({path, sha256}) => ({path, sha256})), basis: 'immutable_failed_round_snapshot_not_new_DAG_edge'});
            if (options.repairFeedback?.read_scope && artifactRepair) {
              extraReads = [...extraReads, ...candidateReads];
              await record({event: 'adaptive_repair_read_scope_expanded', round_index: roundIndex, task_id: task.id,
                attempt_id: context.attempt_id, policy: options.repairFeedback.read_scope,
                sources: candidateReads.map(({path, sha256}) => ({path, sha256})), writable: false});
            }
            if (recoveryEnabled && previousFailure?.recovery_evidence?.length) {
              workerRepairContext = {...clone(workerRepairContext), recovery_evidence: clone(previousFailure.recovery_evidence)};
            }
            if (workerIdentity) {
              workerInputs.add(workerIdentity.semantic_worker_input_sha256);
              await record({event: 'adaptive_worker_input_committed', round_index: roundIndex, task_id: task.id,
                attempt_id: context.attempt_id, operation, ...clone(workerIdentity)});
            }
            const outcome = await executeTask(clone(workerTask), {...clone(context), operation, round_index: roundIndex,
              original_task_id: task.id, repair_context: clone(workerRepairContext), ...(causalPolicy ? {additional_read_sources: extraReads} : {})});
            if (outcome && Object.hasOwn(outcome, 'worker_report')) {
              const {worker_report: report} = outcome;
              delete outcome.worker_report;
              if (options.repairFeedback?.worker_diagnostics && artifactRepair) {
                const accepted = validWorkerReport(report);
                if (accepted) workerReports.push({task_id: task.id, attempt_id: context.attempt_id,
                  repaired_artifact_ids: clone(workerTask.output_artifact_ids), denied_read_paths: [...new Set(report.denied_read_paths)].sort(),
                  final_response: report.final_response});
                await record({event: 'adaptive_worker_report_recorded', round_index: roundIndex, task_id: task.id,
                  attempt_id: context.attempt_id, accepted, ...(accepted ? {report: clone(workerReports.at(-1))} : {})});
              }
            }
            if (artifactRepair) {
              const inherited = task.output_artifact_ids.filter(id => !workerTask.output_artifact_ids.includes(id));
              const verified = [];
              try {
                for (const id of inherited) {
                  const actual = await scopedManifest(context.stageDirectory, bindings[id].paths);
                  const original = prior.artifacts[id];
                  if (!original || !isDeepStrictEqual(actual, original.manifest) || digest(actual) !== original.revision) {
                    fail('ADAPTIVE_ARTIFACT_REPAIR_CARRY_DRIFT', {artifact_id: id});
                  }
                  verified.push({artifact_id: id, revision: original.revision, manifest_sha256: digest(actual),
                    file_count: actual.files.length, bytes: actual.files.reduce((sum, file) => sum + file.size, 0)});
                }
              } catch (error) {
                fatal = {code: 'ADAPTIVE_ARTIFACT_REPAIR_CARRY_DRIFT', outcome_uncertain: uncertain(outcome),
                  cause_code: error.code ?? null, artifact_id: error.artifact_id ?? null};
                await record({event: 'adaptive_artifact_repair_rejected', round_index: roundIndex,
                  task_id: task.id, attempt_id: context.attempt_id, ...fatal});
                return {status: uncertain(outcome) ? 'uncertain' : 'failed', ...fatal};
              }
              const proof = {task_id: task.id, attempt_id: context.attempt_id, allowed_artifact_ids: workerTask.output_artifact_ids,
                inherited_artifacts: verified, original_dag_outputs: task.output_artifact_ids};
              roundOperations.find(operation => operation.attempt_id === context.attempt_id).artifact_repair = proof;
              await record({event: 'adaptive_artifact_repair_inheritance_verified', round_index: roundIndex, ...proof});
            }
            return outcome;
          },
          checkTask: async (check, context) => {
            if (check.id !== aggregate.id) {
              const batched = options.batchChecks && check.phase !== 'integration' ? await batchedCheck(check, context) : null;
              return checkedEnvelope(check, batched ?? await checkTask(clone(check), {...clone(context), round_index: roundIndex}));
            }
            // Default 1 is the historical serial loop. Evidence is collected in
            // registry order whatever the completion order of concurrent checks.
            const slots = await settleBounded(publicChecks, options.publicCheckConcurrency ?? 1, async (child, slot) => {
              const start = performance.now();
              await record({event: 'adaptive_public_check_started', phase: 'started', round_index: roundIndex,
                task_id: context.task.id, attempt_id: context.attempt_id, check_id: child.id,
                check_version: child.version, artifact_revisions: context.artifact_revisions});
              // Nested runtime checks retain a durable begin, independent pin
              // and full revision audits around every real checker invocation.
              const evidence = slot.value = await runtime.runCheck(clone(child), {task: clone(context.task), attempt_id: context.attempt_id,
                artifact_revisions: clone(context.artifact_revisions)});
              await record({event: 'adaptive_public_check_completed', phase: uncertain(evidence) ? 'uncertain' : 'completed',
                round_index: roundIndex, task_id: context.task.id, attempt_id: context.attempt_id, check_id: child.id,
                status: evidence.status, outcome_uncertain: uncertain(evidence), duration_ms: performance.now() - start,
                evidence});
            });
            for (const [index, slot] of slots.entries()) {
              if ('value' in slot) {
                publicEvidence.push(clone(slot.value));
                cachedChecks.set(publicChecks[index].id, clone(slot.value));
              }
              if ('error' in slot) throw slot.error;
              if (uncertain(slot.value)) return {check_id: aggregate.id, check_version: aggregate.version,
                environment_ref: aggregate.environment_ref, status: 'uncertain', outcome_uncertain: true};
            }
            const passed = publicEvidence.every(evidence => evidence.status === 'passed');
            return {check_id: aggregate.id, check_version: aggregate.version, environment_ref: aggregate.environment_ref,
              status: passed ? 'passed' : 'failed', executed: true, exit_code: passed ? 0 : 1,
              assertions: publicEvidence.reduce((sum, evidence) => sum + evidence.assertions, 0),
              skipped: publicEvidence.reduce((sum, evidence) => sum + evidence.skipped, 0), outcome_uncertain: false,
              evidence: {kind: 'adaptive-public-collection/v1', checks: clone(publicEvidence)}};
          }});
        initialization = await runtime.initialize();
        if (options.batchChecks) {
          // Verified prior bytes are fixed at round start: carried artifacts keep
          // them, and a repaired artifact simply misses its revision and reruns.
          // One invocation covers them while repair workers dispatch concurrently.
          const prior = plan.tasks.filter(task => task.kind === 'implementation' && snapshots.get(task.id)?.verified);
          const sources = prior.map(task => snapshots.get(task.id));
          const known = Object.fromEntries(sources.flatMap(source => Object.entries(source.artifacts)
            .map(([id, artifact]) => [id, artifact.revision])));
          const checks = prior.flatMap(task => task.check_ids).map(id => plan.checks.find(check => check.id === id))
            .filter(check => check.phase !== 'integration' && check.artifact_ids.every(id => Object.hasOwn(known, id)));
          const candidateDirectory = join(roundDirectory, 'round-start-check-batch');
          if (checks.length > 1) roundStartBatch = launchCheckBatch('round_start', checks, {candidateDirectory,
            pinnedDirectory: initialization.pinnedDirectory, environment: initialization.environment,
            binding_digest: initialization.binding_digest, artifact_revisions: known}, {
            prepare: async () => {
              await mkdir(candidateDirectory, {mode: 0o700});
              for (const source of sources) await seedSnapshot(source, candidateDirectory);
              await readonlyDirectories(candidateDirectory);
            },
            verify: async () => {
              for (const artifact of sources.flatMap(source => Object.values(source.artifacts))) {
                if (digest(await scopedManifest(candidateDirectory, artifact.paths)) !== artifact.revision) fail('ADAPTIVE_CHECK_BATCH_INPUT_DRIFT');
              }
            }});
        }
        workflow = await runArtifactWorkflow({plan, run_id: roundRunId, execute: runtime.execute, getRevision: runtime.getRevision,
          record: runtime.record, runCheck: async (check, context) => {
            if (cachedChecks.has(check.id)) {
              await record({event: 'adaptive_public_evidence_reused', round_index: roundIndex,
                check_id: check.id, attempt_id: context.attempt_id, invocation: false});
              return clone(cachedChecks.get(check.id));
            }
            const evidence = await runtime.runCheck(check, context);
            if (check.phase !== 'integration') localEvidence.push(clone({...evidence, task_id: context.task.id,
              attempt_id: context.attempt_id}));
            return evidence;
          }});
        runtimeJournal = await runtime.journalState();
        if (runtimeJournal.status === 'recorded' && !Object.values(workflow.execution.results).some(uncertain)) {
          for (const [id, capture] of captured) {
            const artifacts = {};
            try {
              for (const artifactId of capture.task.output_artifact_ids) {
                const revision = await runtime.getRevision(artifactId, {task: capture.task, plan, attempt_id: capture.context.attempt_id});
                const paths = bindings[artifactId].paths, manifest = await scopedManifest(capture.context.stageDirectory, paths);
                if (digest(manifest) !== revision) fail('ADAPTIVE_EXECUTION_SNAPSHOT_REVISION');
                artifacts[artifactId] = {paths: clone(paths), manifest, revision};
              }
              snapshots.set(id, {directory: capture.context.stageDirectory, artifacts,
                input_artifact_revisions: clone(capture.operation === 'carry_forward'
                  ? snapshots.get(id).input_artifact_revisions : capture.context.input_artifact_revisions),
                validation_input_artifact_revisions: clone(capture.context.input_artifact_revisions),
                verified: workflow.execution.results[id]?.status === 'completed', round_index: roundIndex});
            } catch (error) {
              // An unready or scope-invalid stage is never a repair seed.
              snapshots.delete(id);
              await record({event: 'adaptive_snapshot_unavailable', round_index: roundIndex, task_id: id,
                code: error.code ?? 'SNAPSHOT_UNAVAILABLE'});
            }
          }
        }
        exported = await runtime.finalize(workflow);
        runtimeJournal = exported.journal;
      } catch (error) {
        fatal = {code: error?.code ?? 'ADAPTIVE_EXECUTION_CALLBACK_FAILED', message: error?.message ?? String(error),
          outcome_uncertain: adaptiveOutcomeUncertain(error, {fallback: true}),
          terminal_cause: adaptiveTerminalCause(error, {stage: 'execution', fallbackCode: 'ADAPTIVE_EXECUTION_CALLBACK_FAILED'})};
        if (runtime) runtimeJournal = await runtime.journalState().catch(() => ({status: 'invalid'}));
      } finally {
        // An unconsumed batch (early workflow stop) still settles inside its round,
        // and its unknown outcome is never hidden behind a known workflow failure.
        const batch = roundStartBatch && await roundStartBatch.catch(error => ({uncertain: error?.code ?? 'ADAPTIVE_CHECK_BATCH_RECORD_FAILED'}));
        if (batch?.uncertain) fatal ??= {code: batch.uncertain, outcome_uncertain: true,
          terminal_cause: adaptiveTerminalCause({code: batch.uncertain, outcome_uncertain: true}, {stage: 'execution'})};
        if (runtime) await runtime.close();
      }
      const outcomeUncertain = uncertain(fatal) || ['uncertain', 'invalid'].includes(runtimeJournal?.status) ||
        Object.values(workflow?.execution?.results ?? {}).some(uncertain);
      const status = outcomeUncertain ? 'uncertain' : fatal ? 'failed' : workflow?.status ?? 'failed';
      const profilePreparationFailed = profilePreparationStarted && !profilePreparationCompleted
        && !runtime && !initialization && roundOperations.length === 0;
      const round = {round_index: roundIndex, status, outcome_uncertain: outcomeUncertain, plan, directory: roundDirectory,
        initialization: initialization ?? null, workflow: workflow ?? null, exported: exported ?? null,
        public_evidence: publicEvidence, local_evidence: localEvidence, operations: roundOperations,
        journal: runtimeJournal ?? null, fatal, ...(fatal?.terminal_cause ? {terminal_cause: clone(fatal.terminal_cause)} : {}),
        ...(workerReports.length ? {worker_reports: clone(workerReports)} : {}),
        ...(profilePreparationFailed ? {preparation_failure: {stage: 'profiles', runtime_started: false, worker_started: false},
          prior_public_failure: clone(previousFailure)} : {})};
      rounds.push(round);
      const failedTaskIds = Object.values(workflow?.execution?.results ?? {}).filter(value => value.status !== 'completed' &&
        plan.tasks.find(task => task.id === value.task_id)?.kind === 'implementation').map(value => value.task_id);
      // A failed profile preparation produced no new candidate or public
      // observations. Retain the prior evidence without inventing a repair attempt.
      const failure = profilePreparationFailed && previousFailure ? clone(previousFailure) : {
        status: status === 'completed' ? 'completed' : 'failed', outcome_uncertain: outcomeUncertain,
        code: workflow?.execution?.failure?.code ?? fatal?.code ?? null,
        run_id: roundRunId, graph_revision: plan.graph_revision, catalog_sha256: planning.catalog_sha256 ?? null,
        source_sha256: planning.source_sha256 ?? null, binding_digest: exported?.binding_digest ?? initialization?.binding_digest ?? null,
        environment: clone(initialization?.environment ?? {}),
        task_attempt_ids: Object.fromEntries(Object.values(workflow?.execution?.results ?? {}).map(value => [value.task_id, value.attempt_id])),
        failed_task_ids: failedTaskIds, public_evidence: clone(publicEvidence), local_evidence: clone(localEvidence),
        undispatched_task_ids: clone(workflow?.execution?.undispatched_ids ?? []), round_index: roundIndex,
        artifact_revisions: clone(exported?.artifact_revisions ?? {}),
        ...(recoveryEnabled && previousFailure?.recovery_evidence ? {recovery_evidence: clone(previousFailure.recovery_evidence
          .filter(item => (item.revision ?? item.artifact_revision) === exported?.artifact_revisions?.[item.artifact_id]))} : {})};
      if (causalPolicy && previousFailure && selectedAction && selectedAction.policy !== PARTIAL_REPAIR_POLICY && !profilePreparationFailed) {
        try {
          const attempt = {round_index: roundIndex - 1, action: clone(selectedAction), before_failure: clone(previousFailure),
            after_failure: clone(failure), after_artifact_revisions: clone(failure.artifact_revisions),
            changed_files: repairFileChanges(previousSnapshots, snapshots, plan), status};
          repairAttempts.push(attempt);
          repairHistory = buildCausalRepairHistory({planning, artifactBindings: bindings, attempts: repairAttempts});
          round.repair_history = clone(repairHistory);
          await record({event: 'adaptive_causal_repair_history_updated', round_index: roundIndex, history: repairHistory});
        } catch (error) {
          round.repair_history_unavailable = {code: error.code ?? 'ADAPTIVE_CAUSAL_HISTORY_FAILED', previous_history: clone(repairHistory)};
          await record({event: 'adaptive_causal_repair_history_unavailable', round_index: roundIndex, ...round.repair_history_unavailable});
          if (!round.fatal && status !== 'uncertain') {
            round.status = 'failed'; round.fatal = {code: round.repair_history_unavailable.code, outcome_uncertain: false};
            round.terminal_cause = adaptiveTerminalCause(round.fatal, {stage: 'repair', outcome_uncertain: false});
          }
        }
      }
      await record({event: 'adaptive_round_completed', phase: round.status, round_index: roundIndex, status: round.status,
        outcome_uncertain: round.outcome_uncertain, candidate_path: exported?.candidateDirectory ?? null});
      let assessment = null;
      if (recoveryEnabled) {
        let changedFiles = null;
        if (previousFailure && selectedAction && !profilePreparationFailed) {
          try { changedFiles = repairFileChanges(previousSnapshots, snapshots, plan); } catch { /* Unknown is not zero changes. */ }
        }
        assessment = await recoveryAssessment(round, failure, {changed_files: changedFiles,
          ...(profilePreparationFailed ? {previous_failure: null, previous_action: null, repair_history: null,
            historical_repair_history: null} : {}),
          ...(round.terminal_cause ? {terminal_cause: round.terminal_cause} : {})});
        if (profilePreparationFailed) {
          await recover(round, failure, [], assessment, {stage: 'profiles', failed_decision: true, callback_allowed: false,
            ...(assessment.action === 'rebuild_relevant_input' ? {unsupported_recovery: {
              failed_request_captured: false, canonical_rebuild_supported: false,
              required_handler: 'profile_request_capture_and_verified_reconstruction'}} : {})});
          break;
        }
        if (assessment.action === 'reconcile_request' || ['restore_verification_evidence', 'correct_connection', 'resolve_account', 'wait_provider'].includes(assessment.action)) {
          await recover(round, failure, [], assessment); break;
        }
      }
      if (status === 'completed' || status === 'uncertain' || status === 'blocked' || round.fatal || roundIndex === maxRepairRounds ||
          !knownFailure.has(workflow?.execution?.failure?.code)) break;
      if (options.partialRepairPolicy === PARTIAL_REPAIR_POLICY) {
        try {
          const candidate = buildPartialReadinessRepair({plan, failure, snapshots, artifactBindings: bindings});
          if (candidate) {
            await options.beforeRepairDecision?.({planning: clone(planning), failure: clone(failure),
              candidates: [clone(candidate)], repair_history: clone(repairHistory)},
            {stage: 'local_readiness_repair', round_index: roundIndex});
            await record({event: 'adaptive_partial_repair_committed', round_index: roundIndex,
              candidate, provider_calls: 0, reason: 'exact_runtime_local_check_owner'});
            selectedAction = clone(candidate); selected = new Set(candidate.task_ids); previousFailure = failure;
            previousRepairInputContext = null; round.prior_public_failure = clone(failure);
            actions.push({round_index: roundIndex, status: 'selected', candidate_id: candidate.id, candidate: clone(candidate)});
            continue;
          }
        } catch (error) {
          round.fatal = {code: error.code ?? 'ADAPTIVE_PARTIAL_REPAIR_FAILED', outcome_uncertain: false};
          round.terminal_cause = adaptiveTerminalCause(round.fatal, {stage: 'repair', outcome_uncertain: false});
          round.prior_public_failure = clone(failure); break;
        }
      }
      let candidates;
      if (['minimal-public-v1', 'public-causal-v1', ...INFERRED_SCOPE_POLICIES].includes(options.repairScopePolicy)) {
        try {
          const buildScope = causalPolicy ? buildAdaptiveCausalRepairScope : buildAdaptiveRepairScope;
          const scoped = await buildScope({plan, failure, publicChecks, testRequirements,
            ...(causalPolicy ? {repairHistory} : {}),
            artifactBindings: bindings, sourceFiles: await repairSourceFiles(exported, bindings, plan),
            ...(options.assertionContract ? {assertionContract: options.assertionContract,
              runtimeBinding: JSON.parse(await readFile(join(initialization.root, 'binding.json'), 'utf8'))} : {})});
          candidates = scoped.candidates;
          failure.repair_scope = clone(scoped.analysis);
          round.repair_scope = clone(scoped.analysis);
        } catch (error) {
          round.fatal = {code: error?.code ?? 'ADAPTIVE_REPAIR_SCOPE_FAILED', outcome_uncertain: false};
          round.terminal_cause = adaptiveTerminalCause(error, {stage: 'repair', fallbackCode: 'ADAPTIVE_REPAIR_SCOPE_FAILED', outcome_uncertain: false});
          round.prior_public_failure = clone(failure);
          break;
        }
      } else candidates = repairCandidates(plan, failure, publicChecks, testRequirements);
      if (options.artifactRepairPolicy) {
        const missing = candidates.filter(candidate => candidate.artifact_ids === undefined);
        if (missing.length) {
          failure.artifact_repair_fallback = {reason: 'ASSERTION_ARTIFACT_MAPPING_UNAVAILABLE',
            candidate_ids: missing.map(candidate => candidate.id), scope: 'all_outputs_of_selected_tasks'};
          candidates = candidates.map(candidate => candidate.artifact_ids !== undefined ? candidate : {...candidate,
            artifact_ids: candidate.task_ids.flatMap(id => plan.tasks.find(task => task.id === id).output_artifact_ids)});
        }
      }
      round.prior_public_failure = clone(failure);
      if (recoveryEnabled && assessment?.status !== 'continue') {
        const recovered = await recover(round, failure, candidates, assessment, {stage: inferredPolicy ? 'repair_owners' : 'repair'});
        if (!recovered.ready) break;
      }
      // Preserved-candidate authorization must precede both paid inference and
      // repair selection. A known failed gate is not a provider uncertainty.
      let repairInputContext = null, publicOwnerEvidence = null, verifiedRepairContext = null;
      try {
        if (options.publicOwnerEvidencePolicy) {
          publicOwnerEvidence = await collectPublicOwnerEvidence({planning, failure, candidateDirectory: exported.candidateDirectory,
            assertionContract: options.assertionContract, runtimeBinding: JSON.parse(await readFile(join(initialization.root, 'binding.json'), 'utf8'))});
          await record({event: 'adaptive_public_owner_evidence_committed', round_index: roundIndex, evidence: publicOwnerEvidence});
        }
        if (options.repairDispatchPolicy) {
          verifiedRepairContext = buildVerifiedRepairContext({planning, failure, repairHistory, workerReports,
            sources: await repairSourceFiles(exported, bindings, plan, {includeTemplates: true})});
          await record({event: 'adaptive_verified_repair_context_committed', round_index: roundIndex,
            policy: options.repairDispatchPolicy, context: verifiedRepairContext});
        }
        if (options.beforeRepairDecision) await options.beforeRepairDecision({planning: clone(planning),
          failure: clone(failure), candidates: clone(candidates), repair_history: clone(repairHistory)},
        {stage: inferredPolicy ? 'repair_owners' : 'repair', round_index: roundIndex});
        if (options.repairInputPolicy && options.assertionContract) repairInputContext = {
          assertionContract: clone(options.assertionContract), runtimeBinding: JSON.parse(await readFile(join(initialization.root, 'binding.json'), 'utf8'))};
        if (inferredPolicy) {
          let inference, requestOverride = null, ownerStopped = false;
          while (true) {
            let failedRequest;
            inference = await inferAdaptiveRepairOwners({planning: clone(planning), failure: clone(failure),
              candidates: clone(candidates), artifactBindings: clone(bindings), ownerInputPolicy,
              ...(options.repairInputPolicy ? {repairInputPolicy: options.repairInputPolicy,
                ...(repairInputContext ? {repairInputContext} : {})} : {}),
              ...(requestOverride ? {requestOverride} : {}),
              decide: async (body, metadata) => {
                failedRequest = clone(body);
                let sent = body;
                if (publicOwnerEvidence && !requestOverride) sent = attachPublicOwnerEvidence(sent, publicOwnerEvidence);
                if (verifiedRepairContext && !requestOverride) {
                  sent = attachVerifiedRepairContext(sent, verifiedRepairContext);
                  const projection = sent.state.verified_repair_context;
                  await record({event: 'adaptive_verified_repair_context_attached', round_index: roundIndex,
                    context_sha256: verifiedRepairContext.sha256, attached: !!projection,
                    model_projection_bytes: projection ? Buffer.byteLength(JSON.stringify(projection)) : 0,
                    model_projection_sha256: projection ? digest(projection) : null,
                    reason: projection ? 'bounded_source_identifier_hints' : 'no_case_level_source_hints_original_evidence_retained',
                    question_sha256: digest(sent.questions), automatic_owner_additions: 0, skipped_workers: 0});
                }
                // A recovery override is bound to its exact request hash, so it never gains diagnostics or repacking.
                if (options.repairFeedback?.worker_diagnostics && workerReports.length && !requestOverride) {
                  const diagnostics = workerDiagnostics(workerReports, snapshots);
                  sent = {...sent, state: {...sent.state, worker_diagnostics: diagnostics}};
                  await record({event: 'adaptive_worker_diagnostics_attached', round_index: roundIndex, stage: 'repair_owners', diagnostics});
                }
                // Opt-in D076 budget: lossy owner packing after the canonical projections; over budget stops before any POST.
                if (options.repairBudget?.policy === 'repair-budget-v1' && !requestOverride) {
                  const packed = packRepairOwnerRequest(sent, {policy: options.repairBudget.policy});
                  await record({event: 'adaptive_repair_budget_applied', round_index: roundIndex, stage: 'repair_owners', report: packed.report});
                  if (!packed.report.within_budget) fail(ADAPTIVE_REPAIR_BUDGET_EXCEEDED, {estimated_tokens: packed.report.after.estimated_tokens});
                  sent = packed.request;
                } else if (options.repairBudget && !requestOverride) {
                  // v2 may split one owner decision into focused parts; their answers merge into one response
                  // for the unchanged inference check. A failed or uncertain part stops; earlier parts are never resent.
                  const plan = planRepairOwnerRequest(sent, {policy: options.repairBudget.policy});
                  await record({event: 'adaptive_repair_budget_applied', round_index: roundIndex, stage: 'repair_owners', report: plan.report});
                  if (!plan.report.within_budget) fail(ADAPTIVE_REPAIR_BUDGET_EXCEEDED, {reason: plan.report.reason,
                    estimated_tokens: plan.report.after?.estimated_tokens ?? null});
                  if (plan.parts.length > 1) {
                    const answers = {}, parts = [];
                    for (const part of plan.parts) {
                      const response = await options.decideRepairOwners(part.request,
                        {...metadata, owner_split: {part: part.report.part, parts: plan.parts.length}});
                      await record({event: 'adaptive_repair_owner_part_completed', round_index: roundIndex, stage: 'repair_owners',
                        part: part.report.part, parts: plan.parts.length, question_ids: part.question_ids, answered: !!response?.answers});
                      if (!response || typeof response.answers !== 'object' || response.answers === null) return response;
                      for (const id of part.question_ids) answers[id] = response.answers[id];
                      parts.push({part: part.report.part, question_ids: part.question_ids, response});
                    }
                    return {answers, owner_split: {policy: options.repairBudget.policy, parts}};
                  }
                  sent = plan.parts[0].request;
                }
                return options.decideRepairOwners(sent, {...metadata, ...(requestOverride ? {recovery: clone(requestOverride.recovery)} : {})});
              }, record});
            round.owner_inference = clone(inference);
            await record({event: 'adaptive_repair_owner_inference_committed', round_index: roundIndex, inference});
            if (inference.status === 'inferred' && (!recoveryEnabled || !inference.unknown_failure_ids?.length)) break;
            if (!recoveryEnabled) { ownerStopped = true; break; }
            const inferredCause = inference.terminal_cause ?? adaptiveTerminalCause({code: 'ADAPTIVE_UNKNOWN_OWNER', outcome_uncertain: false}, {stage: 'repair_owners'});
            const ownerAssessment = await recoveryAssessment(round, {...failure, owner_unknown: !!inference.unknown_failure_ids?.length}, {terminal_cause: inferredCause});
            const recovered = await recover(round, failure, candidates, ownerAssessment, {stage: 'repair_owners', failed_request: failedRequest, failed_decision: true});
            if (!recovered.ready) { ownerStopped = true; break; }
            requestOverride = recovered.rebuild ?? null;
          }
          if (ownerStopped) {
            if (!recoveryEnabled) {
              round.status = inference.outcome_uncertain ? 'uncertain' : 'failed';
              round.outcome_uncertain = inference.outcome_uncertain;
              round.terminal_cause = clone(inference.terminal_cause);
            }
            break;
          }
          const scopeExpansion = options.repairFeedback?.scope_expansion && workerReports.length
            ? {diagnostics: workerDiagnostics(workerReports, snapshots), persistent_failure_keys: clone(repairHistory?.entries?.at(-1)?.persistent_failure_keys ?? [])}
            : null;
          let inferred = applyInferredRepairOwners({planning, failure, candidates, artifactBindings: bindings, ownerInputPolicy, inference,
            ...(options.repairInputPolicy ? {repairInputPolicy: options.repairInputPolicy,
              ...(repairInputContext ? {repairInputContext} : {})} : {}), ...(requestOverride ? {requestOverride} : {})});
          if (scopeExpansion) inferred = withWorkerMentionedScope(inferred, {plan: planning.plan, ...scopeExpansion});
          if (publicOwnerEvidence) inferred = applyPublicOwnerEvidenceScope(inferred, {plan: planning.plan, evidence: publicOwnerEvidence, failure});
          candidates = inferred.candidates;
          failure.repair_scope = clone(inferred.analysis);
          round.repair_scope = clone(inferred.analysis);
          round.prior_public_failure = clone(failure);
        }
      } catch (error) {
        const stage = inferredPolicy ? 'repair_owners' : 'repair';
        const outcome_uncertain = adaptiveOutcomeUncertain(error, {fallback: false});
        round.status = outcome_uncertain ? 'uncertain' : 'failed'; round.outcome_uncertain = outcome_uncertain;
        round.fatal = {code: error?.code ?? 'ADAPTIVE_REPAIR_PRECONDITION_FAILED', outcome_uncertain};
        round.terminal_cause = adaptiveTerminalCause(error, {stage, fallbackCode: 'ADAPTIVE_REPAIR_PRECONDITION_FAILED', outcome_uncertain});
        if (recoveryEnabled) {
          const blocked = await recoveryAssessment(round, failure, {terminal_cause: round.terminal_cause});
          // A failed authorization/check prerequisite cannot be replaced by a
          // source investigation or bypassed as a provider retry.
          await recover(round, failure, candidates, blocked, {stage, callback_allowed: false});
        }
        break;
      }
      let decision, repairStopped = false, requestOverride = null;
      while (true) {
        let failedRequest;
        await record({event: 'adaptive_repair_decision_started', phase: 'started', round_index: roundIndex, candidates, failure});
        try {
          decision = await decideRepair({planning: clone(planning), failure: clone(failure), candidates: clone(candidates),
            ...(options.repairInputPolicy ? {repairInputPolicy: options.repairInputPolicy,
              ...(repairInputContext ? {repairInputContext} : {})} : {}),
            limits: {max_repair_attempts: maxRepairRounds, repair_attempts_used: roundIndex}},
          {stage: 'repair', round_index: roundIndex, ...(recoveryEnabled ? {on_request: body => { failedRequest = clone(body); }} : {}),
            ...(requestOverride ? {recovery: clone(requestOverride.recovery), request_override: clone(requestOverride)} : {})});
        } catch (error) {
          const outcome_uncertain = adaptiveOutcomeUncertain(error, {fallback: true});
          decision = {status: outcome_uncertain ? 'uncertain' : 'stopped', outcome_uncertain,
            reason: error?.code ?? 'REPAIR_CALLBACK_THROW',
            terminal_cause: adaptiveTerminalCause(error, {stage: 'repair', fallbackCode: 'REPAIR_CALLBACK_THROW', outcome_uncertain})};
        }
        await record({event: 'adaptive_repair_decision_completed', phase: uncertain(decision) ? 'uncertain' : 'completed',
          round_index: roundIndex, decision});
        round.repair_decision = clone(decision);
        const valid = decision?.status === 'selected' && candidates.some(candidate => candidate.id === decision.candidate_id
          && (decision.candidate === undefined || isDeepStrictEqual(candidate, decision.candidate)));
        if (valid) break;
        if (!recoveryEnabled) { repairStopped = true; break; }
        const cause = adaptiveTerminalCause({...decision, code: decision?.reason ?? 'ADAPTIVE_EXECUTION_INVALID_REPAIR_SELECTION'},
          {stage: 'repair', fallbackCode: 'ADAPTIVE_REPAIR_DECISION_FAILED', outcome_uncertain: uncertain(decision)});
        const repairAssessment = await recoveryAssessment(round, failure, {terminal_cause: cause});
        const recovered = await recover(round, failure, candidates, repairAssessment, {stage: 'repair', failed_request: failedRequest, failed_decision: true});
        if (!recovered.ready) { repairStopped = true; break; }
        requestOverride = recovered.rebuild ?? null;
      }
      if (repairStopped && recoveryEnabled) { actions.push(clone(decision)); break; }
      if (uncertain(decision) || decision?.status === 'stopped') {
        round.terminal_cause = adaptiveTerminalCause({...decision, code: decision?.reason},
          {stage: 'repair', fallbackCode: 'ADAPTIVE_REPAIR_DECISION_FAILED', outcome_uncertain: uncertain(decision)});
      }
      if (uncertain(decision)) { round.status = 'uncertain'; round.outcome_uncertain = true; break; }
      if (decision?.status === 'stopped') { actions.push(clone(decision)); break; }
      const chosen = candidates.find(candidate => candidate.id === decision?.candidate_id);
      if (decision?.status !== 'selected' || !chosen ||
          (decision.candidate !== undefined && !isDeepStrictEqual(decision.candidate, chosen))) {
        round.fatal = {code: 'ADAPTIVE_EXECUTION_INVALID_REPAIR_SELECTION', outcome_uncertain: false};
        round.terminal_cause = adaptiveTerminalCause(round.fatal, {stage: 'repair', outcome_uncertain: false}); break;
      }
      if (publicOwnerEvidence) {
        try { assertPublicOwnerEvidenceCoverage(chosen, publicOwnerEvidence); }
        catch (error) {
          round.fatal = {code: error.code, outcome_uncertain: false};
          round.terminal_cause = adaptiveTerminalCause(round.fatal, {stage: 'repair', outcome_uncertain: false}); break;
        }
      }
      if (chosen.scope_expansion) await record({event: 'adaptive_repair_scope_expanded', round_index: roundIndex,
        expansion: clone(chosen.scope_expansion), artifact_ids: clone(chosen.artifact_ids), task_ids: clone(chosen.task_ids)});
      selectedAction = clone(chosen); selected = new Set(chosen.task_ids); previousFailure = failure;
      previousRepairInputContext = clone(repairInputContext);
      actions.push({round_index: roundIndex, ...clone(decision), candidate: clone(chosen)});
    }
    const last = rounds.at(-1);
    const candidateRound = last.preparation_failure
      ? rounds.findLast(round => round.exported?.candidateDirectory && round.public_evidence.length > 0 && !round.outcome_uncertain) ?? last
      : last;
    result = {schema_version: 'adaptive-dag-execution/v1', run_id, status: last.status, outcome_uncertain: last.outcome_uncertain,
      terminal_cause: clone(last.terminal_cause ?? null),
      stop_code: last.terminal_cause?.code ?? last.fatal?.code ?? last.workflow?.execution?.failure?.code ?? null,
      prior_public_failure: clone(last.prior_public_failure ?? null),
      rounds, repair_actions: actions, repair_rounds_used: rounds.filter(round => round.round_index > 0 && !round.preparation_failure).length, operations,
      ...(causalPolicy ? {repair_history: clone(repairHistory)} : {}),
      ...(recoveryEnabled ? {failure_recovery: {policy: loadAdaptiveFailureRecoveryPolicy(), actions: clone(recoveryActions),
        terminal: clone(last.recovery_state ?? last.recovery_assessment ?? null), historical_repair_history: clone(options.historicalRepairHistory ?? null)}} : {}),
      candidate_path: candidateRound.exported?.candidateDirectory ?? null, artifact_revisions: candidateRound.exported?.artifact_revisions ?? {},
      ...(candidateRound !== last ? {candidate_basis: {round_index: candidateRound.round_index,
        reason: 'retained_export_before_profile_preparation_failure', failed_round_index: last.round_index}} : {}),
      public_evidence: clone(candidateRound.public_evidence), product_success: null, independent_grade: 'not_run',
      replay_allowed: false, directory, journal_path: join(directory, 'journal.jsonl')};
    await record({event: 'adaptive_execution_completed', phase: result.status, status: result.status,
      outcome_uncertain: result.outcome_uncertain, repair_rounds_used: result.repair_rounds_used, operations});
    await writeFile(join(directory, 'result.json'), JSON.stringify(result, null, 2), {flag: 'wx', mode: 0o444});
    return clone(result);
  } finally {
    await queue; await handle.close();
  }
}
