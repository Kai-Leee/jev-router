import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const path = 'docs/orchestration/contracts/adaptive-verified-repair-context.v1.json';
const bytes = readFileSync(new URL(`../../${path}`, import.meta.url));
const contract = JSON.parse(bytes);
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => hash(JSON.stringify(canonical(value)));
const need = (condition, code = 'ADAPTIVE_VERIFIED_REPAIR_CONTEXT_INVALID') => {
  if (!condition) throw Object.assign(new Error(code), {code, outcome_uncertain: false});
};
export const VERIFIED_REPAIR_CONTEXT_POLICY = contract.policy;
export const verifiedRepairContextPolicy = () => ({...structuredClone(contract), source: {path, sha256: hash(bytes)}});
const words = value => value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().match(/[a-z]{4,}/g)?.map(word =>
  word.endsWith('ies') ? `${word.slice(0, -3)}y` : word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word) ?? [];
const ref = (check, row = {}) => ({check_id: check.check_id, test_id: row.test_id ?? row.id ?? null,
  assertion_id: row.failed_assertion_id ?? row.assertion_id ?? null});

/** Search hints are kept separate from sealed required-owner evidence. The
 * caller supplies bytes already checked against the current candidate manifest;
 * content and artifact revisions are checked again before a snippet is exposed. */
export function buildVerifiedRepairContext({planning, failure, sources, repairHistory, workerReports = []}) {
  need(planning?.plan && planning?.catalog && failure?.outcome_uncertain === false && Array.isArray(sources));
  const checks = failure.public_evidence ?? [], observations = [];
  const coverage = checks.map(check => {
    need(check.executed === true && check.outcome_uncertain === false, 'ADAPTIVE_VERIFIED_REPAIR_CONTEXT_UNCERTAIN');
    const evidence = check.evidence ?? {}, cases = evidence.cases ?? [];
    for (const row of cases) if (row.status === 'failed') observations.push({...ref(check, row), message: row.message ?? ''});
    if (check.status === 'failed' && evidence.error) observations.push({...ref(check), message: evidence.error.message ?? ''});
    return {check_id: check.check_id, status: check.status, executed: check.executed, assertions: check.assertions ?? null,
      skipped: check.skipped ?? null, failed_cases: cases.filter(row => row.status === 'failed').map(row => ref(check, row)),
      check_error: evidence.error ? {code: evidence.error.code ?? evidence.error.error_type ?? null,
        message_sha256: digest(evidence.error.message ?? '')} : null,
      unexecuted_test_ids: structuredClone(evidence.unexecuted_test_ids ?? check.unexecuted_test_ids ?? [])};
  });
  const tokens = observations.map(row => new Set(words(row.message))), allMatches = [], sourceIndex = [];
  const ordered = [...sources].sort((a, b) => a.path.localeCompare(b.path));
  for (const source of ordered) {
    const artifact = planning.plan.artifacts.find(row => row.id === source.artifact_id);
    const owner = planning.plan.tasks.find(row => row.id === artifact?.producer_task_id);
    const declared = planning.catalog.artifacts.find(row => row.id === source.artifact_id);
    need(owner?.kind === 'implementation' && owner.output_artifact_ids.includes(source.artifact_id)
      && declared?.paths.some(path => source.path === path || source.path.startsWith(`${path}/`))
      && typeof source.content === 'string' && hash(source.content) === source.sha256
      && source.artifact_revision === failure.artifact_revisions?.[source.artifact_id], 'ADAPTIVE_VERIFIED_REPAIR_CONTEXT_SOURCE_DRIFT');
    sourceIndex.push({artifact_id: source.artifact_id, owner_task_id: owner.id, path: source.path,
      sha256: source.sha256, artifact_revision: source.artifact_revision});
    const lines = source.content.split('\n'), matches = [];
    for (let index = 0; index < lines.length; index++) {
      const identifiers = [...new Set(lines[index].match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])];
      const matched = [];
      for (let observation = 0; observation < observations.length; observation++) {
        const identifiersMatched = identifiers.filter(identifier => {
          const parts = [...new Set(words(identifier))];
          return parts.length >= 2 && parts.filter(part => tokens[observation].has(part)).length >= 2;
        });
        if (identifiersMatched.length) matched.push({observation, identifiers: identifiersMatched});
      }
      if (!matched.length) continue;
      const start = Math.max(0, index - contract.context_lines_before), end = Math.min(lines.length, index + contract.context_lines_after + 1);
      const full = lines.slice(start, end).join('\n');
      const column = Math.max(0, lines[index].indexOf(matched[0].identifiers[0]) - 30);
      matches.push({...sourceIndex.at(-1), line: index + 1, start_line: start + 1, end_line: end,
        excerpt: full.slice(0, contract.max_excerpt_characters), excerpt_truncated: full.length > contract.max_excerpt_characters,
        matched_line_excerpt: lines[index].slice(column, column + contract.model_source_line_max_characters),
        matched_line_start_column: column + 1, matched_line_sha256: hash(lines[index]),
        excerpt_sha256: hash(full), matched, basis: 'public_message_compound_identifier_match_not_fault_proof'});
    }
    // Preserve deterministic coverage of multiple files rather than spending the
    // entire snippet budget on the first large template.
    allMatches.push(...matches.slice(0, contract.max_windows_per_source));
  }
  const selected = allMatches.slice(0, contract.max_source_windows), last = repairHistory?.entries?.at(-1);
  const mentioned = new Set(workerReports.flatMap(row => sourceIndex.filter(source =>
    row.final_response.includes(source.path)).map(source => source.path)));
  const visibleSources = sourceIndex.filter(source => mentioned.has(source.path) || selected.some(window => window.path === source.path));
  const windows = selected.map(({artifact_id, owner_task_id, path, sha256, artifact_revision, ...window}) =>
    ({source_ref: visibleSources.findIndex(source => source.path === path), ...window}));
  const previous = last ? {round_index: last.round_index, selected_artifact_ids: last.selected_artifact_ids,
    changed_artifact_ids: last.changed_artifact_ids, selected_but_unchanged_artifact_ids: last.selected_but_unchanged_artifact_ids,
    persistent_failure_keys: last.persistent_failure_keys, resolved_failure_keys: last.resolved_failure_keys,
    unobserved_failure_keys: last.unobserved_failure_keys, new_failure_keys: last.new_failure_keys,
    changed_files: last.changed_files, relevant_revisions: last.relevant_revisions} : null;
  const body = {schema_version: 'adaptive-verified-repair-context/v1', policy: contract.policy,
    policy_source: {path, sha256: hash(bytes)}, instructions: contract.instructions, boundary: contract.boundary,
    binding: {plan_sha256: digest(planning.plan), public_evidence_sha256: digest(checks),
      artifact_revisions_sha256: digest(failure.artifact_revisions ?? {})},
    public_coverage: coverage, observation_refs: observations.map(({message, ...row}) => row),
    source_index: visibleSources, identifier_source_windows: windows,
    selection: {available_after_per_file_limit: allMatches.length, retained: windows.length,
      omitted: allMatches.length - windows.length, verified_source_count: sourceIndex.length,
      complete_candidate_source_sha256: digest(sourceIndex)},
    previous_repair: previous,
    worker_statements: workerReports.map(row => ({task_id: row.task_id, repaired_artifact_ids: row.repaired_artifact_ids,
      statement_sha256: digest(row.final_response), mentioned_source_paths: sourceIndex.filter(source =>
        row.final_response.includes(source.path)).map(source => ({path: source.path, artifact_id: source.artifact_id})),
      status: 'unverified_worker_statement_not_fault_proof'})),
    provider_calls: 0, automatic_owner_additions: 0, skipped_workers: 0};
  return {...body, sha256: digest(body)};
}

export function attachVerifiedRepairContext(request, context) {
  const {sha256, ...body} = context;
  need(context.schema_version === 'adaptive-verified-repair-context/v1' && digest(body) === sha256,
    'ADAPTIVE_VERIFIED_REPAIR_CONTEXT_BINDING');
  // Existing owner states already contain public coverage, original interfaces,
  // repair history and worker diagnostics. Do not repeat those bodies. Keep the
  // complete sealed record in the journal and send a deliberately small source
  // projection. Check-level errors retain the original traceback/import path
  // evidence; lexical coincidences must not enlarge those already-large inputs.
  const projection = {schema_version: 'adaptive-verified-repair-context-model/v1', policy: contract.policy,
    context_sha256: context.sha256, instructions: contract.model_instructions,
    source_columns: ['path', 'artifact_id', 'owner_task_id', 'sha256', 'artifact_revision'], sources: [],
    window_columns: ['source_ref', 'line', 'start_column', 'excerpt', 'observation_refs'], windows: [],
    observation_columns: ['check_id', 'test_id', 'assertion_id'], observations: [],
    projection: {complete: false, boundary: 'Bounded identifier search hints; full verified context is controller-only.'}};
  const candidates = [...context.identifier_source_windows].sort((a, b) =>
    Math.min(...a.matched.map(row => row.observation)) - Math.min(...b.matched.map(row => row.observation)) || a.source_ref - b.source_ref || a.line - b.line);
  const usedPaths = new Set();
  for (const window of candidates) {
    const observations = window.matched.map(row => context.observation_refs[row.observation]).filter(row => row.test_id !== null);
    const source = context.source_index[window.source_ref];
    if (!observations.length || usedPaths.has(source.path)) continue;
    const next = structuredClone(projection), sourceRef = next.sources.length;
    next.sources.push([source.path, source.artifact_id, source.owner_task_id, source.sha256, source.artifact_revision]);
    const refs = observations.map(observation => {
      const row = [observation.check_id, observation.test_id, observation.assertion_id];
      let index = next.observations.findIndex(item => JSON.stringify(item) === JSON.stringify(row));
      if (index < 0) { index = next.observations.length; next.observations.push(row); }
      return index;
    });
    next.windows.push([sourceRef, window.line, window.matched_line_start_column, window.matched_line_excerpt, refs]);
    if (Buffer.byteLength(JSON.stringify(next)) <= contract.model_context_max_bytes) {
      Object.assign(projection, next); usedPaths.add(source.path);
    }
  }
  if (!projection.windows.length) return structuredClone(request);
  return {...structuredClone(request), state: {...structuredClone(request.state), [contract.state_field]: projection}};
}
