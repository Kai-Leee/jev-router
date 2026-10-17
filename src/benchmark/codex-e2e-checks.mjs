import {readFileSync, readdirSync, lstatSync, mkdirSync, mkdtempSync, openSync, writeFileSync, fsyncSync, closeSync, existsSync} from 'node:fs';
import {join, resolve, relative} from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {processResult} from './docker.mjs';
import {runDagDockerCheck} from './dag-runner.mjs';
import {validateAdaptivePublicReport} from './adaptive-dag-runner.mjs';
import {auditPublicChecks, verifyFrozenControlEvidence} from '../../scripts/audit-dag-public-checks.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, ...details}); };
const uncertain = value => value?.outcome_uncertain === true || value?.outcomeUncertain === true;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const durable = (path, value) => {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
};
// Node converts Infinity to a 1ms timer. The controller has no overall deadline;
// this bounded per-process value is the largest supported timer, not a worker cap.
const remainingFor = context => () => {
  const value = context.remaining?.() ?? Infinity;
  if (!(value > 0)) fail('CODEX_CHECK_DEADLINE_EXHAUSTED');
  return Math.min(value, 2147483647);
};
const localInvalid = (raw, report) => uncertain(report) || raw.outcome_uncertain !== false || report.outcome_uncertain !== false
  || report.executed !== true || report.exit_code !== raw.exit_code || !['passed', 'failed'].includes(report.status)
  || !Number.isSafeInteger(report.assertions) || report.assertions < 0 || report.skipped !== 0
  || (report.status === 'passed' ? raw.exit_code !== 0 || report.assertions < 1 || report.error !== null : raw.exit_code !== 1 || !object(report.error));

/** Provider-neutral callbacks: no Claude authentication, Jev key or ledger access. */
export function createCodexE2EChecks({rootDir = ROOT, manifest, context, registry, preflightEnvironment, runCommand = processResult}) {
  const image = read(join(rootDir, manifest.image_lock));
  for (const dir of ['check-bindings', 'calls', 'receipts']) mkdirSync(join(context.directory, dir), {recursive: true, mode: 0o700});
  const save = context.save ?? ((path, value) => durable(join(context.directory, path), value));
  const record = context.record ?? (async () => fail('CODEX_CHECK_RECORD_REQUIRED'));
  const checkTask = async (check, checkContext) => {
    const id = `check-${randomUUID()}`, bindingDirectory = join(context.directory, 'check-bindings', id);
    mkdirSync(bindingDirectory, {mode: 0o700});
    const processRef = `calls/${id}.process.json`, reportRef = `receipts/${id}.json`;
    const {raw, report, container_removed} = await runDagDockerCheck({image, check,
      candidateDirectory: checkContext.candidateDirectory, pinnedDirectory: checkContext.pinnedDirectory, bindingDirectory,
      runCommand, remaining: remainingFor(context), record, attemptId: checkContext.attempt_id, abortSignal: context.signal,
      saveProcess: async result => save(processRef, result)});
    if (check.phase === 'integration') validateAdaptivePublicReport({check, registeredCheck: registry.find(item => item.id === check.id), raw, report});
    else if (check.phase !== 'contract' || localInvalid(raw, report)) fail('CODEX_LOCAL_EVIDENCE_INVALID', {outcome_uncertain: uncertain(raw) || uncertain(report)});
    const envelope = {check_id: check.id, check_version: check.version, environment_ref: check.environment_ref,
      status: report.status, executed: report.executed, exit_code: raw.exit_code, assertions: report.assertions, skipped: report.skipped,
      outcome_uncertain: false, evidence: {...report, report_ref: reportRef, process_ref: processRef, container_removed}};
    await save(reportRef, {attempt_id: checkContext.attempt_id, round_index: checkContext.round_index,
      artifact_revisions: checkContext.artifact_revisions, envelope});
    return envelope;
  };
  const probeEnvironment = async () => {
    if (!preflightEnvironment?.modules || preflightEnvironment.image_id !== image.image_id) fail('CODEX_CHECK_ENVIRONMENT_PROBE_REQUIRED');
    const raw = await runCommand('docker', ['image', 'inspect', image.image_id],
      {timeoutMs: 15000, killProcessTree: true, abortSignal: context.signal});
    if (raw.outcome_uncertain) fail('CODEX_CHECK_ENVIRONMENT_UNCERTAIN', {outcome_uncertain: true});
    if (raw.exit_code !== 0 || readImage(raw)?.Id !== image.image_id) fail('CODEX_CHECK_IMAGE_PIN_MISMATCH');
    await record({event: 'codex_environment_identity_checked', image_id: image.image_id});
    return {...preflightEnvironment, dependency_versions_basis: 'preflight_probe_of_identical_immutable_image'};
  };
  return {checkTask, probeEnvironment};
}
const readImage = raw => { try { return JSON.parse(raw.stdout)[0]; } catch { return null; } };

/** Static checks are read-only. probe=true starts/removes one no-network Docker probe. */
export async function inspectCodexE2EChecks({rootDir = ROOT, manifest, probe = false, runCommand = processResult,
  record = async () => {}, signal, evidenceDirectory, cliEnvironment} = {}) {
  const config = {registryPath: manifest.public_registry, runnerPath: manifest.public_runner};
  const mapping = auditPublicChecks({root: rootDir, controls: false, ...config});
  if (mapping.missing_test_count || mapping.missing_requirement_ids.length) fail('CODEX_PUBLIC_MAPPING_INCOMPLETE');
  const frozen = verifyFrozenControlEvidence({root: rootDir, ...config, path: manifest.public_controls_evidence});
  const image = read(join(rootDir, manifest.image_lock)), expected = read(join(rootDir, manifest.public_checker_root, 'environment.json'));
  if (!/^sha256:[a-f0-9]{64}$/.test(image.image_id) || expected.id !== manifest.public_environment_ref
    || expected.image_id !== image.image_id || expected.platform !== `${image.os}/${image.architecture}`
    || expected.container?.tmpfs_options !== 'rw,exec,size=2g') fail('CODEX_CHECK_ENVIRONMENT_MISMATCH');
  let environment = null, auth = null;
  if (probe) {
    const directory = evidenceDirectory ?? mkdtempSync(join(tmpdir(), 'codex-e2e-check-probe-'));
    mkdirSync(directory, {recursive: true, mode: 0o700});
    if(cliEnvironment){
      await cliEnvironment.verify();
      const evidence=cliEnvironment.evidence;
      auth={version:evidence.app_binary?.version??null,logged_in:evidence.auth?.logged_in===true,
        auth_kind:evidence.auth?.type??null,inference_calls:0,model_availability_verified:evidence.provider!=='claude',
        ...(evidence.provider==='claude'?{candidate_basis:'frozen_documented_efforts_and_separate_medium_model_probes',all_effort_combinations_live_verified:false}:{}),
        source:'frozen_app_cli_environment',fingerprint:evidence.fingerprint};
      if(!evidence.app_binary||!(evidence.provider==='claude'
        ?auth.auth_kind==='claude.ai':auth.auth_kind==='chatgpt'))fail('CODEX_APP_ENVIRONMENT_REQUIRED');
    }else auth = await probeCodexBenchmarkHost({runCommand, signal});
    durable(join(directory, 'codex-host.json'), auth);
    if (!auth.logged_in || !auth.version) fail('CODEX_HOST_AUTH_REQUIRED');
    const inspected = await runCommand('docker', ['image', 'inspect', image.image_id], {timeoutMs: 15000, killProcessTree: true, abortSignal: signal});
    durable(join(directory, 'image-inspect.json'), inspected);
    if (inspected.outcome_uncertain || inspected.exit_code !== 0 || readImage(inspected)?.Id !== image.image_id) fail('CODEX_CHECK_IMAGE_PIN_MISMATCH');
    const code = "import sys,json,importlib.util,importlib.metadata as m; names=['httpx','attrs','jinja2','typer','ruamel.yaml','setuptools','pip']; print(json.dumps({'python':sys.version,'modules':{n:{'available':importlib.util.find_spec(n) is not None,'version':m.version(n)} for n in names}}))";
    const {raw, report, container_removed} = await runDagDockerCheck({image,
      check: {id: 'codex.environment', environment_ref: manifest.public_environment_ref, argv: ['python3', '-c', code]},
      candidateDirectory: directory, pinnedDirectory: directory, bindingDirectory: directory, runCommand,
      remaining: () => 30000, record, attemptId: 'environment-probe', abortSignal: signal,
      saveProcess: async value => durable(join(directory, 'probe-process.json'), value)});
    if (raw.exit_code !== 0 || !object(report.modules) || typeof report.python !== 'string' || report.python.split(' ')[0] !== expected.python
      || Object.entries(expected.preinstalled_dependencies).some(([name, version]) => report.modules[name]?.available !== true || report.modules[name]?.version !== version)) fail('CODEX_CHECK_DEPENDENCY_MISMATCH');
    environment = {...report, image_id: image.image_id, network: 'none', read_only: true, tmpfs: '/tmp:rw,exec,size=2g', container_removed};
    durable(join(directory, 'environment.json'), environment);
  }
  return {status: probe ? 'ready' : 'inspected_no_inference', live_ready: probe, blockers: [], paid_calls: 0,
    registry: read(join(rootDir, manifest.public_registry)), mapping, frozen_controls: frozen, image, environment, auth};
}

/** Only sanitized status escapes; CLI auth text can contain account/key information. */
export async function probeCodexBenchmarkHost({runCommand = processResult, signal} = {}) {
  const options = {timeoutMs: 15000, maxBytes: 65536, killProcessTree: true, abortSignal: signal};
  const version = await runCommand('codex', ['--version'], options);
  const status = await runCommand('codex', ['login', 'status'], options);
  const text = `${status.stdout ?? ''}\n${status.stderr ?? ''}`;
  const kind = /Logged in using ChatGPT/i.test(text) ? 'chatgpt' : /Logged in using an API key/i.test(text) ? 'api_key' : null;
  const parsedVersion = /^codex(?:-cli)?\s+([0-9]+\.[0-9]+\.[0-9]+(?:[-.][A-Za-z0-9]+)*)\s*$/m.exec(version.stdout ?? '')?.[1] ?? null;
  return {version: version.exit_code === 0 && version.outcome_uncertain === false ? parsedVersion : null,
    logged_in: status.exit_code === 0 && status.outcome_uncertain === false && kind !== null,
    auth_kind: kind, inference_calls: 0, model_availability_verified: false};
}

export function snapshotCodexCandidate(directory) {
  if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) fail('CODEX_GRADE_UNSAFE_CANDIDATE');
  const files = [];
  const walk = dir => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name), stat = lstatSync(path);
      if (stat.isSymbolicLink()) fail('CODEX_GRADE_UNSAFE_CANDIDATE');
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile() && stat.nlink === 1) files.push({path: relative(directory, path), bytes: stat.size, sha256: sha(readFileSync(path))});
      else fail('CODEX_GRADE_UNSAFE_CANDIDATE');
    }
  };
  walk(directory);
  return {files, sha256: sha(JSON.stringify(files))};
}

/** Hidden grade output remains root-owned; never forward this result to repair/model prompts. */
export async function gradeCodexE2ECandidate({rootDir = ROOT, runDirectory, candidateDirectory, publicPassed,
  developmentWallMs, gradeManifest = 'benchmarks/e2e-swe/manifests/openapi_python_client.cloud-4cpu.json',
  imageLock = 'benchmark-runs/d040-openapi-image-lock.json', runCommand = processResult, signal}) {
  const started = new Date(), began = performance.now();
  if (typeof publicPassed !== 'boolean' || !Number.isFinite(developmentWallMs) || developmentWallMs < 0) fail('CODEX_GRADE_INVALID_INPUT');
  const output = join(runDirectory, 'grade');
  if (existsSync(output) || existsSync(join(runDirectory, 'independent-evaluation.json')) || existsSync(join(runDirectory, 'grade-started.json'))) fail('CODEX_ALREADY_GRADED');
  const config = read(resolve(rootDir, gradeManifest));
  if (config.task_id !== 'openapi_python_client' || config.test_case_count !== 63 || !Number.isSafeInteger(config.verifier_timeout_sec) || config.verifier_timeout_sec < 1) fail('CODEX_GRADE_MANIFEST_INVALID');
  const sourcePaths = ['src/benchmark/codex-e2e-checks.mjs', 'benchmarks/e2e-swe/adapter.py', gradeManifest, imageLock,
    ...Object.keys(config.upstream_sha256 ?? {}).map(path => `.benchmarks/E2E-SWE/${path}`)].sort();
  const sourcePins = () => sourcePaths.map(path => ({path, sha256: sha(readFileSync(resolve(rootDir, path)))}));
  const sourcesBefore = sourcePins();
  durable(join(runDirectory, 'grade-sources-before.json'), sourcesBefore);
  const before = snapshotCodexCandidate(candidateDirectory);
  durable(join(runDirectory, 'candidate-before-grade.json'), before);
  const args = ['benchmarks/e2e-swe/adapter.py', '--manifest', gradeManifest, 'grade', '--workspace', candidateDirectory,
    '--image-lock', imageLock, '--output', output];
  durable(join(runDirectory, 'grade-started.json'), {started_at: started.toISOString(), command: 'python3', args,
    cwd: rootDir, candidate_sha256: before.sha256, model_calls: 0, automatic_retries: 0});
  let raw, error = null;
  try {
    raw = await runCommand('python3', args, {cwd: rootDir, maxBytes: 16 * 1024 * 1024,
      timeoutMs: Math.min((config.verifier_timeout_sec + 1800) * 1000, 2147483647), killProcessTree: true, abortSignal: signal});
  } catch (caught) { error = caught; raw = {exit_code: null, outcome_uncertain: true, error_code: 'GRADE_PROCESS_FAILED'}; }
  durable(join(runDirectory, 'grade-process.json'), raw);
  const after = snapshotCodexCandidate(candidateDirectory);
  durable(join(runDirectory, 'candidate-after-grade.json'), after);
  const sourcesAfter = sourcePins(), sourcesUnchanged = JSON.stringify(sourcesBefore) === JSON.stringify(sourcesAfter);
  durable(join(runDirectory, 'grade-sources-after.json'), sourcesAfter);
  let grade = null;
  try { grade = read(join(output, 'result.json')); } catch { /* Missing evidence is not success. */ }
  const summary = grade?.summary ?? null, unchanged = before.sha256 === after.sha256;
  const valid = !error && raw.exit_code === 0 && raw.outcome_uncertain === false && unchanged && sourcesUnchanged
    && grade?.container_removed === true && grade?.model_calls === 0 && grade?.network === 'none'
    && grade?.fresh_verifier === true && grade?.workspace === candidateDirectory
    && grade?.image?.image_id === read(resolve(rootDir, imageLock)).image_id;
  const complete = valid && grade.grading_status === 'completed' && grade.resolved === true
    && summary?.tests === 63 && summary.passed === 63 && ['failed', 'skipped', 'pending', 'other'].every(key => (summary[key] ?? 0) === 0);
  const wall = performance.now() - began, productSuccess = publicPassed && complete;
  const result = {schema_version: 'codex-e2e-independent-evaluation/v1', started_at: started.toISOString(), finished_at: new Date().toISOString(),
    candidate_path: candidateDirectory, candidate_sha256: before.sha256, candidate_unchanged: unchanged, grade_sources_unchanged: sourcesUnchanged,
    public_passed: publicPassed, independent_evidence_valid: valid, independent_completion: complete,
    product_success: productSuccess, development_wall_ms: developmentWallMs, grade_wall_ms: wall,
    successful_completion_wall_ms: productSuccess ? developmentWallMs + wall : null,
    completion_wall_ms: productSuccess ? developmentWallMs + wall : null,
    summary, grade_status: grade?.grading_status ?? 'missing', container_removed: grade?.container_removed ?? null,
    outcome_uncertain: raw.outcome_uncertain || grade?.container_removed !== true, model_calls: 0, automatic_retries: 0,
    grade_manifest: gradeManifest, grade_manifest_sha256: sha(readFileSync(resolve(rootDir, gradeManifest))),
    image_lock_sha256: sha(readFileSync(resolve(rootDir, imageLock))), latency_boundary: 'development_plus_independent_grading'};
  durable(join(runDirectory, 'independent-evaluation.json'), result);
  return result;
}
