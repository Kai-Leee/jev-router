#!/usr/bin/env node
import {resolve} from 'node:path';
import {loadDagRunManifest, preflightDagRun, runDagBenchmark} from '../src/benchmark/dag-runner.mjs';

const rootDir = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
try {
  const mode = args.includes('--spend') ? 'live' : args.includes('--mock') ? 'mock' : 'preflight';
  if (args.includes('--spend') && args.includes('--mock')) throw Object.assign(new Error('DAG_MODE_CONFLICT'), {code: 'DAG_MODE_CONFLICT'});
  let manifestPath = 'benchmarks/e2e-swe/manifests/d065-dag.json', runDir = null;
  for (let index = 0; index < args.length; index++) {
    if (['--spend', '--mock', '--probe'].includes(args[index])) continue;
    if (args[index] === '--manifest' && args[index + 1]) manifestPath = args[++index];
    else if (!args[index].startsWith('--') && runDir === null) runDir = args[index];
    else throw Object.assign(new Error('DAG_INVALID_ARGUMENT'), {code: 'DAG_INVALID_ARGUMENT'});
  }
  const manifest = loadDagRunManifest(resolve(rootDir, manifestPath), rootDir);
  const result = mode === 'preflight'
    ? await preflightDagRun({rootDir, manifest, probe: args.includes('--probe')})
    : await runDagBenchmark({rootDir, manifest, runDir: runDir && resolve(rootDir, runDir), mode, spend: mode === 'live'});
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!['ready', 'completed', 'inspected_no_inference'].includes(result.status)) process.exitCode = 2;
} catch (error) {
  const code = /^[A-Z0-9_]+$/.test(error?.code ?? '') ? error.code : 'DAG_RUNNER_FAILED';
  const outcomeUncertain = error?.outcome_uncertain === true || error?.outcomeUncertain === true || error?.uncertain === true
    || ['unknown', 'uncertain'].includes(error?.status);
  process.stderr.write(JSON.stringify({status: outcomeUncertain ? 'uncertain' : 'failed', code, outcome_uncertain: outcomeUncertain}) + '\n');
  process.exitCode = 1;
}
