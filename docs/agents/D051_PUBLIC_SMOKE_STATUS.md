# D051 public generated-client smoke — 2026-10-10

Implemented new `src/orchestration/public-smoke.mjs`; no frozen runner edits. Export `runPublicSmoke({root,outputDir,imageLock,requiredPaths=[],timeoutMs=180000})`. Fresh outputDir required. Root copied into an isolated container, never edited on host. No API/model calls or budget edits.

Source is exclusively public instruction: original `instruction.md` command-line syntax, setup.sh, JSON/YAML reading, package layout. New hand-authored Widget OpenAPI3.0.3 input uses a required integer id, optional string label, and one GET operation returning an array of Widget. No hidden test body or oracle read.

Helper calls pinned adapter start-agent with OpenAPI manifest/image lock; validates image ID and offline container settings. Further caps: 2CPU,2GiB,128pids; no host mounts. Copies candidate, executes its setup.sh, invokes pyclientgen for JSON and YAML with meta none, checks required layout and AST parses generated Python. Reports bounded command stdout/stderr and generated-file syntax diagnostics. It does not import generated clients or establish functional completeness. All output stays private.

Partial packaging / missing requiredPaths => applicable:false,ok:null,status:not_applicable, no Docker. Caller must not interpret this as quality pass. Applicable outcomes: passed/artifact_failed/environment_error. Environment failure must not be confused with a model defect. Cleanup failure changes result to environment_error; a Docker permission error cannot serve as proof of container absence.

Tests: `node --test test/public-smoke.test.mjs`7/7 passed. Test doubles cover resource/cleanup commands, artifact syntax failure, timeout, missing packaging, missing cleanup proof. Actual host Python parses the complete helper script.

Actual pinned offline Docker controls:
- `benchmark-runs/d051-public-smoke-controls/good-docker-result/result.json`: passed,13.3836s, JSON/YAML each generated6valid Pythonfiles,container removed.
- `benchmark-runs/d051-public-smoke-controls/bad-docker-result/result.json`: artifact_failed,5.1630s, invalid generatedclient.py raised SyntaxError for both JSON/YAML,container removed.
These are authored transport controls, not benchmark model quality outcomes. The positive fixture only implements enough behavior to exercise the smoke machinery.

Earlier restricted-sandbox attempts reported infrastructure errors and were preserved under good-result/bad-result. Their initial container_removed flag was unreliable because generic inspect failure was treated as absence; this implementation defect was corrected and regression-tested. Those historical flags are not cleanup evidence. Successful escalated Docker runs above confirmed their own cleanup.

No installs, paid calls, commits or push. Main owns live integration and final independent grading. Public smoke is intentionally narrow; independent63-case grader remains authoritative.

## Expanded public behavioral smoke (supersedes initial minimal scope)

Root found the old Claude candidate passed the initial syntax-only smoke despite remaining faults. That pass is preserved as evidence that the initial smoke was insufficient, not benchmark quality evidence.

Expanded public-only schema now includes Status enum containing `navigator's choice`, nullable enum, Widget scalar properties, and Defaults with integer default string29, floating default string8.375, boolean default stringFalse, string-list default[violet,copper]. Runs JSON, YAML, and JSON with literal_enums configuration. In each isolated container it imports generated models and checks scalar/enum/null round-trip, required-key error, optionalUnset omission, string annotations, invalidenum rejection, and typed defaults. This supersedes the earlier statement that smoke never imports generated modules; import/execution is restricted to the bounded offline container, never host.

Actual new controls:
- `benchmark-runs/d051-public-smoke-controls/v2-good-result/result.json`: pass across all3variants,3.5835s,container removed.
- `benchmark-runs/d051-public-smoke-controls/v2-bad-result/result.json`: generated integer default intentionally remains string; all3behavior variants fail at explicit integer-type assertion,2.7799s,container removed.

These authored fixtures validate checker behavior, not the implemented benchmark model. No hidden test data or internals were used. Original minimal control records remain unchanged. Independent grading remains necessary.
