import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildPublicDocstringGuidance, diagnosePublicDocstrings} from '../src/orchestration/public-docstring-guidance.mjs';

const source = content => ({path: 'pyclientgen/templates/endpoint_module.py.jinja', content});
const task = {requirement_ids: ['R10.02', 'R10.03']};

test('initial and repair owners get the same fixed public rules; unrelated tasks get none', () => {
  const initial = buildPublicDocstringGuidance({task});
  const repair = buildPublicDocstringGuidance({task, artifactRepair: {failure: {public_evidence: []}}});
  assert.deepEqual(initial.instructions, repair.instructions);
  assert.equal(initial.automatic_source_rewrite, false);
  assert.equal(initial.contract.path, 'docs/orchestration/contracts/public-docstring-guidance.v1.json');
  assert.equal(buildPublicDocstringGuidance({task: {requirement_ids: ['R1']}}), null);
});

test('bare typed return label is a source-bound hypothesis, not executed verification', () => {
  const file = source('    Returns:\n        {{ parsed_type(operation) }}:\n');
  const [diagnostic] = diagnosePublicDocstrings([file]);
  assert.equal(diagnostic.line, 2);
  assert.equal(diagnostic.section_line, 1);
  assert.equal(diagnostic.actual, '{{ parsed_type(operation) }}:');
  assert.equal(diagnostic.source_sha256, createHash('sha256').update(file.content).digest('hex'));
  assert.equal(diagnostic.verification, 'not_executed');
  assert.match(diagnostic.interpretation, /Potential/);
  assert.deepEqual(diagnosePublicDocstrings([source('Returns:\n    Example: Parsed response value.\n')]), []);
  assert.deepEqual(diagnosePublicDocstrings([source('Args:\n    name (str):\n')]), []);
});

test('diagnostics reject mutated source provenance and invalid paths without writing files', () => {
  assert.throws(() => diagnosePublicDocstrings([{...source('Returns:\n  Example:\n'), sha256: '0'.repeat(64)}]), {code: 'PUBLIC_DOCSTRING_SOURCE_HASH_MISMATCH'});
  assert.throws(() => diagnosePublicDocstrings([{path: '../outside.py', content: ''}]), {code: 'PUBLIC_DOCSTRING_SOURCE_INVALID'});
});

test('preserves public failed message from packed and unpacked cases without inventing generated location', () => {
  for (const cases of [
    {columns: ['test_id', 'status', 'assertions', 'details'], rows: [['T.R10.03', 'failed', 24, {error_type: 'AssertionError', message: 'Google sections are separated by blank lines'}]]},
    [{test_id: 'T.R10.03', status: 'failed', error_type: 'AssertionError', message: 'Google sections are separated by blank lines'}],
  ]) {
    const result = buildPublicDocstringGuidance({task, artifactRepair: {failure: {public_evidence: [{check_id: 'public.schema-models', evidence: {cases}}]}}});
    assert.equal(result.public_failures.length, 1);
    assert.equal(result.public_failures[0].message, 'Google sections are separated by blank lines');
    assert.equal(result.public_failures[0].outcome, 'observed_public_failure_not_generated_location');
  }
});

test('diagnostic context is bounded without copying files', () => {
  const files = Array.from({length: 30}, (_, index) => ({path: `templates/model${index}.py.jinja`, content: 'Returns:\n    Example:\n'}));
  const result = buildPublicDocstringGuidance({task, availableFiles: files});
  assert.equal(result.source_diagnostics.length, 12);
  assert.ok(result.source_diagnostics.every(item => !Object.hasOwn(item, 'content')));
});
