import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {packRepairOwnerRequest, restoreRepairBudgetRequest, measureRepairBudget} from '../src/orchestration/adaptive-repair-budget.mjs';
import {validateJevPrompt} from '../src/orchestration/jev-prompt-preflight.mjs';
import {prepareDecision} from '../src/client.mjs';
import {loadAdaptiveRunManifest, adaptiveRepairBudgetOption} from '../src/benchmark/adaptive-dag-runner.mjs';

const root = resolve(import.meta.dirname, '..');
const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
const example = () => read('examples/jev-preflight/inferred-v2.request.json');
const promptCheck = request => validateJevPrompt(request, {policy: 'v2', stage: 'repair_owners', template: 'inferred-v2',
  expectedRequestSha256: sha(prepareDecision(request).serialized)});

function oversized() {
  const request = example(), state = request.state;
  state.repair_history = {schema_version: 'adaptive-causal-repair-history/v1', entries: [{round_index: 0, status: 'completed',
    selected_candidate_id: 'repair-1', selected_artifact_ids: [], changed_artifact_ids: [], selected_but_unchanged_artifact_ids: [],
    changed_files: [], persistent_failure_keys: [], resolved_failure_keys: ['c/t/'], unobserved_failure_keys: [], new_failure_keys: [],
    failures_before: Array.from({length: 400}, (_, index) => ({check_id: 'c', test_id: `t${index}`, message: 'Earlier failure detail. '.repeat(8)})),
    failures_after: [], relevant_revisions: {}, source_refs: {}}]};
  state.additional_observed_cases = Array.from({length: 40}, (_, index) => ({check_id: 'c', testcase: {test_id: `p${index}`, status: 'passed',
    detail: 'Passed diagnostic. '.repeat(20)}}));
  return request;
}

test('an in-budget owner request is returned unchanged and lossless', () => {
  const request = example(), {request: packed, report} = packRepairOwnerRequest(request, {policy: 'repair-budget-v1'});
  assert.deepEqual(packed, request); assert.equal(report.lossless, true); assert.equal(report.within_budget, true);
  assert.deepEqual(report.applied_steps, []); assert.equal(Object.hasOwn(packed.state, 'repair_budget'), false);
});

test('an oversized owner request is packed step by step, stays gate-valid and restores exactly', () => {
  const request = oversized();
  assert.equal(promptCheck(request).passed, true);
  assert.equal(measureRepairBudget(request).within_budget, false);
  const {request: packed, report} = packRepairOwnerRequest(request, {policy: 'repair-budget-v1'});
  assert.equal(report.within_budget, true); assert.equal(report.lossless, false);
  assert.deepEqual(report.applied_steps.map(row => row.id), ['history_delta']);
  assert.deepEqual(packed.state.repair_budget.applied_steps, ['history_delta']);
  assert.equal(Object.hasOwn(packed.state.repair_history.entries[0], 'failures_before'), false);
  assert.deepEqual(packed.state.repair_history.entries[0].resolved_failure_keys, ['c/t/']);
  assert.deepEqual(packed.questions, request.questions);
  assert.equal(promptCheck(packed).passed, true, JSON.stringify(promptCheck(packed).reason_codes));
  assert.deepEqual(restoreRepairBudgetRequest(packed, report), request);
  assert.ok(report.omissions.some(row => row.pointer === '/repair_history/entries/0/failures_before'));
  assert.throws(() => restoreRepairBudgetRequest({...packed, questions: {}}, report), {code: 'ADAPTIVE_REPAIR_BUDGET_REPORT'});
  assert.throws(() => packRepairOwnerRequest(packed, {policy: 'repair-budget-v1'}), {code: 'ADAPTIVE_REPAIR_BUDGET_ALREADY_APPLIED'});
});

test('steps continue until the estimate fits, and an irreducible request reports over budget', () => {
  const request = oversized();
  request.state.repair_history.entries[0].failures_before = [];
  request.state.additional_observed_cases.push(...Array.from({length: 200}, (_, index) => ({check_id: 'c', testcase: {test_id: `q${index}`,
    status: 'passed', detail: 'Passed diagnostic. '.repeat(20)}})));
  const packed = packRepairOwnerRequest(request, {policy: 'repair-budget-v1'});
  assert.deepEqual(packed.report.applied_steps.map(row => row.id), ['history_delta', 'drop_passed_observations']);
  assert.equal(packed.report.within_budget, true);
  const huge = example(); huge.state.detailed_failed_cases[0].testcase.message = 'Unremovable failed-case detail. '.repeat(4000);
  const stuck = packRepairOwnerRequest(huge, {policy: 'repair-budget-v1'});
  assert.equal(stuck.report.within_budget, false);
  assert.throws(() => packRepairOwnerRequest(example(), {policy: 'other'}), {code: 'ADAPTIVE_REPAIR_BUDGET_POLICY'});
});

test('the v11 manifest binds the budget contract; other versions and wrong hashes are rejected', t => {
  const path = 'benchmarks/e2e-swe/manifests/d076-preserved-repair.json', manifest = loadAdaptiveRunManifest(join(root, path), root);
  assert.deepEqual(adaptiveRepairBudgetOption(manifest), {repairBudget: {policy: 'repair-budget-v1'}});
  assert.deepEqual(adaptiveRepairBudgetOption(loadAdaptiveRunManifest(join(root, 'benchmarks/e2e-swe/manifests/d075-preserved-repair.json'), root)), {});
  const directory = mkdtempSync(join(tmpdir(), 'd076-budget-')); t.after(() => rmSync(directory, {recursive: true, force: true}));
  const file = join(directory, 'manifest.json'), value = read(path);
  writeFileSync(file, JSON.stringify({...value, repair_budget: {...value.repair_budget, sha256: '0'.repeat(64)}}));
  assert.throws(() => loadAdaptiveRunManifest(file, root), {code: 'ADAPTIVE_REPAIR_BUDGET_BINDING'});
  const v10 = read('benchmarks/e2e-swe/manifests/d075-preserved-repair.json');
  writeFileSync(file, JSON.stringify({...v10, repair_budget: value.repair_budget}));
  assert.throws(() => loadAdaptiveRunManifest(file, root), {code: 'ADAPTIVE_REPAIR_BUDGET_BINDING'});
});
