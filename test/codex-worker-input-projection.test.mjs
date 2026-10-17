import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {projectCodexWorkerInput} from '../src/benchmark/codex-worker-input-projection.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const file = (path, content) => ({path, content, bytes: Buffer.byteLength(content), sha256: sha(content)});
const policy = 'dependency-closed-v1';
function fixture() {
  const packet = {
    operation: 'repair', task: {id: 'n1', read_scope: ['pkg/helpers.py'], write_scope: ['pkg/output.py']},
    writable_paths: ['pkg/output.py'], input_artifact_revisions: {a1: 'revision'},
    artifact_repair: {
      allowed_write_paths: ['pkg/output.py'], units: [{interface: 'Build output from BodyIR without changing public behavior. 한글 😀'}],
      requirement_descriptions: [{id: 'r1', description: 'Preserve body descriptions and public formatting.'}],
      failure: {outcome_uncertain: false, failed_task_ids: [], undispatched_task_ids: [],
        public_evidence_defaults: {executed: true, outcome_uncertain: false},
        public_evidence: [{check_id: 'public.api', status: 'failed', evidence: {error: null, unexecuted_test_ids: [],
          cases: [{test_id: 'T.body', status: 'failed', message: 'expected body text, got empty', unknown_diagnostic: {reason: 'retain me'}}]}}],
        repair_scope: {fallback_required: false, unresolved: [], unexecuted: [], observed_failures: [{check_id: 'public.api', test_id: 'T.body'}]}},
    },
    available_files: [file('pkg/output.py', 'from .helpers import helper\n'), file('pkg/helpers.py', 'from .nested import nested\n'),
      file('pkg/nested.py', 'def nested(): return 1\n'), file('pkg/ir.py', 'class BodyIR: pass\n'),
      file('pkg/unrelated.py', 'x = ' + JSON.stringify('large unrelated source. '.repeat(100)))],
    absent_allowed_files: [],
  };
  return {packet, options: {policy, catalog: {units: [], artifacts: []}}};
}

test('retains complete transitive imports, interface classes and failure/authority while omitting only unlinked bodies', () => {
  const {packet, options} = fixture(), before = structuredClone(packet);
  const {packet: projected, report} = projectCodexWorkerInput(packet, options);
  assert.deepEqual(packet, before);
  assert.equal(report.mode, 'dependency_closed'); assert.equal(report.omitted_file_count, 1);
  assert.ok(report.projected_packet_bytes < report.original_packet_bytes);
  assert.deepEqual(projected.artifact_repair, before.artifact_repair);
  assert.deepEqual(projected.task, before.task); assert.deepEqual(projected.writable_paths, before.writable_paths);
  assert.deepEqual(projected.available_files, before.available_files.slice(0, 4));
  assert.equal(projected.omitted_readable_files[0].sha256, before.available_files[4].sha256);
  assert.ok(!JSON.stringify(projected).includes('large unrelated source.'));
  assert.match(projected.read_context_policy.instructions, /NOT inline/);
  assert.equal(report.model_input_tokens, null);
  assert.equal(report.original_packet_characters, [...JSON.stringify(before)].length);
});

test('unexecuted/unknown/uncertain/local failures and unresolved imports retain complete context', () => {
  const mutate = [
    p => p.artifact_repair.failure.repair_scope.unexecuted.push({test_id: 'unknown'}),
    p => {p.artifact_repair.failure.outcome_uncertain = true;},
    p => {p.artifact_repair.failure.repair_scope.inferred_ownership = {unknown_failure_ids: ['unknown']};},
    p => {p.artifact_repair.failure.local_evidence = [{status: 'failed', executed: true, outcome_uncertain: false}];},
    p => {p.available_files[0] = file('pkg/output.py', 'from .missing import x\n');},
    p => {p.available_files[0] = file('pkg/output.py', 'import importlib\nx = importlib.import_module(name)\n');},
    p => {p.available_files[0] = file('pkg/output.py', 'env.get_template(template_name)\n');},
    p => {delete p.artifact_repair.allowed_write_paths;},
    p => {p.artifact_repair.failure.public_evidence[0].evidence.error = 'SyntaxError: unexecuted cases';},
    p => {delete p.artifact_repair.failure.public_evidence_defaults;},
  ];
  for (const change of mutate) {
    const {packet, options} = fixture(); change(packet);
    const result = projectCodexWorkerInput(packet, options);
    assert.equal(result.report.mode, 'full_context_fallback'); assert.deepEqual(result.packet, packet);
    assert.ok(result.report.fallback_reasons.length);
  }
});

test('causal source and exact public failure/diagnostic paths remain inline even outside declared read scope', () => {
  const {packet, options} = fixture();
  packet.artifact_repair.failure.public_evidence[0].evidence.cases[0].message = 'Inspect pkg/unrelated.py and preserve its original input.';
  const result = projectCodexWorkerInput(packet, options);
  assert.equal(result.report.omitted_file_count, 0); assert.deepEqual(result.packet, packet);
  assert.ok(result.report.retained.find(row => row.path === 'pkg/unrelated.py').reasons.includes('public_failure_source'));
});

test('absolute and multiline package-member imports preserve module bodies; interface functions and package aliases stay conservative', () => {
  for (const source of ['from pkg import submodule as sm\n', 'from . import (\n  submodule, # source dependency\n)\n']) {
    const {packet, options} = fixture();
    packet.available_files[0] = file('pkg/output.py', source);
    packet.available_files.push(file('pkg/__init__.py', '# package boundary\n'),
      file('pkg/submodule.py', 'def calculate(): return 42\n'), file('pkg/creator.py', 'def build_body(): return 1\n'));
    packet.artifact_repair.units[0].interface += ' Use build_body to produce the record.';
    const result = projectCodexWorkerInput(packet, options);
    assert.ok(result.packet.available_files.some(row => row.path === 'pkg/submodule.py'));
    assert.ok(result.packet.available_files.some(row => row.path === 'pkg/creator.py'));
    assert.ok(result.packet.available_files.some(row => row.path === 'pkg/__init__.py'));
    assert.equal(result.report.fallback_reasons.length, 0);
  }
  const {packet, options} = fixture();
  packet.available_files[0] = file('pkg/output.py', 'import pkg as p\nvalue = p.unrelated.x\n');
  packet.available_files.push(file('pkg/__init__.py', '# package boundary\n'));
  assert.equal(projectCodexWorkerInput(packet, options).report.omitted_file_count, 0);
});

test('literal Jinja dependency expands closure; dynamic or unresolved template reference falls back', () => {
  for (const [text, mode] of [["{% include 'part.jinja' %}", 'dependency_closed'], ['{% include target %}', 'full_context_fallback'],
    ["{% include 'absent.jinja' %}", 'full_context_fallback']]) {
    const {packet, options} = fixture();
    packet.task.write_scope.push('templates/output.jinja'); packet.writable_paths.push('templates/output.jinja');
    packet.artifact_repair.allowed_write_paths.push('templates/output.jinja');
    packet.available_files.push(file('templates/output.jinja', text), file('templates/part.jinja', 'required template body'));
    const result = projectCodexWorkerInput(packet, options);
    assert.equal(result.report.mode, mode);
    assert.ok(result.packet.available_files.some(row => row.path === 'templates/part.jinja'));
  }
  const {packet, options} = fixture();
  packet.available_files[0] = file('pkg/output.py', 'env.get_template("part.jinja").render()\n');
  packet.available_files.push(file('templates/part.jinja', 'known direct Python template dependency'));
  const result = projectCodexWorkerInput(packet, options);
  assert.equal(result.report.mode, 'dependency_closed');
  assert.ok(result.report.retained.find(file => file.path === 'templates/part.jinja').reasons.includes('python_template_reference'));
});

test('initial implementation is byte-identical, corrupt source identity is rejected before projection', () => {
  const {packet, options} = fixture(); packet.operation = 'implementation';
  assert.deepEqual(projectCodexWorkerInput(packet, options).packet, packet);
  packet.available_files[0].content = 'changed';
  assert.throws(() => projectCodexWorkerInput(packet, options), {code: 'CODEX_WORKER_INPUT_SOURCE_IDENTITY'});
  assert.throws(() => projectCodexWorkerInput(fixture().packet, {policy: 'unknown'}), {code: 'CODEX_WORKER_INPUT_POLICY_INVALID'});
});
