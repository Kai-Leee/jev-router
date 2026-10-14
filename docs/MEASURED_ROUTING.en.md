# Measured Jev + DAG routing

[한국어](MEASURED_ROUTING.md) · [README](../README.md)

## Completed D067 comparison

The 2026-10-11 OpenAPI Python client generator experiment moved decomposition and dependency
decisions from a structured Claude decision path to Jev while retaining Claude coding workers.
The selected Jev condition completed in **21.84% less development-stage time** at **58.52% lower
historical API-rate-equivalent cost** than the baseline. Both passed **85/85 public checks and
63/63 independent checks**, with zero skipped independent tests.

| Recorded quantity | Claude decisions + Claude workers | Jev decomposition/dependency decisions + Claude workers |
|---|---:|---:|
| Condition ID | `claude_all` | `jev_split_relations` |
| Successful development-stage wall time, ms | 2,180,703.603375 | 1,704,539.968833 |
| Historical API-rate-equivalent cost, USD | 21.1351716 | 8.7665802 |
| Public checks passed | 85/85 | 85/85 |
| Independent checks passed | 63/63 | 63/63 |

These are two selected conditions from the D067 concurrent cohort, with **one observation per
condition**. The common task, public preparation catalog, Opus 5.5 medium worker profile and two
worker slots per condition were fixed. The baseline used structured decision questions; it is
not a measurement of every possible Claude Code workflow. This snapshot reports the observed
workflow comparison rather than an isolated causal effect of Jev inference.

## Measurement boundaries and arithmetic

Development-stage wall time starts after shared preflight and covers decisions, implementation,
repairs, public validation and cleanup. Shared historical preparation, independent grading and
the separate monitor are outside that time boundary. Independent grading used fresh network-disabled
verifiers; candidate files were unchanged before/after grading and verifier containers were removed.

Reductions use the Claude baseline as the denominator:

```text
time = (2,180,703.603375 − 1,704,539.968833) / 2,180,703.603375 × 100
     = 21.835321% → 21.84%
cost = (21.1351716 − 8.7665802) / 21.1351716 × 100
     = 58.521367% → 58.52%
```

The cost calculation uses the rate snapshot documented on 2026-10-11: Jev input $0.60 per million
tokens, output free; Opus 5.5 standard input $4/M, output $20/M, one-hour cache creation $8/M and
cache reads $0.20/M. These are historical comparison rates applied to per-call usage receipts.
They are not current prices, actual subscription invoices or allocated monthly charges. Cached
creation/read tokens are accounted separately rather than charged twice as standard input.

## Evidence and reproduction

- [D067 full experiment and analysis](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D067_RESULTS.md)
- [Pre-run comparison protocol](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D067_EXPERIMENT.md)
- [Actual worker assignments](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D067_TASK_ASSIGNMENTS.md)
- [Recorded decision and evidence references](https://github.com/Kai-Leee/pointsman/blob/research/docs/decisions/D067.md)

The retained local analysis is `benchmark-runs/d067-analysis-02.json`, rows `claude_all` and
`jev_split_relations`. It links the original per-call receipts and candidate grading evidence.
Raw run artifacts remain in the experiment workspace; they are not bundled with this release.
With that evidence workspace available, the recorded analysis can be recomputed without inference:

```sh
node benchmark-runs/d067-preflight/analyze.mjs <NEW_OUTPUT_JSON>
```

The original paid run command is retained in the full research record. Existing output directories
are immutable evidence; use a new directory for any independently authorized reproduction.

## How the decisions reached execution

Jev's decomposition and relation decisions formed actual DAG nodes and dependencies and set each
worker's allowed file scope. Downstream tasks began after required artifacts were ready. Public
checks were bound to the candidate, checker, environment and artifact revision. This connects the
measurement to real task execution, rather than timing a disconnected classification request.

The advanced DAG runner belongs to the research implementation. The main release provides the
Jev client, run contracts, evaluation tools and dashboard; see the
[research checkpoint](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/STATE.md)
for the current experiment implementation.
