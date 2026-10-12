import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildAdaptiveCausalRepairScope, buildCausalRepairHistory, buildCausalRepairDecisionContext,
  buildCausalRepairWorkerContext, validateCausalRepairCandidate} from '../src/orchestration/adaptive-causal-repair.mjs';
import {buildAdaptiveRepairScope} from '../src/orchestration/adaptive-repair-scope.mjs';
import {restoreCausalChooserPacket} from '../src/orchestration/adaptive-causal-packet-encoding.mjs';

const copy = value => structuredClone(value), hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => hash(JSON.stringify(canonical(value)));
function fixture() {
  const names = ['producer', 'ir', 'generator', 'template', 'metadata', 'unrelated'];
  const paths = Object.fromEntries(names.map(name => [name, name === 'template' ? 'template.jinja' : `${name}.py`]));
  const owner = name => name === 'metadata' ? 'template' : name;
  const artifacts = names.map(name => ({id: `A-${name}`, producer_task_id: `owner-${owner(name)}`}));
  const tasks = names.filter(name => name !== 'metadata').map(name => ({id: `owner-${name}`, kind: 'implementation',
    output_artifact_ids: artifacts.filter(artifact => artifact.producer_task_id === `owner-${name}`).map(artifact => artifact.id),
    input_artifact_ids: name === 'template' ? ['A-generator'] : [],
    requirement_ids: name === 'template' ? ['R-body', 'R-metadata'] : [`R-${name}`],
    write_scope: names.filter(item => owner(item) === name).map(item => paths[item]),
    read_scope: name === 'template' ? ['generator.py'] : [],
    check_ids: names.filter(item => owner(item) === name).map(item => `local-${item}`)}));
  const catalog = {source_sha256: hash('Original body and source requirements.'),
    units: names.map(name => ({id: `U-${name}`, title: name, artifact_ids: [`A-${name}`],
      requirement_ids: [name === 'template' ? 'R-body' : `R-${name}`],
      interface: `Complete original ${name} interface: preserve description provenance.`, evidence_ids: [`E-${name}`]})),
    artifacts: names.map(name => ({id: `A-${name}`, paths: [paths[name]], evidence_ids: [`E-${name}`]})),
    evidence: names.map(name => ({id: `E-${name}`, quote: `Original ${name} public requirement, without deletion.`}))};
  const planning = {catalog, catalog_sha256: hash(JSON.stringify(catalog)), source_sha256: catalog.source_sha256,
    plan: {graph_revision: 'graph-0', tasks, artifacts, checks: names.map(name => ({id: `local-${name}`, artifact_ids: [`A-${name}`]}))},
    requirement_descriptions: names.map(name => ({id: name === 'template' ? 'R-body' : `R-${name}`,
      text: `Complete ${name} requirement.`, source_refs: ['public-source']}))};
  const artifactBindings = Object.fromEntries(catalog.artifacts.map(artifact => [artifact.id, {paths: artifact.paths}]));
  const check = {id: 'public.description', version: '4', requirement_ids: ['R-body'], environment_ref: 'fixture-environment'};
  const contract = {schema_version: 'public-assertion-contract/v1', version: '2', assertions: [{
    id: 'A.body.description', check_id: check.id, test_id: 'T.body.description', requirement_ids: ['R-body'], artifact_paths: ['template.jinja'],
    causal_paths: [['producer', 'producer'], ['ir', 'representation'], ['generator', 'renderer'], ['template', 'renderer']]
      .map(([name, role]) => ({path: paths[name], role, rationale: `Public source-backed ${role} candidate.`}))}]};
  const source_text = JSON.stringify(contract), source_path = 'public/assertions.v2.json';
  const assertionContract = {contract, source_text, source_path, sha256: hash(source_text)};
  const environment = {id: check.environment_ref, fingerprint: hash('environment')};
  const revisions = Object.fromEntries(names.map(name => [`A-${name}`, hash(`revision-${name}`)]));
  const failure = {status: 'failed', code: 'ARTIFACT_CHECK_NOT_PASSED', outcome_uncertain: false, failed_task_ids: [],
    source_sha256: planning.source_sha256, catalog_sha256: planning.catalog_sha256, graph_revision: 'graph-0', round_index: 0,
    environment, artifact_revisions: revisions, local_evidence: [], public_evidence: [{
      check_id: check.id, check_version: check.version, environment_ref: check.environment_ref, status: 'failed',
      executed: true, exit_code: 1, assertions: 2, skipped: 0, outcome_uncertain: false, artifact_revisions: copy(revisions),
      evidence: {check_id: check.id, check_version: check.version, environment_ref: check.environment_ref, outcome_uncertain: false,
        assertion_contract_sha256: assertionContract.sha256, unexecuted_test_ids: [], error: null,
        cases: [{test_id: 'T.body.description', status: 'failed', assertions: 1, error_type: 'AssertionError', message: 'Wrong request-body description.',
          failed_assertion_id: 'A.body.description', assertion_results: [{assertion_id: 'A.body.description', status: 'failed'}],
          description_provenance: {expected_request_description: 'REQUEST', schema_description: 'SCHEMA', runtime: {body_lines: ['SCHEMA']},
            observation: 'schema_description_substitution'}, unknown_semantic: {preserved: true}},
        {test_id: 'T.other', status: 'passed', assertions: 1}]}}]};
  const runtimeBinding = {schema_version: 'dag-filesystem-binding/v1', checker_manifest: [{path: source_path, sha256: assertionContract.sha256}],
    plan: planning.plan, environment, artifact_bindings: artifactBindings};
  const input = {plan: planning.plan, planning, failure, publicChecks: [check], artifactBindings, assertionContract, runtimeBinding,
    testRequirements: {'T.body.description': ['R-body']}, sourceFiles: []};
  seal(input); return input;
}
function seal(input) {
  const {runtimeBinding: binding, plan, failure, artifactBindings, assertionContract} = input;
  assertionContract.source_text = JSON.stringify(assertionContract.contract); assertionContract.sha256 = hash(assertionContract.source_text);
  binding.checker_manifest = [{path: assertionContract.source_path, sha256: assertionContract.sha256}];
  binding.plan_hash = digest(plan); binding.binding_digest = digest({pinManifest: binding.checker_manifest,
    environment: binding.environment, plan_hash: binding.plan_hash, artifact_bindings: artifactBindings});
  failure.binding_digest = binding.binding_digest;
  for (const item of failure.public_evidence) {
    item.evidence.assertion_contract_sha256 = assertionContract.sha256;
    item.artifact_revisions = copy(failure.artifact_revisions);
    item.runtime_binding = {binding_digest: binding.binding_digest, checker_manifest_sha256: digest(binding.checker_manifest),
      environment_fingerprint: binding.environment.fingerprint, plan_hash: binding.plan_hash};
    item.evidence_key = digest({check_id: item.check_id, check_version: item.check_version,
      artifact_revisions: item.artifact_revisions, runtime_binding: item.runtime_binding});
  }
}
async function scoped(input = fixture()) {
  const result = await buildAdaptiveCausalRepairScope(input);
  input.failure.repair_scope = result.analysis; return {...input, candidates: result.candidates};
}
function decodedCases(packet) {
  const row = packet.failure.public_evidence[0], merged = {...packet.failure.public_evidence_defaults, ...row};
  const cases = merged.evidence.cases;
  return Array.isArray(cases) ? cases : cases.rows.map(values => Object.assign(Object.fromEntries(cases.columns.slice(0, -1)
    .map((key, index) => [key, values[index]])), values.at(-1)));
}
function decodedDecision(decision) {
  return restoreCausalChooserPacket(decision.state, decision.report.semantic_projection);
}

test('bound output assertion nominates exact producer/IR/renderer choices without unrelated workers or invented DAG edges', async () => {
  const input = fixture(), original = copy(input), result = await buildAdaptiveCausalRepairScope(input);
  assert.deepEqual(input, original); assert.equal(result.analysis.causal.chains.length, 1);
  const direct = result.candidates.find(candidate => candidate.id === 'repair-failure-owners');
  assert.deepEqual(direct.artifact_ids, ['A-template']);
  assert.deepEqual(direct.read_artifact_ids, ['A-producer', 'A-ir', 'A-generator', 'A-template']);
  const chain = result.candidates.find(candidate => candidate.id === 'repair-causal-chain');
  assert.deepEqual(chain.task_ids, ['owner-producer', 'owner-ir', 'owner-generator', 'owner-template']);
  assert.deepEqual(chain.artifact_ids, direct.read_artifact_ids);
  for (const candidate of result.candidates) assert(!candidate.artifact_ids.includes('A-unrelated') && !candidate.artifact_ids.includes('A-metadata'));
  assert.equal(result.analysis.causal.causal_relationships_are_dag_edges, false);
  assert.equal(result.analysis.causal.chains[0].nodes[0].source_sha256, null);
  assert.equal(result.analysis.causal.chains[0].attribution_basis, 'public_contract_data_path_hypothesis_not_fault_proof');
  const legacy = await buildAdaptiveRepairScope(input);
  assert(legacy.analysis.unresolved.some(row => row.reason === 'ASSERTION_CONTRACT_INVALID'));
});

test('chooser retains original cases and requirements; worker gets extra baseline reads but exact writes and existing input authority', async () => {
  const input = await scoped(), before = copy(input), decision = buildCausalRepairDecisionContext(input);
  assert.deepEqual(decodedCases(decision.state), input.failure.public_evidence[0].evidence.cases);
  assert(decision.state.requirement_descriptions.some(item => item.id === 'R-body'));
  assert.equal(decision.report.encoding.applied, false);
  assert.equal(decision.report.encoding.format, 'readable_projected_json');
  assert.equal(decision.report.lossless, false);
  const candidate = input.candidates.find(item => item.id === 'repair-failure-owners'), task = input.planning.plan.tasks.find(item => item.id === 'owner-template');
  const worker = buildCausalRepairWorkerContext({...input, candidate, task});
  assert.deepEqual(worker.task.write_scope, ['template.jinja']); assert.deepEqual(worker.task.output_artifact_ids, ['A-template']);
  assert.deepEqual(worker.task.read_scope, ['generator.py', 'metadata.py', 'producer.py', 'ir.py']);
  assert.deepEqual(worker.context.required_read_artifact_ids, ['A-producer', 'A-ir']);
  assert.deepEqual(worker.context.required_read_artifacts.map(item => item.revision), [input.failure.artifact_revisions['A-producer'], input.failure.artifact_revisions['A-ir']]);
  assert.equal(worker.context.causal_read_basis.declared_inputs, 'current_runtime_revisions');
  assert.equal(worker.context.causal_read_basis.original_dag_dependency_edges_changed, false);
  assert.equal(worker.context.causal_read_basis.read_source_bytes_required_before_worker_dispatch, true);
  assert(worker.context.causal_read_interfaces.some(item => item.interface === input.planning.catalog.units[0].interface));
  assert.deepEqual(decodedCases(worker.context), input.failure.public_evidence[0].evidence.cases);
  assert.deepEqual(input, before);
});

test('stale assertion/runtime revisions or unsupported paths never create causal write/read authority', async t => {
  for (const mutation of ['runtime', 'revision', 'path', 'contract']) await t.test(mutation, async () => {
    const input = fixture();
    if (mutation === 'runtime') input.runtimeBinding.environment = {...input.runtimeBinding.environment, fingerprint: hash('other')};
    if (mutation === 'revision') input.failure.public_evidence[0].artifact_revisions['A-producer'] = hash('other');
    if (mutation === 'contract') input.assertionContract.contract.assertions[0].causal_paths[0].path = 'unrelated.py';
    if (mutation === 'path') { input.assertionContract.contract.assertions[0].causal_paths[0].path = '../outside.py'; seal(input); }
    const scope = await buildAdaptiveCausalRepairScope(input);
    assert.equal(scope.analysis.causal.chains.length, 0);
    assert(scope.candidates.every(item => item.read_artifact_ids.length === 0 && !item.id.startsWith('repair-causal-')));
    assert(scope.analysis.unresolved.length || scope.analysis.causal.unresolved.length);
  });
});

test('candidate or causal scope tampering is rejected before a worker packet can widen authority', async () => {
  const input = await scoped(), candidate = copy(input.candidates[0]);
  candidate.read_artifact_ids.push('A-unrelated');
  assert.throws(() => validateCausalRepairCandidate({...input, candidate}), {code: 'ADAPTIVE_CAUSAL_CHOICE_DRIFT'});
  const changed = copy(input); changed.failure.repair_scope.causal.chains[0].nodes[0].path = 'unrelated.py';
  assert.throws(() => buildCausalRepairDecisionContext(changed), {code: 'ADAPTIVE_CAUSAL_SCOPE_BINDING'});
});

test('observed changed files and persistent assertions reach the next decision; unknown/not-reached is not resolution', async () => {
  const input = await scoped(), action = input.candidates[0], after = copy(input.failure);
  after.round_index = 1; after.graph_revision = 'graph-1'; after.artifact_revisions['A-template'] = hash('changed-template');
  const attempt = {round_index: 0, action, before_failure: input.failure, after_failure: after,
    after_artifact_revisions: after.artifact_revisions, status: 'failed', changed_files: [{artifact_id: 'A-template', path: 'template.jinja',
      before_sha256: hash('before'), after_sha256: hash('after'), before_executable: false, after_executable: false}]};
  const history = buildCausalRepairHistory({planning: input.planning, artifactBindings: input.artifactBindings, attempts: [attempt]});
  assert.equal(history.entries[0].persistent_failure_keys.length, 1);
  assert.deepEqual(history.entries[0].changed_artifact_ids, ['A-template']);
  assert.deepEqual(history.entries[0].resolved_failure_keys, []);
  assert.deepEqual(history.entries[0].failures_before[0].description_provenance, input.failure.public_evidence[0].evidence.cases[0].description_provenance);
  const next = {...input, failure: after, repairHistory: history}; seal(next);
  const nextScope = await buildAdaptiveCausalRepairScope(next); next.failure.repair_scope = nextScope.analysis;
  const packet = buildCausalRepairDecisionContext({...next, candidates: nextScope.candidates});
  assert.deepEqual(decodedDecision(packet).failure.repair_scope.causal.repair_history, history);
  const missing = copy(attempt); missing.after_failure.public_evidence[0].evidence.cases = [];
  const incomplete = buildCausalRepairHistory({planning: input.planning, artifactBindings: input.artifactBindings, attempts: [missing]});
  assert.equal(incomplete.entries[0].resolved_failure_keys.length, 0); assert.equal(incomplete.entries[0].unobserved_failure_keys.length, 1);
  const outside = copy(attempt); outside.after_artifact_revisions['A-unrelated'] = hash('bad');
  outside.after_failure.artifact_revisions['A-unrelated'] = outside.after_artifact_revisions['A-unrelated'];
  assert.throws(() => buildCausalRepairHistory({planning: input.planning, artifactBindings: input.artifactBindings, attempts: [outside]}), {code: 'ADAPTIVE_CAUSAL_HISTORY_OUTSIDE_WRITE'});
  await assert.rejects(buildAdaptiveCausalRepairScope({...next, repairHistory: undefined}), {code: 'ADAPTIVE_CAUSAL_HISTORY_REQUIRED'});
});
