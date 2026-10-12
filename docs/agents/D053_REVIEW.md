# D053 review: anchored sequential decomposition

Date: 2026-10-10. Owner: independent reviewer. Status: actual D052 failure analyzed; D053 implementation pending. Frozen D052 artifacts are not modified.

## Measured D052 failure

`benchmark-runs/d052-decompose-02/events.jsonl`, rows `decomposition_validated`, records five selected tasks and two invalid allocation rounds. Node JSON aggregation of each row's `issues` gives:

| Issue category | Revision 0 | Revision 1 |
|---|---:|---:|
| Empty requirement task | 1 | 0 |
| Empty file task | 1 | 1 |
| Requirement owner lacks any relevant file | 1 | 2 |
| Declared required artifact not available to owner | 23 | 11 |
| Missing artifact dependency | 7 | 4 |
| Total | 33 | 18 |

Revision 0 leaves task_2 empty. Revision 1 leaves task_1 without files and assigns R20 packaging responsibility to task_5 while setup.sh/pyproject.toml belong to task_2. No worker should execute either plan. The validation correctly prevented execution; these results do not establish that every declared dependency was necessary.

## Correction to prior review recommendation

D052's generic `task_1` labels permit independent answer choices to disagree on what each task means. Exact ownership and acyclicity checks detect this only after several calls. Anchoring each task to a chosen artifact and including established assignments in later question state reduces that ambiguity without defining groups beforehand.

The prior recommendation to require all `required_artifacts` before the accountable requirement owner can overconstrain cross-cutting requirements. An implementation owner can contribute before another contributor; final acceptance is a whole-candidate check. Distinguish contribution relevance from actual execution dependency. The dependency graph should follow declared artifact consumption/interface requirements; requirement-to-file links define contribution/coverage and are not automatically ordering edges. Removing such ordering checks must be documented as a revised meaning, not silently presented as identical validation.

## D053 gates and negative controls

- Distinct Jev-selected anchors guarantee nonempty file groups; no prewritten role groups are allowed.
- Every subsequent ownership question sees immutable earlier assignments and descriptive artifact roles.
- Candidate owner filtering must reject assignments that create cycles in the quotient artifact graph. Do not silently merge or drop a choice after inference.
- If an anchor grouping makes remaining allocation impossible, fail with concrete conflict evidence. A bounded new plan is a separate recorded decision attempt; never replay an uncertain POST.
- Requirement coverage may involve multiple contributor tasks but must preserve exact source and acceptance checks. A single accountable integration owner must not create artificial circular dependencies.
- Instruction assembly must explicitly tell workers to implement relevant portions of cross-cutting requirements and read prerequisite contracts; no worker may write outside owned files.
- Tests should use the actual failed allocation as a negative control, verify a valid layered cross-cutting partition is accepted, and reject ownership collapse, unknown anchor, unsafe path, cycle-producing assignment and unresolved allocation.
- Count all anchor and sequential allocation calls, their latency, corrections and failed D052 attempt cost. More reliable planning may cost more decision time; this remains unmeasured.

No paid calls or source changes by this reviewer. Test file authorized: `test/d053-review.test.mjs`. Implementation review and observed test results will be appended.

## Independent implementation result

`node --test test/d053-review.test.mjs` passed **6/6**. Controls verify: artifact-DAG contraction can create a task cycle and is rejected; exhausted feasibility search reports unknown; all files collapsed into one owner cannot satisfy a two-task request; unknown partial path/task is rejected; layered shared requirement gives both tasks contribution instructions without adding an artificial reverse dependency; uncertain provider outcome is never replayed.

V2 uses feasibility witnesses only to filter candidate answers; witnesses do not overwrite selected decisions. Anchors are selected from artifacts, one distinct anchor per task. Remaining artifact allocation is sequential with current anchors and ownership visible. Dependencies derive from declared artifact consumption rather than independent Jev pairwise votes. Requirement accountability then chooses among actual contributors. These are deliberate reductions in Jev's unconstrained decision space and changes to D052 semantics, not evidence that unconstrained answers became consistent.

Remaining preflight recommendation sent to builder: reject unknown requirement artifact references and malformed dependency-path arrays before the first call; filter infeasible requested counts or stop before further paid questions. The current actual manifest's valid references should still be checked. Direct source review and synthetic tests do not establish actual model efficiency or final product quality.

Final independent rerun after builder preflight changes: `node --test test/task-decomposition-v2.test.mjs test/d053-review.test.mjs` passed **17/17**; `git diff --check` passed. Preflight now rejects invalid references before any decision and filters feasible counts using the same bounded feasibility search. Previous remaining preflight recommendation is resolved at unit-test/source level. No further reviewer-owned edits are planned after this entry.
