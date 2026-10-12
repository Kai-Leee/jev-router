#!/usr/bin/env node
// Offline only: reuse the actual adapter and explicitly selected admission; never load credentials or call a client.
import {readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, dirname, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareDecision} from '../src/client.mjs';
import {BASE_URL, DECISION_URL, DEFAULT_MODEL, MODELS_URL} from '../src/config.mjs';
import {assessJevTokenAdmission as assessV3, jevTokenAdmissionPolicy as policyV3} from '../src/orchestration/jev-token-admission-v3.mjs';
import {assessJevTokenAdmission as assessV4, jevTokenAdmissionPolicy as policyV4} from '../src/orchestration/jev-token-admission-v4.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const POLICIES = {v3: {assess: assessV3, metadata: policyV3()}, v4: {assess: assessV4, metadata: policyV4()}};
const selectPolicy = version => {
  if (!Object.hasOwn(POLICIES, version)) throw new Error('UNSUPPORTED_ADMISSION_POLICY');
  return POLICIES[version];
};
const MAX_OFFICIAL_BODY_BYTES = 256000;
const SOURCE_PATHS = [
  'scripts/validate-jev-input.mjs', 'src/config.mjs', 'src/client.mjs',
  'src/orchestration/jev-token-admission.mjs', 'src/orchestration/jev-token-admission-v2.mjs',
  'src/orchestration/jev-token-admission-v3.mjs',
  'src/orchestration/jev-token-admission-v4.mjs',
  'docs/orchestration/contracts/jev-token-admission.v1.json',
  'docs/orchestration/contracts/jev-token-admission.v2.json',
  'docs/orchestration/contracts/jev-token-admission.v3.json',
  'docs/orchestration/contracts/jev-token-admission.v4.json',
];

export function validateJevInput(request, {policy = 'v3', ...options} = {}) {
  const selected = selectPolicy(policy);
  let serialized = null, adapterError = null;
  // Measure canonical wire JSON, not the pretty-printed file size. No request text is emitted.
  if (object(request)) {
    try { serialized = JSON.stringify({model: DEFAULT_MODEL, ...request}); } catch { /* Adapter reports invalid JSON. */ }
  }
  try { prepareDecision(request); }
  catch (error) { adapterError = {code: 'INVALID_REQUEST', message: error.code === 'INVALID_REQUEST' ? error.message : 'Request validation failed.'}; }
  const admission = selected.assess(request, options);
  const wireBytes = serialized === null ? null : Buffer.byteLength(serialized, 'utf8');
  return {
    policy_version: policy,
    adapter_validation: {passed: adapterError === null, error: adapterError,
      scope: 'Current model/state/questions adapter subset; not every optional official API feature.'},
    official_body_limit: {source: 'https://jev-ai.pro/docs', max_utf8_bytes: MAX_OFFICIAL_BODY_BYTES,
      wire_bytes: wireBytes, passed: wireBytes === null ? null : wireBytes <= MAX_OFFICIAL_BODY_BYTES},
    canonical_request_sha256: serialized === null ? null : sha(serialized),
    admission,
    input_ready_under_current_policy: adapterError === null && admission.inference_allowed,
    exact_context_fit: 'unknown',
    semantic_sufficiency: 'not_checked',
  };
}

const help = `Usage (offline; never sends an API request):
  node scripts/validate-jev-input.mjs --request REQUEST.json --stage STAGE [--policy v3|v4] [--out NEW.json]
  node scripts/validate-jev-input.mjs --run RUN_DIRECTORY [--run ANOTHER_DIRECTORY] [--policy v3|v4] [--out NEW.json]

Default policy is v3. Both policies accept split|relations|repair|profiles; v4 also accepts repair_owners.
Single request stage must come from the controller. Run mode separately replays the recorded
supported policy and assesses the selected policy; a new-policy reassessment is not a historical POST.
It binds saved request/policy hashes and audits recorded POST destinations. Output contains
sizes, hashes and fixed validation messages, not state, instructions, answers or keys.
Exit: 0 all inputs admitted by selected policy; 2 rejected input/admission; 1 invalid CLI or incomplete audit.
No --spend, network, tokenizer download, ledger change, retry, or existing-file overwrite.
`;

function parseArgs(args) {
  const parsed = {runs: []};
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return {help: true};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i], value = args[++i];
    if (!['--request', '--stage', '--run', '--out', '--policy'].includes(flag) || !value || value.startsWith('--')) throw new Error('INVALID_ARGUMENTS');
    if (flag === '--run') parsed.runs.push(resolve(value));
    else {
      const key = flag.slice(2);
      if (parsed[key] !== undefined) throw new Error('DUPLICATE_ARGUMENT');
      parsed[key] = ['stage', 'policy'].includes(key) ? value : resolve(value);
    }
  }
  parsed.policy ??= 'v3';
  const policy = selectPolicy(parsed.policy).metadata;
  if (parsed.request ? parsed.runs.length || !policy.stages.includes(parsed.stage) : !parsed.runs.length || parsed.stage) throw new Error('REQUEST_STAGE_OR_RUN_REQUIRED');
  if (new Set(parsed.runs).size !== parsed.runs.length) throw new Error('DUPLICATE_RUN');
  if (parsed.out && (existsSync(parsed.out) || parsed.out === parsed.request
      || parsed.runs.some(run => {const path = relative(run, parsed.out); return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !path.startsWith(sep));}))) {
    throw new Error('OUTPUT_MUST_BE_NEW_AND_OUTSIDE_AUDITED_RUNS');
  }
  return parsed;
}

export function auditJevInputs({request, stage, runs = [], policy = 'v3'}) {
  const selectedPolicy = selectPolicy(policy).metadata;
  const inputs = new Map(), rows = [], issues = [];
  const pin = path => {
    const absolute = resolve(path), bytes = readFileSync(absolute), hash = sha(bytes);
    if (inputs.has(absolute) && inputs.get(absolute) !== hash) throw new Error('INPUT_CHANGED_DURING_READ');
    inputs.set(absolute, hash);
    return bytes;
  };
  const json = path => JSON.parse(pin(path));
  const sources = SOURCE_PATHS.map(path => ({path, sha256: sha(pin(resolve(ROOT, path)))}));
  if (request) {
    rows.push({request_path: resolve(request), stage_source: 'explicit_controller_argument',
      validation: validateJevInput(json(request), {stage, policy}), evidence_issues: []});
  }
  for (const run of runs) {
    const callDir = resolve(run, 'calls'), receiptDir = resolve(run, 'receipts');
    const ids = readdirSync(callDir).filter(name => /^jev-\d+\.request\.json$/.test(name)).sort().map(name => name.replace('.request.json', ''));
    const receiptIds = readdirSync(receiptDir).filter(name => /^jev-\d+\.json$/.test(name)).sort().map(name => name.replace('.json', ''));
    if (!ids.length) issues.push({run, code: 'NO_JEV_REQUESTS'});
    if (JSON.stringify(ids) !== JSON.stringify(receiptIds)) issues.push({run, code: 'REQUEST_RECEIPT_COVERAGE_MISMATCH'});
    for (const id of ids) {
      const path = resolve(callDir, `${id}.request.json`), evidenceIssues = [];
      const receipt = json(resolve(receiptDir, `${id}.json`));
      const saved = json(resolve(callDir, `${id}.token-admission.json`));
      const body = json(path);
      const recordedVersion = Object.keys(POLICIES).find(version =>
        saved.schema_version === `jev-token-admission-result/${version}`
        && saved.policy_source?.path === POLICIES[version].metadata.source.path);
      const recordedPolicy = recordedVersion ? selectPolicy(recordedVersion).metadata : null;
      const replay = recordedVersion ? validateJevInput(body, {policy: recordedVersion, stage: receipt.stage,
        // Admission observes the previous response, not this not-yet-issued call.
        observedModel: saved.observed_model ?? null,
        expectedRequestSha256: saved.request_sha256 ?? 'missing',
        expectedPolicySha256: saved.policy_source?.sha256 ?? 'missing'}) : null;
      const validation = recordedVersion === policy ? replay : validateJevInput(body, {policy, stage: receipt.stage,
        observedModel: saved.observed_model ?? null, expectedRequestSha256: saved.request_sha256 ?? 'missing',
        expectedPolicySha256: selectedPolicy.source.sha256});
      if (!recordedVersion) evidenceIssues.push('SAVED_POLICY_UNSUPPORTED');
      if (receipt.id !== id || receipt.provider !== 'jev') evidenceIssues.push('RECEIPT_IDENTITY_MISMATCH');
      if (!recordedPolicy?.stages.includes(receipt.stage) || saved.stage !== receipt.stage) evidenceIssues.push('STAGE_BINDING_MISMATCH');
      if (receipt.inference_started && !recordedPolicy?.accepted_observed_model_labels.includes(receipt.model)) evidenceIssues.push('RESPONSE_MODEL_UNVERIFIED');
      const replayMatches = replay !== null && ['schema_version', 'policy_source', 'request_sha256', 'observed_model', 'measurements', 'estimates',
        'admission', 'inference_allowed', 'reason_codes', 'limits', 'operating_limit', 'warning_codes', 'warnings', 'local_caps']
        .every(field => JSON.stringify(saved[field]) === JSON.stringify(replay.admission[field]));
      if (!replayMatches) evidenceIssues.push('SAVED_ADMISSION_REPLAY_MISMATCH');
      const responsePath = resolve(callDir, `${id}.response.json`);
      let post = null;
      if (existsSync(responsePath)) {
        const response = json(responsePath), recorded = response.receipt;
        post = recorded ? {method: recorded.method, destination: recorded.destination, status: recorded.status, automatic_retries: recorded.automaticRetries} : null;
        if (receipt.inference_started !== true || recorded?.method !== 'POST' || recorded?.destination !== DECISION_URL
            || recorded?.status !== 200 || recorded?.automaticRetries !== 0 || response.model !== receipt.model) evidenceIssues.push('HISTORICAL_POST_EVIDENCE_MISMATCH');
      } else if (!(receipt.inference_started === false && receipt.code === 'ADAPTIVE_TOKEN_PREFLIGHT_BLOCKED'
          && receipt.outcome_uncertain === false && receipt.usage === null && saved.inference_allowed === false)) {
        evidenceIssues.push('MISSING_POST_OR_LOCAL_REFUSAL_EVIDENCE');
      }
      if (typeof receipt.inference_started !== 'boolean') evidenceIssues.push('UNKNOWN_INVOCATION_STATE');
      rows.push({run: resolve(run), id, request_path: path, stage_source: 'recorded_controller_receipt', validation,
        historical: {status: receipt.status, code: receipt.code ?? null, inference_started: receipt.inference_started,
          preflight_observed_model: saved.observed_model ?? null, response_model: receipt.model ?? null,
          recorded_policy_version: recordedVersion ?? null, recorded_policy_source: saved.policy_source ?? null,
          selected_policy_version: policy, reassessed_under_different_policy: recordedVersion !== policy,
          post, admission_replay_matches: replayMatches}, evidence_issues: evidenceIssues});
    }
  }
  const preserved = [...inputs].map(([path, before_sha256]) => {
    const after_sha256 = sha(readFileSync(path));
    return {path, before_sha256, after_sha256, unchanged: before_sha256 === after_sha256};
  });
  if (preserved.some(input => !input.unchanged)) issues.push({code: 'INPUT_CHANGED_DURING_AUDIT'});
  for (const row of rows) for (const code of row.evidence_issues) issues.push({run: row.run, id: row.id, code});
  const count = predicate => rows.filter(predicate).length;
  const summary = {
    requests: rows.length,
    adapter_valid: count(row => row.validation.adapter_validation.passed),
    official_body_limit_passed: count(row => row.validation.official_body_limit.passed === true),
    admitted_estimates: count(row => row.validation.input_ready_under_current_policy && row.validation.admission.admission === 'admit_estimated'),
    admitted_observations: count(row => row.validation.input_ready_under_current_policy && row.validation.admission.admission === 'admit_observed'),
    admitted_under_selected_policy: count(row => row.validation.input_ready_under_current_policy),
    requests_with_warnings: count(row => row.validation.admission.warning_codes?.length > 0),
    blocked: count(row => !row.validation.input_ready_under_current_policy),
    historical_post_200: count(row => row.historical?.post?.status === 200 && !row.evidence_issues.length),
    historical_local_refusals: count(row => row.historical?.inference_started === false && !row.evidence_issues.length),
    evidence_issues: issues.length, input_files: preserved.length, changed_input_files: preserved.filter(input => !input.unchanged).length,
  };
  return {
    schema_version: 'jev-input-validation/v1', checked_at: new Date().toISOString(),
    mode: 'offline', performed_calls: {GET: 0, POST: 0}, automatic_retries: 0,
    connection: {base_url: BASE_URL, decision_url: DECISION_URL, models_url: MODELS_URL, default_model: DEFAULT_MODEL,
      key_loaded: false, live_authentication_checked: false},
    official_references: ['https://jev-ai.pro/docs', 'https://jev-ai.pro/model/jev-1.13'],
    limits_reviewed_on: '2026-10-12', policy: {version: policy, id: selectedPolicy.policy_id, source: selectedPolicy.source},
    limitations: ['Token counts are local estimates; exact tokenizer and provider framing are unknown.',
      'Admission is not a guarantee of provider acceptance or sufficient decision evidence.',
      'Historical POST receipts are prior observations, not new requests.',
      'Historical admissions are replayed under their saved policy; selected-policy reassessment never changes prior acceptance or refusal.',
      'Does not certify the truth or completeness of state, task requirements, ownership or model choices.'],
    summary, audit_complete: issues.length === 0, all_inputs_ready_under_current_policy: issues.length === 0 && summary.blocked === 0,
    issues, sources, requests: rows, input_integrity: preserved,
  };
}

export function runCLI(args) {
  const options = parseArgs(args);
  if (options.help) { process.stdout.write(help); return 0; }
  const report = auditJevInputs(options), serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) {
    mkdirSync(dirname(options.out), {recursive: true});
    writeFileSync(options.out, serialized, {flag: 'wx', mode: 0o600});
    process.stdout.write(`${JSON.stringify({report: options.out, ...report.summary, audit_complete: report.audit_complete})}\n`);
  } else process.stdout.write(serialized);
  return !report.audit_complete ? 1 : report.all_inputs_ready_under_current_policy ? 0 : 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = runCLI(process.argv.slice(2)); }
  catch {
    // JSON/OS exceptions may echo input contents or paths; do not reflect them.
    process.stderr.write(`${JSON.stringify({error: 'INPUT_AUDIT_FAILED', message: 'Check arguments, required input/receipt/admission files and a new output path. Use --help.', performed_calls: {GET: 0, POST: 0}})}\n`);
    process.exitCode = 1;
  }
}
