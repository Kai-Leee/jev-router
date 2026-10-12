# Public executable checks (D065)

The immutable D056 manifest has 85 public test descriptions. Seven suites now give every ID a substantive executable case, using only the original instruction and its public D056 scenarios. `inventory.json` preserves each exact source span and requirement mapping; `registry.json` contains executable metadata accepted by `publicCheckMapping`. A mapped ID does not certify an implementation.

| Suite | Public IDs | Main observable behavior |
| --- | ---: | --- |
| runtime-model-core | 15 | Generated runtime, typed model fields, round trips, additional properties and docstrings |
| enums-defaults | 10 | Enum values and naming, typed defaults, combined defaults round trips |
| cli-layout | 6 | Package/project paths, metadata-free layout, overwrite behavior |
| diagnostics | 5 | Warning severity, schema omission, surviving output, circular and malformed document errors |
| schema-models | 17 | Inline models, naming, allOf/oneOf/anyOf, literals, nullable refs, prefixItems and nested arrays |
| http-client | 17 | Sync/async httpx operations, escaping/query/body/media/status handling, client options and hooks |
| cli-config-environment | 15 | Installed console CLI, real offline setup, dependencies and parsers, metadata/config matrix and combined diagnostics |

Run the mapping/source audit without executing code:

```sh
node scripts/audit-dag-public-checks.mjs
```

Run all normal cases and the 81 distinct semantic defective controls in the pinned image:

```sh
node scripts/audit-dag-public-checks.mjs --controls
```

Run fresh normal cases plus verify the frozen full control receipt at the exact current sources:

```sh
node scripts/audit-dag-public-checks.mjs --normal-controls --verify-frozen
```

The full control command requires the existing Docker image named in `environment.json`; it does not pull an image or download dependencies. It creates a named container with network `none`, read-only root/checker mount and executable temporary storage (`/tmp:rw,exec,size=2g`). Setup runs on a copied project in a fresh virtual environment with preinstalled system packages. `PIP_NO_INDEX=1`, actual editable/no-build-isolation argv, installed entrypoint source, interpreter prefix and installation directory are checked. The entrypoint metadata probe runs in a newly created empty directory so a source checkout at the inherited cwd cannot shadow the editable install. Its actual cwd and resolved module are retained; CLI controls start from their original callable package root to exercise this layout. A local loopback HTTP server tests URL input; generated transport checks use `httpx.MockTransport`. Docker inspection and confirmed removal are part of the receipt.

The Python runner itself is not a sandbox. Run a real candidate only through the contained D065 runtime using `bindings/candidate.example.json` semantics: `kind: candidate`, `candidate_root: /candidate`, environment `e2e-swe-public-python/v2`. No authored control overlay is allowed for that binding. Each suite consumes the whole assembled candidate and installs its actual `setup.sh`; the filesystem runtime separately binds exact artifact/checker/fixture/environment revisions.

`--only-test-id` selects a declared negative-control witness. Its report is explicitly `scope: targeted_control`; full candidate runs omit it and must return all suite IDs with no skips. Normal controls always execute every ID. Targeted negatives avoid rerunning unrelated cases while still generating and inspecting defective output.

The bundled generators emit finite known fixtures and are deliberately incomplete implementations. Their passing results validate these checkers only. Current check version3 uses the source-hashed full receipt `results/d065-local-controls-v3.json`; it is invalidated by changes to executable code, fixture/binding/catalog/environment files, the public manifest or instruction. Default Node regression checks validate that receipt and run a small fresh normal/defective witness. They do not repeat the full Docker matrix on every `npm test`. Version2's `results/d065-local-controls.json` remains historical evidence for its original source hashes. Environment and candidate binding versions remain unchanged.

D064 history is preserved in `results/d064-local-controls.json`, `docs/agents/D064_PUBLIC_CHECKS.md`, and the pre-edit snapshot `benchmark-runs/d065-preflight/public-before`. D065 setup attempts, limitations and the exact test consolidation map are in `docs/agents/D065_PUBLIC_CHECKS.md`. The version2 entrypoint cwd false rejection, untouched candidate, narrow before/after proof and preserved sources are recorded under `benchmark-runs/d065-postcheck/entrypoint-origin-*`; those diagnostics do not resume or rewrite the original workflow.
