# Offline evaluation CLI usage

> English translation of [EVALUATION_USAGE.md](EVALUATION_USAGE.md). The Korean original is authoritative if they differ.

Target: a `jev-eval/v1` manifest and JSONL records. It validates saved input and computes a JSON report.
It uses only Node.js 22 or later and the standard library. It does not read API keys, dotenv or the Jev client, and does not call a model.
The exact input fields and status combinations are in the [evaluation input contract](EVALUATION_CONTRACT.en.md).

## Run

From `pointsman/`:

```sh
node bin/evaluate.mjs --help
node bin/evaluate.mjs --manifest examples/evaluation/manifest.json --records examples/evaluation/records.jsonl
node bin/evaluate.mjs --manifest examples/evaluation/manifest.json --records examples/evaluation/records.jsonl --output /tmp/jev-evaluation-report.json
```

Without `--output`, it prints only the report to stdout. With `--output`, it creates a new file with permission `0600`
and leaves stdout empty. It does not overwrite an existing file, directory or symlink. The output's parent
directory must already exist. If an error occurs while writing the file, an incomplete new file can remain. So use only
output with exit code 0 as a successful report. When you run it again, give a new path.

Only `--manifest <path>`, `--records <path>` and an optional `--output <path>` are allowed as arguments. Duplicates are an error.
Use `--help` alone. Quote paths that contain spaces in the shell. Give a file name that starts with `--`
as a relative path, like `./--name.json`. stdin/URL input and the `--flag=value` syntax are not supported.

Input is UTF-8. Invalid UTF-8 is rejected. A UTF-8 BOM at the start of a file is allowed. JSONL has one JSON value
on each non-empty line. LF/CRLF and blank lines are allowed. The object shape of each value is checked by the contract.
A JSONL file of 0 bytes or only whitespace is `records=[]`. The manifest's cases and trials stay in the denominator and are counted
as having no record. Empty `cases`/`trials` are also valid. A metric with no denominator has `null` and a reason.

## Meaning of the synthetic example

The [manifest](../examples/evaluation/manifest.json) and [records](../examples/evaluation/records.jsonl) are
examples of computation and input format, with `provenance: "synthetic"`. They are not real model responses or measured user performance values.

| Example input | Interpretation to check |
|---|---|
| categorical: 1 correct answer, 1 wrong answer, 1 with multiple accepted answers; binary: 1 correct answer | 3 of 4 scored answers are correct. The case with multiple accepted answers is excluded from single-gold classification/probability metrics |
| 1 abstention, 1 call failure, 1 missing record | All 7 cases are kept. Answer coverage is 4/7. Abstention, failure and missing are separate from correct/wrong |
| Abstention case with no reference answer | Distinguish a missing reference answer from a missing judgment |
| 1 each of trial success/failure/unknown, and 1 missing record | Distinguish whether the run succeeded from unknown elapsed |
| Several judgments for a single request | Billing is not summed again for each judgment |
| `evaluation` phase request | Separate evaluation cost from operation cost |
| `null` cost, unknown expected request count, fewer records than expected | Do not claim a complete total cost or savings rate. Keep the observed subtotal |

`expected_request_count` is the expected total number of HTTP requests for a trial, including requests for evaluation. More
request records than expected is a contract error. If there are fewer than expected, or the expected count is `null`, it is not treated as complete observation.
The numbers in the example are for checking that the metric implementation keeps statuses and missing items.

## Reading the report

`schema_version` is `jev-eval-report/v1`. `dataset` keeps the input ID, version and provenance.
`cases`, `requests` and `trials` are different units. Each rate has a value, numerator, denominator, unit and `null` reason.
In `latency`, judgment time, HTTP request time and the time of successful/failed trials are not read as interchangeable measurements.
`costs` separates operation and evaluation costs, and USD/Jev tokens/Jev credits. When a unit's `total` is `null`,
do not read `observed_subtotal` as the complete cost.

`classification` and `probability` provide metrics that use only single-gold cases, together with the excluded count.
The accuracy of the actually selected answer and the reliability based on the probability argmax are separate. For detailed formulas, tie policy and exceptions,
read the report `conventions` together with the [contract](EVALUATION_CONTRACT.en.md) and the [evaluation research](https://github.com/Kai-Leee/pointsman/blob/research/docs/EVALUATION_RESEARCH.md).
The CLI serializes the report returned by the calculator as is. It does not add judgments on thresholds, quality pass/fail or savings effects.

## Errors and exit codes

Errors are reported only as one-line JSON on stderr. It has `error` and a fixed `message`. It does not print input content, file paths
or raw exceptions/stacks. Example: `{"error":"OUTPUT_EXISTS","message":"The output path already exists; choose a new path."}`.

| Exit code | Meaning | error code |
|---|---|---|
| 0 | Report generated or help succeeded | None |
| 1 | Unexpected internal error | `INTERNAL_ERROR` |
| 2 | Missing, duplicate or unsupported argument | `USAGE` |
| 3 | Input read, encoding, syntax or contract error | `INPUT_READ_FAILED`, `INPUT_ENCODING_INVALID`, `MANIFEST_JSON_INVALID`, `RECORD_JSON_INVALID`, `INPUT_CONTRACT_INVALID` |
| 4 | Output conflict or write failure | `OUTPUT_EXISTS`, `OUTPUT_WRITE_FAILED` |

This is the first offline implementation, and it processes all input and output in memory. It does not do large-scale streaming evaluation, real request collection,
model comparison, network connection or automatic routing. The direct verification scope is in the [CLI status record](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/cli-STATUS.md).
