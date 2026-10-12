import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {prepareDecision} from '../client.mjs';
import {OPUS_55_RATES} from '../dashboard/pricing.mjs';
import {validateDagPlan} from './dag-contracts.mjs';
import {analyzeDag} from './artifact-dag.mjs';
import {adaptiveOutcomeUncertain, adaptiveTerminalCause} from './adaptive-failure.mjs';
import {projectAdaptiveRepairFailure} from './adaptive-repair-projection.mjs';

const CONTRACT = 'docs/orchestration/contracts/adaptive-profile-selection.v1.json';
const PROVIDER_LIMITS_CONTRACT = 'docs/orchestration/contracts/adaptive-profile-selection.v2.json';
const CANDIDATES = 'docs/orchestration/contracts/adaptive-profiles.v1.json';
const MODELS = 'docs/orchestration/contracts/models.v2.json';
const PRICE_SOURCE = 'src/dashboard/pricing.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const jsonHash = value => hash(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
const unique = values => [...new Set(values)];
const sameSet = (left, right) => Array.isArray(left) && Array.isArray(right)
  && left.length === right.length && unique(left).length === left.length && left.every(value => right.includes(value));
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, outcome_uncertain: false, ...details}); };

function clone(value) {
  let result;
  try { result = JSON.parse(JSON.stringify(value)); } catch { fail('ADAPTIVE_PROFILE_INVALID_JSON'); }
  if (!isDeepStrictEqual(result, value)) fail('ADAPTIVE_PROFILE_INVALID_JSON');
  return result;
}
function readSource(path) {
  const raw = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  return {raw, source: {path, sha256: hash(raw)}};
}
function versionAtLeast(actual, minimum) {
  const parse = value => typeof value === 'string' && /^(\d+)\.(\d+)\.(\d+)(?: \(Claude Code\))?$/.exec(value);
  const left = parse(actual), right = parse(minimum);
  if (!left || !right) return false;
  for (let index = 1; index < 4; index++) {
    if (Number(left[index]) !== Number(right[index])) return Number(left[index]) > Number(right[index]);
  }
  return true;
}

/** Read fixed English and documented candidates. No account lookup or inference. */
export function loadAdaptiveProfileContract({profilePolicy = 'bounded-v1'} = {}) {
  if (!['bounded-v1', 'provider-limits-v2'].includes(profilePolicy)) fail('ADAPTIVE_PROFILE_POLICY_INVALID');
  const providerLimitsOnly = profilePolicy === 'provider-limits-v2';
  const questionFile = readSource(providerLimitsOnly ? PROVIDER_LIMITS_CONTRACT : CONTRACT), candidateFile = readSource(CANDIDATES);
  const modelFile = readSource(MODELS), priceFile = readSource(PRICE_SOURCE);
  const contract = JSON.parse(questionFile.raw), catalog = JSON.parse(candidateFile.raw), existingModels = JSON.parse(modelFile.raw);
  const limitPolicyValid = providerLimitsOnly
    ? contract.policy?.max_wire_bytes === null && contract.policy?.provider_max_wire_bytes === 256000
      && contract.policy?.local_token_estimates === 'observation_only'
      && contract.policy?.token_admission_contract === 'docs/orchestration/contracts/jev-token-admission.v4.json'
      && contract.policy?.oversized_initial_batch === 'provider_body_only_split_once_to_single_tasks_before_any_submission'
    : contract.policy?.max_wire_bytes === 48000
      && contract.policy?.oversized_initial_batch === 'split_once_to_single_tasks_before_any_submission';
  if (contract.schema_version !== (providerLimitsOnly ? 'adaptive-profile-selection/v2' : 'adaptive-profile-selection/v1')
      || catalog.schema_version !== 'adaptive-profiles/v1'
      || contract.policy?.candidate_catalog !== CANDIDATES || catalog.model_catalog !== MODELS
      || contract.policy?.automatic_retries !== 0 || contract.policy?.batch_atomic !== true
      || contract.policy?.batch_size !== 2 || contract.policy?.repair_batch_size !== 1
      || !limitPolicyValid
      || contract.policy?.preflight_all_batches_before_submission !== true
      || contract.question?.type !== 'choice' || !text(contract.question.instructions)
      || !text(contract.question.target_template)
      || !sameSet(contract.question.template_fields, ['task_id', 'worker_id', 'artifact_ids', 'write_scope'])
      || contract.stop_choice?.id !== 'stop' || !text(contract.stop_choice.description)
      || !Array.isArray(catalog.profiles) || !catalog.profiles.length || catalog.profiles.length > 254
      || unique(catalog.profiles.map(profile => profile.id)).length !== catalog.profiles.length
      || !Array.isArray(catalog.models) || !catalog.models.length
      || unique(catalog.models.map(model => model.id)).length !== catalog.models.length) fail('ADAPTIVE_PROFILE_CONTRACT_INVALID');
  const models = new Map(catalog.models.map(model => [model.id, model]));
  for (const model of models.values()) {
    const existing = existingModels.families?.find(row => row.id === model.id);
    const price = model.price;
    if (!existing || existing.model !== model.model || existing.minimumCliVersion !== model.minimum_cli_version
        || !sameSet(existing.efforts, model.supported_efforts) || model.adapter !== 'claude-cli'
        || model.documented_support !== 'verified' || model.current_account_availability !== 'unverified'
        || price?.basis !== 'official_api_list' || price.currency !== 'USD' || price.unit !== 'per_million_tokens'
        || price.actual_billed_usd !== null || !catalog.sources[price.source_id]?.url
        || !Array.isArray(price.prompt_tiers) || !price.prompt_tiers.length) fail('ADAPTIVE_PROFILE_CONTRACT_INVALID');
    let nextMinimum = 0;
    for (const [index, tier] of price.prompt_tiers.entries()) {
      if (tier.min_prompt_tokens !== nextMinimum
          || (tier.max_prompt_tokens === null ? index !== price.prompt_tiers.length - 1
            : !Number.isSafeInteger(tier.max_prompt_tokens) || tier.max_prompt_tokens < nextMinimum)
          || !object(tier.rates) || !sameSet(Object.keys(tier.rates), Object.keys(OPUS_55_RATES))
          || Object.values(tier.rates).some(rate => !Number.isFinite(rate) || rate < 0)) fail('ADAPTIVE_PROFILE_CONTRACT_INVALID');
      nextMinimum = tier.max_prompt_tokens === null ? null : tier.max_prompt_tokens + 1;
    }
    if (nextMinimum !== null) fail('ADAPTIVE_PROFILE_CONTRACT_INVALID');
  }
  if (!isDeepStrictEqual(models.get('opus55')?.price.prompt_tiers,
    [{min_prompt_tokens: 0, max_prompt_tokens: null, rates: {...OPUS_55_RATES}}])) fail('ADAPTIVE_PROFILE_PRICE_DRIFT');
  for (const profile of catalog.profiles) {
    const model = models.get(profile.family_id);
    if (!id(profile.id) || profile.id === 'stop' || profile.adapter !== 'claude-cli'
        || !model || profile.model !== model.model || !model.supported_efforts.includes(profile.effort)) fail('ADAPTIVE_PROFILE_CONTRACT_INVALID');
  }
  return {contract, catalog, source: {question: questionFile.source, candidates: candidateFile.source,
    models: modelFile.source, canonical_opus_price: priceFile.source}};
}

function allowedProfiles(loaded, {cli_version, allowed_profile_ids} = {}) {
  const rows = loaded.catalog.profiles;
  const wanted = allowed_profile_ids ?? rows.map(profile => profile.id);
  if (!Array.isArray(wanted) || !wanted.length || unique(wanted).length !== wanted.length
      || wanted.some(value => !rows.some(profile => profile.id === value))) fail('ADAPTIVE_PROFILE_ALLOWLIST_INVALID');
  const models = new Map(loaded.catalog.models.map(model => [model.id, model]));
  const selected = rows.filter(profile => wanted.includes(profile.id));
  if (selected.some(profile => !versionAtLeast(cli_version, models.get(profile.family_id).minimum_cli_version))) {
    fail('ADAPTIVE_PROFILE_CLI_UNSUPPORTED');
  }
  return selected.map(profile => {
    const model = models.get(profile.family_id);
    return {...clone(profile), price: {...clone(model.price), source: clone(loaded.catalog.sources[model.price.source_id])},
      provenance: {documented_support: model.documented_support, current_account_availability: model.current_account_availability,
        measured_task_performance: null, cli_version, minimum_cli_version: model.minimum_cli_version,
        effective_effort_verified: null, contract_sources: clone(loaded.source)}};
  });
}

/** Re-resolve dispatch values from the pinned allowlist, never arbitrary model strings. */
export function resolveAdaptiveProfile(profile_id, options = {}) {
  const loaded = loadAdaptiveProfileContract({profilePolicy: options.profilePolicy});
  const profile = allowedProfiles(loaded, options).find(row => row.id === profile_id);
  if (!profile) fail('ADAPTIVE_PROFILE_NOT_ALLOWED');
  return profile;
}

const knownNumber = value => Number.isFinite(value) && value >= 0 ? value : null;
const knownCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const knownText = value => text(value) ? value : null;
const tokenFields = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'];
function projectProfileUsage(receipts, relatedTaskIds) {
  if (relatedTaskIds !== null && (!Array.isArray(relatedTaskIds) || unique(relatedTaskIds).length !== relatedTaskIds.length
      || relatedTaskIds.some(value => !id(value)))) fail('ADAPTIVE_PROFILE_USAGE_SCOPE_INVALID');
  const rows = receipts.map(receipt => {
    if (!object(receipt)) fail('ADAPTIVE_PROFILE_USAGE_INVALID');
    const requestedModel = knownText(receipt.requested_model) ?? knownText(receipt.requested_profile?.model);
    const requestedEffort = knownText(receipt.requested_effort) ?? knownText(receipt.requested_profile?.effort);
    const taskId = knownText(receipt.original_task_id) ?? knownText(receipt.task_id);
    const terminal = object(receipt.terminal_cause) ? receipt.terminal_cause : receipt;
    return {receipt_id: knownText(receipt.id), task_id: taskId, execution_task_id: knownText(receipt.task_id),
      round_index: Number.isSafeInteger(receipt.round_index) && receipt.round_index >= 0 ? receipt.round_index : null,
      operation: knownText(receipt.operation), status: knownText(receipt.status),
      terminal_cause: ['failed', 'error', 'stopped', 'uncertain'].includes(receipt.status)
        ? {code: knownText(terminal.code), http_status: Number.isInteger(terminal.http_status) ? terminal.http_status : null,
          category: knownText(terminal.category), outcome_uncertain: typeof terminal.outcome_uncertain === 'boolean' ? terminal.outcome_uncertain : null}
        : null,
      profile_id: knownText(receipt.profile_selection?.profile_id) ?? knownText(receipt.requested_profile?.id),
      selection: object(receipt.profile_selection) ? {decision_id: knownText(receipt.profile_selection.decision_id),
        choice_id: knownText(receipt.profile_selection.choice_id)} : null,
      requested_model: requestedModel, observed_models: Array.isArray(receipt.observed_models) && receipt.observed_models.every(text)
        ? [...receipt.observed_models] : null,
      requested_effort: requestedEffort, executed_model_arg: knownText(receipt.executed_model_arg),
      executed_effort_arg: knownText(receipt.executed_effort_arg),
      model_identity_verified: typeof receipt.model_identity_verified === 'boolean' ? receipt.model_identity_verified : null,
      effective_effort_verified: typeof receipt.effective_effort_verified === 'boolean' ? receipt.effective_effort_verified : null,
      wall_ms: knownNumber(receipt.wall_ms), tokens: Object.fromEntries(tokenFields.map(key => [key, knownCount(receipt.usage?.[key])])),
      api_equivalent_usd: knownNumber(receipt.api_equivalent_usd), actual_billed_usd: knownNumber(receipt.actual_billed_usd)};
  });
  const numeric = values => {
    const known = values.filter(value => value !== null), knownSubtotal = known.reduce((sum, value) => sum + value, 0);
    return known.length === values.length ? knownSubtotal : {known_subtotal: knownSubtotal,
      missing_count: values.length - known.length, complete_total: null};
  };
  const summarize = values => ({receipt_count: values.length,
    reported_completed_count: values.filter(row => ['completed', 'succeeded', 'passed'].includes(row.status)).length,
    reported_failed_count: values.filter(row => ['failed', 'error', 'stopped'].includes(row.status)).length,
    reported_uncertain_count: values.filter(row => row.status === 'uncertain' || row.terminal_cause?.outcome_uncertain === true).length,
    status_counts: unique(values.map(row => row.status)).map(status => ({status, count: values.filter(row => row.status === status).length})),
    worker_wall_ms: numeric(values.map(row => row.wall_ms)),
    tokens: Object.fromEntries(tokenFields.map(key => [key, numeric(values.map(row => row.tokens[key]))])),
    api_equivalent_usd: numeric(values.map(row => row.api_equivalent_usd)), actual_billed_usd: numeric(values.map(row => row.actual_billed_usd))});
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.requested_model, row.requested_effort]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const aggregateColumns = ['requested_model', 'requested_effort', 'receipt_count', 'reported_completed_count',
    'reported_failed_count', 'reported_uncertain_count', 'status_counts', 'worker_wall_ms', ...tokenFields,
    'api_equivalent_usd', 'actual_billed_usd'];
  const aggregateRows = [...groups.values()].map(values => {
    const summary = summarize(values), flat = {requested_model: values[0].requested_model,
      requested_effort: values[0].requested_effort, ...summary, ...summary.tokens};
    return aggregateColumns.map(key => flat[key]);
  });
  return {schema_version: 'adaptive-profile-usage/v1', related_task_ids: relatedTaskIds,
    receipts: rows.filter(row => relatedTaskIds === null || relatedTaskIds.includes(row.task_id)),
    all_receipts: {receipt_count: rows.length, by_requested_model_effort: {columns: aggregateColumns, rows: aggregateRows}},
    aggregate_table: 'Each row uses the named columns in order; values are literal model/effort groups and exact aggregates. No string dictionary or external lookup is required.',
    metric_values: 'A numeric aggregate is the exact complete total with zero missing values. An object preserves known_subtotal and missing_count with complete_total:null. Per-receipt unknown values remain null; no cost or token count is inferred.',
    interpretation: 'Worker-reported completion is not public-check success. Summed worker wall time is not end-to-end wall time. These historical scopes differ; totals do not establish model superiority. Actual billing is not inferred. Raw receipt details remain controller-only.',
    original_receipts_ref: {sha256: jsonHash(receipts), receipt_count: receipts.length, access: 'controller_only', retrieval_available_to_model: false}};
}

/** Project public observations and purpose-specific worker usage. Failure
 * semantics remain inline; recognized provenance is controller-only. */
export function projectAdaptiveProfileEvidence({failure = null, prior_usage = null, related_task_ids = null} = {}) {
  const raw = {failure: clone(failure), prior_usage: clone(prior_usage)}, projected = clone(raw), omitted_metadata = [], derived_fields = [];
  const omit = (value, key, pointer, reason) => {
    if (!Object.hasOwn(value, key)) return;
    omitted_metadata.push({pointer: `${pointer}/${key}`, sha256: jsonHash(value[key]),
      utf8_bytes: Buffer.byteLength(JSON.stringify(value[key])), reason});
    delete value[key];
  };
  const projectDescription = (provenance, path) => {
    if (!object(provenance) || provenance.schema_version !== 'public-description-provenance/v1') return;
    for (const field of ['base_fixture_sha256', 'generated_endpoint_sha256', 'input_sha256']) {
      if (typeof provenance[field] === 'string' && /^[a-f0-9]{64}$/.test(provenance[field])) omit(provenance, field, path, 'controller_description_source_hash');
    }
    for (const field of ['request_description_pointer', 'schema_description_pointer']) {
      if (typeof provenance[field] === 'string' && provenance[field].startsWith('/')) omit(provenance, field, path,
        'controller_source_location; expected_request_and_actual_schema_runtime_source_values_remain_literal');
    }
    if (object(provenance.source) && isDeepStrictEqual(provenance.source, provenance.runtime)
        && !Object.hasOwn(provenance, 'source_equals_runtime')) {
      omit(provenance, 'source', path, 'exact_duplicate_runtime_observation; source_equals_runtime_true_is_inline');
      provenance.source_equals_runtime = true;
      derived_fields.push({pointer: `${path}/source_equals_runtime`, value: true,
        basis: 'source and runtime observations are deeply equal in the original case; runtime remains inline'});
    }
  };
  if (object(failure) && Array.isArray(failure.public_evidence) && Array.isArray(failure.local_evidence)
      && object(failure.artifact_revisions) && object(failure.environment) && text(failure.binding_digest)) {
    // The established projection validates revision/runtime consistency and
    // identifies normal installer progress without guessing from exit code.
    const checked = projectAdaptiveRepairFailure(failure).failure;
    for (const key of ['run_id', 'graph_revision', 'source_sha256', 'catalog_sha256', 'binding_digest',
      'environment', 'task_attempt_ids', 'artifact_revisions']) omit(projected.failure, key, '/failure', 'controller_failure_provenance');
    for (const kind of ['public_evidence', 'local_evidence']) for (const [index, row] of projected.failure[kind].entries()) {
      const path = `/failure/${kind}/${index}`;
      for (const key of ['check_version', 'environment_ref', 'artifact_revisions', 'runtime_binding', 'evidence_key']) omit(row, key, path, 'controller_check_provenance');
      if (!object(row.evidence)) continue;
      const evidence = row.evidence, epath = `${path}/evidence`;
      for (const key of ['artifact_revisions', 'assertion_contract_sha256', 'binding_kind', 'check_version', 'environment_ref',
        'product_certified', 'python_version', 'schema_version', 'scope', 'container_removed', 'report_ref', 'process_ref', 'environment_evidence']) {
        // Environment evidence can contain a semantic failure; only the normal empty value is omitted.
        if (key !== 'environment_evidence' || isDeepStrictEqual(evidence[key], {})) omit(evidence, key, epath, 'controller_check_provenance');
      }
      for (const key of ['check_id', 'status', 'executed', 'exit_code', 'assertions', 'skipped', 'outcome_uncertain']) {
        if (Object.hasOwn(row, key) && Object.hasOwn(evidence, key) && isDeepStrictEqual(row[key], evidence[key])) omit(evidence, key, epath, 'exact_outer_duplicate');
      }
      const setup = evidence.setup_evidence;
      if (object(setup) && checked[kind][index]?.evidence?.setup_evidence?.stdout_omitted?.kind === 'normal_successful_install_progress') {
        omit(setup, 'stdout', `${epath}/setup_evidence`, 'validated_normal_successful_install_progress');
        for (const key of ['console_script', 'interpreter_identity', 'python', 'source_root', 'trace_path', 'venv']) omit(setup, key, `${epath}/setup_evidence`, 'successful_setup_provenance');
      }
      const invocations = evidence.candidate_invocations;
      if (Array.isArray(invocations) && !Object.hasOwn(evidence, 'profile_invocation_summary')
          && invocations.every(item => object(item) && sameSet(Object.keys(item), ['exit_code', 'installed_cli', 'number'])
            && Number.isInteger(item.exit_code) && typeof item.installed_cli === 'boolean'
            && Number.isSafeInteger(item.number) && item.number >= 0)) {
        evidence.profile_invocation_summary = {count: invocations.length,
          exit_codes: unique(invocations.map(item => item.exit_code)).map(exit_code => ({exit_code, count: invocations.filter(item => item.exit_code === exit_code).length})),
          installed_cli_count: invocations.filter(item => item.installed_cli).length};
        omit(evidence, 'candidate_invocations', epath, 'known_invocation_receipts_summarized; actual_case_observations_retained');
      }
      if (row.status === 'passed' && row.executed === true && row.exit_code === 0 && row.outcome_uncertain === false) {
        const environment = evidence.environment_evidence;
        if (object(environment) && environment.network_none_observed === true
            && sameSet(Object.keys(environment), ['interfaces', 'ipv4_routes', 'network_none_observed', 'preinstalled_modules'])
            && isDeepStrictEqual(environment.ipv4_routes, []) && Array.isArray(environment.preinstalled_modules) && environment.preinstalled_modules.every(text)
            && Array.isArray(environment.interfaces) && environment.interfaces.every(item => object(item)
              && sameSet(Object.keys(item), ['loopback', 'name', 'up']) && text(item.name)
              && typeof item.loopback === 'boolean' && typeof item.up === 'boolean')) {
          omit(evidence, 'environment_evidence', epath, 'controller_successful_environment_proof');
        }
        if (object(setup) && setup.exit_code === 0 && setup.stderr === '' && object(setup.entrypoint_metadata_probe)) {
          omit(setup, 'entrypoint_metadata_probe', `${epath}/setup_evidence`, 'controller_successful_entrypoint_proof');
        }
      }
      if (Array.isArray(evidence.cases)) {
        for (const [caseIndex, item] of evidence.cases.entries()) {
          projectDescription(item?.description_provenance, `${epath}/cases/${caseIndex}/description_provenance`);
        }
        const covered = unique([...evidence.cases.map(item => item.test_id), ...(evidence.unexecuted_test_ids ?? [])]);
        if (sameSet(evidence.test_ids, covered)) omit(evidence, 'test_ids', epath, 'exact_case_and_unexecuted_coverage');
        const passed = evidence.cases.filter(item => object(item) && item.status === 'passed'
          && sameSet(Object.keys(item), ['test_id', 'status', 'assertions']) && text(item.test_id)
          && Number.isSafeInteger(item.assertions) && item.assertions >= 0);
        if (passed.length && !Object.hasOwn(evidence, 'profile_passed_case_summary')) {
          omitted_metadata.push({pointer: `${epath}/cases`, sha256: jsonHash(evidence.cases),
            utf8_bytes: Buffer.byteLength(JSON.stringify(evidence.cases)), reason: 'plain_passed_cases_summarized; every nonplain_or_nonpassed_case_remains_literal'});
          evidence.profile_passed_case_summary = {status: 'passed', case_count: passed.length,
            assertions: passed.reduce((sum, item) => sum + item.assertions, 0), test_ids: passed.map(item => item.test_id)};
          evidence.cases = evidence.cases.filter(item => !passed.includes(item));
        }
      }
    }
    const scope = projected.failure.repair_scope;
    if (object(scope)) {
      // Owner/repair validation seals this context for later controller replay.
      // It is not model-selection evidence: actual failures and selected scope
      // remain inline, while the unmodified input and context_ref bind its bytes.
      const ownership = scope.inferred_ownership;
      if (object(ownership) && ownership.repair_input_policy === 'evidence-v1') {
        omit(ownership, 'repair_input_context', '/failure/repair_scope/inferred_ownership',
          'controller_repair_input_validation_context; original failure retained and hashed; model-selection evidence unchanged');
      }
      // The repair action has already been selected. Its separate inline scope
      // and the literal public observations remain; scope-selection proofs do not.
      for (const field of ['observed_failures', 'source_file_count', 'assertion_policy', 'assertion_contract_sha256',
        'attribution_basis', 'assertion_contract_version', 'static_probe', 'blocker_owner_task_ids', 'observed_failure_owner_task_ids']) {
        omit(scope, field, '/failure/repair_scope', 'completed_repair_scope_selection_proof; public_observations_and_selected_action_remain_inline');
      }
      if (object(scope.causal)) {
        const path = '/failure/repair_scope/causal', causal = scope.causal;
        for (const field of ['contract_source', 'binding', 'chains', 'choice_bindings', 'sha256']) omit(causal, field, path, 'completed_repair_scope_selection_proof');
        if (object(causal.repair_history)) for (const field of ['source_sha256', 'catalog_sha256', 'final_artifact_revisions_sha256', 'sha256']) {
          omit(causal.repair_history, field, `${path}/repair_history`, 'controller_history_provenance');
        }
        const history = causal.repair_history, originalCases = new Map();
        const identity = row => JSON.stringify([row.check_id, row.test_id, row.assertion_id]);
        for (const check of raw.failure.public_evidence) if (check.status === 'failed' && check.executed === true && check.outcome_uncertain === false) {
          for (const testcase of check.evidence?.cases ?? []) if (testcase.status === 'failed') {
            const observation = {check_id: check.check_id, test_id: testcase.test_id, assertion_id: testcase.failed_assertion_id ?? null,
              error_type: testcase.error_type ?? null, message: testcase.message ?? null,
              ...(Object.hasOwn(testcase, 'description_provenance') ? {description_provenance: clone(testcase.description_provenance)} : {})};
            const key = identity(observation), rows = originalCases.get(key) ?? []; rows.push(observation); originalCases.set(key, rows);
          }
        }
        let references = 0;
        for (const [entryIndex, entry] of (Array.isArray(history?.entries) ? history.entries : []).entries()) if (object(entry)) {
          const entryPath = `${path}/repair_history/entries/${entryIndex}`;
          for (const field of ['source_refs', 'relevant_revisions']) omit(entry, field, entryPath, 'controller_history_provenance; selected_changed_and_unchanged_artifacts_remain_inline');
          for (const [fileIndex, file] of (Array.isArray(entry.changed_files) ? entry.changed_files : []).entries()) if (object(file)) {
            for (const field of ['before_sha256', 'after_sha256']) omit(file, field, `${entryPath}/changed_files/${fileIndex}`, 'controller_changed_file_provenance; exact_changed_path_and_artifact_remain_inline');
          }
          for (const field of ['failures_before', 'failures_after']) if (Array.isArray(entry[field])) {
            for (const [rowIndex, row] of entry[field].entries()) {
              if (!object(row)) continue;
              const original = originalCases.get(identity(row)), rowPath = `${entryPath}/${field}/${rowIndex}`;
              if (!Object.hasOwn(history, 'observation_reference_rule') && original?.length === 1 && isDeepStrictEqual(row, original[0])) {
                omitted_metadata.push({pointer: rowPath, sha256: jsonHash(row), utf8_bytes: Buffer.byteLength(JSON.stringify(row)),
                  reason: 'exact_complete_history_observation_equals_unique_current_failed_check_test_assertion; current_observation_inline'});
                entry[field][rowIndex] = {same_as_current_public_case: {check_id: row.check_id, test_id: row.test_id, assertion_id: row.assertion_id}};
                references++;
              } else projectDescription(row?.description_provenance, `${rowPath}/description_provenance`);
            }
          }
          const originalEntry = raw.failure.repair_scope.causal.repair_history.entries[entryIndex];
          if (!Object.hasOwn(history, 'observation_reference_rule') && references > 0
              && Array.isArray(originalEntry.failures_before) && originalEntry.failures_before.length > 0
              && isDeepStrictEqual(originalEntry.failures_before, originalEntry.failures_after)
              && originalEntry.failures_before.every(row => object(row) && originalCases.get(identity(row))?.length === 1
                && isDeepStrictEqual(row, originalCases.get(identity(row))[0]))) {
            omitted_metadata.push({pointer: `${entryPath}/failures_after`, sha256: jsonHash(originalEntry.failures_after),
              utf8_bytes: Buffer.byteLength(JSON.stringify(originalEntry.failures_after)),
              reason: 'exact_complete_after_observations_equal_same_entry_before_observations; explicit_inline_reference'});
            entry.failures_after = {same_as_failures_before: true};
          }
        }
        if (references) {
          history.observation_reference_rule = 'same_as_current_public_case identifies the unique current failed case by check_id, test_id and failed_assertion_id (null if absent). Its complete error_type, message and description observation are exactly unchanged at this history position. Read them inline from that case; absent error_type/message means null. failures_after:{same_as_failures_before:true} means the complete ordered after observations equal this entry\'s before observations. This does not say files or causes are unchanged.';
          derived_fields.push({pointer: `${path}/repair_history/observation_reference_rule`, value: history.observation_reference_rule,
            basis: `${references} historical rows exactly match unique current observations before projection`});
        }
      }
    }
    const plainPublic = projected.failure.public_evidence.filter((row, index) => object(row) && row.status === 'passed'
      && row.executed === true && row.exit_code === 0 && row.skipped === 0 && row.outcome_uncertain === false
      && Number.isSafeInteger(row.assertions) && row.assertions >= 0 && text(row.check_id)
      && Object.keys(row).every(key => ['check_id', 'status', 'executed', 'exit_code', 'assertions', 'skipped', 'outcome_uncertain', 'evidence'].includes(key))
      && object(row.evidence) && Object.keys(row.evidence).every(key =>
        ['cases', 'error', 'setup_evidence', 'unexecuted_test_ids', 'profile_invocation_summary', 'profile_passed_case_summary'].includes(key))
      && !Object.hasOwn(raw.failure.public_evidence[index].evidence, 'profile_invocation_summary')
      && !Object.hasOwn(raw.failure.public_evidence[index].evidence, 'profile_passed_case_summary')
      && row.evidence.error === null && isDeepStrictEqual(row.evidence.cases, [])
      && isDeepStrictEqual(row.evidence.unexecuted_test_ids, [])
      && isDeepStrictEqual(row.evidence.setup_evidence, {console_script_exists: true, exit_code: 0, stderr: ''})
      && object(row.evidence.profile_passed_case_summary)
      && row.evidence.profile_passed_case_summary.status === 'passed'
      && Number.isSafeInteger(row.evidence.profile_passed_case_summary.case_count)
      && row.evidence.profile_passed_case_summary.assertions === row.assertions
      && Array.isArray(row.evidence.profile_passed_case_summary.test_ids)
      && row.evidence.profile_passed_case_summary.test_ids.length === row.evidence.profile_passed_case_summary.case_count);
    if (plainPublic.length && !Object.hasOwn(projected.failure, 'profile_passed_public_summary')) {
      for (const row of plainPublic) {
        const index = projected.failure.public_evidence.indexOf(row), original = raw.failure.public_evidence[index];
        omitted_metadata.push({pointer: `/failure/public_evidence/${index}`, sha256: jsonHash(original),
          utf8_bytes: Buffer.byteLength(JSON.stringify(original)),
          reason: 'plain_successful_public_check_summarized_for_model_selection; exact_check_case_assertion_counts_retained'});
      }
      projected.failure.profile_passed_public_summary = {status: 'passed', executed: true, exit_code: 0,
        skipped: 0, outcome_uncertain: false, check_count: plainPublic.length,
        checks: plainPublic.map(row => ({check_id: row.check_id, assertions: row.assertions,
          case_count: row.evidence.profile_passed_case_summary.case_count})),
        case_count: plainPublic.reduce((sum, row) => sum + row.evidence.profile_passed_case_summary.case_count, 0),
        assertions: plainPublic.reduce((sum, row) => sum + row.assertions, 0)};
      projected.failure.public_evidence = projected.failure.public_evidence.filter(row => !plainPublic.includes(row));
    }
    // Normal local readiness receipts contain no failure information. Keep their
    // exact check/task/assertion accounting once, not repeated success envelopes.
    const plainLocal = projected.failure.local_evidence.filter(row => object(row) && row.status === 'passed'
      && row.executed === true && row.exit_code === 0 && row.skipped === 0 && row.outcome_uncertain === false
      && Number.isSafeInteger(row.assertions) && row.assertions >= 0 && text(row.check_id) && text(row.task_id)
      && isDeepStrictEqual(row.evidence, {error: null}) && Object.keys(row).every(key =>
        ['check_id', 'status', 'executed', 'exit_code', 'assertions', 'skipped', 'outcome_uncertain', 'evidence', 'task_id', 'attempt_id'].includes(key)));
    if (plainLocal.length && !Object.hasOwn(projected.failure, 'profile_passed_local_summary')) {
      const originalRows = raw.failure.local_evidence;
      for (const row of plainLocal) {
        const index = projected.failure.local_evidence.indexOf(row);
        omitted_metadata.push({pointer: `/failure/local_evidence/${index}`, sha256: jsonHash(originalRows[index]),
          utf8_bytes: Buffer.byteLength(JSON.stringify(originalRows[index])), reason: 'plain_successful_local_check_summarized; check_task_assertion_counts_retained'});
      }
      projected.failure.profile_passed_local_summary = {status: 'passed', executed: true, exit_code: 0, skipped: 0, outcome_uncertain: false,
        check_count: plainLocal.length, assertions: plainLocal.reduce((sum, row) => sum + row.assertions, 0),
        by_task: unique(plainLocal.map(row => row.task_id)).map(task_id => ({task_id,
          check_count: plainLocal.filter(row => row.task_id === task_id).length,
          assertions: plainLocal.filter(row => row.task_id === task_id).reduce((sum, row) => sum + row.assertions, 0)}))};
      projected.failure.local_evidence = projected.failure.local_evidence.filter(row => !plainLocal.includes(row));
    }
  }
  if (Array.isArray(prior_usage)) {
    const usage = projectProfileUsage(prior_usage, related_task_ids);
    omitted_metadata.push({pointer: '/prior_usage', sha256: jsonHash(prior_usage), utf8_bytes: Buffer.byteLength(JSON.stringify(prior_usage)),
      reason: 'purpose_specific_typed_receipts_for_related_tasks_and_whole_history_model_aggregates; raw_fields_controller_only'});
    projected.prior_usage = usage;
  }
  const context_ref = {sha256: jsonHash(raw), access: 'controller_only', retrieval_available_to_model: false};
  return {...projected, context_ref, report: {schema_version: 'adaptive-profile-evidence-projection/v1', context_ref,
    input_bytes: Buffer.byteLength(JSON.stringify(raw)), projected_bytes: Buffer.byteLength(JSON.stringify(projected)),
    omitted_metadata, derived_fields, supported_failure_projection: object(failure) && Array.isArray(failure.public_evidence)
      && Array.isArray(failure.local_evidence) && object(failure.artifact_revisions) && object(failure.environment) && text(failure.binding_digest),
    unknown_semantic_fields: 'failure semantics preserved; receipts use an explicit typed profile-selection projection with raw hash/ref',
    usage_projection: Array.isArray(prior_usage) ? {related_task_ids, raw_receipt_count: prior_usage.length,
      inline_receipt_count: projected.prior_usage.receipts.length, all_receipts_in_aggregate: true} : null,
    failure_case_policy: 'Only recognized complete successful checks/cases are aggregated. Current failures, not-reached, unexecuted and unknown semantics remain inline. Known source provenance is controller-only; exact duplicate historical observations use explicit unique check/test/assertion references to current inline observations.'}};
}

function checkedContext({plan: rawPlan, catalog: rawCatalog, requirement_descriptions, task_ids, phase, round_index}) {
  const plan = validateDagPlan(rawPlan), catalog = clone(rawCatalog);
  if (!['initial', 'repair'].includes(phase) || !Number.isSafeInteger(round_index) || round_index < 0) fail('ADAPTIVE_PROFILE_PHASE_INVALID');
  const implementations = plan.tasks.filter(task => task.kind === 'implementation');
  const selectedIds = task_ids ?? (phase === 'initial' ? implementations.map(task => task.id) : null);
  if (!Array.isArray(selectedIds) || !selectedIds.length || selectedIds.length > 30
      || unique(selectedIds).length !== selectedIds.length || selectedIds.some(value => !implementations.some(task => task.id === value))) {
    fail('ADAPTIVE_PROFILE_TASKS_INVALID');
  }
  // A profile is stored on a worker. Reused workers must not receive contradictory per-task choices.
  if (unique(implementations.map(task => task.worker_id)).length !== implementations.length) fail('ADAPTIVE_PROFILE_SHARED_WORKER');
  if (catalog.schema_version !== 'adaptive-catalog/v1' || !/^[0-9a-f]{64}$/.test(catalog.source_sha256)
      || !Array.isArray(catalog.units) || !Array.isArray(catalog.artifacts) || !Array.isArray(catalog.evidence)
      || !sameSet(catalog.artifacts.map(artifact => artifact.id), plan.artifacts.map(artifact => artifact.id))
      || !sameSet(catalog.units.flatMap(unit => unit.artifact_ids), plan.artifacts.map(artifact => artifact.id))
      || !sameSet(catalog.units.flatMap(unit => unit.requirement_ids), plan.requirement_ids)
      || unique(catalog.units.map(unit => unit.id)).length !== catalog.units.length) fail('ADAPTIVE_PROFILE_CATALOG_BINDING');
  const unitsByTask = new Map();
  for (const task of implementations) {
    const units = catalog.units.filter(unit => unit.artifact_ids.some(artifact => task.output_artifact_ids.includes(artifact)));
    if (!sameSet(units.flatMap(unit => unit.artifact_ids), task.output_artifact_ids)
        || !sameSet(units.flatMap(unit => unit.requirement_ids), task.requirement_ids)
        || !sameSet(catalog.artifacts.filter(artifact => task.output_artifact_ids.includes(artifact.id)).flatMap(artifact => artifact.paths), task.write_scope)
        || units.some(unit => !text(unit.title) || !text(unit.interface))) fail('ADAPTIVE_PROFILE_CATALOG_BINDING');
    unitsByTask.set(task.id, units);
  }
  const descriptions = clone(requirement_descriptions);
  if (!Array.isArray(descriptions) || !sameSet(descriptions.map(row => row.id), plan.requirement_ids)
      || descriptions.some(row => !text(row.text) || !Array.isArray(row.source_refs) || !row.source_refs.length || row.source_refs.some(ref => !text(ref)))) {
    fail('ADAPTIVE_PROFILE_REQUIREMENTS_INVALID');
  }
  return {plan, catalog, descriptions, implementations, selected: implementations.filter(task => selectedIds.includes(task.id)), unitsByTask};
}

/** Pure complete batch. Request bytes are not a model-token guarantee. */
export function buildAdaptiveProfileRequest({plan, catalog, requirement_descriptions, task_ids,
  phase = 'initial', round_index = 0, cli_version, allowed_profile_ids, failure = null,
  prior_usage = null, historical_aggregate = null, remaining_work = null, selected_action = null,
  limits = {max_request_bytes: 240000}, profilePolicy = 'bounded-v1'}) {
  const loaded = loadAdaptiveProfileContract({profilePolicy}), profiles = allowedProfiles(loaded, {cli_version, allowed_profile_ids});
  const providerLimitsOnly = profilePolicy === 'provider-limits-v2';
  const context = checkedContext({plan, catalog, requirement_descriptions, task_ids, phase, round_index});
  const selectedIds = context.selected.map(task => task.id), analysis = analyzeDag(context.plan);
  const action = clone(selected_action);
  if (action !== null && (phase !== 'repair' || !object(action) || !Array.isArray(action.task_ids)
      || unique(action.task_ids).length !== action.task_ids.length || action.task_ids.some(value => !context.implementations.some(task => task.id === value))
      || selectedIds.some(value => !action.task_ids.includes(value)) || !Array.isArray(action.artifact_ids)
      || !action.artifact_ids.length || unique(action.artifact_ids).length !== action.artifact_ids.length
      || action.artifact_ids.some(value => !context.plan.artifacts.some(artifact => artifact.id === value && action.task_ids.includes(artifact.producer_task_id)))
      || selectedIds.some(value => !context.plan.artifacts.some(artifact => artifact.producer_task_id === value && action.artifact_ids.includes(artifact.id))))) {
    fail('ADAPTIVE_PROFILE_REPAIR_ACTION_INVALID');
  }
  if (action?.read_artifact_ids !== undefined && (!Array.isArray(action.read_artifact_ids)
      || unique(action.read_artifact_ids).length !== action.read_artifact_ids.length
      || action.read_artifact_ids.some(value => !context.plan.artifacts.some(artifact => artifact.id === value)))) fail('ADAPTIVE_PROFILE_REPAIR_ACTION_INVALID');
  const usageTaskIds = unique([...selectedIds, ...(action?.task_ids ?? []),
    ...(action?.read_artifact_ids ?? []).map(value => context.plan.artifacts.find(artifact => artifact.id === value).producer_task_id)]);
  const projectedEvidence = projectAdaptiveProfileEvidence({failure, prior_usage, related_task_ids: usageTaskIds});
  const implementationIds = new Set(context.implementations.map(task => task.id));
  const dependencyIds = unique([...context.selected.flatMap(task => analysis.predecessors[task.id]),
    ...(action?.read_artifact_ids ?? []).map(value => context.plan.artifacts.find(artifact => artifact.id === value).producer_task_id)]);
  const visibleIds = unique([...selectedIds, ...dependencyIds]);
  const selectedArtifactIds = context.selected.flatMap(task => task.output_artifact_ids)
    .filter(value => action === null || action.artifact_ids.includes(value));
  const repairVisibleArtifactIds = unique([...selectedArtifactIds, ...(action?.read_artifact_ids ?? [])]);
  const units = context.catalog.units.filter(unit => action === null
    ? visibleIds.some(taskId => context.unitsByTask.get(taskId)?.includes(unit))
    : unit.artifact_ids.some(value => repairVisibleArtifactIds.includes(value)));
  // A unit can cover several artifacts: its full public requirement text remains
  // intact even when only one artifact is writable in this repair.
  const selectedUnits = units.filter(unit => unit.artifact_ids.some(value => selectedArtifactIds.includes(value)));
  const requirementIds = unique(selectedUnits.flatMap(unit => unit.requirement_ids));
  const artifactIds = unique(units.flatMap(unit => unit.artifact_ids));
  const artifacts = context.catalog.artifacts.filter(artifact => artifactIds.includes(artifact.id));
  const selectedArtifacts = artifacts.filter(artifact => selectedArtifactIds.includes(artifact.id));
  const directInputIds = unique(context.selected.flatMap(task => task.input_artifact_ids));
  const directInputs = action === null ? [] : context.catalog.artifacts.filter(artifact => directInputIds.includes(artifact.id)).map(artifact => {
    const owners = context.catalog.units.filter(unit => unit.artifact_ids.includes(artifact.id));
    return {artifact_id: artifact.id, paths: [...artifact.paths], role: 'declared_read_only_input',
      producer_task_id: context.plan.artifacts.find(row => row.id === artifact.id).producer_task_id,
      unit_ids: owners.map(unit => unit.id), unit_count: owners.length,
      requirement_count: unique(owners.flatMap(unit => unit.requirement_ids)).length,
      full_interface_inline: owners.every(unit => units.includes(unit))};
  });
  const evidenceIds = unique([...selectedUnits, ...selectedArtifacts].flatMap(row => row.evidence_ids));
  const evidence = context.catalog.evidence.filter(row => evidenceIds.includes(row.id));
  if (!sameSet(evidence.map(row => row.id), evidenceIds)
      || evidence.some(row => !text(row.quote))) fail('ADAPTIVE_PROFILE_CATALOG_BINDING');
  const workload = task => ({unit_count: context.unitsByTask.get(task.id).length,
    requirement_count: task.requirement_ids.length, output_artifact_count: task.output_artifact_ids.length,
    output_path_count: task.write_scope.length, input_artifact_count: task.input_artifact_ids.length,
    duration: clone(task.duration)});
  const descendants = start => {
    const found = new Set(), visit = current => {
      for (const next of analysis.successors[current]) if (implementationIds.has(next) && !found.has(next)) { found.add(next); visit(next); }
    };
    visit(start); return [...found];
  };
  const tasks = context.selected.map(task => ({question_id: `adaptive.profile.${context.implementations.indexOf(task) + 1}`, task_id: task.id,
    worker_id: task.worker_id, unit_ids: context.unitsByTask.get(task.id).map(unit => unit.id),
    requirement_ids: [...task.requirement_ids], output_artifact_ids: [...task.output_artifact_ids],
    input_artifact_ids: [...task.input_artifact_ids], write_scope: [...task.write_scope], workload: workload(task),
    selected_write_artifact_ids: action === null ? [...task.output_artifact_ids] : task.output_artifact_ids.filter(value => action.artifact_ids.includes(value)),
    selected_write_scope: action === null ? [...task.write_scope] : context.catalog.artifacts.filter(artifact => action.artifact_ids.includes(artifact.id)
      && task.output_artifact_ids.includes(artifact.id)).flatMap(artifact => artifact.paths),
    selected_unit_ids: selectedUnits.filter(unit => context.unitsByTask.get(task.id).includes(unit)).map(unit => unit.id),
    selected_requirement_ids: selectedUnits.filter(unit => context.unitsByTask.get(task.id).includes(unit)).flatMap(unit => unit.requirement_ids),
    direct_read_scope: [...task.read_scope],
    repair_context_read_artifact_ids: [...(action?.read_artifact_ids ?? [])],
    repair_context_read_scope: context.catalog.artifacts.filter(artifact => action?.read_artifact_ids?.includes(artifact.id)).flatMap(artifact => artifact.paths),
    workload_scope: action === null ? 'implementation leaf' : 'original leaf workload is context; selected_write_* fields define this repair, and context reads grant no write permission',
    dependency_role: {predecessor_task_ids: analysis.predecessors[task.id].filter(value => implementationIds.has(value)),
      direct_consumer_task_ids: analysis.successors[task.id].filter(value => implementationIds.has(value)),
      downstream_implementation_task_ids: descendants(task.id), basis: 'declared artifact DAG; not a measured critical path'},
    previous_profile_id: context.plan.workers.find(worker => worker.id === task.worker_id).profile_id}));
  const remainingTaskDetails = context.implementations.map(task => ({task_id: task.id, selected_for_this_batch: selectedIds.includes(task.id),
    workload: workload(task), predecessor_task_ids: analysis.predecessors[task.id].filter(value => implementationIds.has(value))}));
  const remaining = action === null ? {tasks: remainingTaskDetails} : {
    implementation_task_count: context.implementations.length, selected_for_profile_count: selectedIds.length,
    other_implementation_task_count: context.implementations.length - selectedIds.length,
    original_scope_totals: {unit_count: context.catalog.units.length, requirement_count: context.plan.requirement_ids.length,
      output_artifact_count: context.plan.artifacts.length,
      output_path_count: unique(context.implementations.flatMap(task => task.write_scope)).length},
    basis: 'Exact original scope totals; task completion is not inferred. Selected task DAG roles remain inline.'};
  const familyIds = unique(profiles.map(profile => profile.family_id));
  const models = clone(loaded.catalog.models.filter(model => familyIds.includes(model.id))), modelDefaults = {}, priceDefaults = {};
  for (const [fields, values, defaults] of [
    [['adapter', 'supported_efforts', 'documented_support', 'current_account_availability', 'measured_task_performance', 'billing_caveat'], models, modelDefaults],
    [['basis', 'currency', 'unit', 'source_id', 'actual_billed_usd', 'scope'], models.map(model => model.price), priceDefaults],
  ]) for (const key of fields) if (values.every(value => Object.hasOwn(value, key) && isDeepStrictEqual(value[key], values[0][key]))) {
    defaults[key] = clone(values[0][key]); for (const value of values) delete value[key];
  }
  const contextBinding = {source_sha256: context.catalog.source_sha256, catalog_sha256: jsonHash(context.catalog),
    plan_sha256: jsonHash(context.plan), contract_sources: loaded.source, evidence_context_ref: projectedEvidence.context_ref,
    selected_action_sha256: jsonHash(action)};
  const contextRef = {sha256: jsonHash(contextBinding), access: 'controller_only', retrieval_available_to_model: false};
  const inlineRequirements = clone(context.descriptions.filter(row => requirementIds.includes(row.id)));
  const requirementSourceRefs = {};
  if (action !== null) for (const row of inlineRequirements) {
    requirementSourceRefs[row.id] = row.source_refs; delete row.source_refs;
  }
  const inlineAction = clone(action);
  let actionEvidenceRefs = null;
  if (Array.isArray(inlineAction?.evidence_refs) && inlineAction.evidence_refs.every(text)) {
    actionEvidenceRefs = inlineAction.evidence_refs; delete inlineAction.evidence_refs;
  }
  const state = {schema_version: 'adaptive-profile-state/v1', phase, round_index,
    objective: loaded.contract.policy.objective, execution: {max_concurrency: context.plan.max_concurrency,
      worker_count: context.implementations.length, selected_worker_count: tasks.length,
      worker_invocation: 'one fresh bounded Claude CLI session per selected task'},
    profiles: profiles.map(({id, family_id, effort}) => ({id, family_id, effort})),
    models, model_defaults: modelDefaults, price_defaults: priceDefaults,
    model_resolution: 'A profile family_id names its exact models[].id. Apply model_defaults to every model and price_defaults to each model.price, with inline fields overriding defaults. This exactly preserves the documented candidate metadata and prices.',
    effort_notes: loaded.catalog.effort_notes,
    tasks, units, artifacts, requirements: inlineRequirements, evidence,
    direct_inputs: directInputs,
    scope_projection: 'Exact requirement text and source quotes are included for selected writable units; shared units retain all requirements without extra writes. Repair source locations and action proof refs are controller-only; failed observations stay inline. In repair, full interfaces remain for selected writes and explicit causal reads. Other direct inputs retain artifact/path/role/count only; complete interfaces stay in workers. Original leaf counts are context. The model cannot open controller references.',
    workload_basis: 'Public scope counts are not measured difficulty or duration. Unknown duration remains null.',
    remaining_work: {...remaining,
      runtime_evidence: clone(remaining_work), runtime_evidence_basis: remaining_work === null ? 'not supplied; no completion state inferred' : 'caller-supplied public runtime evidence'},
    observed_public_failure: projectedEvidence.failure, prior_usage: projectedEvidence.prior_usage,
    context_ref: contextRef, selected_action: inlineAction,
    historical_aggregate: {evidence: clone(historical_aggregate), caveat: 'Historical aggregates can differ in task, concurrency, cache, model and check version; they are not causal or matched-profile speed/quality evidence.'},
    verification_boundary: loaded.catalog.verification_boundary};
  const criteria = Object.fromEntries(profiles.map(profile => [profile.id, `${profile.model}; effort=${profile.effort}.`]));
  criteria.stop = loaded.contract.stop_choice.description;
  const questions = Object.fromEntries(tasks.map(task => {
    const values = {task_id: task.task_id, worker_id: task.worker_id, artifact_ids: task.selected_write_artifact_ids, write_scope: task.selected_write_scope};
    const target = loaded.contract.question.target_template.replace(/\{\{(task_id|worker_id|artifact_ids|write_scope)\}\}/g,
      (_, key) => JSON.stringify(values[key]));
    return [task.question_id, {type: 'choice', instructions: target + loaded.contract.question.instructions, criteria: {...criteria}}];
  }));
  const request = {model: 'jev-latest', state, questions}, bytes = Buffer.byteLength(JSON.stringify(request));
  if (!providerLimitsOnly && (!Number.isSafeInteger(limits.max_request_bytes) || limits.max_request_bytes < 1
      || limits.max_request_bytes > 256000)) fail('ADAPTIVE_PROFILE_LIMIT_INVALID');
  const maxWireBytes = providerLimitsOnly ? loaded.contract.policy.provider_max_wire_bytes
    : Math.min(limits.max_request_bytes, loaded.contract.policy.max_wire_bytes);
  if (bytes > maxWireBytes) fail('ADAPTIVE_PROFILE_REQUEST_LIMIT', {wire_bytes: bytes, max_request_bytes: maxWireBytes,
    constraint_kind: providerLimitsOnly ? 'provider_request_body_byte_limit' : 'engineering_wire_byte_limit', provider_acceptance_guaranteed: false});
  const prepared = prepareDecision(request), request_sha256 = hash(prepared.serialized);
  return {request: prepared.body, metadata: {schema_version: 'adaptive-profile-batch/v1',
    decision_id: `adaptive-profiles-${phase}-${round_index}-${request_sha256.slice(0, 12)}`, phase, round_index,
    plan_sha256: jsonHash(context.plan), catalog_sha256: jsonHash(context.catalog), request_sha256, wire_bytes: bytes,
    token_guarantee: false, question_tasks: tasks.map(({question_id, task_id, worker_id}) => ({question_id, task_id, worker_id})),
    allowed_profile_ids: profiles.map(profile => profile.id), cli_version, source: loaded.source,
    ...(providerLimitsOnly ? {profile_policy: profilePolicy, local_wire_byte_limit: null,
      local_token_estimates: 'observation_only', provider_max_wire_bytes: maxWireBytes,
      ignored_local_max_request_bytes: limits?.max_request_bytes ?? null} : {}),
    projection_report: {evidence: projectedEvidence.report, included_requirement_ids: requirementIds, included_evidence_ids: evidenceIds,
      included_interface_unit_ids: units.map(unit => unit.id),
      omitted_direct_input_interface_unit_ids: action === null ? [] : context.catalog.units.filter(unit =>
        unit.artifact_ids.some(value => directInputIds.includes(value)) && !units.includes(unit)).map(unit => unit.id),
      remaining_work_projection: action === null ? null : {original_details_sha256: jsonHash(remainingTaskDetails),
        exact_original_scope_totals: remaining.original_scope_totals, worker_execution_context_changed: false},
      model_defaults_are_exact_duplicates: true,
      controller_context_binding: contextBinding, context_ref: contextRef,
      controller_requirement_source_refs: requirementSourceRefs, controller_action_evidence_refs: actionEvidenceRefs,
      omitted_requirement_ids: context.descriptions.filter(row => !requirementIds.includes(row.id)).map(row => row.id),
      omitted_evidence_ids: context.catalog.evidence.filter(row => !evidenceIds.includes(row.id)).map(row => row.id),
      omitted_metadata_basis: 'Model/effort selection only: selected-unit requirements and write/explicit causal-read interfaces remain exact. Other direct-input implementation details and remaining-task workload vectors are controller-bound summaries; worker execution input is unchanged.',
      original_requirements_sha256: jsonHash(context.descriptions), original_evidence_sha256: jsonHash(context.catalog.evidence),
      controller_only_refs: true}},
    profiles: Object.fromEntries(profiles.map(profile => [profile.id, profile]))};
}

/** Deterministic small batches; all requests are prepared before the first callback. */
export function buildAdaptiveProfileRequests(input) {
  const loaded = loadAdaptiveProfileContract({profilePolicy: input.profilePolicy}), phase = input.phase ?? 'initial', round_index = input.round_index ?? 0;
  const context = checkedContext({...input, phase, round_index}), ids = context.selected.map(task => task.id);
  const batches = [];
  const batchSize = phase === 'repair' ? loaded.contract.policy.repair_batch_size : loaded.contract.policy.batch_size;
  for (let start = 0; start < ids.length; start += batchSize) {
    const selected = ids.slice(start, start + batchSize);
    try { batches.push(buildAdaptiveProfileRequest({...input, phase, round_index, task_ids: selected})); }
    catch (error) {
      if (phase !== 'initial' || selected.length !== 2 || error.code !== 'ADAPTIVE_PROFILE_REQUEST_LIMIT') throw error;
      // Pure local partition before any provider callback; no retry or altered evidence.
      for (const taskId of selected) batches.push(buildAdaptiveProfileRequest({...input, phase, round_index, task_ids: [taskId]}));
    }
  }
  const first = batches[0].metadata;
  if (batches.some(batch => !isDeepStrictEqual(batch.metadata.source, first.source))) fail('ADAPTIVE_PROFILE_SOURCE_CHANGED');
  const selection_id = `adaptive-profiles-${phase}-${round_index}-${jsonHash(batches.map(batch => batch.metadata.request_sha256)).slice(0, 12)}`;
  return {batches, metadata: {schema_version: 'adaptive-profile-selection/v1', selection_id, phase, round_index,
    plan_sha256: first.plan_sha256, catalog_sha256: first.catalog_sha256, allowed_profile_ids: first.allowed_profile_ids,
    cli_version: first.cli_version, source: first.source, token_guarantee: false,
    ...(input.profilePolicy === 'provider-limits-v2' ? {profile_policy: input.profilePolicy, local_wire_byte_limit: null,
      local_token_estimates: 'observation_only', provider_max_wire_bytes: loaded.contract.policy.provider_max_wire_bytes} : {}),
    question_tasks: batches.flatMap(batch => batch.metadata.question_tasks.map(task => ({...task, decision_id: batch.metadata.decision_id}))),
    batches: batches.map(batch => clone(batch.metadata))}};
}

function answerChoices(response, request) {
  if (adaptiveOutcomeUncertain(response)) fail('ADAPTIVE_PROFILE_DECISION_UNCERTAIN', {outcome_uncertain: true});
  if (response?.ok === false || response?.error != null || (response?.status !== undefined
      && !['completed', 'succeeded', 'success'].includes(response.status))) fail('ADAPTIVE_PROFILE_DECISION_FAILED');
  if (!object(response?.answers) || !sameSet(Object.keys(response.answers), Object.keys(request.questions))) fail('ADAPTIVE_PROFILE_ANSWER_COVERAGE');
  const selections = {};
  for (const [questionId, question] of Object.entries(request.questions)) {
    const answer = response.answers[questionId];
    if (!object(answer) || answer.type !== 'choice' || typeof answer.choice !== 'string' || !Object.hasOwn(question.criteria, answer.choice)
        || Object.keys(answer).some(key => !['type', 'choice', 'confidence', 'probabilities'].includes(key))
        || (answer.confidence !== undefined && (!Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1))
        || (answer.probabilities !== undefined && (!object(answer.probabilities)
          || !sameSet(Object.keys(answer.probabilities), Object.keys(question.criteria))
          || Object.values(answer.probabilities).some(value => !Number.isFinite(value) || value < 0 || value > 1)))) fail('ADAPTIVE_PROFILE_ANSWER_INVALID');
    selections[questionId] = answer.choice;
  }
  if (Object.values(selections).includes('stop')) fail('ADAPTIVE_PROFILE_SELECTION_STOPPED');
  return selections;
}

/** One attempt, complete-answer validation, then durable controller commit. */
export async function selectAdaptiveProfiles({decide, record = async () => {}, commit, admitBatch, ...input}) {
  const built = buildAdaptiveProfileRequests(input), {metadata} = built;
  if (typeof decide !== 'function') fail('ADAPTIVE_PROFILE_DECIDER_REQUIRED');
  if (admitBatch !== undefined && typeof admitBatch !== 'function') fail('ADAPTIVE_PROFILE_ADMISSION_INVALID');
  const stats = {provider_calls: 0, provider_questions: 0, local_questions: 0};
  const decisions = [], admissions = [], selections = [], selectedProfiles = {};
  let submitted = false, received = false;
  try {
    for (const batch of built.batches) {
      if (admitBatch) {
        const admission = clone(await admitBatch(clone(batch.request), {stage: 'profiles', ...batch.metadata}));
        admissions.push({decision_id: batch.metadata.decision_id, admission});
        if (admission?.inference_allowed !== true) fail('ADAPTIVE_PROFILE_ADMISSION_BLOCKED');
      }
    }
    for (const batch of built.batches) {
      const batchMetadata = batch.metadata;
      await record({event: 'adaptive_profile_decision_requested', stage: 'profiles', ...batchMetadata,
        selection_id: metadata.selection_id, request: clone(batch.request)});
      stats.provider_calls++; stats.provider_questions += batchMetadata.question_tasks.length; submitted = true; received = false;
      const response = await decide(clone(batch.request), {stage: 'profiles', decision_id: batchMetadata.decision_id,
        phase: metadata.phase, round_index: metadata.round_index, selection_id: metadata.selection_id});
      received = true;
      const answers = clone(response), choices = answerChoices(answers, batch.request);
      decisions.push({decision_id: batchMetadata.decision_id, stage: 'profiles', choices, response: answers});
      for (const {question_id, task_id, worker_id} of batchMetadata.question_tasks) {
        const profile = batch.profiles[choices[question_id]];
        selections.push({task_id, worker_id, profile_id: profile.id, model: profile.model, effort: profile.effort,
          decision_id: batchMetadata.decision_id, choice_id: choices[question_id], question_id,
          phase: metadata.phase, round_index: metadata.round_index, price: clone(profile.price), provenance: clone(profile.provenance)});
        selectedProfiles[profile.id] = clone(profile);
      }
      await record({event: 'adaptive_profile_decision_completed', stage: 'profiles', decision_id: batchMetadata.decision_id,
        phase: metadata.phase, round_index: metadata.round_index, question_count: batchMetadata.question_tasks.length, choices});
    }
    const result = {status: 'selected', dispatch_allowed: false, ...metadata, selections, profiles: selectedProfiles,
      decisions, admissions, stats};
    for (const selection of selections) await record({event: 'adaptive_profile_selected', stage: 'profiles',
      phase: metadata.phase, round_index: metadata.round_index, selection: clone(selection)});
    if (commit !== undefined) {
      if (typeof commit !== 'function') fail('ADAPTIVE_PROFILE_COMMIT_INVALID');
      await commit(clone(result)); result.dispatch_allowed = true;
    }
    return result;
  } catch (error) {
    const outcome_uncertain = adaptiveOutcomeUncertain(error, {fallback: submitted && !received});
    const terminal_cause = {...adaptiveTerminalCause(error, {outcome_uncertain}), stage: 'profiles'};
    await record({event: 'adaptive_profile_selection_stopped', ...metadata, stage: 'profiles', terminal_cause});
    return {status: outcome_uncertain ? 'uncertain' : 'stopped', dispatch_allowed: false, ...metadata,
      reason: terminal_cause.code, outcome_uncertain, terminal_cause, selections: [], profiles: {}, decisions, admissions, stats};
  }
}

/** Preserve the DAG schema and task semantics; bind profile changes separately. */
export function applyAdaptiveProfileSelections({plan: rawPlan, selection, profilePolicy = 'bounded-v1'}) {
  const plan = validateDagPlan(rawPlan), result = clone(selection);
  if (result.status !== 'selected' || result.plan_sha256 !== jsonHash(plan) || !Array.isArray(result.selections)
      || !result.selections.length || !Array.isArray(result.question_tasks) || !object(result.profiles)
      || !Array.isArray(result.decisions) || !result.decisions.length
      || !sameSet(result.decisions.map(row => row.decision_id), unique(result.question_tasks.map(row => row.decision_id)))
      || !sameSet(Object.keys(result.profiles), unique(result.selections.map(row => row.profile_id)))
      || !sameSet(result.selections.map(row => row.task_id), result.question_tasks.map(row => row.task_id))) fail('ADAPTIVE_PROFILE_SELECTION_BINDING');
  const loaded = loadAdaptiveProfileContract({profilePolicy});
  if (!isDeepStrictEqual(result.source, loaded.source)) fail('ADAPTIVE_PROFILE_SOURCE_CHANGED');
  const allowed = allowedProfiles(loaded, {cli_version: result.cli_version, allowed_profile_ids: result.allowed_profile_ids});
  const byId = new Map(allowed.map(profile => [profile.id, profile]));
  for (const decision of result.decisions) {
    const questionIds = result.question_tasks.filter(row => row.decision_id === decision.decision_id).map(row => row.question_id);
    if (decision.stage !== 'profiles' || !object(decision.choices) || !object(decision.response?.answers)
        || !sameSet(Object.keys(decision.choices), questionIds) || !sameSet(Object.keys(decision.response.answers), questionIds)) fail('ADAPTIVE_PROFILE_SELECTION_BINDING');
    const criteria = Object.fromEntries([...byId.keys(), 'stop'].map(key => [key, null]));
    const checked = answerChoices(decision.response, {questions: Object.fromEntries(questionIds.map(key => [key, {criteria}]))});
    if (!isDeepStrictEqual(checked, decision.choices)) fail('ADAPTIVE_PROFILE_SELECTION_BINDING');
  }
  const touchedWorkers = new Set();
  for (const selected of result.selections) {
    const task = plan.tasks.find(task => task.id === selected.task_id && task.kind === 'implementation');
    const mapping = result.question_tasks.find(row => row.task_id === selected.task_id), profile = byId.get(selected.profile_id);
    const decision = result.decisions.find(row => row.decision_id === selected.decision_id);
    if (!task || task.worker_id !== selected.worker_id || mapping.worker_id !== selected.worker_id
        || mapping.question_id !== selected.question_id || touchedWorkers.has(selected.worker_id)
        || !profile || selected.model !== profile.model || selected.effort !== profile.effort
        || selected.choice_id !== profile.id || selected.decision_id !== mapping.decision_id || !decision
        || selected.phase !== result.phase || selected.round_index !== result.round_index
        || decision.choices[selected.question_id] !== selected.choice_id
        || decision.response.answers[selected.question_id]?.type !== 'choice'
        || decision.response.answers[selected.question_id]?.choice !== selected.choice_id
        || !isDeepStrictEqual(selected.price, profile.price) || !isDeepStrictEqual(selected.provenance, profile.provenance)
        || !isDeepStrictEqual(result.profiles[selected.profile_id], profile)) fail('ADAPTIVE_PROFILE_SELECTION_BINDING');
    touchedWorkers.add(selected.worker_id);
    plan.workers.find(worker => worker.id === selected.worker_id).profile_id = profile.id;
  }
  validateDagPlan(plan);
  return {plan, profiles: clone(result.profiles), selections: clone(result.selections),
    profile_revision: `profiles-${jsonHash({source_plan_sha256: result.plan_sha256, selections: result.selections})}`,
    source_plan_sha256: result.plan_sha256, applied_plan_sha256: jsonHash(plan), dispatch_allowed: result.dispatch_allowed === true};
}
