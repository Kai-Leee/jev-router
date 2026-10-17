import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {workerProfilePolicy, workerProfileCandidates, eligibleWorkerProfiles, buildWorkerProfileRequest,
  createWorkerProfileRouter} from '../src/benchmark/worker-profiles-v4.mjs';
import {createPointsmanGateway, validatePointsmanManifest} from '../src/orchestration/pointsman-gateway.mjs';
import {codexPricingContract} from '../src/benchmark/codex-pricing.mjs';
import {claudePricingContract} from '../src/benchmark/claude-pricing.mjs';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url)));
const paths = {history: 'benchmark-runs/d092-effort-history-20261017-01/snapshot.final.v2.json',
  discovery: 'benchmark-runs/d092-effort-history-20261017-01/app-discovery.json',
  planning: 'benchmark-runs/d091-codex-20261016-01/cohort/pair-fixed/codex/planning.json'};
const available = Object.values(paths).every(path => existsSync(new URL(`../${path}`, import.meta.url)));
const localOnly = {skip: available ? false : 'Requires original local D091/D092 records; actual manifests and source pins are never replaced by fixtures.'};
const snapshotSHA = 'c0f1b7324056b9cd7ba48a59530dfaf8d8f1470e4382b7064a31ce6c32ae9e89';

function fixture(workerFamily) {
  const empiricalEvidence = read(paths.history), planning = read(paths.planning), policy = workerProfilePolicy();
  const task = planning.plan.tasks.find(row => row.kind === 'implementation');
  const context = {operation: 'implementation', round_index: 0, input_artifact_revisions: {}};
  const pricingContract = workerFamily === 'claude' ? claudePricingContract() : codexPricingContract({version: 'v2'});
  const environmentEvidence = workerFamily === 'codex' ? read(paths.discovery) : {
    fingerprint: 'OFFLINE-D093-GATEWAY-CLAUDE-FIXTURE-NOT-ACCOUNT-AVAILABILITY',
    models: policy.families.claude.models.map(model => ({model, supported_reasoning_efforts: [...policy.families.claude.adapter_efforts]})),
    allowed_profiles: workerProfileCandidates({workerFamily, pricingContract})};
  const catalog = eligibleWorkerProfiles({workerFamily, environmentEvidence, pricingContract});
  const args = {workerFamily, environmentEvidence, pricingContract, planning, empiricalEvidence, expectedEmpiricalSha256: snapshotSHA};
  const {request} = buildWorkerProfileRequest({...args, task, context, catalog});
  const manifestPath = 'benchmarks/e2e-swe/manifests/pointsman-claude-d094-provisional.json', manifest = read(manifestPath);
  validatePointsmanManifest(manifest, {rootDir}); // Actual v10/v11 contract and source pins; do not repin around drift.
  const writes = [], events = [], saved = new Map();
  const save = (path, value) => {const copy = structuredClone(value); writes.push({path, value: copy}); saved.set(path, copy);};
  const record = async event => events.push(structuredClone(event));
  const createGateway = (options = {}) => createPointsmanGateway({rootDir, binding: manifest.skill_gateway,
    save, record, workerEnvironmentEvidence: environmentEvidence, ...options});
  return {...args, task, context, catalog, request, manifest, writes, events, saved, save, record, createGateway};
}

for (const family of ['claude']) {
  test(`D094 provisional ${family} actual manifest gateway validates all three phases and retains selected low tuple`, localOnly, async () => {
    const f = fixture(family), externalEnvironment = structuredClone(f.environmentEvidence);
    const gateway = f.createGateway({workerEnvironmentEvidence: externalEnvironment});
    // The gateway captured its own immutable copy, not a later caller mutation.
    externalEnvironment.fingerprint = 'MUTATED-AFTER-CAPTURE'; externalEnvironment.allowed_profiles = [];
    const low = f.catalog.profiles.find(row => row.effort === 'low');
    let localDispatches = 0;
    const router = createWorkerProfileRouter({...f, decide: async (request, metadata) => {
      const ticket = await gateway.begin(request, {stage: 'profiles', decisionId: metadata.decision_id});
      ticket.assertBefore('before_reservation'); ticket.assertBefore('before_post');
      localDispatches++; // A local response fixture only; no provider/CLI is called.
      return ticket.accept({model: 'OFFLINE-D093-RESPONSE-FIXTURE', answers: {worker_profile: {type: 'choice', choice: low.id}},
        usage: {input_tokens: 1, output_tokens: 1}});
    }});
    const selection = await router.select(f.task, f.context);
    assert.equal(localDispatches, 1);
    const phaseReports = f.writes.filter(row => row.value.phase);
    assert.deepEqual(phaseReports.map(row => row.value.phase), ['initial', 'before_reservation', 'before_post']);
    assert(phaseReports.every(row => row.value.passed === true && row.value.wording.fixed_wording === true));
    assert.equal(selection.model, low.model); assert.equal(selection.effort, 'low');
    assert.equal(selection.empirical_snapshot_sha256, snapshotSHA);
    assert.equal(router.assertExecution(selection, {model: low.model, effort: 'low', task: f.task, context: f.context}).verified, true);
    assert(f.events.some(row => row.event === 'pointsman_gateway_accepted'));
  });

  test(`D094 provisional ${family} actual gateway rejects absent trusted environment before dispatch`, localOnly, async () => {
    const f = fixture(family), gateway = f.createGateway({workerEnvironmentEvidence: undefined});
    let localDispatches = 0;
    await assert.rejects(async () => {await gateway.begin(f.request, {stage: 'profiles', decisionId: 'missing-env'}); localDispatches++;},
      {code: 'WORKER_PROFILE_V4_TRUSTED_ENVIRONMENT_REQUIRED'});
    assert.equal(localDispatches, 0);
    assert.equal(f.writes.at(-1).value.passed, false);
    assert.equal(f.writes.at(-1).value.phase, 'initial');
  });

  test(`D094 provisional ${family} actual gateway rejects opposite-family request before dispatch`, localOnly, async () => {
    const f = fixture(family), other = fixture(family === 'codex' ? 'claude' : 'codex'), gateway = f.createGateway();
    let localDispatches = 0;
    await assert.rejects(async () => {await gateway.begin(other.request, {stage: 'profiles', decisionId: 'wrong-family'}); localDispatches++;},
      {code: 'WORKER_PROFILE_V4_FAMILY_INVALID'});
    assert.equal(localDispatches, 0);
  });

  test(`D094 provisional ${family} actual gateway rejects coordinated candidate and availability omission before dispatch`, localOnly, async () => {
    const f = fixture(family), alteredEnvironment = structuredClone(f.environmentEvidence), gateway = f.createGateway();
    alteredEnvironment.allowed_profiles = f.catalog.profiles.slice(1).map(({model, effort}) => ({model, effort}));
    const alteredCatalog = eligibleWorkerProfiles({workerFamily: family, environmentEvidence: alteredEnvironment, pricingContract: f.pricingContract});
    const {request} = buildWorkerProfileRequest({...f, catalog: alteredCatalog});
    let localDispatches = 0;
    await assert.rejects(async () => {await gateway.begin(request, {stage: 'profiles', decisionId: 'omitted-candidate'}); localDispatches++;},
      {code: 'WORKER_PROFILE_V4_ENVIRONMENT_BINDING'});
    assert.equal(localDispatches, 0);
    assert.equal(f.writes.at(-1).value.phase, 'initial');
    assert.equal(f.writes.at(-1).value.passed, false);
  });
}

test('D094 recovered request passes actual gateway initial/reserve/post guards',localOnly,async()=>{
 const f=fixture('claude'),gateway=f.createGateway();let calls=0;const router=createWorkerProfileRouter({...f,decide:async(request,meta)=>{const ticket=await gateway.begin(request,{stage:'profiles',decisionId:meta.decision_id});ticket.assertBefore('before_reservation');ticket.assertBefore('before_post');calls++;return ticket.accept({model:'OFFLINE',answers:{worker_profile:{type:'choice',choice:calls===1?'unknown':f.catalog.profiles[1].id}},usage:{input_tokens:1,output_tokens:1}});}});const selected=await router.select(f.task,f.context);assert.equal(calls,2);assert.equal(selected.clarifications_used,1);const guards=f.writes.filter(x=>x.value.phase);assert.equal(guards.length,6);assert(guards.every(x=>x.value.passed));
});
