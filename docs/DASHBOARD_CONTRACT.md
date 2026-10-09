# Dashboard snapshot contract v1

2026-10-09. Main-owned integration contract; proposed implementation within user-authorized dashboard scope.
No credentials, prompts, commands, raw outputs, private absolute paths or account identifiers reach the browser.
Dashboard is local read-only. No start/retry/inference button. Display Korean labels with exact measurement definitions.

`GET /api/snapshot` returns:

```js
{
  schema_version: 'jev-dashboard/v1', generated_at: '<ISO>', warnings: [],
  runs: [{
    id: '<safe directory basename>', title: '<title>', workload: 'e2e-swe|personal-os|smoke|unknown',
    condition: 'jev|baseline|control|unknown', kind: 'live|synthetic|control|unknown',
    status: 'running|completed|failed|uncertain|prepared|unknown', started_at: null, duration_ms: null,
    limits: {jev_max_calls:null, wall_timeout_seconds:null, claude_max_budget_usd:null},
    providers: [{
      provider: 'jev|claude', model_ids: [],
      calls: {attempted:null, completed:0, failed:0, uncertain:0,
              observed_model_turns:null, process_runs:null, semantics:'<fixed explanation>'},
      tokens: {input:Metric, output:Metric, cache_read:Metric, cache_creation:Metric, total:Metric},
      costs: {reported_usd:Metric, billed_usd:Metric, credits:Metric, paid_input_tokens:Metric},
      cost_note: '<fixed explanation>'
    }],
    evaluation: {status:'not_run|passed|failed|unknown', passed:null, total:null, note:'<fixed explanation>'},
    activity: [{at:null, provider:'jev|claude|controller', type:'<safe event name>', status:'<safe status>', duration_ms:null}],
    warnings: ['<fixed messages>']
  }]
}
```

Metric is `{value:number|null, observed:number|null, known:number, expected:number|null}`.
`value` is a complete total, never an incomplete subtotal. `observed` is the known subtotal.
Unknown/missing is null; measured zero is 0. `known/expected` is coverage, not an accuracy score.
Avoid computing a grand sum across synthetic/live/control or combining credits with USD.

## Inputs owned by runner

- Existing `manifest.json`, `result.json`, `decisions.jsonl` remain supported.
- New Claude stream file `claude.stream.jsonl` preserves CLI `--output-format stream-json --verbose` output.
  Assistant message IDs can repeat; deduplicate/merge usage per message, don't sum duplicate content blocks.
  Assistant turns are observable but total underlying HTTP attempts/retries are unknown. Never label tool calls as model API calls.
  Final result usage/cost may be cumulative: choose one authoritative total, never add final and per-message totals.
- New Jev journal events written around client.decide only:
  `{event:'inference_started',provider:'jev',request_id:'jev-1',recorded_at:'ISO'}`
  `{event:'inference_finished',provider:'jev',request_id:'jev-1',status:'completed|failed|uncertain',
    model:null,usage:null,billing:null,duration_ms:0,recorded_at:'ISO'}`
  Only completed fields include normalized client usage/billing. Errors include fixed code only.
  Models GETs are excluded. Old input/decision events are fallback only when inference events are absent.
- New runner manifest includes `evidence_kind:'live'`, `workload`, `auth`, `cli_version`.
  Mock/synthetic tests explicitly mark evidence_kind. Unknown legacy data remains unknown/control based on receipts.
- Invalid/truncated input and unreadable file produce fixed warnings and partial/unknown metrics, not zero/complete.
  An incomplete final JSONL line during live writes is pending; no silent discard of malformed complete lines.

Detailed confirmed cost semantics may refine this draft from the research agent; notify main before shape changes.
