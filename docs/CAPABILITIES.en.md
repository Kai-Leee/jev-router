# Released capabilities, research and skill decomposition

[한국어](CAPABILITIES.md) · [Measured time and tokens](MEASURED_ROUTING.en.md) · [README](../README.md)

Checked on 2026-10-15 against main `7310cc4` and public research `5f9b668`, with local development listed separately. A documented design is not automatically a released feature.

## Available on main

| Capability | Actual entrypoint | Scope and prerequisites |
|---|---|---|
| Jev configuration, sign-in, models and decisions | `npm run config`, `login`, `models`, `demo -- --spend`; `src/client.mjs` | Server-side Jev key; choice/score/noul; no automatic retry. Configuration inspection and paid inference are separate operations. |
| MCP connection | `npm run mcp:fetch`, `mcp`, `mcp:tools` | Checksum-pinned external MCP binary. Direct native MCP calls do not automatically inherit a research manifest transmission policy or the local Pointsman gateway. |
| Evaluation of saved records | `npm run eval:demo`, `npm run eval -- ...` | Offline metrics. Synthetic examples do not measure real-model accuracy. |
| Usage and failure dashboard | `npm run dashboard` | Projects supported run records into status, token and cost views; does not automatically instrument arbitrary external CLI sessions. |
| Fixed questions, profiles and worker instructions | `node bin/show-routing-contracts.mjs`; `docs/orchestration/contracts/` | Reads contracts and fills supported variables/candidates. A catalog entry does not establish account availability. |
| Documented task-tree and dispatch APIs | `src/orchestration/document-router.mjs`, `document-contracts.mjs`; `node bin/check-document-link.mjs NEW.json` | Validates supplied trees, split sketches, ownership and dependencies; connects choices to registered handlers. The basic linked example uses a mock response to construct worker instructions; it does not execute a worker. |
| Early file-generation pilot | `scripts/tree-e2e-pilot.mjs` | Reuses a frozen plan or asks Claude for 2–4 tasks; forced/Claude/Jev/script split selection. Fixed Opus profile, tool-free file generation, `generated_ungraded` outcome. |
| Isolated benchmark and paired development/monitor | `bin/benchmark-run.mjs`, `bin/paired-run.mjs`, `bin/benchmark-monitor.mjs` | Requires configuration, Docker, Claude authentication and a Jev ledger. Uses its historical manifest policy; distinct from advanced adaptive DAG and Codex comparison runtimes. |
| Evidence-recording skill | `skills/jev-decision-records/SKILL.md` | Records conditions, decisions, usage, costs and source hashes; not an automatic development router. |

Follow [usage](USAGE.en.md) for secrets and connection, and [benchmarks](../benchmarks/README.md) for execution prerequisites. Paid commands require spending authorization. Source presence, local verification and success in a new user's environment are different levels of evidence.

## Public research and local development

| Capability | Public research | Local development checkout |
|---|---|---|
| Artifact-based recursive decomposition, dependency DAG, ready queue and critical-path priority | Adaptive planner/runner with experiment-specific manifests | Reuses research runtime |
| Revision-bound public checks, inferred repair ownership and scoped repair | Includes D083 and later D085 multi-owner/direct repair experiments | Adds partial-execution repair and public-source ownership evidence |
| Pre-send validation, ledger and request/response records | Applied by the relevant manifest; policies differ across experiments | Mandatory Pointsman gateway adds guarded connections |
| Prompting and skill-maintenance roles | `jev-prompting`, `jev-skill-maintenance`, `jev-decision-records` | Reuses these roles |
| `pointsman-routing` skill, doctor/smoke and install bundle | Absent from public research | Implemented; host smoke verified with deterministic mock transport, not live product completion |
| Codex decisions vs Jev decisions with common Codex workers | Absent from public research | Implemented and run; latest Jev final grading is on user hold |
| Arbitrary installed-skill classification and deployment | Not provided as a general product | Registered checkpoints only; a general skill classifier remains separate design work |

The local changes remain in `feat/d083-skill-gateway`. Cloning main or public research does not install those modules. Read the [public research state](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/STATE.md), then match manifest, source pins and authentication. This capability audit did not start Docker or paid models.

## Separating skill responsibilities

Skills package repeatable procedures. Skill count, DAG node count and worker count are separate quantities.

| Skill | Responsibility | Location |
|---|---|---|
| `jev-decision-records` | Conditions, decisions, tokens, costs, provenance and handoff | main and research |
| `jev-prompting` | Fixed English questions, input and official-call preflight | research |
| `jev-skill-maintenance` | Skill inventory, improvement candidates and revision verification | research |
| `pointsman-routing` | Connect registered decomposition/profile/failure checkpoints to the guarded runtime | local development |

Create a reusable skill when the same procedure or question would otherwise be regenerated. Separate responsibilities with different inputs, outputs, checks or recovery rules. A one-off small action does not need its own skill. Reading a skill does not create a worker or grant permissions. **The token/time benefit of this skill packaging itself has not been measured.**

## Forming a decomposition list

First materialize the goal, requirement IDs/text, public tests, artifacts/files, interfaces and ownership. Jev cannot read a local path by itself; include the evidence excerpts it needs.

1. **Need to split:** look for independently testable artifacts and useful parallelism. Keep work together when coordination, integration or revalidation overhead dominates, or ownership conflicts and serial dependencies prevent useful overlap.
2. **Task list:** each node carries requirement IDs, artifacts/files, write scope, prerequisites, interface, public tests and an observable completion condition. Preserve every requirement and test mapping.
3. **Jev's decision:** the main document router selects a supplied split sketch. The research planner groups and subdivides prepared units/artifacts and selects relations; it is not unrestricted free-text task invention.
4. **Recursion and DAG:** reconsider selected children until an indivisible/minimum unit is reached. After relation clustering, code validates the final DAG for cycles, omissions and write conflicts and dispatches ready nodes. Worker limits and concurrent slots are separate settings.
5. **Failure routing:** bind public assertions, expected/actual results, current revisions and prior repair evidence to existing owners. An unexecuted test does not establish an owner's defect.

Main relies on supplied trees/sketches; research uses experiment-specific contracts. Do not treat model probabilities as verified success rates or apply an old numeric threshold to every runtime. Inspect the active manifest, question contract and handler.

Minimal logical task card:

```json
{
  "id": "models",
  "requirement_ids": ["R1"],
  "artifacts": ["src/models.py"],
  "depends_on": ["schema-contract"],
  "interface": "consume validated SchemaIR; emit model definitions",
  "public_tests": ["test_nullable_enum"],
  "done_when": "owned artifact revisions pass their public checks"
}
```

This illustrates the fields; use the versioned contract for actual runtime input.


## Differences between decomposition contracts

| Path | How split necessity and the list are determined |
|---|---|
| Main document router | Preserves supplied `splitSketch` and children. Uses `beneficial.noul`, a caller-specified threshold and evidence sufficiency to select an existing single/split plan. |
| Research recursive planner | Keeps or subdivides prepared units into a discrete number of nonempty children and assigns each unit exactly once. Root minimum splitting is an experiment policy. |
| D083 layered-v2 | Current comparisons reuse the D066 catalog. Jev classifies each unit pair as independent, using an existing interface, needing finished files, or unresolved. Code clusters units and builds the DAG. Interface-only use can run in parallel; finished-file requirements create ordering. |
| Local Codex comparison | Normalizes both responses to choice-only. Original probabilities remain in receipts but only choices reach the planner. Worker model/effort is held fixed. |

Ordinary D083 `merge_threshold=0.5` is a clustering criterion on relation probability mass, not a task-success rate or execution approval. Unknown relations, cycles and capacity rules can also cause merges. No optimal threshold was established.

Fixed wording comes from the research [layered contract](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/contracts/adaptive-layered-decomposition.v2.json) and [DAG contract](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/contracts/adaptive-dag.v1.json). The path is `planLayeredDag` → `layeredClusters` → DAG compilation/execution. General skill selection and automatic fresh catalog preparation for arbitrary projects are separate scope. D085 and D083 transmission policies differ; do not mix manifests.
