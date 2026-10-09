# Dashboard UI status

2026-10-09 (Asia/Seoul). Role: DASHBOARD_UI.md. Owner: dashboard_ui.

Implemented only `dashboard/index.html`, `dashboard/app.js`, `dashboard/style.css` and this status.
Vanilla Korean responsive local dashboard; no external assets/dependencies/model calls.

- API: GET `/api/snapshot`, v1 contract, 3-second polling with request serialization/10-second timeout,
  manual refresh, stale-data/error notices, selected run preserved on refresh.
- Search + evidence-kind filter; selected run only, no cross-run aggregate. Synthetic/control/unknown
  records carry conspicuous badges and explanatory banners. Empty, unknown and measured zero distinct.
- Jev transmission attempts and Claude observed response steps use separate units. Per-provider calls
  table preserves unknown HTTP attempts. Input/output/cache read/cache creation/total tokens separate;
  charts draw only complete values. Partial known sums and known/expected coverage appear as such.
- Claude API-price USD estimate separate from confirmed billed USD; Jev credits, balance token debit,
  provider-reported USD and billed USD separate. No savings/actual-cost claims from estimates.
- Outcome separate from completion; event history shows latest eight with expand control. Local KST timestamps.
- Safe `textContent`/DOM construction for all data; no `innerHTML`, remote fonts, CDN or unsafe evaluation.
  Keyboard buttons/select, focus-visible, skip link, labelled table and status/error regions.

Validation performed: `node --check dashboard/app.js` passed. Browser/HTTP visual and integration
verification is main-owned and still pending here; no claim of E2E completion. Production files contain
no demo or hard-coded usage/cost figures. Layout breakpoints 1100/800/560 px are CSS choices, not measurements.

## D-019 — paired runtime transport/UI implementation

2026-10-09. Role: `PAIRED_RUNTIME.md`, transport/UI assignment. Product edits are limited to
`src/dashboard/server.mjs`, `dashboard/` assets, and `test/dashboard-transport.test.mjs`.
The existing server/reader test file was executed unchanged.

- Added GET `/api/events` whole-snapshot SSE. Snapshot schema remains `jev-dashboard/v1`; both SSE and
  GET add `transport:{epoch,revision}`. A generated_at-only change does not advance the revision.
  Reconnect always gets a current full snapshot; unavailable cursor gets an explicit `reset` with
  `replay:latest_snapshot_only`. This is current-state recovery, not a full audit-event replay service.
- One shared collector while subscribers exist; default collection1s/transportheartbeat15s. These are
  configuration values, not measured delivery guarantees. `stream_error`/heartbeat `collector_status`
  distinguish unreadable source data from an open transport connection. All error payloads are fixed codes.
- Per subscriber: one latest pending frame, no queued heartbeat under backpressure, 4 MiB frame limit,
  30s stalled-write cutoff, 16-subscriber ceiling, drain/close cleanup. Server close terminates streams.
  GET fallback retains original no-store/Host/Origin/read-only/CSP boundaries; HEAD never opens a stream.
- Browser uses EventSource, complete-state replacement and revision ordering; GET handles initial,
  manual, disconnected/stale-stream and visibility-return refresh. Connection heartbeat freshness does
  not alter runner health or imply model progress. Old-data fallback and explicit replay-limit notice remain.
- Failure-first section displays runner phase/status, gate state, runner heartbeat/source timestamp and
  safe incidents. Same group IDs link implementation and separate monitor runs without summing their costs.
  Explicit unlimited fields are displayed as no count/USD flag ceiling, not missing/zero values.
- Monitor report renders `assessment/evidence/next_action/limitations` with textContent, only for monitor
  role. It is labelled model interpretation separate from deterministic runtime/evaluation evidence.
  No Codex delegate is labelled an Opus agent; model names come from observed provider IDs.

Validation command: `node --test test/dashboard-transport.test.mjs test/dashboard-server.test.mjs`.
Initial sandbox execution:10 pass/11 fail, all HTTP failures `listen EPERM` before test server startup.
The permitted temporary-loopback execution then passed **21/21**, no failures/skips/cancellations.
Coverage includes changed/unchanged snapshots, same/old/different-epoch cursor, collector failure/recovery,
fixed error redaction, foreign Origin/mutation/cursor rejection, subscriber limit and slot cleanup,
backpressure latest-only retention, oversized frame/stalled client termination and server close cleanup.
`node --check dashboard/app.js` and `node --check src/dashboard/server.mjs` also passed.

Actual-server restart, browser layout/integration, real Opus/Jev run and monitoring are main-owned and were
not performed here. No API key read, inference, Docker operation, existing Personal OS change or package
installation. Temporary test servers closed; existing dashboard server was not touched. Writing complete.
