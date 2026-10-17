import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {projectCodexWorkerInput} from '../src/benchmark/codex-worker-input-projection.mjs';
import {analyzeCodexWorkerSources} from '../src/benchmark/codex-worker-input-projection-v2.mjs';

const file = (path, content) => ({path, content, bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex')});
function fixture(source) {
  return {operation: 'repair', task: {id: 'task', read_scope: [], write_scope: ['pkg/main.py']}, writable_paths: ['pkg/main.py'],
    artifact_repair: {allowed_write_paths: ['pkg/main.py'], requirement_descriptions: [{id: 'R01', text: 'Repair the original promised behavior.'}],
      units: [], artifacts: [], failure: {outcome_uncertain: false,
        public_evidence_defaults: {executed: true, outcome_uncertain: false},
        public_evidence: [{check_id: 'public', status: 'failed', evidence: {error: null, unexecuted_test_ids: [],
          cases: [{test_id: 'T01', status: 'failed', error_type: 'AssertionError', message: 'known original failure'}]}}],
        repair_scope: {observed_failures: [{check_id: 'public', test_id: 'T01'}], unresolved: [], unexecuted: []}}},
    available_files: [file('pkg/main.py', source), file('pkg/unrelated.py', '# unrelated source text\n'.repeat(300)),
      file('pkg/templates/a.jinja', 'family template a'), file('pkg/templates/b.jinja', 'family template b'),
      file('other/templates/c.jinja', 'outside loader family')]};
}
const project = packet => projectCodexWorkerInput(packet, {policy: 'artifact-family-closed-v2', catalog: {units: [], artifacts: []}});

test('AST distinguishes generated import strings from executed dynamic imports without running candidate source', () => {
  const packet = fixture("raise RuntimeError('must not execute candidate source')\nexpression = '__import__(\"io\").BytesIO(value)'\n");
  const legacy = projectCodexWorkerInput(packet, {policy: 'dependency-closed-v1', catalog: {units: [], artifacts: []}});
  assert.ok(legacy.report.fallback_reasons.some(value => value.startsWith('dynamic_import:')));
  const result = project(packet);
  assert.equal(result.report.mode, 'artifact_family_closed'); assert.equal(result.report.retained_file_count, 1);
  assert.deepEqual(result.packet.artifact_repair, packet.artifact_repair);
  assert.deepEqual(result.packet.task, packet.task); assert.deepEqual(result.packet.available_files[0], packet.available_files[0]);
  assert.equal(result.report.model_input_tokens, null);
  const unknown = project(fixture('import importlib\nmodule = importlib.import_module(user_name)\n'));
  assert.equal(unknown.report.mode, 'full_context_fallback');
  assert.match(unknown.report.fallback_reasons.join(' '), /unknown_dynamic_import/);
  for (const code of ['from importlib import import_module as load\nload(user_name)\n',
    'loader = __import__\nloader(user_name)\n', 'import importlib\nloader = getattr(importlib, "import_module")\nloader(user_name)\n']) {
    assert.equal(project(fixture(code)).report.mode, 'full_context_fallback');
  }
});

test('verified PackageLoader and __file__-relative filesystem loader retain every candidate in the exact family', () => {
  for (const [imports, loader] of [
    ['from jinja2 import Environment, PackageLoader', 'PackageLoader("pkg", "templates")'],
    ['from jinja2 import Environment, FileSystemLoader\nfrom pathlib import Path', 'FileSystemLoader(str(Path(__file__).with_name("templates")))'],
  ]) {
    const packet = fixture(`${imports}\ndef build(name):\n    env = Environment(loader=${loader})\n    def render(template):\n        return env.get_template(template)\n    return render(name)\n`);
    const result = project(packet);
    assert.equal(result.report.mode, 'artifact_family_closed');
    assert.deepEqual(result.packet.available_files.map(row => row.path), ['pkg/main.py', 'pkg/templates/a.jinja', 'pkg/templates/b.jinja']);
    assert.equal(result.report.bounded_family_proofs[0].loader_root, 'pkg/templates');
    assert.deepEqual(result.report.bounded_family_proofs[0].candidate_paths, ['pkg/templates/a.jinja', 'pkg/templates/b.jinja']);
    assert.ok(result.packet.omitted_readable_files.some(row => row.path === 'other/templates/c.jinja'));
  }
});

test('unknown, rebound, mutated, external or escaping loader keeps complete context', () => {
  for (const source of [
    'def render(env, name):\n    return env.get_template(name)\n',
    'from jinja2 import Environment, PackageLoader\nenv = Environment(loader=PackageLoader("pkg", "templates"))\nenv = other\nenv.get_template(name)\n',
    'from jinja2 import Environment, PackageLoader\nenv = Environment(loader=PackageLoader("pkg", "templates"))\nenv.loader = other\nenv.get_template(name)\n',
    'from jinja2 import Environment, PackageLoader\nenv = Environment(loader=PackageLoader("missing", "templates"))\nenv.get_template(name)\n',
    'from jinja2 import Environment, PackageLoader\nenv = Environment(loader=PackageLoader("pkg", "../outside"))\nenv.get_template(name)\n',
  ]) {
    const packet = fixture(source), result = project(packet);
    assert.equal(result.report.mode, 'full_context_fallback'); assert.deepEqual(result.packet, packet);
  }
});

test('AST handles multiline member imports and literal dynamic modules; missing actual source and syntax errors fall back', () => {
  const packet = fixture('from . import (\n    member as m, # exact module\n)\n__import__("pkg.member")\n');
  packet.available_files.push(file('pkg/__init__.py', ''), file('pkg/member.py', 'answer = 42\n'));
  const result = project(packet);
  assert.equal(result.report.mode, 'artifact_family_closed');
  assert.ok(result.packet.available_files.some(row => row.path === 'pkg/member.py'));
  for (const source of ['from .missing import value\n', 'def incomplete(:\n']) {
    const p = fixture(source), r = project(p); assert.equal(r.report.mode, 'full_context_fallback'); assert.deepEqual(r.packet, p);
  }
  assert.deepEqual(analyzeCodexWorkerSources([file('pkg/source.py', 'x = "__import__(name)"\n')])['pkg/source.py'].dynamic_imports, []);
});

test('incomplete public or unknown ownership evidence still blocks context narrowing under v2', () => {
  for (const change of [p => {p.artifact_repair.failure.outcome_uncertain = true;},
    p => {p.artifact_repair.failure.repair_scope.unexecuted.push({test_id: 'T02'});},
    p => {p.artifact_repair.failure.repair_scope.inferred_ownership = {unknown_failure_ids: ['unknown']};}]) {
    const packet = fixture('x = 1\n'); change(packet);
    const result = project(packet); assert.equal(result.report.mode, 'full_context_fallback'); assert.deepEqual(result.packet, packet);
  }
});
