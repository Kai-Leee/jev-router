# D065 semantic handlers

2026-10-10. Owner: `d064_adapter`. Implements the new opt-in [D065 role contract](D065_PARALLEL.md). Historical v1 contract/adapter and prior experiment artifacts remain unchanged. The decision-records skill is applied to distinguish source preparation, typed selection, validated plan mutation, runtime execution and product success.

Owned new files:

- [dag-semantic-handlers.mjs](../../src/orchestration/dag-semantic-handlers.mjs)
- [dag-routing.v2.json](../orchestration/contracts/dag-routing.v2.json)
- [dag-semantic-handlers.test.mjs](../../test/dag-semantic-handlers.test.mjs)
- [runnable semantic example](../../examples/dag/d065-semantic-example.mjs)
- This document.

## Integration API

```js
import {
  createDagSemanticState,
  applyDagSemanticDecision,
  createDagSemanticController,
  loadDagSemanticContract,
} from './src/orchestration/dag-semantic-handlers.mjs';

const controller = createDagSemanticController({
  state: createDagSemanticState({plan: basePlan}),
  commit: async (nextState, {previous_revision, graph_revision}) => {
    // Trusted controller persists using compare-and-swap before returning.
    // The callback must reject a stale previous_revision.
    await persistState(nextState, {previous_revision, graph_revision});
  },
  record,
});

const result = await controller.apply({
  decision: {kind: 'split', type: 'choice', choice: 'candidate_allocated'},
  payload: {
    expected_graph_revision: basePlan.graph_revision,
    scope: 'root',
    target_task_ids: ['root-implementation'],
    candidates: [{id: 'allocated', plan: fullPartition, evidence_refs: ['public:boundaries']}],
    available_workers: selectedWorkers,
    preparation: {
      method: 'actual_owner_choices_to_atomic_partition',
      source_refs: ['manifest/source', 'allocation/receipts'],
      wall_ms: measuredPreparationTime,
      usage: null,
      cost: null,
    },
  },
});
if (result.status !== 'applied') return result;
const executablePlan = result.state.plan;
```

`controller.snapshot()` returns an independent clone. `applyDagSemanticDecision({state,decision,payload})` is the pure transformation; it does not persist. `controller.apply` serializes updates and awaits the injected commit before returning the action. Without a commit callback, the same API is explicitly in-memory (`durable_commit_callback:false`). The controller does not claim that an arbitrary callback supplies durable/CAS guarantees.

The controller's `decide({kind,payload,decide})` builds the new fixed `dag.<kind>.v2` question and validates the real wire shape with the existing `prepareDecision`. The wire callback sees `{model,state:{plan,task_status,payload,contract_source},questions}`. It receives only offered choices and cannot name a function/command to execute. Failed, uncertain, extra or malformed typed answers stop without retries. Supplied decisions use `selection_method:'supplied_typed_choice'`; actual callback selections use `typed_choice`; sole admissible choices use `local_singleton`. No selection source is fabricated as a Jev success.

Concurrent apply/decide operations reject while one is in progress. Every payload must match `expected_graph_revision`. Each successful transformation, including a blocking action, creates `<base_graph_revision>.semantic-N`. A failed commit leaves in-memory state unchanged and emits no committed action. An unclassified commit failure is uncertain and prevents further controller writes; there is no automatic replay.

## Executed semantic operations

**Split:** The payload supplies complete candidate plans with existing atomic requirements, artifacts, checks and file boundaries. The handler validates candidates before offering them, then actually replaces the target scope and rebinds artifact producers. Original requirement IDs, artifact IDs, exact check definitions, read/write scope union and external inputs are conserved. External tasks/consumers are unchanged, so their artifact IDs continue to point to the new producers. Every result is validated by `validateDagPlan` and `analyzeDag`.

Root selection requires all current implementation tasks in scope and 2..30 distinct resulting implementation worker IDs. That bound does not limit the number of tasks. A recursive leaf `keep_scope` is a separate explicitly allowed choice; it cannot restore a root one-worker choice. Readiness checks must be declared per atomic boundary before splitting and distributed unchanged. The handler cannot invent a child checker or silently weaken an existing one. New tasks may own a checked artifact without owning a separate requirement, but empty work is rejected.

If an unresolved relationship involves a split target, splitting blocks until that relationship is resolved. This initial implementation does not guess how an unknown parent relationship maps to children. Candidate generation is a separate trusted preparation step; `preparation` requires method/source/time plus explicit usage/cost fields. The example groups a supplied fixture deterministically; the D065 live runner instead supplies partitions constructed from actual owner choices and public file atoms. These mechanisms are not claims that Jev generated free-form architecture or source code.

**Relation:** Payload fields are:

```js
{
  expected_graph_revision,
  task_a_id, task_b_id,
  artifact_ids_by_direction: {
    a_requires_b: ['artifact-produced-by-B'],
    b_requires_a: ['artifact-produced-by-A'],
  },
  artifact_bindings: {artifactId: {paths: ['declared/producer/output.py']}},
  evidence: [{id, source_ref, text, task_ids: [taskA, taskB], artifact_ids: [artifactId]}],
}
```

Only directions with named producer artifacts, matching materialized evidence and explicit runtime artifact bindings are offered. Every bound path must lie within its producer's declared write scope. A selected direction appends those artifacts to the consumer's `input_artifact_ids` and only those exact bound paths to `read_scope`, resolves exactly that unknown pair and reruns graph validation. Missing bindings reject before commit. This closes the independent review's reproduced graph-only relation that otherwise failed runtime input-scope enforcement. Reversed cycles reject. `no_artifact_dependency` requires pair evidence and cannot erase an existing explicit artifact dependency. `unknown` and `both_require_each_other` create/preserve an actual blocking unknown relationship without constructing a cyclic executable graph. Resource scope locks remain separate.

**Profile:** The trusted payload supplies `task_id`, `profiles:[{id,model,effort,available,tool_compatible,evidence_refs}]` and optionally `new_worker_id`. Selecting an available compatible profile mutates the task's worker/profile binding. A worker shared by other tasks cannot have its profile changed implicitly; an explicitly supplied new worker can be used within the plan's worker limit. Missing support blocks the task. A profile selection cannot clear an unrelated semantic blocker.

**Failure:** A known failed task, public evidence refs, explicit authorized action, known request outcome and fresh attempt ID are required for repair. `repair_local` queues a fresh scoped repair and changes the task to pending. `repair_verifier` installs a versioned checker from the trusted `allowed_verifier_replacements` catalog, preserving check ID, phase and requirement/artifact coverage, then authorizes a new check attempt. `repair_contract` uses the same conserved partition validation as split. `revise_dependency` blocks the task and queues a separate typed relation decision at the new revision; that relation must complete before dispatch. `need_evidence`, including every uncertain outcome, blocks and never queues a paid replay. The module returns concrete controller actions; it does not itself launch models, processes or arbitrary text commands.

## Protected state and limits

`createDagSemanticState` accepts trusted runtime `task_status`, `completed_artifact_revisions` and `completed_check_evidence` snapshots. Completed tasks must include all output revisions and assigned check evidence. Later transformations preserve completed, running and uncertain task definitions/statuses, worker profiles, outputs/producers and check definitions. Completed revision/evidence objects remain unchanged. These snapshots are not independent proof that the supplied runtime actually executed checks; the filesystem/runtime gate remains responsible for that evidence.

The semantic controller is not the scheduler or the filesystem publisher. Only an applied committed plan/action may be handed to those components. The caller must keep attempt/runtime state synchronized and observe blocked/uncertain outcomes. No product completion or live model quality is inferred from a valid transformation.

## Verification and next owner

Commands executed locally, without paid/network calls:

```sh
node --test test/dag-semantic-handlers.test.mjs
node examples/dag/d065-semantic-example.mjs
```

Latest focused result after the relation/runtime scope correction: 8/8 passed, 0 failed/skipped, 279.529042 ms test-process duration. The compact suite covers actual split/relation mutations, conservation faults, root/leaf distinction, cycle/evidence/binding rejection, completed/running/uncertain protection, profile/repair/verifier actions, unresolved blocker ownership, queued dependency resolution, commit ordering/CAS/busy/uncertain commit, and failed wire responses without retry. The example produced `status:applied`, two implementation workers, three tasks including integration verification, new graph revision and `model_calls:0`.

The independent reviewer reran the reproduced relation issue through the actual filesystem runtime. Missing bindings rejected with `DAG_RELATION_ARTIFACT_BINDING_MISSING` before commit; exact bindings added the core file to the consumer read scope, the consumer read the expected value 7, the workflow completed, and the final journal was recorded. This is local callback/runtime evidence, without an external provider call. The reviewer owns the full finding record in [D065_REVIEW.md](D065_REVIEW.md).

The five owned files are complete and frozen. Root/runner received the API and example before integration and the final relation-binding update. Root owns final regression, the overall snapshot freeze and the single authorized live run. This role has not launched Jev/Claude, changed the cumulative ledger, modified product source, committed or pushed.
