# Personal OS specification research status

Date: 2026-10-08 (Asia/Seoul)
Role: `PERSONAL_OS_SPEC_RESEARCH.md`
Status: complete — source review and sanitized scope proposal only
Decision link: D-012 role-based research; the main agent owns the final experiment proposal.

## Result and evidence boundary

The existing Personal OS documentation is sufficient to propose a goal/specification-only reconstruction evaluation. It is not a fully verified reference implementation. Product requirements, documented implementation, and documented verification coverage must remain separate.

This review read the release checkout's AGENTS.md and product specification/inventory files under `00 System/`. It did not read implementation Task files, app source, personal Vault records, generated dashboard data, credentials, or installed app state. No app/service was run, no tests were rerun, and no Personal OS file was changed. Every claim below about the previous product's implementation or tests is a **source-declared historical result**, not a fresh runtime result.

The dated 2026-10-08 inventory additions supersede older statements that Focus/settings restoration and new Vault onboarding are unimplemented. They do not establish full native coverage or public-release readiness. The completed inventory's frontmatter still says `snapshot_date: 2026-10-07`; use the dated sections rather than that stale header alone.

## Sanitized experimental brief — proposal, English

Only this section and a newly authored synthetic input-format contract are candidates for the experimental agent's initial product brief. Do not hand the experimental agent this entire research status file or links to the existing repository. The acceptance groups below describe results; they are not an implementation sequence, architecture, work breakdown, or prescribed team structure.

### Product goal

Create a private, local Personal OS for one person to plan daily and weekly work, arrange a monthly calendar, manage unscheduled work, focus on a chosen task, and review planned versus actual time. It should feel like a coherent personal task and focus application with Korean-facing labels. A user-owned folder of human-readable Markdown records is the source of truth and remains usable outside the app. The application must provide a usable macOS desktop experience and responsive planning views.

### Observable acceptance outcomes

| Product capability | Result a user or independent evaluator can observe |
|---|---|
| Calendar and navigation | Today, Week, Calendar, and Backlog are directly reachable. Selecting a date changes the relevant task list and task-creation date. Today is computed in Asia/Seoul and remains distinct from the selected date. Adjacent-month dates show their tasks and can be selected. Merely browsing dates or views does not change source records. Monthly and weekly mixed lists show unfinished items before completed items; display sorting does not reorder Markdown. |
| Task entry | A task stores its title, chosen date, priority P1–P4, and context. It supports a time range, a start time without a duration, or no time. A start-only task contributes zero planned minutes; duration without a start time is rejected. A task without a time is described as time-unspecified. Saving to a previously absent day works. Successful entry permits immediate next entry; failure preserves the draft. Repeated activation of one pending submission creates one task, while independent submissions may share a title. |
| Task states and editing | Active tasks can be completed, renamed, cancelled, or deleted. Completion can be undone. Cancellation is distinct from deletion; cancelled work can be restored or explicitly archived, and archived work can be restored. Only legal actions for the current state are available. Deletion requires confirmation and removes only the intended task, with recovery evidence. Task notes save and survive reopening. A completed title remains readable without a strike-through. |
| Rescheduling and Backlog | Dated active and completed tasks can move to another date or become unscheduled; their identity, metadata, and completion state remain intact. Cancelled and archived tasks do not move. Backlog exposes undated work and overdue unfinished work. Single and multiple overdue tasks can be rescheduled explicitly. A same-date move makes no change. If a batch stops after some successful moves, the user sees which work moved and which remains, without an automatic retry. |
| Direct manipulation | Selecting a task or dropping it onto Focus selects the focus target without starting the timer. Dropping an eligible task onto a calendar date changes its scheduled date. Category drops change the category. These destinations have distinct effects. Rescheduling by drag does not unexpectedly change the selected date, displayed month, or weekly range. A menu-based date-change alternative is available. |
| Recurrence | A user can reveal optional recurrence details and use the supported daily, weekday, weekly, and monthly rules. Completing a recurring occurrence produces at most one next occurrence with a distinct task identity. Invalid recurrence or a failed next-occurrence operation cannot silently produce duplicate or falsely completed work. The absent-next-day-file policy is an explicit unresolved product decision below. |
| Context and category | Projects/areas, one optional user category, and multiple tags remain distinct attributes. Creating a project or area adds a corresponding Markdown record and a selectable context. Users create and edit category names and colors; assignment appears consistently across planning views. An unassigned task has a consistent fallback presentation. Filters change the view without changing records. Invalid color input, duplicate names, and stale edits are rejected without overwriting newer records. |
| Focus and time | The focus target, goal duration, elapsed time, and ready/running/paused state agree. Selecting a target does not start it. Start, pause, and resume preserve elapsed time correctly. Confirming session completion appends one time record; dismissing the confirmation appends none. A repeated completion attempt does not duplicate the same session. Planned and actual time remain separate, including a running session in the visible actual-time total. |
| Reopening the desktop app | Normal quit/reopen preserves the chosen folder and user layout preference. An interrupted Focus session returns paused at its last stored checkpoint; it does not silently resume or count the closed interval as work. Resume or record completion requires an explicit user action. A storage failure is visible and cannot cause a false successful save. |
| Notes and daily review | A separate quick-note view saves a named Markdown note only on explicit save. Renaming preserves consistency of the note's name, filename, and title, and never overwrites another file. A blank new note creates no file. Task notes, quick notes, and daily review are distinct. A saved daily review and mood survive reopening. Conflicting external edits remain intact and are reported. |
| Desktop and menu control | The app opens an existing supported folder, reports unsuitable folders, and permits changing or reconnecting to a folder. Cancelling or failing a change preserves the existing working connection and records. The macOS menu-bar Focus control reflects the current task, elapsed time, and permitted Run/Pause actions, preserving the normal finish-confirmation behavior. Unavailable or stale controls cannot issue an obsolete task command. |
| New folder onboarding | The user can explicitly choose an existing supported folder or create a new one. New-folder creation previews its destination and contents; cancellation creates nothing. Creation uses a new subfolder and never overwrites existing files. A partially created folder is reported and is not silently initialized again. A newly created folder can accept and complete its first task. Arbitrary Obsidian-folder conversion is not implied. |
| Responsive usability | The four planning views remain usable at widths 320, 390, 768, and 1280 pixels. Document-wide horizontal overflow is at most one pixel; the weekly board may have intentional internal scrolling. Primary mobile actions have usable 44-pixel targets. Long task names do not hide essential actions. Navigation, layout changes, and cancelling a dialog preserve unsaved task-entry input and the intended date. Layout choice is local application state, not a rewrite of personal records. |
| Data integrity and failure reporting | Successful edits can be traced from visible action to the intended Markdown change and recovery evidence, then back to the reopened view. Stale source content, unsafe paths, unreadable or malformed data, and unavailable storage do not become empty files or successful edits. The app never writes outside the selected evaluation folder. Concurrent app-originated changes cannot silently overwrite each other. If source records change but a derived view update fails, the user sees partial success rather than a false rollback or blind retry. |
| Privacy and isolation | The build artifact contains application material and synthetic examples only, with no personal records, credentials, generated personal dashboards, or production configuration. Evaluation reads/writes use only an isolated synthetic folder. Merely launching, navigating, or cancelling a dialog does not create personal tasks or time logs. App cleanup affects only resources created for the evaluation. |

### External record compatibility

Markdown interoperability is a product constraint, not a requirement to reproduce the previous implementation. The independent evaluator needs a compact, synthetic record-format contract for dated task records, projects/areas, categories, quick notes, daily review, and append-only completed focus logs. Stable task identity, task state, planned date/time, priority, category/context/tag separation, and session identity must survive reopening and moves. Generated views are disposable derivatives, never the sole source of personal records.

If byte-level compatibility with the old app is required, the main experiment must explicitly include an authored external-format specification. Otherwise the stated target is equivalent user-visible behavior with a documented human-readable Markdown format, not drop-in compatibility. This distinction changes the evaluation and must be frozen before comparing runs.

### Boundaries and unresolved semantics

Mobile apps/Obsidian Sync integration, remote hosting, accounts, social features, two-way external calendar sync, automatic carryover, Windows delivery, signed/notarized public distribution, and remote automatic updates are outside this proposed reconstruction evaluation. Their exclusion does not remove the native macOS outcomes above.

Official holiday markers, energy input, a separate short-diary feature, and the proposed compact advanced-field task-entry redesign are not included as existing-completed-product parity: the reviewed records do not establish their completion. They may be explicit new requirements later, but should not silently increase the baseline.

The original record is not decisive about recurrence when the next day's file does not exist. The experiment must either supply a product decision or let each experimental agent document its chosen behavior and score that choice separately from fixed acceptance. The same applies to ambiguous view details; an evaluator must not silently choose different rules after seeing different agents' results.

No programming language, framework, module layout, API shape, internal function name, build order, task list, subagent allocation, or implementation plan is specified here. The experimental agent may choose and document its own plan. This is compatible with the user's requested absence of human task decomposition.

## Source and gap map — maintainer/evaluator only, Korean

아래 표는 이전 제품에 대한 증거 지도다. 실험 에이전트 입력에 넣지 않는다. `문서 기록`은 이번 에이전트가 실행하여 확인했다는 뜻이 아니다.

문서 루트: `/Users/lee/workspace/personal-os-app-release/00 System/`

| 요구군 | 원문 위치 | 문서상 구현/증거 | 평가에서 주의할 공백 |
|---|---|---|---|
| 날짜·할 일·상태·이동 | `08 Feature Specification and Verification Protocol.md` lines 69–87, 10–12; `07 Action Specifications.md` 행동별 명세; `09 Completed Feature Inventory.md` 사용자 기능별 완료 범위 | F01–F08/F14는 API fixture 및 일부 격리 UI 행동 기록. 최신 오늘 표시·완료 아래 정렬은 2026-10-08 격리 클릭/파일 왕복 및 화면 폭 기록 | 모든 날짜 경계, 상태 메뉴 조합, 일괄 이동 부분 실패, 최신 native 전체 흐름이 확인된 것은 아님 |
| 생성 중복 방지 | `08` F28 section; `03 Data Contract.md` F28 생성 요청의 중복 경계; `09` 2026-10-07 F28 section | 동일 생성 의도 중복 억제, 실제 HTML Enter/더블클릭 각 1건 및 저장 후 입력 복귀 기록 | 같은 제목 신규 제출 금지와 혼동 금지. 모든 저장 API의 exactly-once 보장 아님 |
| 반복 | `08` F03 row; `09` F03 row; `10 Open Feature Inventory.md` B/F03 row | 제한 규칙과 다음 발생분 API fixture 기록 | 다음 Daily 부재 정책 미결정, 전체 반복 UI→저장→다음 발생분 흐름 미검증 |
| 분류·메모·회고 | `08` F08/F12/F13/F15/F17 rows; `03` 원본과 보기의 경계; `09` F08/F12/F13/F15/F17 rows | API 원본 충돌/백업/읽기 모델 왕복 및 일부 메모/카테고리 UI 기록 | 빈 값/충돌/중복/편집 UI 전체, 카테고리 대비와 일부 드래그는 공백. F13 회고는 API fixture 중심 |
| 날짜·Focus·카테고리 드래그 | `08` F14/F17/F20 rows; `07` 행동별 명세; `10` B/F20 | guarded 이동 API와 정적 계약, 같은 날짜 무쓰기 UI 기록 | 다른 날짜 실제 포인터 드롭 전체가 검증되었다고 할 수 없음. 백로그 달력 배치 해석은 문서 자체가 가정으로 표시 |
| Focus·정상 재시작 | `08` F09/F10, F35 section; `09` 2026-10-08 F35 section; `10` 2026-10-08 F35 갱신 | F35 최신 기록은 별도 userData의 native 정상 quit/reopen, paused 복원, 종료 취소 무쓰기/확정 append, 재실행 idle까지 명시 | 오래된 '복원 미구현/종료 확정 미검증' 문구를 그대로 최신 상태로 쓰면 오류. 강제 crash/전원 손실/다른 Mac/개인 설치본은 여전히 별도 |
| 데스크톱·연결·메뉴 | `08` F25/F26/F30 sections; `09` F25/F26 및 2026-10-08 F30 sections | Mac 앱 실행·전용 서비스·연결 취소/실패 보존·일부 native 메뉴 start/pause/resume 기록 | 전체 CRUD/드래그 native, status-icon 실제 클릭, 극단 lifecycle 실패 경로는 공백 |
| 신규 Vault | `08` F36 section; `09` 2026-10-08 F36 section; `10` 2026-10-08 F36 갱신 | 취소 무파일·신규 생성·첫 태스크 생성/완료와 4뷰 native 기록 | 임의 Vault 자동 변환/부분 초기화 자동 복구 미지원, 실제 OS 접근 거절/다른 Mac 등 미검증 |
| 반응형·배치 | `08` F18/F24/F27; `09` F24 rows/F27 section | 웹 4폭×4뷰 16조합 overflow0 및 일부 실제 행동, F35에 native 배치 설정 정상 재실행 기록 | F24 모든 전환·입력 보존/폰 safe-area·가상키보드·실기기 전체 아님 |
| 저장 안전·공유 쓰기 | `08` F33/F34; `03` F33/F34 sections; `09` F33/F34 sections | F33 안전성 fixture와 일부 격리 UI, F34 실제 두 프로세스를 포함한 fixture 기록 | 외부 편집기/Sync와의 원자성, 전원 손실 durability, 동시 경로 교체까지 보장하지 않음 |
| 출시·개발 운영 | `08` F29/F31/F32; `09` 관련 sections; `10` 출시 후속 상태 | 로컬 후보/검사/개발 업데이트 도구의 제한된 기록 | 기존 개발 workflow를 재현 요구나 공개 배포 완료로 바꾸지 않는다. 실제 배포 목적이면 별도 수용 범위가 필요 |
| 아직 완료되지 않은 범위 | `08` F16/F19/F21/F22/F23; `10` F16/F23 및 미약속 범위 | 기능 의도/플랫폼 대기/설계 또는 미완료 기록 | 완료된 제품을 재현한다는 이름으로 조용히 추가하지 않음 |

## 한국어 판단과 메인 인계

- **실행 가능성:** 기존 문서에서 충분한 제품 목표와 외부 수용 결과를 뽑을 수 있다. 사용자가 말한 “목표/명세만 주고 스스로 만든다”는 실험에는 적합하지만, “기존 앱 전 기능이 이미 검증된 정답”이라는 가정은 부적합하다.
- **범위 축소 방지:** 위 목표는 날짜/할 일/메모/Focus뿐 아니라 macOS 앱·정상 재시작·메뉴·신규 Vault를 포함한다. 기능군을 평가 결과에서 따로 보더라도 인간이 구현 순서나 작업 분해를 제공하는 뜻은 아니다.
- **기존 앱은 정답 코드가 아님:** 기존 코드·Tasks·실제 데이터를 주면 계획 생성과 작업 분해 자체를 평가하려는 목적이 흐려진다. 초기 전달은 위 제품 brief와 새 합성 예시만으로 제한하고, 원문 F-ID·함수·API·운영 경로·Task 번호는 평가자용 근거에만 둔다.
- **평가 근거:** 새 산출물은 새 격리 데이터에서 독립적으로 관찰해야 한다. 에이전트의 완료 선언/자체 테스트, 평가자의 브라우저 결과, Markdown 결과, native 결과는 각각 보고한다. 기존 인벤토리 수치를 새 산출물의 점수로 복사하지 않는다.
- **미결정:** 기존 앱 Markdown과의 byte-level 호환 여부, recurrence 경계, 비용/시간 예산, 전체 범위의 가중치, 공개 배포 포함 여부는 이번 조사만으로 사용자 확정 사항이 되지 않는다. 이 역할은 전체 실험 설계를 결정하거나 유료 모델을 호출하지 않았다.
- **읽기 제약의 영향:** 일부 최신 수용 기준이 Task 문서에만 연결되어 있어 여기서 완전히 확인할 수 없는 항목이 있다. 그 문서를 읽어 인간의 작업 분해를 노출시키지 않고, 제품 명세/인벤토리 수준의 관찰 결과만 채택했다.

Owned output: this status file only. No additional repository files changed. No context-limit handoff was necessary.
