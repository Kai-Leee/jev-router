#!/usr/bin/env node
// D079/D080 evaluation: review a public-passing candidate against the public specification (adaptive-spec-review
// contract), rerun the public gate, and grade the resulting candidate independently once. Hidden tests are never read.
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';
import {processResult} from '../src/benchmark/docker.mjs';
import {runSpecReview, loadSpecReviewContract} from '../src/benchmark/adaptive-spec-review.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const json = path => JSON.parse(readFileSync(path, 'utf8'));

async function main() {
  const args = process.argv.slice(2), value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const source = resolve(ROOT, value('--source-run') ?? ''), out = resolve(ROOT, value('--out') ?? '');
  if (!args.includes('--spend') || !existsSync(join(source, 'result.json')) || existsSync(out)) throw new Error('Usage: --source-run RUN/ARM --out NEW_DIR --spend');
  const result = json(join(source, 'result.json')), manifest = json(join(ROOT, json(join(source, 'protocol.json')).manifest.manifest_path));
  const summary = await runSpecReview({rootDir: ROOT, manifest, candidatePath: result.candidate_path,
    pinnedDirectory: join(source, 'adaptive-execution/round-0/runtime/pinned'), outDirectory: out,
    input: json(join(source, 'public-input.json')), catalog: json(join(source, 'catalog.json')), contract: loadSpecReviewContract(ROOT)});
  const began = performance.now();
  const graded = await processResult('/opt/homebrew/bin/python3.14', ['benchmarks/e2e-swe/adapter.py', '--manifest',
    'benchmarks/e2e-swe/manifests/openapi_python_client.json', 'grade', '--workspace', summary.candidate_path,
    '--image-lock', manifest.image_lock, '--output', join(out, 'grade')], {cwd: ROOT, timeoutMs: 30 * 60 * 1000, maxBytes: 4000000, killProcessTree: true});
  const grade = existsSync(join(out, 'grade/result.json')) ? json(join(out, 'grade/result.json')) : null;
  const report = {source_run: relative(ROOT, source), adopted: summary.adopted, reason: summary.reason, changed_files: summary.changed_files,
    public: summary.public && `${summary.public.passed}/${summary.public.total}`, review_api_equivalent_usd: summary.review_api_equivalent_usd,
    independent: grade?.summary ? `${grade.summary.passed}/${grade.summary.tests}` : null, grade_exit_code: graded.exit_code,
    grade_wall_ms: performance.now() - began};
  writeFileSync(join(out, 'evaluation.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main().catch(error => { process.stderr.write(`${JSON.stringify({error: error.code ?? error.message})}\n`); process.exitCode = 1; });
