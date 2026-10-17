import {readFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import * as pricing from './codex-pricing.mjs';
import {claudePricingContract,assertClaudePricingSource} from './claude-pricing.mjs';
import {buildCodexWorkerProfileRequest as buildOriginalTaskView} from './codex-worker-profiles.mjs';
import {verifyHistoryEvidence, projectWorkerOutcomeEvidence, verifyEmpiricalEvidence} from './codex-worker-outcomes.mjs';

const path = 'docs/orchestration/contracts/worker-profiles.v3.json';
const url = new URL(`../../${path}`, import.meta.url), bytes = readFileSync(url), contract = JSON.parse(bytes);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(JSON.stringify(canonical(value)));
const source = Object.freeze({path, sha256: hash(bytes)});
const clone = structuredClone;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const need = (condition, code) => { if (!condition) throw Object.assign(new Error(code), {code, outcome_uncertain: false}); };
need(contract.schema_version === 'worker-profiles/v3' && Object.keys(contract.families).sort().join(',') === 'claude,codex', 'CODEX_WORKER_PROFILE_V2_CONTRACT_INVALID');

export function workerProfilePolicy() { return {...clone(contract), source: {...source}}; }
export function assertWorkerProfileSource() {
  need(hash(readFileSync(url)) === source.sha256, 'CODEX_WORKER_PROFILE_V2_SOURCE_CHANGED'); return {...source};
}
function priceForFamily(family) { return family === 'claude' ? claudePricingContract() : pricing.codexPricingContract({version:'v2'}); }
function assertPrice(sourceSha,family) { return family === 'claude' ? assertClaudePricingSource(sourceSha) : pricing.assertCodexPricingSource(sourceSha,{version:'v2'}); }
function officialModels(pricingContract, family) {
  need(pricingContract?.schema_version === (family==='claude'?'claude-reference-pricing/v1':'codex-reference-pricing/v2') && Array.isArray(pricingContract.models)
    && typeof pricingContract.source?.sha256 === 'string', 'CODEX_WORKER_PROFILE_V2_PRICING_REQUIRED');
  return contract.families[family].models.map(model => pricingContract.models.find(row => row.model === model)).filter(row => row
    && object(row.capabilities) && typeof row.capabilities.description === 'string' && row.capabilities.description
    && Array.isArray(row.source_refs) && row.source_refs.length
    && ['short_standard', 'long_standard'].every(key => row.scenarios?.[key]?.service_tier === 'standard'
      && ['input', 'cached_input', 'cache_write', 'output'].every(field => Number.isFinite(row.scenarios[key].usd_per_million?.[field])
        && row.scenarios[key].usd_per_million[field] >= 0)));
}

/** Priced registered models x adapter efforts only. Actual availability is
 * deliberately not asserted until the frozen application discovery below. */
export function workerProfileCandidates({workerFamily='codex',pricingContract=priceForFamily(workerFamily)} = {}) {
  assertWorkerProfileSource();
  return officialModels(pricingContract,workerFamily).flatMap(row => contract.families[workerFamily].adapter_efforts.map(effort => ({model: row.model, effort})));
}

export function eligibleWorkerProfiles({environmentEvidence, pricingContract,workerFamily='codex'}) {
  assertWorkerProfileSource();
  need(typeof environmentEvidence?.fingerprint === 'string' && Array.isArray(environmentEvidence.models), 'CODEX_WORKER_PROFILE_V2_DISCOVERY_REQUIRED');
  const priced = officialModels(pricingContract,workerFamily), profiles = [], models = [], exclusions = [];
  for (const {model, effort} of workerProfileCandidates({pricingContract,workerFamily})) {
    const discovered = environmentEvidence.models.find(row => row.model === model);
    const allowed = environmentEvidence.allowed_profiles;
    const reason = !discovered ? 'not_in_frozen_application_discovery'
      : !discovered.supported_reasoning_efforts?.includes(effort) ? 'effort_not_offered_by_frozen_application'
        : Array.isArray(allowed) && !allowed.some(row => row.model === model && row.effort === effort)
          ? 'not_in_explicit_environment_allowlist' : null;
    if (reason) { exclusions.push({model, effort, reason}); continue; }
    const official = priced.find(row => row.model === model);
    if (!models.some(row => row.model === model)) models.push({model, capabilities: clone(official.capabilities),
      standard_reference_prices: clone(official.scenarios), source_refs: clone(official.source_refs), pricing_source: clone(pricingContract.source),
      discovery: {model, supported_reasoning_efforts: clone(discovered.supported_reasoning_efforts),
        environment_fingerprint: environmentEvidence.fingerprint}});
    profiles.push({id: `${model}-${effort}`, model, effort, model_ref: model,
      effort_offered_by_application: true,
      effort_documented_in_pricing_snapshot: official.capabilities.supported_reasoning_efforts?.includes(effort) ?? null,
      effective_internal_effort_verified: null});
  }
  need(profiles.length > 0, 'CODEX_WORKER_PROFILE_V2_NO_ELIGIBLE_MODEL');
  return {worker_family:workerFamily,policy: contract.policy, source: {...source}, pricing_source: clone(pricingContract.source), profiles, models, exclusions,
    environment_fingerprint: environmentEvidence.fingerprint,
    allowed_profiles: clone(environmentEvidence.allowed_profiles ?? profiles.map(({model, effort}) => ({model, effort})))};
}

const criterion = profile => `${profile.model} / effort ${profile.effort}`;
const wireProfiles = profiles => profiles.map(({id, model, effort}) => ({id, model, effort}));
const publicTask = task => ({id: task.id, original_task_id: task.original_task_id ?? task.id,
  requirement_ids: clone(task.requirement_ids), read_scope: clone(task.read_scope ?? []), write_scope: clone(task.write_scope),
  input_artifact_ids: clone(task.input_artifact_ids ?? []), output_artifact_ids: clone(task.output_artifact_ids ?? [])});

// Exact repeated statistics are encoded once. All values remain inline and the
// original summary is reconstructed before its trusted-history check.
function encodeEmpirical(summary) {
  const pool = [], keys = new Map();
  const reference = value => {
    const key = digest(value);
    if (!keys.has(key)) {const id = `S${pool.length}`; keys.set(key, id); pool.push({id, value: clone(value)});}
    return keys.get(key);
  };
  const body = {...clone(summary), encoding: 'inline-statistics-pool/v1',
    profiles: summary.profiles.map(profile => {
      const {global, exact_scope, requirement_overlap, ...rest} = profile;
      return {...clone(rest), global_ref: reference(global), exact_scope_ref: reference(exact_scope),
        requirement_overlap_ref: reference(requirement_overlap)};
    }), statistics: pool};
  return {...body, transport_sha256: digest(body)};
}
function decodeEmpirical(encoded) {
  need(encoded?.encoding === 'inline-statistics-pool/v1' && Array.isArray(encoded.statistics)
    && Array.isArray(encoded.profiles), 'CODEX_WORKER_PROFILE_V2_EMPIRICAL_ENCODING');
  const {transport_sha256, encoding, statistics, ...body} = encoded;
  need(transport_sha256 === digest({encoding, statistics, ...body}), 'CODEX_WORKER_PROFILE_V2_EMPIRICAL_BINDING');
  const pool = new Map();
  for (const row of statistics) {
    need(typeof row?.id === 'string' && !pool.has(row.id) && object(row.value), 'CODEX_WORKER_PROFILE_V2_EMPIRICAL_ENCODING');
    pool.set(row.id, row.value);
  }
  const get = id => {need(pool.has(id), 'CODEX_WORKER_PROFILE_V2_EMPIRICAL_ENCODING'); return clone(pool.get(id));};
  return {...clone(body), profiles: body.profiles.map(profile => {
    const {global_ref, exact_scope_ref, requirement_overlap_ref, ...rest} = profile;
    return {...clone(rest), global: get(global_ref), exact_scope: get(exact_scope_ref), requirement_overlap: get(requirement_overlap_ref)};
  })};
}

export function buildWorkerProfileRequest({planning, task, context, catalog, empiricalEvidence, expectedEmpiricalSha256}) {
  verifyHistoryEvidence(empiricalEvidence, {expectedSha256: expectedEmpiricalSha256});
  const base = buildOriginalTaskView({planning, task, context, catalog});
  const operation = context.operation ?? 'implementation';
  const empirical = projectWorkerOutcomeEvidence(empiricalEvidence, {task, operation, profiles: catalog.profiles});
  verifyEmpiricalEvidence(empirical, {snapshot: empiricalEvidence, task, operation, profiles: catalog.profiles,
    expectedSha256: expectedEmpiricalSha256});
  const binding = {...base.binding, empirical_snapshot_sha256: empiricalEvidence.sha256,
    empirical_evidence_sha256: empirical.evidence_sha256,
    public_task_sha256: digest(publicTask({...task, original_task_id: base.binding.original_task_id}))};
  const request = {model: 'jev-latest', state: {...base.request.state,
    schema_version: 'worker-profile-request/v3',worker_family:catalog.worker_family, policy: contract.policy, instructions: contract.instructions,
    boundary: contract.boundary, effort_authority: contract.effort_authority, inline_resolution: contract.inline_resolution,
    candidates: wireProfiles(catalog.profiles), models: clone(catalog.models),
    availability: {environment_fingerprint: catalog.environment_fingerprint,
      allowed_profiles: clone(catalog.allowed_profiles), excluded_profiles: clone(catalog.exclusions)},
    empirical_evidence: encodeEmpirical(empirical), binding: {...binding, reference_access: 'controller_only_not_model_retrievable'}},
    questions: {[contract.question_id]: {type: 'choice', instructions: contract.question,
      criteria: Object.fromEntries([...catalog.profiles.map(profile => [profile.id, criterion(profile)]), ['unknown', contract.unknown]])}}};
  return {request, binding};
}

/** Gateway validation reprojects against the separately pinned trusted history;
 * a caller cannot forge success metrics merely by recalculating a summary seal. */
export function validateWorkerProfileRequest(request, {empiricalEvidence, expectedEmpiricalSha256,expectedWorkerFamily,expectedEnvironmentEvidence} = {}) {
  assertWorkerProfileSource();
  verifyHistoryEvidence(empiricalEvidence, {expectedSha256: expectedEmpiricalSha256});
  const family=request?.state?.worker_family;
  need(['codex','claude'].includes(family)&&(!expectedWorkerFamily||expectedWorkerFamily===family),'WORKER_PROFILE_V3_FAMILY_INVALID');
  const prices=priceForFamily(family);assertPrice(prices.source.sha256,family);
  const state = request?.state, questions = request?.questions;
  const valid = condition => need(condition, 'CODEX_WORKER_PROFILE_V2_REQUEST_INVALID');
  valid(request?.model === 'jev-latest' && object(state) && object(questions) && Object.keys(questions).length === 1
    && Object.hasOwn(questions, contract.question_id));
  valid(state.schema_version === 'worker-profile-request/v3' && state.policy === contract.policy
    && state.instructions === contract.instructions && state.boundary === contract.boundary && state.effort_authority === contract.effort_authority
    && state.inline_resolution === contract.inline_resolution);
  const question = questions[contract.question_id];
  valid(object(question) && question.type === 'choice' && question.instructions === contract.question && object(question.criteria));
  valid(Array.isArray(state.candidates) && state.candidates.length > 0 && state.candidates.every(object)
    && new Set(state.candidates.map(row => row.id)).size === state.candidates.length
    && Array.isArray(state.models) && state.models.length > 0 && state.models.every(object)
    && new Set(state.models.map(row => row.model)).size === state.models.length);
  for (const row of state.models) {
    const official = prices.models.find(model => model.model === row.model);
    valid(contract.families[family].models.includes(row.model) && official && object(row.capabilities) && object(row.standard_reference_prices)
      && Array.isArray(row.source_refs) && object(row.pricing_source) && object(row.discovery)
      && digest(row.capabilities) === digest(official.capabilities) && digest(row.standard_reference_prices) === digest(official.scenarios)
      && digest(row.source_refs) === digest(official.source_refs) && digest(row.pricing_source) === digest(prices.source)
      && row.discovery.model === row.model && row.discovery.environment_fingerprint === state.availability?.environment_fingerprint
      && Array.isArray(row.discovery.supported_reasoning_efforts));
  }
  valid(Array.isArray(state.availability?.allowed_profiles));
  // Recompute the complete candidate set, not merely the presence of a selected
  // legal key. This catches effort/model omissions and invented combinations.
  const recomputed = eligibleWorkerProfiles({pricingContract: prices,workerFamily:family, environmentEvidence: {
    fingerprint: state.availability.environment_fingerprint, allowed_profiles: state.availability.allowed_profiles,
    models: state.models.map(row => ({model: row.model, supported_reasoning_efforts: row.discovery.supported_reasoning_efforts}))}});
  valid(digest(wireProfiles(recomputed.profiles)) === digest(state.candidates) && digest(recomputed.models) === digest(state.models));
  if(expectedEnvironmentEvidence){
    const trusted=eligibleWorkerProfiles({environmentEvidence:expectedEnvironmentEvidence,pricingContract:prices,workerFamily:family});
    need(trusted.environment_fingerprint===state.availability.environment_fingerprint
      &&digest(trusted.allowed_profiles)===digest(state.availability.allowed_profiles)
      &&digest(wireProfiles(trusted.profiles))===digest(state.candidates)
      &&digest(trusted.models)===digest(state.models),'WORKER_PROFILE_V3_ENVIRONMENT_BINDING');
  }
  valid(digest(question.criteria) === digest(Object.fromEntries([...state.candidates.map(profile => [profile.id, criterion(profile)]), ['unknown', contract.unknown]])));
  valid(object(state.task) && ['implementation', 'repair'].includes(state.task.operation) && typeof state.task.id === 'string'
    && Array.isArray(state.task.write_scope) && state.task.write_scope.length > 0
    && Array.isArray(state.task.requirement_ids) && Array.isArray(state.original_requirements)
    && state.task.requirement_ids.every(id => state.original_requirements.some(row => row.id === id && typeof row.text === 'string'))
    && Array.isArray(state.output_interfaces) && object(state.public_failure_signals) && Array.isArray(state.public_failure_signals.signals)
    && object(state.binding) && /^[a-f0-9]{64}$/.test(state.binding.task_sha256 ?? '')
    && state.binding.operation === state.task.operation && state.binding.round_index === state.task.round_index
    && state.binding.original_task_id === state.task.original_task_id
    && state.binding.public_task_sha256 === digest(publicTask(state.task))
    && state.binding.empirical_snapshot_sha256 === empiricalEvidence.sha256
    && state.binding.empirical_evidence_sha256 === state.empirical_evidence?.evidence_sha256);
  verifyEmpiricalEvidence(decodeEmpirical(state.empirical_evidence), {snapshot: empiricalEvidence, task: state.task,
    operation: state.task.operation, profiles: state.candidates, expectedSha256: expectedEmpiricalSha256});
  return {valid: true, policy: contract.policy, source: {...source}, pricing_source: clone(prices.source),
    empirical_snapshot_sha256: empiricalEvidence.sha256, empirical_evidence_sha256: state.empirical_evidence.evidence_sha256,
    profiles: state.candidates.map(({id, model, effort}) => ({id, model, effort})), automatic_provider_calls: 0};
}

export function createWorkerProfileRouter({planning, environmentEvidence,workerFamily='codex',
  pricingContract = priceForFamily(workerFamily), empiricalEvidence, expectedEmpiricalSha256,
  decide, record, save}) {
  need(typeof decide === 'function' && typeof record === 'function' && typeof save === 'function', 'CODEX_WORKER_PROFILE_V2_AUDIT_REQUIRED');
  verifyHistoryEvidence(empiricalEvidence, {expectedSha256: expectedEmpiricalSha256});
  const snapshot = clone(empiricalEvidence), snapshotSha = expectedEmpiricalSha256 ?? snapshot.sha256;
  const catalog = eligibleWorkerProfiles({environmentEvidence, pricingContract,workerFamily}), selections = new Map();
  const verify = () => { assertWorkerProfileSource(); assertPrice(pricingContract.source.sha256,workerFamily);
    verifyHistoryEvidence(snapshot, {expectedSha256: snapshotSha}); };
  return {catalog: clone(catalog),
    async select(task, context) {
      verify();
      const {request, binding} = buildWorkerProfileRequest({planning, task, context, catalog,
        empiricalEvidence: snapshot, expectedEmpiricalSha256: snapshotSha});
      validateWorkerProfileRequest(request, {empiricalEvidence: snapshot, expectedEmpiricalSha256: snapshotSha,expectedWorkerFamily:workerFamily,expectedEnvironmentEvidence:environmentEvidence});
      const id = `worker-profile-v3-${randomUUID()}`, directory = `worker-model-routing/${id}`;
      await save(`${directory}/request.json`, request);
      await record({event: 'worker_profile_requested', id, policy: contract.policy, task_id: task.id,
        operation: binding.operation, round_index: binding.round_index, request_sha256: digest(request), directory,
        empirical_snapshot_sha256: snapshot.sha256, empirical_evidence_sha256: binding.empirical_evidence_sha256});
      const response = await decide(clone(request), {stage: 'profiles', purpose: 'worker-v3', profile_kind: 'worker-v3',
        decision_id: id, task_id: task.id, operation: binding.operation, round_index: binding.round_index});
      await save(`${directory}/response.json`, response);
      verify();
      need(object(response?.answers) && Object.keys(response.answers).length === 1 && Object.hasOwn(response.answers, contract.question_id),
        'CODEX_WORKER_PROFILE_V2_RESPONSE_INVALID');
      const answer = response.answers[contract.question_id];
      need(object(answer) && answer.type === 'choice' && typeof answer.choice === 'string'
        && Object.keys(answer).every(key => ['type', 'choice', 'confidence', 'probabilities'].includes(key)), 'CODEX_WORKER_PROFILE_V2_RESPONSE_INVALID');
      need(answer.choice !== 'unknown', 'CODEX_WORKER_PROFILE_V2_UNKNOWN');
      const profile = catalog.profiles.find(row => row.id === answer.choice);
      need(profile && Object.hasOwn(request.questions[contract.question_id].criteria, answer.choice), 'CODEX_WORKER_PROFILE_V2_NOT_REGISTERED');
      const body = {schema_version: 'worker-profile-selection/v3', id, policy: contract.policy, status: 'selected',
        task_id: task.id, operation: binding.operation, round_index: binding.round_index,
        profile_id: profile.id, model: profile.model, effort: profile.effort, profile: clone(profile),
        model_record: clone(catalog.models.find(row => row.model === profile.model)), contract_source: {...source},
        pricing_source: clone(catalog.pricing_source), environment_fingerprint: catalog.environment_fingerprint,
        empirical_snapshot_sha256: snapshot.sha256, empirical_evidence_sha256: binding.empirical_evidence_sha256,
        request_sha256: digest(request), response_sha256: digest(response), binding, audit_directory: directory,
        automatic_retries: 0, fallback_used: false, actual_served_identity: null, effective_internal_effort_verified: null};
      const selection = {...body, sha256: digest(body)};
      await save(`${directory}/selection.json`, selection);
      await record({event: 'worker_profile_selected', selection});
      selections.set(id, clone(selection)); return clone(selection);
    },
    assertExecution(selection, {model, effort, task, context}) {
      verify();
      const saved = selections.get(selection?.id), {sha256, ...body} = selection ?? {};
      need(saved && sha256 === digest(body) && digest(saved) === digest(selection), 'CODEX_WORKER_PROFILE_V2_SELECTION_UNCOMMITTED');
      need(model === selection.model && effort === selection.effort
        && catalog.profiles.some(row => row.id === selection.profile_id && row.model === model && row.effort === effort),
      'CODEX_WORKER_PROFILE_V2_EXECUTION_MISMATCH');
      const current = buildWorkerProfileRequest({planning, task, context, catalog,
        empiricalEvidence: snapshot, expectedEmpiricalSha256: snapshotSha});
      need(digest(current.binding) === digest(selection.binding) && digest(current.request) === selection.request_sha256,
        'CODEX_WORKER_PROFILE_V2_TASK_OR_EVIDENCE_DRIFT');
      return {verified: true, selection_id: selection.id, selection_sha256: selection.sha256, model, effort,
        environment_fingerprint: selection.environment_fingerprint, empirical_snapshot_sha256: snapshot.sha256};
    }};
}
