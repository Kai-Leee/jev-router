# Pointsman Technical Specification Draft

> English translation of [TECHNICAL_SPEC.md](TECHNICAL_SPEC.md). The Korean original is authoritative if they differ.

Version: 0.1-draft · Updated: 2026-10-09 (Asia/Seoul).
Status: design document that reflects user agreement. The connection module and the offline evaluation calculation/CLI are implemented.
Question generation and actual model comparison runs are not verified. The D-014 candidate selection→isolated execution gate/runner,
the preparation of two benchmarks and their no-charge verification are recorded in [current implementation](../benchmarks/README.md).
Requirement evidence is in the [decision record](https://github.com/Kai-Leee/jev-router/blob/research/docs/DECISIONS.md). Execution evidence is in the [verification record](https://github.com/Kai-Leee/jev-router/blob/research/VERIFICATION.md).

D-017 implementation: [usage dashboard](DASHBOARD.en.md) and [display contract](DASHBOARD_CONTRACT.md).
It shows the Jev transmission boundary, Claude stream and final tokens, per-unit cost, and observation completeness.
Screen verification used synthetic/no-model control records. Actual model comparison experiments have not been run.

D-019: [development connection and independent Opus monitor](PAIRED_RUN.md) is implemented. The supplemented termination
records of the D-018 tool/gate/runner, the heartbeat and the SSE snapshot were verified locally. OTel and an independent supervisor are not implemented.
The user removed the cap on the number of calls, so an explicit null is treated as unlimited. Actual calls have not started yet,
because the automatic approval review separately required approval for Jev monetary spending. A screen connection is not evidence that the run is healthy.

## 1. Purpose and current execution scope

Pointsman supports model selection and intermediate judgments for work done by the main agent [D-001, D-002].
The main session keeps the goal and performs the next action. The question-builder role converts the goal, state and evidence
into a request Jev can judge, and records the result. The return value is not an execution permission or evidence that tests passed.

Currently, work is handled in one session [D-003]. We do not create a new session for each judgment. We do not implement
a mechanism that waits a fixed time and then reads a result file. When the API/CLI exits, we check the response and whether it failed.
Even in the same session, communication failure and undecidable are kept separate.

```text
Judgment point in the main work
→ Check the goal, evidence and required output
→ Build candidates (if needed)
→ Build the English question and validate the API input
→ Call Jev
→ Validate the response; record judgment status and usage
→ Follow-up action by the main session
→ [proposal pending verification] Handoff and a new session when needed
```

Load balancing is an extension target of the original idea. Actual multi-executor scheduling and load policy are not designed yet.
They are not made a required precondition for the current question generation and judgment verification.

## 2. Responsibility boundaries

- User/main session: manages the task goal, the constraints to keep, the available evidence and tools, and follow-up actions.
- Question-builder role: identifies the judgment kind, builds candidates, writes the English question, criteria and undecidable conditions, and finds gaps.
- Deterministic code: checks format, limits and allowed candidates, sends requests, validates results, and records them.
- Jev: returns a typed decision for the given state and question.
- Evaluation procedure: separately evaluates the usefulness of judgments with answers, rubrics and execution results obtained later.

Whether the question-builder role is a skill in the current session, runs on a specific model, or is a separate process
will be decided later, without changing the current session policy. Question generation is also counted in the model judgment cost.

## 3. Answer shape, selection criteria and evaluation method

These are separate contracts [D-005]. We do not force a single correct answer onto every task just to make the answer clear.

| Judgment kind | Required output | Selection/decision criteria | Evaluation evidence and limits |
|---|---|---|---|
| Model selection | Candidate ID or abstention | Required capabilities, tools, constraints and fixed priorities | Execution results on the same task; performance of unobserved candidates is unconfirmed |
| Classification | Single/multiple labels or unclassified | Label definitions and whether overlap is allowed | Classification metrics if labels exist; a single choice does not replace multiple labels |
| Evidence assessment | Supported/refuted/insufficient evidence | The specified claim and evidence scope | Comparison with the source text; support within the evidence is separate from truth in the outside world |
| Ranking | Full/partial ranking, ties, not comparable | Common comparison axes and known preferences | Pairwise preference, task utility, ranking metrics; does not assume a unique correct answer |
| Completeness/next step | Satisfaction status, candidate actions, abstention | Requirements, verification results, prerequisites | Actual checks and later results; a model's score does not replace running tests |
| Prediction | Event probability or undecidable | Event definition, period, available observations | Calibration evaluation against later observed results; predictions without source data are hard to verify |

When a simple calculation or an explicit rule determines the answer, code can be used. The default is a mode that automatically
routes which judgments go to Jev [D-010]. Specific judgment points and frequency are tuned by evaluation.
We do not finalize a policy that adds a model call to every action.

### Initial experiment policy for automatic calls / proposal

- When model selection is needed, or when an explicit selection, classification, evidence assessment, ranking, completeness/next step
  or prediction result is needed during work, route to the question generation flow. How actual triggers are detected will be verified in a prototype.
- Record the input version so the same judgment is not requested again for the same task state, question format and candidate set.
  This is a local deduplication proposal. It does not guarantee provider API idempotency support or exactly-once execution on failure.
- Set a scope that prevents recursion, where a judgment made during question generation triggers the same automatic call again.
- If the question or evidence is not ready, record that it is not ready. Do not keep re-asking automatically to hide the gap.
- Record the result and usage per call. Also keep the reason for skipped calls in the evaluation data.
- D-019 confirmed no limit on the number of calls. Specific call frequency is tuned by evaluation.
  Operational deadlines and stopping on uncertainty remain. For the current actual run, the automatic review separately required monetary approval.

## 4. Question generation input contract / proposal P-001

The items below are an internal work specification. They are not added as-is to the Jev HTTP top-level fields.

- `decision_id`, `input_revision`: identify the judgment and the input version.
- `purpose`: why this judgment is needed and where the result is used.
- `decision_kind`: model selection, classification, evidence assessment, ranking, completeness, next step, prediction.
- `state`: relevant facts and the current task state. Keep guesses and preferences separate from confirmed facts.
- `evidence_refs`: source file/document location, needed excerpts, version/hash where possible.
- `constraints`: executable scope, required conditions, budgets already set. Do not invent values for undecided items.
- `candidates`: when candidates are provided, their ID, description, source and capability evidence.
- `answer_contract`: the required output shape, such as single/multiple selection, score or partial ranking.
- `selection_policy`: known comparison criteria and priorities. Undecided weights are `null`.
- `abstain_conditions`: conditions such as missing information, no suitable candidate, conflicting criteria or not comparable.
- `template_ref`: the ID and version of a reused question, or a marker that it is a new design.

The API payload is converted to `model`, `state` and `questions`, which the current client supports.
If only the source path is sent to Jev, do not assume Jev read that file. Include the actual content
of the evidence needed for the judgment in state. Keep local references alongside it for tracking.

Questions, criteria and option descriptions are in English by default [D-006]. We propose keeping proper nouns, source quotes, code and numbers
in their original form and adding an English explanation. Keep the source text separate from translations/summaries.

When generating a question, narrow it to one judgment purpose. If the purpose or constraints are missing, return the gap
instead of hiding it behind a polished question. Mark these as evaluation targets: candidate descriptions that already lead to the answer,
performance numbers without evidence, and questions that estimate capability from the candidate name alone.

Reusing a question format differs from reusing a judgment result. Even with the same format, reflect the current state and
evidence anew. A result cache is not within the confirmed scope of this draft.

## 5. Candidate building by situation / design delegated D-004, proposal P-002

1. **Candidates are provided:** Keep their meaning and source. Check for duplicates, constraint violations and missing information.
2. **Model/tool selection with no candidates:** Take candidates from the registered list of actually available items.
   The registered list holds the model/tool ID, execution method, supported capabilities, availability and measured evidence.
   Keep introductory descriptions separate from actual measured values. Do not invent scores for unmeasured capabilities.
3. **A new approach must be found:** The question-builder role drafts candidates based on the goal and evidence.
   If it cannot build enough candidates, it returns that data collection or user confirmation is needed.
4. **Only some candidates exist:** Keep the provided candidates, and propose additional candidates marked as distinct.

Record `origin` for each candidate as `provided`, `catalog` or `proposed`. Candidate generation time and tokens
are also counted in cost. No arbitrary cap on the number of candidates is set yet. If an API limit is hit, rebuild.

Record the reason when a candidate is excluded by an explicit required condition. If no candidates remain, record `no_eligible_candidate`.
If only one candidate remains and only a formal branch is needed, record it as a candidate for code handling. Checking whether
a single candidate is suitable is a separate judgment. Do not loosen goals or constraints arbitrarily because there are no options.

If the provided candidate set and the final evaluated candidate set differ, record that separately. It must be possible to evaluate
the effect of good candidate generation separately from the effect of good selection by Jev.

## 6. Conversion to Jev questions / proposal

The raw question types the service provides are `choice`, `score` and `noul`. They are not the same concept as
the internal judgment kinds. Combine them by purpose. [Jev AI docs](https://jev-ai.pro/docs)

- Single selection: pass candidate IDs and English descriptions as a choice. An undecidable option suited to the purpose may be included.
- Multiple labels: compare an approach that builds a separate judgment per label and checks overlap/mutual-exclusion rules in code.
- Evidence assessment: distinguish supported/refuted/insufficient for the same claim. Do not treat insufficient evidence as refuted.
- Score: define the meaning of each level. Do not treat score and confidence as the same value.
- Ranking: per-candidate evaluation with the same rubric and direct comparison between candidates are experiment candidates [H-002].
  Do not use the probability order of a choice directly as a verified quality ranking. Represent ties, partial rankings and
  cycles in pairwise comparison. Also record the cost of the additional comparison calls.
- noul/prediction: even when a probability is output, a separate question or input check policy is needed to distinguish insufficient evidence.
  Do not fix `0.5` or low confidence as a universal undecidable value.

When sending several questions together, do not assume a later question reads the answer to an earlier one.
A dependency where the remaining candidates must be selected after candidate validity is assessed is made explicit as a code step.
A common probability threshold, common weights and the number of automatic re-asks are undecided.

## 7. Result and record contract / proposal P-003

Execution is currently synchronous, and no background job queue is needed [D-003]. The result also separates the following axes.

- `execution_status`: `not_called`, `completed`, `failed`, `unknown`.
- `decision_status`: `decided`, `abstained`, `not_evaluated`.
- `reason_code`: reasons such as missing information, no candidate, conflicting criteria, not comparable or response error; `null` if not applicable.
- `answer`: a value matching answer_contract, such as a label/score/ranking/probability. `null` when there is no answer.
- `provider_answer`: a field that keeps the provider's judgment value before normalization. Authentication headers are not stored.
- `requested_model`, `resolved_model`, `template_ref`, `input_revision`: identifiers needed to reproduce the actual run.
- `usage`, `billing`, `timing`: usage, billing units, and per-stage measurements from question generation to recording. Unknown values are `null`.
- `main_session_disposition`: adopt/abstain/modify/undecided, with its evidence. Undecided if the main session has not read it yet.

`completed` means sending and response handling finished. It does not mean the judgment is correct or the task succeeded.
`unknown` is for cases where the call outcome is uncertain, such as a timeout or a dropped connection. It is not resent automatically.
Undecidable and call failure need different follow-up handling.

Proposed record location: put the request/result JSON and a human-readable summary under `receipts/decisions/<decision_id>/`, which is already ignored.
This directory has not been created yet. Build the summary from the structured original. Do not overwrite the
questions, candidates or probabilities by rewriting them as prose. Keep the question writer's explanations separate from what Jev
returned directly. Do not attach explanations that Jev did not give.

The current direct client returns a normalized response and some billing headers. It does not save the raw response to a file.
So this record contract is not an existing feature. It is a part still to be implemented.

## 8. Handoff and context preservation / hypothesis H-001

The user is concerned that important content gets lost during compaction, and recommended a handoff and a new session
after a judgment. This is a proposal subject to verification. It is not a confirmed requirement to switch sessions automatically after every judgment.

A handoff built only from a summary can suffer the same loss. The proposed handoff material consists of the goal, explicit constraints,
reasons for agreement/rejection, current file and task state, remaining uncertainty, references to judgment requests and results, and the next action.
Apart from the short explanation, keep the location and version where the source evidence can be re-read.

Verification conditions:

- On the same task, compare a condition that continues the current session with a condition that hands off and continues in a new session.
- Measure preservation of the required facts and constraints listed in advance, contradictions and omissions, suitability of the next action, and total time and tokens.
- Separate the effect of the handoff summary from the effect of re-reading the source. Do not judge it better just because it is a new session.
- When to propose a handoff, how to recover on failure, and how to run it per host are undecided.

## 9. Evaluation plan / offline calculation implemented, actual model evaluation not run

The D-013 goal/spec-based implementation experiment is recorded in the [feasibility study](https://github.com/Kai-Leee/jev-router/blob/research/docs/LIVE_EXPERIMENT_FEASIBILITY.md).
P-005 proposed Opus 5.5 implementation + Jev structured judgment, the existing harness/benchmark, independent grading and
action-link verification. Later, D-014 implemented the restricted candidate selection gate, Docker execution, raw journal and Claude
launch code, and verified them without charges. The actual paid Opus/Jev loop has not been run yet.

Methods from existing research and practice, and proposals for per-metric denominators, missing values and cost aggregation, are recorded in
[evaluation method research and implementation proposal](https://github.com/Kai-Leee/jev-router/blob/research/docs/EVALUATION_RESEARCH.md) [D-011].
After the research, the [input contract](EVALUATION_CONTRACT.en.md) and the
[offline evaluation CLI](EVALUATION_USAGE.en.md) were implemented under D-012. They validate and recompute stored results.
They do not run actual comparison models or automatically collect raw API responses.

The initial comparison uses the same task, evidence, execution candidates and evaluation criteria.

- Baseline: the main agent judges directly.
- Condition A: in the same session, a question is built in a set format and the agent judges it directly.
- Condition B: Jev judges the same question.
- Separate experiment: selection evaluation with a fixed candidate set, and full-flow evaluation that includes candidate generation.
- Separate experiment: cost and quality comparison of writing new questions versus reusing verified formats.
- The handoff comparison is kept separate from the basic judgment performance comparison.

Record the total wall-clock time including question generation and follow-up interpretation, the input/output tokens of all models,
the billing units actually provided, and the cost of retries, failures and abstentions. Do not claim price superiority
from the token counts of different models alone. If USD cost is absent, keep it as not provided.

Report quality on answered items together with the share of all requests that were answered. Distinguish a result that only lowered
the error rate by increasing undecidable outcomes from a result that actually improved usefulness. Evaluate model selection by later task success rate,
evidence assessment by comparison with the source text, ranking by set preferences/utility, and prediction by actual observations and calibration.

Keep the data used to tune thresholds and questions separate from the final evaluation data. Also record variation across repeated requests
and model versions. The first evaluation task set, sample, acceptable quality loss and budget are O-003. No numbers were set arbitrarily.

## 10. Remaining decisions and implementation order

- O-001: resolved → D-010. Automatic calls by default; specific triggers and frequency are tuned in evaluation.
- O-002: result use policy. The scope of use after format and constraint checks, and the conditions for re-checking. If a large model
  repeats the original judgment every time, the savings can disappear, so this is measured separately.
- O-003: the first evaluation task set and the priority among quality, time and cost.
- H-001: the actual effect of a handoff after a judgment, and when to switch.
- H-002: how to build rankings per purpose, and handling of not-comparable cases.

Proposed order: settle agreements/contracts → write representative judgment examples and question formats → connect the existing CLI and extend recording →
same-condition evaluation → handoff comparison. This is not a decision to narrow the whole application area to one first experiment.
Do not stop the spec or local implementation, or ask for user approval every time, only because detailed policies such as thresholds
are undecided. However, do not invent priorities or spending limits for the user's actual work and act on them.

## 11. Differences from the existing implementation

- Present: Jev AI direct client, request/response checks, handling of cost not provided, MCP execution connection, example CLI,
  offline evaluation input contract, status/quality/cost/latency calculation and report CLI. See the verification record for detailed verification.
- Confirmed: on 2026-10-08 in this chat, authenticated model list retrieval via direct/MCP, and 22 tests passed, including a mock API.
- Implemented later: the D-014 restricted candidate selection/abstention gate, the Claude/MCP/Docker runner for structured B/C comparison,
  the raw input/judgment/action journal, and two benchmarks. The actual paid loop is not verified yet.
- Not implemented: general judgment contract collection, candidate registry, handoff product feature, multi-executor selection and load balancing.
- Evaluation follow-up: ranking, Oracle regret, confidence intervals, weighted comparison by task set, raw trace→evaluation contract conversion.
- Not measured: Jev reasoning quality, overall cost/speed improvement, English advantage, context preservation improvement.

The external source is the [Jev AI API docs](https://jev-ai.pro/docs). Local implementation evidence is
[client.mjs](../src/client.mjs) and the [MCP guide](../MCP.md).
For the API docs, the request/response and error rules read in the 2026-10-08 conversation were used. Local design proposals
are not presented as provider features.
# D-020 update: shared Jev monetary allowance

2026-10-09 user limit: Jev USD 1 for the current experiment; arbitrary decision count remains unlimited.
The provider returns token/credit units, not actual per-call USD. A shared durable token budget reserves
the maximum documented Jev context before dispatch, then verifies the receipt and settles paid tokens
at conservative USD 0.60/M. Unknown results retain reservations. Actual billed USD remains null.
The detailed policy, assumptions, process/module boundary and commands are in [PAIRED_RUN](PAIRED_RUN.md).
This update supersedes earlier unresolved monetary-approval status; it does not claim live execution success.

## D-021 current implementation supplement (2026-10-09)

The earlier not-run descriptions up to D-019 are records of that time. Later, actual Opus/Jev runs and the independent monitor
were done in D-020. For the latest run status and failure boundaries, follow [STATE](https://github.com/Kai-Leee/jev-router/blob/research/docs/agents/STATE.md)
and [failure analysis](https://github.com/Kai-Leee/jev-router/blob/research/docs/research/D020_FAILURE_ANALYSIS.md). Per-token official price conversion is
implemented with the [pricing contract](DASHBOARD_PRICING.md) and an independent pricing module, kept separate from the run budget policy.

## D-024 judgment replacement structure

The existing benchmark act/finish path is kept as a past comparison condition. The new role rule lifecycle is separated into `src/benchmark/agent-rules.mjs`:

1. Claude receives the goal, evidence and allowed tools, and writes the role, inputs, outputs, acceptance criteria, escalation and update conditions.
2. The program validates format, tools, working path and version/hash.
3. Jev decides accept/revise/abstain. Only an approval can be exported as a Claude definition for the current session.
4. When new evidence appears, Jev decides keep/revise/abstain. On keep, there is no Claude generation call. On revise, it generates once and validates again. No infinite self-revision loop.
5. If the evidence hash changes during validation or before export, the previous approval is discarded. Success of independent tests is separate from the Jev judgment.

The host must actually enforce permissions. The workspace wording in a rule is not a sandbox by itself. Initial connection verification is limited to a tools=[] role. Per-stage role routing in the full coding runner and E2E efficiency verification are still a separate integration step. The user's goal, removing selection/repeated Claude judgments before code generation, is applied as the next E2E condition. For reproduction commands and limits of the fixed-question measurement and the actual rule pilot, see research/D024_DECISION_LATENCY.md and D024_AGENT_RULES.md.

## D-025 checkpoint-v1 selection-based execution

With workflow='checkpoint-v1' in the run config, it uses route(role candidates without code)→act(a single command of the selected role, no additional model)→finish. baseline/jev share the same schema and completion evidence collection; only the provider of selected_id differs. When workflow is omitted, the past gate stays as it was. The server passes the original brief and the actual command/output/evidence_id to the judgment. A nonzero command releases the role. A repeated completion question with the same action_version is rejected. But this is not a change check based on the actual artifact hash, so any new command can increase the version. This is not a security policy that enforces the semantic command scope of a role description. The Docker boundary enforces permissions.

The roles in this pilot are work scopes within the same Claude session. They are not presented as equivalent to native subagent creation. The cost and performance of the D024 actual subagent rule lifecycle are separate. Measurement and judgment documents are managed with [D025](https://github.com/Kai-Leee/jev-router/blob/research/docs/decisions/D025.md) and the jev-decision-records skill.
