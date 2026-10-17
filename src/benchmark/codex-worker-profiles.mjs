import {readFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import * as pricing from './codex-pricing.mjs';

const path = 'docs/orchestration/contracts/codex-worker-profiles.v1.json';
const url = new URL(`../../${path}`, import.meta.url), raw = readFileSync(url), contract = JSON.parse(raw);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(JSON.stringify(canonical(value)));
const source = Object.freeze({path, sha256: hash(raw)});
const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), {code, outcome_uncertain: false}); };
const clone = structuredClone;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
need(contract.schema_version === 'codex-worker-profiles/v1' && contract.effort === 'high'
  && new Set(contract.profiles.map(row => row.id)).size === contract.profiles.length
  && contract.profiles.every(row => row.effort === 'high'), 'CODEX_WORKER_PROFILE_CONTRACT_INVALID');

export function codexWorkerProfilePolicy() { return {...clone(contract), source: {...source}}; }
export function assertCodexWorkerProfileSource() {
  need(hash(readFileSync(url)) === source.sha256, 'CODEX_WORKER_PROFILE_SOURCE_CHANGED'); return {...source};
}

/** Discovery is supplied by the frozen CLI environment; this module never
 * starts the app, reads credentials or makes network/model requests itself. */
export function eligibleCodexWorkerProfiles({environmentEvidence, pricingContract}) {
  assertCodexWorkerProfileSource();
  need(typeof environmentEvidence?.fingerprint === 'string' && Array.isArray(environmentEvidence.models), 'CODEX_WORKER_PROFILE_DISCOVERY_REQUIRED');
  need(pricingContract?.schema_version === 'codex-reference-pricing/v2' && Array.isArray(pricingContract.models)
    && typeof pricingContract.source?.sha256 === 'string', 'CODEX_WORKER_PROFILE_PRICING_REQUIRED');
  const exclusions = [], profiles = [];
  for (const registered of contract.profiles) {
    const discovered = environmentEvidence.models.find(row => row.model === registered.model);
    const price = pricingContract.models.find(row => row.model === registered.model);
    const reason = !discovered ? 'not_in_actual_application_discovery'
      : !discovered.supported_reasoning_efforts?.includes('high') ? 'discovery_high_effort_unavailable'
        : Array.isArray(environmentEvidence.allowed_profiles) && !environmentEvidence.allowed_profiles.some(row =>
          row.model === registered.model && row.effort === 'high') ? 'explicit_environment_allowlist_disallows_profile'
        : !price ? 'official_price_unregistered'
          : !price.capabilities?.supported_reasoning_efforts?.includes('high') ? 'official_high_effort_unverified'
            : !['short_standard', 'long_standard'].every(key => price.scenarios?.[key]?.service_tier === 'standard'
              && ['input', 'cached_input', 'cache_write', 'output'].every(field => Number.isFinite(price.scenarios[key].usd_per_million?.[field])
                && price.scenarios[key].usd_per_million[field] >= 0)) ? 'official_reference_rates_incomplete'
              : !price.capabilities.description || !Array.isArray(price.source_refs) || !price.source_refs.length ? 'official_capability_evidence_incomplete' : null;
    if (reason) { exclusions.push({profile_id: registered.id, model: registered.model, reason}); continue; }
    profiles.push({...clone(registered), capabilities: clone(price.capabilities),
      standard_reference_prices: clone(price.scenarios), source_refs: clone(price.source_refs),
      pricing_source: clone(pricingContract.source), discovery: {model: discovered.model,
        supported_reasoning_efforts: clone(discovered.supported_reasoning_efforts), environment_fingerprint: environmentEvidence.fingerprint}});
  }
  need(profiles.length > 0, 'CODEX_WORKER_PROFILE_NO_ELIGIBLE_MODEL');
  return {policy: contract.policy, source: {...source}, pricing_source: clone(pricingContract.source), profiles, exclusions,
    environment_fingerprint: environmentEvidence.fingerprint};
}

const rows = value => Array.isArray(value) ? value : object(value) && Array.isArray(value.columns) && Array.isArray(value.rows)
  ? value.rows.map(row => Object.fromEntries(value.columns.map((key, index) => [key, row[index]]))) : [];
function failureSignals(context) {
  const packet = context.repair_context?.artifact_repair, failure = packet?.failure ?? context.repair_context?.failure;
  if (!failure) return {status: context.operation === 'repair' ? 'not_supplied' : 'not_a_repair', signals: [], omitted: 0};
  const signals = [];
  for (const check of rows(failure.public_evidence)) {
    const complete = {...failure.public_evidence_defaults, ...check}, evidence = complete.evidence ?? {};
    if (evidence.error) signals.push({check_id: complete.check_id, test_id: null,
      error_type: evidence.error.code ?? evidence.error.error_type ?? null, message: evidence.error.message ?? '',
      unexecuted_test_ids: clone(evidence.unexecuted_test_ids ?? [])});
    for (const entry of rows(evidence.cases)) {
      const item = {...entry, ...(entry.details ?? {})};
      if (item.status === 'failed') signals.push({check_id: complete.check_id, test_id: item.test_id ?? item.id ?? null,
        assertion_id: item.failed_assertion_id ?? null, error_type: item.error_type ?? null, message: item.message ?? ''});
    }
  }
  const unique = [...new Map(signals.map(signal => [digest(signal), signal])).values()];
  return {status: 'public_observations_only', failure_code: failure.code ?? null,
    full_failure_sha256: digest(failure), controller_reference_is_retrievable: false,
    signals: unique.slice(0, contract.max_failure_signals).map(signal => ({...signal,
      message: signal.message.slice(0, contract.max_failure_message_characters),
      message_truncated: signal.message.length > contract.max_failure_message_characters,
      original_message_sha256: digest(signal.message)})), omitted: Math.max(0, unique.length - contract.max_failure_signals)};
}

function taskBinding(task, context) {
  return {task_sha256: digest(task), operation: context.operation ?? 'implementation', round_index: context.round_index ?? 0,
    original_task_id: context.original_task_id ?? task.id,
    input_artifact_revisions: clone(context.input_artifact_revisions ?? {}),
    repair_context_sha256: context.repair_context ? digest(context.repair_context) : null,
    additional_read_sources: (context.additional_read_sources ?? []).map(({path, sha256}) => ({path, sha256}))};
}

export function buildCodexWorkerProfileRequest({planning, task, context, catalog}) {
  need(planning?.plan && planning?.catalog && object(task) && typeof task.id === 'string'
    && Array.isArray(task.write_scope) && task.write_scope.length && Array.isArray(task.requirement_ids)
    && object(context) && ['implementation', 'repair'].includes(context.operation ?? 'implementation'), 'CODEX_WORKER_PROFILE_TASK_INVALID');
  need(Array.isArray(catalog?.profiles) && catalog.profiles.length > 0, 'CODEX_WORKER_PROFILE_NO_ELIGIBLE_MODEL');
  const original = planning.plan.tasks.find(row => row.id === task.id);
  need(original?.kind === 'implementation' && task.write_scope.every(path => original.write_scope.includes(path))
    && task.output_artifact_ids?.every(id => original.output_artifact_ids.includes(id)), 'CODEX_WORKER_PROFILE_TASK_SCOPE_INVALID');
  const ids = new Set(task.output_artifact_ids ?? []), requirements = new Set(task.requirement_ids);
  const descriptionRows = planning.requirement_descriptions?.filter(row => requirements.has(row.id)) ?? [];
  need([...requirements].every(id => descriptionRows.some(row => row.id === id)), 'CODEX_WORKER_PROFILE_REQUIREMENTS_MISSING');
  const binding = {...taskBinding(task, context), catalog_sha256: digest(catalog), source_sha256: planning.source_sha256 ?? null};
  const request = {model: 'jev-latest', state: {schema_version: 'codex-worker-profile-request/v1', policy: contract.policy,
    instructions: contract.instructions, boundary: contract.boundary,
    task: {id: task.id, original_task_id: binding.original_task_id, operation: binding.operation, round_index: binding.round_index,
      requirement_ids: clone(task.requirement_ids), read_scope: clone(task.read_scope ?? []), write_scope: clone(task.write_scope),
      input_artifact_ids: clone(task.input_artifact_ids ?? []), output_artifact_ids: clone(task.output_artifact_ids ?? [])},
    original_requirements: clone(descriptionRows),
    output_interfaces: clone(planning.catalog.units.filter(unit => unit.artifact_ids.some(id => ids.has(id)))),
    public_failure_signals: failureSignals(context), candidates: clone(catalog.profiles),
    availability: {environment_fingerprint: catalog.environment_fingerprint, excluded_profiles: clone(catalog.exclusions)},
    binding: {...binding, reference_access: 'controller_only_not_model_retrievable'}},
    questions: {[contract.question_id]: {type: 'choice', instructions: contract.question,
      criteria: Object.fromEntries([...catalog.profiles.map(profile => [profile.id,
        `${profile.model}; effort high. Use its exact inline capability and price record in state.candidates.`]), ['unknown', contract.unknown]])}}};
  return {request, binding};
}

/** Pure gateway validation of the new fixed profiles protocol. Discovery was
 * already checked by the router; this independently binds the exact registered
 * model/high pair and official price/capability records, without another call. */
export function validateCodexWorkerProfileRequest(request) {
  assertCodexWorkerProfileSource();
  const prices = pricing.codexPricingContract({version: 'v2'});
  pricing.assertCodexPricingSource(prices.source.sha256, {version: 'v2'});
  const state = request?.state, questions = request?.questions;
  const valid = condition => need(condition, 'CODEX_WORKER_PROFILE_REQUEST_INVALID');
  valid(request?.model === 'jev-latest' && object(state) && object(questions)
    && Object.keys(questions).length === 1 && Object.hasOwn(questions, contract.question_id));
  valid(state.schema_version === 'codex-worker-profile-request/v1' && state.policy === contract.policy
    && state.instructions === contract.instructions && state.boundary === contract.boundary);
  const question = questions[contract.question_id];
  valid(object(question) && question.type === 'choice' && question.instructions === contract.question && object(question.criteria));
  valid(Array.isArray(state.candidates) && state.candidates.length > 0
    && state.candidates.every(object) && new Set(state.candidates.map(row => row.id)).size === state.candidates.length);
  for (const candidate of state.candidates) {
    const registered = contract.profiles.find(row => row.id === candidate.id);
    const priced = prices.models.find(row => row.model === candidate.model);
    valid(registered && priced && registered.model === candidate.model && candidate.effort === 'high'
      && object(candidate.capabilities) && object(candidate.standard_reference_prices)
      && Array.isArray(candidate.source_refs) && object(candidate.pricing_source)
      && digest(candidate.capabilities) === digest(priced.capabilities)
      && digest(candidate.standard_reference_prices) === digest(priced.scenarios)
      && digest(candidate.source_refs) === digest(priced.source_refs)
      && digest(candidate.pricing_source) === digest(prices.source)
      && candidate.discovery?.model === candidate.model && candidate.discovery.supported_reasoning_efforts?.includes('high')
      && candidate.discovery.environment_fingerprint === state.availability?.environment_fingerprint);
  }
  const expectedCriteria = Object.fromEntries([...state.candidates.map(profile => [profile.id,
    `${profile.model}; effort high. Use its exact inline capability and price record in state.candidates.`]), ['unknown', contract.unknown]]);
  valid(digest(question.criteria) === digest(expectedCriteria));
  valid(object(state.task) && ['implementation', 'repair'].includes(state.task.operation) && typeof state.task.id === 'string'
    && Array.isArray(state.task.write_scope) && state.task.write_scope.length > 0
    && Array.isArray(state.task.requirement_ids) && Array.isArray(state.original_requirements)
    && state.task.requirement_ids.every(id => state.original_requirements.some(row => row.id === id && typeof row.text === 'string'))
    && Array.isArray(state.output_interfaces) && object(state.public_failure_signals)
    && Array.isArray(state.public_failure_signals.signals) && object(state.binding)
    && /^[a-f0-9]{64}$/.test(state.binding.task_sha256 ?? '') && /^[a-f0-9]{64}$/.test(state.binding.catalog_sha256 ?? ''));
  return {valid: true, policy: contract.policy, source: {...source}, pricing_source: clone(prices.source),
    profiles: state.candidates.map(({id, model, effort}) => ({id, model, effort})), automatic_provider_calls: 0};
}

/** A fresh selection is made for every actual implementation/repair invocation;
 * no automatic retries, cached answer reuse or fallback are introduced. */
export function createCodexWorkerProfileRouter({planning, environmentEvidence, pricingContract = pricing.codexPricingContract({version: 'v2'}),
  decide, record, save, assertPricingSource = () => pricing.assertCodexPricingSource(pricingContract.source.sha256, {version: 'v2'})}) {
  need(typeof decide === 'function' && typeof record === 'function' && typeof save === 'function'
    && typeof assertPricingSource === 'function', 'CODEX_WORKER_PROFILE_AUDIT_REQUIRED');
  const catalog = eligibleCodexWorkerProfiles({environmentEvidence, pricingContract});
  const selections = new Map();
  return {catalog: clone(catalog),
    async select(task, context) {
      assertCodexWorkerProfileSource(); assertPricingSource();
      const {request, binding} = buildCodexWorkerProfileRequest({planning, task, context, catalog});
      validateCodexWorkerProfileRequest(request);
      const id = `worker-profile-${randomUUID()}`, directory = `worker-model-routing/${id}`;
      await save(`${directory}/request.json`, request);
      await record({event: 'codex_worker_profile_requested', id, task_id: task.id, operation: binding.operation,
        round_index: binding.round_index, request_sha256: digest(request), directory, catalog_sha256: digest(catalog)});
      const response = await decide(clone(request), {stage: 'profiles', purpose: 'codex-worker-v1', profile_kind: 'codex-worker-v1', decision_id: id,
        task_id: task.id, operation: binding.operation, round_index: binding.round_index});
      await save(`${directory}/response.json`, response); // Preserve malformed/unknown answers too.
      assertCodexWorkerProfileSource(); assertPricingSource();
      need(object(response?.answers) && Object.keys(response.answers).length === 1
        && Object.hasOwn(response.answers, contract.question_id), 'CODEX_WORKER_PROFILE_RESPONSE_INVALID');
      const answer = response.answers[contract.question_id];
      need(object(answer) && answer.type === 'choice' && typeof answer.choice === 'string'
        && Object.keys(answer).every(key => ['type', 'choice', 'confidence', 'probabilities'].includes(key)), 'CODEX_WORKER_PROFILE_RESPONSE_INVALID');
      need(answer.choice !== 'unknown', 'CODEX_WORKER_PROFILE_UNKNOWN');
      const profile = catalog.profiles.find(row => row.id === answer.choice);
      need(profile && Object.hasOwn(request.questions[contract.question_id].criteria, answer.choice), 'CODEX_WORKER_PROFILE_NOT_REGISTERED');
      const body = {schema_version: 'codex-worker-profile-selection/v1', id, policy: contract.policy, status: 'selected',
        task_id: task.id, operation: binding.operation, round_index: binding.round_index,
        profile_id: profile.id, model: profile.model, effort: profile.effort, profile: clone(profile),
        contract_source: {...source}, pricing_source: clone(catalog.pricing_source), environment_fingerprint: catalog.environment_fingerprint,
        request_sha256: digest(request), response_sha256: digest(response), binding,
        audit_directory: directory, automatic_retries: 0, fallback_used: false, actual_served_identity: null};
      const selection = {...body, sha256: digest(body)};
      await save(`${directory}/selection.json`, selection);
      await record({event: 'codex_worker_profile_selected', selection});
      selections.set(selection.id, clone(selection));
      return clone(selection);
    },
    assertExecution(selection, {model, effort, task, context}) {
      assertCodexWorkerProfileSource(); assertPricingSource();
      const saved = selections.get(selection?.id), {sha256, ...body} = selection ?? {};
      need(saved && sha256 === digest(body) && digest(saved) === digest(selection), 'CODEX_WORKER_PROFILE_SELECTION_UNCOMMITTED');
      need(model === selection.model && effort === selection.effort && effort === 'high'
        && catalog.profiles.some(profile => profile.id === selection.profile_id && profile.model === model && profile.effort === effort),
      'CODEX_WORKER_PROFILE_EXECUTION_MISMATCH');
      need(digest(taskBinding(task, context)) === digest(Object.fromEntries(Object.entries(selection.binding)
        .filter(([key]) => !['catalog_sha256', 'source_sha256'].includes(key)))), 'CODEX_WORKER_PROFILE_TASK_DRIFT');
      return {verified: true, selection_id: selection.id, selection_sha256: selection.sha256, model, effort,
        environment_fingerprint: selection.environment_fingerprint};
    }};
}
