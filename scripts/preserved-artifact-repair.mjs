#!/usr/bin/env node
import {resolve} from 'node:path';
import {loadAdaptiveRunManifest} from '../src/benchmark/adaptive-dag-runner.mjs';
import {inspectPreservedRepairSource, runPreservedArtifactRepair} from '../src/benchmark/preserved-artifact-repair-runner.mjs';

const rootDir = resolve(import.meta.dirname, '..');
try {
  const args = process.argv.slice(2); let spend = false, runDir = null, sourceRunDirectory = null;
  let manifestPath = 'benchmarks/e2e-swe/manifests/d076-preserved-repair.json';
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (seen.has(arg) && arg.startsWith('--')) throw Error('PRESERVED_ARGUMENT_INVALID');
    seen.add(arg);
    if (arg === '--spend') spend = true;
    else if (['--manifest', '--source-run'].includes(arg) && args[index + 1] && !args[index + 1].startsWith('--')) {
      const value = resolve(rootDir, args[++index]);
      if (arg === '--manifest') manifestPath = value; else sourceRunDirectory = value;
    } else if (!arg.startsWith('--') && !runDir) runDir = resolve(rootDir, arg);
    else throw Error('PRESERVED_ARGUMENT_INVALID');
  }
  if (!sourceRunDirectory || (spend && !runDir) || (!spend && runDir)) throw Error('PRESERVED_ARGUMENT_INVALID');
  const manifest = loadAdaptiveRunManifest(resolve(rootDir, manifestPath), rootDir);
  let result;
  if (spend) result = await runPreservedArtifactRepair({rootDir, manifest, sourceRunDirectory, runDir, spend});
  else {
    const source = inspectPreservedRepairSource({rootDir, manifest, sourceRunDirectory});
    result = {status: 'inspected_no_inference', source_run: source.directory, file_count: source.snapshot.files.length,
      artifact_count: Object.keys(source.artifact_revisions).length, candidate_snapshot_sha256: source.candidate_snapshot_sha256,
      expected_failed_cases: source.expected_failed_cases, public_specification_unchanged: true,
      check_definitions_unchanged: source.check_definitions_unchanged, public_gate_upgrade: source.gate_upgrade ?? null,
      worker_profile_selection: source.inferred_repair_required
        ? 'jev_selected_repair_tasks_only_historical_initial_profiles_preserved' : 'fixed_opus_medium_no_profile_decision',
      source_profile_history: source.source_profile_history ?? null, expected_failed_count: source.expected_failed_count ?? source.expected_failed_cases?.length ?? null,
      ...(['adaptive-dag-comparison/v9', 'adaptive-dag-comparison/v10'].includes(manifest.schema_version) ? {owner_inference_policy: 'inferred-v2'} : {}),
      ...(manifest.schema_version === 'adaptive-dag-comparison/v10' ? {comparison_condition: source.comparison_condition,
        failure_recovery_policy: manifest.failure_recovery.policy, repair_input_policy: 'evidence-v1',
        transmission_preflight: manifest.transmission_preflight,
        historical_repair_history: source.historical_repair_history ?? null} : {}),
      provider_calls: 0, docker_calls: 0, ledger_access: 0};
  }
  console.log(JSON.stringify(result, null, 2));
  if (!['completed', 'inspected_no_inference'].includes(result.status)) process.exitCode = 2;
} catch (error) {
  const code = error.code ?? error.message;
  console.error(JSON.stringify({status: 'failed', code: /^[A-Z0-9_]+$/.test(code ?? '') ? code : 'PRESERVED_RUN_FAILED',
    outcome_uncertain: error.outcome_uncertain === true})); process.exitCode = 1;
}
