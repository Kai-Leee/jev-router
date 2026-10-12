#!/usr/bin/env node
import {resolve} from 'node:path';
import {loadAdaptiveRunManifest, preflightAdaptiveComparison, prepareAdaptiveSharedCatalog,
  runAdaptiveArm, runAdaptiveComparison} from '../src/benchmark/adaptive-dag-runner.mjs';

const rootDir = resolve(import.meta.dirname, '..'), args = process.argv.slice(2);
try {
  let runDir, preparationDirectory, arm, manifestPath = 'benchmarks/e2e-swe/manifests/d066-adaptive.json';
  const flags = new Set();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (['--spend', '--probe', '--prepare-catalog'].includes(arg)) { if (flags.has(arg)) throw new Error('ADAPTIVE_ARGUMENT_INVALID'); flags.add(arg); }
    else if (['--manifest', '--catalog-preparation', '--arm'].includes(arg) && args[index + 1]) {
      const value = args[++index];
      if (arg === '--manifest') manifestPath = value;
      else if (arg === '--catalog-preparation') preparationDirectory = resolve(rootDir, value);
      else arm = value;
    } else if (!arg.startsWith('--') && !runDir) runDir = resolve(rootDir, arg);
    else throw new Error('ADAPTIVE_ARGUMENT_INVALID');
  }
  const manifest = loadAdaptiveRunManifest(resolve(rootDir, manifestPath), rootDir), spend = flags.has('--spend');
  if (flags.has('--prepare-catalog') && manifest.catalog_reuse) throw new Error('ADAPTIVE_PREPARATION_ALREADY_PINNED');
  if (flags.has('--prepare-catalog') && (arm || preparationDirectory)) throw new Error('ADAPTIVE_ARGUMENT_INVALID');
  if (spend && (!runDir || (!flags.has('--prepare-catalog') && !preparationDirectory))) throw new Error('ADAPTIVE_ARGUMENT_INVALID');
  if (!spend && (runDir || arm || preparationDirectory || flags.has('--prepare-catalog'))) throw new Error('EXPLICIT_SPEND_REQUIRED');
  const result = !spend ? await preflightAdaptiveComparison({rootDir, manifest, probe: flags.has('--probe')})
    : flags.has('--prepare-catalog') ? await prepareAdaptiveSharedCatalog({rootDir, manifest, runDir, spend})
      : arm ? await runAdaptiveArm({rootDir, manifest, runDir, arm, preparationDirectory, spend})
        : await runAdaptiveComparison({rootDir, manifest, runDir, preparationDirectory, spend});
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!['prepared', 'ready', 'inspected_no_inference', 'completed'].includes(result.status)) process.exitCode = 2;
} catch (error) {
  const code = /^[A-Z0-9_]+$/.test(error?.code ?? error?.message ?? '') ? error.code ?? error.message : 'ADAPTIVE_RUN_FAILED';
  const unknown = error?.outcome_uncertain === true || error?.outcomeUncertain === true || error?.uncertain === true || ['unknown', 'uncertain'].includes(error?.status);
  process.stderr.write(JSON.stringify({status: unknown ? 'uncertain' : 'failed', code, outcome_uncertain: unknown}) + '\n');
  process.exitCode = 1;
}
