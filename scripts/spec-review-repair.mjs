#!/usr/bin/env node
// D079 evaluation: after a candidate passes the public gate, one fresh Claude session reviews it against the
// public specification only (no tests, no shell), fixes deviations, then the public gate reruns and the
// candidate is graded independently once. Hidden test contents are never read or sent.
import {cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, chmodSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join, relative, resolve} from 'node:path';
import {processResult} from '../src/benchmark/docker.mjs';
import {providerOutcome} from '../src/benchmark/runner.mjs';
import {claudeEnvironment} from '../src/benchmark/claude-env.mjs';
import {runDagDockerCheck} from '../src/benchmark/dag-runner.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const SYSTEM = 'You review a generated Python project against its public specification and fix deviations. Inspect files in the current directory with Read, Glob and Grep and change them with Edit or Write. No shell, code execution, network or test runner is available. Do not add tests. Never weaken behavior the specification requires and keep behavior the public checks already accept. Final response: a concise list of each deviation found, the requirement ID it violates and the files changed; never paste source bodies.';
const TASK = 'Compare the implementation in this directory with every requirement in `public_source` and `requirement_descriptions`. The listed public checks already pass, but each requirement is exercised by only a few public test IDs. Look for behavior described in the specification that those tests do not appear to exercise (optional features, alternative inputs, edge cases and error paths), confirm each deviation by reading the relevant code and templates, and fix it with the smallest change that satisfies the specification. Do not restructure working code.';

function snapshot(directory) {
  const files = {};
  const walk = dir => { for (const name of readdirSync(dir)) {
    const path = join(dir, name), stat = statSync(path);
    if (stat.isDirectory()) { if (!['__pycache__', '.git'].includes(name)) walk(path); }
    else files[relative(directory, path)] = sha(readFileSync(path));
  } };
  walk(directory); return files;
}

async function main() {
  const args = process.argv.slice(2), value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const source = resolve(ROOT, value('--source-run') ?? ''), out = resolve(ROOT, value('--out') ?? '');
  const model = value('--model') ?? 'claude-opus-5-5', effort = value('--effort') ?? 'high';
  if (!args.includes('--spend') || !existsSync(join(source, 'result.json')) || existsSync(out)) throw new Error('Usage: --source-run RUN/ARM --out NEW_DIR --spend [--model M --effort E]');
  const result = json(join(source, 'result.json')), input = json(join(source, 'public-input.json')), catalog = json(join(source, 'catalog.json'));
  const manifest = json(join(ROOT, json(join(source, 'protocol.json')).manifest.manifest_path));
  const registry = json(join(ROOT, manifest.public_registry)), image = json(join(ROOT, manifest.image_lock));
  const pinned = join(source, 'adaptive-execution/round-0/runtime/pinned');
  mkdirSync(out, {recursive: true});
  const save = (name, data) => writeFileSync(join(out, name), JSON.stringify(data, null, 2) + '\n', {flag: 'wx'});
  const candidate = join(out, 'candidate');
  cpSync(result.candidate_path, candidate, {recursive: true});
  const makeWritable = dir => { chmodSync(dir, 0o755); for (const name of readdirSync(dir)) { const p = join(dir, name);
    if (statSync(p).isDirectory()) makeWritable(p); else chmodSync(p, 0o644); } };
  makeWritable(candidate);
  const before = snapshot(candidate);
  save('protocol.json', {source_run: relative(ROOT, source), source_result_sha256: sha(readFileSync(join(source, 'result.json'))),
    model, effort, system: SYSTEM, task: TASK, hidden_tests_read: false, tools: ['Read', 'Edit', 'Write', 'Glob', 'Grep'], automatic_retries: 0});
  const prompt = JSON.stringify({task: TASK, public_source: input.source, requirement_descriptions: input.requirement_descriptions,
    interface_catalog: catalog.units.map(({id, title, interface: text}) => ({id, title, interface: text})),
    public_checks: registry.map(check => ({id: check.id, requirement_ids: check.requirement_ids, test_ids: check.test_ids}))});
  const mcp = join(out, 'mcp.json'); writeFileSync(mcp, JSON.stringify({mcpServers: {}}));
  const claudeArgs = ['--print', '--model', model, '--effort', effort, '--tools', 'Read,Edit,Write,Glob,Grep', '--strict-mcp-config',
    '--mcp-config', mcp, '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'acceptEdits',
    '--permission-prompts', 'none', '--no-session-persistence', '--output-format', 'stream-json', '--verbose', '--system-prompt', SYSTEM];
  let began = performance.now();
  const raw = await processResult('claude', claudeArgs, {cwd: candidate, env: claudeEnvironment(process.env), input: prompt,
    timeoutMs: 45 * 60 * 1000, maxBytes: 64 * 1024 * 1024, killProcessTree: true});
  const reviewMs = performance.now() - began;
  writeFileSync(join(out, 'review.stream.jsonl'), raw.stdout ?? '');
  const outcome = providerOutcome(raw, model);
  const after = snapshot(candidate);
  const changed = Object.keys({...before, ...after}).filter(path => before[path] !== after[path]).sort();
  const review = {status: outcome.status, code: outcome.code, wall_ms: reviewMs, usage: outcome.completion?.usage ?? null,
    api_equivalent_usd: outcome.completion?.total_cost_usd ?? null, models: outcome.models, final_text: outcome.completion?.result ?? null, changed_files: changed};
  save('review.json', review);
  if (outcome.status !== 'completed') throw new Error(`REVIEW_${outcome.status.toUpperCase()}`);
  // Public gate: the same eight suites and pinned checker as the source run.
  began = performance.now();
  const publicResults = [];
  for (const check of registry) {
    const suite = check.argv[check.argv.indexOf('--suite') + 1], bindingDirectory = join(out, 'bindings', check.id);
    mkdirSync(bindingDirectory, {recursive: true, mode: 0o700});
    const argv = ['python3', `/checker/${manifest.public_runner}`, '--suite', suite, '--binding', '/run/binding.json'];
    const {raw: checkRaw, report} = await runDagDockerCheck({image, check: {...check, argv}, candidateDirectory: candidate, pinnedDirectory: pinned,
      bindingDirectory, remaining: () => 20 * 60 * 1000, record: async () => {}, attemptId: 'd079-spec-review'});
    const failed = (report.cases ?? []).filter(row => row.status !== 'passed').map(row => row.test_id);
    publicResults.push({check_id: check.id, status: report.status, exit_code: checkRaw.exit_code, cases: report.cases?.length ?? 0, failed});
  }
  const publicPassed = publicResults.reduce((sum, row) => sum + row.cases - row.failed.length, 0);
  const publicTotal = publicResults.reduce((sum, row) => sum + row.cases, 0);
  save('public.json', {wall_ms: performance.now() - began, passed: publicPassed, total: publicTotal, results: publicResults});
  // Independent grade once, regardless of public outcome, to measure the method; recorded separately.
  began = performance.now();
  const gradeArgs = ['benchmarks/e2e-swe/adapter.py', '--manifest', 'benchmarks/e2e-swe/manifests/openapi_python_client.json', 'grade',
    '--workspace', candidate, '--image-lock', manifest.image_lock, '--output', join(out, 'grade')];
  const graded = await processResult('/opt/homebrew/bin/python3.14', gradeArgs, {cwd: ROOT, timeoutMs: 30 * 60 * 1000, maxBytes: 4000000, killProcessTree: true});
  const grade = existsSync(join(out, 'grade/result.json')) ? json(join(out, 'grade/result.json')) : null;
  const summary = {source_run: relative(ROOT, source), changed_files: changed, review_wall_ms: reviewMs, review_usage: review.usage,
    review_api_equivalent_usd: review.api_equivalent_usd, public: `${publicPassed}/${publicTotal}`,
    independent: grade?.summary ? `${grade.summary.passed}/${grade.summary.tests}` : null, grade_exit_code: graded.exit_code,
    grade_wall_ms: performance.now() - began, container_removed: grade?.container_removed ?? null};
  save('summary.json', summary);
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main().catch(error => { process.stderr.write(`${JSON.stringify({error: error.message})}\n`); process.exitCode = 1; });
