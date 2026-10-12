# D049 verifier handoff — 2026-10-10

Controller environment defect isolated from model quality. New files only; D048 frozen source unmodified.

- `src/orchestration/artifact-verifier.mjs`: `preflightVerifier({python='python3'}={})` performs actual Python imports and smoke AST/TOML parsing. Actual local result: Python 3.10.13, `tomli` fallback. No install required.
- `verifyArtifacts({root,paths,allPaths=paths,maxProjectBytes=4194304,python='python3'})`: checks exact permitted requested files, symlink/hardlink/parent refusal, total present allowlisted project bytes, Python AST and TOML syntax. Missing future paths in allPaths are allowed unless requested. No generated modules or shell scripts are executed.
- Result includes `ok`, `checks`, `errors`, `total_bytes`, `verifier`, `requirements_verified:false`, `independent_grade:'pending'`.
- Invalid syntax/TOML/UTF8, missing files and oversized source are artifact results. Interpreter/import/protocol/metadata infrastructure failure throws `code:VERIFIER_ENVIRONMENT_ERROR` with safe `reason`. Controller must not blame model or request model repair for that error.
- Controller must explicitly run/store preflight before any new model call; verify itself also preflights before checking artifacts.

Verification commands: `node --test test/artifact-verifier.test.mjs` 7/7 pass. Actual subprocess tests parse valid and invalid source, prove a valid `raise RuntimeError` source is never executed, and distinguish missing interpreter. `node --input-type=module -e 'import {preflightVerifier} from "./src/orchestration/artifact-verifier.mjs"; console.log(JSON.stringify(preflightVerifier()))'` returned Python3.10.13/tomli. `git diff --check` passed.

No provider calls, generated file repair, package installation, commit or push. Main owns continuation wiring and preservation of prior known worker receipts/cost/elapsed.
