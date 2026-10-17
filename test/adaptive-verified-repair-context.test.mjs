import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildVerifiedRepairContext, attachVerifiedRepairContext,
  verifiedRepairContextPolicy} from '../src/orchestration/adaptive-verified-repair-context.mjs';
import {planRepairOwnerRequest} from '../src/orchestration/adaptive-repair-budget.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const sources = [{artifact_id: 'producer', path: 'schema/models.py',
    content: 'def parse_model():\n    additional_properties = decode(values)\n    return additional_properties\n'},
  {artifact_id: 'renderer', path: 'templates/model.py.jinja',
    content: 'def to_dict(self):\n    result.update(self.additional_properties)\n    return result\n'}]
    .map(row => ({...row, sha256: hash(row.content), artifact_revision: hash(row.artifact_id)}));
  const planning = {plan: {artifacts: sources.map(row => ({id: row.artifact_id, producer_task_id: `task-${row.artifact_id}`})),
    tasks: sources.map(row => ({id: `task-${row.artifact_id}`, kind: 'implementation',
      output_artifact_ids: [row.artifact_id], write_scope: [row.path]}))},
  catalog: {artifacts: sources.map(row => ({id: row.artifact_id, paths: [row.path]}))}};
  const failure = {outcome_uncertain: false, artifact_revisions: Object.fromEntries(sources.map(row => [row.artifact_id, row.artifact_revision])),
    public_evidence: [{check_id: 'public.serializing', status: 'failed', executed: true, assertions: 2, skipped: 0,
      outcome_uncertain: false, evidence: {cases: [{test_id: 'typed-map', status: 'failed',
        message: 'typed additional property is encoded: expected a dict, got a model object'}]}}]};
  return {planning, failure, sources};
}

test('current compound-identifier source evidence covers producer and consumer without overriding owners', () => {
  const input = fixture(), output = buildVerifiedRepairContext(input);
  assert.deepEqual(output.source_index.map(row => row.artifact_id), ['producer', 'renderer']);
  assert(output.identifier_source_windows.some(row => output.source_index[row.source_ref].artifact_id === 'renderer'
    && row.line === 2 && row.excerpt.includes('result.update(self.additional_properties)')));
  assert(output.source_index.every(row => row.sha256 === input.sources.find(source => source.path === row.path).sha256));
  assert.equal(output.automatic_owner_additions, 0); assert.equal(output.skipped_workers, 0);
  assert(!Object.hasOwn(output, 'required_artifact_ids'));
  const request = {state: {instructions: 'Original fixed instructions'}, questions: {owner: {type: 'choice',
    instructions: 'Original fixed question', criteria: {producer: 'parser', renderer: 'serializer'}}}};
  const attached = attachVerifiedRepairContext(request, output);
  assert.deepEqual(attached.questions, request.questions); assert.equal(attached.state.instructions, request.state.instructions);
  assert(!Object.hasOwn(request.state, 'verified_repair_context'));
  assert.equal(attached.state.verified_repair_context.context_sha256, output.sha256);
  assert.equal(attached.state.verified_repair_context.sources.length, 2);
  assert(Buffer.byteLength(JSON.stringify(attached.state.verified_repair_context)) <= verifiedRepairContextPolicy().model_context_max_bytes);
});

test('source bytes, artifact revision and ownership drift stop before an owner request', () => {
  for (const mutate of [x => { x.sources[0].content += '# changed'; },
    x => { x.failure.artifact_revisions.producer = hash('wrong'); },
    x => { x.sources[0].path = 'unowned.py'; }]) {
    const input = fixture(); mutate(input);
    assert.throws(() => buildVerifiedRepairContext(input), {code: 'ADAPTIVE_VERIFIED_REPAIR_CONTEXT_SOURCE_DRIFT'});
  }
  const context = buildVerifiedRepairContext(fixture()); context.skipped_workers = 1;
  assert.throws(() => attachVerifiedRepairContext({state: {}}, context), {code: 'ADAPTIVE_VERIFIED_REPAIR_CONTEXT_BINDING'});
});

test('a long preceding line cannot replace the exact matched source line in the model projection', () => {
  const input = fixture(), source = input.sources[1];
  source.content = `#${'x'.repeat(5000)}\n${' '.repeat(1600)}result.update(self.additional_properties)\n`;
  source.sha256 = hash(source.content);
  const output = buildVerifiedRepairContext(input), request = attachVerifiedRepairContext({state: {}}, output);
  const model = request.state.verified_repair_context;
  const row = model.windows.find(row => model.sources[row[0]][1] === 'renderer');
  assert(row); assert.equal(row[1], 2); assert(row[2] > 1500);
  assert.match(row[3], /result.update\(self.additional_properties\)/);
  assert(!row[3].includes('xxxx'));
  const window = output.identifier_source_windows.find(row => output.source_index[row.source_ref].artifact_id === 'renderer');
  assert.equal(window.excerpt_truncated, true);
  assert.equal(window.matched_line_sha256, hash(source.content.split('\n')[1]));
});

test('no-change history and source-linked worker statements remain observations instead of exonerating an owner', () => {
  const input = fixture(); input.repairHistory = {entries: [{round_index: 0, selected_artifact_ids: ['producer'],
    changed_artifact_ids: [], selected_but_unchanged_artifact_ids: ['producer'], persistent_failure_keys: ['public.serializing/typed-map/'],
    resolved_failure_keys: [], unobserved_failure_keys: [], new_failure_keys: [], changed_files: [], relevant_revisions: {}}]};
  input.workerReports = [{task_id: 'task-producer', repaired_artifact_ids: ['producer'],
    final_response: 'The parser is unchanged. Inspect templates/model.py.jinja; this is a hypothesis.'}];
  const output = buildVerifiedRepairContext(input);
  assert.deepEqual(output.previous_repair.selected_but_unchanged_artifact_ids, ['producer']);
  assert.deepEqual(output.worker_statements[0].mentioned_source_paths, [{path: 'templates/model.py.jinja', artifact_id: 'renderer'}]);
  assert.match(output.instructions, /not proof that its owner is innocent/);
});

test('public check errors retain not-executed coverage and uncertainty cannot become a routing hint', () => {
  const input = fixture(), check = input.failure.public_evidence[0];
  check.evidence = {error: {code: 'SyntaxError', message: 'invalid generated module'}, cases: [], unexecuted_test_ids: ['typed-map']};
  const output = buildVerifiedRepairContext(input);
  assert.deepEqual(output.public_coverage[0].failed_cases, []);
  assert.deepEqual(output.public_coverage[0].unexecuted_test_ids, ['typed-map']);
  assert.equal(output.observation_refs[0].test_id, null);
  assert.deepEqual(attachVerifiedRepairContext({state: {original: true}}, output), {state: {original: true}});
  check.outcome_uncertain = true;
  assert.throws(() => buildVerifiedRepairContext(input), {code: 'ADAPTIVE_VERIFIED_REPAIR_CONTEXT_UNCERTAIN'});
});

test('existing owner budget preserves the new sealed context and fixed questions', () => {
  const context = buildVerifiedRepairContext(fixture());
  const request = attachVerifiedRepairContext({state: {schema_version: 'fixture'}, questions: {owner: {type: 'choice',
    instructions: 'Choose an owner', criteria: {producer: 'parser', renderer: 'serializer'}}}}, context);
  const packed = planRepairOwnerRequest(request, {policy: 'repair-budget-v3'});
  assert(packed.report.within_budget);
  assert.deepEqual(packed.parts[0].request.state.verified_repair_context, request.state.verified_repair_context);
  assert.deepEqual(packed.parts[0].request.questions, request.questions);
  assert.equal(context.policy_source.sha256, verifiedRepairContextPolicy().source.sha256);
});
