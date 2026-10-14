import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {ownerProbabilityAlternatives, selectInferredOwnerScope, ALTERNATIVES_UNION_ID, EXPANDED_UNION_ID} from '../src/orchestration/adaptive-inferred-scope.mjs';
import {blockedCheckErrors, checkErrorCandidate, CHECK_ERROR_CANDIDATE_ID} from '../src/orchestration/adaptive-check-error-repair.mjs';
import {loadAdaptiveRunManifest} from '../src/benchmark/adaptive-dag-runner.mjs';

const root = resolve(import.meta.dirname, '..');
const manifests = join(root, 'benchmarks/e2e-swe/manifests');
const ids = Array.from({length: 22}, (_, index) => `A${String(index + 1).padStart(2, '0')}`);
const plan = {artifacts: ids.map(id => ({id})), tasks: []};
const answer = (choice, rest) => ({type: 'choice', choice, probabilities: Object.fromEntries([...ids, 'unknown'].map(id => [id, rest[id] ?? 0]))});

test('owner-probability-v1 adds the close secondary owner of the request-body description failure (d082-cloud-04 round 0 shape)', () => {
  const assignments = ['q1', 'q2'].map(question_id => ({question_id, status: 'inferred', artifact_id: 'A14'}));
  const answers = {q1: answer('A14', {A14: 0.62, A19: 0.31, A07: 0.03}), q2: answer('A14', {A14: 0.54, A19: 0.39, A07: 0.03})};
  const expanded = ownerProbabilityAlternatives({baseArtifactIds: ['A14'], plan, assignments, answers});
  assert.deepEqual(expanded.artifact_ids, ['A14', 'A19']);
  assert.deepEqual(expanded.info.failure_counts, {A19: 2});
  assert.equal(expanded.info.basis, 'jev_secondary_probabilities_not_fault_proof');
});

test('owner-probability-v1 ignores unknown, low and already-included artifacts, unknown answers, and caps additions at two', () => {
  const assignments = [{question_id: 'q1', status: 'inferred', artifact_id: 'A07'}, {question_id: 'q2', status: 'unknown', artifact_id: null}];
  // A21 at 0.36 vs 0.44 qualifies; unknown and A14 at 0.12 do not; q2 is unknown so its probabilities are ignored.
  const answers = {q1: answer('A07', {A07: 0.44, A21: 0.36, A14: 0.12, unknown: 0.2}), q2: answer('unknown', {unknown: 0.5, A03: 0.45})};
  assert.deepEqual(ownerProbabilityAlternatives({baseArtifactIds: ['A07'], plan, assignments, answers}).info.added_artifact_ids, ['A21']);
  assert.equal(ownerProbabilityAlternatives({baseArtifactIds: ['A07', 'A21'], plan, assignments, answers}), null);
  const wide = {q1: answer('A01', {A01: 0.34, A02: 0.33, A03: 0.32, A04: 0.31})};
  assert.equal(ownerProbabilityAlternatives({baseArtifactIds: ['A01'], plan, assignments: [{question_id: 'q1', status: 'inferred', artifact_id: 'A01'}],
    answers: wide}).info.added_artifact_ids.length, 2);
  assert.equal(ownerProbabilityAlternatives({baseArtifactIds: ['A07'], plan, assignments, answers: {}}), null);
});

test('the scope rule prefers worker-mentioned, then owner alternatives, then the plain union', () => {
  const union = {id: 'repair-inferred-owners'}, alternatives = {id: ALTERNATIVES_UNION_ID}, mentioned = {id: EXPANDED_UNION_ID};
  assert.equal(selectInferredOwnerScope({candidates: [union, alternatives, mentioned]}).candidate_id, EXPANDED_UNION_ID);
  assert.equal(selectInferredOwnerScope({candidates: [union, alternatives]}).candidate_id, ALTERNATIVES_UNION_ID);
});

test('check-error repair selects the generator and template artifacts of the D066 catalog for import or syntax errors only', () => {
  // Paths of the D066 shared catalog (benchmark-runs is not tracked).
  const bindings = {A07: {paths: ['pyclientgen/ir.py']}, A14: {paths: ['pyclientgen/schema/operations.py']},
    A16: {paths: ['pyclientgen/templates/types.py.jinja', 'pyclientgen/templates/package_init.py.jinja']},
    A17: {paths: ['pyclientgen/templates/client.py.jinja', 'pyclientgen/templates/errors.py.jinja']},
    A18: {paths: ['pyclientgen/templates/model.py.jinja', 'pyclientgen/templates/models_init.py.jinja']},
    A19: {paths: ['pyclientgen/templates/endpoint_module.py.jinja', 'pyclientgen/templates/api_init.py.jinja']},
    A20: {paths: ['pyclientgen/metadata.py', 'pyclientgen/templates/setup.py.jinja']}, A21: {paths: ['pyclientgen/generator.py']}};
  const catalogPlan = {artifacts: Object.keys(bindings).map(id => ({id})),
    tasks: [{id: 'n1', kind: 'implementation', output_artifact_ids: ['A16', 'A17', 'A18']}, {id: 'n2', kind: 'implementation', output_artifact_ids: ['A19', 'A20', 'A21']},
      {id: 'n3', kind: 'implementation', output_artifact_ids: ['A14']}]};
  const report = (check_id, code) => ({check_id, status: 'failed', evidence: {error: {code, message: 'm'}, unexecuted_test_ids: ['t1']}});
  const failure = {public_evidence: [report('public.schema-models', 'SyntaxError'), report('public.http-client', 'ModuleNotFoundError'),
    report('public.cli', 'AssertionError'), {check_id: 'public.ok', status: 'passed', evidence: {error: null}}]};
  const errors = blockedCheckErrors(failure);
  assert.deepEqual(errors.map(row => row.check_id), ['public.schema-models', 'public.http-client']);
  const candidate = checkErrorCandidate({plan: catalogPlan, artifactBindings: bindings, errors});
  assert.equal(candidate.id, CHECK_ERROR_CANDIDATE_ID);
  assert.deepEqual(candidate.artifact_ids, ['A16', 'A17', 'A18', 'A19', 'A20', 'A21']);
  assert.deepEqual(candidate.task_ids, ['n1', 'n2']);
  assert.equal(checkErrorCandidate({plan: catalogPlan, artifactBindings: bindings, errors: []}), null);
});

test('d085 manifest differs from d083 only in the two new repair_feedback values and semantics', () => {
  const raw = name => JSON.parse(readFileSync(join(manifests, name), 'utf8'));
  const {repair_feedback: feedback, session_semantics: _a, ...rest85} = raw('d085-direct-repair.json');
  const {repair_feedback: feedback83, session_semantics: _b, ...rest83} = raw('d083-repair-fixes.json');
  assert.deepEqual(rest85, rest83);
  assert.deepEqual(feedback, {...feedback83, owner_alternatives: 'owner-probability-v1', check_error_repair: 'generation-direct-v1'});
  assert.equal(loadAdaptiveRunManifest(join(manifests, 'd085-direct-repair.json'), root).repair_feedback.check_error_repair, 'generation-direct-v1');
});

test('an unknown repair_feedback value is rejected', t => {
  const dir = mkdtempSync(join(tmpdir(), 'd085-manifest-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const manifest = JSON.parse(readFileSync(join(manifests, 'd085-direct-repair.json'), 'utf8'));
  manifest.repair_feedback.owner_alternatives = 'owner-probability-v2';
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  assert.throws(() => loadAdaptiveRunManifest(join(dir, 'manifest.json'), root), /ADAPTIVE_REPAIR_FEEDBACK_BINDING/);
});

test('the diagnosis script compiles', () => {
  execFileSync('python3', ['-m', 'py_compile', join(root, 'scripts/diagnose-check-error.py')]);
});
