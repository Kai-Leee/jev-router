# Jev / Claude usage dashboard

> English translation of [DASHBOARD.md](DASHBOARD.md). The Korean original is authoritative if they differ.

Implemented and checked on: 2026-10-09. Under D-017, this is a screen that reads local run records.
A real model comparison and billing verification for Jev and Claude have not been done yet.

D-019 addressed the tool failures, gate stops and early completion judgments from the D-018 audit.
It shows the implementation/monitor of the same development group, safe error codes, independent heartbeats and the monitor's interpretation.
Follow the [development connection guide](PAIRED_RUN.md). Real model integration has not started yet, because the automatic approval review required approval of the spending amount.
Whole-host failure detection, an independent process supervisor and internal HTTP instrumentation are still not verified/not connected.

## Run

Run `npm run dashboard` from the repository root, then open `http://127.0.0.1:8787`.
By default it reads the records in `benchmark-runs/` and `../personal-os-jev-lab/runs/`.
It runs on the host and updates with full SSE snapshots. The server collection interval is 1 second by default, and the GET fallback is 3 seconds.
These are configured values, not a measured guarantee of display delay. To stop the server, press Ctrl-C in its terminal.

```sh
npm run dashboard
# Open only the synthetic example for display and aggregation checks, on a separate port
npm run dashboard -- --port 8788 --runs-root examples/dashboard
# Other run-record folders can be given repeatedly
npm run dashboard -- --port 8788 --runs-root /path/to/runs
```

The server binds only to `127.0.0.1`. It is read-only and has no buttons for runs or paid calls.
As before, only the runner reads the Jev key, from a server environment variable or `~/workspace/.env`.
The dashboard server does not read the key. The browser API receives only aggregated, allowed fields.
It does not receive prompts, commands, raw logs, account information or authentication headers.

## Meaning of the numbers

- Jev send attempts: the number of durable records written right before calling inference, after validation and the model GET.
  It is not the number of questions or GETs, and it does not guarantee that the server actually received the request.
  Completed, failed and uncertain are shown separately. An uncertain POST is not resent.
- Claude observed responses: response steps, excluding duplicate `message.id`. The total number of HTTP requests and the number of internal
  retries are not provided by the current stream aggregation, so they are unconfirmed. Optional native OTel is an additional
  instrumentation path found in a follow-up investigation. It is not connected yet. Completed/failed in the table are per CLI process.
- Claude tokens: the final `modelUsage` takes priority. Without it, the scope is limited to the main loop `usage`.
  Input, output, cache read and cache creation are kept separate. In-progress assistant output placeholders are not summed.
- Jev cost: raw tokens, balance token deductions, credits and provider-reported USD are kept separate.
  Tokens and credits without a purchase unit price are not converted to USD arbitrarily.
- Claude `total_cost_usd`: an **estimated** cost, converted at API rates from the CLI price table. It is not a queried value
  of the actual extra billing for the OAuth subscription. Actual billed USD is unconfirmed without separate evidence.
- Missing/interrupted: the complete total is unconfirmed. Where values can be kept, the observed subtotal and observed denominator are shown.
  A 0 from a control run that explicitly used no model is distinguished from unconfirmed.
- A run ending is different from passing the implementation evaluation. Past grader results are shown within their original evaluation scope.
  The not verified browser/native items of Personal OS are not promoted to passed.

A progress record with a time limit and an observation time becomes uncertain if there is no end record after the limit + 30 seconds.
Before that, the running indication is an estimate based on records and time. It is not a check that the process is alive.
A failure to stop a container is also shown as uncertain. If a past record has no send boundary, the call count is not estimated retroactively.

## Instrumentation path and verification

The runner saves the stream in `claude.stream.jsonl` and leaves the final summary in `result.json`.
Jev's before-send/after-send events are in `decisions.jsonl`. Raw records with permission 0600 are kept only locally.
The older `claude.stdout.json` is read for backward compatibility, but the two results are not double-counted.
If writing stops in the middle of a line or a UTF-8 sequence, earlier complete lines are kept as a partial observation.

```sh
npm test
node --test test/benchmark-telemetry.test.mjs test/dashboard-metrics.test.mjs test/dashboard-server.test.mjs
```

The browser check uses an installed Playwright package and a Chrome executable. The runtime package
is not a product dependency. First open the synthetic example server, then fill in the real paths.

```sh
JEV_PLAYWRIGHT_PACKAGE=/path/to/node_modules/playwright/package.json \
JEV_CHROME_EXECUTABLE=/path/to/chrome \
node scripts/check-dashboard-browser.mjs http://127.0.0.1:8788
```

The command creates its own new browser profile and does not call a real model.
It leaves `output/playwright/browser-check.json`, desktop/mobile PNGs and an accessibility snapshot.
Sample values such as 2 times/205·420 tokens/$0.1234 are synthetic values, not real usage results.
For final measurements and failure history, see the [verification record](https://github.com/Kai-Leee/pointsman/blob/research/VERIFICATION.md). For official meanings, see the
[research](https://github.com/Kai-Leee/pointsman/blob/research/docs/DASHBOARD_RESEARCH.md). For the field contract, see the [contract](DASHBOARD_CONTRACT.md).

Whether current model calls and tokens actually enter this instrumentation, and whether they match provider billing, will be checked in the next experiment.
Real comparisons between models, Codex instrumentation, a long-term storage DB and remote deployment with user authentication are outside this implementation's scope.

## 2026-10-09 — Show official unit prices next to tokens

Next to the input, output and cache token counts, it shows the converted estimated USD and the provider total. It separates the allocation of
the Jev Creator monthly subscription fee from the conversion with the Claude Opus5.5 API price table. Each panel's official source/check date and
expandable explanation show the formula and the missing-value conditions. Prices are a profile checked on 2026-10-09 and are not updated automatically.
Details: [pricing contract](DASHBOARD_PRICING.md). The D-020 shared budget keeps a separate conservative basis.
