import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {packRepairOwnerRequest, planRepairOwnerRequest} from '../src/orchestration/adaptive-repair-budget.mjs';

const root = resolve(import.meta.dirname, '..');
const sha = value => createHash('sha256').update(value).digest('hex');
const questionId = (check_id, test_id, assertion_id = null) => `owner.${sha(JSON.stringify({assertion_id, check_id, test_id})).slice(0, 20)}`;
const plan = request => planRepairOwnerRequest(request, {policy: 'repair-budget-v2'});
const ids = result => result.parts.map(part => part.question_ids);

// Raw owner state (the shape left when the v2 projection falls back), one failure per [check, test, requirement, message bytes].
function rawRequest(rows) {
  const question = {type: 'choice', instructions: 'Choose the artifact.', criteria: {A1: 'Existing A1.', A2: 'Existing A2.', unknown: 'Unknown.'}};
  const checks = [...new Set(rows.map(([check]) => check))];
  const failures = rows.map(([check_id, test_id, requirement, size]) => ({question_id: questionId(check_id, test_id), check_id, test_id,
    requirement_ids: [requirement], message: 'm'.repeat(size)}));
  return {model: 'jev-latest', questions: Object.fromEntries(failures.map(row => [row.question_id, structuredClone(question)])),
    state: {schema_version: 'adaptive-inferred-repair-owners/v1', instructions: 'Synthetic raw owner state.', failures,
      failure: {public_evidence: checks.map(check_id => ({check_id, status: 'failed', evidence: {error: null, unexecuted_test_ids: [],
        setup_evidence: {detail: 's'.repeat(500)}, cases: [...failures.filter(row => row.check_id === check_id)
          .map(row => ({test_id: row.test_id, status: 'failed', message: row.message})), {test_id: `${check_id}.ok`, status: 'passed'}]}})),
      local_evidence: [{check_id: 'local.1', status: 'passed', executed: true, evidence: {report_ref: 'receipts/r.json'}}],
      repair_projection: {check_defaults: {}}},
      units: [{id: 'U1', requirement_ids: ['R1', 'R2'], artifact_ids: ['A1'], interface: 'First sentence. Rest of A1.', evidence_ids: ['E1']},
        {id: 'U2', requirement_ids: ['R3'], artifact_ids: ['A2'], interface: 'Second unit. Rest of A2.', evidence_ids: ['E2']}],
      artifacts: [{id: 'A1', evidence_ids: ['E1']}, {id: 'A2', evidence_ids: ['E2']}],
      tasks: [{id: 't1', input_artifact_ids: [], output_artifact_ids: ['A1']}, {id: 't2', input_artifact_ids: ['A1'], output_artifact_ids: ['A2']}],
      requirement_descriptions: ['R1', 'R2', 'R3', 'R9'].map(id => ({id, text: `Requirement ${id}.`})),
      evidence: [{id: 'E1', quote: 'Quote one.'}, {id: 'E2', quote: 'Quote two.'}], causal_paths: []}};
}

test('a raw owner request over the target splits by check into focused parts that each fit', () => {
  const request = rawRequest([['c1', 't1', 'R1', 12000], ['c1', 't2', 'R2', 12000], ['c2', 't3', 'R3', 12000]]);
  const result = plan(request);
  assert.equal(result.report.within_budget, true); assert.equal(result.report.split, true);
  assert.deepEqual(ids(result), [[questionId('c1', 't1'), questionId('c1', 't2')], [questionId('c2', 't3')]]);
  assert.deepEqual(ids(result).flat().sort(), Object.keys(request.questions).sort());
  const second = result.parts[1].request.state;
  assert.deepEqual(second.owner_split, {part: 2, parts: 2, question_ids: [questionId('c2', 't3')], note: second.owner_split.note});
  assert.deepEqual(second.failures.map(row => row.test_id), ['t3']);
  // The sibling check keeps status and its failed IDs only; this part's check stays complete apart from budget steps.
  const sibling = second.failure.public_evidence.find(row => row.check_id === 'c1');
  assert.deepEqual(sibling.evidence, {error: null, unexecuted_test_ids: [], cases: [{test_id: 't1', status: 'failed'},
    {test_id: 't2', status: 'failed'}], sibling_part_summary: true});
  assert.equal(second.failure.public_evidence.find(row => row.check_id === 'c2').evidence.cases[0].message.length, 12000);
  assert.deepEqual(second.requirement_descriptions.map(row => row.id), ['R3']);
  for (const part of result.parts) assert.ok(part.report.within_budget && part.report.omissions.length);
  assert.deepEqual(result.report.original_request, request);
});

test('a raw owner request inside the target is sent whole and unchanged', () => {
  const request = rawRequest([['c1', 't1', 'R1', 100], ['c2', 't2', 'R3', 100]]);
  const result = plan(request);
  assert.equal(result.parts.length, 1); assert.equal(result.report.lossless, true);
  assert.deepEqual(result.parts[0].request, request);
});

test('raw steps apply in order before any split', () => {
  const request = rawRequest([['c1', 't1', 'R1', 100]]);
  request.state.requirement_descriptions.push({id: 'R8', text: 'x'.repeat(60000)});
  const result = plan(request), steps = result.parts[0].report.applied_steps.map(row => row.id);
  assert.equal(result.report.split, false); assert.equal(result.report.within_budget, true);
  assert.deepEqual(steps, ['raw_drop_local_evidence_refs', 'raw_drop_passed_public_cases', 'raw_scope_requirements']);
  assert.deepEqual(result.parts[0].request.state.requirement_descriptions.map(row => row.id), ['R1']);
});

test('one case alone over the target and an unknown state shape stop before sending', () => {
  const alone = plan(rawRequest([['c1', 't1', 'R1', 70000], ['c2', 't2', 'R3', 100]]));
  assert.equal(alone.report.within_budget, false); assert.equal(alone.report.reason, 'SINGLE_CASE_OVER_TARGET');
  assert.deepEqual(alone.parts, []);
  const unknown = {model: 'jev-latest', questions: {q: {type: 'choice', instructions: 'x', criteria: {a: 'a', b: 'b'}}},
    state: {schema_version: 'other/v1', blob: 'b'.repeat(70000)}};
  const stopped = plan(unknown);
  assert.equal(stopped.report.within_budget, false); assert.equal(stopped.report.reason, 'UNPACKABLE_STATE');
  assert.deepEqual(plan({...unknown, state: {schema_version: 'other/v1'}}).parts[0].request.state, {schema_version: 'other/v1'});
});

test('a projected v2 owner request splits on its detailed failed cases and keeps the complete public gate', () => {
  const request = JSON.parse(readFileSync(join(root, 'examples/jev-preflight/inferred-v2.request.json'), 'utf8'));
  const [template] = request.state.detailed_failed_cases, question = Object.values(request.questions)[0];
  request.state.detailed_failed_cases = ['T.one', 'T.two'].map(test_id => ({...structuredClone(template),
    testcase: {...structuredClone(template.testcase), test_id, message: 'v'.repeat(36000)}}));
  request.questions = Object.fromEntries(['T.one', 'T.two'].map(test_id => [questionId(template.check_id, test_id, template.testcase.failed_assertion_id), structuredClone(question)]));
  request.state.public_gate.results[0].failed_test_ids = ['T.one', 'T.two'];
  Object.assign(request.state.public_gate, {case_count: 2, failed_count: 2});
  const result = plan(request);
  assert.equal(result.report.within_budget, true); assert.equal(result.parts.length, 2);
  for (const [index, part] of result.parts.entries()) {
    assert.equal(part.request.state.detailed_failed_cases.length, 1);
    assert.deepEqual(Object.keys(part.request.questions), [Object.keys(request.questions)[index]]);
    assert.deepEqual(part.request.state.public_gate, request.state.public_gate);
  }
});

test('policy versions stay separate and a planned request cannot be planned again', () => {
  const request = rawRequest([['c1', 't1', 'R1', 100]]);
  assert.throws(() => planRepairOwnerRequest(request, {policy: 'repair-budget-v1'}), {code: 'ADAPTIVE_REPAIR_BUDGET_POLICY'});
  assert.throws(() => packRepairOwnerRequest(request, {policy: 'repair-budget-v2'}), {code: 'ADAPTIVE_REPAIR_BUDGET_POLICY'});
  const split = plan(rawRequest([['c1', 't1', 'R1', 16000], ['c2', 't2', 'R3', 16000]]));
  assert.throws(() => plan(split.parts[0].request), {code: 'ADAPTIVE_REPAIR_BUDGET_ALREADY_APPLIED'});
});

test('a v11 or v12 manifest may bind the v2 budget contract by exact path and hash', async t => {
  const {mkdtempSync, writeFileSync, rmSync} = await import('node:fs'), {tmpdir} = await import('node:os');
  const {loadAdaptiveRunManifest, adaptiveRepairBudgetOption} = await import('../src/benchmark/adaptive-dag-runner.mjs');
  const path = 'benchmarks/e2e-swe/manifests/d076-preserved-repair.json', value = JSON.parse(readFileSync(join(root, path), 'utf8'));
  const contract = 'docs/orchestration/contracts/adaptive-repair-budget.v2.json';
  const binding = {policy: 'repair-budget-v2', contract, sha256: sha(readFileSync(join(root, contract)))};
  const directory = mkdtempSync(join(tmpdir(), 'd081-budget-')); t.after(() => rmSync(directory, {recursive: true, force: true}));
  const file = join(directory, 'manifest.json');
  writeFileSync(file, JSON.stringify({...value, repair_budget: binding}));
  assert.deepEqual(adaptiveRepairBudgetOption(loadAdaptiveRunManifest(file, root)), {repairBudget: {policy: 'repair-budget-v2'}});
  for (const wrong of [{...binding, contract: 'docs/orchestration/contracts/adaptive-repair-budget.v1.json'}, {...binding, sha256: '0'.repeat(64)},
    {...binding, policy: 'repair-budget-v3'}]) {
    writeFileSync(file, JSON.stringify({...value, repair_budget: wrong}));
    assert.throws(() => loadAdaptiveRunManifest(file, root), {code: 'ADAPTIVE_REPAIR_BUDGET_BINDING'});
  }
});
