# Dashboard aggregation role

Purpose: implement a pure, sanitized snapshot builder with honest Jev/Claude counts, tokens and costs.
Read AGENTS, docs/DASHBOARD_CONTRACT.md, current benchmark trace/runner and evaluation invariants.
Own `src/dashboard/metrics.mjs`, `test/dashboard-metrics.test.mjs`, and `docs/agents/dashboard-metrics-STATUS.md` only.
Export `summarizeRun({id, manifest=null, result=null, decisions=[], claudeEvents=[], issues=[]})` returning one run in contract.
Do not read filesystem in this module. Inputs already parsed; assume untrusted records and validate every value.
Aggregate actual receipts; exclude GETs. Deduplicate repeated Claude assistant IDs, preserve cache columns and incomplete sums.
For new Jev inference events count starts and matches; old gate input vs actual POST has weaker semantics.
Cost values lacking declared USD meaning cannot become billed USD. Never treat subscription reported equivalent cost as paid invoice.
Build tests with hand-calculated expectations for missing/partial/duplicates/failure/uncertainty/cached tokens/XSS input.
No inference, keys, installation, server/UI/shared-doc changes. Send schema concerns promptly.
On context pressure write temporary handoff + role status and stop. No other agent shares owned files.
