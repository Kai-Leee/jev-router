# Personal OS product specification

Create the product described below in the provided empty application workspace.
Choose your own architecture, implementation plan, and development sequence.
The only supplied product material is this specification, RECORD_FORMAT.md, and
synthetic-vault/. Do not seek an existing app implementation or private records.

## Product goal


Create a private, local Personal OS for one person to plan daily and weekly work, arrange a monthly calendar, manage unscheduled work, focus on a chosen task, and review planned versus actual time. It should feel like a coherent personal task and focus application with Korean-facing labels. A user-owned folder of human-readable Markdown records is the source of truth and remains usable outside the app. The application must provide a usable macOS desktop experience and responsive planning views.

### Observable acceptance outcomes

| Product capability | Result a user or independent evaluator can observe |
|---|---|
| Calendar and navigation | Today, Week, Calendar, and Backlog are directly reachable. Selecting a date changes the relevant task list and task-creation date. Today is computed in Asia/Seoul and remains distinct from the selected date. Adjacent-month dates show their tasks and can be selected. Merely browsing dates or views does not change source records. Monthly and weekly mixed lists show unfinished items before completed items; display sorting does not reorder Markdown. |
| Task entry | A task stores its title, chosen date, priority P1–P4, and context. It supports a time range, a start time without a duration, or no time. A start-only task contributes zero planned minutes; duration without a start time is rejected. A task without a time is described as time-unspecified. Saving a task for a date with no prior records works. Successful entry permits immediate next entry; failure preserves the draft. Repeated activation of one pending submission creates one task, while independent submissions may share a title. |
| Task states and editing | Active tasks can be completed, renamed, cancelled, or deleted. Completion can be undone. Cancellation is distinct from deletion; cancelled work can be restored or explicitly archived, and archived work can be restored. Only legal actions for the current state are available. Deletion requires confirmation and removes only the intended task, with recovery evidence. Task notes save and survive reopening. A completed title remains readable without a strike-through. |
| Rescheduling and Backlog | Dated active and completed tasks can move to another date or become unscheduled; their identity, metadata, and completion state remain intact. Cancelled and archived tasks do not move. Backlog exposes undated work and overdue unfinished work. Single and multiple overdue tasks can be rescheduled explicitly. A same-date move makes no change. If a batch stops after some successful moves, the user sees which work moved and which remains, without an automatic retry. |
| Direct manipulation | Selecting a task or dropping it onto Focus selects the focus target without starting the timer. Dropping an eligible task onto a calendar date changes its scheduled date. Category drops change the category. These destinations have distinct effects. Rescheduling by drag does not unexpectedly change the selected date, displayed month, or weekly range. A menu-based date-change alternative is available. |
| Recurrence | A user can reveal optional recurrence details and use the supported daily, weekday, weekly, and monthly rules. Completing a recurring occurrence produces at most one next occurrence with a distinct task identity. Invalid recurrence or a failed next-occurrence operation cannot silently produce duplicate or falsely completed work. Declare the absent-next-date policy described in RECORD_FORMAT.md. |
| Context and category | Projects/areas, one optional user category, and multiple tags remain distinct attributes. Creating a project or area adds a corresponding Markdown record and a selectable context. Users create and edit category names and colors; assignment appears consistently across planning views. An unassigned task has a consistent fallback presentation. Filters change the view without changing records. Invalid color input, duplicate names, and stale edits are rejected without overwriting newer records. |
| Focus and time | The focus target, goal duration, elapsed time, and ready/running/paused state agree. Selecting a target does not start it. Start, pause, and resume preserve elapsed time correctly. Confirming session completion appends one time record; dismissing the confirmation appends none. A repeated completion attempt does not duplicate the same session. Planned and actual time remain separate, including a running session in the visible actual-time total. |
| Reopening the desktop app | Normal quit/reopen preserves the chosen folder and user layout preference. An interrupted Focus session returns paused at its last stored checkpoint; it does not silently resume or count the closed interval as work. Resume or record completion requires an explicit user action. A storage failure is visible and cannot cause a false successful save. |
| Notes and daily review | A separate quick-note view saves a named Markdown note only on explicit save. Renaming preserves consistency of the note's name, filename, and title, and never overwrites another file. A blank new note creates no file. Task notes, quick notes, and daily review are distinct. A saved daily review and mood survive reopening. Conflicting external edits remain intact and are reported. |
| Desktop and menu control | The app opens an existing supported folder, reports unsuitable folders, and permits changing or reconnecting to a folder. Cancelling or failing a change preserves the existing working connection and records. The macOS menu-bar Focus control reflects the current task, elapsed time, and permitted Run/Pause actions, preserving the normal finish-confirmation behavior. Unavailable or stale controls cannot issue an obsolete task command. |
| New folder onboarding | The user can explicitly choose an existing supported folder or create a new one. New-folder creation previews its destination and contents; cancellation creates nothing. Creation uses a new subfolder and never overwrites existing files. A partially created folder is reported and is not silently initialized again. A newly created folder can accept and complete its first task. Arbitrary Obsidian-folder conversion is not implied. |
| Responsive usability | The four planning views remain usable at widths 320, 390, 768, and 1280 pixels. Document-wide horizontal overflow is at most one pixel; the weekly board may have intentional internal scrolling. Primary mobile actions have usable 44-pixel targets. Long task names do not hide essential actions. Navigation, layout changes, and cancelling a dialog preserve unsaved task-entry input and the intended date. Layout choice is local application state, not a rewrite of personal records. |
| Data integrity and failure reporting | Successful edits can be traced from visible action to the intended Markdown change and recovery evidence, then back to the reopened view. Stale source content, unsafe paths, unreadable or malformed data, and unavailable storage do not become empty files or successful edits. The app never writes outside the selected evaluation folder. Concurrent app-originated changes cannot silently overwrite each other. If source records change but a derived view update fails, the user sees partial success rather than a false rollback or blind retry. |
| Privacy and isolation | The build artifact contains application material and synthetic examples only, with no personal records, credentials, generated personal dashboards, or production configuration. Evaluation reads/writes use only an isolated synthetic folder. Merely launching, navigating, or cancelling a dialog does not create personal tasks or time logs. App cleanup affects only resources created for the evaluation. |


## Deliverable and execution contract

Provide a working application's source, a `setup.sh` that installs its declared
dependencies in the isolated evaluation workspace, and concise documentation for
starting the browser-facing app on a configurable local port and building/running
the macOS desktop app. Document the exact commands and prerequisites. A Linux
preview is useful for evaluation but does not replace the native macOS outcomes.
No language, framework, API, module layout or implementation sequence is prescribed.

Use the external Markdown format in RECORD_FORMAT.md. Internal caches are allowed
but Markdown stays authoritative. This authored format is an experimental choice;
byte compatibility with another app is not required. Demonstration data must be
synthetic. The evaluation environment is isolated; real personal folders,
credentials, external services and remote data uploads are not needed.

Document unresolved product choices before relying on them, including recurrence
when the next date has no existing Daily record. Report your own observed checks
and remaining limitations honestly. Self-reported completion is not independent
verification. Test fixtures may use different valid IDs, Korean titles and dates
from the provided examples.

## Scope boundaries

Mobile apps, Obsidian Sync integration, accounts, social features, remote hosting,
two-way external calendar sync, automatic carryover, Windows delivery, signed or
notarized public distribution, and remote automatic updates are outside scope.
Native macOS opening, folder selection, onboarding, lifecycle, menu-bar Focus,
and the specified interaction outcomes remain in scope. Official holiday markers,
energy input, and a separate short diary are not required.

Ambiguous visual details have no secret preferred design. Choose coherent
behavior, document it, and preserve the fixed data and interaction outcomes.
