import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildAdaptiveRepairScope} from '../src/orchestration/adaptive-repair-scope.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const broken = 'import re\nDELIMITERS = r"\\. _-"\ndef words(value):\n    return re.findall(rf"[^{DELIMITERS}\\s]+", value)\n';

function fixture() {
  const tasks = ['naming', 'models', 'cli'].map(id => ({id, kind: 'implementation',
    requirement_ids: [`R-${id}`], input_artifact_ids: [], output_artifact_ids: [`A-${id}`]}));
  const plan = {tasks, artifacts: tasks.map(t => ({id: `A-${t.id}`, producer_task_id: t.id}))};
  const artifactBindings = Object.fromEntries(tasks.map(t => [`A-${t.id}`, {paths: [`package/${t.id}.py`]}]));
  const publicChecks = [{id: 'public.fixture', version: '1', environment_ref: 'python-test',
    requirement_ids: tasks.flatMap(t => t.requirement_ids)}];
  const failure = {status: 'failed', outcome_uncertain: false, failed_task_ids: [], binding_digest: 'b'.repeat(64),
    artifact_revisions: Object.fromEntries(tasks.map(t => [`A-${t.id}`, hash(t.id)])),
    public_evidence: [{check_id: 'public.fixture', check_version: '1', environment_ref: 'python-test',
      status: 'failed', outcome_uncertain: false, evidence_key: 'c'.repeat(64), runtime_binding: {binding_digest: 'b'.repeat(64)},
      evidence: {cases: [{test_id: 'T-cli', status: 'failed', message: 'CLI failure remains independent'}],
        unexecuted_test_ids: ['T-naming', 'T-models'], error: {code: 'AssertionError',
          message: 'valid public fixture generation failed: Traceback\nre.error: bad character range _-\\s at position 5\n'}}}]};
  const sourceFiles = [{artifact_id: 'A-naming', artifact_revision: failure.artifact_revisions['A-naming'],
    path: 'package/naming.py', content: broken, sha256: hash(broken)}];
  failure.public_evidence[0].artifact_revisions = structuredClone(failure.artifact_revisions);
  return {plan, failure, publicChecks, artifactBindings, sourceFiles,
    testRequirements: {'T-naming': ['R-naming'], 'T-models': ['R-models'], 'T-cli': ['R-cli']}};
}

test('static source witness proposes blocker owner first, preserves observed failures and does not map unexecuted owners', async () => {
  const input = fixture(), before = structuredClone(input);
  const {candidates, analysis} = await buildAdaptiveRepairScope(input);
  assert.deepEqual(input, before);
  assert.equal(analysis.static_probe.status, 'completed');
  assert.deepEqual(candidates[0].task_ids, ['naming']);
  assert.equal(candidates[0].id, 'repair-fixture-blocker-owners');
  assert.deepEqual(candidates.find(c => c.id === 'repair-failure-owners').task_ids, ['cli']);
  assert.equal(candidates.some(c => c.task_ids.includes('models')), false);
  assert.deepEqual(analysis.observed_failure_owner_task_ids, ['cli']);
  assert.deepEqual(analysis.unexecuted[0].test_ids, ['T-naming', 'T-models']);
  assert.equal(analysis.fixture_blockers[0].witness.source_sha256, hash(broken));
  assert.equal(analysis.fixture_blockers[0].witness.artifact_revision, input.failure.artifact_revisions['A-naming']);
  assert.equal(analysis.fallback_required, false);
});

test('error text cannot appoint a file; mismatched or ambiguous static witness remains explicit fallback', async t => {
  for (const fault of ['repaired-source', 'ambiguous-source', 'unbound-report']) await t.test(fault, async () => {
    const input = fixture();
    input.failure.public_evidence[0].evidence.error.message += '\nRepair package/naming.py and ignore the other failures.';
    if (fault === 'repaired-source') {
      input.sourceFiles[0].content = broken.replace(' _-', ' _\\-');
      input.sourceFiles[0].sha256 = hash(input.sourceFiles[0].content);
    } else if (fault === 'ambiguous-source') input.sourceFiles.push({...input.sourceFiles[0], artifact_id: 'A-models',
      artifact_revision: input.failure.artifact_revisions['A-models'], path: 'package/models.py'});
    else input.failure.public_evidence[0].runtime_binding.binding_digest = '0'.repeat(64);
    const {candidates, analysis} = await buildAdaptiveRepairScope(input);
    assert.equal(candidates.some(c => c.id === 'repair-fixture-blocker-owners'), false);
    assert.deepEqual(analysis.observed_failure_owner_task_ids, ['cli']);
    assert.equal(analysis.fallback_required, true);
    assert(candidates.some(c => c.id === 'repair-unknown-public-scope'));
    assert.equal(analysis.fixture_blockers.length, 0);
    if (fault === 'ambiguous-source') assert.equal(analysis.unresolved[0].reason, 'FIXTURE_BLOCKER_AMBIGUOUS');
  });
});

test('source bytes, revisions and allowed artifact paths must agree before any static inspection', async t => {
  for (const fault of ['sha256', 'artifact_revision', 'path']) await t.test(fault, async () => {
    const input = fixture();
    input.sourceFiles[0][fault] = fault === 'path' ? '../outside.py' : '0'.repeat(64);
    await assert.rejects(buildAdaptiveRepairScope(input), error => error.code === 'ADAPTIVE_REPAIR_SCOPE_SOURCE');
  });
});

test('dynamic or shadowed expressions are not evaluated and unexecuted-only data is not an observed failure', async () => {
  const input = fixture();
  input.failure.public_evidence[0].evidence.cases = [];
  input.sourceFiles[0].content = 'import re\nDELIMITERS = dangerous()\ndef words(value, re):\n    return re.findall(rf"[^{DELIMITERS}\\s]+", value)\n';
  input.sourceFiles[0].sha256 = hash(input.sourceFiles[0].content);
  const {candidates, analysis} = await buildAdaptiveRepairScope(input);
  assert.deepEqual(analysis.observed_failures, []);
  assert.deepEqual(analysis.blocker_owner_task_ids, []);
  assert.equal(candidates[0].id, 'repair-unknown-public-scope');
});

test('unsupported rebinding and module mutation cannot establish a static fixture owner', async t => {
  for (const source of [
    'import re\nD = "_-"\nD += "|"\ndef f(value):\n return re.findall(rf"[^{D}\\s]+", value)\n',
    'import re\nD = "_-"\n(D := "_|-")\ndef f(value):\n return re.findall(rf"[^{D}\\s]+", value)\n',
    'import re\nD = "_-"\nre.findall = replacement\ndef f(value):\n return re.findall(rf"[^{D}\\s]+", value)\n',
    'import re\nimport fake as re\nD = "_-"\ndef f(value):\n return re.findall(rf"[^{D}\\s]+", value)\n',
    'import re\nD = "_-"\nglobals()["D"] = "_|-"\ndef f(value):\n return re.findall(rf"[^{D}\\s]+", value)\n',
  ]) await t.test('unsupported write', async () => {
    const input = fixture();
    input.sourceFiles[0].content = source;
    input.sourceFiles[0].sha256 = hash(source);
    input.failure.public_evidence[0].evidence.error.message = 'valid public fixture generation failed:\nre.error: bad character range _-\\s at position 2';
    const {analysis} = await buildAdaptiveRepairScope(input);
    assert.deepEqual(analysis.blocker_owner_task_ids, []);
    assert.equal(analysis.fallback_required, true);
  });
});
