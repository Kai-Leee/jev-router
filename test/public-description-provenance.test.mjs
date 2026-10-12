import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const base = resolve('benchmarks/e2e-swe/public-checks');
const json = path => JSON.parse(readFileSync(join(base, path), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const registry = json('registry.v4.json');
const contract = json('assertions.v2.json');
const protocol = json('description-provenance.v1.json');
const ids = protocol.tests.map(row => row.id);
function python(args) {
  const run = spawnSync('python3', ['-B', ...args], {encoding: 'utf8', timeout: 20_000,
    env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
  assert(!run.error, run.error?.message);
  return run;
}

test('v4 adds exactly eight R10.02 cases and twelve bound assertions without changing legacy85 predicates or IDs', () => {
  const legacy = python([join(base, 'run_public_checks.py'), '--list']);
  const current = python([join(base, 'run_public_checks_v4.py'), '--list']);
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.equal(current.status, 0, current.stderr);
  const oldSuites = JSON.parse(legacy.stdout), newSuites = JSON.parse(current.stdout);
  assert.equal(Object.values(oldSuites).flat().length, 85);
  assert.equal(Object.values(newSuites).flat().length, 93);
  for (const [suite, tests] of Object.entries(oldSuites)) assert.deepEqual(newSuites[suite], tests);
  assert.deepEqual(newSuites['description-provenance'], ids);
  assert.equal(contract.version, '2');
  assert.deepEqual(contract.assertions.slice(0, 4), json('assertions.json').assertions);
  assert.equal(contract.assertions.length, 12);
  assert.equal(new Set(registry.flatMap(row => row.test_ids)).size, 93);
  const inventory = json('inventory.v4.json'), oldInventory = json('inventory.json');
  assert.equal(inventory.rows.length, 93);
  assert.deepEqual(inventory.rows.slice(0, 85).map(({case_refs, ...row}) => row),
    oldInventory.rows.map(({case_refs, ...row}) => row));
  assert.deepEqual(inventory.rows.slice(85).map(row => row.test_id), ids);
  for (const check of registry) {
    assert.equal(check.version, '4');
    assert.equal(check.runner_ref, 'benchmarks/e2e-swe/public-checks/run_public_checks_v4.py');
    assert.deepEqual(check.test_ids, newSuites[check.id.slice(7)]);
  }
  for (const [index, row] of contract.assertions.slice(4).entries()) {
    assert.equal(row.test_id, ids[index]);
    assert.equal(row.id, protocol.tests[index].assertion_id);
    assert.deepEqual(row.requirement_ids, ['R10.02']);
    assert.deepEqual(row.artifact_paths, ['pyclientgen/templates/endpoint_module.py.jinja']);
    assert.deepEqual(row.causal_paths.map(item => item.role), ['producer', 'representation', 'renderer', 'renderer']);
  }
});

test('real public control commands separate request and schema text and catch one runtime-mutated function in each scenario', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'd071-public-description-'));
  try {
    for (const [defect, failures] of [['none', 0], ['schema-description', 8], ['runtime-rewrite', 2]]) {
      const binding = json('bindings/descriptions.normal.json');
      binding.command[binding.command.indexOf('--defect') + 1] = defect;
      if (defect !== 'none') binding.kind = 'authored_defective_local_control';
      const path = join(temporary, defect + '.json');
      writeFileSync(path, JSON.stringify(binding));
      const run = python([join(base, 'run_public_checks_v4.py'), '--suite', 'description-provenance', '--binding', path]);
      assert.equal(run.status, failures ? 1 : 0, run.stdout + run.stderr);
      const report = JSON.parse(run.stdout);
      assert.equal(report.check_version, '4');
      assert.equal(report.assertion_contract_sha256, hash(readFileSync(join(base, 'assertions.v2.json'))));
      assert.equal(report.error, null);
      assert.equal(report.skipped, 0);
      assert.equal(report.assertions, 8);
      assert.deepEqual(report.cases.map(row => row.test_id), ids);
      assert.equal(report.cases.filter(row => row.status === 'failed').length, failures);
      assert.equal(report.candidate_invocations.length, 2);
      for (const row of report.cases) {
        const observation = row.description_provenance;
        assert.equal(row.assertion_results[0].assertion_id, 'A' + row.test_id.slice(1));
        assert.equal(row.assertion_results[0].status, row.status);
        assert.equal(observation.source_function_count, 1);
        assert.match(observation.input_sha256, /^[a-f0-9]{64}$/);
        assert.match(observation.generated_endpoint_sha256, /^[a-f0-9]{64}$/);
        if (row.status === 'failed') assert.equal(row.failed_assertion_id, 'A' + row.test_id.slice(1));
        if (defect === 'runtime-rewrite') {
          assert.deepEqual(observation.source.body_descriptions, [observation.expected_request_description]);
          if (observation.function === 'asyncio_detailed') assert.equal(observation.observation, 'other_description_mismatch');
        }
        if (defect === 'schema-description') assert.equal(observation.observation,
          observation.scenario === 'distinct' ? 'schema_description_substitution' : 'missing_body_description');
      }
    }
  } finally { rmSync(temporary, {recursive: true, force: true}); }
});

test('an exception before the tracked body predicate leaves its stable assertion not reached, never a false causal failure', () => {
  const script = String.raw`
import json, sys
sys.path.insert(0, sys.argv[1])
import run_public_checks_v4 as public
checks = public.Checks()
def fail():
    raise AttributeError('generated function is absent')
checks.case('T.R10.02.body-description.distinct.sync', fail)
print(json.dumps(checks.cases[0]))
`;
  const run = python(['-I', '-c', script, base]);
  assert.equal(run.status, 0, run.stderr);
  const row = JSON.parse(run.stdout);
  assert.equal(row.status, 'failed');
  assert.equal(row.assertions, 0);
  assert.equal(row.error_type, 'AttributeError');
  assert.equal(row.failed_assertion_id, undefined);
  assert.deepEqual(row.assertion_results, [{assertion_id: 'A.R10.02.body-description.distinct.sync', status: 'not_reached'}]);
});
