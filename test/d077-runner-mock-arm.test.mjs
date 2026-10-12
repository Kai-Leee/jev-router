import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync, lstatSync, readdirSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {loadAdaptiveRunManifest, runAdaptiveArm} from '../src/benchmark/adaptive-dag-runner.mjs';

// Full v12 jev_profile arm against the real D066 catalog with mocked Jev, Claude and Docker: no network, no ledger write.
const root = resolve(import.meta.dirname, '..'), read = path => JSON.parse(readFileSync(path, 'utf8'));
const raw = (stdout, exit_code = 0) => ({stdout, stderr: '', exit_code, outcome_uncertain: false});
const completion = (response, model = 'claude-opus-5-5') => raw(JSON.stringify({type: 'result', subtype: 'success', is_error: false, modelUsage: {[model]: {}},
  usage: {input_tokens: 20, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0}, total_cost_usd: 0.002,
  structured_output: response, result: 'ok'}) + '\n');
const snapshot = {schema_version: 'jev-token-budget-snapshot/v4', unlimited: true, token_limit: null, remaining_input_tokens: null,
  blocked_code: null, reservations_pending: 0};
function cleanup(path) {
  const stat = lstatSync(path); chmodSync(path, 0o700);
  if (stat.isDirectory()) for (const name of readdirSync(path)) cleanup(join(path, name));
  rmSync(path, {recursive: true, force: true});
}
const groupOf = unit => Number(unit.slice(1)) % 5;

test('v12 arm plans by cohesion, defers held answers to Claude, splits profiles and completes on mocked checks', async () => {
  const manifest = loadAdaptiveRunManifest(join(root, 'benchmarks/e2e-swe/manifests/d077-question-forms.json'), root);
  const registry = read(join(root, manifest.public_registry)), image = read(join(root, manifest.image_lock));
  const parent = mkdtempSync(join(root, 'benchmark-runs/d077-mock-arm-')), containers = new Map(), claudeDecisions = [], workers = [], jevQuestions = [];
  let sequence = 0;
  const adapters = {jevConfig: {}, cohortPreflight: {live_ready: true, status: 'ready', environment: {fixture: true, image_id: image.image_id}},
    openBudget: () => ({snapshot: () => snapshot, reserve: () => 'fixture', settle: () => {}, markUnresolved: () => {}, close: () => {}}),
    jevClientFactory: () => ({listModels: async () => ({models: [{name: 'jev-latest'}]}), listCredits: async () => ({}),
      decide: async body => {
        const answers = Object.fromEntries(Object.entries(body.questions).map(([id, question]) => {
          jevQuestions.push(id);
          if (question.type === 'noul') {
            const [a, b] = id.split('.').slice(-2);
            return [id, {type: 'noul', noul: a === 'U01' && b === 'U02' ? 0.55 : groupOf(a) === groupOf(b) ? 0.9 : 0.1}];
          }
          if (question.type === 'score') return [id, {type: 'score', score: 1.2, confidence: 0.7}];
          const keys = Object.keys(question.criteria);
          const choice = keys.includes('no_dependency') ? 'no_dependency' : keys.includes('sonnet55') ? 'sonnet55' : keys[0];
          return [id, {type: 'choice', choice, confidence: 0.8}];
        }));
        return {answers, model: 'jev-1.13.0', usage: {input_tokens: 1000, output_tokens: 10}};
      }}),
    runCommand: async (command, args, options) => {
      if (command === 'claude') {
        const prompt = JSON.parse(options.input);
        let response;
        if (prompt.questions) {
          claudeDecisions.push(Object.keys(prompt.questions));
          response = {answers: Object.fromEntries(Object.entries(prompt.questions).map(([id, q]) => [id,
            q.type === 'noul' ? {type: 'noul', noul: 0.2} : q.type === 'score' ? {type: 'score', score: 1} : {type: 'choice', choice: Object.keys(q.criteria)[0]}]))};
        } else {
          workers.push({task: prompt.task.id, model: args[args.indexOf('--model') + 1], effort: args[args.indexOf('--effort') + 1]});
          const mcp = read(args[args.indexOf('--mcp-config') + 1]), transport = read(mcp.mcpServers.artifact_worker.args.at(-1));
          for (const path of prompt.task.write_scope) { mkdirSync(dirname(join(transport.root, path)), {recursive: true});
            writeFileSync(join(transport.root, path), '# fixture\n', {mode: 0o644}); }
          response = {fixture: 'worker completed'};
        }
        const result = completion(response, args[args.indexOf('--model') + 1]); options.onStdout(result.stdout); return result;
      }
      assert.equal(command, 'docker');
      if (args[0] === 'image') return raw(JSON.stringify([{Id: image.image_id}]));
      if (args[0] === 'create') { const id = (++sequence).toString(16).padStart(64, '0'), entry = args.indexOf('--entrypoint');
        const candidate = args.find(arg => arg.includes('dst=/candidate,')).split(',src=')[1].split(',dst=')[0];
        containers.set(id, {candidate, command: args[entry + 1], args: args.slice(entry + 3)}); return raw(id); }
      if (args[0] === 'rm') { containers.delete(args.at(-1)); return raw('removed'); }
      const container = containers.get(args.at(-1));
      const suiteIndex = container.args.findIndex(arg => arg === '--suite' || arg.startsWith('--suite'));
      if (container.args[0] === '-c') return raw(JSON.stringify({status: 'passed', executed: true, exit_code: 0, outcome_uncertain: false,
        assertions: 1, skipped: 0, error: null}));
      const suite = container.args[suiteIndex] === '--suite' ? container.args[suiteIndex + 1] : container.args[suiteIndex].split('=')[1], check = registry.find(item => item.id === `public.${suite}`);
      return raw(JSON.stringify({schema_version: 'dag-public-check-evidence/v1', check_id: check.id, check_version: check.version,
        environment_ref: check.environment_ref, scope: 'complete_suite', binding_kind: 'candidate', product_certified: false,
        artifact_revisions: null, status: 'passed', executed: true, exit_code: 0, outcome_uncertain: false, test_ids: check.test_ids,
        cases: check.test_ids.map(test_id => ({test_id, status: 'passed', assertions: 1})), assertions: check.test_ids.length,
        skipped: 0, unexecuted_test_ids: [], error: null, setup_evidence: {fixture: true}}));
    }};
  try {
    const result = await runAdaptiveArm({rootDir: root, manifest, runDir: join(parent, 'jev_profile'), arm: 'jev_profile',
      preparationDirectory: join(root, manifest.catalog_reuse.preparation_directory), spend: true, adapters});
    assert.equal(result.status, 'completed', JSON.stringify(result.terminal_cause));
    const planning = read(join(parent, 'jev_profile/planning.json'));
    assert.equal(planning.cohesion.pair_count, 210);
    assert.ok(planning.leaves.length >= 2 && planning.leaves.length <= 6, String(planning.leaves.length));
    assert.ok(jevQuestions.some(id => id.startsWith('adaptive.cohesion.v1.')) && !jevQuestions.some(id => id.startsWith('adaptive.membership')));
    assert.ok(jevQuestions.some(id => id.endsWith('.model')) && jevQuestions.some(id => id.endsWith('.effort')));
    assert.deepEqual(claudeDecisions, [['adaptive.cohesion.v1.U01.U02']]);
    assert.equal(workers.length, planning.leaves.length);
    assert.ok(workers.every(worker => worker.model === 'claude-sonnet-5-5' && worker.effort === 'medium'));
    const events = readFileSync(join(parent, 'jev_profile/events.jsonl'), 'utf8');
    assert.ok(events.includes('jev_confidence_deferral_completed'));
    assert.equal(result.usage.claude.calls, planning.leaves.length + 1);
  } finally { if (!process.env.D077_KEEP) cleanup(parent); }
});
