# D041 — Remove ten-minute call cap and clarify Jev non-execution

2026-10-10. User directed that the ten-minute limit no longer apply and asked why Jev stopped. Removed the 600000ms per-call cap from tree-e2e-pilot. Calls now use the remaining phase budget. The existing phase budget is min(30 minutes, configured wall_timeout_seconds); this is not unlimited execution. Current D040 configuration therefore allows up to the remaining thirty-minute phase budget. No live retry is performed in this turn.

D040 evidence shows Jev never started. The sequence was Claude condition followed by auto/Jev on the same frozen plan. Claude's worker timed out. Main applied the predeclared experiment-wide stop rule and did not dispatch the second condition. This was an experiment coordination choice, not a Jev transport/model error, insufficient balance, or API-enforced dependency.

The rule was more conservative than the technical dependency required. Unknown Claude billing must remain unknown and the interrupted request must not be silently replayed. It does not by itself prove that a distinct Jev condition cannot run. A future independent condition can retain the existing plan if the prior local process is stopped, Jev ledger has no pending reservation, and uncertainty is preserved in reporting. This does not authorize reporting a paired savings result from a missing baseline.

Historical D040 protocol and receipts remain unchanged. D040 timeout results describe the old source revision. Any later run uses a new source snapshot and new output directory. Jev shared USD1 limit, output bounds and no automatic uncertain-call retries remain unchanged.

Verification: node --check scripts/tree-e2e-pilot.mjs; source inspection confirms no 600000ms call cap. No new model inference, Docker runs, commit or push. Uncommitted source and documentation remain.
