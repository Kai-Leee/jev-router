import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {runSpecReview, specReviewAfterPublicGate, loadSpecReviewContract} from '../src/benchmark/adaptive-spec-review.mjs';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'benchmarks/e2e-swe/manifests/d078-layered.json'), 'utf8'));
const registry = JSON.parse(readFileSync(join(root, manifest.public_registry), 'utf8'));
const raw = (stdout, exit_code = 0) => ({stdout, stderr: '', exit_code, outcome_uncertain: false});
const input = {source: 'Public spec.', requirement_descriptions: [{id: 'R1', text: 'Do it.', source_refs: ['p']}]};
const catalog = {units: [{id: 'U1', title: 'One', interface: 'f()'}]};

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'spec-review-')); t.after(() => rmSync(dir, {recursive: true, force: true}));
  const candidate = join(dir, 'runtime/candidate'); mkdirSync(candidate, {recursive: true}); mkdirSync(join(dir, 'runtime/pinned'));
  writeFileSync(join(candidate, 'module.py'), 'x = 1\n');
  return {dir, candidate};
}
const adapter = ({edit = true, failCheck = null} = {}) => { const containers = new Map(); return async (command, args, options) => {
  if (command === 'claude') {
    assert.ok(!options.input.includes('verifier') && JSON.parse(options.input).public_checks.length === registry.length);
    assert.ok(!options.cwd.startsWith(root), 'reviewer works outside the repository');
    const denied = args.slice(args.indexOf('--disallowedTools') + 1);
    assert.ok(['Read', 'Edit', 'Write'].every(tool => denied.includes(`${tool}(/${root}/**)`)), JSON.stringify(denied));
    if (edit) writeFileSync(join(options.cwd, 'module.py'), 'x = 2\n');
    return raw(JSON.stringify({type: 'result', subtype: 'success', is_error: false, modelUsage: {'claude-opus-5-5': {}},
      usage: {input_tokens: 5, output_tokens: 5}, total_cost_usd: 0.5, result: 'Fixed one deviation.'}) + '\n');
  }
  if (args[0] === 'create') { const id = String(containers.size + 1).padStart(64, '0'); containers.set(id, args[args.indexOf('--suite') + 1]); return raw(id); }
  if (args[0] === 'rm') return raw('removed');
  const check = registry.find(item => item.argv[item.argv.indexOf('--suite') + 1] === containers.get(args.at(-1)));
  const failed = failCheck === check.id;
  return raw(JSON.stringify({status: failed ? 'failed' : 'passed', executed: true, cases: check.test_ids.map((test_id, i) =>
    ({test_id, status: failed && i === 0 ? 'failed' : 'passed'}))}), failed ? 1 : 0);
}; };

test('a reviewed candidate is adopted only when every public check still passes', async t => {
  const {dir, candidate} = fixture(t);
  const ok = await runSpecReview({rootDir: root, manifest, candidatePath: candidate, pinnedDirectory: join(dir, 'runtime/pinned'),
    outDirectory: join(dir, 'review-ok'), input, catalog, runCommand: adapter()});
  assert.equal(ok.adopted, true, JSON.stringify(ok.reason)); assert.deepEqual(ok.changed_files, ['module.py']);
  assert.notEqual(ok.files_before_sha256, ok.files_after_sha256);
  assert.ok(ok.candidate_path.startsWith(join(dir, 'review-ok')), 'the adopted copy lives in the run directory');
  assert.equal(readFileSync(join(ok.candidate_path, 'module.py'), 'utf8'), 'x = 2\n');
  assert.equal(readFileSync(join(candidate, 'module.py'), 'utf8'), 'x = 1\n', 'the gated candidate stays unchanged');
  const bad = await runSpecReview({rootDir: root, manifest, candidatePath: candidate, pinnedDirectory: join(dir, 'runtime/pinned'),
    outDirectory: join(dir, 'review-bad'), input, catalog, runCommand: adapter({failCheck: registry[0].id})});
  assert.equal(bad.adopted, false); assert.equal(bad.candidate_path, candidate); assert.equal(bad.reason, 'PUBLIC_GATE_FAILED_AFTER_REVIEW');
  const none = await runSpecReview({rootDir: root, manifest, candidatePath: candidate, pinnedDirectory: join(dir, 'runtime/pinned'),
    outDirectory: join(dir, 'review-none'), input, catalog, runCommand: adapter({edit: false})});
  assert.equal(none.adopted, false); assert.equal(none.reason, 'REVIEW_NO_CHANGE');
});

test('the runner hook runs only after a completed public gate and never throws', async t => {
  const {dir, candidate} = fixture(t);
  const m = {...manifest, spec_review: {policy: 'spec-review-v1', contract: 'docs/orchestration/contracts/adaptive-spec-review.v1.json'}};
  assert.equal(await specReviewAfterPublicGate({rootDir: root, manifest: m, runDirectory: dir, execution: {status: 'failed'}, input, catalog,
    record: async () => {}}), null);
  const missing = await specReviewAfterPublicGate({rootDir: root, manifest: {...m, public_registry: 'missing.json'}, runDirectory: dir,
    execution: {status: 'completed', candidate_path: candidate}, input, catalog, record: async () => {}});
  assert.equal(missing.adopted, false); assert.equal(missing.candidate_path, candidate);
  assert.equal(loadSpecReviewContract(root).model, 'claude-opus-5-5');
});
