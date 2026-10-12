# D065 test trim — focused verification passed; ready for root freeze

2026-10-10. Owner: `d065_test_trim`. Scope follows [D065 ownership](D065_PARALLEL.md). This change consolidates repeated tests in the historical D056 review and codec suites. No production code, package command or test-discovery change was made by this role. Root owns the final full suite and any live execution.

## Inventory and decision

- Used `fd` for the 74 existing test paths, `rg` for test/loop names, and `sg` AST calls for 848 static test definitions. Parameterized runtime test counts are different; D064's recorded full-suite count was 993. No new full-suite baseline was run while other roles changed the shared checkout.
- Read the recursive planner, codec, DAG contract/adapter/gate/workflow tests and related implementations to compare observable behavior. The D056 review repeated focused codec/validator cases and a separate full-fixture codec pipeline. These are the defensible consolidation targets.
- Retained sequential v2/v3 suites: their similar test bodies exercise separate implementations. Retained API diagnostics, budget/uncertain-result cases, public assertions, capacity witnesses, and all D064 incident files. No arbitrary target count or broad invalid-scalar matrix was used to justify deletion.
- Before mutation, copied every edited test into [before/test](../../benchmark-runs/d065-test-trim/before/test/), then measured original hashes/bytes/lines. These are audit snapshots, not a destination for a still-required test suite. The active files remain discovered by `node --test test/*.test.mjs`.

## Measured change

| File | Runtime test definitions | Lines | UTF-8 bytes |
| --- | ---: | ---: | ---: |
| `test/d056-review.test.mjs` | 23 → 14 | 501 → 379 | 29,988 → 22,772 |
| `test/planning-state-codec.test.mjs` | 17 → 14 | 215 → 141 | 12,141 → 8,215 |
| `test/recursive-task-tests.test.mjs` | 27 → 27 | 360 → 384 | 21,095 → 22,515 |
| **Total affected scope** | **67 → 55** | **1,076 → 904** | **63,224 → 53,502** |

Removed 12 duplicate test definitions; net reduction 172 lines and 9,722 bytes. Distinct assertions were transferred into existing tests. The full real-fixture planning/codec roundtrip now runs once in the review integration; byte-ratio/cap, unchanged questions, all-stage reconstruction and literal-source assertions remain.

Exact [removal map](../../benchmark-runs/d065-test-trim/removal-map.json), [metrics and SHA-256s](../../benchmark-runs/d065-test-trim/metrics.json), [static inventory](../../benchmark-runs/d065-test-trim/test-inventory.json) and [preserved incident body hashes](../../benchmark-runs/d065-test-trim/preserved-incident-witnesses.json) are stored with the snapshots. Runtime counts here cover only the edited files; new D065 tests belong to other owners.

## Removal map

1. **codec wire roundtrip distinguishes omitted, null, false, zero and literal marker or prototype-named fields** ([test/d056-review.test.mjs](../../test/d056-review.test.mjs), original lines 212–236). The codec suite already exercises each literal, absence, prototype-shaped table field and marker roundtrip. Retain that focused suite rather than repeat its fixture in a review file.
   Surviving witness: [test/planning-state-codec.test.mjs:22](../../test/planning-state-codec.test.mjs#L22) — “wire roundtrip preserves primitive values, empty containers and negative zero”; [test/planning-state-codec.test.mjs:66](../../test/planning-state-codec.test.mjs#L66) — “reserved markers remain literal input objects instead of being interpreted as codec operations”; [test/planning-state-codec.test.mjs:72](../../test/planning-state-codec.test.mjs#L72) — “prototype-shaped field names survive plain objects and table layouts without pollution”; [test/planning-state-codec.test.mjs:80](../../test/planning-state-codec.test.mjs#L80) — “nested arrays with different record shapes and absent values remain distinct”.

2. **codec rejects wire corruption of references, record width, constants, absence or its interpretation rules** ([test/d056-review.test.mjs](../../test/d056-review.test.mjs), original lines 238–258). Consolidate codec mutations in the dedicated codec suite. The two distinct table-cell/constant identity mutations are transferred there.
   Surviving witness: [test/planning-state-codec.test.mjs:105](../../test/planning-state-codec.test.mjs#L105) — “envelope schema, instructions and exact state hash are mandatory”; [test/planning-state-codec.test.mjs:115](../../test/planning-state-codec.test.mjs#L115) — “invalid dictionary references and ambiguous markers cannot silently decode”; [test/planning-state-codec.test.mjs:126](../../test/planning-state-codec.test.mjs#L126) — “invalid table columns, rows, constants and record-cell declarations fail closed”.

3. **validator rejects omitted obligations, duplicate parent execution, and weakened test oracles** ([test/d056-review.test.mjs](../../test/d056-review.test.mjs), original lines 260–268). Consolidate validator cases into dedicated tests. Preserve missing task ID, same-type altered string oracle, and explicit partial nonempty child omission in addition to original singleton/nested corruption witnesses. Independent review corrected the initial transfer; see corrections.
   Surviving witness: [test/recursive-task-tests.test.mjs:290](../../test/recursive-task-tests.test.mjs#L290) — “lost obligations, empty/no-progress splits, duplicate parent execution and source changes are rejected”; [test/recursive-task-tests.test.mjs:312](../../test/recursive-task-tests.test.mjs#L312) — “deleted, reowned or weakened test expectations cannot validate”.

4. **a ready leaf cannot be forged by replacing its typed review with an empty object** ([test/d056-review.test.mjs](../../test/d056-review.test.mjs), original lines 270–274). Both corruptions are already present verbatim in the dedicated provenance regression, which also covers missing provenance and a missing request hash.
   Surviving witness: [test/recursive-task-tests.test.mjs:281](../../test/recursive-task-tests.test.mjs#L281) — “ready status cannot be retained after dropping or altering choice provenance”.

5. **a whole-product test keeps every participant and its exact oracle after a split** ([test/d056-review.test.mjs](../../test/d056-review.test.mjs), original lines 276–283). The dedicated cross-child unit/integration/e2e test already checks original oracles. Transfer the exact e2e participant set and integration-node assertions there.
   Surviving witness: [test/recursive-task-tests.test.mjs:85](../../test/recursive-task-tests.test.mjs#L85) — “unit tests crossing child ownership become integration and existing integration/e2e scopes remain”.

6. **shared-file locks serialize writers and cannot be removed from a valid plan** ([test/d056-review.test.mjs](../../test/d056-review.test.mjs), original lines 285–300). The dedicated writer test checks a three-writer dependency-ordered serialization, and the separate corrupt-plan test rejects removal. Both are stronger witnesses than the duplicate two-writer fixture.
   Surviving witness: [test/recursive-task-tests.test.mjs:155](../../test/recursive-task-tests.test.mjs#L155) — “same-file writers have deterministic exclusive serialization consistent with dependencies”; [test/recursive-task-tests.test.mjs:325](../../test/recursive-task-tests.test.mjs#L325) — “missing write serialization and fabricated execution dependency cycle are rejected”.

7. **unknown dependency declarations stay disclosed in each leaf and request** ([test/d056-review.test.mjs](../../test/d056-review.test.mjs), original lines 302–309). Consolidate exact per-leaf unknown-dependency coverage into the dedicated test. The retained full-stage wire test already checks every request policy and original unknown dependency vector.
   Surviving witness: [test/recursive-task-tests.test.mjs:145](../../test/recursive-task-tests.test.mjs#L145) — “unasserted dependencies are disclosed without inventing edges or execution eligibility”; [test/d056-review.test.mjs:166](../../test/d056-review.test.mjs#L166) — “columnar wire state preserves every literal fact and unknown dependency across all planning stages”.

8. **dependency cycles are rejected before the decider sees any input** ([test/d056-review.test.mjs](../../test/d056-review.test.mjs), original lines 311–318). The dedicated test has the same two-node cycle plus unknown-ID rejection and uses an assert.fail decider to enforce no callback.
   Surviving witness: [test/recursive-task-tests.test.mjs:123](../../test/recursive-task-tests.test.mjs#L123) — “declared cycles and unknown dependency IDs fail before decisions”.

9. **depth and leaf caps stop a selected split without making the original leaf ready** ([test/d056-review.test.mjs](../../test/d056-review.test.mjs), original lines 333–343). Both cap boundaries have dedicated tests. Transfer decision count, unchanged root, no committed split and no ready leaf assertions into those witnesses.
   Surviving witness: [test/recursive-task-tests.test.mjs:68](../../test/recursive-task-tests.test.mjs#L68) — “count options remain one through five independently of global leaf cap”; [test/recursive-task-tests.test.mjs:172](../../test/recursive-task-tests.test.mjs#L172) — “depth limit preserves the unsplit reviewed parent as partial”.

10. **every real fixture stage roundtrips after JSON wire serialization** ([test/planning-state-codec.test.mjs](../../test/planning-state-codec.test.mjs), original lines 171–176). Remove the second full-fixture planning run. The retained review integration already serializes, decodes and compares every request across all three stages.
   Surviving witness: [test/d056-review.test.mjs:166](../../test/d056-review.test.mjs#L166) — “columnar wire state preserves every literal fact and unknown dependency across all planning stages”.

11. **every source, context, authored test value and interface remains a readable literal string** ([test/planning-state-codec.test.mjs](../../test/planning-state-codec.test.mjs), original lines 185–200). The retained integration checks all literal strings recursively on each real fixture request, a superset of this field-specific loop.
   Surviving witness: [test/d056-review.test.mjs:166](../../test/d056-review.test.mjs#L166) — “columnar wire state preserves every literal fact and unknown dependency across all planning stages”.

12. **full real fixture requests have measured byte reduction with unchanged questions and no token claim** ([test/planning-state-codec.test.mjs](../../test/planning-state-codec.test.mjs), original lines 202–215). Consolidate byte comparison, unchanged questions and the 96000-byte bound into the retained all-stage integration. Preserve the original 0.8 byte-ratio assertion without a second planning fixture.
   Surviving witness: [test/d056-review.test.mjs:166](../../test/d056-review.test.mjs#L166) — “columnar wire state preserves every literal fact and unknown dependency across all planning stages”.

## Independent review correction

The first consolidation passed 55/55 but the independent reviewer identified an evidence gap: a type-invalid expected value did not demonstrate rejection of a well-typed but changed string oracle. They also asked for an explicit partially omitted nonempty child witness. The existing expectation-corruption test now uses an original string oracle and rejects a different string; the lost-obligation test retains its original nested/singleton cases and also removes one obligation from a child that originally contains more than one. The missing task-ID transfer and original bad-type cases remain.

The initial [metrics](../../benchmark-runs/d065-test-trim/metrics-initial-trim.json), [map](../../benchmark-runs/d065-test-trim/removal-map-initial-trim.json) and [first after TAP](../../benchmark-runs/d065-test-trim/focused-after.tap) remain intact. The updated map describes the correction. The final reviewer confirmation is tracked in [D065 review](D065_REVIEW.md).

## Preserved incident witnesses

The following existing test bodies are byte-identical to the initial AST inventory; no test in these files was edited by this role:

- [test/dag-workflow.test.mjs:45](../../test/dag-workflow.test.mjs#L45) — “consumer never executes an input that changes between dispatch precheck and gate snapshot”.
- [test/dag-workflow.test.mjs:57](../../test/dag-workflow.test.mjs#L57) — “run event identity invalidity is rejected before any implementation callback”.
- [test/dag-workflow.test.mjs:28](../../test/dag-workflow.test.mjs#L28) — “artifact changed after publication blocks consumer even though predecessor completed”.
- [test/dag-decision-adapter.test.mjs:211](../../test/dag-decision-adapter.test.mjs#L211) — “packing counterexample capacities [3,3] and indivisible [2,2,2] blocks before a model call”.
- [test/dag-decision-adapter.test.mjs:221](../../test/dag-decision-adapter.test.mjs#L221) — “residual packing removes a locally fitting but globally impossible owner; singleton never calls”.
- [test/dag-decision-adapter.test.mjs:234](../../test/dag-decision-adapter.test.mjs#L234) — “minimum final loads and eligibility are part of the exact witness”.
- [test/dag-decision-adapter.test.mjs:271](../../test/dag-decision-adapter.test.mjs#L271) — “search exhaustion remains unknown, is never offered, and never produces a packing witness”.
- [test/dag-decision-adapter.test.mjs:171](../../test/dag-decision-adapter.test.mjs#L171) — “provider exceptions preserve uncertain status and partial reservations without replay”.
- [test/client.test.mjs:117](../../test/client.test.mjs#L117) — “network failure has uncertain outcome and never retries or exposes transport details”.
- [test/client-diagnostics.test.mjs:390](../../test/client-diagnostics.test.mjs#L390) — “v3 removes current-key JSON, URL, Unicode, Base64 and combined encodings before persistence”.
- [test/client-diagnostics.test.mjs:441](../../test/client-diagnostics.test.mjs#L441) — “v3 redacts before its 2048-character boundary and never leaves a truncated credential prefix”.

The complete artifact-verification, worker-verification, scheduler, transport, budget and client diagnostic suites remain active, including dynamic stale-evidence/uncertainty cases beyond the named sample above.

## Focused verification

Command before and after:

`node --test --test-reporter=tap test/d056-review.test.mjs test/planning-state-codec.test.mjs test/recursive-task-tests.test.mjs`

- [Before](../../benchmark-runs/d065-test-trim/focused-before.tap): 67 tests; pass 67, fail/cancelled/skipped/todo 0; exit 0; 5606.708208 ms.
- [Initial after](../../benchmark-runs/d065-test-trim/focused-after.tap): 55 tests; pass 55, fail/cancelled/skipped/todo 0; exit 0; 7197.890958 ms.
- [After review correction](../../benchmark-runs/d065-test-trim/focused-after-review.tap): 55 tests; pass 55, fail/cancelled/skipped/todo 0; exit 0; 7393.651125 ms.

A trailing blank line was removed after the focused pass; `git diff --no-index --check` then passed on all three edited files without changing executable content.

These were separate local runs during parallel work, not a controlled performance comparison. Fewer tests/lines do not establish faster execution or product efficiency. The preserved codec byte assertion is local fixture evidence, not a provider-token or semantic-understanding result. All provider callbacks in this scope are local doubles; no paid call was made.

## Remaining integration work

The root agent will run the full suite after source freeze and include the independent deletion review. This role does not certify the new D065 runtime/handlers, public 85-check completion, actual candidate result, or live-run readiness. Existing files outside the three affected tests were not edited. No commit or push was made.
