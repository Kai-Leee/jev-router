# D052 requirement manifest and shared architecture provenance

Date: 2026-10-10. Owner: decomposition_fixture. Status: preparation complete; no inference or candidate execution performed by this role.

The input is [d052-requirements.json](../../benchmarks/e2e-swe/manifests/d052-requirements.json). It contains 20 public requirement sections and 16 unassigned artifact paths. It contains no prepared worker roles, task groups, requirement owners or task dependencies. The builder must ask the decision provider for requirement ownership and artifact ownership separately.

## Source and extraction coverage

The authoritative source is `.benchmarks/E2E-SWE/tasks/openapi_python_client/instruction.md`. Extraction splits the original at its existing Markdown headings, assigns R01–R20 in source order and retains every section verbatim in `requirements[].source`. Acceptance summaries aid navigation; they do not replace the source. Heading boundaries are documentation boundaries, not proposed execution groups.

Measured extraction coverage: 368/368 source lines and 19,656/19,656 UTF-8 bytes. Concatenating the 20 source strings reconstructs the original byte-for-byte. Public source SHA-256 and per-section line ranges are stored in the manifest. No hidden tests, private grader results or generated candidate code were consulted for extraction.

Requirements cover: overall product; offline dependencies; CLI; output layout; naming; runtime types; model behavior; property types; additional properties; docstrings; enums/consts; literal enums; unions; defaults; clients; endpoints; configuration; project metadata; diagnostics; installation.

Reproduce the coverage check from the repository root:

```sh
node --input-type=module -e '
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const m=JSON.parse(fs.readFileSync("benchmarks/e2e-swe/manifests/d052-requirements.json","utf8"));
const s=fs.readFileSync(m.provenance.public_source.path,"utf8");
assert.equal(m.requirements.map(r=>r.source).join(""),s);
assert.equal(createHash("sha256").update(s).digest("hex"),m.provenance.public_source.sha256);
assert.equal(new Set(m.files.map(f=>f.path)).size,16);
assert.equal(m.requirements.length,20);
console.log(m.source_coverage);
'
```

## Reused design, not free-form architecture invention

The 16 file paths and shared API descriptions come from `benchmark-runs/d040-claude-01/frozen-plan.json`. That source is a historically generated architecture. The source path and whole-file hash are stored in the manifest. We remove its task ownership and group dependency assignments, sort the paths independently, and preserve interface facts needed for interoperable workers. The shared IR fields and renderer function contracts are retained in `integrationInstructions`.

`files[].dependency_paths` records known producer/consumer interface facts, such as model rendering consuming IR/type helpers and the generator consuming renderer outputs. These are architectural constraints to validate against the selected ownership, not a copied task DAG. An empty dependency list means no dependency is asserted in this fixture; it does not prove that the file can be implemented independently.

This distinguishes the new experiment from unrestricted task and architecture generation: Jev can choose task count, requirement/file allocation and task dependencies, but cannot invent arbitrary file names through the supplied Choice vocabulary. Historical planning cost was not remeasured during preparation. Report reused preparation and any known historical cost separately; unknown historical cost is not zero. Both comparison conditions must receive the same shared architecture facts.

## Schema and worker contract

- `requirements`: `id`, exact `source`, `source_ref`, `acceptance`, `constraints`, `interfaces`, `gaps`. Empty per-requirement arrays mean no additional extracted facts; full source and global constraints still apply.
- `files`: `path`, `purpose`, `dependency_paths`, provenance. No owner fields.
- `integrationInstructions`: shared API contracts, with no prior owner attached.
- `provenance`, `source_coverage`, `constraints`, `unresolved_gaps`: explicit preparation and measurement boundaries.

Each requirement also has `artifact_paths` (relevant implementation paths) and `required_artifacts` (outputs needed to fulfill its acceptance). These are derived traceability from public behavior to the shared architecture's function responsibilities, not file names mandated literally by the brief. They do not assign any task owner. The accountable task should own at least one relevant artifact; remaining required artifacts must be owned by that task or supplied by a predecessor. This catches unrelated-file ownership and unavailable cross-task evidence, but cannot prove semantic completeness. The global product requirement R01 is anchored to packaging/entry-point accountability without requiring every file as its prerequisite; whole-product verification remains a global check. Each row records this provenance and limitation.

Workers need the complete public specification, their assigned requirement IDs and full source/acceptance criteria, assigned write paths, shared interface contract and dependency artifact references. An assignment must not imply permission to edit another worker's paths. Structural ownership checks cannot prove that assigned files suffice to satisfy each requirement; semantic compatibility remains a validation/replanning concern. This is especially relevant because model, parser and rendering requirements can span several files.

## Verification and remaining work

Fixture validation checks exact reconstruction, source hash, 20 stable IDs, 16 unique paths and valid dependency path references. This establishes extraction integrity only, not routing correctness, runtime interoperability or task quality. Builder tests, scheduler integration and live comparison belong to other D052 roles. No paid calls, candidate containers, original Personal OS changes or Git commits were made by this role. The preparation helper is a temporary local file at `/tmp/build-d052-manifest.cjs`; the JSON and this document are the durable outputs.
