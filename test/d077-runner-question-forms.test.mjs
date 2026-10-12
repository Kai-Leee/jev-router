import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {loadAdaptiveRunManifest, loadAdaptivePublicInput, loadAdaptiveSharedPreparation, adaptiveRuntimeSpeed,
  createAdaptiveProviderSession, normalizeAdaptiveAnswers} from '../src/benchmark/adaptive-dag-runner.mjs';
import {createQuestionFormHooks} from '../src/benchmark/adaptive-question-forms.mjs';

const root = resolve(import.meta.dirname, '..'), path = join(root, 'benchmarks/e2e-swe/manifests/d077-question-forms.json');
const completion = response => ({stdout: JSON.stringify({type: 'result', subtype: 'success', is_error: false,
  modelUsage: {'claude-opus-5-5': {}}, usage: {input_tokens: 20, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0},
  total_cost_usd: 0.002, structured_output: response, result: 'ok'}) + '\n', stderr: '', exit_code: 0, outcome_uncertain: false});

test('v12 manifest binds the D077 contracts, reuses the D066 catalog and keeps historical speed defaults', t => {
  const manifest = loadAdaptiveRunManifest(path, root);
  assert.deepEqual(manifest.arms, ['jev_profile']);
  assert.equal(manifest.decomposition_policy.id, 'cohesion-v1');
  assert.deepEqual(adaptiveRuntimeSpeed(manifest), {model_lookup: 'per_call', budget_lock: 'ledger_op', public_check_concurrency: 1, readiness_batch: false});
  const prepared = loadAdaptiveSharedPreparation({rootDir: root, manifest, input: loadAdaptivePublicInput(root, manifest),
    preparationDirectory: join(root, manifest.catalog_reuse.preparation_directory)});
  assert.equal(prepared.catalog.units.length, 21);
  const dir = mkdtempSync(join(tmpdir(), 'd077-manifest-')); t.after(() => rmSync(dir, {recursive: true, force: true}));
  const changed = JSON.parse(readFileSync(path, 'utf8')); changed.question_forms.deferral.sha256 = '0'.repeat(64);
  writeFileSync(join(dir, 'm.json'), JSON.stringify(changed));
  assert.throws(() => loadAdaptiveRunManifest(join(dir, 'm.json'), root), {code: 'ADAPTIVE_QUESTION_FORMS_BINDING'});
});

test('v12 keeps Jev confidence and fractional scores; earlier manifests normalize exactly as before', () => {
  const request = {model: 'jev-latest', state: {x: 1}, questions: {s: {type: 'score', instructions: 'Rate.', criteria: ['a', 'b', 'c']}}};
  const response = {answers: {s: {type: 'score', score: 1.4, confidence: 0.6, probabilities: {0: 0.1, 1: 0.4, 2: 0.5}, legend: {}}}};
  assert.deepEqual(normalizeAdaptiveAnswers(request, response, {evidence: true}).answers.s,
    {type: 'score', score: 1.4, confidence: 0.6, probabilities: {0: 0.1, 1: 0.4, 2: 0.5}});
  assert.throws(() => normalizeAdaptiveAnswers(request, response), {code: 'ADAPTIVE_DECISION_INVALID'});
  assert.deepEqual(normalizeAdaptiveAnswers(request, {answers: {s: {type: 'score', score: 2, confidence: 0.9}}}).answers.s, {type: 'score', score: 2});
});

test('v12 hooks hold low-confidence Jev answers for one fresh Claude decision and choose the union scope locally', async t => {
  const manifest = loadAdaptiveRunManifest(path, root), runDirectory = mkdtempSync(join(tmpdir(), 'd077-session-'));
  t.after(() => rmSync(runDirectory, {recursive: true, force: true}));
  for (const name of ['calls', 'receipts']) mkdirSync(join(runDirectory, name));
  const claudeBodies = [], events = [];
  const session = createAdaptiveProviderSession({rootDir: root, manifest, run_id: 'd077-hooks', runDirectory, remaining: () => 60000,
    record: async event => events.push(event), modelLookup: 'per_call', budgetLock: 'ledger_op', adapters: {jevConfig: {},
      runCommand: async (_command, _args, options) => {
        const body = JSON.parse(options.input); claudeBodies.push(body);
        const answer = Object.fromEntries(Object.entries(body.questions).map(([id, q]) => [id, q.type === 'noul' ? {type: 'noul', noul: 0.9}
          : {type: 'choice', choice: Object.keys(q.criteria).at(-1)}]));
        const result = completion({answers: answer}); options.onStdout(result.stdout); return result;
      },
      openBudget: () => ({reserve: () => 'fixture', settle: () => {}, markUnresolved: () => {}, snapshot: () => ({fixture: true}), close: () => {}}),
      jevClientFactory: () => ({listModels: async () => ({models: [{name: 'jev-latest'}]}), listCredits: async () => ({fixture: true}),
        decide: async () => ({model: 'jev-1.13.0', usage: {input_tokens: 10, output_tokens: 1}, answers: {
          sure: {type: 'choice', choice: 'a', confidence: 0.8, probabilities: {a: 0.9, b: 0.1}},
          unsure: {type: 'choice', choice: 'a', confidence: 0.3, probabilities: {a: 0.65, b: 0.35}},
          pair: {type: 'noul', noul: 0.6}}})})}});
  const hooks = createQuestionFormHooks({session, record: async event => events.push(event)});
  const request = {model: 'jev-latest', state: {evidence: 'fixture'}, questions: {
    sure: {type: 'choice', instructions: 'Q1?', criteria: {a: 'A.', b: 'B.'}},
    unsure: {type: 'choice', instructions: 'Q2?', criteria: {a: 'A.', b: 'B.'}}, pair: {type: 'noul', instructions: 'Q3?'}}};
  const result = await hooks.decide(request, {stage: 'relations', decision_id: 'r1'});
  assert.equal(claudeBodies.length, 1); assert.deepEqual(Object.keys(claudeBodies[0].questions), ['unsure', 'pair']);
  assert.equal(result.answers.sure.confidence, 0.8); assert.equal(result.answers.unsure.choice, 'b'); assert.equal(result.answers.pair.noul, 0.9);
  assert.deepEqual(session.receipts().map(row => row.provider), ['jev', 'claude']);
  assert.ok(events.some(event => event.event === 'jev_confidence_deferral_completed'));
  const scope = await hooks.decideRepair({candidates: [{id: 'repair-inferred-owners', task_ids: ['t'], artifact_ids: ['A']}]});
  assert.equal(scope.candidate_id, 'repair-inferred-owners'); assert.equal(session.receipts().length, 2);
});
