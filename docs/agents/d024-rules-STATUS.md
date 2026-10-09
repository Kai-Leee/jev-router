# D-024 rule lifecycle status

2026-10-09. Owner: rule-lifecycle. Scope: `src/benchmark/agent-rules.mjs`, `test/agent-rules.test.mjs`, this record only. No paid calls or agent spawning by this development role.

Implemented dependency-injected `createAgentRuleLifecycle({generate,decide,policy,record})`:

1. `create({goal,evidence,currentEvidenceHash})` asks Claude's injected generator for one role contract, performs deterministic admission checks, then asks Jev `accept / revise / abstain`.
2. `update({rules,goal,evidence,currentEvidenceHash})` asks Jev `keep / revise / abstain` first. Only `revise` invokes Claude generation, followed by one validation. It never loops on an inconclusive response or retries a thrown transport error.
3. `await exportClaudeAgent(result)` exports only an unchanged approved result produced by that lifecycle instance. It checks freshness again, revokes stale approval and returns a `--agents` definition with exact `claude-opus-5-5`, explicit tools, `dontAsk`, `omitClaudeMd:true`. This is a definition, not evidence of native parent/subagent spawning.

Generator input: `{instructions,goal,evidence,previous,update_decision,revision,policy}`. Output must contain only `role,purpose,inputs,outputs,acceptance,escalation,update_conditions,tools,workspace`. Role uses `^[a-z][a-z0-9-]{0,63}$`. Five middle contract fields are nonempty string arrays. Deterministic code attaches goal, version, evidence_hash and rule_hash. Evidence is `{revision,items:[{id,content}]}`; actual evidence excerpts, not only file paths. Exported Jev request question key is `rule_review`.

`policy={allowedTools,workspace}` is trusted caller configuration. Exact tool and workspace checks forbid expansion; `Agent`, `Task`, scoped variants such as `Agent(foo)` are forbidden even when listed. Prior rules must retain their content hash and original goal. Generator receives copies so it cannot mutate trusted permissions. `currentEvidenceHash` accepts a hash or function; the function is necessary for detecting changes after an async call. The caller must update its evidence revision/content when underlying files change.

Verification: from `jev-router`, `node --test test/agent-rules.test.mjs` → exit 0, 12 tests passed, 0 failed. Coverage includes tool/workspace expansion, recursive spawning, stale before/during/after review, approval revocation, abstain, one revision, keep without regeneration, prior-rule tampering, mutation isolation and transport uncertainty without retry. First test run passed 10 tests; two additional boundary tests brought the final count to 12. Full-suite integration belongs to main.

Limitations: this module does not inspect the actual filesystem, establish evidence truth, enforce OS containment, or launch agents. Jev acceptance is semantic assessment of supplied material, not proof of tests or quality. Rule review currently returns a contract-level choice, without pinpointed per-rule defect IDs; revisions receive the prior contract and supplied evidence. There is no persistent lifecycle cache or cross-process approval restoration. A stale/abstain/revise result is not usable for export. Main owns real transport, shared budget, journal and eventual runner connection. Semantic instructions in free text are not a substitute for host-enforced tool/workspace limits.
