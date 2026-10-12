import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT, BASE, MANIFEST_SHA256, loadPublicAuditInputs, inspectPublicMapping, auditPublicChecks,
  validateControlBatch, verifyFrozenControlEvidence, runLocalControls} from '../scripts/audit-dag-public-checks.mjs';

test('all 85 public IDs have exact source-backed executable mappings; missing, drifted, or generic claims reject', () => {
  const report = auditPublicChecks();
  assert.deepEqual([report.source_test_count, report.implemented_test_count, report.missing_test_count, report.check_count], [85, 85, 0, 7]);
  assert.equal(report.status, 'mapped');
  assert.equal(report.mapping_only, true);
  assert.equal(report.product_execution_ready, false);
  assert.equal(report.source_integrity.d056_manifest_sha256, MANIFEST_SHA256);
  const original = loadPublicAuditInputs();
  for (const mutate of [
    value => value.inventory.rows.pop(),
    value => value.inventory.rows.push(structuredClone(value.inventory.rows[0])),
    value => value.inventory.rows[0].test_id = 'T.invented',
    value => value.inventory.rows[0].source_refs[0].start_line++,
    value => value.inventory.rows[0].scenario = 'Different public scenario',
    value => value.inventory.rows[0].check_ids = ['public.invented'],
    value => value.inventory.rows[0].mapping_status = 'blocked',
    value => value.inventory.rows[0].missing_reason = 'Unbacked claim',
    value => value.registry[0].requirement_ids.push('R01.01'),
    value => value.runnerInventory['runtime-model-core'] = ['T.generic-smoke'],
  ]) {
    const value = structuredClone(original);
    mutate(value);
    assert.throws(() => inspectPublicMapping(value));
  }
});

test('historical Docker controls preserve coverage but cannot certify changed D071 sources; incomplete or false passes reject', () => {
  assert.throws(() => verifyFrozenControlEvidence(), {code: 'PUBLIC_CONTROL_FROZEN_SOURCE_DRIFT'});
  const receipt = JSON.parse(readFileSync(resolve(ROOT, BASE, 'results/d069-local-controls-v3.json')));
  const cli = receipt.batch.results.find(row => row.kind === 'normal' && row.suite === 'cli-config-environment');
  const installed = cli.report.setup_evidence, probe = installed.entrypoint_metadata_probe;
  assert.match(cli.working_directory, /\/controls\/d065_cli_project$/);
  assert.ok(probe.cwd !== installed.source_root && !probe.cwd.startsWith(installed.source_root + '/'));
  assert.ok(probe.entries.length === 1 && probe.entries.every(entry => entry.callable && entry.source.startsWith(installed.source_root + '/')));
  const {registry} = loadPublicAuditInputs();
  assert.equal(validateControlBatch(receipt.batch, registry).status, 'passed');
  const catalog = JSON.parse(readFileSync(resolve(ROOT, BASE, 'controls/catalog.json')));
  assert.deepEqual([...new Set(catalog.flatMap(row => row.expected_failed_ids))].sort(), registry.flatMap(check => check.test_ids).sort());
  const missing = structuredClone(receipt.batch);
  missing.results.pop();
  assert.throws(() => validateControlBatch(missing, registry));
  const failed = structuredClone(receipt.batch);
  failed.results[0].report.cases[0].status = 'failed';
  assert.equal(validateControlBatch(failed, registry).status, 'failed');
  const directory = mkdtempSync(join(tmpdir(), 'public-cleanup-fault-'));
  const originalPath = process.env.PATH;
  try {
    writeFileSync(join(directory, 'docker'), '#!/bin/sh\ncase "$1" in inspect) exit 0;; *) exit 1;; esac\n', {mode: 0o755});
    process.env.PATH = directory + ':' + originalPath;
    assert.throws(() => runLocalControls(registry), error => error.code === 'PUBLIC_CONTROL_DOCKER_CLEANUP_UNCONFIRMED' && error.outcome_uncertain === true);
  } finally { process.env.PATH = originalPath; rmSync(directory, {recursive: true, force: true}); }
});

test('live local UNSET witness accepts normal output and rejects a semantic mutant', () => {
  const directory = mkdtempSync(join(tmpdir(), 'public-witness-'));
  try {
    const binding = JSON.parse(readFileSync(resolve(ROOT, BASE, 'bindings/normal.json')));
    for (const [defect, status] of [['none', 0], ['truthy_unset', 1]]) {
      binding.command[binding.command.indexOf('--defect') + 1] = defect;
      const path = join(directory, defect + '.json');
      writeFileSync(path, JSON.stringify(binding));
      const result = spawnSync('python3', [resolve(ROOT, BASE, 'run_public_checks.py'), '--suite', 'runtime-model-core',
        '--binding', path, '--only-test-id', 'T.R06.01'], {cwd: ROOT, encoding: 'utf8', timeout: 20_000});
      assert.equal(result.status, status, result.stdout + result.stderr);
      const report = JSON.parse(result.stdout);
      assert.equal(report.skipped, 0);
      assert.equal(report.error, null);
      assert.equal(report.cases.length, 1);
      assert.equal(report.cases[0].status, status ? 'failed' : 'passed');
      assert.equal(report.product_certified, false);
    }
  } finally { rmSync(directory, {recursive: true, force: true}); }
});
