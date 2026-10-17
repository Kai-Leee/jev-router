import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm, symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {collectPublicOwnerEvidence, attachPublicOwnerEvidence, applyPublicOwnerEvidenceScope,
  assertPublicOwnerEvidenceCoverage, selectPublicOwnerEvidenceScope, verifyPublicOwnerEvidence} from '../src/orchestration/adaptive-public-owner-evidence.mjs';

async function fixture(t, {relative = false, success = true} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'public-owner-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(join(root, 'templates'));
  await writeFile(join(root, 'templates/bootstrap.py.jinja'), relative ? 'from .client import Client\n' : 'from {{ lib_name }}.client import Client\n');
  await writeFile(join(root, 'templates/endpoints.py.jinja'), 'from {{ lib_name }}.types import Result\n');
  await writeFile(join(root, 'templates/README.md.jinja'), 'from {{ lib_name }} import Client\n');
  await writeFile(join(root, 'runner.py'), 'print("generate")\n');
  const paths = ['templates/bootstrap.py.jinja','templates/endpoints.py.jinja','templates/README.md.jinja','runner.py'];
  const artifacts = paths.map((path, i) => ({id: `artifact-${i}`, paths: [path]}));
  const plan = {artifacts: artifacts.map(row => ({...row, producer_task_id: `task-${row.id}`})), tasks: artifacts.map(row => ({id: `task-${row.id}`, kind:'implementation',output_artifact_ids:[row.id],write_scope:row.paths}))};
  const planning = {plan, catalog:{artifacts}};
  const failure = {outcome_uncertain:false,artifact_revisions:{},binding_digest:'binding',public_evidence:[{check_id:'public.import',status:'failed',executed:true,outcome_uncertain:false,evidence:{cases:[],error:{code:'ModuleNotFoundError',message:"No module named 'different_output_name'"},candidate_invocations:[{installed_cli:true,exit_code:success ? 0 : 1}]}}]};
  return {planning,failure,candidateDirectory:root};
}

test('public import failure links renamed artifacts/templates, excludes README and seals model context', async t => {
  const input = await fixture(t), evidence = await collectPublicOwnerEvidence(input);
  assert.deepEqual(evidence.required_artifact_ids,['artifact-0','artifact-1']);
  assert.equal(evidence.links.length,2);
  assert.ok(evidence.links.every(row => row.certainty === 'repair_candidate_not_fault_proof'));
  const request = {model:'jev-latest',state:{failure:'existing'},questions:{owner:{type:'choice'}}};
  const attached = attachPublicOwnerEvidence(request,evidence);
  assert.deepEqual(attached.questions,request.questions);
  assert.equal(request.state.public_source_owner_evidence,undefined);
  assert.equal(attached.state.public_source_owner_evidence.evidence_sha256,evidence.sha256);
  assert.throws(() => verifyPublicOwnerEvidence({...evidence,required_artifact_ids:[]}), /BINDING/);
  assert.throws(() => verifyPublicOwnerEvidence(evidence,{failure:{...input.failure,artifact_revisions:{new:'value'}}}),/DRIFT/);
});

test('no dynamic template attribution without generation; relative import not implicated', async t => {
  const noSuccess = await fixture(t,{success:false});
  assert.deepEqual((await collectPublicOwnerEvidence(noSuccess)).required_artifact_ids,[]);
  const relative = await fixture(t,{relative:true});
  assert.deepEqual((await collectPublicOwnerEvidence(relative)).required_artifact_ids,['artifact-1']);
});

test('public closure retains model union, carries owner mapping, refuses silent omission', async t => {
  const input = await fixture(t), evidence = await collectPublicOwnerEvidence(input);
  const original = {candidates:[{id:'repair-inferred-owners',artifact_ids:['artifact-3'],task_ids:['task-artifact-3'],read_artifact_ids:[],owner_inference_id:'inference'}],
    analysis:{inferred_ownership:{sha256:'old',proof:{answers:{owner:{choice:'artifact-3'}}},choice_bindings:{}},causal:{sha256:'old-causal',chains:[],choice_bindings:{}}}};
  const expanded = applyPublicOwnerEvidenceScope(original,{plan:input.planning.plan,evidence,failure:input.failure});
  const selected = selectPublicOwnerEvidenceScope(expanded);
  assert.deepEqual(selected.candidate.artifact_ids,['artifact-0','artifact-1','artifact-3']);
  assert.deepEqual(selected.candidate.task_ids,['task-artifact-0','task-artifact-1','task-artifact-3']);
  assert.deepEqual(expanded.analysis.inferred_ownership.proof,original.analysis.inferred_ownership.proof);
  assert.equal(original.candidates.length,1);
  assert.throws(() => assertPublicOwnerEvidenceCoverage(original.candidates[0],evidence),/OMITTED/);
  assert.equal(selectPublicOwnerEvidenceScope({candidates:[]}),null);
});

test('reject uncertain public evidence, outside/symlink source, and trace binds only exact owned path', async t => {
  const input = await fixture(t);
  input.failure.public_evidence[0].outcome_uncertain=true;
  await assert.rejects(collectPublicOwnerEvidence(input),/UNCERTAIN/);
  input.failure.public_evidence[0].outcome_uncertain=false;
  input.failure.public_evidence[0].evidence.error={code:'SyntaxError',message:'bad syntax',traceback:'File "/stage/runner.py", line 1'};
  const evidence = await collectPublicOwnerEvidence(input);
  assert.deepEqual(evidence.required_artifact_ids,['artifact-3']);
  await rm(join(input.candidateDirectory,'runner.py'));
  await symlink('/etc/passwd',join(input.candidateDirectory,'runner.py'));
  await assert.rejects(collectPublicOwnerEvidence(input),/SYMLINK/);
});
