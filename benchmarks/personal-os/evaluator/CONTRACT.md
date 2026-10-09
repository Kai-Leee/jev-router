# Independent evaluator contract

Revision: `personal-os-evaluator-v1-experimental`, frozen 2026-10-08.
This folder is evaluator-only. It is not an agent implementation task list.
The complete outcome rubric is `rubric.json`; the executable subset is explicitly
identified by `disk.*` IDs. The goal/format may be disclosed; this evaluator,
negative controls, private source map and post-submission adapter may not.

## Isolation, provenance and evidence

Copy only `agent/` into the empty implementation workspace. Record the source
revision and SHA-256 inventory of that packet and this evaluator before a run.
Freeze budget, actual model ID, tool access, selected experiment condition and
environment separately in the root experiment manifest. Never infer model
correctness from historical Personal OS results or prior fixture totals.

After submission, an independent evaluator writes/reviews a small adapter which
maps the operations below to the app's real APIs or CLI. Record its hash and
`adapter_provenance` in the generated report. Adapters are evaluator infrastructure:
they must not implement missing CRUD, recurrence, idempotency, timing, recovery,
or other product behavior. An implementation-agent supplied adapter cannot be
trusted without independent review and a traced sample against the real app.
The scaffold checks actual source files independently and ignores completion
claims. It does not prove the adapter mapping is honest; review and execution
provenance remain necessary. A adapter-only or synthetic fixture run is never
an app result.

Run untrusted app/adapter code only inside isolation with no real Vault,
credentials, personal files, host sockets or unrestricted host mounts. The Python
runner itself is not a sandbox. It creates fresh synthetic folders but cannot
prevent arbitrary adapter code from touching other files. Native checks require
a disposable macOS app/user-data identity and synthetic folders, with no existing
app/service restarted. The evaluator must retain run logs, hashes and screenshots
outside the implementation workspace.

## Adapter protocol

`evaluate.py --submission DIR --adapter FILE --output FILE` executes
`python3 FILE` for a `.py` adapter, otherwise `FILE` directly. No shell expansion
is used. Each invocation receives one JSON request on stdin and returns one JSON
object on stdout; diagnostic logs go to stderr. Requests include `version`,
`op`, `vault_root`, `state_root`, `submission_root`, `now`, and `input`.
All roots are evaluator-supplied isolated paths. `now` is the fixed UTC timestamp
`2026-10-07T15:30:00Z` (2026-10-08 00:30 Asia/Seoul). A new adapter process per
operation does not mean the product must use a process per action; the adapter
may connect to a separately managed test app. It must not read rubric/test code.

The response is `{"status":"ok","result":{...}}` or
`{"status":"rejected","error":{"code":"..."}}`. The result is relevant
only for `view.read`; mutation assertions read the actual Markdown afterward.
A crash, timeout, malformed response or reported rejection of a required valid
operation fails that exercised criterion. An unavailable adapter leaves automatic
behavior checks `not_run`, never pass. `noop_adapter.py` intentionally does nothing
and is a negative control, never an adapter template/reference app.

| Operation | Input and expected observable intent |
|---|---|
| `view.read` | `view`, `date`, optional `scope: "selected-date"`. Return `task_ids`, `today`, `selected_date`, `planned_minutes`. For Today/Week/Calendar the adapter normalizes the selected-date slice only; this does not require the product to hide other dates. Backlog returns all overdue unfinished and undated tasks. Cancelled/archived tasks are excluded from this active-planning snapshot. Reading/navigating does not write any Vault bytes. |
| `task.create` | `request_id`, all task metadata except `id`/`type`, and `notes`. App assigns stable ID. Same request ID and content replay once; distinct request IDs may share title. Invalid duration without start is rejected. |
| `task.update` | `id`, `changes`, optional `expected_sha256` of source record. Stale edits are rejected, preserving external content. |
| `task.transition` | `id`, `state`. Active↔completed, active/completed→cancelled, cancelled→active/archived, archived→active. Other transitions are rejected. |
| `task.move` | `id`, `scheduled_date` (ISO/null). Only active/completed. Same-date move changes no bytes. |
| `task.delete` | `id`, `confirmed` boolean. False leaves records untouched. True removes only the intended task and retains its prior bytes under `.recovery/`. |
| `note.save` | `request_id`, `id` (nullable), `title`, `body`. Explicit save. Wholly blank new note makes no file. |
| `note.rename` | `id`, `title`. Preserve ID/body; do not overwrite another file. |
| `review.save` | `date`, `mood`, `body`. Persist a distinct Daily record. |
| `focus.finish` | `confirmed` and `session` with the documented completed log fields. False appends nothing; identical session replay logs once; changed same-ID content is rejected. |

These are semantic driver actions, not required app function names, endpoints,
internal architecture or instructions for the implementation agent. Independent
adapters map the submitted interface to these meanings. Pure data checks do not
establish that a user can reach the operations through the UI.

## Deterministic subset and scoring

Each `disk.*` case runs in its own newly generated folder and app-state directory.
Cases verify real file content, stable identity, preserved unrelated records,
failure/no-write behavior, append-only logs and computed view output. The fixed
fixtures include Korean text, duplicate display titles, overdue/undated/completed
tasks, a task with start-only time, separated context/category/tags, and an opaque
field/body sentinel that must survive targeted edits.

An empty or missing submission fails `artifact.present`. A nonempty directory is
only artifact presence, not a usability/correctness pass. No-adapter execution
marks behavior `not_run`. The no-op control must fail mutation checks and cannot
produce a full pass. `selftest.py` checks the grader against missing/no-op and
tampered fixtures; it is not an application implementation or correctness test.

Statuses are `pass`, `fail`, `not_run`, `blocked`, `needs_review`. A passed subset
is reported as that subset's pass fraction and execution coverage. A missing
browser/native check remains in the fixed denominator for its tier. No overall
numeric average is emitted because weights and quality tradeoffs are not agreed.
`full_product_verified` remains false while any required criterion is not pass.
The scaffold conservatively reports UI/native/privacy criteria as `not_run`;
there is no CLI flag accepting an app's own claims as evaluator evidence.

The scaffold does not fully automate categories/context CRUD, recurrence,
multi-item partial failure, pointer actions, focus timer state, concurrency,
recovery/publication partial failure, or onboarding. These remain explicit rubric
criteria, not implicit passes. It validates one unsafe symlink target case, not
all filesystem races, crash durability, Sync or external-process atomicity.

## Independent browser and macOS observation

`rubric.json` gives the fixed outcome, required evidence and tier for each check.
For browser checks retain actual interaction logs/screenshots plus before/after
Markdown snapshots where applicable. Test every planning view at 320, 390, 768,
and 1280 pixels; document overflow separately from intentional weekly scrolling.
For native checks retain OS/app identity, packaging/start command, synthetic
folder, lifecycle steps, UI evidence and relevant disk snapshots. A static HTML
check, localhost HTTP success, Linux browser run or source code string cannot
verify native launch, folder dialogs, menu-bar actions or quit/reopen behavior.

Recurrence absence policy is declared before grading; monthly missing-day skip
and ISO weekday encoding are explicit new format assumptions. Accept either
declared absence policy if consistent and safe. Do not retrofit hidden penalties
for visual choices or priorities. New stricter criteria require a new benchmark
revision and both experiment conditions rerun under the same contract.

Source extraction: `docs/agents/personal-os-spec-STATUS.md` is evaluator provenance
only; no old source, task breakdown, runtime state or private records were used.
