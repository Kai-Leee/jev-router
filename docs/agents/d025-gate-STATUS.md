# D025 checkpoint gate — implementation status

Purpose: select a high-level role before command generation, retain that role across successful actions, and request Jev only at routing/completion checkpoints. Historical decision-gate remains unchanged.

Owned files:
- `src/benchmark/checkpoint-gate.mjs`
- `test/checkpoint-gate.test.mjs`
- this record

Implemented:
- `createCheckpointGate({mode,maxDecisions,decide,execute,record,recordState,trustedBrief,identifiers})`.
- `checkpointTools(mode)` / `CHECKPOINT_TOOLS`; route `{purpose,state,candidates:[{id,description}],selected_id?}`, act `{role_id,command}`, finish `{purpose,state,selected_id?}`, status.
- Baseline requires selected_id on route and finish; Jev rejects caller selection. Commands are forbidden in route candidate schema; role prose remains model-authored.
- Host trusted brief and exact observed action-N evidence included in each decision. Caller evidence stays separate. Command results retain transport truncation flags. No evidence omission to fit context: aggregate request overflow stops with INVALID_INPUT before paid request.
- Route first; wrong role rejected; nonzero command clears role. Successful role may run multiple commands without extra inference. Role membership is an ID contract, not semantic tool-permission enforcement.
- Completion has same action-version replay guard for both modes. A new action permits another completion request; no claim that an arbitrary new action must materially change artifacts. Independent evaluator success remains null.
- Snapshot and serialize inputs, clone outputs, durable intent before execution, independent gate state writer, stop on unknown paid/execution outcomes. No automatic paid retries.

Validation: `node --test test/checkpoint-gate.test.mjs test/benchmark-decision-gate.test.mjs`: 48/48 pass (13 new checkpoint tests, 35 historical gate tests). Covers paid-call separation, trusted evidence, same-version repeat rejection, baseline contract, nonzero recovery, writer failures, uncertainty, limits, mutation and aggregate overflow. All synthetic, no model/API calls.

Integration notes:
- Existing telemetry state allowlist drops new selected_role/action_version fields; direct status and journal retain them. No new enum/code required.
- Each act records decision:null under existing event convention; count actual provider requests, not every decision event, for inference totals.
- Main owns dispatcher/runner/config integration, real runs, pricing and shared docs.
- No new services, containers, credentials, installs, commits, or paid calls from this subagent. Two source/test files and this document are local changes.
