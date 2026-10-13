import {cpSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {dirname, join, relative, resolve} from 'node:path';
import {processResult} from './docker.mjs';
import {providerOutcome} from './runner.mjs';
import {claudeEnvironment} from './claude-env.mjs';
import {runDagDockerCheck} from './dag-runner.mjs';

// D080: public-spec review after the public gate (D079 evaluation). Hidden tests are never read or sent.
export const SPEC_REVIEW_CONTRACT = 'docs/orchestration/contracts/adaptive-spec-review.v1.json';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const fail = code => { throw Object.assign(new Error(code), {code, outcome_uncertain: false}); };

export function loadSpecReviewContract(rootDir, path = SPEC_REVIEW_CONTRACT) {
  const raw = readFileSync(join(rootDir, path)), contract = JSON.parse(raw);
  if (contract.schema_version !== 'adaptive-spec-review/v1' || contract.policy !== 'spec-review-v1') fail('ADAPTIVE_SPEC_REVIEW_CONTRACT_INVALID');
  return {...contract, source: {path, sha256: sha(raw)}};
}

function snapshot(directory) {
  const files = {};
  const walk = dir => { for (const name of readdirSync(dir)) {
    const path = join(dir, name), stat = statSync(path);
    if (stat.isDirectory()) { if (!['__pycache__', '.git'].includes(name)) walk(path); } else files[relative(directory, path)] = sha(readFileSync(path));
  } };
  walk(directory); return files;
}
function writable(dir) {
  chmodSync(dir, 0o755);
  for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) writable(path); else chmodSync(path, 0o644); }
}

/** Review a copy of a public-passing candidate, rerun every public check on it, and adopt it only if all still pass. */
export async function runSpecReview({rootDir, manifest, candidatePath, pinnedDirectory, outDirectory, input, catalog,
  contract = loadSpecReviewContract(rootDir), runCommand = processResult, record = async () => {}, remaining = () => contract.timeout_ms}) {
  const registry = json(join(rootDir, manifest.public_registry)), image = json(join(rootDir, manifest.image_lock));
  mkdirSync(outDirectory, {recursive: true});
  const save = (name, data) => writeFileSync(join(outDirectory, name), JSON.stringify(data, null, 2) + '\n', {flag: 'wx'});
  // Isolation: the reviewer works in a temp copy outside the repository (hidden tests live under the repo root),
  // with explicit deny rules for the repository; only the reviewed copy is brought back into the run directory.
  const workspace = mkdtempSync(join(tmpdir(), 'jev-spec-review-')), reviewDir = join(workspace, 'candidate');
  cpSync(candidatePath, reviewDir, {recursive: true}); writable(reviewDir);
  const before = snapshot(reviewDir), repository = resolve(rootDir);
  // Read rules already cover Glob/Grep (d080-isolation-probe-02); they are named too so the intent is explicit.
  const denied = ['Read', 'Edit', 'Write', 'Glob', 'Grep'].map(tool => `${tool}(/${repository}/**)`);
  const prompt = JSON.stringify({task: contract.task, public_source: input.source, requirement_descriptions: input.requirement_descriptions,
    interface_catalog: catalog.units.map(({id, title, interface: text}) => ({id, title, interface: text})),
    public_checks: registry.map(check => ({id: check.id, requirement_ids: check.requirement_ids, test_ids: check.test_ids}))});
  const mcp = join(outDirectory, 'mcp.json'); writeFileSync(mcp, JSON.stringify({mcpServers: {}}));
  const args = ['--print', '--model', contract.model, '--effort', contract.effort, '--tools', contract.tools.join(','), '--strict-mcp-config',
    '--mcp-config', mcp, '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', contract.permission_mode,
    '--permission-prompts', 'none', '--no-session-persistence', '--output-format', 'stream-json', '--verbose', '--system-prompt', contract.system,
    '--disallowedTools', ...denied];
  await record({event: 'adaptive_spec_review_started', contract_source: contract.source, candidate_source: candidatePath});
  let began = performance.now();
  let raw;
  const candidate = join(outDirectory, 'candidate');
  try {
    raw = await runCommand('claude', args, {cwd: reviewDir, env: claudeEnvironment(process.env), input: prompt,
      timeoutMs: Math.min(contract.timeout_ms, remaining()), maxBytes: 64 * 1024 * 1024, killProcessTree: true});
    cpSync(reviewDir, candidate, {recursive: true});
  } finally {
    writeFileSync(join(outDirectory, 'review.stream.jsonl'), raw?.stdout ?? '');
    rmSync(workspace, {recursive: true, force: true}); // never leak the temp copy on throw or timeout
  }
  const outcome = providerOutcome(raw, contract.model), after = snapshot(candidate);
  const digest = files => sha(JSON.stringify(Object.entries(files).sort()));
  const review = {status: outcome.status, code: outcome.code, wall_ms: performance.now() - began, usage: outcome.completion?.usage ?? null,
    api_equivalent_usd: outcome.completion?.total_cost_usd ?? null, models: outcome.models, final_text: outcome.completion?.result ?? null,
    changed_files: Object.keys({...before, ...after}).filter(path => before[path] !== after[path]).sort(),
    denied_paths: denied, files_before: before, files_after: after};
  save('review.json', review);
  const summary = {schema_version: 'adaptive-spec-review-result/v1', contract_source: contract.source, review_status: review.status,
    review_wall_ms: review.wall_ms, review_usage: review.usage, review_api_equivalent_usd: review.api_equivalent_usd,
    changed_files: review.changed_files, files_before_sha256: digest(before), files_after_sha256: digest(after), public_wall_ms: null, public: null, adopted: false, candidate_path: candidatePath,
    reason: null, outcome_uncertain: outcome.status === 'uncertain', automatic_retries: 0};
  if (outcome.status !== 'completed') summary.reason = `REVIEW_${outcome.status.toUpperCase()}`;
  else if (!review.changed_files.length) summary.reason = 'REVIEW_NO_CHANGE';
  else {
    began = performance.now();
    const results = [];
    for (const check of registry) {
      const suite = check.argv[check.argv.indexOf('--suite') + 1], bindingDirectory = join(outDirectory, 'bindings', check.id);
      mkdirSync(bindingDirectory, {recursive: true, mode: 0o700});
      const argv = ['python3', `/checker/${manifest.public_runner}`, '--suite', suite, '--binding', '/run/binding.json'];
      const {raw: checkRaw, report} = await runDagDockerCheck({image, check: {...check, argv}, candidateDirectory: candidate,
        pinnedDirectory, bindingDirectory, runCommand, remaining, record, attemptId: 'adaptive-spec-review'});
      const cases = report.cases ?? [];
      results.push({check_id: check.id, status: report.status, executed: report.executed, exit_code: checkRaw.exit_code,
        cases: cases.length, failed: cases.filter(row => row.status !== 'passed').map(row => row.test_id),
        complete: JSON.stringify(cases.map(row => row.test_id).sort()) === JSON.stringify([...check.test_ids].sort())});
    }
    const passed = results.reduce((sum, row) => sum + row.cases - row.failed.length, 0), total = registry.reduce((sum, check) => sum + check.test_ids.length, 0);
    summary.public_wall_ms = performance.now() - began; summary.public = {passed, total, results};
    summary.adopted = results.every(row => row.status === 'passed' && row.executed === true && row.complete && !row.failed.length);
    summary.reason = summary.adopted ? 'PUBLIC_GATE_PASSED_AFTER_REVIEW' : 'PUBLIC_GATE_FAILED_AFTER_REVIEW';
    if (summary.adopted) summary.candidate_path = candidate;
  }
  save('summary.json', summary);
  await record({event: 'adaptive_spec_review_completed', adopted: summary.adopted, reason: summary.reason,
    changed_files: summary.changed_files, public: summary.public && `${summary.public.passed}/${summary.public.total}`});
  return summary;
}

/** Runner hook: only after a completed public gate; any review failure keeps the gated candidate. */
export async function specReviewAfterPublicGate({rootDir, manifest, runDirectory, execution, input, catalog, record, runCommand, remaining}) {
  if (execution?.status !== 'completed' || !execution.candidate_path) return null;
  try {
    return await runSpecReview({rootDir, manifest, candidatePath: execution.candidate_path, pinnedDirectory: join(dirname(execution.candidate_path), 'pinned'),
      outDirectory: join(runDirectory, 'spec-review'), input, catalog, contract: loadSpecReviewContract(rootDir, manifest.spec_review.contract), record,
      ...(runCommand ? {runCommand} : {}), ...(remaining ? {remaining} : {})});
  } catch (error) {
    // The public gate already passed; a failed review never fails the run, it only keeps the gated candidate.
    const result = {schema_version: 'adaptive-spec-review-result/v1', adopted: false, candidate_path: execution.candidate_path,
      reason: /^[A-Z0-9_]{1,100}$/.test(error?.code ?? '') ? error.code : 'ADAPTIVE_SPEC_REVIEW_FAILED',
      outcome_uncertain: error?.outcome_uncertain === true, automatic_retries: 0};
    await record({event: 'adaptive_spec_review_completed', adopted: false, reason: result.reason});
    return result;
  }
}
