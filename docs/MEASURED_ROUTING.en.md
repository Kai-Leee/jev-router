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
| Reported token sum | 6,772,666 | 3,623,150 |
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


## Three completed conditions: time and tokens

On 2026-10-15 we reanalyzed saved receipts. All632 historical source hashes match; the fresh D067 analysis equals the preserved analysis except its generation timestamp. The [redacted public aggregate JSON](evidence/measured-results-20261015.json) contains values, denominators and provenance hashes, without prompts/responses, user paths, credentials or hidden test contents.

| Completed condition | Workflow ms | Claude tokens | Jev input + output | Reported token sum | Time reduction | Token reduction |
|---|---:|---:|---:|---:|---:|---:|
| Claude decisions | 2,180,703.603375 | 6,772,666 | 0 | 6,772,666 | reference | reference |
| Jev decomposition | 1,554,036.054042 | 3,136,810 | 828,104 + 2,375 | 3,967,289 | 28.74% | 41.42% |
| Jev decomposition + relations | 1,704,539.968833 | 2,720,901 | 897,398 + 4,851 | 3,623,150 | 21.84% | 46.50% |

All three passed85/85 public and63/63 independent tests, one run per condition. These are the completed three rows in a four-condition concurrent cohort; not every condition succeeded. Full outcomes remain in the linked research record. Plans, repair needs, caching and host contention differed, so this is descriptive workflow evidence rather than an isolated causal effect or general performance guarantee.

### Cache-aware token accounting

| Condition | Claude ordinary input | Output | Cache creation | Cache read |
|---|---:|---:|---:|---:|
| Claude decisions | 254 | 240,722 | 1,924,792 | 4,606,898 |
| Jev decomposition | 102 | 187,629 | 644,256 | 2,304,823 |
| Jev decomposition + relations | 102 | 231,453 | 397,539 | 2,091,807 |

`Reported token sum = Claude ordinary input + output + cache creation + cache read + Jev input + output`. Do not add cache TTL sub-buckets again. Free Jev output is included; unreported Jev cache fields remain null. Provider tokenizers differ, so this is not unique source text measured with one tokenizer.

```text
Decomposition token reduction = (6,772,666 − 3,967,289) / 6,772,666 × 100 = 41.422049%
Decomposition+relations token reduction = (6,772,666 − 3,623,150) / 6,772,666 × 100 = 46.503342%
Decomposition time reduction = (2,180,703.603375 − 1,554,036.054042) / 2,180,703.603375 × 100 = 28.736943%
```

Claude/Jev invocation counts were57/0,12/45 and10/47: all57 external adapter calls. Some repeated Claude calls moved to Jev; fewer total calls were not established. CLI receipts do not independently measure internal HTTP retries.

## Separate observation: Codex/Jev initial decomposition

The local2026-10-15 comparison matched only the initial decomposition stage: canonical210questions,4calls per condition, equal input hashes and environment/source fingerprints. All40 source hashes referenced by the full comparison summary were checked again.

| Initial decomposition | Sum of adapter attempt time | Input + output tokens |
|---|---:|---:|
| Codex | 245,919.542166ms | 182,215 |
| Jev | 6,497.730124ms | 167,726 |

`245919.542166 / 6497.730124 = 37.846992x`; reported tokens reduced `(182215−167726)/182215×100=7.951596%`. This compares the Codex CLI path with Jev preflight/ledger/HTTP adapter time, not HTTP-only latency. Requested Codex profile was gpt-5.6-sol/high; actual model identity was not returned. One sequential pair; later decisions and development outcomes differed. **This does not establish whole-development speedup or equal final product quality.** Final Jev grading is on user hold after Docker shutdown; it was not resumed.

## Recompute published arithmetic

From the repository root, this reads only the aggregate JSON: no key, network, Docker or inference.

```sh
node --input-type=module -e 'import fs from "node:fs"; const d=JSON.parse(fs.readFileSync("docs/evidence/measured-results-20261015.json")); const rows=d.measurements[0].rows; const b=rows[0]; for (const r of rows) console.log(r.condition, {tokens:r.tokens.reported_token_sum, time_reduction:100*(b.workflow_wall_ms-r.workflow_wall_ms)/b.workflow_wall_ms, token_reduction:100*(b.tokens.reported_token_sum-r.tokens.reported_token_sum)/b.tokens.reported_token_sum});'
```

This reproduces aggregate arithmetic. Auditing every raw receipt requires the preserved research workspace and analyzer linked above. Skill responsibility separation itself has no measured savings claim. See [current capabilities and decomposition](CAPABILITIES.en.md).
