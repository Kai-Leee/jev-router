import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {planRepairOwnerRequest, measureRepairBudget} from '../src/orchestration/adaptive-repair-budget.mjs';
import {workerMentionedExpansion, selectInferredOwnerScope, EXPANDED_UNION_ID} from '../src/orchestration/adaptive-inferred-scope.mjs';
import {loadAdaptiveRunManifest} from '../src/benchmark/adaptive-dag-runner.mjs';

const root = resolve(import.meta.dirname, '..');
const manifests = join(root, 'benchmarks/e2e-swe/manifests');

// One failed case (it cannot be split) whose size comes mostly from fixed context, plus round-1 diagnostics and history.
function rawRequest({padding, excerpt = 1000, history = 3000}) {
  return {model: 'jev-latest', state: {schema_version: 'adaptive-inferred-repair-owners/v1',
    failures: [{question_id: 'owner.case-1', check_id: 'public.cli', requirement_ids: ['R1']}],
    requirement_descriptions: [{id: 'R1', description: 'The CLI writes a valid package.'}],
    context: 'x'.repeat(padding),
    worker_diagnostics: {schema_version: 'adaptive-worker-diagnostics/v1', entries: ['n1', 'n2'].map(task_id => ({task_id,
      repaired_artifact_ids: ['A02'], denied_read_paths: [], denied_read_artifact_ids: [], mentioned_artifact_ids: ['A02', 'A18'],
      final_response_excerpt: 'w'.repeat(excerpt)}))},
    repair_history: {schema_version: 'adaptive-causal-repair-history/v1', entries: [{round_index: 0, status: 'failed',
      selected_artifact_ids: ['A02'], changed_artifact_ids: [], persistent_failure_keys: ['public.cli/T1/'],
      failures_before: [{message: 'f'.repeat(history / 2)}], failures_after: [{message: 'f'.repeat(history / 2)}], relevant_revisions: {}}]}},
  questions: {'owner.case-1': {type: 'choice', instructions: 'Choose the owner.', criteria: {A02: 'A02', A18: 'A18'}}}};
}

test('repair-budget-v3 fits a single oversized case that v2 must stop, keeping every diagnostics ID', () => {
  // About 800 estimated tokens over the 28,800 target; shortening diagnostics and history saves about 1,800.
  const request = rawRequest({padding: 57500});
  assert.equal(measureRepairBudget(request).within_budget, false);
  const v2 = planRepairOwnerRequest(request, {policy: 'repair-budget-v2'});
  assert.equal(v2.report.within_budget, false);
  const v3 = planRepairOwnerRequest(request, {policy: 'repair-budget-v3'});
  assert.equal(v3.report.within_budget, true);
  assert.equal(v3.report.contract_source.path, 'docs/orchestration/contracts/adaptive-repair-budget.v3.json');
  const [part] = v3.parts, state = part.request.state;
  assert.deepEqual(state.repair_budget.applied_steps, ['raw_compact_worker_diagnostics', 'raw_compact_repair_history']);
  for (const entry of state.worker_diagnostics.entries) {
    assert.deepEqual(entry.mentioned_artifact_ids, ['A02', 'A18']);
    assert.ok(entry.final_response_excerpt.length <= 400);
  }
  const [history] = state.repair_history.entries;
  assert.deepEqual(history.persistent_failure_keys, ['public.cli/T1/']);
  assert.ok(!('failures_before' in history) && !('failures_after' in history) && !('relevant_revisions' in history));
  assert.ok(part.report.omissions.some(row => row.pointer === '/repair_history/entries/0/failures_before'));
  // No applied step may leave its part larger than before it ran.
  const tokens = part.report.applied_steps.map(row => row.estimated_tokens);
  assert.deepEqual(tokens, [...tokens].sort((a, b) => b - a));
});

test('repair-budget-v3 leaves a request that already fits unchanged', () => {
  const request = rawRequest({padding: 1000});
  const v3 = planRepairOwnerRequest(request, {policy: 'repair-budget-v3'});
  assert.equal(v3.report.within_budget, true);
  assert.equal(v3.report.lossless, true);
  assert.deepEqual(v3.parts[0].request, request);
});

const plan = {artifacts: ['A07', 'A14', 'A19', 'A21'].map(id => ({id}))};
// d082-cloud-06 round 1: n4 repaired A14 and named A07/A14/A21; n5 repaired A19 and named A07/A14/A19/A21.
const diagnostics = {entries: [{task_id: 'n4', repaired_artifact_ids: ['A14'], mentioned_artifact_ids: ['A07', 'A14', 'A21']},
  {task_id: 'n5', repaired_artifact_ids: ['A19'], mentioned_artifact_ids: ['A07', 'A14', 'A19', 'A21']}]};
const expand = (overrides = {}) => workerMentionedExpansion({baseArtifactIds: ['A07'], plan, diagnostics,
  persistentFailureKeys: ['public.schema-models/T.R10.02/'], ...overrides});

test('worker-mentioned-v1 adds the artifact both repair workers named outside their own scope', () => {
  const expanded = expand();
  assert.deepEqual(expanded.artifact_ids, ['A07', 'A21']);
  assert.deepEqual(expanded.info.added_artifact_ids, ['A21']);
  assert.deepEqual(expanded.info.mention_counts, {A21: 2});
  assert.equal(expanded.info.threshold, 2);
  assert.equal(expanded.info.basis, 'unverified_worker_statements_not_fault_proof');
});

test('worker-mentioned-v1 does nothing without persistent failures, diagnostics or enough mentions, and caps additions', () => {
  assert.equal(expand({persistentFailureKeys: []}), null);
  assert.equal(expand({diagnostics: {entries: []}}), null);
  assert.equal(expand({diagnostics: {entries: [{task_id: 'n4', repaired_artifact_ids: ['A14'], mentioned_artifact_ids: ['A14']}]}}), null);
  const capped = expand({diagnostics: {entries: [{task_id: 'n9', repaired_artifact_ids: [], mentioned_artifact_ids: ['A14', 'A19', 'A21']}]}});
  assert.deepEqual(capped.info.added_artifact_ids, ['A14', 'A19']);
});

test('the scope rule prefers the expanded union and otherwise keeps the plain union', () => {
  const union = {id: 'repair-inferred-owners', artifact_ids: ['A07']}, expanded = {id: EXPANDED_UNION_ID, artifact_ids: ['A07', 'A21']};
  assert.equal(selectInferredOwnerScope({candidates: [union, expanded]}).candidate_id, EXPANDED_UNION_ID);
  assert.equal(selectInferredOwnerScope({candidates: [union]}).candidate_id, 'repair-inferred-owners');
});

test('d083 manifest differs from d082 only in repair budget, scope expansion and semantics', () => {
  const raw = name => JSON.parse(readFileSync(join(manifests, name), 'utf8'));
  const {repair_budget: budget, repair_feedback: feedback, session_semantics: _a, ...rest83} = raw('d083-repair-fixes.json');
  const {repair_budget: _b, repair_feedback: feedback82, session_semantics: _c, ...rest82} = raw('d082-cloud-defaults.json');
  assert.deepEqual(rest83, rest82);
  assert.equal(budget.policy, 'repair-budget-v3');
  assert.deepEqual(feedback, {...feedback82, scope_expansion: 'worker-mentioned-v1'});
  const loaded = loadAdaptiveRunManifest(join(manifests, 'd083-repair-fixes.json'), root);
  assert.equal(loaded.repair_budget.policy, 'repair-budget-v3');
});

test('scope_expansion without worker diagnostics is rejected', t => {
  const dir = mkdtempSync(join(tmpdir(), 'd083-manifest-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const manifest = JSON.parse(readFileSync(join(manifests, 'd083-repair-fixes.json'), 'utf8'));
  manifest.repair_feedback = {read_scope: 'candidate-v1', scope_expansion: 'worker-mentioned-v1'};
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  assert.throws(() => loadAdaptiveRunManifest(join(dir, 'manifest.json'), root), /ADAPTIVE_REPAIR_FEEDBACK_BINDING/);
});
