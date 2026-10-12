import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildAdaptiveRepairScope} from '../src/orchestration/adaptive-repair-scope.mjs';

const source_path = 'benchmarks/e2e-swe/public-checks/assertions.json';
const source_text = readFileSync(new URL('../' + source_path, import.meta.url), 'utf8');
const contract = JSON.parse(source_text);
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => hash(JSON.stringify(canonical(value)));
const assertionContract = {contract, source_text, source_path, sha256: hash(source_text)};
const caseId = 'T.integration.diagnostics';

let witnesses;
function publicWitnesses() {
  if (witnesses) return witnesses;
  // Exercise the real public predicates without installing or running a product.
  // Fake process results are synthetic controls, never product-pass evidence.
  const script = String.raw`
import json, sys, tempfile
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, sys.argv[1])
import run_public_checks as public
from extensions.cli_config import output_policy_checks
results = {}
for defect in ('none', 'accept_existing', 'missing_hook_message', 'unmapped_before', 'unmapped_between'):
    checks = public.Checks()
    with tempfile.TemporaryDirectory(prefix='d069-public-metadata-') as directory:
        class Harness:
            scratch = Path(directory)
            calls = 0
            samples = 0
            def invoke(self, fixture, *options, **kwargs):
                self.calls += 1
                assert kwargs.get('installed') is True
                if self.calls == 1:
                    output = Path(options[options.index('--output-path') + 1])
                    assert output.is_dir() and not list(output.iterdir())
                    assert '--overwrite' not in options
                    code = 0 if defect == 'accept_existing' else 1
                else:
                    code = 0
                message = '' if defect == 'missing_hook_message' else 'd065-public-command-does-not-exist-7826'
                return self.scratch, SimpleNamespace(returncode=code, stdout=message, stderr='')
            def sample(self, output):
                self.samples += 1
                if defect == 'unmapped_between':
                    checks.require(False, 'unmapped generated-code failure')
        harness = Harness()
        def run():
            if defect == 'unmapped_before':
                checks.require(False, 'unmapped earlier failure')
            output_policy_checks(harness, checks, {}, harness.sample)
        checks.case('T.integration.diagnostics', run)
        results[defect] = {'case': checks.cases[0], 'calls': harness.calls, 'samples': harness.samples}
print(json.dumps({'results': results, 'contract_sha256': public.ASSERTION_CONTRACT_SHA256,
                  'check_version': public.CHECK_VERSION, 'test_count': sum(map(len, public.SUITES.values()))}))
`;
  const run = spawnSync('python3', ['-I', '-B', '-c', script, resolve('benchmarks/e2e-swe/public-checks')],
    {encoding: 'utf8', timeout: 20_000, env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
  assert.equal(run.status, 0, run.stdout + run.stderr);
  witnesses = JSON.parse(run.stdout);
  return witnesses;
}

function fixture(name = 'accept_existing') {
  const plan = {graph_revision: 'graph-1', tasks: [
    {id: 'core', kind: 'implementation', requirement_ids: ['R03.04', 'R-unrelated'], input_artifact_ids: [], output_artifact_ids: ['cli', 'models']},
    {id: 'hooks', kind: 'implementation', requirement_ids: ['R17.01'], input_artifact_ids: [], output_artifact_ids: ['hooks']},
    {id: 'generator', kind: 'implementation', requirement_ids: ['R-generator'], input_artifact_ids: ['cli'], output_artifact_ids: ['generator']},
  ], artifacts: [{id: 'cli', producer_task_id: 'core'}, {id: 'models', producer_task_id: 'core'},
    {id: 'hooks', producer_task_id: 'hooks'}, {id: 'generator', producer_task_id: 'generator'}]};
  const artifactBindings = {cli: {paths: ['pyclientgen/cli.py', 'pyclientgen/__main__.py']}, models: {paths: ['pyclientgen/models.py']},
    hooks: {paths: ['pyclientgen/hooks.py']}, generator: {paths: ['pyclientgen/generator.py']}};
  const environment = {id: 'public-test-env', fingerprint: hash('environment')};
  const publicChecks = [{id: 'public.cli-config-environment', version: '3', environment_ref: environment.id,
    requirement_ids: ['R03.04', 'R17.01']}];
  const failure = {status: 'failed', outcome_uncertain: false, failed_task_ids: [], graph_revision: plan.graph_revision,
    environment, artifact_revisions: Object.fromEntries(plan.artifacts.map(a => [a.id, hash(a.id)])), public_evidence: []};
  const input = {plan, artifactBindings, publicChecks, failure, testRequirements: {[caseId]: ['R03.04', 'R17.01']},
    assertionContract: structuredClone(assertionContract), runtimeBinding: {schema_version: 'dag-filesystem-binding/v1',
      checker_manifest: [{path: source_path, sha256: hash(source_text)}], plan, environment, artifact_bindings: artifactBindings}};
  const report = {check_id: publicChecks[0].id, check_version: '3', environment_ref: environment.id, outcome_uncertain: false,
    assertion_contract_sha256: publicWitnesses().contract_sha256,
    cases: [structuredClone(publicWitnesses().results[name].case)], unexecuted_test_ids: [], error: null};
  failure.public_evidence = [{check_id: report.check_id, check_version: '3', environment_ref: environment.id,
    status: 'failed', outcome_uncertain: false, artifact_revisions: structuredClone(failure.artifact_revisions), evidence: report}];
  seal(input);
  return input;
}

function seal(input) {
  const {runtimeBinding: binding, plan, artifactBindings, failure} = input;
  binding.plan_hash = digest(plan);
  binding.binding_digest = digest({pinManifest: binding.checker_manifest, environment: binding.environment,
    plan_hash: binding.plan_hash, artifact_bindings: artifactBindings});
  failure.binding_digest = binding.binding_digest;
  for (const item of failure.public_evidence) {
    item.runtime_binding = {binding_digest: binding.binding_digest, checker_manifest_sha256: digest(binding.checker_manifest),
      environment_fingerprint: binding.environment.fingerprint, plan_hash: binding.plan_hash};
    item.evidence_key = digest({check_id: item.check_id, check_version: item.check_version,
      artifact_revisions: item.artifact_revisions, runtime_binding: item.runtime_binding});
  }
}

test('public predicates retain normal/failing outcomes and distinguish later internal not-reached assertions', () => {
  const actual = publicWitnesses(), ids = contract.assertions.map(item => item.id);
  assert.equal(actual.test_count, 85);
  assert.equal(actual.check_version, '3');
  assert.equal(actual.contract_sha256, assertionContract.sha256);
  assert.deepEqual(actual.results.none.case.assertion_results.map(row => row.status), ['passed', 'passed', 'passed', 'passed']);
  assert.equal(actual.results.none.case.assertions, 4);
  assert.deepEqual([actual.results.none.calls, actual.results.none.samples], [3, 2]);
  const failed = actual.results.accept_existing;
  assert.equal(failed.case.status, 'failed');
  assert.equal(failed.case.message, 'existing output refused');
  assert.equal(failed.case.failed_assertion_id, ids[0]);
  assert.equal(failed.case.assertions, 1);
  assert.deepEqual(failed.case.assertion_results.map(row => row.status), ['failed', 'not_reached', 'not_reached', 'not_reached']);
  assert.deepEqual([failed.calls, failed.samples], [1, 0]);
  assert.equal(actual.results.missing_hook_message.case.failed_assertion_id, ids[3]);
  assert.deepEqual(actual.results.unmapped_between.case.assertion_results.map(row => row.status), ['passed', 'passed', 'not_reached', 'not_reached']);
  assert.equal(actual.results.unmapped_between.case.failed_assertion_id, undefined);
  assert(actual.results.unmapped_before.case.assertion_results.every(row => row.status === 'not_reached'));
});

test('bound public failure selects one artifact of a large owner and adds only declared consumers', async () => {
  const input = fixture(), before = structuredClone(input);
  const {candidates, analysis} = await buildAdaptiveRepairScope(input);
  assert.deepEqual(input, before);
  assert.deepEqual(candidates.map(c => [c.task_ids, c.artifact_ids]), [[['core'], ['cli']], [['core', 'generator'], ['cli', 'generator']]]);
  assert.equal(analysis.observed_failures[0].assertion_id, contract.assertions[0].id);
  assert.equal(analysis.observed_failures[0].evidence_level, 'assertion');
  assert.equal(analysis.observed_failures[0].artifact_revisions.cli, input.failure.artifact_revisions.cli);
  assert.equal(analysis.observed_failures[0].source_ref.contract_sha256, hash(source_text));
  assert.equal(analysis.not_reached_assertions[0].assertion_ids.length, 3);
  assert.equal(analysis.fallback_required, false);
  assert.match(candidates[0].reason, /not proof/);
  const hook = await buildAdaptiveRepairScope(fixture('missing_hook_message'));
  assert.deepEqual(hook.candidates[0].artifact_ids, ['hooks']);
});

test('unmapped failures before or between tracked assertions conservatively retain whole task outputs', async () => {
  for (const name of ['unmapped_before', 'unmapped_between']) {
    const {candidates, analysis} = await buildAdaptiveRepairScope(fixture(name));
    assert.equal(analysis.fallback_required, true);
    assert.equal(analysis.unresolved[0].reason, 'ASSERTION_FAILURE_UNMAPPED');
    assert.equal(analysis.observed_failures[0].evidence_level, 'case_fallback');
    assert.deepEqual(candidates[0].artifact_ids, ['cli', 'models', 'hooks']);
    assert.deepEqual(analysis.observed_failure_owner_task_ids, ['core', 'hooks']);
  }
});

test('incomplete, stale or ambiguous assertion evidence cannot authorize narrower writes', async t => {
  for (const [name, mutate] of [
    ['missing declaration result', x => x.failure.public_evidence[0].evidence.cases[0].assertion_results.pop()],
    ['duplicate assertion ID', x => x.failure.public_evidence[0].evidence.cases[0].assertion_results[1].assertion_id = contract.assertions[0].id],
    ['report contract drift', x => x.failure.public_evidence[0].evidence.assertion_contract_sha256 = '0'.repeat(64)],
    ['parsed contract differs from bytes', x => x.assertionContract.contract.assertions[0].artifact_paths = ['pyclientgen/hooks.py']],
    ['runtime checker drift', x => x.failure.public_evidence[0].runtime_binding.checker_manifest_sha256 = '0'.repeat(64)],
    ['artifact revision drift', x => x.failure.public_evidence[0].artifact_revisions.cli = '0'.repeat(64)],
    ['ambiguous artifact path', x => {x.artifactBindings.models.paths.push('pyclientgen/cli.py'); seal(x);}],
  ]) await t.test(name, async () => {
    const input = fixture(); mutate(input);
    const {candidates, analysis} = await buildAdaptiveRepairScope(input);
    assert.equal(analysis.fallback_required, true);
    assert(analysis.observed_failures.every(row => row.evidence_level === 'case_fallback'));
    assert.deepEqual(candidates[0].artifact_ids, ['cli', 'models', 'hooks']);
  });
});

test('an additional unmapped failure on the same owner keeps its unrelated outputs in the repair scope', async () => {
  const input = fixture();
  input.testRequirements['T.other'] = ['R03.04'];
  input.failure.public_evidence[0].evidence.cases.push({test_id: 'T.other', status: 'failed', assertions: 1,
    error_type: 'AssertionError', message: 'another observed requirement failure'});
  const {candidates, analysis} = await buildAdaptiveRepairScope(input);
  assert.equal(analysis.observed_failures[0].evidence_level, 'assertion');
  assert.equal(analysis.observed_failures[1].evidence_level, 'case_fallback');
  assert.equal(analysis.fallback_required, true);
  assert.deepEqual(candidates[0].task_ids, ['core']);
  assert.deepEqual(candidates[0].artifact_ids, ['cli', 'models']);
  assert(candidates.every(candidate => !candidate.task_ids.includes('hooks')));
});
