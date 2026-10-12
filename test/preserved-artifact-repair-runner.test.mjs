import test from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {executePreservedArtifactRepair, preservedArtifactRevisions, preservedCandidateSnapshot,
  preservedRepairTerminalState, runPreservedArtifactRepair, upgradePreservedPublicGate,
  verifyPreservedFailureRecheck, verifyPreservedProfileHistory, verifyPreservedSourceCondition,
  inspectPreservedRepairSource} from '../src/benchmark/preserved-artifact-repair-runner.mjs';
import {chooseAdaptiveRepair} from '../src/orchestration/adaptive-dag-planner.mjs';
import {buildArtifactRepairDecisionContext} from '../src/orchestration/adaptive-artifact-repair-v2.mjs';
import {createArtifactSession} from '../src/orchestration/artifact-transport.mjs';
import {applyAdaptiveProfileSelections, selectAdaptiveProfiles} from '../src/orchestration/adaptive-profile-selection.mjs';
import {buildInferredRepairDecisionContext} from '../src/orchestration/adaptive-inferred-repair.mjs';
import {createAdaptiveProfilePreparer, loadAdaptiveRunManifest} from '../src/benchmark/adaptive-dag-runner.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const base = JSON.parse(readFileSync(new URL('../examples/dag/contract-fixture.json', import.meta.url)));
function cleanup(path) {
  const stat = lstatSync(path); if (!stat.isSymbolicLink()) chmodSync(path, 0o700);
  if (stat.isDirectory() && !stat.isSymbolicLink()) for (const name of readdirSync(path)) cleanup(join(path, name));
  rmSync(path, {recursive: true, force: true});
}
function fixture(t, {choice = 'repair-failure-owners', initiallyPassing = false, inferred = false} = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'preserved-repair-test-'))); t.after(() => cleanup(root));
  const candidate = join(root, 'historical-candidate'); mkdirSync(candidate);
  const originalFiles = {'core.json': JSON.stringify({value: 7}), 'metadata.json': '{"kind":"core"}', 'ui.json': '{"label":"unchanged"}'};
  for (const [name, content] of Object.entries(originalFiles)) {
    writeFileSync(join(candidate, name), content); chmodSync(join(candidate, name), name === 'ui.json' ? 0o555 : 0o444);
  }
  const plan = structuredClone(base), [core, ui, aggregate] = plan.tasks;
  core.write_scope = ['core.json', 'metadata.json']; core.output_artifact_ids.push('artifact-meta');
  core.requirement_ids.push('requirement-meta'); core.read_scope = [];
  ui.write_scope = ['ui.json']; ui.read_scope = [];
  plan.requirement_ids.push('requirement-meta'); plan.artifacts.push({id: 'artifact-meta', producer_task_id: core.id});
  const bindings = {'artifact-core': {paths: ['core.json']}, 'artifact-meta': {paths: ['metadata.json']}, 'artifact-ui': {paths: ['ui.json']}};
  aggregate.input_artifact_ids = plan.artifacts.map(a => a.id); aggregate.read_scope = Object.keys(originalFiles);
  aggregate.requirement_ids = [...plan.requirement_ids]; aggregate.check_ids = ['public-1', 'public-2'];
  plan.checks[0].artifact_ids.push('artifact-meta'); plan.checks[0].requirement_ids.push('requirement-meta');
  const proto = structuredClone(plan.checks[2]);
  plan.checks = [...plan.checks.slice(0, 2), ...aggregate.check_ids.map(id => ({...proto, id, phase: 'integration',
    artifact_ids: [...aggregate.input_artifact_ids], requirement_ids: [...plan.requirement_ids]}))];
  const publicSource = 'Core value must be eight. UI label stays unchanged. Metadata kind remains core.';
  const descriptions = plan.requirement_ids.map(id => ({id, text: `Preserve original ${id}.`, source_refs: ['fixture-spec']}));
  const catalog = {schema_version: 'adaptive-catalog/v1', source_sha256: hash(publicSource),
    units: plan.artifacts.map(artifact => ({id: `unit-${artifact.id}`, title: artifact.id, artifact_ids: [artifact.id],
      requirement_ids: [artifact.id.replace('artifact-', 'requirement-')], interface: `${artifact.id} stable JSON fields`, evidence_ids: [`e-${artifact.id}`]})),
    artifacts: plan.artifacts.map(artifact => ({id: artifact.id, paths: bindings[artifact.id].paths, description: artifact.id, evidence_ids: [`e-${artifact.id}`]})),
    evidence: plan.artifacts.map(artifact => ({id: `e-${artifact.id}`, quote: publicSource}))};
  const planning = {status: 'planned', dispatch_allowed: true, plan, artifactBindings: bindings, catalog,
    source_sha256: hash(publicSource), catalog_sha256: hash(JSON.stringify(catalog)), requirement_descriptions: descriptions};
  if (inferred) planning.execution_context = {profile_id: null, profile_policy: 'per_task_jev_selection',
    worker_profiles: structuredClone(plan.workers), initial_planning_profile_assumption: 'fixture-local'};
  const snapshot = preservedCandidateSnapshot(candidate), revisions = preservedArtifactRevisions(snapshot, bindings);
  const registry = [{id: 'public-1', test_ids: ['case-core']}, {id: 'public-2', test_ids: ['case-ui']}];
  const source = {candidateDirectory: candidate, planning, snapshot, artifact_revisions: revisions, registry,
    expected_failed_cases: [{check_id: 'public-1', test_id: 'case-core', error_type: 'AssertionError', message: 'core must be eight'}],
    ...(inferred ? {inferred_repair_required: true} : {})};
  const contract = {schema_version: 'public-assertion-contract/v1', version: inferred ? '2' : '1', assertions: [
    {id: 'assert-core', check_id: 'public-1', test_id: 'case-core', requirement_ids: ['requirement-core'], artifact_paths: ['core.json']},
    {id: 'assert-ui', check_id: 'public-2', test_id: 'case-ui', requirement_ids: ['requirement-ui'], artifact_paths: ['ui.json']},
  ]};
  const source_text = JSON.stringify(contract), assertionPath = join(root, 'assertions.json'); writeFileSync(assertionPath, source_text);
  const assertionContract = {contract, source_text, sha256: hash(source_text), source_path: 'assertions.json'};
  const checker = join(root, 'checker.mjs'); writeFileSync(checker, '// Public fixture checker identity.\n');
  const checks = [], workers = [], decisions = [], events = [];
  const options = {source, run_id: 'preserved-fixture', runDirectory: join(root, 'new-run'),
    checkerRoot: root, checkerFiles: [checker, assertionPath], environment: {id: 'node22-fixture-v1'}, assertionContract,
    maxRepairRounds: 1, testRequirements: {'case-core': ['requirement-core'], 'case-ui': ['requirement-ui']},
    probeEnvironment: async () => ({executable: process.execPath, node: process.version, platform: process.platform}),
    record: async event => events.push(event),
    checkTask: async (check, ctx) => {
      checks.push({id: check.id, round_index: ctx.round_index, revisions: ctx.artifact_revisions});
      const value = check.id === 'public-1' ? JSON.parse(readFileSync(join(ctx.candidateDirectory, 'core.json'))).value : null;
      const passed = check.id !== 'public-1' || initiallyPassing || value === 8;
      const status = passed ? 'passed' : 'failed';
      const report = {check_id: check.id, check_version: check.version, environment_ref: check.environment_ref,
        status, executed: true, exit_code: passed ? 0 : 1, assertions: 1, skipped: 0, outcome_uncertain: false,
        cases: [], unexecuted_test_ids: [], error: passed ? null : {code: 'AssertionError', message: 'core must be eight'}};
      if (check.phase === 'integration') {
        const id = check.id === 'public-1' ? 'core' : 'ui';
        report.assertion_contract_sha256 = assertionContract.sha256;
        report.cases.push({test_id: `case-${id}`, status, assertions: 1,
          assertion_results: [{assertion_id: `assert-${id}`, status}],
          ...(!passed ? {error_type: 'AssertionError', message: 'core must be eight', failed_assertion_id: `assert-${id}`} : {})});
      }
      return {...report, evidence: report};
    },
    executeRepairTask: async (task, ctx) => {
      workers.push({task, context: ctx});
      assert.equal(ctx.operation, 'repair'); assert.deepEqual(task.write_scope, ['core.json']);
      assert(task.read_scope.includes('metadata.json'));
      writeFileSync(join(ctx.stageDirectory, 'core.json'), '{"value":8}');
      return {status: 'completed', outcome_uncertain: false};
    },
    decideRepair: async args => chooseAdaptiveRepair({source: publicSource, ...args,
      artifactBindings: bindings, buildRepairState: buildArtifactRepairDecisionContext,
      decide: async request => {
        decisions.push(request);
        return {answers: Object.fromEntries(Object.keys(request.questions).map(id => [id,
          {type: 'choice', choice: choice === 'stop' ? 'stop' : `repair_${choice}`}]))};
      }})};
  return {root, source, options, checks, workers, decisions, events, publicSource};
}

test('fresh public failure drives a new typed choice and one artifact worker; copied and inherited outputs stay exact', async t => {
  const state = fixture(t), result = await executePreservedArtifactRepair(state.options);
  assert.equal(result.execution.status, 'completed'); assert.equal(result.metrics.initial_failure_reproduced, true);
  assert.equal(result.metrics.bootstrap_copy_tasks, 2); assert.equal(result.metrics.bootstrap_copy_worker_provider_calls, 0);
  assert.equal(state.decisions.length, 1); assert.equal(state.workers.length, 1);
  assert.equal(state.workers[0].task.id, 'build-core');
  assert.equal(state.workers[0].context.repair_context.artifact_repair.schema_version, 'adaptive-artifact-repair/v2');
  assert.deepEqual(result.execution.operations, {implementation: 2, repair: 1, carry_forward: 1});
  assert.equal(state.checks.filter(c => c.id.startsWith('public-')).length, 4);
  assert.equal(state.checks.filter(c => c.id === 'check-ui').length, 2);
  assert.notEqual(result.execution.rounds[0].public_evidence[0].evidence_key, result.execution.rounds[1].public_evidence[0].evidence_key);
  const proof = result.inherited_export_proofs[0];
  assert.deepEqual(proof.selected_artifact_ids, ['artifact-core']);
  assert.deepEqual(proof.inherited_artifacts.map(a => a.artifact_id).sort(), ['artifact-meta', 'artifact-ui']);
  for (const artifact of proof.inherited_artifacts) for (const file of artifact.files) {
    assert.equal(file.mode, state.source.snapshot.files.find(item => item.path === file.path).mode);
  }
  assert.deepEqual(preservedCandidateSnapshot(state.source.candidateDirectory), state.source.snapshot);
  assert.equal(JSON.parse(readFileSync(join(result.execution.candidate_path, 'core.json'))).value, 8);
  assert.equal(result.bootstrap_proof.exact_original_bytes_modes_and_revisions, true);
  assert.equal(state.events.filter(e => e.event === 'preserved_candidate_seed_copied').length, 2);
  assert.equal(state.events.filter(e => e.event === 'preserved_export_inheritance_verified').length, 1);
  await assert.rejects(executePreservedArtifactRepair(state.options), {code: 'ADAPTIVE_EXECUTION_RESTART_BLOCKED'});
  assert.equal(state.decisions.length, 1);
});

test('stop and known oversized rejection retain the failure and create no worker', async t => {
  for (const mode of ['stop', 'oversized']) await t.test(mode, async t => {
    const state = fixture(t, {choice: 'stop'});
    if (mode === 'oversized') state.options.decideRepair = async () => {
      throw Object.assign(new Error('guard'), {code: 'ADAPTIVE_TOKEN_PREFLIGHT_BLOCKED', outcome_uncertain: false});
    };
    const result = await executePreservedArtifactRepair(state.options);
    assert.equal(result.execution.status, 'failed'); assert.equal(result.metrics.initial_failure_reproduced, true);
    assert.equal(state.workers.length, 0); assert.equal(result.execution.operations.repair, 0);
    assert.equal(result.original_candidate_unchanged, true);
    assert.equal(result.execution.prior_public_failure.public_evidence[0].status, 'failed');
  });
});

test('nonreproduced, changed and uncertain public failures do not authorize a new decision', async t => {
  for (const mode of ['passed', 'changed', 'uncertain']) await t.test(mode, async t => {
    const state = fixture(t, {initiallyPassing: mode === 'passed'}), check = state.options.checkTask;
    if (mode !== 'passed') state.options.checkTask = async (definition, context) => {
      const result = await check(definition, context);
      if (definition.id === 'public-1') {
        if (mode === 'changed') result.evidence.cases[0].message = 'a different failure';
        else return {status: 'uncertain', outcome_uncertain: true};
      }
      return result;
    };
    const result = await executePreservedArtifactRepair(state.options);
    assert.equal(result.metrics.initial_failure_reproduced, false); assert.equal(state.decisions.length, 0); assert.equal(state.workers.length, 0);
    assert.equal(result.execution.status, mode === 'uncertain' ? 'uncertain' : 'failed');
    if (mode === 'passed') assert.equal(result.execution.stop_code, 'PRESERVED_FAILURE_NOT_REPRODUCED');
  });
});

test('source drift and aliasing fail closed before dispatch; forbidden inherited writes cannot pass', async t => {
  await t.test('changed source', async t => {
    const state = fixture(t); chmodSync(join(state.source.candidateDirectory, 'core.json'), 0o644);
    writeFileSync(join(state.source.candidateDirectory, 'core.json'), '{"value":123}'); chmodSync(join(state.source.candidateDirectory, 'core.json'), 0o444);
    await assert.rejects(executePreservedArtifactRepair(state.options), {code: 'PRESERVED_SOURCE_CANDIDATE_DRIFT'});
    assert.equal(state.decisions.length, 0); assert.equal(state.workers.length, 0);
  });
  await t.test('symlink', async t => {
    const state = fixture(t); symlinkSync('core.json', join(state.source.candidateDirectory, 'alias.json'));
    assert.throws(() => preservedCandidateSnapshot(state.source.candidateDirectory), {code: 'PRESERVED_CANDIDATE_ALIAS'});
  });
  await t.test('inherited corruption', async t => {
    const state = fixture(t), work = state.options.executeRepairTask;
    state.options.executeRepairTask = async (task, context) => {
      const result = await work(task, context); writeFileSync(join(context.stageDirectory, 'metadata.json'), '{"kind":"changed"}'); return result;
    };
    const result = await executePreservedArtifactRepair(state.options);
    assert.equal(result.execution.status, 'failed'); assert.equal(result.execution.stop_code, 'ADAPTIVE_ARTIFACT_REPAIR_CARRY_DRIFT');
    assert.equal(result.inherited_export_proofs.length, 0); assert.equal(result.incomplete_export_proofs.length, 1);
    assert.equal(result.incomplete_export_proofs[0].status, 'not_verified');
    assert.equal(state.checks.filter(c => c.id.startsWith('public-') && c.round_index === 1).length, 0);
    assert.deepEqual(preservedCandidateSnapshot(state.source.candidateDirectory), state.source.snapshot);
  });
});

test('known model rejection survives an expired final deadline with its original HTTP classification', async t => {
  const state = fixture(t);
  state.options.decideRepair = async () => { throw Object.assign(new Error('known model limit'), {
    code: 'HTTP_ERROR', http_status: 400, error_diagnostics: {category: 'model_input_limit'}, outcome_uncertain: false}); };
  const result = await executePreservedArtifactRepair(state.options);
  let deadlineReads = 0;
  const expired = () => { deadlineReads++; throw Object.assign(new Error('deadline'), {code: 'ADAPTIVE_DEADLINE'}); };
  const terminal = preservedRepairTerminalState(result.execution, expired);
  assert.equal(terminal.stopCode, 'HTTP_ERROR'); assert.equal(terminal.unknown, false);
  assert.deepEqual(terminal.terminalCause, {stage: 'repair', code: 'HTTP_ERROR', http_status: 400,
    category: 'model_input_limit', outcome_uncertain: false});
  assert.equal(deadlineReads, 0); assert.equal(state.workers.length, 0);
  assert.throws(() => preservedRepairTerminalState({status: 'completed'}, expired), {code: 'ADAPTIVE_DEADLINE'});
  assert.equal(deadlineReads, 1);
});

test('explicit spend is required before runner filesystem or external actions', async () => {
  await assert.rejects(runPreservedArtifactRepair({manifest: {schema_version: 'fixture'}, sourceRunDirectory: '/missing', runDir: '/missing'}), {code: 'EXPLICIT_SPEND_REQUIRED'});
});

function gateFixture(t) {
  const state = fixture(t), planning = structuredClone(state.source.planning);
  planning.plan.requirement_ids.push('R10.02');
  planning.plan.tasks[0].requirement_ids.push('R10.02');
  planning.plan.tasks[2].requirement_ids.push('R10.02');
  planning.plan.checks[0].requirement_ids.push('R10.02');
  const checkTemplate = planning.plan.checks.find(check => check.phase === 'integration');
  const historicalRegistry = [15, 10, 6, 5, 17, 17, 15].map((count, i) => ({
    id: `public-legacy-${i}`, version: '3', requirement_ids: [...planning.plan.requirement_ids],
    test_ids: Array.from({length: count}, (_, j) => `legacy-${i}-${j}`), runner_ref: 'checker-v3', argv: ['checker-v3'],
  }));
  const legacyChecks = historicalRegistry.map(check => ({...checkTemplate, id: check.id, version: '3'}));
  const local = planning.plan.checks.filter(check => check.phase !== 'integration');
  planning.plan.checks = [...local, ...legacyChecks];
  planning.plan.tasks[2].check_ids = legacyChecks.map(check => check.id);
  const protocol = JSON.parse(readFileSync(new URL('../benchmarks/e2e-swe/public-checks/description-provenance.v1.json', import.meta.url)));
  const source_text = readFileSync(new URL('../benchmarks/e2e-swe/public-checks/assertions.v2.json', import.meta.url), 'utf8');
  const assertionContract = {contract: JSON.parse(source_text), source_text, sha256: hash(source_text)};
  const extra = {id: protocol.check_id, version: '4', requirement_ids: ['R10.02'], test_ids: protocol.tests.map(test => test.id),
    runner_ref: 'checker-v4', argv: ['checker-v4']};
  const registry = [...historicalRegistry.map(check => ({...structuredClone(check), version: '4', runner_ref: 'checker-v4', argv: ['checker-v4']})), extra];
  const checks = [...structuredClone(local), ...legacyChecks.map(check => ({...structuredClone(check), version: '4'})), {...checkTemplate, id: extra.id, version: '4', requirement_ids: ['R10.02']}];
  return {state, input: {planning, historicalRegistry, historicalChecks: planning.plan.checks, registry, checks, protocol, assertionContract}};
}

test('explicit gate upgrade preserves historical ownership and requires unchanged legacy meanings and readiness', t => {
  const {input} = gateFixture(t), original = structuredClone(input);
  const next = upgradePreservedPublicGate(input);
  assert.deepEqual(input, original);
  assert.equal(next.gate_upgrade.historical_test_count, 85);
  assert.equal(next.gate_upgrade.current_test_count, 93);
  assert.equal(next.gate_upgrade.expected_failures.length, 8);
  assert.deepEqual(next.planning.plan.tasks.filter(task => task.kind === 'implementation'),
    input.planning.plan.tasks.filter(task => task.kind === 'implementation'));
  assert.deepEqual(next.planning.artifactBindings, input.planning.artifactBindings);
  assert.notEqual(next.planning.plan.graph_revision, input.planning.plan.graph_revision);
  assert.deepEqual(next.planning.plan.tasks[2].check_ids, input.registry.map(check => check.id));
  const changedLegacy = structuredClone(input); changedLegacy.registry[0].test_ids.pop();
  assert.throws(() => upgradePreservedPublicGate(changedLegacy), {code: 'PRESERVED_LEGACY_GATE_MEANING_CHANGED'});
  const changedReadiness = structuredClone(input); changedReadiness.checks[0].argv.push('different-command');
  assert.throws(() => upgradePreservedPublicGate(changedReadiness), {code: 'PRESERVED_READINESS_DEFINITION_CHANGED'});
});

test('new gate requires all legacy85 passing and all eight bound description failures before authorizing repair', t => {
  const {input} = gateFixture(t), {gate_upgrade} = upgradePreservedPublicGate(input);
  const source = {registry: input.registry, gate_upgrade};
  const failure = {failed_task_ids: [], outcome_uncertain: false, public_evidence: input.registry.map(check => {
    const additional = check.id === gate_upgrade.additional_check_id;
    const cases = check.test_ids.map(id => {
      const expected = gate_upgrade.expected_failures.find(item => item.test_id === id);
      return {test_id: id, status: additional ? 'failed' : 'passed', assertions: 1,
        ...(additional ? {error_type: 'AssertionError', message: 'wrong description source', failed_assertion_id: expected.assertion_id,
          assertion_results: [{assertion_id: expected.assertion_id, status: 'failed'}],
          description_provenance: {schema_version: 'public-description-provenance/v1', scenario: expected.scenario, function: expected.function}} : {})};
    });
    return {check_id: check.id, check_version: '4', status: additional ? 'failed' : 'passed', executed: true, skipped: 0,
      outcome_uncertain: false, evidence: {check_version: '4', cases, unexecuted_test_ids: [],
        assertion_contract_sha256: gate_upgrade.assertion_contract_sha256}};
  })};
  const verified = verifyPreservedFailureRecheck(source, failure);
  assert.equal(verified.kind, 'explicit_new_public_gate_failure');
  assert.equal(verified.historical_passed, 85); assert.equal(verified.additional_failed, 8);
  for (const [change, code] of [
    [f => {f.public_evidence[0].status = 'failed'; f.public_evidence[0].evidence.cases[0].status = 'failed';}, 'PRESERVED_LEGACY_GATE_REGRESSION'],
    [f => {f.public_evidence.at(-1).evidence.cases[0].assertion_results[0].status = 'not_reached';}, 'PRESERVED_ADDITIONAL_FAILURE_NOT_REPRODUCED'],
    [f => {f.public_evidence.at(-1).evidence.assertion_contract_sha256 = '0'.repeat(64);}, 'PRESERVED_ADDITIONAL_FAILURE_NOT_REPRODUCED'],
    [f => {f.public_evidence.at(-1).check_version = '3';}, 'PRESERVED_PUBLIC_RECHECK_INCOMPLETE'],
  ]) {
    const changed = structuredClone(failure); change(changed);
    assert.throws(() => verifyPreservedFailureRecheck(source, changed), {code});
  }
});

test('preserved passed candidate uses the new gate before a causal producer repair and inherits all other exports', async t => {
  const {state, input} = gateFixture(t);
  input.planning.requirement_descriptions.push({id: 'R10.02', text: 'Preserve request-level body descriptions.', source_refs: ['fixture-spec']});
  input.planning.catalog.units.find(unit => unit.artifact_ids.includes('artifact-core')).requirement_ids.push('R10.02');
  input.planning.catalog_sha256 = hash(JSON.stringify(input.planning.catalog));
  const contract = {schema_version: 'public-assertion-contract/v1', version: '2', assertions: input.protocol.tests.map(row => ({
    id: row.assertion_id, check_id: input.protocol.check_id, test_id: row.id, requirement_ids: ['R10.02'],
    artifact_paths: ['core.json'], causal_paths: [
      {path: 'ui.json', role: 'producer', rationale: 'Fixture request-description input owner.'},
      {path: 'metadata.json', role: 'representation', rationale: 'Fixture immutable representation.'},
      {path: 'core.json', role: 'renderer', rationale: 'Fixture direct output owner.'},
    ],
  }))};
  const source_text = JSON.stringify(contract);
  const assertionContract = {contract, source_text, sha256: hash(source_text), source_path: 'assertions.json'};
  writeFileSync(join(state.root, 'assertions.json'), source_text);
  input.assertionContract = assertionContract;
  const upgraded = upgradePreservedPublicGate(input);
  const source = {...state.source, ...upgraded, registry: input.registry, expected_failed_cases: null};
  const checkTask = async (check, ctx) => {
    state.checks.push({id: check.id, round_index: ctx.round_index});
    const definition = input.registry.find(row => row.id === check.id), additional = check.id === input.protocol.check_id;
    const passed = !additional || JSON.parse(readFileSync(join(ctx.candidateDirectory, 'ui.json'))).label === 'request';
    const status = passed ? 'passed' : 'failed';
    const report = {check_id: check.id, check_version: check.version, environment_ref: check.environment_ref,
      status, executed: true, exit_code: passed ? 0 : 1, assertions: definition?.test_ids.length ?? 1,
      skipped: 0, outcome_uncertain: false, error: null, unexecuted_test_ids: [],
      assertion_contract_sha256: assertionContract.sha256, cases: (definition?.test_ids ?? []).map(id => {
        const expected = input.protocol.tests.find(row => row.id === id);
        return {test_id: id, status, assertions: 1, ...(additional ? {
          assertion_results: [{assertion_id: expected.assertion_id, status}],
          description_provenance: {schema_version: 'public-description-provenance/v1', scenario: expected.scenario, function: expected.function},
          ...(!passed ? {error_type: 'AssertionError', message: 'request description source mismatch', failed_assertion_id: expected.assertion_id} : {}),
        } : {})};
      })};
    return {...report, evidence: report};
  };
  const result = await executePreservedArtifactRepair({...state.options, source, assertionContract, checkTask,
    repairScopePolicy: 'public-causal-v1', artifactRepairPolicy: 'causal-v1',
    testRequirements: Object.fromEntries(input.registry.flatMap(row => row.test_ids.map(id => [id, row.requirement_ids]))),
    decideRepair: async request => {
      state.decisions.push(request);
      const candidate = request.candidates.find(row => row.id === 'repair-causal-producer');
      assert(candidate); assert.deepEqual(candidate.artifact_ids, ['artifact-ui']);
      return {status: 'selected', candidate_id: candidate.id, candidate};
    },
    executeRepairTask: async (task, ctx) => {
      state.workers.push({task, context: ctx});
      assert.equal(task.id, 'build-ui'); assert.deepEqual(task.write_scope, ['ui.json']);
      assert.equal(ctx.repair_context.artifact_repair.schema_version, 'adaptive-artifact-repair/v3');
      assert.deepEqual(ctx.additional_read_sources.map(row => row.path).sort(), ['core.json', 'metadata.json']);
      const overlays = new Set(ctx.additional_read_sources.map(row => row.path));
      const transport = createArtifactSession({root: ctx.stageDirectory, allowedPaths: task.write_scope,
        readablePaths: task.read_scope.filter(path => !overlays.has(path)), readSources: ctx.additional_read_sources,
        journalPath: join(state.root, 'causal-worker.jsonl')});
      try {
        assert.equal(transport.readFile({path: 'metadata.json'}).content, '{"kind":"core"}');
        assert.throws(() => transport.writeFile({path: 'metadata.json', content: 'forbidden'}), /NOT_ALLOWED/);
        transport.writeFile({path: 'ui.json', content: '{"label":"request"}'});
      } finally { transport.close(); }
      return {status: 'completed', outcome_uncertain: false};
    }});
  assert.equal(result.execution.status, 'completed', JSON.stringify({code: result.execution.stop_code, cause: result.execution.terminal_cause}));
  assert.equal(result.metrics.initial_failure_basis, 'new_public_gate_on_preserved_legacy_passed_candidate');
  assert.equal(result.bootstrap_proof.recheck.historical_passed, 85); assert.equal(result.bootstrap_proof.recheck.additional_failed, 8);
  assert.equal(result.metrics.bootstrap_copy_worker_provider_calls, 0); assert.equal(state.decisions.length, 1); assert.equal(state.workers.length, 1);
  assert.equal(state.checks.filter(row => input.registry.some(definition => definition.id === row.id)).length, 16);
  assert.deepEqual(result.inherited_export_proofs[0].selected_artifact_ids, ['artifact-ui']);
  assert.deepEqual(result.inherited_export_proofs[0].inherited_artifacts.map(row => row.artifact_id).sort(), ['artifact-core', 'artifact-meta']);
  assert.deepEqual(result.execution.repair_history.entries[0].changed_artifact_ids, ['artifact-ui']);
  assert.deepEqual(preservedCandidateSnapshot(state.source.candidateDirectory), state.source.snapshot);
});

test('historical selected profiles require committed decisions, exact plan authority and actual matching worker identities', async t => {
  const state = fixture(t, {choice: 'stop'}), historicalPlanning = state.source.planning;
  historicalPlanning.execution_context = {profile_id: 'opus55-medium', role: 'implementation'};
  let commit;
  const selection = await selectAdaptiveProfiles({plan: historicalPlanning.plan, catalog: historicalPlanning.catalog,
    requirement_descriptions: historicalPlanning.requirement_descriptions, phase: 'initial', round_index: 0,
    cli_version: '2.1.293', allowed_profile_ids: ['claude_opus55_medium', 'claude_sonnet55_medium'],
    decide: async request => ({answers: Object.fromEntries(Object.keys(request.questions).map((id, index) =>
      [id, {type: 'choice', choice: index === 0 ? 'claude_opus55_medium' : 'claude_sonnet55_medium'}]))}),
    commit: async value => {commit = structuredClone(value);}});
  assert.equal(selection.status, 'selected');
  const applied = applyAdaptiveProfileSelections({plan: historicalPlanning.plan, selection});
  const profiledPlanning = {...structuredClone(historicalPlanning), plan: applied.plan,
    execution_context: {profile_id: null, profile_policy: 'per_task_jev_selection', worker_profiles: applied.plan.workers}};
  const bootstrap = await executePreservedArtifactRepair({...state.options, source: {...state.source, planning: profiledPlanning}});
  assert.equal(bootstrap.execution.rounds.length, 1);
  const finalRound = bootstrap.execution.rounds[0];
  const receipts = selection.selections.map((row, index) => ({source_path: `receipts/claude-${index}.json`, receipt: {
    provider: 'claude', purpose: 'worker', status: 'completed', outcome_uncertain: false, inference_started: true,
    task_id: row.task_id, attempt_id: finalRound.operations.find(task => task.task_id === row.task_id).attempt_id,
    round_index: 0, operation: 'implementation',
    requested_profile: {id: row.profile_id, model: row.model, effort: row.effort}, requested_model: row.model,
    executed_model_arg: row.model, requested_effort: row.effort, executed_effort_arg: row.effort,
    model_identity_verified: true, observed_models: [row.model], effective_effort_verified: null}}));
  const input = {historicalPlanning, profiledPlanning, finalRound, selection, commit, applied, receipts};
  const original = structuredClone(input), verified = verifyPreservedProfileHistory(input);
  assert.deepEqual(input, original); assert.equal(verified.worker_count, 2); assert.equal(verified.current_run_provider_calls, 0);
  assert.deepEqual(verified.workers.map(row => row.profile_id), ['claude_opus55_medium', 'claude_sonnet55_medium']);
  assert(verified.workers.every(row => row.model_identity_verified && row.effective_effort_verified === null));
  for (const [change, code] of [
    [value => {value.receipts[0].receipt.observed_models = ['different-model'];}, 'PRESERVED_PROFILE_IDENTITY_MISMATCH'],
    [value => {value.receipts[0].receipt.executed_effort_arg = 'low';}, 'PRESERVED_PROFILE_IDENTITY_MISMATCH'],
    [value => {value.receipts.pop();}, 'PRESERVED_PROFILE_RECEIPT_COVERAGE'],
    [value => {value.profiledPlanning.plan.tasks[0].write_scope.push('forbidden.py');}, 'PRESERVED_PROFILE_APPLICATION_MISMATCH'],
    [value => {value.finalRound.plan.checks.at(-1).runner_ref = 'different.mjs';}, 'PRESERVED_PROFILE_PLAN_MISMATCH'],
    [value => {value.commit.selections[0].profile_id = 'another-choice';}, 'PRESERVED_PROFILE_COMMIT_MISMATCH'],
  ]) {
    const invalid = structuredClone(input); change(invalid);
    assert.throws(() => verifyPreservedProfileHistory(invalid), {code});
  }
});

async function inferredPreservedCase(t, {changedFailure, version}) {
    const state = fixture(t, {inferred: true}), order = [], selectedProfiles = new Map();
    const rootDir = resolve(import.meta.dirname, '..');
    const manifest = loadAdaptiveRunManifest(join(rootDir, version === 'v2'
      ? 'benchmarks/e2e-swe/manifests/d073-inferred-v2.json' : 'benchmarks/e2e-swe/manifests/d073-adaptive.json'), rootDir);
    const buildRepairState = version === 'v2'
      ? request => buildInferredRepairDecisionContext({...request, ownerInputPolicy: 'inferred-v2'})
      : buildInferredRepairDecisionContext;
    const record = async event => {state.events.push(event); if (event.event === 'preserved_public_failure_reproduced') order.push('reproduced');};
    const prepareProfiles = createAdaptiveProfilePreparer({rootDir, manifest, catalog: state.source.planning.catalog,
      profileSelections: selectedProfiles, input: {requirement_descriptions: state.source.planning.requirement_descriptions},
      context: {directory: state.options.runDirectory, record, save: (path, value) => writeFileSync(join(state.options.runDirectory, path), JSON.stringify(value))},
      session: {receipts: () => [], decide: async (provider, request, metadata) => {
        assert.equal(provider, 'jev'); assert.equal(metadata.stage, 'profiles'); assert.equal(Object.keys(request.questions).length, 1);
        assert.deepEqual(order, ['reproduced', 'owners', 'repair']); order.push('profiles');
        return {answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, {type: 'choice', choice: 'claude_sonnet55_medium'}]))};
      }}});
    const checkTask = state.options.checkTask;
    const outcome = await executePreservedArtifactRepair({...state.options,
      repairScopePolicy: `public-inferred-owner-${version}`, artifactRepairPolicy: `inferred-${version}`, record,
      checkTask: async (check, context) => {
        const report = await checkTask(check, context);
        if (changedFailure && check.id === 'public-1') report.evidence.cases[0].message = 'a different observed failure';
        return report;
      },
      decideRepairOwners: async (request, metadata) => {
        assert.deepEqual(order, ['reproduced']); assert.equal(metadata.stage, 'repair_owners'); order.push('owners');
        assert.equal(Object.keys(request.questions).length, 1);
        return {answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, {type: 'choice', choice: 'artifact-core'}]))};
      },
      decideRepair: async args => chooseAdaptiveRepair({source: state.publicSource, ...args, repairPolicy: `inferred-${version}`,
        artifactBindings: state.source.planning.artifactBindings, buildRepairState,
        decide: async request => {
          assert.deepEqual(order, ['reproduced', 'owners']); order.push('repair');
          assert.equal(request.state.inferred_contract.path, `docs/orchestration/contracts/adaptive-inferred-repair.${version}.json`);
          return {answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, {type: 'choice', choice: 'repair_repair-inferred-owners'}]))};
        }}),
      prepareRoundPlan: async request => {
        assert.equal(request.round_index, 1); assert.deepEqual(request.selected_task_ids, ['build-core']);
        assert.deepEqual(request.selected_action.artifact_ids, ['artifact-core']);
        return prepareProfiles(request);
      },
      executeRepairTask: async (task, context) => {
        assert.deepEqual(order, ['reproduced', 'owners', 'repair', 'profiles']); order.push('worker');
        assert.deepEqual([...selectedProfiles.keys()], ['build-core']);
        assert.equal(selectedProfiles.get(task.id).profile_id, 'claude_sonnet55_medium');
        assert.equal(context.repair_context.artifact_repair.execution_context.worker_profiles.find(row => row.id === task.worker_id).profile_id,
          'claude_sonnet55_medium');
        assert.equal(context.repair_context.artifact_repair.inferred_contract.path,
          `docs/orchestration/contracts/adaptive-inferred-repair.${version}.json`);
        return state.options.executeRepairTask(task, context);
      }});
    assert.deepEqual(preservedCandidateSnapshot(state.source.candidateDirectory), state.source.snapshot);
    assert.equal(outcome.metrics.bootstrap_copy_tasks, 2); assert.equal(outcome.metrics.bootstrap_copy_worker_provider_calls, 0);
    if (changedFailure) {
      assert.equal(outcome.execution.status, 'failed'); assert.equal(outcome.execution.stop_code, 'PRESERVED_FAILURE_CHANGED');
      assert.equal(outcome.execution.outcome_uncertain, false); assert.deepEqual(order, []);
      assert.equal(outcome.metrics.new_owner_decision_callbacks, 0); assert.equal(outcome.metrics.new_repair_decision_callbacks, 0);
      assert.equal(outcome.metrics.repair_profile_preparation_callbacks, 0); assert.equal(outcome.metrics.repair_worker_callbacks, 0);
    } else {
      assert.equal(outcome.execution.status, 'completed', JSON.stringify({code: outcome.execution.stop_code, cause: outcome.execution.terminal_cause}));
      assert.equal(outcome.execution.rounds[0].owner_inference.contract_source.path,
        `docs/orchestration/contracts/adaptive-inferred-repair.${version}.json`);
      if (version === 'v2') assert.equal(outcome.execution.rounds[0].owner_inference.owner_input_policy, 'inferred-v2');
      assert.deepEqual(order, ['reproduced', 'owners', 'repair', 'profiles', 'worker']);
      assert.equal(outcome.metrics.new_owner_decision_callbacks, 1); assert.equal(outcome.metrics.new_repair_decision_callbacks, 1);
      assert.equal(outcome.metrics.repair_profile_preparation_callbacks, 1); assert.equal(outcome.metrics.repair_worker_callbacks, 1);
      assert.equal(state.checks.filter(row => row.id.startsWith('public-')).length, 4);
      assert.deepEqual(outcome.inherited_export_proofs[0].selected_artifact_ids, ['artifact-core']);
      assert.deepEqual(outcome.inherited_export_proofs[0].inherited_artifacts.map(row => row.artifact_id).sort(), ['artifact-meta', 'artifact-ui']);
      assert.equal(outcome.metrics.initial_failure_basis, 'historical_profile_public_failure');
    }
}

test('preserved inferred repair verifies the failure before owner, repair and selected-profile callbacks', async t => {
  for (const changedFailure of [false, true]) await t.test(changedFailure ? 'changed failure calls no owner or worker' : 'selected repair and profile execute once',
    async t => inferredPreservedCase(t, {changedFailure, version: 'v1'}));
});

test('v9 compact owner repair retains exact recheck and selected-profile dispatch ordering', async t => {
  for (const changedFailure of [false, true]) await t.test(changedFailure ? 'changed failure blocks compact owner dispatch' : 'compact choice reaches one profiled repair worker',
    async t => inferredPreservedCase(t, {changedFailure, version: 'v2'}));
});

test('D075 binds the primary starting condition to its result hash, path, public failure count and initial source kind', () => {
  const rootDir = '/example/root', directory = `${rootDir}/benchmark-runs/initial`, resultSha256 = 'a'.repeat(64);
  const result = {prior_public_failure: {public_evidence: [{check_id: 'public-1', evidence: {cases: [
    {test_id: 'case-core', status: 'failed', error_type: 'AssertionError', message: 'core must be eight'}]}}]}};
  const manifest = {schema_version: 'adaptive-dag-comparison/v10', preserved_source: {mode: 'initial_profile_failure',
    directory: 'benchmark-runs/initial', result_sha256: resultSha256, expected_public_failed_count: 1,
    comparison: 'same_start_as_d073_focused_new_02'}};
  const input = {rootDir, directory, manifest, result, resultSha256};
  assert.equal(verifyPreservedSourceCondition(input).comparison, 'same_start_as_d073_focused_new_02');
  for (const mutate of [value => {value.resultSha256 = 'b'.repeat(64);}, value => {value.directory += '-other';},
    value => {value.manifest.preserved_source.expected_public_failed_count = 2;},
    value => {value.result.kind = 'preserved_artifact_repair';},
    value => {value.manifest.preserved_source.comparison = 'incremental_only';}]) {
    const invalid = structuredClone(input); mutate(invalid);
    assert.throws(() => verifyPreservedSourceCondition(invalid), {code: 'PRESERVED_START_CONDITION_MISMATCH'});
  }
  assert.equal(verifyPreservedSourceCondition({...input, manifest: {schema_version: 'adaptive-dag-comparison/v9'}}), null);
});

test('a terminal preserved source cannot silently reset its historical no-progress repair', t => {
  const state = fixture(t), directory = join(state.root, 'benchmark-runs/terminal'); mkdirSync(directory, {recursive: true});
  const result = {kind: 'preserved_artifact_repair', prior_public_failure: {public_evidence: [{check_id: 'public-1',
    evidence: {cases: [{test_id: 'case-core', status: 'failed', message: 'core must be eight'}]}}]}};
  for (const [file, value] of Object.entries({'result.json': result, 'planning.json': {}, 'public-input.json': {}, 'catalog.json': {}})) {
    writeFileSync(join(directory, file), JSON.stringify(value));
  }
  const manifest = {schema_version: 'adaptive-dag-comparison/v10', preserved_source: {mode: 'terminal_preserved_failure',
    directory: 'benchmark-runs/terminal', result_sha256: hash(readFileSync(join(directory, 'result.json'))),
    expected_public_failed_count: 1, comparison: 'incremental_only'}};
  assert.throws(() => inspectPreservedRepairSource({rootDir: state.root, sourceRunDirectory: directory, manifest}),
    {code: 'PRESERVED_TERMINAL_REPAIR_HISTORY_REQUIRED'});
  assert.deepEqual(state.decisions, []); assert.deepEqual(state.workers, []);
});

test('D075 preserved recovery requires new bound evidence before another owner, profile and repair worker', async t => {
  for (const newEvidence of [false, true]) await t.test(newEvidence ? 'new source bytes release a second repair' : 'empty investigation blocks repeat', async t => {
    const state = fixture(t, {inferred: true}), rootDir = resolve(import.meta.dirname, '..'), selections = new Map();
    const manifest = loadAdaptiveRunManifest(join(rootDir, 'benchmarks/e2e-swe/manifests/d073-inferred-v2.json'), rootDir);
    const calls = {owner: 0, chooser: 0, profile: 0, worker: 0, recovery: 0}, order = [];
    const record = async event => {state.events.push(event); if (event.event === 'preserved_public_failure_reproduced') order.push('reproduced');};
    const prepareProfiles = createAdaptiveProfilePreparer({rootDir, manifest, catalog: state.source.planning.catalog,
      profileSelections: selections, input: {requirement_descriptions: state.source.planning.requirement_descriptions},
      context: {directory: state.options.runDirectory, record,
        save: (path, value) => writeFileSync(join(state.options.runDirectory, path), JSON.stringify(value))},
      session: {receipts: () => [], decide: async (_provider, request) => {
        calls.profile++; order.push('profile');
        return {answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, {type: 'choice', choice: 'claude_sonnet55_medium'}]))};
      }}});
    const outcome = await executePreservedArtifactRepair({...state.options, record, maxRepairRounds: 2,
      failureRecoveryPolicy: 'evidence-loop-v1', repairInputPolicy: 'evidence-v1',
      repairScopePolicy: 'public-inferred-owner-v2', artifactRepairPolicy: 'inferred-v2', prepareRoundPlan: prepareProfiles,
      checkTask: async (check, context) => {
        const report = await state.options.checkTask(check, context);
        // Match the production readiness shape; the older broad fixture placed
        // public-only fields inside local evidence and correctly forces v2's raw fallback.
        return check.phase === 'integration' ? {...report, error: null, evidence: {...report.evidence, error: null}}
          : {...report, evidence: {error: null, container_removed: true}};
      },
      recoverFailure: async (input, metadata) => {
        calls.recovery++; order.push('recovery');
        assert.equal(order[0], 'reproduced'); assert.equal(metadata.round_index, 1);
        assert.equal(input.action, 'inspect_no_write_cause');
        assert.equal(calls.owner, 1); assert.equal(calls.profile, 1); assert.equal(calls.worker, 1);
        const file = input.sourceFiles.find(file => file.path === 'core.json');
        assert.equal(file.sha256, hash(file.text)); assert.equal(file.revision, input.failure.artifact_revisions['artifact-core']);
        return {status: 'ready', evidence: newEvidence ? [{schema_version: 'adaptive-repair-source-evidence/v1',
          kind: 'static_source_observation', artifact_id: file.artifact_id, path: file.path, revision: file.revision, sha256: file.sha256,
          ranges: [{start_line: 1, end_line: 1, text: file.text}], attribution: 'fixture_source_observation_not_fault_proof'}] : []};
      },
      decideRepairOwners: async request => {
        calls.owner++; order.push('owner'); assert.equal(order[0], 'reproduced');
        if (calls.owner === 2) assert.equal(request.state.recovery_source_evidence.length, 1);
        return {answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, {type: 'choice', choice: 'artifact-core'}]))};
      },
      decideRepair: async (args, metadata) => chooseAdaptiveRepair({source: state.publicSource, ...args,
        repairPolicy: 'inferred-v2', artifactBindings: state.source.planning.artifactBindings,
        buildRepairState: request => buildInferredRepairDecisionContext({...request, ownerInputPolicy: 'inferred-v2', repairInputPolicy: 'evidence-v1'}),
        onRequest: metadata.on_request, requestOverride: metadata.request_override, recovery: metadata.recovery,
        decide: async request => {
          calls.chooser++; order.push('chooser');
          if (calls.chooser === 2) assert.equal(request.state.recovery_source_evidence.length, 1);
          return {answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, {type: 'choice', choice: 'repair_repair-inferred-owners'}]))};
        }}),
      executeRepairTask: async (task, context) => {
        calls.worker++; order.push('worker'); assert.deepEqual(task.write_scope, ['core.json']);
        assert.equal(context.repair_context.artifact_repair.repair_input.policy, 'evidence-v1');
        if (calls.worker === 2) {
          assert.equal(context.repair_context.artifact_repair.recovery_source_evidence.length, 1);
          return state.options.executeRepairTask(task, context);
        }
        return {status: 'completed', outcome_uncertain: false};
      }});
    assert.deepEqual(calls, {owner: newEvidence ? 2 : 1, chooser: newEvidence ? 2 : 1,
      profile: newEvidence ? 2 : 1, worker: newEvidence ? 2 : 1, recovery: 1},
    JSON.stringify({cause: outcome.execution.terminal_cause, recovery: outcome.execution.failure_recovery,
      rounds: outcome.execution.rounds.map(round => ({fatal: round.fatal, assessment: round.recovery_assessment, recovery: round.recovery_state}))}));
    assert.deepEqual(order, ['reproduced', 'owner', 'chooser', 'profile', 'worker', 'recovery',
      ...(newEvidence ? ['owner', 'chooser', 'profile', 'worker'] : [])]);
    assert.equal(outcome.execution.status, newEvidence ? 'completed' : 'failed', JSON.stringify(outcome.execution.terminal_cause));
    assert.equal(outcome.metrics.recovery_callbacks, 1); assert.equal(outcome.metrics.initial_failure_reproduced, true);
    assert.equal(outcome.metrics.bootstrap_copy_worker_provider_calls, 0);
    assert.equal(outcome.inherited_export_proofs.length, newEvidence ? 2 : 1);
    assert(outcome.inherited_export_proofs.every(proof => proof.exact_bytes_modes_and_revisions === true));
    assert.deepEqual(preservedCandidateSnapshot(state.source.candidateDirectory), state.source.snapshot);
    assert.equal(state.checks.filter(row => row.id.startsWith('public-')).length, newEvidence ? 6 : 4);
  });
});
