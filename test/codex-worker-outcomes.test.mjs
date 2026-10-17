import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {buildCodexWorkerOutcomes, projectWorkerOutcomeEvidence, verifyHistoryEvidence, verifyHistorySources,
  verifyEmpiricalEvidence} from '../src/benchmark/codex-worker-outcomes.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const jsonHash = value => hash(JSON.stringify(value));
const reseal = value => {const {sha256, ...body} = value; return {...body, sha256: jsonHash(body)};};

function fixture(t, {statuses = ['failed', 'passed', null], badBinding = false, mutateFile = false, providerPromptOnly = false} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'worker-history-')); t.after(() => rmSync(dir, {recursive: true, force: true}));
  const put = (path, data) => {const abs = join(dir, path); mkdirSync(join(abs, '..'), {recursive: true});
    writeFileSync(abs, typeof data === 'string' ? data : JSON.stringify(data)); return abs;};
  const task = {id: 'task1', write_scope: ['src/a.py'], requirement_ids: ['R1'], output_artifact_ids: ['A1']};
  put('planning.json', {source_sha256: 'source', artifactBindings: {A1: {paths: ['src/a.py']}}});
  const rounds = statuses.map((status, index) => {
    const candidate = join(dir, `round-${index}/candidate`), content = index ? 'repaired' : 'original';
    put(`round-${index}/candidate/src/a.py`, mutateFile && index === 1 ? 'unrelated' : content);
    const packet = {task, operation: index ? 'repair' : 'implementation', round_index: index,
      execution_model: {model: 'model-a', effort: 'high'}, input_artifact_revisions: {A1: index ? 'original-rev' : 'empty'},
      available_files: index ? [{path: 'src/a.py', sha256: hash(index === 1 ? 'original' : 'repaired')}] : [],
      artifact_repair: index ? {failure: {test_id: 'T1', message: 'still not good'}, verified_repair_context: {source: 'checked'}} : undefined};
    if (!providerPromptOnly) put(`codex-workers/worker-${index}/worker-input-original.json`, packet);
    put(`codex-workers/worker-${index}/provider/request.json`, {model: 'model-a', effort: 'high', prompt: 'Fixed instruction\n' + JSON.stringify(packet)});
    put(`codex-workers/worker-${index}/receipt.json`, {task_id: task.id, round_index: index, operation: packet.operation,
      requested_model: 'model-a', requested_effort: 'high', status: 'completed', outcome_uncertain: false,
      files: [{path: 'src/a.py', sha256: hash(content)}], provider: {wall_ms: 12, usage: {input_tokens: 50, cached_input_tokens: 30, output_tokens: 10}}});
    return {round_index: index, exported: {candidateDirectory: candidate, artifact_revisions: {A1: `revision-${index}`}, binding_digest: `binding-${index}`},
      public_evidence: [{executed: status !== null, outcome_uncertain: false, check_id: 'public.c1',
        artifact_revisions: {A1: `revision-${index}`}, runtime_binding: {binding_digest: badBinding && index === 1 ? 'wrong' : `binding-${index}`},
        evidence: {cases: status ? [{test_id: 'T1', status, message: 'public assertion'}] : [], unexecuted_test_ids: status ? [] : ['T1']}}]};
  });
  put('execution.json', {rounds, independent_grade: {secret_must_not_appear: true}});
  put('result.json', 'not valid JSON; this file must never be read');
  const snapshot = buildCodexWorkerOutcomes({arms: [{id: 'fixture', directory: dir}], testRequirements: [{test_id: 'T1', requirement_ids: ['R1']}]});
  return {dir, task, snapshot, put};
}

test('revision-bound public transitions preserve failure, success, unexecuted unknown and rework', t => {
  const {snapshot} = fixture(t);
  assert.deepEqual(snapshot.profiles[0].public_success, {success: 1, failure: 1, unknown: 1, denominator: 3, known_denominator: 2, rate: .5});
  assert.equal(snapshot.observations[1].transitions.failed_to_passed, 1);
  assert.equal(snapshot.profiles[0].case_transitions.denominator, 3);
  assert.equal(snapshot.profiles[0].case_transitions.observed_after, 2);
  assert.equal(snapshot.observations[2].noop, true);
  assert.equal(snapshot.observations[0].later_repair, true);
  assert.equal(snapshot.profiles[0].input_tokens.sum, 150); // Cached input is already included; do not add it again.
  assert.equal(snapshot.profiles[0].model_identity.verified, 0);
  assert.equal(verifyHistorySources(snapshot).sources, snapshot.source_refs.length);
  assert.ok(!JSON.stringify(snapshot).includes('secret_must_not_appear'));
  assert.ok(snapshot.source_refs.every(ref => !ref.path.endsWith('/result.json')));
});

test('mismatching public revision binding or actual output bytes becomes unknown', t => {
  const a = fixture(t, {badBinding: true, statuses: ['failed', 'passed']});
  assert.equal(a.snapshot.observations[1].public_outcome, 'unknown');
  const b = fixture(t, {mutateFile: true, statuses: ['failed', 'passed']});
  assert.equal(b.snapshot.observations[1].files_bound, false);
  assert.equal(b.snapshot.observations[1].public_outcome, 'unknown');
});

test('legacy prompt packet and unseen effort have explicit unknown denominators', t => {
  const {snapshot, task} = fixture(t, {providerPromptOnly: true});
  const profiles = [{model: 'model-a', effort: 'high'}, {model: 'model-a', effort: 'low'}];
  const summary = projectWorkerOutcomeEvidence(snapshot, {task, operation: 'repair', profiles});
  assert.equal(summary.profiles[1].global.samples, 0);
  assert.equal(summary.profiles[1].global.public_success.rate, null);
  assert.equal(summary.profiles[0].exact_scope.samples, 2);
  assert.ok(!JSON.stringify(summary).includes('/worker-history-'));
  assert.equal(verifyEmpiricalEvidence(summary, {snapshot, task, operation: 'repair', profiles}), true);
  const tampered = structuredClone(summary); tampered.profiles[0].global.public_success.success++;
  const {evidence_sha256, ...body} = tampered; tampered.evidence_sha256 = jsonHash(body);
  assert.throws(() => verifyEmpiricalEvidence(tampered, {snapshot, task, operation: 'repair', profiles}), /EMPIRICAL_BINDING/);
});

test('trusted snapshot hash, computed aggregates and source content are checked independently', t => {
  const {snapshot} = fixture(t);
  assert.throws(() => verifyHistoryEvidence(snapshot, {expectedSha256: 'wrong'}), /HISTORY_BINDING/);
  const forged = structuredClone(snapshot); forged.profiles[0].samples++;
  assert.throws(() => verifyHistoryEvidence(reseal(forged)), /AGGREGATE_BINDING/);
  const ref = snapshot.source_refs[0]; writeFileSync(ref.path, Buffer.concat([readFileSync(ref.path), Buffer.from(' ')]));
  assert.throws(() => verifyHistorySources(snapshot), /SOURCE_CHANGED/);
});

test('changed verified evidence is a distinct input signature; identical failed repair is identifiable', t => {
  const {dir, put} = fixture(t, {statuses: ['failed', 'failed', 'failed', 'failed']});
  for (const index of [1, 2, 3]) {
    const path = join(dir, `codex-workers/worker-${index}/worker-input-original.json`), packet = JSON.parse(readFileSync(path));
    packet.available_files = [{path: 'src/a.py', sha256: hash('repaired')}];
    if (index === 3) packet.artifact_repair.verified_repair_context = {source: 'newly checked'};
    put(`codex-workers/worker-${index}/worker-input-original.json`, packet);
  }
  const snapshot = buildCodexWorkerOutcomes({arms: [{id: 'fixture', directory: dir}], testRequirements: [{test_id: 'T1', requirement_ids: ['R1']}]});
  assert.equal(snapshot.observations[2].repeat_input, true);
  assert.equal(snapshot.observations[3].repeat_input, false);
  assert.equal(snapshot.observations[2].noop, true);
  assert.equal(snapshot.profiles[0].ineffective_noop.count, 3);
});
