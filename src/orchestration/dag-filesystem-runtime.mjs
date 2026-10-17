import {createHash} from 'node:crypto';
import {chmod, copyFile, lstat, mkdir, open, readFile, readdir, realpath, rename, writeFile} from 'node:fs/promises';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {validateDagPlan} from './dag-contracts.mjs';

const clone = value => structuredClone(value);
const fail = (code, detail = {}) => { throw Object.assign(new Error(code), {code, ...detail}); };
const uncertain = value => value?.outcome_uncertain === true || value?.outcomeUncertain === true ||
  value?.uncertain === true || ['uncertain', 'unknown'].includes(value?.status);
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
};
const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value)
  ? value : JSON.stringify(canonical(value))).digest('hex');
const overlap = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
const inside = (path, scope) => path === scope || path.startsWith(`${scope}/`);
const nonempty = value => typeof value === 'string' && value.length > 0 && value.trim() === value;

function pathName(value) {
  if (!nonempty(value) || isAbsolute(value) || value.normalize('NFC') !== value ||
      /[\\:%~*?\[\]{}#\u0000-\u001f\u007f]/u.test(value) ||
      value.split('/').some(segment => !segment || segment === '.' || segment === '..' || segment.trim() !== segment)) {
    fail('DAG_RUNTIME_INVALID_PATH', {path: value});
  }
  return value;
}

async function regularTree(root) {
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || await realpath(root) !== resolve(root)) fail('DAG_RUNTIME_PATH_ALIAS', {path: root});
  const files = [], directories = [], folded = new Set();
  async function visit(directory, prefix = '') {
    const names = (await readdir(directory)).sort();
    for (const name of names) {
      const path = pathName(prefix ? `${prefix}/${name}` : name);
      const key = path.toLowerCase();
      if (folded.has(key)) fail('DAG_RUNTIME_PATH_ALIAS', {path});
      folded.add(key);
      const absolute = join(directory, name), stat = await lstat(absolute);
      if (stat.isSymbolicLink()) fail('DAG_RUNTIME_SYMLINK', {path});
      if (stat.isDirectory()) {
        directories.push(path);
        await visit(absolute, path);
      } else if (stat.isFile()) {
        if (stat.nlink !== 1) fail('DAG_RUNTIME_HARDLINK', {path});
        const bytes = await readFile(absolute);
        files.push({path, size: bytes.length, sha256: digest(bytes), executable: !!(stat.mode & 0o111)});
      } else fail('DAG_RUNTIME_SPECIAL_FILE', {path});
    }
  }
  await visit(root);
  return {files: files.sort((a, b) => a.path.localeCompare(b.path)), directories: directories.sort()};
}

function subset(tree, paths) {
  for (const path of paths) {
    if (!tree.files.some(file => file.path === path) && !tree.directories.includes(path)) {
      fail('DAG_RUNTIME_ARTIFACT_MISSING', {path});
    }
  }
  const files = tree.files.filter(file => paths.some(path => inside(file.path, path)));
  const directories = tree.directories.filter(directory => paths.some(path => inside(directory, path)));
  if (!files.length) fail('DAG_RUNTIME_ARTIFACT_EMPTY');
  return {files, directories};
}

async function copyManifest(from, to, manifest) {
  await mkdir(to, {recursive: true, mode: 0o700});
  for (const path of manifest.directories) await mkdir(join(to, path), {recursive: true, mode: 0o700});
  for (const file of manifest.files) {
    const target = join(to, file.path);
    await mkdir(dirname(target), {recursive: true, mode: 0o700});
    try {
      const stat = await lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || digest(await readFile(target)) !== file.sha256) {
        fail('DAG_RUNTIME_INPUT_CONFLICT', {path: file.path});
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await copyFile(join(from, file.path), target);
      await chmod(target, file.executable ? 0o755 : 0o644);
    }
  }
}

async function readonly(root) {
  const tree = await regularTree(root);
  for (const file of tree.files) await chmod(join(root, file.path), file.executable ? 0o555 : 0o444);
  for (const directory of [...tree.directories].sort((a, b) => b.length - a.length)) await chmod(join(root, directory), 0o555);
  await chmod(root, 0o555);
}

async function syncDirectory(path) {
  const handle = await open(path, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

function validateBindings(plan, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== plan.artifacts.length) fail('DAG_RUNTIME_ARTIFACT_BINDINGS');
  const bindings = clone(input), seen = [];
  for (const artifact of plan.artifacts) {
    const binding = bindings[artifact.id];
    if (!binding || !Array.isArray(binding.paths) || !binding.paths.length) fail('DAG_RUNTIME_ARTIFACT_BINDINGS');
    const producer = plan.tasks.find(task => task.id === artifact.producer_task_id);
    for (const path of binding.paths) {
      pathName(path);
      if (!producer.write_scope.some(scope => inside(path, scope))) fail('DAG_RUNTIME_OUTPUT_SCOPE', {artifact_id: artifact.id, path});
      if (seen.some(other => overlap(path.toLowerCase(), other.toLowerCase()))) fail('DAG_RUNTIME_BINDING_ALIAS', {path});
      seen.push(path);
    }
  }
  return bindings;
}

function checkWrites(before, after, task) {
  const previous = new Map(before.files.map(file => [file.path, file]));
  const next = new Map(after.files.map(file => [file.path, file]));
  for (const path of new Set([...previous.keys(), ...next.keys()])) {
    if (!isDeepStrictEqual(previous.get(path), next.get(path)) && !task.write_scope.some(scope => inside(path, scope))) {
      fail('DAG_RUNTIME_UNDECLARED_WRITE', {path});
    }
  }
  const oldDirectories = new Set(before.directories), newDirectories = new Set(after.directories);
  for (const path of new Set([...oldDirectories, ...newDirectories])) {
    if (oldDirectories.has(path) !== newDirectories.has(path) && !task.write_scope.some(scope => overlap(path, scope))) {
      fail('DAG_RUNTIME_UNDECLARED_WRITE', {path});
    }
  }
}

/** Real files and a durable no-replay boundary; process containment is supplied
 * by executeTask/checkTask, not by lexical path checks or readonly file modes. */
export async function createDagFilesystemRuntime(options) {
  let plan = validateDagPlan(options.plan);
  let bindings = validateBindings(plan, options.artifactBindings);
  const {run_id, executeTask, checkTask, probeEnvironment} = options;
  if (!nonempty(run_id) || !nonempty(options.runDirectory) || !nonempty(options.environment?.id) ||
      [executeTask, checkTask, probeEnvironment].some(callback => typeof callback !== 'function') ||
      (options.record !== undefined && typeof options.record !== 'function') ||
      !Array.isArray(options.checkerFiles) || !options.checkerFiles.length) fail('DAG_RUNTIME_INVALID_CONFIG');
  if (plan.checks.some(check => check.environment_ref !== options.environment.id)) fail('DAG_RUNTIME_ENVIRONMENT_MISMATCH');
  const environmentId = options.environment.id, forwardRecord = options.record ?? (async () => {});
  const requestedRoot = resolve(options.runDirectory);
  let root = join(requestedRoot, 'runtime'), initialized = false, journalHandle, journalQueue = Promise.resolve();
  let sequence = 0, previousHash = null, environment, pinManifest, bindingDigest, finalized = false;
  let planHash = digest(plan);
  const attempts = new Map(), published = new Map();
  const pins = options.checkerFiles.map(file => {
    const source = typeof file === 'string' ? file : file.path;
    const path = typeof file === 'string' ? relative(resolve(options.checkerRoot ?? dirname(source)), resolve(source)).split(sep).join('/') : file.relative_path;
    if (!isAbsolute(source)) fail('DAG_RUNTIME_CHECKER_PATH');
    return {source: resolve(source), path: pathName(path)};
  });
  if (new Set(pins.map(pin => pin.path.toLowerCase())).size !== pins.length) fail('DAG_RUNTIME_CHECKER_ALIAS');

  async function append(event) {
    const operation = journalQueue.then(async () => {
      if (!journalHandle) fail('DAG_RUNTIME_NOT_INITIALIZED');
      const body = {sequence: ++sequence, previous_hash: previousHash, run_id, at: new Date().toISOString(), ...clone(event)};
      const entry = {...body, hash: digest(body)};
      await journalHandle.write(`${JSON.stringify(entry)}\n`);
      await journalHandle.sync();
      previousHash = entry.hash;
    });
    journalQueue = operation.catch(() => {});
    return operation;
  }
  async function journalState() {
    let text;
    try { text = await readFile(join(root, 'journal.jsonl'), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return {status: 'absent', replay_allowed: false, unresolved: []}; throw error; }
    try {
      if (!text.endsWith('\n')) throw Error('partial journal line');
      let prior = null, expected = 1;
      const operations = new Map();
      for (const line of text.trimEnd().split('\n')) {
        const {hash, ...entry} = JSON.parse(line);
        if (entry.sequence !== expected++ || entry.previous_hash !== prior || digest(entry) !== hash || entry.run_id !== run_id) throw Error('journal integrity');
        prior = hash;
        if (entry.operation_id && entry.phase === 'started') operations.set(entry.operation_id, entry);
        if (entry.operation_id && ['completed', 'failed', 'blocked'].includes(entry.phase) && !entry.outcome_uncertain) operations.delete(entry.operation_id);
        if (entry.operation_id && (entry.phase === 'uncertain' || entry.outcome_uncertain)) operations.set(entry.operation_id, entry);
      }
      return {status: operations.size ? 'uncertain' : 'recorded', replay_allowed: false, unresolved: [...operations.values()], entries: expected - 1};
    } catch (error) {
      return {status: 'invalid', replay_allowed: false, unresolved: [], error: error.message};
    }
  }
  function ready() { if (!initialized || finalized) fail('DAG_RUNTIME_NOT_ACTIVE'); }
  async function probe() {
    const observed = await probeEnvironment();
    if (!observed || typeof observed !== 'object' || !Object.keys(observed).length) fail('DAG_RUNTIME_ENVIRONMENT_UNPROVEN');
    return {id: environmentId, fingerprint: digest(observed), observed: clone(observed)};
  }
  async function checkPins() {
    const actual = [];
    for (const pin of pins) {
      const source = await lstat(pin.source);
      if (!source.isFile() || source.isSymbolicLink() || source.nlink !== 1 || await realpath(pin.source) !== pin.source) {
        fail('DAG_RUNTIME_CHECKER_ALIAS', {path: pin.path});
      }
      actual.push({path: pin.path, sha256: digest(await readFile(pin.source))});
    }
    const frozen = await regularTree(join(root, 'pinned'));
    const pinned = frozen.files.map(file => ({path: file.path, sha256: file.sha256}));
    if (!isDeepStrictEqual(actual, pinManifest) || !isDeepStrictEqual(pinned, [...pinManifest].sort((a, b) => a.path.localeCompare(b.path)))) {
      fail('DAG_RUNTIME_CHECKER_DRIFT');
    }
    if ((await probe()).fingerprint !== environment.fingerprint) fail('DAG_RUNTIME_ENVIRONMENT_DRIFT');
  }
  async function initialize() {
    if (initialized) fail('DAG_RUNTIME_ALREADY_INITIALIZED');
    await mkdir(requestedRoot, {recursive: true, mode: 0o700});
    root = join(await realpath(requestedRoot), 'runtime');
    try { await mkdir(root, {mode: 0o700}); }
    catch (error) {
      if (error.code === 'EEXIST') fail('DAG_RUNTIME_RESTART_BLOCKED', {journal_state: await journalState(), outcome_uncertain: true});
      throw error;
    }
    journalHandle = await open(join(root, 'journal.jsonl'), 'wx', 0o600);
    await syncDirectory(root);
    await syncDirectory(dirname(root));
    await append({event: 'runtime_initialize', operation_id: 'initialize', phase: 'started', plan_hash: planHash});
    await Promise.all(['attempts', 'published', 'pinned', 'manifests'].map(name => mkdir(join(root, name), {mode: 0o700})));
    pinManifest = [];
    for (const pin of pins) {
      const stat = await lstat(pin.source);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || await realpath(pin.source) !== pin.source) fail('DAG_RUNTIME_CHECKER_ALIAS');
      const bytes = await readFile(pin.source), destination = join(root, 'pinned', pin.path);
      await mkdir(dirname(destination), {recursive: true, mode: 0o700});
      await writeFile(destination, bytes, {flag: 'wx', mode: stat.mode & 0o111 ? 0o555 : 0o444});
      pinManifest.push({path: pin.path, sha256: digest(bytes)});
    }
    await readonly(join(root, 'pinned'));
    environment = await probe();
    bindingDigest = digest({pinManifest, environment, plan_hash: planHash, artifact_bindings: bindings});
    await writeFile(join(root, 'binding.json'), JSON.stringify({schema_version: 'dag-filesystem-binding/v1', run_id,
      plan, plan_hash: planHash, artifact_bindings: bindings, checker_manifest: pinManifest, environment, binding_digest: bindingDigest}, null, 2), {flag: 'wx', mode: 0o444});
    initialized = true;
    await append({event: 'runtime_initialize', operation_id: 'initialize', phase: 'completed', binding_digest: bindingDigest});
    return {root, pinnedDirectory: join(root, 'pinned'), environment: clone(environment), binding_digest: bindingDigest};
  }
  function taskFor(task) {
    const current = plan.tasks.find(candidate => candidate.id === task?.id);
    if (!current || !isDeepStrictEqual(current, task)) fail('DAG_RUNTIME_PLAN_MISMATCH');
    return current;
  }
  function attemptFor(task, attempt_id) {
    const attempt = attempts.get(attempt_id);
    if (!attempt || attempt.task.id !== task.id || attempt.plan_hash !== planHash) fail('DAG_RUNTIME_ATTEMPT_MISMATCH');
    return attempt;
  }
  async function currentPublished(id) {
    const item = published.get(id);
    if (!item) fail('DAG_RUNTIME_INPUT_UNPUBLISHED', {artifact_id: id});
    const tree = await regularTree(item.directory);
    if (!isDeepStrictEqual(tree, item.tree_manifest)) fail('DAG_RUNTIME_PUBLISHED_DRIFT', {artifact_id: id});
    const actual = subset(tree, bindings[id].paths);
    if (digest(actual) !== item.revision) fail('DAG_RUNTIME_PUBLISHED_DRIFT', {artifact_id: id});
    return item;
  }
  async function auditAttempt(attempt) {
    const inputs = await regularTree(attempt.inputDirectory);
    if (!isDeepStrictEqual(inputs, attempt.input_manifest)) fail('DAG_RUNTIME_INPUT_MUTATED');
    for (const id of attempt.task.input_artifact_ids) await currentPublished(id);
    const current = await regularTree(attempt.stageDirectory);
    const staged = new Map(current.files.map(file => [file.path, file]));
    if (attempt.baseline.files.some(file => !isDeepStrictEqual(staged.get(file.path), file))) fail('DAG_RUNTIME_STAGED_INPUT_MUTATED');
    if (attempt.status === 'prepared' && !isDeepStrictEqual(current, attempt.baseline)) fail('DAG_RUNTIME_PREPARED_STAGE_DRIFT');
    checkWrites(attempt.baseline, current, attempt.task);
    if (attempt.candidate_manifest && !isDeepStrictEqual(attempt.candidate_manifest, current)) fail('DAG_RUNTIME_CANDIDATE_DRIFT');
    return current;
  }
  async function prepare(task, attempt_id) {
    if (!nonempty(attempt_id) || attempts.has(attempt_id) || [...attempts.values()].some(value => value.task.id === task.id)) fail('DAG_RUNTIME_ATTEMPT_REPLAY');
    const directory = join(root, 'attempts', digest(attempt_id));
    const stageDirectory = join(directory, 'workspace'), inputDirectory = join(directory, 'inputs');
    await mkdir(directory, {mode: 0o700});
    await mkdir(stageDirectory); await mkdir(inputDirectory);
    const inputRevisions = {};
    for (const id of task.input_artifact_ids) {
      const artifact = await currentPublished(id);
      for (const file of artifact.manifest.files) {
        if (!task.read_scope.some(scope => inside(file.path, scope))) fail('DAG_RUNTIME_INPUT_SCOPE', {path: file.path});
      }
      await copyManifest(artifact.directory, inputDirectory, artifact.manifest);
      await copyManifest(artifact.directory, stageDirectory, artifact.manifest);
      inputRevisions[id] = artifact.revision;
    }
    await readonly(inputDirectory);
    const baseline = await regularTree(stageDirectory);
    if (task.kind === 'verification') await readonly(stageDirectory);
    const attempt = {task: clone(task), attempt_id, plan_hash: planHash, stageDirectory, inputDirectory,
      baseline, input_manifest: await regularTree(inputDirectory), input_revisions: inputRevisions,
      candidate_manifest: task.kind === 'verification' ? baseline : null, output_revisions: {}, checks: new Map(), status: 'prepared'};
    attempts.set(attempt_id, attempt);
    await append({event: 'task_prepared', task_id: task.id, attempt_id, stage_directory: stageDirectory, input_revisions: inputRevisions});
    return attempt;
  }
  async function execute(task, context) {
    ready(); taskFor(task);
    if (context.plan && digest(context.plan) !== planHash) fail('DAG_RUNTIME_PLAN_MISMATCH');
    const attempt = attemptFor(task, context.attempt_id);
    if (attempt.status !== 'prepared' || task.kind !== 'implementation' ||
        !isDeepStrictEqual(context.input_artifact_revisions, attempt.input_revisions)) fail('DAG_RUNTIME_ATTEMPT_REPLAY');
    const operation_id = `${context.attempt_id}:worker`;
    await append({event: 'worker', task_id: task.id, attempt_id: context.attempt_id, operation_id, phase: 'started'});
    try {
      await checkPins();
      await auditAttempt(attempt);
    } catch (error) {
      attempt.status = 'failed';
      await append({event: 'worker', task_id: task.id, attempt_id: context.attempt_id, operation_id,
        phase: 'failed', outcome_uncertain: false, code: error?.code ?? 'INPUT_AUDIT_FAILED'});
      throw error;
    }
    attempt.status = 'running';
    let result;
    try {
      result = await executeTask(clone(task), {...clone(context), stageDirectory: attempt.stageDirectory,
        inputDirectory: attempt.inputDirectory, workspace: attempt.stageDirectory});
    } catch (error) {
      if (error?.code === 'WORKER_PROFILE_BLOCKED' && error.status === 'blocked'
          && error.dispatch_started === false && error.outcome_uncertain === false) {
        attempt.status = 'blocked';
        await append({event:'worker',task_id:task.id,attempt_id:context.attempt_id,operation_id,
          phase:'blocked',outcome_uncertain:false,dispatch_started:false,code:error.code});
        throw error;
      }
      attempt.status = 'uncertain';
      await append({event: 'worker', task_id: task.id, attempt_id: context.attempt_id, operation_id, phase: 'uncertain', outcome_uncertain: true, code: error?.code ?? 'WORKER_CALLBACK_THROW'});
      fail('DAG_RUNTIME_WORKER_UNCERTAIN', {outcome_uncertain: true, cause: error});
    }
    if (result?.status !== 'completed' || uncertain(result)) {
      attempt.status = uncertain(result) ? 'uncertain' : 'failed';
      await append({event: 'worker', task_id: task.id, attempt_id: context.attempt_id, operation_id,
        phase: attempt.status, outcome_uncertain: uncertain(result)});
      return uncertain(result) ? {...clone(result), outcome_uncertain: true} : clone(result);
    }
    try {
      const tree = await auditAttempt(attempt);
      for (const id of task.output_artifact_ids) attempt.output_revisions[id] = digest(subset(tree, bindings[id].paths));
      attempt.candidate_manifest = tree;
      await readonly(attempt.stageDirectory);
      attempt.status = 'executed';
    } catch (error) {
      attempt.status = 'failed';
      await append({event: 'worker', task_id: task.id, attempt_id: context.attempt_id, operation_id, phase: 'failed', outcome_uncertain: false, code: error?.code ?? 'OUTPUT_AUDIT_FAILED'});
      throw error;
    }
    await append({event: 'worker', task_id: task.id, attempt_id: context.attempt_id, operation_id, phase: 'completed', output_revisions: attempt.output_revisions});
    return {status: 'completed'};
  }
  async function getRevision(id, context = {}) {
    ready();
    if (context.plan && digest(context.plan) !== planHash) fail('DAG_RUNTIME_PLAN_MISMATCH');
    const task = context.task;
    if (task && context.attempt_id) {
      taskFor(task);
      const attempt = attemptFor(task, context.attempt_id);
      await auditAttempt(attempt);
      if (task.output_artifact_ids.includes(id)) {
        if (!attempt.output_revisions[id]) fail('DAG_RUNTIME_OUTPUT_UNREADY', {artifact_id: id});
        return attempt.output_revisions[id];
      }
      if (!task.input_artifact_ids.includes(id)) fail('DAG_RUNTIME_ARTIFACT_OUTSIDE_TASK');
    }
    return (await currentPublished(id)).revision;
  }
  async function runCheck(check, context) {
    ready();
    const actualCheck = plan.checks.find(candidate => candidate.id === check.id);
    if (!isDeepStrictEqual(check, actualCheck)) fail('DAG_RUNTIME_CHECK_MISMATCH');
    const task = taskFor(context.task), attempt = attemptFor(task, context.attempt_id);
    if (!task.check_ids.includes(check.id) || attempt.checks.has(check.id)) fail('DAG_RUNTIME_CHECK_REPLAY');
    await auditAttempt(attempt);
    const revisions = {...attempt.input_revisions, ...attempt.output_revisions};
    if (!isDeepStrictEqual(revisions, context.artifact_revisions)) fail('DAG_RUNTIME_REVISION_MISMATCH');
    const operation_id = `${context.attempt_id}:check:${check.id}`;
    await append({event: 'check', task_id: task.id, attempt_id: context.attempt_id, check_id: check.id, operation_id, phase: 'started'});
    attempt.checks.set(check.id, 'started');
    let result, dispatched = false, received = false;
    try {
      await checkPins();
      await auditAttempt(attempt);
      dispatched = true;
      result = await checkTask(clone(check), {task: clone(task), attempt_id: context.attempt_id,
        candidateDirectory: attempt.stageDirectory, inputDirectory: attempt.inputDirectory,
        pinnedDirectory: join(root, 'pinned'), artifact_revisions: clone(revisions), environment: clone(environment),
        binding_digest: bindingDigest});
      received = true;
      await auditAttempt(attempt);
      await checkPins();
      if (!result || result.check_id !== check.id || result.check_version !== check.version || result.environment_ref !== environment.id ||
          (result.artifact_revisions != null && !isDeepStrictEqual(result.artifact_revisions, revisions))) fail('DAG_RUNTIME_CHECK_EVIDENCE_MISMATCH');
      const passed = result.status === 'passed' && result.executed === true && result.exit_code === 0 &&
        Number.isSafeInteger(result.assertions) && result.assertions > 0 && result.skipped === 0 && result.outcome_uncertain === false && !uncertain(result);
      attempt.checks.set(check.id, passed ? 'passed' : uncertain(result) ? 'uncertain' : 'failed');
      await append({event: 'check', task_id: task.id, attempt_id: context.attempt_id, check_id: check.id, operation_id,
        phase: passed ? 'completed' : uncertain(result) ? 'uncertain' : 'failed', outcome_uncertain: uncertain(result)});
      const runtime_binding = {binding_digest: bindingDigest, checker_manifest_sha256: digest(pinManifest),
        environment_fingerprint: environment.fingerprint, plan_hash: planHash};
      const evidence_key = digest({check_id: check.id, check_version: check.version, artifact_revisions: revisions, runtime_binding});
      return {...clone(result), ...(uncertain(result) ? {outcome_uncertain: true} : {}),
        artifact_revisions: clone(revisions), runtime_binding, evidence_key};
    } catch (error) {
      const outcome_uncertain = (dispatched && !received) || uncertain(error);
      attempt.checks.set(check.id, outcome_uncertain ? 'uncertain' : 'failed');
      await append({event: 'check', task_id: task.id, attempt_id: context.attempt_id, check_id: check.id,
        operation_id, phase: outcome_uncertain ? 'uncertain' : 'failed', outcome_uncertain, code: error?.code ?? 'CHECK_CALLBACK_THROW'});
      throw Object.assign(new Error(error?.code ?? 'DAG_RUNTIME_CHECK_UNCERTAIN'), {code: error?.code ?? 'DAG_RUNTIME_CHECK_UNCERTAIN', outcome_uncertain, cause: error});
    }
  }
  async function publish(attempt) {
    if (attempt.status === 'published' || attempt.task.check_ids.some(id => attempt.checks.get(id) !== 'passed')) fail('DAG_RUNTIME_UNVERIFIED_PUBLISH');
    const tree = await auditAttempt(attempt);
    await checkPins();
    for (const id of attempt.task.output_artifact_ids) {
      if (published.has(id)) fail('DAG_RUNTIME_ARTIFACT_REPLAY');
      const manifest = subset(tree, bindings[id].paths), revision = digest(manifest);
      if (revision !== attempt.output_revisions[id]) fail('DAG_RUNTIME_CANDIDATE_DRIFT');
      const temporary = join(root, 'published', `.pending-${digest(id)}`), directory = join(root, 'published', digest(id));
      await copyManifest(attempt.stageDirectory, temporary, manifest);
      const tree_manifest = await regularTree(temporary);
      if (digest(subset(tree_manifest, bindings[id].paths)) !== revision) fail('DAG_RUNTIME_COPY_DRIFT');
      await readonly(temporary);
      await rename(temporary, directory);
      await writeFile(join(root, 'manifests', `${digest(id)}.json`), JSON.stringify({artifact_id: id, producer_task_id: attempt.task.id,
        attempt_id: attempt.attempt_id, revision, manifest, tree_manifest, binding_digest: bindingDigest}, null, 2), {flag: 'wx', mode: 0o444});
      published.set(id, {directory, revision, manifest, tree_manifest, producer_task_id: attempt.task.id});
      await append({event: 'artifact_published', artifact_id: id, revision, attempt_id: attempt.attempt_id});
    }
    attempt.status = 'published';
  }
  async function record(event) {
    ready();
    if (event.run_id !== run_id || event.graph_revision !== plan.graph_revision) fail('DAG_RUNTIME_EVENT_MISMATCH');
    if (event.event === 'dag_task_started') {
      const task = plan.tasks.find(task => task.id === event.task_id);
      if (!task) fail('DAG_RUNTIME_TASK_UNKNOWN');
      await append({event: 'task_attempt', task_id: task.id, attempt_id: event.attempt_id, operation_id: event.attempt_id, phase: 'started'});
      await prepare(task, event.attempt_id);
    }
    if (event.event === 'dag_task_completed') {
      const task = plan.tasks.find(task => task.id === event.task_id);
      await publish(attemptFor(task, event.attempt_id));
      await append({event: 'task_attempt', task_id: task.id, attempt_id: event.attempt_id, operation_id: event.attempt_id, phase: 'completed'});
    }
    if (event.event === 'dag_task_failed') {
      const attempt = attempts.get(event.attempt_id);
      const blocked = event.status === 'blocked' && event.code === 'WORKER_PROFILE_BLOCKED' && !event.outcome_uncertain;
      if (attempt) attempt.status = event.outcome_uncertain ? 'uncertain' : blocked ? 'blocked' : 'failed';
      await append({event: 'task_attempt', task_id: event.task_id, attempt_id: event.attempt_id, operation_id: event.attempt_id,
        phase: event.outcome_uncertain ? 'uncertain' : blocked ? 'blocked' : 'failed', outcome_uncertain: !!event.outcome_uncertain});
    }
    await append({event: 'workflow_event', payload: clone(event)});
    await forwardRecord(clone(event));
  }
  async function bindPlan(nextPlan, next = {}) {
    ready();
    if ([...attempts.values()].some(attempt => !['published', 'failed'].includes(attempt.status))) fail('DAG_RUNTIME_ACTIVE_PLAN_CHANGE');
    const validated = validateDagPlan(nextPlan), nextBindings = validateBindings(validated, next.artifactBindings ?? bindings);
    for (const attempt of attempts.values()) if (attempt.status === 'published') {
      if (!isDeepStrictEqual(validated.tasks.find(task => task.id === attempt.task.id), attempt.task) ||
          attempt.task.check_ids.some(id => !isDeepStrictEqual(validated.checks.find(check => check.id === id), plan.checks.find(check => check.id === id)))) {
        fail('DAG_RUNTIME_COMPLETED_PLAN_CHANGE');
      }
    }
    for (const [id, artifact] of published) {
      if (!isDeepStrictEqual(bindings[id], nextBindings[id]) ||
          validated.artifacts.find(value => value.id === id)?.producer_task_id !== artifact.producer_task_id ||
          !isDeepStrictEqual(validated.tasks.find(value => value.id === artifact.producer_task_id), plan.tasks.find(value => value.id === artifact.producer_task_id))) {
        fail('DAG_RUNTIME_COMPLETED_PLAN_CHANGE');
      }
    }
    if (validated.checks.some(check => check.environment_ref !== environmentId)) fail('DAG_RUNTIME_ENVIRONMENT_MISMATCH');
    plan = validated; bindings = nextBindings; planHash = digest(plan);
    bindingDigest = digest({pinManifest, environment, plan_hash: planHash, artifact_bindings: bindings});
    await append({event: 'plan_bound', plan, plan_hash: planHash, artifact_bindings: bindings, binding_digest: bindingDigest});
    return {plan: clone(plan), binding_digest: bindingDigest};
  }
  async function finalize(result) {
    ready();
    if (result?.status === 'completed' && published.size !== plan.artifacts.length) fail('DAG_RUNTIME_INCOMPLETE_PUBLICATION');
    await checkPins();
    const candidateDirectory = join(root, 'candidate');
    await mkdir(candidateDirectory, {mode: 0o700});
    for (const id of published.keys()) {
      const artifact = await currentPublished(id);
      await copyManifest(artifact.directory, candidateDirectory, artifact.manifest);
    }
    await readonly(candidateDirectory);
    const summary = {candidateDirectory, artifact_revisions: Object.fromEntries([...published].map(([id, value]) => [id, value.revision])),
      binding_digest: bindingDigest, environment: clone(environment), plan_hash: planHash, status: result?.status ?? 'failed'};
    await append({event: 'runtime_finalized', ...summary});
    finalized = true;
    await journalHandle.close(); journalHandle = null;
    return {...summary, journal: await journalState()};
  }
  async function close() { await journalQueue; if (journalHandle) { await journalHandle.close(); journalHandle = null; } }
  return {initialize, execute, runCheck, getRevision, record, finalize, journalState, bindPlan, close};
}
