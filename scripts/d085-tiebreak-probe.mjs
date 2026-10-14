#!/usr/bin/env node
// D085 small paid check of owner_tiebreak flat-reask-v1: rebuild the tie-break request for each recorded flat owner
// decision from that run's own planning, owner answers and failed-revision candidate, then send it to Jev through the
// adaptive provider session (ledger reservation, token admission, receipts). Sequential; an uncertain outcome stops
// everything and is never resent. Without --spend it only builds and saves the requests.
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {loadAdaptiveRunManifest, createAdaptiveProviderSession, adaptiveSpeedSessionOptions} from '../src/benchmark/adaptive-dag-runner.mjs';
import {flatAssignments, buildOwnerTiebreakRequest, resolveOwnerTiebreak, loadOwnerTiebreakContract, OWNER_TIEBREAK_POLICIES} from '../src/orchestration/adaptive-owner-tiebreak.mjs';
import {adaptiveOutcomeUncertain} from '../src/orchestration/adaptive-failure.mjs';

const rootDir = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2), flag = name => args.includes(name), value = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const spend = flag('--spend'), out = value('--out'), reps = Number(value('--reps') ?? 1), policy = value('--policy') ?? 'flat-reask-v1';
const CASES = [{run: 'd080-defaults-01', round: 0}, {run: 'd082-cloud-06', round: 1}];
if (!out || existsSync(resolve(out)) || !Number.isSafeInteger(reps) || reps < 1 || reps > 5 || !OWNER_TIEBREAK_POLICIES.includes(policy)) {
  console.error('usage: d085-tiebreak-probe.mjs --out <new dir> [--reps 1..5] [--spend]'); process.exit(2);
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const dir = resolve(out); mkdirSync(join(dir, 'requests'), {recursive: true, mode: 0o700});
const save = (name, data) => writeFileSync(join(dir, name), JSON.stringify(data, null, 2) + '\n', {flag: 'wx', mode: 0o600});

const built = CASES.map(({run, round}) => {
  const base = join(rootDir, 'benchmark-runs', run, 'jev_profile'), planning = read(join(base, 'planning.json'));
  const inference = read(join(base, 'adaptive-execution', 'result.json')).rounds[round].owner_inference;
  const flat = flatAssignments({assignments: inference.assignments, answers: inference.response.answers, contract: loadOwnerTiebreakContract(policy).contract});
  const candidate = join(base, 'adaptive-execution', `round-${round}`, 'runtime', 'candidate');
  const sources = [...new Set(flat.flatMap(row => row.tied))].flatMap(id => planning.artifactBindings[id].paths.map(path => {
    const bytes = readFileSync(join(candidate, path));
    return {artifact_id: id, path, sha256: sha(bytes), content: bytes.toString('utf8')};
  }));
  const request = buildOwnerTiebreakRequest({flat, planning, artifactBindings: planning.artifactBindings, sources, policy});
  const key = `${run}-r${round}`;
  save(`requests/${key}.json`, request);
  return {key, run, round, flat, request, request_sha256: sha(JSON.stringify(request)), request_bytes: Buffer.byteLength(JSON.stringify(request))};
});
console.log(JSON.stringify(built.map(({key, flat, request_bytes}) => ({key, flat: flat.map(row => [row.question_id, row.tied, row.first_probabilities]), request_bytes}))));
if (!spend) process.exit(0);

const manifest = loadAdaptiveRunManifest(join(rootDir, 'benchmarks/e2e-swe/manifests/d085-direct-repair.json'), rootDir);
const events = [], results = [];
const record = async event => { events.push({at: new Date().toISOString(), ...event}); };
let stop = null;
for (let rep = 1; rep <= reps && !stop; rep++) {
  for (const item of built) {
    const runDirectory = join(dir, `rep-${rep}`, item.key);
    mkdirSync(join(runDirectory, 'calls'), {recursive: true, mode: 0o700}); mkdirSync(join(runDirectory, 'receipts'), {recursive: true, mode: 0o700});
    const session = createAdaptiveProviderSession({rootDir, run_id: `d085-tiebreak-${rep}-${item.key}`, runDirectory, manifest,
      remaining: () => 600000, record, ...adaptiveSpeedSessionOptions(manifest)});
    const row = {rep, key: item.key, request_sha256: item.request_sha256};
    try {
      const response = await session.decide('jev', structuredClone(item.request), {stage: 'repair_owners', round_index: item.round,
        decision_id: `owner-tiebreak-${item.request_sha256.slice(0, 24)}`});
      row.resolutions = resolveOwnerTiebreak({flat: item.flat, request: item.request, response, policy});
      row.answers = response.answers;
    } catch (error) {
      row.error = {code: error?.code ?? 'UNKNOWN', outcome_uncertain: adaptiveOutcomeUncertain(error, {fallback: true})};
      if (row.error.outcome_uncertain) stop = row.error;
    }
    row.receipts = session.receipts().map(receipt => ({id: receipt.id, status: receipt.status, usage: receipt.usage ?? null}));
    results.push(row);
    console.log(JSON.stringify({rep, key: item.key, error: row.error ?? null,
      resolutions: row.resolutions?.map(r => [r.status, r.second_choice, r.second_probabilities && Object.fromEntries(r.tied.map(id => [id, r.second_probabilities[id]]))])}));
    if (stop) break;
  }
}
save('results.json', {schema_version: 'd085-tiebreak-probe/v1', manifest_sha256: manifest.manifest_sha256, reps, stop, results});
save('events.json', events);
