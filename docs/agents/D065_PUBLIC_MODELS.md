# D065 model/schema public checks — completed local control evidence

2026-10-10. Ownership follows [D065_PARALLEL](D065_PARALLEL.md). The assigned
**17/17 public IDs now have executable coverage; no assigned ID is missing**.
The shared Harness/Checks and generator hook were coordinated with `d064_mapping`.
That role owns the canonical registry, catalog, inventory, environment and final
public audit; this document does not certify their independent integration state.

## Delivered files and interface

- [schema_models.py](../../benchmarks/e2e-swe/public-checks/extensions/schema_models.py)
  exports `SUITES = {"schema-models": [17 exact IDs]}` and
  `RUNNERS = {"schema-models": schema_model_checks}`. The function receives shared
  `h, c`, uses `h.generate`, and records one `c.case` per ID. Imports at module load
  are standard library only, so `--list` requires no candidate dependencies.
- [d065-models.json](../../benchmarks/e2e-swe/public-checks/fixtures/d065-models.json)
  combines the compatible schema, operation naming, and documentation contracts.
  [d065-models-literals.json](../../benchmarks/e2e-swe/public-checks/fixtures/d065-models-literals.json)
  is generated separately with `config={"literal_enums": True}`. A normal suite
  therefore executes two real generator subprocesses and imports both outputs.
- [d065_models.py](../../benchmarks/e2e-swe/public-checks/controls/d065_models.py)
  exports `build_control_files(document, config, defect)` and `CONTROL_CASES`.
  It recognizes only these two authored public documents, uses the independent
  baseline `templates.source_files`, and emits finite normal/defective controls.
  It is not a general OpenAPI generator or a candidate implementation.

No existing Node test file, public source manifest, shared runner, catalog, source
skill, budget ledger, historical candidate, or product implementation was edited
by this role. New Node tests: **0**. Compatible public cases share fixtures and
helpers rather than generating a separate orchestration test for each ID.

## Source basis and exact coverage

Acceptance sources are the original
[instruction.md](../../.benchmarks/E2E-SWE/tasks/openapi_python_client/instruction.md)
and [D056 public specifications](../../benchmarks/e2e-swe/manifests/d056-obligations.json).
The table records instruction line spans already identified by D056. No hidden
grader or prior candidate source was opened. Required handoff/entrypoint documents
contain historical outcome summaries; those summaries did not supply any input,
expected result, or repair decision for these checks.

| IDs | Executed behavior | Public instruction lines |
| --- | --- | --- |
| `T.R04.06` | Import tagged/default operation modules and verify package/module paths and exported functions | 84–87 |
| `T.R05.01` | Object/enum class, module, export identity and usable values; referenced oneOf/anyOf/multi-type member annotations | 91–95 |
| `T.R05.02`, `T.R05.03` | Inline object/enum/body names, modules, exports, actual typed values, round trips and body parameter type | 96–104 |
| `T.R05.04` | CamelCase JSON round trip and snake_case endpoint keywords in all four functions | 105–108 |
| `T.R08.05`, `T.R08.06` | Object/date reference-chain conversion and annotations; merged constructor fields, required keys and serialization | 158–161 |
| `T.R08.07` | Actual lists, object conversion, scalar preservation and element unions for prefixItems with and without items | 163–165 |
| `T.R09.01` | Untyped/typed/false additional properties and exclusion from constructor parameters | 169–172 |
| `T.R10.02`, `T.R10.03` | Description, Google sections, parameter/body lines, missing-description colon, client exclusion and single/union/Response return documentation for all four functions | 179–180, 188–195 |
| `T.R11.05` | Nullable enums through oneOf and type list, null-only enum, actual enum values and None round trips | 221–223 |
| `T.R12.01` | Literal aliases for string/integer enums, raw model values, serialization and invalid values raising TypeError | 230–233, 322 |
| `T.R13.01` | Required/optional/nullable direct, referenced, allOf-wrapped, oneOf/anyOf/multi-type flattened member annotations | 237–246 |
| `T.R13.02`, `T.R13.03` | Required-key and JSON-shape matching, optional UNSET, and encoding directly constructed concrete model/scalar values | 246–249 |
| `T.integration.unions-arrays` | Imported package, nested referenced/allOf union prefixItems with/without tail type, concrete member matching, flattened annotation, list/scalar/model round trips | All D056 source refs for this combined ID |

The checker compares the AST structure of string annotations without evaluating
them. It flattens unions and ignores member order while preserving container and
member spellings. `additionalProperties:false` accepts either ignoring an unknown
key or rejecting it, as D056 explicitly leaves that choice open.

Original SHA-256 values were checked in the final control run and remain:

- D056 manifest: `c5dbaed1cc4eb286299e7606b1f91cf54065e46e3651d6b372e6e99c819f7ef8`.
- Public instruction: `983112ee5615c227830f968a820bcf3a4b1ef94a80f2efcc57c7d3d6979c5d22`.

## Actual controls and results

[Final raw results](../../benchmarks/e2e-swe/public-checks/controls/d065_models_final_results_v2.json)
record every per-ID assertion, subprocess receipt, actual failed ID, Python
version, and before/after hashes of nine source files. Host Python **3.10.13** was
used; this model suite needs no YAML or transport dependency for the controls.

- Standard positive control: **17/17 IDs, 266 assertions, two successful generator
  subprocesses**.
- Allowed alternative positive: **17/17 IDs, 265 assertions, two successful
  subprocesses**. `models_valid_alternatives` reverses object-union order in model
  annotations and endpoint documentation, and rejects closed-model unknown keys.
  This witnesses that neither valid alternative is accidentally prohibited.
- **17/17 targeted defective controls rejected in their declared public IDs**.
  The catalog export covers all 17 IDs. Typed additional properties and forbidden
  additional properties have separate faults under the same ID because they test
  different behaviors. Some faults also correctly fail related combined cases;
  the evidence preserves all actual failed IDs.
- Skipped cases **0**, unexecuted cases **0**, uncertain outcomes **0**, top-level
  infrastructure errors **0**, source drift **0/9**.

The 17 faults cover missing default API package; wrong named/inline/body exports;
camelCase Python parameter; raw reference-chain object; omitted allOf base field;
ignored prefixItems tail type; raw typed extras; accepted closed extras; missing
docstring colon; wrong detailed return documentation; rejected nullable None;
unvalidated literal values; union alias instead of members; wrong required-key
object selection; and raw object union encoding.

The first run is retained in
[d065_models_results.json](../../benchmarks/e2e-swe/public-checks/controls/d065_models_results.json).
It detected the intended faults, but three export mutations also caused unrelated
literal-fixture generation errors. The renderer initially keyed those mutations
only by a shared `models/__init__.py` path. The mutation is now scoped to its own
document before matching; the final run shows those three controls fail only the
intended IDs. Initial output was not overwritten.

The intermediate
[first final results](../../benchmarks/e2e-swe/public-checks/controls/d065_models_final_results.json)
also remain intact. A source-to-fixture audit then made the combined array fixture
nest its referenced `MultiScalar` inside `oneOf`/`anyOf`/`allOf`, rather than testing
the multi-type schema only in a separate union property. Expected member types did
not change. Both positives and all 17 defects were rerun against that final fixture;
the linked `final_results_v2` pins its exact bytes.

Commands run from `/Users/lee/workspace/plugins/jev-router`:

```sh
python3 -B benchmarks/e2e-swe/public-checks/run_public_checks.py --list
python3 -B benchmarks/e2e-swe/public-checks/run_public_checks.py \
  --suite schema-models \
  --binding benchmarks/e2e-swe/public-checks/bindings/normal.json
```

The full role-specific control run used the following subprocess protocol (saved
results above include all outputs). It can be reproduced without installing
anything; the temporary bindings are removed at exit:

```python
import importlib, json, subprocess, sys, tempfile
from pathlib import Path
p = Path("benchmarks/e2e-swe/public-checks").resolve()
sys.path.insert(0, str(p / "controls"))
controls = importlib.import_module("d065_models").CONTROL_CASES
normal = json.loads((p / "bindings/normal.json").read_text())
with tempfile.TemporaryDirectory(prefix="d065-model-controls-") as temporary:
    for row in [{"defect": "none", "expected_failed_ids": []},
                {"defect": "models_valid_alternatives", "expected_failed_ids": []}, *controls]:
        binding = dict(normal)
        binding["command"] = [sys.executable, str(p / "controls/generator.py"), "--defect", row["defect"]]
        binding["repository_path_arguments"] = []
        path = Path(temporary) / (row["defect"] + ".json")
        path.write_text(json.dumps(binding))
        process = subprocess.run([sys.executable, "-B", str(p / "run_public_checks.py"),
            "--suite", "schema-models", "--binding", str(path)], capture_output=True, text=True, timeout=30)
        result = json.loads(process.stdout)
        failed = {case["test_id"] for case in result["cases"] if case["status"] == "failed"}
        assert result["error"] is None and not result["unexecuted_test_ids"]
        assert result["skipped"] == 0 and not result["outcome_uncertain"]
        if row["expected_failed_ids"]:
            assert process.returncode == 1 and set(row["expected_failed_ids"]) <= failed
        else:
            assert process.returncode == 0 and not failed
        print(row["defect"], result["assertions"], sorted(failed))
```

## Handoff and limits

`d064_mapping` has the exact ID list and can consume `SUITES`, `RUNNERS` and
`CONTROL_CASES` directly. Shared registry/catalog/fixture hash integration and the
final broad audit remain with that owner and root. The alternative valid control
is an extra local checker-sensitivity witness; it is not declared as a defective
catalog entry.

These are **authored-control results**, not successful generation by a real
candidate. Reports deliberately retain `product_certified:false` and
`artifact_revisions:null`. Candidate environment validation, sandboxing, artifact
revision binding, live runner execution and independent product outcome remain
outside this role. There were no provider requests, network-dependent assertions,
installs, recursive delegation, commits, pushes or original Personal OS/Vault edits.
