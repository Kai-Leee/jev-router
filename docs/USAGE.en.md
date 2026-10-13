# Usage guide

> English translation of [USAGE.md](USAGE.md). The Korean original is authoritative if they differ.

This document moves the run, connection and operation guide from the README without changes.
Its original location is [README.md @ 80eb79a](https://github.com/Kai-Leee/pointsman/blob/80eb79ae43ac5ba05c181447f25bd8112aed1aad/README.md).
Run all commands from the repository root. To change the key file path, use `JEV_AI_ENV_FILE`.

## Evaluating saved records

```sh
npm run eval:demo
npm run eval -- --manifest examples/evaluation/manifest.json --records examples/evaluation/records.jsonl --output /tmp/jev-evaluation-report.json
```

The example is `synthetic`. It includes correct answers, wrong answers, abstentions, failures and missing costs.
This command does not read a key or call the API. If the output file already exists, it is not overwritten.
It computes case/trial denominators, accuracy and coverage, latency by status, operation/evaluation costs,
and classification and probability metrics. Missing costs stay `null`.
Collecting real model responses, running per-model comparisons, and rankings/Oracle regret/confidence intervals are not implemented yet.

## Connection target

- Base URL: `https://jev-ai.pro/api`
- Check without inference: `GET https://jev-ai.pro/api/v1/models`
- Decision call: `POST https://jev-ai.pro/api/v1/systemone`
- Authentication: the server environment variable `JEV_AI_API_KEY` is used in the Bearer header
- Default model: `jev-latest`; the resolved model from the actual response is also kept in the result

The URL is fixed in [src/config.mjs](../src/config.mjs). Automatic switching to another service and
HTTP redirects are not allowed. Diagnostic output contains no key or Authorization header.

## Sign-in

`npm run login` sets up the Jev AI key interactively. Run it in a terminal such as iTerm or in a Claude terminal tab.

1. It asks you to accept the Jev AI [Terms of Use](https://jev-ai.pro/terms) and [Privacy Policy](https://jev-ai.pro/privacy). If you do not accept, nothing is saved.
2. It opens the [key page](https://jev-ai.pro/jev-api) in the browser. Sign in there and create a key. `--no-browser` skips opening the browser.
3. It reads the key with hidden input. The key does not appear on screen, in command-line arguments or in shell history.
4. It checks the key with one model-list GET, which runs no inference. Only if the check succeeds does it replace the `JEV_AI_API_KEY` line in the key file (`JEV_AI_ENV_FILE` or `~/workspace/.env`) and save the file with permission `0600`. Other lines are kept.

It refuses to run with non-interactive input such as a pipe. After saving, restart Claude Code or reconnect the jev-ai MCP server.

When this repository is opened in Claude Code, a SessionStart hook ([.claude/settings.json](../.claude/settings.json)) runs `node bin/jev.mjs login-check` to check only whether a key exists. It uses no network. If a key exists, it prints nothing. If no key exists, it tells Claude to open the key page in the browser pane and `npm run login -- --no-browser` in a terminal tab. The key is never taken through chat.

## Local key setup

The default read path is **`~/workspace/.env`**. The first task created a file with an empty key entry,
with permission `0600`. A status check on 2026-10-08 confirmed the key setup and an authenticated model list query.
In a new environment, the user enters the real key in a local editor.

1. Create a key for this service on the [Jev AI key page](https://jev-ai.pro/jev-api).
2. Open `~/workspace/.env` in a local editor and put the key after `JEV_AI_API_KEY=`.
3. Do not put the key in chat, browser code, Git, command-line arguments or logs.

Example that shows only the input format:

```dotenv
JEV_AI_API_KEY=<enter only in a local editor>
```

The file is not run as a shell script. It is parsed as dotenv data, and only the Jev key is read from it.
A key already set in the process environment variables takes priority over the file.
To use a different file, set only its path, which is not a secret, with `JEV_AI_ENV_FILE`.

```sh
npm run config
npm run models
```

`config` prints only the settings actually in use and whether a key exists. It does not use the network.
`models` sends only an authenticated GET. A successful list query does not guarantee that later inference
or balance use will succeed. If there is no key, it exits before any HTTP request.

## Small decision call that uses balance

After the key setup and the model list query succeed, run the following.

```sh
npm run demo -- --spend
```

This command first queries the model list and checks that `jev-latest` exists.
Then it sends the short example in [examples/decision.json](../examples/decision.json) as **one POST**.
It classifies a button error description as `coding`/`research`. It does not assign real work.
A run without `--spend` sends no request, and there is no automatic retry.

The result shows `answers`, the actual `model`, token `usage`, the billing headers `billing`, and the destination
and elapsed time `receipt`. Billing header values are kept as the original strings. Missing values are `null`.
If a USD cost is not provided, `usage.cost` is **`null`**, meaning not provided.
One call is a connection check, not a performance benchmark.
After the run, compare the deductions in the [Jev AI usage history](https://jev-ai.pro/jev-api).

## Using from other server code

```js
import { loadConfig } from './src/config.mjs';
import { createJevClient } from './src/client.mjs';

const client = createJevClient(loadConfig());
const result = await client.decide({
  state: 'The checkout button shows a blank screen.',
  questions: {
    needs_code: { type: 'noul', instructions: 'Does this require inspecting or changing code?' },
  },
});
// result.answers.needs_code.noul is a probability, not a verified success rate.
```

Import this module only from a server or a CLI. Do not bundle it for the browser.
The current adapter accepts the request fields `model`, `state` and `questions`. It supports `choice`, `score`
and `noul`. Saved judges, metadata and the web search API are outside this initial connection scope.

## Failure handling and limits

It follows the error rules of the official service documentation. No call is retried automatically.
The default timeout is 30 seconds. On the server, you can change it with `createJevClient({ ...loadConfig(), timeoutMs })`.

- `401`: check the key and the destination. `402`: check the balance or the spending-stop state.
- `404`: check the URL path. `409`: check the saved judge version. `422`: fix the input, then send a new request.
- `429`: wait at least `retryAfterMs`. `502`/`503`: retry with a delay, a limited number of times, only after the failure is confirmed.
- `504`, a dropped connection, or a response parse failure: the result is uncertain, so first check the usage history and the run state.
- Raw error bodies and transport exceptions from the upstream service are not printed.

Manual retries are also limited in number and are not sent earlier than `Retry-After`.
A status check API was not confirmed in the documentation, so automatic recovery, refunds and retries are not implemented.

The client checks request JSON against 256000 UTF-8 bytes, 1–64 questions, question IDs within 64 characters,
2–255 choices, and 2–10 score levels. The documented account API limit is 1000 calls per minute.
This initial module has no distributed limiter that tracks shared account usage.
The model's own context limit is separate from this JSON size check.

## Deployment settings

Put `JEV_AI_API_KEY` in the deployment platform's **server runtime Secrets / Environment Variables**.
Do not add a browser-public variable prefix such as `NEXT_PUBLIC_`, `VITE_` or `PUBLIC_`.
Do not copy the local `.env` into an image or a repository. Inject the secret in the runtime environment.
After deployment, restart the process. On the server, run `node bin/jev.mjs config` and
`node bin/jev.mjs models` to confirm the same destination.
The deployment platform is not chosen yet, and no real deployment has been done.

## If you use the TypeSafe SDK later

The SDK is not installed or used at present. `@typesafe-ai/sdk`, published by TypeSafe, is separate from
the compatible API that Jev AI provides. The SDK settings in the documentation are as follows.

```js
const client = new TypeSafeClient({
  apiKey: process.env.JEV_AI_API_KEY,
  baseURL: 'https://jev-ai.pro/api',
  retry: { maxRetries: 0 },
});
```

When switching, reuse the existing client and verify that the final path is `/api/v1/systemone`.
Do not change only the key, and do not add `/v1` to the base URL.

## Verification

```sh
npm test
```

The tests use only a fake key and mock HTTP responses. There is no real inference or balance deduction.
They check destination/authentication/redirect settings, a single request on error, response validation, missing costs,
preservation of billing headers, input limits, environment variable priority, and the CLI boundary for balance use.

Reference documents: [SDK and connection check](https://jev-ai.pro/docs#official-sdk),
[Error handling](https://jev-ai.pro/docs#errors), [Models and limits](https://jev-ai.pro/docs#models).
Documents checked on: 2026-10-07 (Asia/Seoul).

## Reusing the existing MCP

A run connection that reuses the public Jev MCP was added. For settings, host connection and verification scope, see the [MCP guide](../MCP.md).
