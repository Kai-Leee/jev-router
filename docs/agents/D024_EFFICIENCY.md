# D-024 roles and boundaries

User objective: replace repeated Claude decisions with Jev decisions; do not append a second review to already completed reasoning. English decision contracts. Preserve shared USD1 ledger and uncertain-call stop.

- efficiency-audit: owns docs/research/D024_SYSTEM_ANALYSIS.md only. Read existing traces and code. Explain measured vs inferred causes, pre-generation routing, completion evidence, monitor overhead. No paid calls, edits elsewhere, or task messages.
- rule-lifecycle: owns src/benchmark/agent-rules.mjs and test/agent-rules.test.mjs plus docs/agents/d024-rules-STATUS.md. Implement dependency-injected lifecycle: Claude generates versioned role rules, deterministic admission checks, Jev validates accept/revise/abstain and update need using English structured questions. Preserve evidence identity, no automatic permission expansion or recursive agent spawn. Tests must cover invalid permissions, stale evidence, abstain and revision behavior. Export clear API; main integrates CLI.
- main: isolated timing harness, live rule-generation/decision smoke if transport available, integration, shared records. Fixed-input timing and E2E performance are separate experiments. Only main spends using existing ledger.

This is development delegation. Generated Claude role definitions are not evidence of actual native subagent spawning. Runtime integration must report this distinction.

Final integration review: efficiency-audit may read the three main scripts and private D024 receipts for critical defects; no edits outside its report and no model calls.
