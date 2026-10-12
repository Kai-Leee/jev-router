# Jev Router — Claude entry point

@AGENTS.md

Current question-authoring entry: read the repository's [jev-prompting skill](skills/jev-prompting/SKILL.md)
and [D075 integration](docs/orchestration/D075_FORCED_PREFLIGHT_AND_RECOVERY.md).
The v10 preserved-repair path requires prompt policy v2 and the transmission/recovery policies.
For a standalone fixed-template check, explicitly use `--policy v2`; historical v1 retains its original source pins.
Read [STATE](docs/agents/STATE.md) for validation and actual-run status. Repository instructions alone do not prove
automatic skill activation, actual transmission or product completion. D074's design-only state is historical.
The [D075 measurements](docs/orchestration/D075_RESULTS.md) ended at public88/93 and independent60/63.
Required pre-send checks ran, but the later owner request exceeded model context after canonical projection.
Further canonical rebuilding and profile-stage automatic rebuilding are not supported. Preserve terminal results.

Shared rules live in the imported AGENTS.md. Read the canonical contract index at
[docs/orchestration/contracts/README.md](docs/orchestration/contracts/README.md)
before creating questions, selecting workers, or running orchestration experiments.
Do not copy contract wording into a second authority or rewrite fixed questions per call.

The D029 model catalog and worker instructions are
[models.v2.json](docs/orchestration/contracts/models.v2.json) and
[worker-task.v2.json](docs/orchestration/contracts/worker-task.v2.json).
Historical v1 files remain evidence for earlier experiments; the run manifest must identify
which version was actually loaded. A link here is not proof that a worker received its contents.
When workers run from an isolated directory, the dispatcher must materialize the relevant
instructions and document contents into their prompt or workspace, recording source hashes.

D063 future development plan: [task/artifact DAG integration](docs/orchestration/D063_DAG_PLAN.md). Read it with the imported AGENTS.md before new orchestration work. It is an adopted development direction, not a loaded runtime contract or a completed live experiment.

For repository skill maintenance, read [jev-skill-maintenance](skills/jev-skill-maintenance/SKILL.md) and [maintenance inventory](docs/skills/MAINTENANCE.md). Follow the single skills-owner role in D064; source updates do not imply installed-host updates. Current opt-in DAG implementation boundaries: [D064](docs/orchestration/D064_IMPLEMENTATION.md).

D065 continuation: read [current implementation](docs/orchestration/D065_IMPLEMENTATION.md), [actual results and corrections](docs/orchestration/D065_RESULTS.md), [parallel ownership](docs/agents/D065_PARALLEL.md), and [the decision record](docs/decisions/D065.md) before work. Real filesystem revision binding and semantic v2 actions are separate from historical v1. Keep authored public controls, actual candidate checks and independent product grade distinct. The one live condition terminated with product failure; preserve its candidate and original uncertain result. Check the terminal run state before any paid launch; no automatic replay or budget reset. The same single skills maintainer owns improvements. Test deletion requires preserved snapshots and actual surviving defect/assertion evidence.
