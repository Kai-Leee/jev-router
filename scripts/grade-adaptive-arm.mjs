#!/usr/bin/env node
// D082: root-owned independent grade of one completed adaptive arm (the runner records independent_grade:
// not_run_root_owned and leaves this step to the controlling session). One adapter grade in a fresh offline
// container, no model calls, no retries. Hidden tests stay inside the grader container.
// Usage: node scripts/grade-adaptive-arm.mjs benchmark-runs/<run>/jev_profile [--grade-manifest <path>]
import {existsSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const DEFAULT_MANIFEST = 'benchmarks/e2e-swe/manifests/openapi_python_client.json';
const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = args.indexOf('--grade-manifest');
const gradeManifest = flag >= 0 ? args.splice(flag, 2)[1] : DEFAULT_MANIFEST;
if (args.length !== 1 || !gradeManifest) throw new Error('usage: grade-adaptive-arm.mjs <arm-dir> [--grade-manifest <path>]');
const arm = resolve(root, args[0]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (name, value) => writeFileSync(join(arm, name), JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
const files = dir => readdirSync(dir, {recursive: true}).map(path => join(dir, path)).filter(path => statSync(path).isFile())
  .map(path => ({path: relative(dir, path), bytes: statSync(path).size, sha256: sha(readFileSync(path))}))
  .sort((a, b) => a.path < b.path ? -1 : 1);

const resultBytes = readFileSync(join(arm, 'result.json')), result = JSON.parse(resultBytes);
if (result.status !== 'completed' || result.outcome_uncertain !== false || result.independent_grade !== 'not_run_root_owned')
  throw new Error('ARM_NOT_GRADABLE');
if (existsSync(join(arm, 'independent-evaluation.json')) || existsSync(join(arm, 'grade'))) throw new Error('ALREADY_GRADED');
const candidate = result.candidate_path, output = join(arm, 'grade');
const before = files(candidate);
save('candidate-before-grade.json', before);
const command = ['benchmarks/e2e-swe/adapter.py', '--manifest', gradeManifest, 'grade', '--workspace', candidate,
  '--image-lock', 'benchmark-runs/d040-openapi-image-lock.json', '--output', output];
const started = new Date(), began = performance.now();
save('grade-started.json', {started_at: started.toISOString(), command: 'python3', args: command, cwd: root, model_calls: 0, automatic_retries: 0});
const run = spawnSync('python3', command, {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
const wall = performance.now() - began, finished = new Date();
save('grade-process.json', {exit_code: run.status, signal: run.signal, stdout: run.stdout, stderr: run.stderr});
const after = files(candidate);
save('candidate-after-grade.json', after);
const grade = JSON.parse(readFileSync(join(output, 'result.json'), 'utf8')), summary = grade.summary ?? {};
const unchanged = JSON.stringify(before) === JSON.stringify(after);
const complete = run.status === 0 && grade.grading_status === 'completed' && summary.tests === 63 && summary.passed === 63 && summary.failed === 0;
const valid = run.status === 0 && unchanged && grade.container_removed === true && grade.model_calls === 0;
const publicDone = result.public_status === 'passed';
const success = valid && complete && publicDone;
save('independent-evaluation.json', {input_result_sha256: sha(resultBytes), candidate_path: candidate,
  started_at: started.toISOString(), finished_at: finished.toISOString(), grade_wall_ms: wall, candidate_unchanged: unchanged,
  product_success: success, independent_completion: valid && complete, independent_evidence_valid: valid,
  public_and_independent_completion: success, successful_completion_wall_ms: success ? result.wall_ms : null,
  grade_status: grade.grading_status, summary, container_removed: grade.container_removed, automatic_retries: 0, model_calls: 0,
  grade_manifest: gradeManifest, grade_manifest_sha256: sha(readFileSync(resolve(root, gradeManifest))),
  basis: 'Root-owned grade after a completed arm: one adapter grade in a fresh offline container.'});
console.log(JSON.stringify({exit_code: run.status, candidate_unchanged: unchanged, summary, product_success: success, grade_wall_ms: Math.round(wall)}));
