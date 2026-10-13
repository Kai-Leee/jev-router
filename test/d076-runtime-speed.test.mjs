import test from 'node:test';
import assert from 'node:assert/strict';
import {join, resolve} from 'node:path';
import {loadAdaptiveRunManifest, loadAdaptivePublicInput, loadAdaptiveSharedPreparation, loadAdaptiveTestRequirements,
  buildAdaptiveChecks, adaptiveRuntimeSpeed, adaptiveSpeedSessionOptions} from '../src/benchmark/adaptive-dag-runner.mjs';
import {JEV_GET_RETRY_V1} from '../src/benchmark/telemetry.mjs';
import {loadPublicAuditInputs} from '../scripts/audit-dag-public-checks.mjs';

const root = resolve(import.meta.dirname, '..');
const v11Path = join(root, 'benchmarks/e2e-swe/manifests/d076-preserved-repair.json');

test('v11 reuses the exact D066 catalog under its telemetry-inclusive allowlist and keeps the 93-check gate', () => {
  const config = loadAdaptiveRunManifest(v11Path, root), input = loadAdaptivePublicInput(root, config);
  const reused = loadAdaptiveSharedPreparation({rootDir: root, manifest: config,
    preparationDirectory: join(root, config.catalog_reuse.preparation_directory), input});
  assert.equal(reused.compatibility.generation_request_exact_match, true);
  assert.equal(reused.compatibility.generation_prompt_schema_exact_match, true);
  assert.equal(reused.compatibility.new_catalog_inference_calls, 0);
  assert.deepEqual(reused.compatibility.public_gate_upgrade, {previous_registry: 'benchmarks/e2e-swe/public-checks/registry.json',
    current_registry: config.public_registry, original_test_count: 85, current_test_count: 93, generation_input_unchanged: true});
  const {registry} = loadPublicAuditInputs(root, {registryPath: config.public_registry, runnerPath: config.public_runner});
  assert.equal(Object.keys(loadAdaptiveTestRequirements(root, config)).length, 93);
  const checks = buildAdaptiveChecks({catalog: reused.catalog, registry, manifest: config, source_ref: input.source_ref});
  const integration = checks.filter(check => check.phase === 'integration');
  assert.equal(integration.length, registry.length);
  assert.ok(integration.every(check => check.argv[1] === `/checker/${config.public_runner}`));
  assert.throws(() => loadAdaptiveSharedPreparation({rootDir: root, manifest: config, preparationDirectory: reused.directory,
    input: {...input, requirement_descriptions: input.requirement_descriptions.map((entry, index) =>
      index ? entry : {...entry, text: entry.text + ' Altered source requirement.'})}}), {code: 'ADAPTIVE_PREPARATION_REUSE_INPUT_DRIFT'});
});

test('runtime speed options come only from v11; older manifests keep the serial per-call defaults', () => {
  const v11 = loadAdaptiveRunManifest(v11Path, root);
  assert.deepEqual(adaptiveRuntimeSpeed(v11), {model_lookup: 'per_session', budget_lock: 'ledger_op',
    public_check_concurrency: 2, readiness_batch: true});
  assert.deepEqual(adaptiveSpeedSessionOptions(v11), {modelLookup: 'per_session', budgetLock: 'ledger_op', getRetry: JEV_GET_RETRY_V1});
  const v10 = loadAdaptiveRunManifest(join(root, 'benchmarks/e2e-swe/manifests/d075-preserved-repair.json'), root);
  assert.deepEqual(adaptiveRuntimeSpeed(v10), {model_lookup: 'per_call', budget_lock: 'call',
    public_check_concurrency: 1, readiness_batch: false});
  assert.deepEqual(adaptiveSpeedSessionOptions(v10), {modelLookup: 'per_call', budgetLock: 'call'});
});
