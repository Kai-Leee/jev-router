import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {ROOT, BASE, loadPublicAuditInputs, inspectPublicMapping, auditPublicChecks, publicAuditConfiguration,
  publicSourceHashes, validateControlBatch, verifyFrozenControlEvidence} from '../scripts/audit-dag-public-checks.mjs';
import {loadDagRunManifest, preflightDagRun} from '../src/benchmark/dag-runner.mjs';
import {createTokenBudget} from '../src/benchmark/budget.mjs';

const options = {registryPath: BASE + '/registry.v4.json', runnerPath: BASE + '/run_public_checks_v4.py'};
const read = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const sha = path => createHash('sha256').update(readFileSync(resolve(ROOT, path))).digest('hex');

test('opt-in v4 uses exactly 85 original + 8 public-source-backed cases and refuses mixed runner versions', () => {
  const audit = auditPublicChecks(options);
  assert.deepEqual([audit.original_test_count, audit.additional_test_count, audit.source_test_count, audit.check_count], [85, 8, 93, 8]);
  assert.equal(audit.status, 'mapped');
  assert.equal(audit.product_execution_ready, false);
  assert.equal(audit.public_gate_version, '4');
  assert.equal(audit.controls.status, 'not_run');
  assert.equal(audit.audit_inputs.controlCatalogPath, BASE + '/controls/catalog.v4.json');
  assert.throws(() => loadPublicAuditInputs(ROOT, {...options, runnerPath: BASE + '/run_public_checks.py'}),
    {code: 'PUBLIC_AUDIT_CONFIGURATION_INVALID'});
  assert.throws(() => publicAuditConfiguration({registryPath: '../registry.json'}), {code: 'PUBLIC_AUDIT_CONFIGURATION_INVALID'});
  const original = loadPublicAuditInputs(ROOT, options);
  for (const mutate of [
    value => value.extension.protocol.tests[0].source_refs[0].start_line++,
    value => value.extension.protocol.tests[0].requirement_refs = ['R10.01'],
    value => value.extension.protocol.tests[0].function = 'invented',
    value => value.extension.assertions.assertions[4].source_ref.end_line++,
    value => value.registry[0].test_ids.pop(),
    value => value.registry[0].argv[1] = 'run_public_checks.py',
    value => value.inventory.rows[85].source_refs[0].sha256 = '0'.repeat(64),
    value => value.inventory.rows.pop(),
    value => value.runnerInventory['description-provenance'].pop(),
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.throws(() => inspectPublicMapping(changed));
  }
  assert.deepEqual([auditPublicChecks().source_test_count, auditPublicChecks().check_count], [85, 7]);
});

test('frozen-source list binds new JSON inputs and the v4 audit helper; old receipts cannot certify v4', () => {
  const pins = new Map(publicSourceHashes().map(row => [row.path, row.sha256]));
  for (const path of [BASE + '/registry.v4.json', BASE + '/inventory.v4.json', BASE + '/assertions.v2.json',
    BASE + '/description-provenance.v1.json', BASE + '/controls/catalog.v4.json', BASE + '/bindings/descriptions.normal.json',
    'src/orchestration/public-audit-v4.mjs']) assert.equal(pins.get(path), sha(path));
  assert.ok([...pins.keys()].every(path => !path.includes('/results/')));
  assert.throws(() => verifyFrozenControlEvidence(options), {code: 'PUBLIC_CONTROL_FROZEN_SOURCE_DRIFT'});
});

test('read-only runtime preflight follows the manifest-selected v4 gate with an isolated ledger and no provider calls', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'd071-public-preflight-'));
  try {
    const manifest = loadDagRunManifest();
    manifest.public_registry = options.registryPath;
    manifest.public_runner = options.runnerPath;
    manifest.jev_budget = {...manifest.jev_budget, ledger_path: join(directory, 'fixture-ledger.json')};
    createTokenBudget(manifest.jev_budget).close();
    const result = await preflightDagRun({manifest, probe: false, runCommand: () => { throw new Error('No process probe expected'); }});
    assert.equal(result.mapping.source_test_count, 93);
    assert.equal(result.mapping.public_gate_version, '4');
    assert.equal(result.paid_calls, 0);
    assert.equal(result.live_ready, false);
    assert.equal(result.controls.status, 'not_run');
    assert.equal(result.frozen_controls.status, 'not_verified');
    assert.equal(result.auth, null);
    assert.equal(result.model_lookup, null);
    await assert.rejects(preflightDagRun({manifest: {...manifest, public_controls_evidence: '../unsafe.json'}}),
      {code: 'DAG_INVALID_PUBLIC_EVIDENCE_PATH'});
  } finally { rmSync(directory, {recursive: true, force: true}); }
});

// These receipt-shape fixtures test validator failures; actual Docker controls remain a separate launch prerequisite.
function validationFixture() {
  const {registry} = loadPublicAuditInputs(ROOT, options);
  const old = read(BASE + '/results/d069-local-controls-v3.json').batch;
  const batch = structuredClone(old), assertionHash = sha(BASE + '/assertions.v2.json');
  batch.public_gate_version = '4';
  for (const row of batch.results) {
    row.report.check_version = '4';
    row.report.assertion_contract_sha256 = assertionHash;
  }
  const extraCheck = registry.find(row => row.id === 'public.description-provenance');
  const fixtures = [{kind: 'normal', suite: 'description-provenance', defect: 'none', expected_failed_ids: []},
    ...read(BASE + '/controls/catalog.v4.json').filter(row => row.suite === 'description-provenance').map(row => ({kind: 'negative', ...row}))];
  for (const row of fixtures) {
    const ids = row.kind === 'normal' ? extraCheck.test_ids : row.expected_failed_ids;
    const failed = row.kind === 'negative';
    batch.results.push({...row, returncode: failed ? 1 : 0, elapsed_seconds: 0,
      report: {schema_version: 'dag-public-check-evidence/v1', scope: failed ? 'targeted_control' : 'complete_suite',
        check_id: extraCheck.id, check_version: '4', environment_ref: extraCheck.environment_ref,
        test_ids: ids, exit_code: failed ? 1 : 0, executed: true, outcome_uncertain: false, product_certified: false,
        artifact_revisions: null, error: null, skipped: 0, assertions: ids.length, status: failed ? 'failed' : 'passed',
        assertion_contract_sha256: assertionHash, cases: ids.map(test_id => ({test_id, status: failed ? 'failed' : 'passed', assertions: 1}))}});
  }
  return {registry, batch};
}

test('v4 gate demands all 8 normal suites and 83 defects and current assertion hashes', () => {
  const {registry, batch} = validationFixture();
  const result = validateControlBatch(batch, registry);
  assert.deepEqual([result.status, result.normal_count, result.defective_count], ['passed', 8, 83]);
  const missing = structuredClone(batch); missing.results.pop();
  assert.throws(() => validateControlBatch(missing, registry), {code: 'PUBLIC_CONTROL_DEFECT_SET_INCOMPLETE'});
  const wrongSource = structuredClone(batch); wrongSource.results.at(-1).report.assertion_contract_sha256 = '0'.repeat(64);
  assert.throws(() => validateControlBatch(wrongSource, registry), {code: 'PUBLIC_CONTROL_ASSERTION_SOURCE_DRIFT'});
  const oldGate = structuredClone(batch); delete oldGate.public_gate_version;
  assert.throws(() => validateControlBatch(oldGate, registry), {code: 'PUBLIC_CONTROL_GATE_VERSION_MISMATCH'});
  const falsePass = structuredClone(batch);
  const defect = falsePass.results.at(-1); defect.returncode = 0; defect.report.exit_code = 0; defect.report.status = 'passed';
  defect.report.cases.forEach(row => row.status = 'passed');
  assert.equal(validateControlBatch(falsePass, registry).status, 'failed');
});
