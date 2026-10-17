import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, realpathSync, symlinkSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createCodexArtifactWorker, validCodexArtifacts} from '../src/benchmark/codex-artifact-worker.mjs';
import {runCodexAttempt} from '../src/benchmark/codex-provider.mjs';

const limits = {maxFileBytes: 1000, maxTotalBytes: 2000};
function fixture(t, overrides = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'codex-artifacts-')));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const stage = join(dir, 'stage'); mkdirSync(stage);
  const receipts = [], events = [], calls = [];
  const config = {directory: dir, input: {source_ref: {sha256: 'public'}, source: 'Public specification',
    requirement_descriptions: [{id: 'r1', text: 'Implement public behavior'}]}, catalog: {files: ['a.py']},
    manifest: {limits: {max_file_bytes: limits.maxFileBytes, max_total_bytes: limits.maxTotalBytes}},
    model: 'fixed-model', effort: 'high', spend: true, onReceipt: r => receipts.push(r), record: e => events.push(e)};
  const answer = {files: [{path: 'a.py', content: 'print("done")\n'}], summary: 'Implemented public behavior.'};
  const invoke = async args => {
    calls.push(args);
    return runCodexAttempt({...args, run: async (_command, argv, options) => {
      const text = [overrides.tool ? {type: 'item.completed', item: {type: 'command_execution'}} : null,
        {type: 'turn.completed', usage: {input_tokens: 50, cached_input_tokens: 10, output_tokens: 30}}]
        .filter(Boolean).map(row => JSON.stringify(row)).join('\n');
      options.onStdout(Buffer.from(text));
      writeFileSync(argv[argv.indexOf('--output-last-message') + 1], JSON.stringify(overrides.answer ?? answer));
      return {stdout: text, exit_code: 0, outcome_uncertain: Boolean(overrides.uncertain)};
    }});
  };
  return {dir, stage, receipts, events, calls, config, invoke,
    task: {id: 'n1', requirement_ids: ['r1'], read_scope: [], write_scope: ['a.py']},
    worker: {stageDirectory: stage, operation: 'implementation', attempt_id: 'a1', round_index: 0, original_task_id: 'n1'}};
}

test('controller persists exact scoped file output and durable receipts; CLI never receives staging cwd', async t => {
  const f = fixture(t);
  const result = await createCodexArtifactWorker({...f.config, runCodex: f.invoke})(f.task, f.worker);
  assert.equal(result.status, 'completed'); assert.equal(readFileSync(join(f.stage, 'a.py'), 'utf8'), 'print("done")\n');
  assert.notEqual(f.calls[0].cwd, f.stage); assert.ok(!f.calls[0].cwd.startsWith(f.dir + '/'));
  assert.equal(existsSync(f.calls[0].cwd), false);
  assert.equal(JSON.parse(readFileSync(join(f.dir, f.receipts[0].workspace_cleanup_receipt))).status, 'removed_empty');
  assert.equal(f.calls[0].role, 'decision'); assert.equal(f.receipts[0].logical_role, 'worker');
  assert.equal(f.receipts[0].provider.usage.total_tokens, 80);
  assert.equal(f.receipts[0].provider.actual_billed_usd, null);
  assert.ok(readFileSync(join(f.dir, result.artifact_journal), 'utf8').includes('write_finished'));
  assert.equal(f.events.at(-1).event, 'codex_worker_completed');
});

test('full answer validation rejects duplicate, unauthorized and oversized files before writes', async t => {
  for (const answer of [
    {files: [{path: '../outside.py', content: 'bad'}], summary: 'bad'},
    {files: [{path: 'a.py', content: 'x'.repeat(1001)}], summary: 'bad'},
    {files: [{path: 'a.py', content: 'a'}, {path: 'a.py', content: 'b'}], summary: 'bad'},
  ]) {
    const f = fixture(t, {answer});
    const result = await createCodexArtifactWorker({...f.config, runCodex: f.invoke})(f.task, f.worker);
    assert.equal(result.status, 'failed'); assert.equal(existsSync(join(f.stage, 'a.py')), false);
    assert.equal(f.receipts[0].provider.status, 'failed');
  }
  assert.equal(validCodexArtifacts({files: [{path: 'a', content: '한글'}], summary: ''}, ['a'], {maxFileBytes: 5, maxTotalBytes: 5}), false);
  assert.equal(validCodexArtifacts({files: [{path: 'a', content: '\ud800'}], summary: ''}, ['a'], limits), false);
});

test('tool-using model answer cannot write artifacts and usage is retained', async t => {
  const f = fixture(t, {tool: true});
  const result = await createCodexArtifactWorker({...f.config, runCodex: f.invoke})(f.task, f.worker);
  assert.equal(result.status, 'failed'); assert.equal(existsSync(join(f.stage, 'a.py')), false);
  assert.equal(f.receipts[0].provider.usage.total_tokens, 80);
});

test('repair includes pinned read-only dependency and preserves inherited file', async t => {
  const f = fixture(t), dependency = join(f.dir, 'dependency'); mkdirSync(dependency);
  writeFileSync(join(dependency, 'helper.py'), 'def helper(): pass\n');
  writeFileSync(join(f.stage, 'a.py'), 'old\n'); writeFileSync(join(f.stage, 'inherited.py'), 'unchanged\n');
  const source = {root: dependency, path: 'helper.py', sha256: createHash('sha256').update('def helper(): pass\n').digest('hex')};
  const worker = {...f.worker, operation: 'repair', repair_context: {artifact_repair: {public_failure: 'assertion'}}, additional_read_sources: [source]};
  await createCodexArtifactWorker({...f.config, runCodex: f.invoke})(f.task, worker);
  assert.match(f.calls[0].prompt, /def helper\(\): pass/); assert.match(f.calls[0].prompt, /public_failure/);
  assert.equal(f.calls[0].prompt.includes(dependency), false);
  assert.equal(readFileSync(join(f.stage, 'inherited.py'), 'utf8'), 'unchanged\n');
});

test('opt-in projection reaches the provider once with scoped bodies, complete failure evidence and unchanged output authority', async t => {
  for (const inputPolicy of ['dependency-closed-v1', 'artifact-family-closed-v2']) {
  const f = fixture(t), dependency = join(f.dir, 'dependency'); mkdirSync(dependency);
  const bodies = {'helper.py': 'def helper(): pass\n', 'unrelated.py': '# verified but outside dependency closure\n'.repeat(100)};
  const sources = Object.entries(bodies).map(([path, content]) => {
    writeFileSync(join(dependency, path), content);
    return {root: dependency, path, sha256: createHash('sha256').update(content).digest('hex')};
  });
  writeFileSync(join(f.stage, 'a.py'), 'old\n'); f.task.read_scope = ['helper.py'];
  const failure = {outcome_uncertain: false, failed_task_ids: [], undispatched_task_ids: [],
    public_evidence_defaults: {executed: true, outcome_uncertain: false},
    public_evidence: [{check_id: 'public.api', status: 'failed', evidence: {error: null, unexecuted_test_ids: [],
      cases: [{test_id: 'T.R10.03', status: 'failed', message: 'sections need blank lines'}]}}],
    repair_scope: {observed_failures: [{check_id: 'public.api', test_id: 'T.R10.03'}], unresolved: [], unexecuted: []}};
  const worker = {...f.worker, operation: 'repair', additional_read_sources: sources,
    repair_context: {artifact_repair: {failure, allowed_write_paths: ['a.py'], requirement_descriptions: [{id: 'r1', text: 'Preserve body descriptions.'}]}}};
  const manifest = {...f.config.manifest, limits: {max_file_bytes: 10000, max_total_bytes: 20000},
    repair_efficiency: {worker_input_projection: inputPolicy, public_guidance: 'google-docstring-v1'}};
  f.task.requirement_ids.push('R10.03');
  const result = await createCodexArtifactWorker({...f.config, manifest, runCodex: f.invoke})(f.task, worker);
  assert.equal(result.status, 'completed'); assert.equal(f.calls.length, 1);
  const packet = JSON.parse(f.calls[0].prompt.slice(f.calls[0].prompt.indexOf('\n') + 1));
  assert.deepEqual(packet.available_files.map(file => file.path), ['a.py', 'helper.py']);
  assert.deepEqual(packet.artifact_repair.failure, failure); assert.deepEqual(packet.writable_paths, ['a.py']);
  assert.equal(packet.public_docstring_guidance.policy, 'google-docstring-v1');
  assert.equal(packet.omitted_readable_files[0].path, 'unrelated.py');
  assert.ok(!f.calls[0].prompt.includes('verified but outside dependency closure'));
  const prepared = f.events.find(event => event.event === 'codex_worker_prepared');
  const folder = join(f.dir, 'codex-workers', prepared.id);
  assert.equal(JSON.parse(readFileSync(join(folder, 'worker-input-original.json'))).available_files.length, 3);
  assert.equal(JSON.parse(readFileSync(join(folder, 'worker-input-projection.json'))).omitted_file_count, 1);
  assert.equal(readFileSync(join(f.stage, 'a.py'), 'utf8'), 'print("done")\n');
  assert.equal(readFileSync(join(dependency, 'unrelated.py'), 'utf8'), bodies['unrelated.py']);
  }
});

test('unsafe writable symlink and changed read pin stop before model dispatch', async t => {
  for (const scenario of ['symlink', 'pin']) {
    const f = fixture(t), dependency = join(f.dir, 'dependency'); mkdirSync(dependency);
    writeFileSync(join(dependency, 'a.py'), 'secret');
    writeFileSync(join(dependency, 'dep.py'), 'changed dependency');
    let worker = f.worker;
    if (scenario === 'symlink') symlinkSync(join(dependency, 'a.py'), join(f.stage, 'a.py'));
    else worker = {...worker, additional_read_sources: [{root: dependency, path: 'dep.py', sha256: '0'.repeat(64)}]};
    const result = await createCodexArtifactWorker({...f.config, runCodex: f.invoke})(f.task, worker);
    assert.equal(result.status, 'failed'); assert.equal(f.calls.length, 0);
    assert.equal(readFileSync(join(dependency, 'a.py'), 'utf8'), 'secret');
  }
});

test('uncertain provider outcome propagates without writes or retry; receipt remains attributable', async t => {
  const f = fixture(t, {uncertain: true});
  await assert.rejects(createCodexArtifactWorker({...f.config, runCodex: f.invoke})(f.task, f.worker), error => error.outcome_uncertain === true);
  assert.equal(f.calls.length, 1); assert.equal(f.receipts[0].status, 'uncertain');
  assert.equal(existsSync(join(f.stage, 'a.py')), false);
});

test('downstream recording failure withholds completion and preserves unexpected workspace files', async t => {
  const f = fixture(t); let workspace;
  const invoke = async args => {
    workspace = args.cwd; t.after(() => rmSync(workspace, {recursive: true, force: true}));
    writeFileSync(join(workspace, 'unexpected.txt'), 'preserve evidence');
    return f.invoke(args);
  };
  const record = event => {if (event.event === 'codex_worker_completed') throw Object.assign(new Error('blocked'), {code: 'RECORD_REJECTED'});};
  await assert.rejects(createCodexArtifactWorker({...f.config, runCodex: invoke, record})(f.task, f.worker), /blocked/);
  assert.equal(readFileSync(join(workspace, 'unexpected.txt'), 'utf8'), 'preserve evidence');
  const cleanup = JSON.parse(readFileSync(join(f.dir, f.receipts[0].workspace_cleanup_receipt)));
  assert.equal(cleanup.status, 'preserved_unexpected_files');
  assert.equal(f.receipts[0].status, 'completed'); // Transport completed; callback was still withheld.
});
