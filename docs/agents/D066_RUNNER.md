# D066 comparison runner and provider glue

2026-10-11 Asia/Seoul. Owner: `d064_scheduler`. Status: additive implementation integrated and frozen for root's full regression/source freeze; final focused5/5 passed and independent runner review reported no blocker. [Role contract](D066_PARALLEL.md), [fixed protocol](../orchestration/D066_EXPERIMENT.md). Root alone launches paid catalog preparation and the four live conditions after protocol/source freeze. This role made no paid calls and preserved D065 sources, candidate, reports and v3 public checker bytes.

## Intended interface and shared preparation

The module `src/benchmark/adaptive-dag-runner.mjs` exposes `createAdaptiveProviderSession` and `createAdaptiveDecisionProvider`. Both engines receive the same `prepareDecision`-validated `{model,state,questions}` body; stages are `split`, `relations`, `repair`. The arm changes only the selected provider. Claude receives the exact serialized body, an answer-only schema, tools disabled, empty MCP configuration, empty temporary cwd, disabled ambient settings and a fresh session. Jev retains the measured client, model/credit checks, durable dispatch/response events, original cumulative 10M input-token ledger and no uncertain replay. Choice, score and noul outputs normalize to typed answers; provider probability fields remain in raw Jev receipts and never change routing.

`prepareAdaptiveSharedCatalog` calls planner `prepareAdaptiveCatalog` once, then validates and stores the returned catalog without correcting invalid output. `runAdaptiveArm` calls `planAdaptiveDag`, awaits an exclusive durable plan commit, then calls `runAdaptiveDagExecution`. `chooseAdaptiveRepair` receives the execution owner's explicit candidates, original public failure packet and remaining two-round allowance. Runner callbacks supply fresh Opus5.5 medium worker invocations, exact MCP read/write scopes, Docker checks, immutable-image identity checks, receipts and source snapshots. Existing `processResult`, `providerOutcome`, `claudeEnvironment`, measured Jev/budget utilities, D065 `runDagDockerCheck`/`validateDagPublicReport` and preflight are reused. No D065 monolithic workflow or historical file architecture is imported.

Preparation uses the full original public specification plus whitelisted `{id,text,source_refs}` for its 80 public requirements. Historical `write_scope`, interfaces, dependency maps and product/hidden failures are excluded. One retained catalog response is validated, hash-pinned and shared byte-for-byte across arms. Each headline arm includes the **full** shared preparation wall and usage; cohort actual-once and quarter-amortized wall are separately labeled. Raw CLI usage, cache creation/read including any TTL subfields, reported API equivalent and unknown actual bill are retained. Invalid or uncertain catalog output is terminal, with no silent retry or architecture rewrite.

## Four fresh sequential conditions

| Arm | Recursive partition | Relationships | Repair decisions |
| --- | --- | --- | --- |
| `claude_all` | Claude | Claude | Claude |
| `jev_split` | Jev | Claude | Claude |
| `jev_split_relations` | Jev | Jev | Claude |
| `jev_all` | Jev | Jev | Jev |

All arms receive the same public source/catalog/question grammar, worker prompt/profile, two execution slots, maximum 30 workers, public v3 checker/image and bounded repair opportunity. Each leaf job launches a fresh CLI session; logical worker count is not session reuse. Conditions run sequentially with separate fresh evidence/candidate directories. Original run order, provider/cache variability, failures and every repair/planning call remain visible. Success completion time stays null until root's independent final grade establishes product success.

## Fixed limits and actual boundaries

The new manifest is `benchmarks/e2e-swe/manifests/d066-adaptive.json`. It fixes units30/artifacts60/files60/leaves30/depth3/nodes59/relation-pairs435, at most128 decision callbacks across planning and repairs, relation batch32, request240000bytes, Jev700000 input tokens per arm, and two repair rounds. The existing 65536-token reservation must fit the arm cap before each request. Before each arm, remaining Jev arms times700000 plus one65536-token safety reservation must fit the existing ledger. Preparation checks all three Jev arms' capacity. The last local test read retained 7,633,742 used / 2,366,258 remaining / pending0; tests did not mutate the ledger.

Each arm and shared preparation have separate 14400-second overall deadlines, a cancellation signal and remaining-time process/fetch bounds. No 10-minute worker cap is introduced. Every run uses an exclusive fresh directory and a UUID-suffixed run ID, so later cohorts cannot reuse global request identities. Sources, catalog bytes and shared preparation identity are pinned before dispatch and checked at later boundaries. Failed/unknown provider output is never replayed. Known failed worker completion returns a failed envelope that can receive a bounded repair; an uncertain worker closes the provider session.

`buildAdaptiveChecks` binds each fresh artifact to a syntax/existence check and rewrites all seven public registry commands to the trusted `/checker/.../run_public_checks.py --suite ... --binding /run/binding.json` candidate command. Registry normal-control bindings cannot be executed as a candidate. Public v3 checker and whole-candidate revisions stay pinned; the exact immutable image has network disabled, read-only root/candidate/checker mounts and executable `/tmp:rw,exec,size=2g`. Boundary environment checks inspect the exact image ID and cite the dependency inventory as `preflight_probe_of_identical_immutable_image`; they do not claim a fresh inventory per file.

`validateAdaptivePublicReport` preserves all D065 complete-report guards and adds narrow known setup/prefix failure handling: candidate binding, exact suite/version/environment/full requested IDs, failed/exit1/known uncertainty, structured error, an ordered unique executed prefix, exact unexecuted suffix and exact assertion sum. Setup failure retains `executed:false`, zero cases and null setup evidence. Failed cases may have zero assertions; passed cases require positive assertions. No skipped case becomes a pass. Invalid/uncertain evidence stops the condition. The execution controller collects all seven known reports before selecting a repair.

Provider receipts separate recorded attempts from `inference_started` dispatch intents and `invocation_started_calls`; an intent alone is not proof the provider billed a request. Planning stats retain provider calls/questions and local singleton transitions. Repair helper stats, actual implementation/repair/carry counts, per-round journals and input/output revisions are separate. Completion time and product success remain null until root's independent grade; no hidden grader content enters this runner.

## Commands and focused verification

Default read-only readiness: `node scripts/adaptive-dag-comparison.mjs`; `--probe` additionally performs no-inference OAuth/model/image/public-control checks. Root's live commands after source freeze:

```sh
node scripts/adaptive-dag-comparison.mjs benchmark-runs/d066-catalog-01 --prepare-catalog --spend
node scripts/adaptive-dag-comparison.mjs benchmark-runs/d066-comparison-01 --catalog-preparation benchmark-runs/d066-catalog-01 --spend
```

The comparison launches all four fresh arms sequentially. An uncertain arm conservatively stops automatic cohort continuation; its stopped result remains intact. If root later establishes healthy budget/environment, a separate fresh `--arm <name>` invocation is available and must be reported as a separately authorized continuation, not as a completed original cohort.

`node --test test/adaptive-dag-runner.test.mjs` final run passed5/5 in12.052s after UUID identity, deadline, accounting and planner compatibility corrections. It verifies identical Claude/Jev request information and strict answer schemas, no tool/repository access, measured reservation/receipt retention, uncertainty/no second dispatch, candidate setup/prefix/forged-pass boundaries, and sequential cohort stop. Its integrated witness performs a fresh authored catalog response, real recursive planner, actual filesystem revisions/publication, seven known reports after a failure and a selected repair followed by seven rechecks. Claude and Docker process transport are injected fixtures; local readiness uses Python on authored files. No providers, actual containers or product candidate were executed, and no product/efficiency result is claimed. The initial integration failure (`DAG_INVALID_STRING` from a multiline check argv) was corrected by the safely quoted single-line Python wrapper; the passing run used that correction.

Independent reviewer separately ran the same-body/report boundaries as part of its focused7/7 and reviewed the UUID, deadline, receipt/accounting and conservative cohort-stop behavior. Its source-bound review and evidence are in [D066_REVIEW](D066_REVIEW.md). Local read-only `preflightAdaptiveComparison()` returned `inspected_no_inference`, blockers[], paid_calls0 and required future-cohort capacity2,165,536, without a new model/auth/container probe. Root owns the actual live readiness and full regression; this role does not claim those from this fixture test.

Frozen owned production/test SHA256:

| Path | SHA256 |
| --- | --- |
| `src/benchmark/adaptive-dag-runner.mjs` | `4927d88e24b25e9d2e09ff7168a0933876b9b9708607881474e001065beedf32` |
| `scripts/adaptive-dag-comparison.mjs` | `a87f846cc1cba3b33a3fe5f0f3d2e97e10308bd1c7f87eae9f0f8241628bc639` |
| `benchmarks/e2e-swe/manifests/d066-adaptive.json` | `93d0d1484e96c12d56e193551964692f88eed2171dce76f466908ece7b51579b` |
| `test/adaptive-dag-runner.test.mjs` | `5338e01373eda75cd1557530bbe12729eda2ea25b81445db42ffa00608bd453f` |

No further edits during root's full regression or paid cohort. Any newly observed defect must first preserve the frozen evidence and be reported to root; it cannot silently change a live condition.
