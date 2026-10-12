import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runAdaptiveDagExecution} from '../src/orchestration/adaptive-dag-execution.mjs';
import {createArtifactSession} from '../src/orchestration/artifact-transport.mjs';
import {validateInferredRepairCandidate, buildInferredRepairDecisionContext} from '../src/orchestration/adaptive-inferred-repair.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const base = JSON.parse(await readFile(new URL('../examples/dag/contract-fixture.json', import.meta.url)));
async function remove(path) {
  const stat = await lstat(path).catch(() => null); if (!stat) return;
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    await chmod(path, 0o700); for (const name of await readdir(path)) await remove(join(path, name));
  }
  await rm(path, {recursive: true, force: true});
}
async function fixture(t, {repeat = false} = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'inferred-execution-'))); t.after(() => remove(root));
  const plan = structuredClone(base), [core, ui, aggregate] = plan.tasks;
  core.write_scope = ['producer.py', 'ir.py']; core.output_artifact_ids.push('artifact-ir');
  ui.write_scope = ['template.jinja', 'generator.py']; ui.output_artifact_ids.push('artifact-generator');
  ui.input_artifact_ids = []; ui.read_scope = [];
  const unrelated = {...structuredClone(core), id: 'build-unrelated', worker_id: 'worker-unrelated',
    requirement_ids: ['requirement-unrelated'], write_scope: ['unrelated.py'], output_artifact_ids: ['artifact-unrelated'], check_ids: ['check-unrelated']};
  plan.tasks.splice(2, 0, unrelated); plan.workers.push({id: 'worker-unrelated', profile_id: 'fixture-local'});
  plan.requirement_ids.push('requirement-unrelated'); plan.artifacts.push({id: 'artifact-ir', producer_task_id: core.id},
    {id: 'artifact-generator', producer_task_id: ui.id}, {id: 'artifact-unrelated', producer_task_id: unrelated.id});
  aggregate.requirement_ids = [...plan.requirement_ids]; aggregate.input_artifact_ids = plan.artifacts.map(a => a.id);
  aggregate.read_scope = [...core.write_scope, ...ui.write_scope, ...unrelated.write_scope]; aggregate.check_ids = ['public-description'];
  const proto = structuredClone(plan.checks[0]);
  plan.checks[0].artifact_ids.push('artifact-ir'); plan.checks[1].artifact_ids.push('artifact-generator');
  plan.checks = [...plan.checks.slice(0, 2), {...proto, id: 'check-unrelated', artifact_ids: ['artifact-unrelated'], requirement_ids: unrelated.requirement_ids},
    {...proto, id: 'public-description', version: '4', phase: 'integration', artifact_ids: [...aggregate.input_artifact_ids], requirement_ids: [...plan.requirement_ids]}];
  const bindings = {'artifact-core': {paths: ['producer.py']}, 'artifact-ir': {paths: ['ir.py']},
    'artifact-ui': {paths: ['template.jinja']}, 'artifact-generator': {paths: ['generator.py']}, 'artifact-unrelated': {paths: ['unrelated.py']}};
  const catalog = {source_sha256: hash('original public requirements'),
    artifacts: plan.artifacts.map(a => ({id: a.id, paths: bindings[a.id].paths, evidence_ids: [`e-${a.id}`]})),
    units: plan.artifacts.map(a => ({id: `u-${a.id}`, title: a.id, artifact_ids: [a.id],
      requirement_ids: a.id === 'artifact-core' ? ['requirement-core'] : a.id === 'artifact-ui' ? ['requirement-ui']
        : a.id === 'artifact-unrelated' ? ['requirement-unrelated'] : [],
      interface: `Original complete ${a.id} interface.`, evidence_ids: [`e-${a.id}`]})),
    evidence: plan.artifacts.map(a => ({id: `e-${a.id}`, quote: 'Original source description passes through producer and IR into renderer.'}))};
  const planning = {plan, artifactBindings: bindings, catalog, source_sha256: catalog.source_sha256, catalog_sha256: hash(JSON.stringify(catalog)),
    execution_context: {profile_id: null, profile_policy: 'per_task_jev_selection',
      initial_planning_profile_assumption: 'fixture-local', worker_profiles: structuredClone(plan.workers)},
    requirement_descriptions: plan.requirement_ids.map(id => ({id, text: `Complete ${id}.`, source_refs: ['original-public']}))};
  const contract = {schema_version: 'public-assertion-contract/v1', version: '2', assertions: [{id: 'assert-description',
    check_id: 'public-description', test_id: 'test-description', requirement_ids: ['requirement-ui'], artifact_paths: ['template.jinja'],
    causal_paths: [['producer.py', 'producer'], ['ir.py', 'representation'], ['generator.py', 'renderer'], ['template.jinja', 'renderer']]
      .map(([path, role]) => ({path, role, rationale: 'Explicit public contract path candidate.'}))}]};
  const source_text = JSON.stringify(contract), contractPath = join(root, 'assertions.v2.json'), checker = join(root, 'checker.mjs');
  await writeFile(contractPath, source_text); await writeFile(checker, '// Offline public check identity.\n');
  const assertionContract = {contract, source_text, source_path: 'assertions.v2.json', sha256: hash(source_text)};
  const calls = [], checks = [], choices = [], events = [], profiles = [];
  const options = {plan, planning, artifactBindings: bindings, run_id: 'causal-fixture', runDirectory: join(root, 'run'),
    checkerRoot: root, checkerFiles: [checker, contractPath], environment: {id: 'node22-fixture-v1'},
    maxRepairRounds: repeat ? 2 : 1, repairScopePolicy: 'public-inferred-owner-v1', artifactRepairPolicy: 'inferred-v1', assertionContract,
    testRequirements: {'test-description': ['requirement-ui']}, record: async event => events.push(event),
    probeEnvironment: async () => ({node: process.version, platform: process.platform}),
    prepareRoundPlan: async ({plan, round_index, selected_task_ids, selected_action, failure, repair_history}) => {
      assert.equal(selected_action.id, 'repair-inferred-owners');
      assert.deepEqual(selected_action.task_ids, selected_task_ids);
      assert.equal(selected_action.artifact_ids.length, 1);
      profiles.push({round_index, selected_task_ids, selected_action, failure, repair_history});
      const worker = plan.workers.find(worker => worker.id === core.worker_id); worker.profile_id = `fixture-repair-${round_index}`;
      return {plan};
    },
    executeTask: async (task, context) => {
      calls.push({task: structuredClone(task), context: structuredClone(context)});
      if (context.operation === 'repair') {
        assert.equal(task.id, core.id); assert.deepEqual(task.write_scope, ['producer.py']);
        const executionContext = context.repair_context.artifact_repair.execution_context;
        assert.equal(executionContext.profile_id, null);
        assert.equal(executionContext.worker_profiles.find(worker => worker.id === core.worker_id).profile_id,
          `fixture-repair-${context.round_index}`);
        assert.deepEqual(context.additional_read_sources.map(s => s.path).sort(), ['generator.py', 'template.jinja']);
        assert(!existsSync(join(context.stageDirectory, 'template.jinja')));
        const overlays = new Set(context.additional_read_sources.map(source => source.path));
        const transport = createArtifactSession({root: context.stageDirectory, allowedPaths: task.write_scope,
          readablePaths: task.read_scope.filter(path => !overlays.has(path)), readSources: context.additional_read_sources,
          journalPath: join(root, `worker-${context.round_index}.jsonl`)});
        try {
          assert.equal(transport.readFile({path: 'template.jinja'}).content, 'Render the request description.');
          assert.throws(() => transport.writeFile({path: 'template.jinja', content: 'forbidden'}), /NOT_ALLOWED/);
          transport.writeFile({path: 'producer.py', content: repeat && context.round_index === 1 ? 'description = "STILL_WRONG"\n' : 'description = "REQUEST"\n'});
        } finally { transport.close(); }
        return {status: 'completed', outcome_uncertain: false};
      }
      for (const path of task.write_scope) await writeFile(join(context.stageDirectory, path), path === 'template.jinja'
        ? 'Render the request description.' : path === 'producer.py' ? 'description = "SCHEMA"\n' : 'value = "unchanged"\n');
      return {status: 'completed', outcome_uncertain: false};
    },
    checkTask: async (check, ctx) => {
      checks.push({id: check.id, round: ctx.round_index});
      const isPublic = check.id === 'public-description';
      const passed = !isPublic || (await readFile(join(ctx.candidateDirectory, 'producer.py'), 'utf8')).includes('"REQUEST"');
      const report = {check_id: check.id, check_version: check.version, environment_ref: check.environment_ref,
        status: passed ? 'passed' : 'failed', executed: true, exit_code: passed ? 0 : 1, assertions: 1, skipped: 0,
        outcome_uncertain: false, error: null, unexecuted_test_ids: [], cases: []};
      if (isPublic) {
        report.assertion_contract_sha256 = assertionContract.sha256;
        report.cases.push({test_id: 'test-description', status: report.status, assertions: 1,
          assertion_results: [{assertion_id: 'assert-description', status: report.status}],
          ...(!passed ? {error_type: 'AssertionError', message: 'request description source mismatch', failed_assertion_id: 'assert-description'} : {})});
      }
      return {...report, evidence: report};
    },
    decideRepairOwners: async request => ({answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, {type: 'choice', choice: 'artifact-core'}]))}),
    decideRepair: async request => {
      choices.push(request); const candidate = request.candidates.find(candidate => candidate.id === 'repair-inferred-owners');
      assert(candidate); return {status: 'selected', candidate_id: candidate.id, candidate};
    }};
  return {root, options, calls, checks, choices, events, profiles};
}

test('authorization precedes owner inference, atomic scope commit, repair selection and only the selected worker with immutable reads', async t => {
  const state = await fixture(t, {repeat: true}), order = [];
  state.options.beforeRepairDecision = async ({failure}, meta) => {
    assert.equal(meta.stage, 'repair_owners'); assert.equal(failure.round_index, meta.round_index);
    assert.equal(failure.public_evidence[0].status, 'failed'); order.push(`gate-${meta.round_index}`);
  };
  const owner = state.options.decideRepairOwners, repair = state.options.decideRepair;
  state.options.decideRepairOwners = async (request, meta) => {
    assert.equal(meta.stage, 'repair_owners'); order.push(`owner-${meta.round_index}`); return owner(request);
  };
  state.options.decideRepair = async (request, meta) => {
    assert(state.events.some(event => event.event === 'adaptive_repair_owner_inference_committed' && event.round_index === meta.round_index));
    order.push(`repair-${meta.round_index}`); return repair(request);
  };
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.status, 'completed', JSON.stringify(result.terminal_cause));
  assert.deepEqual(order, ['gate-0', 'owner-0', 'repair-0', 'gate-1', 'owner-1', 'repair-1']);
  assert.deepEqual(result.operations, {implementation: 3, repair: 2, carry_forward: 4});
  assert.equal(state.checks.filter(check => check.id === 'public-description').length, 3);
  for (const [index, action] of result.repair_actions.entries()) {
    const inferred = result.rounds[index].owner_inference;
    assert.equal(inferred.status, 'inferred'); assert.equal(inferred.assignments.length, 1);
    assert.equal(inferred.assignments[0].artifact_id, 'artifact-core');
    assert.equal(inferred.assignments[0].owner_task_id, 'build-core');
    assert.equal(action.candidate.owner_inference_id, inferred.inference_id);
    assert.deepEqual(action.candidate.artifact_ids, ['artifact-core']);
    assert.deepEqual(result.rounds[index + 1].plan.workers.find(worker => worker.id === 'worker-core').profile_id, `fixture-repair-${index + 1}`);
  }
  for (const id of ['artifact-ir', 'artifact-ui', 'artifact-generator', 'artifact-unrelated']) {
    assert.equal(result.rounds[0].exported.artifact_revisions[id], result.rounds[2].exported.artifact_revisions[id]);
  }
  assert.equal(result.repair_history.entries[1].resolved_failure_keys.length, 1);
});

test('a failed preserved-baseline gate blocks every owner/repair/profile callback before spend', async t => {
  const state = await fixture(t); let ownerCalls = 0, repairCalls = 0;
  state.options.beforeRepairDecision = async () => { throw Object.assign(new Error('baseline drift'), {code: 'BASELINE_DRIFT', outcome_uncertain: false}); };
  state.options.decideRepairOwners = async () => { ownerCalls++; };
  state.options.decideRepair = async () => { repairCalls++; };
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.status, 'failed'); assert.equal(result.stop_code, 'BASELINE_DRIFT');
  assert.equal(result.outcome_uncertain, false); assert.equal(result.terminal_cause.stage, 'repair_owners');
  assert.equal(ownerCalls, 0); assert.equal(repairCalls, 0); assert.equal(state.profiles.length, 0);
  assert.equal(state.calls.filter(call => call.context.operation === 'repair').length, 0);
});

test('known owner provider rejection is recorded once and never becomes a repair or retry', async t => {
  const state = await fixture(t); let ownerCalls = 0;
  state.options.decideRepairOwners = async () => {
    ownerCalls++; throw Object.assign(new Error('model input rejected'), {code: 'HTTP_ERROR', http_status: 400, outcome_uncertain: false});
  };
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.status, 'failed'); assert.equal(result.stop_code, 'HTTP_ERROR');
  assert.equal(result.terminal_cause.http_status, 400); assert.equal(result.terminal_cause.stage, 'repair_owners');
  assert.equal(ownerCalls, 1); assert.equal(state.choices.length, 0); assert.equal(state.profiles.length, 0);
  assert.equal(result.rounds[0].owner_inference.status, 'stopped');
  assert.equal(result.rounds[0].owner_inference.response_received, false);
  assert.equal(state.events.filter(event => event.event === 'adaptive_repair_owner_inference_stopped').length, 1);
});

test('v2 owner input stays bound through the pre-spend gate, typed repair, selected profile and immutable carry-forward', async t => {
  const state = await fixture(t), order = [];
  state.options.repairScopePolicy = 'public-inferred-owner-v2'; state.options.artifactRepairPolicy = 'inferred-v2';
  state.options.beforeRepairDecision = async () => { order.push('gate'); };
  const owner = state.options.decideRepairOwners, repair = state.options.decideRepair, check = state.options.checkTask;
  state.options.checkTask = async (item, ctx) => {
    const report = await check(item, ctx);
    if (item.id !== 'public-description') report.evidence = {error: null};
    return report;
  };
  state.options.decideRepairOwners = async request => {
    order.push('owner'); assert.equal(request.state.schema_version, 'adaptive-inferred-owner-input/v2');
    assert.equal(request.state.detailed_failed_cases.length, 1); return owner(request);
  };
  state.options.decideRepair = async request => {
    order.push('repair'); const input = {...request, artifactBindings: state.options.artifactBindings, ownerInputPolicy: 'inferred-v2'};
    for (const candidate of request.candidates) validateInferredRepairCandidate({...input, candidate});
    assert.equal(buildInferredRepairDecisionContext(input).report.inferred_contract.schema_version, 'adaptive-inferred-repair-contract/v2');
    return repair(request);
  };
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.status, 'completed', JSON.stringify(result.terminal_cause));
  assert.deepEqual(order, ['gate', 'owner', 'repair']);
  const inference = result.rounds[0].owner_inference;
  assert.equal(inference.owner_input_policy, 'inferred-v2');
  assert.equal(inference.owner_input_projection.mode, 'single_target_state');
  assert.equal(inference.request_sha256, inference.owner_input_projection.output_request_sha256);
  assert.equal(result.repair_actions[0].candidate.owner_inference_id, inference.inference_id);
  assert.equal(state.calls.filter(call => call.context.operation === 'repair').length, 1);
  assert.equal(state.profiles.length, 1);
  assert.equal(state.checks.filter(item => item.id === 'public-description').length, 2);
  for (const id of ['artifact-ir', 'artifact-ui', 'artifact-generator', 'artifact-unrelated']) {
    assert.equal(result.rounds[0].exported.artifact_revisions[id], result.rounds[1].exported.artifact_revisions[id]);
  }
});

function inflateInterface(state, artifactId) {
  const check = state.options.checkTask;
  state.options.checkTask = async (item, ctx) => {
    const report = await check(item, ctx);
    if (item.id !== 'public-description') report.evidence = {error: null};
    return report;
  };
  const unit = state.options.planning.catalog.units.find(row => row.artifact_ids.includes(artifactId));
  unit.interface = `Original complete ${artifactId} interface. ${'Detailed behavior. '.repeat(4800)}`;
  state.options.planning.catalog_sha256 = hash(JSON.stringify(state.options.planning.catalog));
}

test('D076 repair budget packs an oversized owner request before the owner callback and keeps the owner answer binding', async t => {
  const state = await fixture(t);
  state.options.repairScopePolicy = 'public-inferred-owner-v2'; state.options.artifactRepairPolicy = 'inferred-v2';
  state.options.repairBudget = {policy: 'repair-budget-v1'};
  inflateInterface(state, 'artifact-unrelated');
  const owner = state.options.decideRepairOwners, seen = [];
  state.options.decideRepairOwners = async request => { seen.push(structuredClone(request)); return owner(request); };
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.status, 'completed', JSON.stringify(result.terminal_cause));
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].state.repair_budget.applied_steps, ['compact_unfocused_interfaces']);
  assert.ok(Buffer.byteLength(JSON.stringify(seen[0])) < 20000);
  const applied = state.events.filter(event => event.event === 'adaptive_repair_budget_applied');
  assert.equal(applied.length, 1); assert.equal(applied[0].report.within_budget, true);
  assert.equal(applied[0].report.before.within_budget, false);
  // The model sees the packed body; inference stays bound to the canonical unpacked request.
  assert.equal(result.rounds[0].owner_inference.request_sha256, result.rounds[0].owner_inference.owner_input_projection.output_request_sha256);
});

test('D076 repair budget stops an irreducible owner request before any owner callback, as a known failure', async t => {
  const state = await fixture(t);
  state.options.repairScopePolicy = 'public-inferred-owner-v2'; state.options.artifactRepairPolicy = 'inferred-v2';
  state.options.repairBudget = {policy: 'repair-budget-v1'};
  inflateInterface(state, 'artifact-ui');
  let ownerCalls = 0; state.options.decideRepairOwners = async () => { ownerCalls++; };
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(ownerCalls, 0);
  const inference = result.rounds[0].owner_inference;
  assert.equal(inference.status, 'stopped'); assert.equal(inference.reason, 'ADAPTIVE_REPAIR_BUDGET_EXCEEDED');
  assert.equal(inference.outcome_uncertain, false);
  state.options.repairBudget = {policy: 'other'};
  await assert.rejects(runAdaptiveDagExecution(state.options), {code: 'ADAPTIVE_EXECUTION_INVALID_CONFIG'});
});


test('D076 repair feedback: the failed candidate is readable but not writable and worker reports reach the next owner request', async t => {
  const state = await fixture(t, {repeat: true});
  state.options.repairScopePolicy = 'public-inferred-owner-v2'; state.options.artifactRepairPolicy = 'inferred-v2';
  state.options.repairFeedback = {read_scope: 'candidate-v1', worker_diagnostics: 'report-v1'};
  const execute = state.options.executeTask, readable = [];
  state.options.executeTask = async (task, context) => {
    if (context.operation !== 'repair') return execute(task, context);
    const overlays = new Set(context.additional_read_sources.map(source => source.path));
    readable.push({round: context.round_index, overlays: [...overlays].sort()});
    assert(!task.write_scope.some(path => overlays.has(path)));
    const transport = createArtifactSession({root: context.stageDirectory, allowedPaths: task.write_scope,
      readablePaths: task.read_scope.filter(path => !overlays.has(path)), readSources: context.additional_read_sources,
      journalPath: join(state.root, `feedback-${context.round_index}.jsonl`)});
    try {
      assert.equal(transport.readFile({path: 'unrelated.py'}).content, 'value = "unchanged"\n');
      assert.throws(() => transport.writeFile({path: 'unrelated.py', content: 'forbidden'}), /NOT_ALLOWED/);
      transport.writeFile({path: 'producer.py', content: context.round_index === 1 ? 'description = "STILL_WRONG"\n' : 'description = "REQUEST"\n'});
    } finally { transport.close(); }
    return {status: 'completed', outcome_uncertain: false, worker_report: {denied_read_paths: ['secret.py'],
      final_response: 'Changed producer.py. The remaining cause is probably in `unrelated.py` (not writable here).'}};
  };
  const owner = state.options.decideRepairOwners, seen = [];
  state.options.decideRepairOwners = async request => { seen.push(structuredClone(request)); return owner(request); };
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.status, 'completed', JSON.stringify(result.terminal_cause));
  for (const row of readable) for (const path of ['generator.py', 'template.jinja', 'unrelated.py']) assert(row.overlays.includes(path), path);
  assert.equal(seen.length, 2);
  assert(!Object.hasOwn(seen[0].state, 'worker_diagnostics'));
  const [entry] = seen[1].state.worker_diagnostics.entries;
  assert.equal(seen[1].state.worker_diagnostics.basis, 'unverified_statements_of_this_round_repair_workers');
  assert.deepEqual(entry.repaired_artifact_ids, ['artifact-core']);
  assert.deepEqual(entry.denied_read_paths, ['secret.py']); assert.deepEqual(entry.denied_read_artifact_ids, []);
  assert.deepEqual(entry.mentioned_artifact_ids, ['artifact-core', 'artifact-unrelated']);
  assert.equal(result.rounds[1].worker_reports.length, 1);
  assert.equal(state.events.filter(event => event.event === 'adaptive_repair_read_scope_expanded').length, 2);
  for (const value of [{read_scope: 'all'}, {}, {worker_diagnostics: 'report-v1', extra: 1}]) {
    await assert.rejects(runAdaptiveDagExecution({...state.options, runDirectory: join(state.root, `bad-${JSON.stringify(value).length}`),
      repairFeedback: value}), {code: 'ADAPTIVE_EXECUTION_INVALID_CONFIG'});
  }
});
