import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {prepareDecision, createJevClient} from '../client.mjs';
import {BASE_URL, DECISION_URL, MODELS_URL} from '../config.mjs';
import {validateJevInput} from '../../scripts/validate-jev-input.mjs';
import {jevTokenAdmissionPolicy} from './jev-token-admission-v4.mjs';
import * as handlers from './adaptive-inferred-repair.mjs';
import {validateRepairInputState} from './adaptive-repair-input.mjs';

const POLICY_PATHS = {v1:'docs/orchestration/contracts/jev-prompt-policy.v1.json',
  v2:'docs/orchestration/contracts/jev-prompt-policy.v2.json'};
const DOCUMENT_PATH = 'docs/orchestration/contracts/adaptive-inferred-repair.v2.json';
const HANDLER_PATH = 'src/orchestration/adaptive-inferred-repair.mjs';
const SOURCE_PATHS = [DOCUMENT_PATH, HANDLER_PATH, 'src/orchestration/adaptive-inferred-repair-projection.mjs',
  'src/client.mjs', 'src/config.mjs', 'scripts/validate-jev-input.mjs',
  'src/orchestration/jev-token-admission-v4.mjs', 'docs/orchestration/contracts/jev-token-admission.v4.json'];
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const policies = new Map();
function selectedPolicy(version = 'v1') {
  need(Object.hasOwn(POLICY_PATHS, version), 'JEV_PROMPT_POLICY_INVALID');
  if (!policies.has(version)) {
    const path = POLICY_PATHS[version], bytes = read(path);
    policies.set(version, {path, bytes, value:JSON.parse(bytes)});
  }
  return policies.get(version);
}
const document = JSON.parse(read(DOCUMENT_PATH));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const list = value => Array.isArray(value) && value.every(text) && new Set(value).size === value.length;
const safePath = value => typeof value === 'string' && /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value)
  && !value.split('/').some(part => ['.', '..', '.git', '.env', '.claude', '.codex', '.agents'].includes(part));
const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), {code}); };
const format = (template, values) => template.replace(/\{([a-z_]+)\}/g, (_, key) => {
  need(Object.hasOwn(values, key), 'JEV_PROMPT_TARGET_BINDING'); return String(values[key]);
});

function pinnedSources(version = 'v1') {
  const {path, bytes:policyBytes, value:policy} = selectedPolicy(version);
  const sourcePaths = version === 'v2' ? [...SOURCE_PATHS, 'src/orchestration/adaptive-repair-input.mjs',
    'docs/orchestration/contracts/adaptive-repair-input.v1.json'] : SOURCE_PATHS;
  const valid = policy.schema_version === `jev-prompt-policy/${version}` && policy.template?.id === 'inferred-v2'
    && policy.template.stage === 'repair_owners' && policy.template.document_path === DOCUMENT_PATH
    && policy.template.handler_module === HANDLER_PATH && policy.template.handler_export === 'applyInferredRepairOwners'
    && policy.input_policy === 'v4' && policy.connection?.automatic_retries === 0
    && same(policy.source_pins?.map(row => row.path), sourcePaths)
    && same(policy.local_caps, {request_tokens:null, state_plus_longest_question_tokens:null, repair_wire_bytes:null});
  if (!valid) return {passed:false, code:'JEV_PROMPT_POLICY_INVALID', sources:[]};
  const sources = policy.source_pins.map(row => {
    let current = null; try { current = hash(read(row.path)); } catch { /* Fixed path, never echo OS errors. */ }
    return {...row, current_sha256:current, unchanged:digest(row.sha256) && row.sha256 === current};
  });
  const passed = sources.every(row => row.unchanged) && hash(read(path)) === hash(policyBytes);
  return {passed, code:passed ? null : 'JEV_PROMPT_SOURCE_DRIFT', sources};
}

export function jevPromptPolicy({policy:version = 'v1'} = {}) {
  const {path, bytes, value} = selectedPolicy(version);
  return {...structuredClone(value), source:{path, sha256:hash(bytes)}};
}

function indexed(rows, code) {
  need(Array.isArray(rows) && rows.length > 0 && rows.every(row => object(row) && text(row.id)), code);
  const map = new Map(rows.map(row => [row.id, row])); need(map.size === rows.length, code); return map;
}

// This checks inline references, not the truth of arbitrary text or runtime write authorization.
function inferredLinks(body) {
  const state = body.state, rule = document.owner_input;
  need(object(state) && state.schema_version === rule.schema_version, 'JEV_PROMPT_STATE_UNSUPPORTED');
  need(body.model === document.model, 'JEV_PROMPT_TEMPLATE_MODEL');
  need(state.instructions === rule.instructions && state.inline_case_resolution === rule.inline_case_resolution
    && state.requirement_scope?.basis === rule.requirement_scope_basis
    && state.requirement_scope?.missing_requirement_effect === rule.missing_requirement_effect,
  'JEV_PROMPT_DOCUMENT_TEXT_DRIFT');
  need(object(state.provenance) && digest(state.provenance.source_sha256) && digest(state.provenance.catalog_sha256)
    && state.failure_state?.status === 'failed' && state.failure_state.outcome_uncertain === false,
  'JEV_PROMPT_FAILURE_PROVENANCE');
  const artifacts = indexed(state.artifact_contracts, 'JEV_PROMPT_ARTIFACT_BINDING');
  const tasks = indexed(state.task_dependencies, 'JEV_PROMPT_OWNER_BINDING');
  const units = indexed(state.unit_interfaces, 'JEV_PROMPT_INTERFACE_BINDING');
  const evidence = indexed(state.evidence_quotes, 'JEV_PROMPT_EVIDENCE_BINDING');
  const requirements = indexed(state.original_requirements, 'JEV_PROMPT_REQUIREMENT_BINDING');
  need(!artifacts.has('unknown'), 'JEV_PROMPT_ENUM_BINDING');
  need([...evidence.values()].every(row => text(row.quote)), 'JEV_PROMPT_EVIDENCE_BINDING');
  need([...requirements.values()].every(row => text(row.text) && list(row.source_refs) && row.source_refs.length),
    'JEV_PROMPT_REQUIREMENT_BINDING');
  const linkedEvidence = ids => list(ids) && ids.length > 0 && ids.every(id => evidence.has(id));
  const paths = new Set();
  for (const artifact of artifacts.values()) {
    const task = tasks.get(artifact.owner_task_id), unit = units.get(artifact.unit_id);
    need(list(artifact.paths) && artifact.paths.length && artifact.paths.every(safePath), 'JEV_PROMPT_PATH_BINDING');
    for (const path of artifact.paths) {
      need(!paths.has(path.toLowerCase()), 'JEV_PROMPT_PATH_BINDING'); paths.add(path.toLowerCase());
    }
    need(task && text(task.worker_id) && task.worker_id === artifact.worker_id
      && list(task.output_artifact_ids) && task.output_artifact_ids.includes(artifact.id), 'JEV_PROMPT_OWNER_BINDING');
    need(unit && text(unit.interface) && list(unit.artifact_ids) && unit.artifact_ids.includes(artifact.id)
      && [...units.values()].filter(row => row.artifact_ids?.includes(artifact.id)).length === 1,
    'JEV_PROMPT_INTERFACE_BINDING');
    need(linkedEvidence(artifact.evidence_ids) && linkedEvidence(unit.evidence_ids), 'JEV_PROMPT_EVIDENCE_BINDING');
  }
  for (const task of tasks.values()) {
    need(list(task.input_artifact_ids) && list(task.output_artifact_ids) && task.output_artifact_ids.length
      && [...task.input_artifact_ids, ...task.output_artifact_ids].every(id => artifacts.has(id))
      && task.output_artifact_ids.every(id => artifacts.get(id).owner_task_id === task.id), 'JEV_PROMPT_OWNER_BINDING');
    for (const [field, flag, ids] of [['read_scope','read_paths_from_input_artifacts',task.input_artifact_ids],
      ['write_scope','write_paths_from_output_artifacts',task.output_artifact_ids]]) {
      const expected = ids.flatMap(id => artifacts.get(id).paths);
      need(task[flag] === true ? !Object.hasOwn(task, field) : same(task[field], expected), 'JEV_PROMPT_PATH_BINDING');
    }
  }
  // Projected v2 exists only when every local check is known successful. Failed,
  // uncertain or unexecuted local evidence belongs to the producer's raw fallback.
  const local = state.local_check_results;
  need(object(local) && local.status === 'passed' && local.executed === true && local.exit_code === 0
    && local.evidence_error === null && list(local.known_successful_check_ids)
    && Number.isSafeInteger(local.count) && local.count === local.known_successful_check_ids.length
    && (local.outcome_uncertain === undefined || local.outcome_uncertain === false)
    && (local.skipped === undefined || local.skipped === 0), 'JEV_PROMPT_LOCAL_EVIDENCE_UNSUPPORTED');
  const cases = state.detailed_failed_cases, gate = state.public_gate;
  need(Array.isArray(cases) && cases.length > 0 && object(gate) && gate.complete_gate_rerun_required === true
    && gate.failed_count === cases.length && Array.isArray(gate.results), 'JEV_PROMPT_FAILURE_COVERAGE');
  const gateChecks = new Set(), gatePassed = [], gateFailures = [];
  for (const check of gate.results) {
    // Validate every check, including siblings with no failed cases to target.
    need(object(check) && text(check.check_id) && !gateChecks.has(check.check_id)
      && ['passed','failed'].includes(check.status) && check.executed === true && check.outcome_uncertain === false
      && check.error == null && (check.unexecuted_test_ids === undefined
        || (Array.isArray(check.unexecuted_test_ids) && check.unexecuted_test_ids.length === 0))
      && list(check.passed_test_ids) && list(check.failed_test_ids)
      && !check.passed_test_ids.some(id => check.failed_test_ids.includes(id))
      && (check.status !== 'passed' || check.failed_test_ids.length === 0), 'JEV_PROMPT_FAILURE_COVERAGE');
    gateChecks.add(check.check_id);
    gatePassed.push(...check.passed_test_ids.map(id => JSON.stringify([check.check_id,id])));
    gateFailures.push(...check.failed_test_ids.map(id => JSON.stringify([check.check_id,id])));
  }
  need([gate.case_count,gate.passed_count,gate.failed_count].every(value => Number.isSafeInteger(value) && value >= 0)
    && gate.case_count === gate.passed_count + gate.failed_count
    && gate.case_count === gatePassed.length + gateFailures.length
    && gate.passed_count === gatePassed.length && gate.failed_count === gateFailures.length,
  'JEV_PROMPT_GATE_COUNTS');
  const caseKeys = new Set(), questionIds = [];
  const criteria = Object.fromEntries([...artifacts.keys()].map(id => [id, null])); criteria.unknown = rule.unknown_description;
  for (const row of cases) {
    const c = row.testcase, testId = c?.test_id ?? c?.id, assertionId = c?.failed_assertion_id ?? null;
    need(object(c) && c.status === 'failed' && text(row.check_id) && text(testId), 'JEV_PROMPT_TARGET_BINDING');
    const caseKey = JSON.stringify([row.check_id, testId]);
    need(!caseKeys.has(caseKey), 'JEV_PROMPT_FAILURE_COVERAGE'); caseKeys.add(caseKey);
    if (assertionId !== null) {
      need(text(assertionId) && (!Array.isArray(c.assertion_results)
        || c.assertion_results.some(a => a.assertion_id === assertionId && a.status === 'failed')),
      'JEV_PROMPT_TARGET_BINDING');
    }
    need(list(row.original_requirement_ids) && row.original_requirement_ids.length
      && row.original_requirement_ids.every(id => requirements.has(id)), 'JEV_PROMPT_REQUIREMENT_BINDING');
    const check = gate.results.filter(check => check.check_id === row.check_id);
    need(check.length === 1 && check[0].status === 'failed' && check[0].executed === true
      && check[0].outcome_uncertain === false && check[0].failed_test_ids?.includes(testId)
      && !check[0].passed_test_ids?.includes(testId), 'JEV_PROMPT_FAILURE_COVERAGE');
    // The existing builder hashes the sorted identity object, not its array-shaped lookup key.
    const questionId = `owner.${hash(JSON.stringify({assertion_id:assertionId,check_id:row.check_id,test_id:testId})).slice(0,20)}`;
    questionIds.push(questionId); const question = body.questions[questionId];
    need(question?.type === 'choice' && question.instructions === format(rule.target_template,
      {check_id:row.check_id, test_id:testId, assertion_id:assertionId ?? 'none (case-level error)'}), 'JEV_PROMPT_TARGET_BINDING');
    need(same(question.criteria, criteria), 'JEV_PROMPT_ENUM_BINDING');
  }
  need(same(questionIds.sort(), Object.keys(body.questions).sort()), 'JEV_PROMPT_FAILURE_COVERAGE');
  need(gateFailures.length === cases.length && same(gateFailures.sort(), [...caseKeys].sort()), 'JEV_PROMPT_FAILURE_COVERAGE');
  need(typeof handlers.applyInferredRepairOwners === 'function', 'JEV_PROMPT_HANDLER_UNAVAILABLE');
  return {questions:questionIds.length, failed_cases:cases.length, artifacts:artifacts.size, existing_owners:tasks.size,
    evidence_quotes:evidence.size, inline_requirements:requirements.size, enum_size_per_question:artifacts.size+1,
    unknown_option_present:true, handler_export_checked:true, handler_executed:false};
}

/** Offline: report only fixed codes, counts and hashes; never echo question/state/choice text. */
export function validateJevPrompt(request, {policy:version='v1', stage=null, template=null, observedModel=null,
  expectedRequestSha256=null, expectedPolicySha256=null} = {}) {
  const sources = pinnedSources(version), reasons = [], metadata = jevPromptPolicy({policy:version});
  if (!sources.passed) reasons.push(sources.code);
  if (expectedPolicySha256 !== null && expectedPolicySha256 !== metadata.source.sha256) reasons.push('JEV_PROMPT_POLICY_CHANGED');
  const input = validateJevInput(request, {policy:'v4', stage, observedModel, expectedRequestSha256,
    expectedPolicySha256:jevTokenAdmissionPolicy().source.sha256});
  if (!input.input_ready_under_current_policy) reasons.push(...input.admission.reason_codes);
  if (template !== 'inferred-v2' || stage !== 'repair_owners') reasons.push('JEV_PROMPT_TEMPLATE_UNSUPPORTED');
  let links = null, repairInput = null;
  if (sources.passed && input.adapter_validation.passed && template === 'inferred-v2' && stage === 'repair_owners') {
    try {
      const body = prepareDecision(request).body;
      if (version === 'v2' && ['repair_input','repair_input_shared_evidence','recovery_source_evidence']
        .some(key => Object.hasOwn(body.state, key))) repairInput = validateRepairInputState(body.state);
      links = inferredLinks(body);
    }
    catch (error) { reasons.push(typeof error.code === 'string' && error.code.startsWith('JEV_PROMPT_') ? error.code
      : typeof error.code === 'string' && error.code.startsWith('REPAIR_INPUT_') ? 'JEV_PROMPT_REPAIR_INPUT_INVALID' : 'JEV_PROMPT_STRUCTURE_INVALID'); }
  }
  const a = input.admission;
  return {schema_version:'jev-prompt-preflight/v1', mode:'offline', policy:metadata.source,
    supported_scope:{template:'inferred-v2', stage:'repair_owners', current_request_supported:template === 'inferred-v2' && stage === 'repair_owners'},
    passed:reasons.length === 0, reason_codes:[...new Set(reasons)], repair_input_validation:repairInput,
    request_sha256:input.canonical_request_sha256, source_integrity:sources,
    official_adapter:{passed:input.adapter_validation.passed, subset:true, complete_provider_api_certified:false,
      official_body_limit:input.official_body_limit},
    v4_admission:{admission:a.admission, inference_allowed:a.inference_allowed, policy_source:a.policy_source,
      reason_codes:a.reason_codes, warning_codes:a.warning_codes, local_caps:a.local_caps,
      wire_bytes:a.measurements?.wire_bytes ?? null, state_json_bytes:a.measurements?.state_json_bytes ?? null,
      question_count:a.measurements?.question_count ?? null, estimates:a.estimates},
    structural_links:links, handler:{module:HANDLER_PATH, export:'applyInferredRepairOwners', executed:false},
    exact_context_fit:'unknown', live_authentication:'not_checked', live_model_availability:'not_checked',
    semantic_sufficiency:'not_checked', English_language_quality:'not_checked', evidence_authenticity:'not_checked',
    handler_runtime_authorization:'not_checked', performance_improvement:'not_measured',
    performed_calls:{GET:0,POST:0}, key_loaded:false, automatic_retries:0,
    limitations:metadata.not_checked};
}

/** Exercise this client with synthetic responses only. No environment/key files or live transport. */
export async function checkJevConnectionWithMock({clientFactory=createJevClient, policy:version='v1'} = {}) {
  const fakeKey = 'offline-fixture-jev-not-a-real-key', attempts = [], scenarios = [];
  const request = {model:'jev-latest',state:'Synthetic connection check.',questions:{ok:{type:'noul',instructions:'Is this a synthetic fixture?'}}};
  const body = prepareDecision(request).serialized;
  for (const scenario of ['success','http_429','http_503','transport_error','destination_mismatch']) {
    const calls = []; let errorCode = null, parsing = false;
    const fetchImpl = async (url, options) => {
      const expectedURL = options.method === 'GET' ? MODELS_URL : DECISION_URL;
      calls.push({method:options.method, destination_matches:url === expectedURL,
        bearer_matches:options.headers?.Authorization === `Bearer ${fakeKey}`,
        json_headers_match:options.headers?.Accept === 'application/json'
          && (options.method === 'GET' || options.headers?.['Content-Type'] === 'application/json'),
        body_matches:options.method === 'GET' ? options.body === undefined : options.body === body,
        redirects_blocked:options.redirect === 'error'});
      if (scenario === 'transport_error') throw new Error('Synthetic transport failure.');
      const status = scenario === 'http_429' ? 429 : scenario === 'http_503' ? 503 : 200;
      const payload = status !== 200 ? {error:{code:status,message:'Synthetic error.'}}
        : options.method === 'GET' ? {models:[{name:'jev-latest',description:'Fixture only.'}]}
        : {model:'jev-1.13.0',answers:{ok:{type:'noul',noul:1}},usage:{input_tokens:1,output_tokens:0}};
      const response = new Response(JSON.stringify(payload), {status, headers:{'Content-Type':'application/json'}});
      Object.defineProperty(response,'url',{value:scenario === 'destination_mismatch' ? 'https://wrong.invalid/api/v1/systemone' : url});
      return response;
    };
    try {
      const client = clientFactory({apiKey:fakeKey,fetchImpl,timeoutMs:1000});
      if (scenario === 'success') await client.listModels();
      const response = await client.decide(request);
      parsing = response?.model === 'jev-1.13.0' && response.answers?.ok?.noul === 1;
    } catch (error) {
      errorCode = ['HTTP_ERROR','TRANSPORT_ERROR','DESTINATION_MISMATCH'].includes(error.code) ? error.code : 'MOCK_CLIENT_ERROR';
    }
    const expectedError = scenario === 'success' ? null : scenario.startsWith('http_') ? 'HTTP_ERROR'
      : scenario === 'transport_error' ? 'TRANSPORT_ERROR' : 'DESTINATION_MISMATCH';
    const expectedMethods = scenario === 'success' ? ['GET','POST'] : ['POST'];
    const passed = errorCode === expectedError && (scenario !== 'success' || parsing)
      && same(calls.map(row=>row.method), expectedMethods)
      && calls.every(row=>row.destination_matches && row.bearer_matches && row.json_headers_match && row.body_matches && row.redirects_blocked);
    scenarios.push({scenario,passed,mock_attempts:calls.length,error_code:errorCode,response_parsing:scenario === 'success' ? parsing : null});
    attempts.push(...calls);
  }
  const source = pinnedSources(version), policy = jevPromptPolicy({policy:version});
  const destinations = BASE_URL === policy.connection.base_url && DECISION_URL === policy.connection.decision_url && MODELS_URL === policy.connection.models_url;
  return {schema_version:'jev-connection-mock-check/v1', mode:'mock_only', passed:source.passed && destinations && scenarios.every(row=>row.passed),
    source_integrity:source,configured_destinations_match:destinations,scenarios,
    mock_calls:{GET:attempts.filter(row=>row.method==='GET').length,POST:attempts.filter(row=>row.method==='POST').length},
    performed_calls:{GET:0,POST:0},real_key_loaded:false,actual_billed_usd:null,
    live_authentication:'not_checked',live_model_availability:'not_checked',deployment_configuration:'not_checked',
    boundary:'Mock transport validates this repository client only; it is not a live account, network, SDK or deployment check.'};
}
