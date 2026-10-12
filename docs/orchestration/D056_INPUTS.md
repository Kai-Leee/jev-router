# D056 — public obligation and test-specification input

Date: 2026-10-10. Fixture owner scope: the manifest, its reproducible builder, its fixture tests, and this document. Direction: [D055](D055_RECURSIVE_TASK_TESTS.md), [D056 role contract](../agents/D056_RECURSIVE_PLANNING.md). The fixture supplies source-backed choices to recursive planning; it does not assign tasks or run product tests.

## Frozen inputs and permitted preparation

Only two source inputs are used:

| Input | SHA-256 | Role |
| --- | --- | --- |
| `.benchmarks/E2E-SWE/tasks/openapi_python_client/instruction.md` | `983112ee5615c227830f968a820bcf3a4b1ef94a80f2efcc57c7d3d6979c5d22` | Authoritative public product behavior |
| `benchmarks/e2e-swe/manifests/d052-requirements.json` | `b0c0111140bb5351b31511205f984266eb48680cce4e05df8ff851df4cb4fa62` | Existing public section IDs, disclosed artifact relevance, and shared interfaces |

The D052 manifest itself identifies its file/interface architecture as reused historical generated design. D056 retains that provenance; the referenced historical plan and generated candidate were not opened. No hidden test, grader implementation, generated benchmark candidate, API, original Personal OS file, commit, or push was used in fixture preparation. Source/case authoring and review are preparation work with unmeasured labor cost; they are not cost-free Jev generation.

## What the fixture contains

`benchmarks/e2e-swe/manifests/d056-obligations.json` contains 80 authored behavior/clause atoms and 85 separate test specifications: one specification per atom, plus five cross-atom specifications for defaults, union/array composition, transports, configuration/layout, and diagnostics. These five cross-atom specifications are test mappings, not proposed child tasks or grouping choices.

| Public section | Atom count | Main behavior boundaries |
| --- | ---: | --- |
| R01 product goal | 3 | Package goal, console entry point, transport/equality/formats |
| R02 dependencies | 3 | Offline boundary, available libraries, dependency declarations |
| R03 command line | 6 | Source exclusivity, output/meta, config, overwrite, warnings, parser suffix |
| R04 layout | 6 | Names, package-only/project paths, runtime/model/API modules |
| R05 naming | 4 | Named classes, inline properties, inline bodies, Python/JSON names |
| R06 runtime types | 3 | Unset, File, Response |
| R07 models | 4 | Constructor/equality, serialization, mapping errors, class annotations |
| R08 property types | 7 | Scalar/formatted values, object references, arrays, ref chains, allOf, prefixItems |
| R09 additional properties | 2 | Storage/schema conversion, mapping and round-trip |
| R10 docstrings | 3 | Models, endpoint arguments, return variants |
| R11 enums/const | 6 | Enum values, string/integer/override names, nullability, constants |
| R12 literal enums | 1 | Alias/raw-value/error behavior with the configuration cross-reference |
| R13 unions | 3 | Annotation/reference inlining, decode matching, encoding |
| R14 defaults | 4 | Formatted objects, numeric strings, boolean strings, allOf enum reference |
| R15 clients | 3 | Constructors, httpx storage/getters, configuration helpers |
| R16 endpoints | 10 | Four functions, path/query, three body units, media header, dispatch, documented/unexpected responses |
| R17 configuration | 3 | Hooks, class/module overrides, field prefixes |
| R18 metadata | 3 | Poetry, setup/pdm/uv, no metadata |
| R19 diagnostics | 5 | Unsupported schemas, cycles, syntax, OpenAPI validity, Swagger |
| R20 setup | 1 | Offline editable local installation without build isolation |

The count is a preparation choice, not measured optimal granularity. A combined unit retains closely related alternatives, such as all four public boolean spellings, instead of creating many trivial items. Global product statements and detailed clauses can overlap semantically; repeated source statements do not establish independent implementation work.

## Contract and source evidence

The schema is `jev-recursive-task-test-input/v1` with the role contract's common fields:

```text
goal, source, obligations[], tests[], constraints[], interfaces[], provenance

obligation:
  id, requirement_id, title, text, source_ref, source_span,
  inputs[], outputs[], write_scope[], depends_on[], gaps[],
  context_refs[], dependency_assertion, dependency_note, write_scope_provenance

test specification:
  id, requirement_refs[], scenario, input, expected, scope,
  runner_ref: null, status: not_run, source_refs[], provenance
```

`source.text` stores the complete 368-line, 19,656-byte UTF-8 instruction, with its final newline. Ordered `sections` retain all 20 public section IDs and reconstruct the entire source. Each obligation's `text` is an exact inclusive line excerpt, including original newlines. `source_ref` records the file identity and one-based start/end lines; `source_span` records zero-based half-open UTF-8 byte bounds and an excerpt hash. Byte positions are not character offsets or token measurements.

Several clauses share a source line. Their line excerpts therefore overlap, while titles and source-backed acceptance cases identify the distinct behaviors. Byte reconstruction uses the disjoint ordered section spans, not a concatenation of overlapping obligations. A planner must partition obligation IDs and preserve shared-file coordination rather than infer independence from separate IDs.

`context_segments` account for headings, blank lines, table headers and connective material outside primary excerpts. The optional configuration introduction on line 317 is also carried by R03.03; the literal-enum cross-reference on line 322 is carried by R12.01. Lines 329–330 explicitly describe optional, nonrequired passthrough features; they remain in the full source/context and are not promoted into mandatory product work. Every source line belongs to a primary clause excerpt or a disclosed context segment. Coverage of lines is an integrity measurement, not proof of adequate semantic tests.

Each obligation carries an authored input scenario and expected observable output. Each test repeats the relevant acceptance case in the separate test list, links all its obligation IDs, and supplies original-source refs plus derivation provenance. Concrete dates, UUIDs, controlled transports and small combination cases are **authored examples derived from the public specification**. They are not quotations from hidden tests or observations of a generated implementation. Public examples such as integer `"4"`, number `"5.5"`, enum naming and false spellings remain explicit.

Where the public brief leaves a detail open, the test specification does too: the exception type for a non-mapping model input, rejection versus ignoring under `additionalProperties:false`, and backend table details of pdm/uv are not invented. A runtime test author will still need actual fixtures, assertions and adapters.

## Write scopes, interfaces, and dependency limits

Every `write_scope` is copied conservatively from the D052 requirement-to-artifact relevance map, with that exact source hash. This does not prove that every listed file needs an edit or that a clause's listed files are sufficient for its entire behavior. In particular, R01's packaging/entry-point map is a global accountability anchor; it is not evidence that all client behavior lives in those files. Different obligations frequently share potential write paths. The planner/executor must resolve overlaps and current artifact state before granting execution.

`artifact_interfaces` preserves 16 existing file purposes and known file-level producer/consumer dependency paths; `interfaces` preserves the shared interface text. This is architecture reuse, not Jev invention. No task IDs, groups, owners, or model roles are imported.

Obligation-level dependencies are **unasserted**, represented by `depends_on: []`, `dependency_assertion: "unasserted"`, and a matching disclosure. Empty arrays do not mean independence. Known file dependencies and overlapping potential writes remain visible; semantic implementation ordering has not been established by this fixture. The planning engine must not convert these facts into a claim of parallel readiness.

All 85 tests have `runner_ref: null` and `status: "not_run"`. Their `scope` indicates intended future test scope only. No source transformation, string-content assertion, model choice, or structurally valid plan changes that status into executed or passed.

## Reproduction and actual verification

From the repository root:

```sh
node scripts/build-d056-obligations.mjs
node scripts/build-d056-obligations.mjs --check
node --test test/d056-obligations.test.mjs
```

The first command writes only the owned manifest and rejects drift in either frozen input. `--check` is read-only and compares the entire reproducible serialization. The fixture test suite can validate the embedded source without the ignored benchmark clone; the separate original-file comparison explicitly skips only if that public clone is absent. In the recorded local run the original file was present and no test skipped.

Measured on 2026-10-10: generator `--check` succeeded; fixture tests **32 passed, 0 failed, 0 skipped**. Actual original-file comparison, UTF-8 span/hash checks, whole-source reconstruction, all 20 section links, 80 atom IDs and 85 authored specification links passed. No product test executed.

Negative controls reject modified source/hash, changed inherited architecture, a missing source section, corrupted byte span/excerpt, missing or duplicate behavior IDs, altered context, a huge invalid line range, missing unit/cross-atom test specifications, valid-ID-but-wrong test mappings, weakened default/prefixItems cases, invented runners/pass states/completeness, invented independence, preassigned owners and missing write-scope provenance. The first generation attempt exposed one unclassified blank line (74); its formatting context was added before the recorded passing run.

The tests checking authored expected text establish that these declared cases have not silently drifted or disappeared. They do **not** show that an executable test catches a bad Python implementation. No hidden-test coverage percentage, semantic completeness percentage, model quality, useful final task granularity, product completion, or efficiency improvement is claimed.

## Remaining work and handoff

Root and the engine/reviewer roles own recursive-plan integration, per-node evidence projection, conflict/limit handling and live inference. The complete fixture includes audit metadata that does not all need to be copied into each model request; relevant exact clauses, necessary context, acceptance expectations, shared interfaces and unasserted-dependency facts must remain available. The fixture's file size is not a model-token count.

After planning, actual executable tests and independent product evaluation are separate work. Negative implementation controls, derived-example adequacy and ambiguous combinations require that later execution stage. Keep source versions and test expectations fixed across a measured comparison; a revised source or authored case set is a newly identified preparation condition.
