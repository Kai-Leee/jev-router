# D048 transport handoff — 2026-10-10

Implemented, local protocol tests passed; no provider call by this agent. Goal: persist individual files through scoped tools, so a final whole-project JSON response no longer gates every artifact.

## Owned files and interface

- `src/orchestration/artifact-transport.mjs`: `createArtifactSession(config)` and `artifactTools`.
- `bin/artifact-worker-mcp.mjs --config /absolute/config.json`: newline JSON-RPC stdio server, initialize/ping/tools/list/tools/call.
- `test/artifact-transport.test.mjs`.

Config: `{root, allowedPaths, readablePaths=allowedPaths, journalPath, maxFileBytes=262144, maxTotalBytes=2097152}`. Root must preexist, be canonical absolute path, and belong exclusively to this benchmark candidate. Journal parent must exist; journal path must be outside root and is opened exclusively. New process/repair requires a new journal. Previously written permitted files may be replaced. `readablePaths` may additionally expose dependency source files; no write access follows from read access.

Session methods: `writeFile({path,content})`, `readFile({path})`, `status()`, `dispatch(message)`, `close()`. Write returns `{path,bytes,sha256}` only after atomic replacement and fsynced finished journal event. Read returns `{path,content,bytes,sha256}`. Status returns expected paths, persisted files with hashes, missing paths, bytes and limits. Presence is not code correctness. Every write has started/finished events with timestamp/sequence/hash; journal has no content or credentials. Interrupted write may leave started without finished; recheck filesystem rather than assuming receipt completion.

Exact path allowlists, traversal checks, symlink parent/file refusal, hardlink refusal, no-follow reads, exclusive temporary writes/atomic replacement, per-file and per-session assigned-file byte caps are enforced. This is a controller-owned local directory protocol, not a hostile same-user-process sandbox: filesystem ancestor mutation by another local process is outside its guarantee. Workers have no shell tool or arbitrary path configuration.

## Controller integration

MCP config:

```json
{"mcpServers":{"artifact_worker":{"command":"/absolute/node","args":["/absolute/jev-router/bin/artifact-worker-mcp.mjs","--config","/absolute/session-config.json"]}}}
```

Verified available via local `claude --help` and existing `src/benchmark/launch.mjs` pattern:

```text
--tools '' --strict-mcp-config --mcp-config FILE
--allowedTools mcp__artifact_worker__write_file,mcp__artifact_worker__read_file,mcp__artifact_worker__status
--permission-mode dontAsk --permission-prompts none
```

Retain existing restricted/model/effort/settings isolation flags. Instruct worker: use write_file for each file; read dependencies as needed; check status; final answer brief summary only. Controller must not JSON.parse final prose into artifacts. Final provider usage receipt is still needed for accounting. No Claude tool-loading/live invocation verified by this agent; main owns that check.

## Verification

`node --test test/artifact-transport.test.mjs`: 7/7 passed. Covers actual child-process MCP exchange, successful persisted write/read/hash, missing-path status, replacement accounting, UTF-8 byte limit, aggregate limit, traversal/extra keys, symlink parents/files, hardlinks, read-only dependencies, exclusive journal restart, closed session. `git diff --check`: passed. No network, Docker, paid calls, commits or push.

Remaining: main integrates and executes matched cohorts; independent grader judges generated source. Tool outputs may still hit model limits per call; cap rejects oversized complete files, preserving prior completed files. This change does not assert model quality or eliminate all output limits.
