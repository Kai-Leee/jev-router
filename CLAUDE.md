# Jev Router — Claude entry point

@AGENTS.md

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
