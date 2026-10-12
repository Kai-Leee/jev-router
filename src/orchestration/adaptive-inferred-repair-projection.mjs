import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const copy = structuredClone, same = isDeepStrictEqual;
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(JSON.stringify(value));
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unique = values => [...new Set(values)];
const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), {code, outcome_uncertain: false}); };
const identity = (check, testcase) => JSON.stringify([check, testcase.test_id ?? testcase.id]);
const only = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
const text = (template, values) => template.replace(/\{([a-z_]+)\}/g, (_, key) => {
  need(Object.hasOwn(values, key), 'ADAPTIVE_OWNER_PROJECTION_TEMPLATE'); return String(values[key]);
});
const topKeys = ['schema_version', 'instructions', 'contract_source', 'source_sha256', 'catalog_sha256', 'failure',
  'failures', 'tasks', 'artifacts', 'units', 'requirement_descriptions', 'evidence', 'causal_paths', 'repair_history'];
const failureKeys = ['status', 'outcome_uncertain', 'code', 'run_id', 'graph_revision', 'catalog_sha256', 'source_sha256',
  'binding_digest', 'environment', 'task_attempt_ids', 'failed_task_ids', 'public_evidence', 'local_evidence',
  'undispatched_task_ids', 'round_index', 'artifact_revisions', 'repair_projection'];
const checkKeys = ['check_id', 'check_version', 'environment_ref', 'status', 'executed', 'exit_code', 'assertions', 'skipped',
  'outcome_uncertain', 'runtime_binding_ref', 'artifact_revision_ids', 'artifact_revisions', 'evidence', 'evidence_key',
  'check_defaults_ref', 'task_id', 'attempt_id'];
const evidenceKeys = ['binding_kind', 'error', 'product_certified', 'python_version', 'schema_version', 'scope', 'container_removed',
  'inherited_fields', 'artifact_revisions', 'assertion_contract_sha256', 'candidate_invocations', 'cases', 'environment_evidence',
  'setup_evidence', 'test_ids', 'unexecuted_test_ids', 'report_ref', 'process_ref'];

function resolveCheck(raw, failure) {
  need(object(raw) && object(raw.evidence), 'ADAPTIVE_OWNER_PROJECTION_CHECK');
  const defaults = raw.check_defaults_ref === undefined ? {} : failure.repair_projection?.check_defaults?.[raw.check_defaults_ref];
  need(object(defaults), 'ADAPTIVE_OWNER_PROJECTION_DEFAULT_REF');
  for (const key of Object.keys(defaults)) if (key !== 'evidence') {
    need(!Object.hasOwn(raw, key), 'ADAPTIVE_OWNER_PROJECTION_DEFAULT_COLLISION');
  }
  for (const key of Object.keys(defaults.evidence ?? {})) {
    need(!Object.hasOwn(raw.evidence, key), 'ADAPTIVE_OWNER_PROJECTION_DEFAULT_COLLISION');
  }
  return {...copy(defaults), ...copy(raw), evidence: {...copy(defaults.evidence ?? {}), ...copy(raw.evidence)}};
}

/** Readable owner attribution only. All original values remain in the bound
 * controller report; that report is not a model-readable evidence source. */
export function projectInferredRepairOwnerRequest(rawRequest, {contract}) {
  need(contract?.owner_input?.mode === 'single_target_state', 'ADAPTIVE_OWNER_PROJECTION_CONTRACT');
  const raw = copy(rawRequest), state = raw.state, rules = contract.owner_input;
  need(object(state) && object(raw.questions), 'ADAPTIVE_OWNER_PROJECTION_INPUT');
  const report = {schema_version: 'adaptive-inferred-owner-projection-report/v2', mode: rules.mode,
    input_request_sha256: digest(raw), input_wire_bytes: bytes(raw), original_request: copy(raw),
    input_question_ids: Object.keys(raw.questions), omissions: [], provider_acceptance: 'unmeasured',
    exact_model_tokens: null, actual_usage: null, local_token_limit: null,
    boundary: 'Controller proof retains original values. The model receives inline decision facts, not retrievable local files.'};
  const omitted = (pointer, value, reason) => report.omissions.push({pointer, sha256: digest(value), value: copy(value), reason});
  const finish = (request, mode, fallbackReason = null) => {
    report.mode = mode; report.fallback_reason = fallbackReason;
    report.output_request_sha256 = digest(request); report.output_wire_bytes = bytes(request);
    report.output_question_ids = Object.keys(request.questions);
    need(same(report.input_question_ids, report.output_question_ids), 'ADAPTIVE_OWNER_PROJECTION_QUESTION_COVERAGE');
    report.integrity_sha256 = digest(report);
    return {request, report};
  };
  const fallback = reason => finish(copy(raw), 'raw_request_fallback', reason);
  if (!only(state, topKeys) || !only(state.failure, failureKeys)) return fallback('UNRECOGNIZED_STATE_OR_FAILURE_FIELDS');
  const failure = state.failure;
  if (!Array.isArray(failure.public_evidence) || !Array.isArray(failure.local_evidence)) return fallback('UNRECOGNIZED_EVIDENCE_SHAPE');
  const publicChecks = failure.public_evidence.map(row => resolveCheck(row, failure));
  const localChecks = failure.local_evidence.map(row => resolveCheck(row, failure));
  if ([...publicChecks, ...localChecks].some(row => !only(row, checkKeys) || !only(row.evidence, evidenceKeys))) {
    return fallback('UNRECOGNIZED_CHECK_SEMANTIC_FIELDS');
  }
  const rows = [], summaries = [], passedDetails = [];
  for (const check of publicChecks) {
    if (check.executed !== true || check.outcome_uncertain !== false || check.skipped !== 0
      || !['passed', 'failed'].includes(check.status) || !Array.isArray(check.evidence.cases)
      || (check.evidence.error !== null && check.evidence.error !== undefined)
      || (check.evidence.unexecuted_test_ids?.length ?? 0) > 0) return fallback('PUBLIC_ERROR_OR_UNEXECUTED_EVIDENCE');
    for (const testcase of check.evidence.cases) {
      if (!['passed', 'failed'].includes(testcase.status)) return fallback('UNOBSERVED_PUBLIC_CASE');
      const id = testcase.test_id ?? testcase.id;
      need(typeof id === 'string' && id.length, 'ADAPTIVE_OWNER_PROJECTION_CASE_ID');
      rows.push({check_id: check.check_id, testcase: copy(testcase)});
      // A successful case can carry useful semantic diagnostics. Retain any
      // nontrivial case object rather than interpreting arbitrary new fields.
      if (testcase.status === 'passed' && !only(testcase, ['test_id', 'id', 'status', 'assertions'])) {
        passedDetails.push({check_id: check.check_id, testcase: copy(testcase)});
      }
    }
    summaries.push({check_id: check.check_id, status: check.status, executed: true, outcome_uncertain: false,
      exit_code: check.exit_code, assertions: check.assertions,
      unexecuted_test_ids: copy(check.evidence.unexecuted_test_ids ?? []), error: check.evidence.error ?? null,
      passed_test_ids: check.evidence.cases.filter(row => row.status === 'passed').map(row => row.test_id ?? row.id),
      failed_test_ids: check.evidence.cases.filter(row => row.status === 'failed').map(row => row.test_id ?? row.id),
      per_case_assertions: {default: 1, overrides: Object.fromEntries(check.evidence.cases.filter(row => row.assertions !== 1)
        .map(row => [row.test_id ?? row.id, row.assertions]))}});
  }
  need(new Set(rows.map(row => identity(row.check_id, row.testcase))).size === rows.length, 'ADAPTIVE_OWNER_PROJECTION_DUPLICATE_CASE');
  const failed = rows.filter(row => row.testcase.status === 'failed');
  need(Array.isArray(state.failures) && failed.length === state.failures.length
    && same(state.failures.map(row => row.question_id), Object.keys(raw.questions)), 'ADAPTIVE_OWNER_PROJECTION_FAILURE_COVERAGE');
  const mapped = failed.map(row => {
    const matches = state.failures.filter(item => item.check_id === row.check_id && item.test_id === (row.testcase.test_id ?? row.testcase.id));
    need(matches.length === 1 && (matches[0].assertion_id ?? null) === (row.testcase.failed_assertion_id ?? null),
      'ADAPTIVE_OWNER_PROJECTION_FAILURE_BINDING');
    need(matches[0].public_case_sha256 === digest(canonical(row.testcase)), 'ADAPTIVE_OWNER_PROJECTION_CASE_BINDING');
    return {...copy(row), original_requirement_ids: copy(matches[0].requirement_ids)};
  });
  const artifacts = new Map(state.artifacts.map(row => [row.id, row])), units = new Map(state.units.map(row => [row.id, row]));
  need(artifacts.size === state.artifacts.length && !artifacts.has('unknown'), 'ADAPTIVE_OWNER_PROJECTION_ARTIFACT_BINDING');
  for (const artifact of artifacts.values()) {
    const task = state.tasks.find(task => task.id === artifact.owner_task_id), unit = units.get(artifact.unit_id);
    need(task?.output_artifact_ids.includes(artifact.id) && task.worker_id === artifact.worker_id
      && unit?.artifact_ids.includes(artifact.id) && typeof unit.interface === 'string', 'ADAPTIVE_OWNER_PROJECTION_OWNER_BINDING');
  }
  const candidateContracts = state.artifacts.map((artifact, index) => {
    const value = copy(artifact);
    omitted(`/artifacts/${index}/revision`, value.revision, 'Controller revision authorization; complete semantic contract remains inline.');
    delete value.revision; return value;
  });
  const tasks = state.tasks.map((task, index) => {
    const value = copy(task), inputPaths = task.input_artifact_ids.flatMap(id => artifacts.get(id)?.paths ?? []),
      outputPaths = task.output_artifact_ids.flatMap(id => artifacts.get(id)?.paths ?? []);
    need([...task.input_artifact_ids, ...task.output_artifact_ids].every(id => artifacts.has(id)), 'ADAPTIVE_OWNER_PROJECTION_DEPENDENCY_BINDING');
    for (const [field, paths, flag] of [['read_scope', inputPaths, 'read_paths_from_input_artifacts'],
      ['write_scope', outputPaths, 'write_paths_from_output_artifacts']]) {
      if (same(task[field], paths)) {
        need(!Object.hasOwn(task, flag), 'ADAPTIVE_OWNER_PROJECTION_RESERVED_FIELD');
        omitted(`/tasks/${index}/${field}`, value[field], `Exact paths of declared ${field === 'read_scope' ? 'input' : 'output'} artifacts in order.`);
        delete value[field]; value[flag] = true;
      }
    }
    return value;
  });
  const requirementIds = state.requirement_descriptions.map(row => row.id);
  need(new Set(requirementIds).size === requirementIds.length, 'ADAPTIVE_OWNER_PROJECTION_REQUIREMENT_BINDING');
  const linkedIds = unique([...state.failures.flatMap(row => row.requirement_ids ?? []),
    ...state.causal_paths.flatMap(chain => chain.requirement_ids ?? [])]);
  const mappingComplete = state.failures.every(row => Array.isArray(row.requirement_ids) && row.requirement_ids.length)
    && state.causal_paths.every(chain => Array.isArray(chain.requirement_ids))
    && linkedIds.every(id => requirementIds.includes(id));
  const keepIds = mappingComplete ? linkedIds : requirementIds;
  const kept = state.requirement_descriptions.filter(row => keepIds.includes(row.id));
  const excluded = state.requirement_descriptions.filter(row => !keepIds.includes(row.id));
  omitted('/requirement_descriptions', state.requirement_descriptions,
    mappingComplete ? 'Only exact failed-case/causal linked requirement text is used for attribution; all candidate interfaces remain complete.'
      : 'Ambiguous mapping: every original requirement remains inline.');
  const contexts = publicChecks.map(check => {
    const e = check.evidence, setup = copy(e.setup_evidence);
    if (setup?.exit_code === 0 && setup.console_script_exists === true && !setup.error) {
      for (const field of ['console_script', 'interpreter_identity', 'python', 'source_root', 'trace_path', 'venv', 'stdout_omitted']) {
        if (Object.hasOwn(setup, field)) {
          omitted(`/public_evidence/${check.check_id}/setup_evidence/${field}`, setup[field], 'Known successful setup identity/progress remains in controller proof.');
          delete setup[field];
        }
      }
    }
    return {check_id: check.check_id, candidate_invocations: copy(e.candidate_invocations),
      environment_evidence: copy(e.environment_evidence), setup_evidence: setup,
      unexecuted_test_ids: copy(e.unexecuted_test_ids ?? [])};
  });
  // Passed reports are summary-eligible only with empty observed diagnostics and
  // known normal setup. Unexpected errors/unknown stdout stay inline as context.
  const detailedContexts = contexts.filter((context, index) => publicChecks[index].status === 'failed'
    || (object(context.environment_evidence) && Object.keys(context.environment_evidence).length > 0)
    || (context.setup_evidence && (!only(context.setup_evidence, ['console_script_exists', 'exit_code', 'stderr'])
      || context.setup_evidence.exit_code !== 0 || context.setup_evidence.console_script_exists !== true || context.setup_evidence.stderr))
    || context.candidate_invocations?.some(row => !only(row, ['exit_code', 'installed_cli', 'number'])));
  const compactLocal = localChecks.map(check => {
    const allowedEvidence = ['error', 'container_removed', 'inherited_fields', 'report_ref', 'process_ref'];
    if (check.status !== 'passed' || check.executed !== true || check.outcome_uncertain !== false || check.exit_code !== 0
      || check.skipped !== 0 || check.evidence.error !== null || !only(check.evidence, allowedEvidence)) return copy(check);
    return {check_id: check.check_id, task_id: check.task_id, status: 'passed', executed: true, exit_code: 0,
      assertions: check.assertions, skipped: 0, evidence_error: null};
  });
  const allLocalSummarized = compactLocal.every(row => Object.hasOwn(row, 'evidence_error'));
  if (!allLocalSummarized) return fallback('LOCAL_EVIDENCE_NOT_KNOWN_SUCCESS');
  omitted('/failure', failure, 'All failed public cases are inline; known successes are summarized. Full check metadata and original objects remain in controller proof.');
  const packetState = {schema_version: rules.schema_version, instructions: rules.instructions,
    provenance: {source_sha256: state.source_sha256, catalog_sha256: state.catalog_sha256, graph_revision: failure.graph_revision,
      environment: copy(failure.environment), controller_validates_all_artifact_revisions: true},
    failure_state: {status: failure.status, code: failure.code, outcome_uncertain: failure.outcome_uncertain,
      failed_task_ids: copy(failure.failed_task_ids ?? []), undispatched_task_ids: copy(failure.undispatched_task_ids ?? [])},
    public_gate: {case_count: rows.length, passed_count: rows.length - failed.length, failed_count: failed.length,
      complete_gate_rerun_required: true, results: summaries},
    detailed_failed_cases: mapped, ...(passedDetails.length ? {additional_observed_cases: passedDetails} : {}),
    inline_case_resolution: rules.inline_case_resolution, failed_check_contexts: detailedContexts,
    local_check_results: allLocalSummarized ? {known_successful_check_ids: compactLocal.map(row => row.check_id),
      count: compactLocal.length, status: 'passed', executed: true, exit_code: 0, evidence_error: null,
      detail_access: 'controller_only; no failed or uncertain local check is summarized'} : compactLocal,
    original_requirements: kept, requirement_scope: {basis: rules.requirement_scope_basis,
      mapping_complete: mappingComplete, controller_only_requirement_ids: excluded.map(row => row.id),
      full_requirement_access: 'controller_and_implementation_workers_only', missing_requirement_effect: rules.missing_requirement_effect},
    artifact_contracts: candidateContracts, unit_interfaces: copy(state.units), task_dependencies: tasks,
    evidence_quotes: copy(state.evidence), causal_paths: copy(state.causal_paths), repair_history: copy(state.repair_history)};
  const criteria = Object.fromEntries([...artifacts.keys()].map(id => [id, null])); criteria.unknown = rules.unknown_description;
  const questions = Object.fromEntries(state.failures.map(row => [row.question_id, {type: 'choice',
    instructions: text(rules.target_template, {...row, assertion_id: row.assertion_id ?? 'none (case-level error)'}), criteria: copy(criteria)}]));
  report.public_case_count = rows.length; report.failed_case_count = failed.length;
  report.not_reached_assertion_count = failed.reduce((count, row) => count + (row.testcase.assertion_results ?? []).filter(x => x.status === 'not_reached').length, 0);
  report.inline_requirement_ids = kept.map(row => row.id); report.omitted_requirement_records = copy(excluded);
  report.artifact_count = artifacts.size; report.unit_count = state.units.length; report.mapping_complete = mappingComplete;
  return finish({...raw, state: packetState, questions}, rules.mode);
}

/** Used by local audit/tests. No file reference is a model retrieval mechanism. */
export function restoreInferredRepairOwnerRequest(request, report) {
  need(object(report), 'ADAPTIVE_OWNER_PROJECTION_REPORT_BINDING');
  const {integrity_sha256, ...body} = report;
  need(integrity_sha256 === digest(body) && digest(request) === report.output_request_sha256
    && digest(report.original_request) === report.input_request_sha256,
  'ADAPTIVE_OWNER_PROJECTION_REPORT_BINDING');
  need(same(Object.keys(request.questions), report.input_question_ids)
    && same(Object.keys(report.original_request.questions), report.input_question_ids), 'ADAPTIVE_OWNER_PROJECTION_QUESTION_COVERAGE');
  return copy(report.original_request);
}
