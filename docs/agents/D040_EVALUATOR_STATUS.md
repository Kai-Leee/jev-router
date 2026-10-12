# D040 evaluator status

Owner: evaluator agent. No paid inference. Do not copy evaluator-only source into worker prompts.

## Completed preparation

- Added explicit `--manifest` before adapter subcommand; default remains pytest-check.
- OpenAPI task pinned to existing upstream commit `b11ac067b1dfe8ce8b6db245d88756f426007797`; 8 source file hashes verified.
- Image lock: `benchmark-runs/d040-openapi-image-lock.json`; amd64 image retained, 386327984 bytes.
- `python3 -m unittest discover -s benchmarks/e2e-swe -p test_adapter.py`: 18 passed.
- `git diff --check`: passed.
- Empty implementation: `benchmark-runs/d040-grade-noop/result.json`, completed, 0/63, reward 0, verifier removed.
- Oracle control: `benchmark-runs/d040-grade-oracle/result.json`, completed, 63/63, reward 1, verifier removed.
- Final evaluator gate: PASS. Both expected control outcomes observed. Main may proceed with the authorized bounded live comparison; this gate proves evaluator controls, not candidate quality.
- No-op elapsed 14.647081790986704 s; oracle elapsed 51.81326404202264 s. These are evaluator wall times, not agent generation times.

## Grade command for generated candidates

```sh
python3 benchmarks/e2e-swe/adapter.py --manifest benchmarks/e2e-swe/manifests/openapi_python_client.json grade --workspace PATH_TO_NEW_CANDIDATE --image-lock benchmark-runs/d040-openapi-image-lock.json --output NEW_RESULT_DIRECTORY
```

## Side effects

Downloaded image and evaluator-only clone/control artifacts retained under ignored local paths. Only newly created verifier containers are removed. No application/Vault changes, commit, push, model calls, or credentials accessed.
