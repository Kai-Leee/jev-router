import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {resolve, join, relative, isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(JSON.stringify(value));
const need = (ok, code = 'CODEX_WORKER_HISTORY_INVALID') => {if (!ok) throw Object.assign(new Error(code), {code});};
const sorted = values => [...new Set(values ?? [])].sort();
const rows = value => Array.isArray(value) ? value : value?.columns && value?.rows
  ? value.rows.map(row => Object.fromEntries(value.columns.map((key, index) => [key, row[index]]))) : [];
const seal = value => ({...value, sha256: digest(value)});
const scope = (task, operation) => digest({operation, paths: sorted(task.write_scope), requirements: sorted(task.requirement_ids)});

function publicCases(round) {
  const cases = new Map();
  for (const check of round?.public_evidence ?? []) for (const entry of rows(check.evidence?.cases)) {
    const item = {...entry, ...(entry.details ?? {})};
    cases.set(item.test_id ?? item.id, {status: check.executed === true && check.outcome_uncertain === false
      && !!round.exported?.binding_digest && check.runtime_binding?.binding_digest === round.exported.binding_digest
      && ['passed', 'failed'].includes(item.status) ? item.status : 'unknown',
    message_sha256: typeof item.message === 'string' ? digest(item.message) : null, check_id: check.check_id});
  }
  return cases;
}

function publicOutcome(states) {
  return states.some(row => row.after === 'failed') ? 'failure'
    : states.length > 0 && states.every(row => row.after === 'passed') ? 'success' : 'unknown';
}

/** Public-only observation counts, not attribution of a shared suite's result to a model. */
export function summarizeWorkerOutcomes(observations) {
  const count = predicate => observations.filter(predicate).length;
  const success = count(row => row.public_outcome === 'success'), failure = count(row => row.public_outcome === 'failure');
  const sumKnown = field => {const known = observations.filter(row => Number.isFinite(row[field]));
    return {observed: known.length, denominator: observations.length, sum: known.reduce((n, row) => n + row[field], 0),
      mean: known.length ? known.reduce((n, row) => n + row[field], 0) / known.length : null};};
  return {samples: observations.length, public_success: {success, failure, unknown: observations.length - success - failure,
    denominator: observations.length, known_denominator: success + failure, rate: success + failure ? success / (success + failure) : null},
  noop: {count: count(row => row.noop === true), known_denominator: count(row => row.noop !== null), denominator: observations.length},
  rework: {count: count(row => row.later_repair === true), denominator: observations.length},
  repeated_same_input: {count: count(row => row.repeat_input === true), denominator: observations.length},
  ineffective_noop: {count: count(row => row.noop === true && row.public_outcome === 'failure'), denominator: observations.length},
  model_identity: {verified: count(row => row.model_identity_verified === true), unknown: count(row => row.model_identity_verified !== true), denominator: observations.length},
  case_transitions: {...observations.reduce((sum, row) => {for (const [key, value] of Object.entries(row.transitions)) sum[key] = (sum[key] ?? 0) + value; return sum;},
    {failed_to_passed: 0, failed_to_failed: 0, passed_to_failed: 0, unknown_after: 0}),
    denominator: observations.reduce((n, row) => n + row.public_cases.length, 0),
    observed_after: observations.reduce((n, row) => n + row.public_cases.filter(item => item.after !== 'unknown').length, 0)},
  worker_wall_ms: sumKnown('wall_ms'), input_tokens: sumKnown('input_tokens'), output_tokens: sumKnown('output_tokens')};
}

/** Explicit arm paths only. This reader never opens result/grade files or scans hidden assets. */
export function buildCodexWorkerOutcomes({arms, testRequirements, mappingSourceRefs = []}) {
  need(Array.isArray(arms) && arms.length > 0 && Array.isArray(testRequirements));
  const sources = new Map(), observations = [], excluded = [];
  const remember = path => {const absolute = resolve(path), raw = readFileSync(absolute);
    sources.set(absolute, {path: absolute, sha256: hash(raw), bytes: raw.length}); return raw;};
  const read = path => JSON.parse(remember(path));
  for (const ref of mappingSourceRefs) remember(ref);
  const mapping = new Map(testRequirements.map(row => [row.test_id ?? row.id, sorted(row.requirement_ids ?? row.requirement_refs)]));
  need(mapping.size === testRequirements.length && [...mapping.values()].every(value => value.length));
  for (const arm of arms) {
    const directory = resolve(arm.directory), executionPath = join(directory, 'execution.json'), planningPath = join(directory, 'planning.json');
    if (!existsSync(executionPath) || !existsSync(planningPath) || !existsSync(join(directory, 'codex-workers'))) {
      excluded.push({id: arm.id, reason: 'MISSING_PUBLIC_EXECUTION_OR_WORKERS'}); continue;
    }
    const execution = read(executionPath), planning = read(planningPath), rounds = execution.rounds ?? [];
    for (const workerDir of readdirSync(join(directory, 'codex-workers')).sort()) {
      const base = join(directory, 'codex-workers', workerDir), receiptPath = join(base, 'receipt.json');
      if (!existsSync(receiptPath)) continue;
      const receipt = read(receiptPath), originalPath = join(base, 'worker-input-original.json');
      const requestPath = join(base, 'provider/request.json');
      let packet, request;
      if (existsSync(originalPath)) packet = read(originalPath);
      if (existsSync(requestPath)) {request = read(requestPath); if (!packet) {
        try {packet = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n') + 1));} catch {}}
      }
      if (!packet?.task || !Array.isArray(receipt.files)) {excluded.push({id: `${arm.id}/${workerDir}`, reason: 'MISSING_TASK_OR_OUTPUT_RECEIPT'}); continue;}
      const round = rounds.find(row => row.round_index === receipt.round_index), previous = rounds.find(row => row.round_index === receipt.round_index - 1);
      const task = packet.task, operation = receipt.operation ?? packet.operation, outputs = receipt.files;
      const revisions = round?.exported?.artifact_revisions ?? {}, candidate = round?.exported?.candidateDirectory;
      const outputArtifacts = (task.output_artifact_ids ?? []).filter(id => planning.artifactBindings?.[id]?.paths?.some(path => outputs.some(file => file.path === path)));
      const identityBound = receipt.task_id === task.id && receipt.round_index === packet.round_index
        && receipt.operation === packet.operation && (!packet.execution_model
          || (packet.execution_model.model === receipt.requested_model && packet.execution_model.effort === receipt.requested_effort))
        && (!request || (request.model === receipt.requested_model && request.effort === receipt.requested_effort));
      const filesBound = identityBound && receipt.status === 'completed' && receipt.outcome_uncertain === false && !!candidate && outputs.length > 0
        && outputs.every(file => {
          const path = resolve(candidate, file.path), rel = relative(resolve(candidate), path);
          return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../') && task.write_scope.includes(file.path)
            && existsSync(path) && hash(remember(path)) === file.sha256;
        });
      const relevantTests = [...mapping].filter(([, ids]) => ids.some(id => task.requirement_ids.includes(id))).map(([id]) => id);
      const before = publicCases(previous), after = publicCases(round);
      const checksBound = outputArtifacts.length > 0 && (round?.public_evidence?.length ?? 0) > 0
        && round.public_evidence.every(check => outputArtifacts.every(id => revisions[id] && check.artifact_revisions?.[id] === revisions[id])
          && check.runtime_binding?.binding_digest === round.exported.binding_digest);
      const bindingValid = filesBound && checksBound;
      const states = relevantTests.map(id => ({test_id: id, before: before.get(id)?.status ?? 'unknown',
        after: bindingValid ? after.get(id)?.status ?? 'unknown' : 'unknown'}));
      const transitions = {failed_to_passed: 0, failed_to_failed: 0, passed_to_failed: 0, unknown_after: 0};
      for (const row of states) {
        if (row.before === 'failed' && row.after === 'passed') transitions.failed_to_passed++;
        if (row.before === 'failed' && row.after === 'failed') transitions.failed_to_failed++;
        if (row.before === 'passed' && row.after === 'failed') transitions.passed_to_failed++;
        if (row.after === 'unknown') transitions.unknown_after++;
      }
      const available = new Map((packet.available_files ?? []).map(file => [file.path, file.sha256 ?? hash(file.content)]));
      const noopKnown = operation === 'repair' && filesBound && outputs.every(file => available.has(file.path));
      const failure = packet.artifact_repair?.failure ?? null;
      const signature = digest({operation, scope: scope(task, operation), input_revisions: packet.input_artifact_revisions ?? {},
        available_files: [...available].sort(([a], [b]) => a.localeCompare(b)), failure,
        public_guidance: packet.public_docstring_guidance ?? null, verified_repair_context: packet.artifact_repair?.verified_repair_context ?? null});
      const usage = receipt.provider?.usage ?? {};
      observations.push({id: `${arm.id}/${workerDir}`, arm_id: arm.id, round_index: receipt.round_index,
        task_id: receipt.task_id, operation, model: receipt.requested_model ?? request?.model ?? 'unknown',
        effort: receipt.requested_effort ?? request?.effort ?? 'unknown', profile_basis: 'requested_CLI_not_guaranteed_served_identity',
        model_identity_verified: receipt.provider?.model_identity_verified === true,
        exact_scope_sha256: scope(task, operation), write_paths: sorted(task.write_scope), requirement_ids: sorted(task.requirement_ids),
        source_sha256: planning.source_sha256, binding_valid: bindingValid, worker_identity_bound: identityBound,
        files_bound: filesBound, public_checks_bound: checksBound,
        artifact_revision_ids: Object.fromEntries(outputArtifacts.map(id => [id, revisions[id] ?? null])),
        input_signature_sha256: signature, noop: noopKnown ? outputs.every(file => available.get(file.path) === file.sha256) : null,
        later_repair: false, repeat_input: false, public_outcome: publicOutcome(states),
        public_cases: states, transitions, wall_ms: Number.isFinite(receipt.provider?.wall_ms) ? receipt.provider.wall_ms : receipt.wall_ms ?? null,
        input_tokens: Number.isSafeInteger(usage.input_tokens) ? usage.input_tokens : null,
        output_tokens: Number.isSafeInteger(usage.output_tokens) ? usage.output_tokens : null});
    }
  }
  observations.sort((a, b) => a.arm_id.localeCompare(b.arm_id) || a.round_index - b.round_index || a.id.localeCompare(b.id));
  for (const row of observations) {
    row.later_repair = observations.some(other => other.arm_id === row.arm_id && other.round_index > row.round_index
      && other.operation === 'repair' && other.write_paths.some(path => row.write_paths.includes(path)));
    row.repeat_input = observations.some(other => other.arm_id === row.arm_id && other.round_index < row.round_index
      && other.input_signature_sha256 === row.input_signature_sha256);
  }
  const profileKeys = sorted(observations.map(row => JSON.stringify([row.model, row.effort])));
  const sourceRefs = [...sources.values()].sort((a, b) => a.path.localeCompare(b.path));
  return seal({schema_version: 'codex-worker-outcomes/v1', created_at: new Date().toISOString(),
    outcome_definition: 'Requirement-associated public-case outcome after a revision-bound worker attempt; shared-suite correlation, not causal model ability or product completion.',
    hidden_or_independent_data_included: false, source_manifest_sha256: digest(sourceRefs), source_refs: sourceRefs,
    test_requirement_mapping_sha256: digest([...mapping]), excluded, observations,
    profiles: profileKeys.map(key => {const [model, effort] = JSON.parse(key); return {model, effort,
      ...summarizeWorkerOutcomes(observations.filter(row => row.model === model && row.effort === effort))};}),
    limitations: ['Tasks, source policies and worker grouping differ across runs; observations are not randomized model comparisons.',
      'Unexecuted, absent, unbound or partial public coverage is unknown. A public failure associated with a requirement is not fault attribution.',
      'Requested model/effort is distinct from verified served identity. Other efforts with no samples remain unknown.',
      'A later repair is observed rework, not proof that the earlier worker caused its need. No signature automatically blocks execution.']});
}

export function verifyHistoryEvidence(snapshot, {expectedSha256 = null} = {}) {
  need(snapshot?.schema_version === 'codex-worker-outcomes/v1' && snapshot.hidden_or_independent_data_included === false
    && Array.isArray(snapshot.observations) && Array.isArray(snapshot.source_refs));
  const {sha256, ...body} = snapshot;
  need(sha256 === digest(body) && (!expectedSha256 || expectedSha256 === sha256), 'CODEX_WORKER_HISTORY_BINDING');
  need(snapshot.source_manifest_sha256 === digest(snapshot.source_refs), 'CODEX_WORKER_HISTORY_SOURCE_BINDING');
  const expectedProfiles = sorted(snapshot.observations.map(row => JSON.stringify([row.model, row.effort])))
    .map(key => {const [model, effort] = JSON.parse(key); return {model, effort,
      ...summarizeWorkerOutcomes(snapshot.observations.filter(row => row.model === model && row.effort === effort))};});
  need(isDeepStrictEqual(snapshot.profiles, expectedProfiles), 'CODEX_WORKER_HISTORY_AGGREGATE_BINDING');
  return {sha256, source_manifest_sha256: snapshot.source_manifest_sha256};
}

export function verifyHistorySources(snapshot) {
  verifyHistoryEvidence(snapshot);
  for (const ref of snapshot.source_refs) need(hash(readFileSync(ref.path)) === ref.sha256, 'CODEX_WORKER_HISTORY_SOURCE_CHANGED');
  return {sources: snapshot.source_refs.length};
}

/** Bounded model-facing view: public aggregate statistics only, no raw source paths or messages. */
export function projectWorkerOutcomeEvidence(snapshot, {task, operation, profiles}) {
  verifyHistoryEvidence(snapshot);
  need(task && Array.isArray(task.write_scope) && Array.isArray(task.requirement_ids) && ['implementation', 'repair'].includes(operation)
    && Array.isArray(profiles) && profiles.length <= 32, 'CODEX_WORKER_HISTORY_QUERY_INVALID');
  const exact = scope(task, operation), reqs = new Set(task.requirement_ids), seen = new Set();
  const profileRows = profiles.map(profile => {
    const key = JSON.stringify([profile.model, profile.effort]); need(!seen.has(key)); seen.add(key);
    const all = snapshot.observations.filter(row => row.model === profile.model && row.effort === profile.effort);
    return {model: profile.model, effort: profile.effort, global: summarizeWorkerOutcomes(all),
      exact_scope: summarizeWorkerOutcomes(all.filter(row => row.exact_scope_sha256 === exact)),
      requirement_overlap: summarizeWorkerOutcomes(all.filter(row => row.operation === operation && row.requirement_ids.some(id => reqs.has(id))))};
  });
  const body = {schema_version: 'codex-worker-empirical/v1', snapshot_sha256: snapshot.sha256,
    source_manifest_sha256: snapshot.source_manifest_sha256, query: {exact_scope_sha256: exact, operation},
    outcome_definition: snapshot.outcome_definition, profiles: profileRows, source_refs_access: 'controller_only_not_retrievable',
    limitations: snapshot.limitations};
  return {...body, evidence_sha256: digest(body)};
}

export function verifyEmpiricalEvidence(summary, {snapshot, task, operation, profiles, expectedSha256 = null}) {
  verifyHistoryEvidence(snapshot, {expectedSha256});
  need(isDeepStrictEqual(summary, projectWorkerOutcomeEvidence(snapshot, {task, operation, profiles})), 'CODEX_WORKER_EMPIRICAL_BINDING');
  return true;
}
