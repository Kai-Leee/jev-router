import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareDecision} from '../src/client.mjs';
import {packRepairOwnerRequest} from '../src/orchestration/adaptive-repair-budget.mjs';
import {assessJevTransmission, jevTransmissionPolicy} from '../src/orchestration/jev-transmission-preflight.mjs';
import {loadAdaptiveRunManifest, adaptiveRepairFeedbackOption, adaptiveWorkerReport} from '../src/benchmark/adaptive-dag-runner.mjs';

const root = resolve(import.meta.dirname, '..');
const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
const line = content => JSON.stringify({type: content[0].type === 'tool_use' ? 'assistant' : 'user', message: {content}});

test('a worker stream yields only denied artifact reads and the capped final statement', () => {
  const stream = [
    JSON.stringify({type: 'system', subtype: 'init'}),
    line([{type: 'tool_use', id: 'a', name: 'mcp__artifact_worker__read_file', input: {path: 'pkg/models.py'}}]),
    line([{type: 'tool_result', tool_use_id: 'a', is_error: true, content: '{"error":"ARTIFACT_READ_NOT_ALLOWED"}'}]),
    line([{type: 'tool_use', id: 'b', name: 'mcp__artifact_worker__read_file', input: {path: 'pkg/enums.py'}}]),
    line([{type: 'tool_result', tool_use_id: 'b', content: [{type: 'text', text: 'ARTIFACT_READ_NOT_ALLOWED appears in the file body'}]}]),
    line([{type: 'tool_use', id: 'c', name: 'mcp__artifact_worker__write_file', input: {path: 'pkg/models.py'}}]),
    line([{type: 'tool_result', tool_use_id: 'c', is_error: true, content: '{"error":"ARTIFACT_WRITE_NOT_ALLOWED"}'}]),
    line([{type: 'tool_use', id: 'd', name: 'mcp__artifact_worker__read_file', input: {path: 'pkg/parser.py'}}]),
    line([{type: 'tool_result', tool_use_id: 'd', is_error: true, content: [{type: 'text', text: '{"error":"ARTIFACT_READ_NOT_ALLOWED"}'}]}]),
    'not json'].join('\n');
  const report = adaptiveWorkerReport(stream, {result: `Cause is in \`pkg/models.py\`. ${'x'.repeat(5000)}`});
  assert.deepEqual(report.denied_read_paths, ['pkg/models.py', 'pkg/parser.py']);
  assert.equal(report.final_response.length, 4000);
  assert.deepEqual(adaptiveWorkerReport('', undefined), {denied_read_paths: [], final_response: ''});
});

test('owner state with worker diagnostics passes the frozen transmission gate before and after budget packing', () => {
  const request = read('examples/jev-preflight/inferred-v2.request.json');
  request.state.worker_diagnostics = {schema_version: 'adaptive-worker-diagnostics/v1',
    basis: 'unverified_statements_of_this_round_repair_workers', entries: [{task_id: 'n7', repaired_artifact_ids: ['A10'],
      denied_read_paths: ['pkg/models.py'], denied_read_artifact_ids: ['A4'], mentioned_artifact_ids: ['A4', 'A10'],
      final_response_excerpt: 'The cause is probably in `pkg/models.py`, which is outside my write scope.'}]};
  const policy = jevTransmissionPolicy();
  const gate = body => assessJevTransmission(body, {stage: 'repair_owners', expectedRequestSha256: sha(prepareDecision(body).serialized),
    expectedPolicySha256: policy.source.sha256});
  const plain = gate(request);
  assert.equal(plain.passed, true, JSON.stringify(plain.reason_codes));
  const {request: packed} = packRepairOwnerRequest(request, {policy: 'repair-budget-v1'});
  assert.deepEqual(packed.state.worker_diagnostics, request.state.worker_diagnostics);
});

test('only the v11 manifest may bind repair feedback, with exact policy values', t => {
  const path = 'benchmarks/e2e-swe/manifests/d076-preserved-repair.json', value = read(path);
  assert.deepEqual(adaptiveRepairFeedbackOption(loadAdaptiveRunManifest(join(root, path), root)),
    {repairFeedback: {read_scope: 'candidate-v1', worker_diagnostics: 'report-v1'}});
  const directory = mkdtempSync(join(tmpdir(), 'd076-feedback-')); t.after(() => rmSync(directory, {recursive: true, force: true}));
  const file = join(directory, 'manifest.json');
  for (const feedback of [{read_scope: 'all'}, {}, {worker_diagnostics: 'report-v1', other: true}, null]) {
    writeFileSync(file, JSON.stringify({...value, repair_feedback: feedback}));
    assert.throws(() => loadAdaptiveRunManifest(file, root), {code: 'ADAPTIVE_REPAIR_FEEDBACK_BINDING'});
  }
  const v10 = read('benchmarks/e2e-swe/manifests/d075-preserved-repair.json');
  writeFileSync(file, JSON.stringify({...v10, repair_feedback: value.repair_feedback}));
  assert.throws(() => loadAdaptiveRunManifest(file, root), {code: 'ADAPTIVE_REPAIR_FEEDBACK_BINDING'});
});
