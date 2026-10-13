import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync, lstatSync, readdirSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {loadAdaptiveRunManifest, runAdaptiveArm} from '../src/benchmark/adaptive-dag-runner.mjs';

// D078 v12 arm (layered-v2, owner labels v2, union scope, deferral, D076 repair options) on the real D066 catalog with mocks.
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

test('d079-no-deferral arm schedules the waiting consumer producer first and never defers held answers', async () => {
  const manifest = loadAdaptiveRunManifest(join(root, 'benchmarks/e2e-swe/manifests/d079-no-deferral.json'), root);
  const registry = read(join(root, manifest.public_registry)), image = read(join(root, manifest.image_lock));
  const parent = mkdtempSync(join(root, 'benchmark-runs/d079-no-deferral-mock-')), containers = new Map(), claudeDecisions = [], workers = [], jevQuestions = [];
  let sequence = 0;
  const adapters = {jevConfig: {}, cohortPreflight: {live_ready: true, status: 'ready', environment: {fixture: true, image_id: image.image_id}},
    openBudget: () => ({snapshot: () => snapshot, reserve: () => 'fixture', settle: () => {}, markUnresolved: () => {}, close: () => {}}),
    jevClientFactory: () => ({listModels: async () => ({models: [{name: 'jev-latest'}]}), listCredits: async () => ({}),
      decide: async body => {
        const answers = Object.fromEntries(Object.entries(body.questions).map(([id, question]) => {
          jevQuestions.push(id);
          const keys = Object.keys(question.criteria);
          if (id.startsWith('adaptive.unit_relation.v2.')) {
            const [a, b] = id.split('.').slice(-2);
            const choice = a === 'U01' && b === 'U02' ? 'unknown' : ['U15', 'U16', 'U17'].includes(a) && b === 'U20' ? 'b_needs_a_files'
              : groupOf(a) === groupOf(b) ? 'a_uses_b_interface' : 'no_dependency';
            return [id, {type: 'choice', choice, confidence: a === 'U03' && b === 'U04' ? 0.2 : 0.9}];
          }
          return [id, {type: 'choice', choice: keys.includes('claude_sonnet55_medium') ? 'claude_sonnet55_medium' : keys[0], confidence: 0.8}];
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
            {type: 'choice', choice: Object.keys(q.criteria).includes('no_dependency') ? 'no_dependency' : Object.keys(q.criteria)[0]}]))};
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
    assert.equal(planning.layered.depth_target_met, true);
    assert.deepEqual(planning.layered.edges, [['U20', 'U15'], ['U20', 'U16'], ['U20', 'U17']]);
    assert.ok(planning.layered.clusters.some(units => units.includes('U01') && units.includes('U02')));
    assert.ok(jevQuestions.some(id => id.startsWith('adaptive.unit_relation.v2.')) && !jevQuestions.some(id => /membership|cohesion|relation\.v1/.test(id)));
    assert.ok(!jevQuestions.some(id => id.endsWith('.model') || id.endsWith('.effort')), 'D078 keeps the v2 profile choice');
    assert.deepEqual(claudeDecisions, []);
    const scheduled = read(join(parent, 'jev_profile/planning.json')).schedule;
    assert.equal(scheduled.policy, 'critical-path-v1');
    const producers = planning.leaves.filter(leaf => ['U15', 'U16', 'U17'].some(unit => leaf.unit_ids.includes(unit))
      && !leaf.unit_ids.includes('U20')).map(leaf => leaf.id);
    const producer = scheduled.priority_order[0];
    assert.ok(producers.includes(producer), JSON.stringify({producers, order: scheduled.priority_order}));
    const startOrder = readFileSync(join(parent, 'jev_profile/events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
      .filter(event => event.event === 'adaptive_leaf_operation' && event.phase === 'started').map(event => event.task_id);
    assert.equal(startOrder[0], producer);
    assert.equal(workers.length, planning.leaves.length);
    assert.ok(workers.every(worker => worker.model === 'claude-sonnet-5-5' && worker.effort === 'medium'));
    const events = readFileSync(join(parent, 'jev_profile/events.jsonl'), 'utf8');
    assert.ok(!events.includes('jev_confidence_deferral'));
  } finally { if (!process.env.D078_KEEP) cleanup(parent); }
});
