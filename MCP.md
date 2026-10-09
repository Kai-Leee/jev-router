# Existing Jev MCP integration

`freepik-company/jev-mcp` v0.3.1 is reused without source modifications. A Node launcher supplies the Jev AI destination and server-side key. The original direct client remains available for detailed failure diagnostics and billing headers.

Source: https://github.com/freepik-company/jev-mcp/releases/tag/v0.3.1
Provider documentation: https://jev-ai.pro/docs#official-sdk and https://jev-ai.pro/docs#errors
Checked: 2026-10-08, Asia/Seoul.

## Configure the key

Create a Jev AI key at https://jev-ai.pro/jev-api. Edit `/Users/lee/workspace/.env` locally and set `JEV_AI_API_KEY`. This file is parsed as data; it is never sourced as shell code. Only the Jev key is read. The server process environment takes precedence; `JEV_AI_ENV_FILE` can select another private environment file.

For deployment, set `JEV_AI_API_KEY` in the server runtime's secret store and restart the MCP process. This installed binary is macOS ARM64 only; Linux/Windows deployment requires its matching pinned upstream binary and checksum, plus adjusting the launch path. No deployment has been performed.

The launcher maps the key to the upstream MCP's `API_KEY` environment variable. It explicitly sets:

```text
JEV_PROVIDER=typesafe
BASE_URL=https://jev-ai.pro/api
JEV_MODEL=jev-latest
```

`typesafe` selects the compatible wire/catalogue format; the custom base URL sends traffic to Jev AI. TypeSafe and OpenRouter keys and inherited base URL settings are not passed to the child. No SDK is added, because this existing MCP handles transport.

## Verify and make a small decision

```sh
cd /Users/lee/workspace/plugins/jev-router
npm run mcp:config
npm run mcp:tools
npm run mcp:models
npm run mcp:demo -- --spend
```

- `mcp:config`: prints destination and key presence, never the key. It makes no network request.
- `mcp:tools`: initializes the real upstream binary and lists tools. It calls no provider tool. If no key is configured, a non-secret placeholder is used only for this offline protocol check.
- `mcp:models`: calls the MCP's `list_models`, which sends authenticated `GET https://jev-ai.pro/api/v1/models`. No inference is requested.
- `mcp:demo -- --spend`: first discovers models, then makes one small `decide` call using `examples/decision.json`, after the existing Jev AI request validator passes. The command uses the account balance. Without `--spend`, no provider request occurs. Inspect the resolved model, answers and token usage; compare the result with your Jev AI account usage. Missing USD cost is shown as `null`.

Do not infer authentication success from `mcp:tools`. Only a successful authenticated model lookup establishes that connection step; inference is a separate check.

## Connect a host without global configuration changes

The local `.mcp.json` contains a secret-free Claude MCP entry. To select it explicitly:

```sh
claude --mcp-config /Users/lee/workspace/plugins/jev-router/.mcp.json
```

For Codex, use per-launch overrides:

```sh
codex -C /Users/lee/workspace/plugins \
  -c 'mcp_servers.jev_ai.command="node"' \
  -c 'mcp_servers.jev_ai.args=["/Users/lee/workspace/plugins/jev-router/bin/mcp-server.mjs"]'
```

A local `.codex-plugin/plugin.json` is also provided for packaging; no global marketplace or user MCP configuration is changed by this work. The current chat's tool list does not automatically gain a newly installed MCP. Native host discovery/trust must occur in a new host session. The CLI helper already exercises the same binary over stdio.

Available upstream tools: `decide`, `classify`, `verify`, `rerank`, `list_models`. The first four make paid inference calls. Jev judgments are not tests or approvals. No automatic paid retries are made.

## Limits and error handling

The Jev AI API body limit is 256000 UTF-8 bytes; at most 64 questions, question IDs at most 64 characters, choice options 2–255, and score levels 2–10. These are provider-documented limits, not measurements. The example helper reuses `prepareDecision` to enforce them. The unmodified MCP's general transport accepts up to 1 MiB; callers using tools directly must obey Jev AI's stricter limit, or the service can return 422. The local helper does not intercept every native host tool call.

The upstream request deadline is 30 seconds, redirects are refused, and paid calls are not retried. On 401/402/404, correct credentials/balance/path. On 422, fix the request instead of replaying it. On 429, honor `Retry-After`; on confirmed 502/503 failure, use bounded backoff. For timeout, lost connection, invalid response, or 504, inspect account usage and run outcome before another POST.

Known upstream limitation: provider errors expose their status but not `Retry-After` or billing response headers. The helper deliberately reports a tool failure conservatively and does not replay it. Use the existing direct client (`npm run models`, `npm run demo -- --spend`) when those diagnostics are needed; do not run a second demo to diagnose an uncertain first POST. Upstream raw decision JSON preserves missing `usage.cost`; the helper never treats it as zero. This is a transport integration, not a verified billing dashboard or automatic recovery service.

## Verification

Release archive SHA-256: `2b0320b79809b92106196b06255049a23ce271c17ba8f5b2580827e5ff6eb6b5`.
Installed binary SHA-256: `955384ed3d1d3c9f8131fb4f3deed6c87d0400113c610367af2b44a899dd8bbc`.
The launcher checks the installed binary digest before starting it.

`npm test` runs the existing client tests plus a real MCP binary against a localhost mock API using a fake credential. The integration test observes actual requests: initialization/tool listing sends no provider request; model discovery sends GET `/v1/models`; `decide` sends POST `/v1/systemone` with the expected Bearer header and JSON; 429 and 504 each produce one request, without retry; a credential echoed in an error body does not reach the caller. This is protocol/transport evidence, not real Jev inference.

Initial sandbox verification could not bind the localhost mock server (`listen EPERM`). The same test passed with the required local-network permission. No test was silently skipped to obtain a passing result.

Existing plugin inventory caveat: `codex mcp list --json` and the inspected Claude config had no Jev entry. The current session exposed no Jev tool. `codex plugin list --json` failed because the existing `personal` marketplace root lacked a supported manifest; that unrelated configuration was not modified.

At initial integration, authenticated model discovery and inference were pending because `keyConfigured=false`.
During the 2026-10-08 status check in this chat, configuration reported `keyConfigured=true` and both
`npm run models` and `npm run mcp:models` completed authenticated model discovery. `npm test` passed
22/22 checks. No live decision POST, deployment, or native-host E2E was performed by those checks.
See [verification history](VERIFICATION.md) for the distinction between initial and current evidence.
