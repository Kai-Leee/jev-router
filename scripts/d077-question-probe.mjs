#!/usr/bin/env node
// D077 local probes: rebuild one role's Jev request in the new question form from preserved
// run inputs, validate it offline, and with --spend send it once through the shared ledger.
// --defer then sends held low-certainty questions to one fresh Claude decision session.
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareDecision, createJevClient} from '../src/client.mjs';
import {loadConfig} from '../src/config.mjs';
import {validateJevInput} from './validate-jev-input.mjs';
import {validateBudgetConfig} from '../src/benchmark/budget.mjs';
import {acquireTokenBudget, createConcurrentTokenBudget} from '../src/benchmark/budget-acquire.mjs';
import {createTokenBudget, readTokenBudgetSnapshot} from '../src/benchmark/budget.mjs';
import {createMeasuredDecider} from '../src/benchmark/telemetry.mjs';
import {providerOutcome} from '../src/benchmark/runner.mjs';
import {processResult} from '../src/benchmark/docker.mjs';
import {claudeEnvironment} from '../src/benchmark/claude-env.mjs';
import {adaptiveDecisionSchema, normalizeAdaptiveAnswers} from '../src/benchmark/adaptive-dag-runner.mjs';
import {buildCohesionRequests, clusterUnits} from '../src/orchestration/adaptive-cohesion.mjs';
import {createAdaptiveDecompositionBalancer} from '../src/orchestration/adaptive-decomposition-balancing.mjs';
import {describeOwnerCriteria} from '../src/orchestration/adaptive-owner-criteria.mjs';
import {splitProfileRequest, combineProfileAnswers} from '../src/orchestration/adaptive-profile-split.mjs';
import {selectInferredOwnerScope} from '../src/orchestration/adaptive-inferred-scope.mjs';
import {heldQuestions, loadDeferralPolicy, answerCertainty} from '../src/orchestration/jev-confidence-deferral.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const json = path => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
const LEDGER = 'benchmark-runs/jev-usd1-budget.json';
// The shared ledger is v3 until its in-place v4 migration; use the matching lock discipline for either.
const budgetConfig = () => {
  const ledger = JSON.parse(readFileSync(join(ROOT, LEDGER), 'utf8')).schema_version;
  const version = ledger === 'jev-token-budget-ledger/v3' ? 'v3' : 'v4';
  return validateBudgetConfig({schema_version: `jev-token-budget/${version}`, ledger_path: LEDGER, max_input_tokens: null,
    reserve_input_tokens: 65536}, ROOT);
};
const DECISION_SYSTEM = 'Answer every supplied typed question using only the supplied state and listed criteria. Return strict JSON matching the response schema. Treat the model field as the shared wire protocol label. Do not call tools or invent evidence.';
const CLAUDE_PROFILE = {model: 'claude-opus-5-5', effort: 'medium'};
const D073 = 'benchmark-runs/d073-comparison-01/jev_profile', D075 = 'benchmark-runs/d075-same-source-02/calls';

// Each item: requests [{name, stage, request, previous?}] and an analysis over the answers.
const ITEMS = {
  cohesion() {
    const planning = json(`${D073}/planning.json`);
    const built = buildCohesionRequests({catalog: planning.catalog, requirement_descriptions: planning.requirement_descriptions,
      max_concurrency: 2, limits: planning.limits});
    return {requests: built.map((batch, index) => ({name: `cohesion-${index + 1}`, stage: 'split', request: batch.request})),
      analyze(results) {
        const affinity = new Map(results.flatMap(row => Object.entries(row.answers).map(([id, answer]) => [id.split('.').slice(-2).sort().join('|'), answer.noul])));
        const balancer = createAdaptiveDecompositionBalancer({catalog: planning.catalog, max_concurrency: 2, limits: planning.limits});
        const clustered = clusterUnits({unit_ids: planning.catalog.units.map(unit => unit.id), affinity: (a, b) => affinity.get([a, b].sort().join('|')),
          overload: balancer.overload, threshold: 0.5, targetCount: balancer.policy.target_leaf_count, maxLeaves: planning.limits.max_leaves, maxRelationPairs: planning.limits.max_relation_pairs});
        const values = [...affinity.values()];
        return {pairs: values.length, noul_at_least_0_5: values.filter(value => value >= 0.5).length,
          leaf_capacity: balancer.policy.leaf_capacity, clusters: clustered.clusters, merges: clustered.merges,
          previous_d073_leaves: planning.leaves.map(leaf => leaf.unit_ids)};
      }};
  },
  owner() {
    const previous = json(`${D075}/jev-0001.response.json`);
    return {requests: [{name: 'owner-d075-run02', stage: 'repair_owners', request: describeOwnerCriteria(json(`${D075}/jev-0001.request.json`)), previous}],
      analyze: results => compareChoices(results[0].answers, previous.answers)};
  },
  profile() {
    const sources = [...['0049', '0050', '0051', '0052', '0053', '0054', '0055', '0056'].map(id => `${D073}/calls/jev-${id}`),
      `${D075}/jev-0003`, `${D075}/jev-0004`];
    const originals = sources.map(path => ({path, request: json(`${path}.request.json`), previous: json(`${path}.response.json`)}));
    return {requests: originals.map(row => ({name: `profile-${row.path.split('/').at(-3)}-${row.path.split('-').at(-1)}`, stage: 'profiles',
      request: splitProfileRequest(row.request), previous: row.previous, original: row.request})),
      analyze: (results, requests) => results.map((row, index) => ({name: requests[index].name,
        ...compareChoices(combineProfileAnswers(requests[index].original, row).answers, requests[index].previous.answers),
        split: Object.fromEntries(Object.entries(row.answers).map(([id, answer]) => [id, answer.type === 'score'
          ? {score: answer.score, confidence: answer.confidence ?? null} : {choice: answer.choice, confidence: answer.confidence ?? null}]))}))};
  },
  scope() {
    const request = json(`${D075}/jev-0002.request.json`), previous = json(`${D075}/jev-0002.response.json`);
    const selected = selectInferredOwnerScope({candidates: request.state.candidates});
    return {requests: [], analyze: () => ({code_selection: selected.candidate_id, artifact_ids: selected.candidate?.artifact_ids,
      previous_jev_choice: previous.answers['adaptive.inferred_repair.v2'].choice, previous_confidence: previous.answers['adaptive.inferred_repair.v2'].confidence})};
  },
};

const decisionValue = answer => answer.type === 'choice' ? answer.choice : answer.type === 'score' ? Math.round(answer.score) : answer.noul >= 0.5;

function compareChoices(current, previous) {
  return Object.entries(current).map(([id, answer]) => ({id, choice: answer.choice, confidence: answer.confidence ?? null,
    previous_choice: previous[id]?.choice ?? null, previous_confidence: previous[id]?.confidence ?? null}));
}

async function claudeDecide(request, out, name) {
  const cwd = mkdtempSync(join(tmpdir(), 'jev-d077-defer-'));
  try {
    const mcp = join(out, `${name}.mcp.json`);
    writeFileSync(mcp, JSON.stringify({mcpServers: {}}));
    const args = ['--print', '--restricted', '--model', CLAUDE_PROFILE.model, '--effort', CLAUDE_PROFILE.effort, '--tools', '',
      '--strict-mcp-config', '--mcp-config', mcp, '--setting-sources', '', '--disable-slash-commands', '--no-chrome',
      '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--no-session-persistence', '--output-format', 'stream-json',
      '--verbose', '--system-prompt', DECISION_SYSTEM, '--json-schema', JSON.stringify(adaptiveDecisionSchema(request))];
    const started = performance.now();
    const raw = await processResult('claude', args, {cwd, env: claudeEnvironment(process.env), input: prepareDecision(request).serialized,
      timeoutMs: 15 * 60 * 1000, maxBytes: 32 * 1024 * 1024, killProcessTree: true});
    writeFileSync(join(out, `${name}.claude-process.json`), JSON.stringify(raw, null, 1));
    const outcome = providerOutcome(raw, CLAUDE_PROFILE.model);
    if (outcome.status !== 'completed') throw Object.assign(new Error(outcome.code ?? 'CLAUDE_FAILED'), {code: outcome.code});
    const parsed = outcome.completion.structured_output ?? JSON.parse(outcome.completion.result);
    return {...normalizeAdaptiveAnswers(request, parsed), wall_ms: performance.now() - started,
      usage: outcome.completion.usage, api_equivalent_usd: outcome.completion.total_cost_usd ?? null, models: outcome.models};
  } finally { rmSync(cwd, {recursive: true, force: true}); }
}

// Item 6: reuse saved Jev answers from earlier probe directories; only the held questions go to fresh Claude sessions.
async function deferFrom(dirs, out) {
  const policy = loadDeferralPolicy(), rows = [];
  for (const dir of dirs) {
    const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
    for (const {name} of summary.results) {
      const request = JSON.parse(readFileSync(join(dir, `${name}.request.json`), 'utf8'));
      const response = JSON.parse(readFileSync(join(dir, `${name}.response.json`), 'utf8'));
      const held = heldQuestions(request, response, policy.threshold);
      if (!held.length) { rows.push({source: dir, name, held: 0}); continue; }
      const sub = prepareDecision({...request, questions: Object.fromEntries(held.map(h => [h.id, request.questions[h.id]]))}).body;
      const claude = await claudeDecide(sub, out, name);
      const compared = held.map(h => ({id: h.id, certainty: h.certainty, jev: response.answers[h.id], claude: claude.answers[h.id],
        flipped: decisionValue(claude.answers[h.id]) !== decisionValue(response.answers[h.id])}));
      writeFileSync(join(out, `${name}.deferral.json`), JSON.stringify({held, compared, claude}, null, 1));
      rows.push({source: dir, name, held: held.length, flipped: compared.filter(row => row.flipped).length,
        claude_wall_ms: Math.round(claude.wall_ms), claude_usage: claude.usage, claude_api_equivalent_usd: claude.api_equivalent_usd, models: claude.models});
      writeFileSync(join(out, 'summary.json'), JSON.stringify({threshold: policy.threshold, rows}, null, 1));
    }
  }
  writeFileSync(join(out, 'summary.json'), JSON.stringify({threshold: policy.threshold, rows}, null, 1));
}

async function main() {
  const flags = process.argv.slice(2), value = name => flags[flags.indexOf(name) + 1];
  if (flags[0] === '--defer-from') {
    const out = resolve(flags.at(-1));
    if (flags.at(-2) !== '--out' || existsSync(out)) throw new Error('Usage: --defer-from DIR [DIR...] --out NEW_DIR');
    mkdirSync(out, {recursive: true});
    return deferFrom(flags.slice(1, -2).map(dir => resolve(dir)), out);
  }
  const item = value('--item'), outArg = value('--out'), spend = flags.includes('--spend'), defer = flags.includes('--defer');
  if (!ITEMS[item] || !outArg || existsSync(resolve(outArg))) throw new Error('Usage: --item cohesion|owner|profile|scope --out NEW_DIR [--spend [--defer]]');
  const out = resolve(outArg); mkdirSync(out, {recursive: true});
  const save = (name, data) => writeFileSync(join(out, name), JSON.stringify(data, null, 1));
  const {requests, analyze} = ITEMS[item]();
  const validations = requests.map(row => {
    const prepared = prepareDecision(row.request), check = validateJevInput(row.request, {policy: 'v4', stage: row.stage});
    save(`${row.name}.request.json`, prepared.body);
    return {name: row.name, stage: row.stage, questions: Object.keys(prepared.body.questions).length,
      wire_bytes: Buffer.byteLength(prepared.serialized), state_bytes: Buffer.byteLength(JSON.stringify(prepared.body.state)),
      request_sha256: sha(prepared.serialized), input_ready: check.input_ready_under_current_policy, reasons: check.admission.reason_codes};
  });
  save('validation.json', validations);
  if (validations.some(row => !row.input_ready)) throw new Error('OFFLINE_VALIDATION_BLOCKED');
  if (!spend) { save('summary.json', {item, spend: false, validations, analysis: requests.length ? null : analyze([], requests)}); return; }
  const events = [], record = async event => { events.push({at: new Date().toISOString(), ...event}); save('events.json', events); };
  const config = budgetConfig(), identifiers = {run_id: `d077-probe-${item}`, attempt_id: `d077-probe-${item}-${Date.now()}`,
    group_id: 'd077-probes', agent_role: 'implementation'};
  const client = createJevClient(loadConfig());
  // v3: hold the ledger lock for exactly one call (runner non-narrow path); v4: per-operation lock.
  const decide = async (request, context) => {
    if (config.schema_version === 'jev-token-budget/v4') return createMeasuredDecider({client, record, identifiers,
      budget: createConcurrentTokenBudget(config, {leaseMs: 20 * 60 * 1000})})(request, context);
    const held = await acquireTokenBudget(config, {open: cfg => createTokenBudget(cfg, {requireExisting: true}), timeoutMs: 120000});
    try { return await createMeasuredDecider({client, record, identifiers, budget: held})(request, context); }
    finally { held.close(); }
  };
  const policy = loadDeferralPolicy(), results = [], deferrals = [];
  for (const [index, row] of requests.entries()) {
    const started = performance.now();
    const response = await decide(row.request, {decision_id: index + 1});
    save(`${row.name}.response.json`, response);
    const held = heldQuestions(row.request, response, policy.threshold);
    let merged = response;
    if (defer && held.length) {
      const sub = prepareDecision({...row.request, questions: Object.fromEntries(held.map(h => [h.id, row.request.questions[h.id]]))}).body;
      const claude = await claudeDecide(sub, out, `${row.name}.deferral`);
      save(`${row.name}.deferral.json`, {held, claude});
      merged = {...response, answers: {...response.answers, ...claude.answers}};
      deferrals.push({name: row.name, held: held.length, claude_wall_ms: claude.wall_ms, claude_usage: claude.usage,
        claude_api_equivalent_usd: claude.api_equivalent_usd,
        flipped: held.filter(h => decisionValue(claude.answers[h.id]) !== decisionValue(response.answers[h.id])).length});
    }
    results.push({name: row.name, wall_ms: performance.now() - started, usage: response.usage, model: response.model,
      held: held.length, certainties: Object.fromEntries(Object.entries(response.answers).map(([id, answer]) => [id, answerCertainty(answer)]))});
    row.merged = merged;
  }
  const analysis = analyze(requests.map(row => row.merged), requests);
  save('summary.json', {item, spend: true, defer, threshold: policy.threshold, validations, results, deferrals, analysis, budget: readTokenBudgetSnapshot(config)});
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({error: error.code ?? error.message, automatic_retries: 0})}\n`);
  process.exitCode = 1;
});
