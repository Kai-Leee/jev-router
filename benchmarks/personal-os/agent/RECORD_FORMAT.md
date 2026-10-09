# External Markdown record format

Version: `personal-os-records-v1`. This format is an experimental interoperability
choice for this workload. It is not compatibility with any previous application.
Internal storage/indexing/framework decisions remain yours; these Markdown
records are the source of truth and must remain usable without the app.

All paths below are relative to the folder explicitly selected by the user.
Text is UTF-8. A record begins with `---`, one field per line in the form
`key: JSON-value`, then `---` and ordinary Markdown body text. This is a constrained
YAML frontmatter subset: JSON strings, arrays, objects, numbers, booleans and null
are allowed; multiline YAML, anchors, duplicate keys, NaN, and Infinity are not.
Ordering of fields is immaterial. Preserve unknown frontmatter fields and body
content during edits which do not target them. New IDs are unique and stable,
using only ASCII letters, digits, underscores and hyphens. File identity is not
inferred from its display title.

## Tasks

`Tasks/<id>.md` has these required fields:

| Field | Value |
|---|---|
| `type` | `"task"` |
| `id` | Stable task ID matching the filename |
| `title` | Nonempty string; independent tasks may have the same title |
| `state` | `"active"`, `"completed"`, `"cancelled"`, or `"archived"` |
| `scheduled_date` | ISO `YYYY-MM-DD` or null for unscheduled |
| `priority` | `"P1"` through `"P4"` |
| `context_id` | ID of one project/area, or null |
| `category_id` | ID of one user category, or null |
| `tags` | Array of distinct nonempty strings |
| `start_time` | Local `HH:MM` or null |
| `duration_minutes` | Positive integer or null; non-null requires `start_time` |
| `recurrence` | null or one of the objects below |

The body is the task's note. Scheduled date and completion state are independent.
Start-only and untimed tasks contribute zero planned minutes. A time range is a
start time plus duration; no end-before-start or implicit overnight duration is
required by this experiment. Moving a task changes `scheduled_date`, preserving
ID and all other metadata and notes. Task ordering on disk is not view ordering.

For this experimental contract, the selected-day planned total sums durations of
active and completed tasks for that date; cancelled and archived work is excluded
from this active-planning total. A separate history view may still show it.
State changes supported by this format are active to completed/cancelled,
completed to active/cancelled, cancelled to active/archived, and archived to active.
Other direct state changes are rejected. This explicitly chosen state model does
not prescribe the arrangement of UI controls or application code.

Recurrence objects are `{"kind":"daily"}`, `{"kind":"weekdays"}`,
`{"kind":"weekly","weekdays":[1,3]}` (ISO Monday=1 through Sunday=7), or
`{"kind":"monthly","day":15}`. Empty/duplicate weekly days and invalid days
are rejected. Dates are local to Asia/Seoul. The next date is strictly after the
completed occurrence. A monthly rule skips months lacking the requested day.
The absence of a preexisting Daily record is an unresolved product choice:
document whether you create needed records or reject without completing the
occurrence. Both declared choices are acceptable in this experiment, with no
silent duplicates or partial success hidden from the user.

## Projects, areas and categories

`Projects/<id>.md` and `Areas/<id>.md` use `type: "project"` or `"area"`, `id`,
and nonempty `name`. The body is free-form Markdown. A context ID is unique across
projects and areas. `Categories/<id>.md` uses `type: "category"`, `id`, `name`,
and `color: "#RRGGBB"` (case-insensitive hex). Category names are unique after
trimming and Unicode case folding. Context, category and tags remain separate.

## Quick notes and daily review

`Notes/<title>.md` has `type: "note"`, `id`, and `title`; its body is note text.
Titles may contain Korean and spaces, but no path separators, control characters,
`.`/`..`, or leading/trailing whitespace. Rename preserves ID and body, changes
the title and filename together, and never replaces another existing note.
A blank unsaved new note produces no file.

`Daily/YYYY-MM-DD.md` has `type: "daily"`, `date`, and `mood` (string or null).
Its body is the daily review. Task notes, quick notes, and daily review are distinct.
A task can be created for a date with no previous Daily record.

## Completed Focus logs

`Time Logs/YYYY-MM-DD.md` begins with a Markdown heading. Each completed session
appends one fenced `personal-os-focus` block containing a JSON object with
`session_id`, `task_id`, `date`, `started_at`, `finished_at`, and `elapsed_seconds`.
Times are RFC 3339 UTC timestamps with a `Z` suffix; elapsed seconds are a
nonnegative integer. Paused/closed intervals do not count as work. A session ID
occurs once across the folder. Repeating the identical finish request is a safe
replay; changed content with an existing session ID is rejected. Existing bytes
remain an unchanged prefix when a new session is appended.

## Editing, recovery and optional data

An edit based on stale record content is rejected visibly and preserves the
external edit. Before a confirmed deletion, retain the original bytes at
`.recovery/<unique-operation-id>/Tasks/<task-id>.md`. Recovery of other successful
edits may use the same scheme or a documented equivalent that preserves previous
content. Derived views are disposable and must not become the only stored copy.
No generated data or app state may cause records to be silently rewritten during
opening, browsing, filtering, cancelled dialogs, or same-date moves.

Malformed/unreadable records and unsafe/symlink targets must cause an explicit
error for affected mutations. No write is allowed outside the chosen folder.
Layout, window preference, and incomplete Focus checkpoints are local app state;
their format is intentionally unspecified and they are not completed time logs.
The `synthetic-vault/` folder is an example, not the only permitted data size,
names, task IDs or dates.
