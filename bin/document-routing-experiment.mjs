#!/usr/bin/env node
// Deliberately offline: scripted answers and in-process workers, no provider adapters.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { buildDecisionRequest, dispatchDecision, documentHash, runTaskTree, validateDocumentBundle, expandDocumentedTask } from '../src/orchestration/document-router.mjs';

const output = process.argv[2];
if (!output || process.argv.length !== 3) throw new Error('Usage: node bin/document-routing-experiment.mjs <NEW output directory>');
const bundle = JSON.parse(await readFile(new URL('../examples/orchestration/document-bundle.json', import.meta.url)));
const scripted = JSON.parse(await readFile(new URL('../examples/orchestration/synthetic-answers.json', import.meta.url)));
validateDocumentBundle(bundle);
// Never overwrite an earlier experimental receipt.
await mkdir(resolve(output), { recursive: false });
const journal = [], runs = [], handlerCalls = [];
const choice = value => ({ type: 'choice', choice: value });
let seq = 0;
async function invoke(kind, taskId, response, handlers, extra = {}) {
  const request = buildDecisionRequest(bundle, { kind, taskId, ...extra });
  const id = `synthetic-${++seq}`;
  const row = { id, evidence_mode: 'synthetic', request, response, policy: { splitThreshold: extra.splitThreshold ?? null } };
  journal.push(row);
  row.outcome = await dispatchDecision({ request, response, currentEvidenceVersion: bundle.version, currentEvidenceHash: documentHash(bundle), splitThreshold: extra.splitThreshold, handlers });
  return row.outcome;
}
const simulatedWorker = async context => {
  handlerCalls.push({ action: 'spawn_worker', taskId: context.taskId, profile: context.profile, evidenceVersion: context.evidenceVersion });
  // Delay permits observing scheduler overlap; its duration is not a model latency estimate.
  await new Promise(resolve => setTimeout(resolve, 5));
  return { ok: true, artifact: { taskId: context.taskId, model: context.profile.model, effort: context.profile.effort, content: 'Synthetic worker receipt only; no application code generated.' }, realVerification: false };
};
for (const threshold of scripted.thresholds) {
  const active = [], splitTrace = [];
  async function visit(taskId) {
    const task = structuredClone(bundle.tasks.find(t => t.id === taskId));
    active.push(task);
    const children = bundle.tasks.filter(t => t.parentId === taskId);
    if (!children.length) return;
    const response = { answers: { beneficial: { type: 'noul', noul: scripted.splitProbability[taskId] }, evidence: choice('sufficient') } };
    const result = await invoke('split', taskId, response, {
      expand_task: () => ({ children: expandDocumentedTask(bundle, taskId).map(t => t.id) }),
      execute_leaf: () => ({ leaf: taskId }),
      collect_evidence: () => ({ blocked: 'split evidence incomplete' }),
    }, { splitThreshold: threshold });
    splitTrace.push({ taskId, p: scripted.splitProbability[taskId], threshold, action: result.action });
    if (result.action === 'collect_evidence') throw new Error('Fixture lacks sufficient split documentation; no valid threshold comparison');
    if (result.action === 'expand_task') for (const childId of result.result.children) await visit(childId);
  }
  await visit('root');
  const start = performance.now();
  const execution = await runTaskTree({ tasks: active, requirements: bundle.requirements, maxConcurrency: 2, executeLeaf: async task => {
    const profile = scripted.workerProfile[task.id] ?? scripted.workerProfile.default;
    const routed = await invoke('worker', task.id, { answers: { selection: choice(profile) } }, { spawn_worker: simulatedWorker });
    return routed.result;
  } });
  const depths = new Map();
  function depth(t) { if (!depths.has(t.id)) depths.set(t.id, t.parentId === null ? 0 : depth(active.find(p => p.id === t.parentId)) + 1); return depths.get(t.id); }
  runs.push({ threshold, splitTrace, nodeCount: active.length, leafCount: active.filter(t => !active.some(c => c.parentId === t.id)).length,
    maxDepth: Math.max(...active.map(depth)), peakSimulatedWorkers: Math.max(0,...execution.events.filter(e => e.type === 'started').map(e => e.active)),
    syntheticHarnessMs: performance.now() - start, execution, activeTaskIds: active.map(t => t.id) });
}
const routeChecks = [];
for (const status of ['supported','contradicted','insufficient_evidence','needs_execution','blocked']) {
  const handlers = Object.fromEntries(['record_requirement_evidence','dispatch_repair','collect_evidence','run_verification','record_blocker'].map(action => [action, context => ({ action, taskId:context.taskId, requirementId:context.requirementId, simulated:true })]));
  const outcome = await invoke('requirement','root',{ answers:{ status:choice(status) } },handlers,{ requirementId:'R3' });
  routeChecks.push({ kind:'requirement', status, action:outcome.action });
}
for (const value of ['implementation','test_contract','environment','unknown']) {
  const handlers = Object.fromEntries(['dispatch_repair','review_test_contract','inspect_environment','collect_evidence'].map(action => [action, context => ({ action,taskId:context.taskId,simulated:true })]));
  const outcome = await invoke('failure','root',{ answers:{ selection:choice(value) } },handlers);
  routeChecks.push({ kind:'failure', value, action:outcome.action });
}
const selected = await invoke('task','root',{answers:{selection:choice('ui')}},{dispatch_task: c => ({selected:c.selectedTask.id,simulated:true})},{readyTaskIds:['backend','ui']});
routeChecks.push({kind:'task', suppliedReadyTaskIds:['backend','ui'], readinessSource:'synthetic caller declaration only; scheduler readiness not integrated into this selection example', action:selected.action, selected:selected.selection});
const report = {
  evidence_mode:'synthetic', bundleHash:documentHash(bundle), productionThreshold:null, realModelCalls:0,
  actualProviderBillingUsd:null, note:'No provider transport exists in this CLI. Timings are synthetic harness timings, not Jev/Claude speed or savings.',
  command:'node bin/document-routing-experiment.mjs <NEW output directory>', runs, routeChecks, handlerCalls,
  limitations:['Scripted probabilities are not calibration data.','No live model/effort profiles or native child agents launched.','Question text is compiled from supplied documents and fixed templates, not generated by a live planning model.','Integration tasks return simulated receipts only.','No E2E quality or production improvement measured.','No automatic recursive re-planning when a new failure creates new task nodes.'],
};
await writeFile(resolve(output,'requests-responses.jsonl'),journal.map(x=>JSON.stringify(x)).join('\n')+'\n',{flag:'wx'});
await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output:resolve(output),evidence_mode:report.evidence_mode,realModelCalls:0,runs:runs.map(({threshold,nodeCount,leafCount,maxDepth,peakSimulatedWorkers})=>({threshold,nodeCount,leafCount,maxDepth,peakSimulatedWorkers})),routeChecks:routeChecks.length},null,2));
