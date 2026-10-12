# D054 continuation review

Date: 2026-10-10. Owner: independent reviewer. Scope: new `scripts/decomposition-e2e-resume.mjs`, frozen v3 resume path, lossless input projection integration. No paid calls by reviewer. Prior D052/D053 sources and outcomes remain preserved.

## Source findings

The continuation reads the selected D053 plan and run evidence, copies confirmed worker files into a fresh output directory, verifies each file against its recorded SHA-256, rejects path traversal, symbolic links and multi-link/nonregular files, then supplies `resume` to v3. V3 reuses the confirmed result and runs verification again rather than invoking the core worker. New workers retain exact owned-file permissions.

The script reads parent run `result.json`, `decomposition.json`, `events.jsonl`, receipt files and candidate files. It does not read independent grade reports or grade logs. Worker initial evidence is drawn from `evidence_updated` run events rather than external grade artifacts. This source separation protects against feeding the known 0/63 grade into resumed generation, provided the parent event stream remains the frozen pre-grade stream.

Continuation is correctly labeled `independent_sample:false` and carries the original start timestamp. Report D053 plus D054 costs and stage times together; separately identify controller downtime. Do not report D054 incremental wall time as the original workload completion time. D052 baseline remains a diagnostic comparator under changed scaffold.

## Required parent binding sent to root

Before provider dispatch, bind parent brief hash, worker profile and transport hash to current inputs. Require parent worker receipt invocation/provider/category to agree with the worker-result event and require successful task acceptance/verification before reuse. Hash parent decomposition/events and receipts in continuation provenance, as well as the result and copied files. The initial script only hashed the result and file bodies, which was insufficient to detect changes in the selected plan or evidence stream between runs.

## Independent tests

`node --test test/d054-review.test.mjs` passed **5/5**. These synthetic tests verify:

- Confirmed core is reverified and never reexecuted; only the dependent worker executes.
- Uncertain parent output is rejected before execution.
- A changed selected plan is rejected against the resume plan.
- Failed core revalidation prevents dependent dispatch.
- A prior attempt lacking a confirmed result cannot silently become a new call.

These checks validate v3 resume semantics. They do not validate real authentication, transport, public behavior, or correctness of the six copied source files. New lossless projection roundtrip/size controls remain builder-owned and must complete before continuation inference. No hidden grader feedback is allowed in prompts.

## Final source review and projection tests

Root added exact comparison of parent/public brief, frozen plan hash, worker model/effort, artifact transport hash and concurrency. Reused results now require accepted and successful-verification events plus receipt invocation/provider/category agreement. Continuation provenance includes parent decomposition and event-stream hashes. Parent receipt hash itself is not yet included; content correlation and completion checks are present. Parent events are pre-grade by construction; no grader input is read.

`node --test test/d054-review.test.mjs test/decision-projection-v2.test.mjs` passed **16/16** (8 independent controls, 8 projection controls). New controls reject dangling object references and non-string fragment values, and preserve repeated evidence occurrences, literal reference-like user fields, Korean text, null, zero and false. This confirms exact local decoding; whether the model interprets nested references equally well remains unmeasured. The change removes repeated transport representations, not the repeated facts or their event occurrences.

No additional inference by reviewer. D054 remains a continuation, not a new independent benchmark sample; combine failed/preparation/parent work costs in final whole-task reporting.
