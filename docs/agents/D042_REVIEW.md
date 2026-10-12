# D042 budget and concurrent pilot review

Reviewed 2026-10-10. Reviewer scope: budget policy migration, ledger ownership, independent cohort handling and partial stdout capture. No provider calls, Docker execution, actual ledger mutation or hidden test access.

No blocking defect found in the inspected source. `tree-e2e-pilot.mjs` reads a shared budget snapshot without acquiring a writer lock for Claude-only conditions. Jev obtains the writer lock only in `decideWithBudget`; measured telemetry settles the response before return, and `finally` closes the budget before checkpoint worker dispatch. An uncertain Jev response leaves its reservation intact. The other condition is a separate process and is not cancelled by this code.

`readTokenBudgetSnapshot` opens a single inode before validation and reads it without acquiring the writer lock. Atomic replacement can return either complete snapshot; it cannot mix content. The implementation accepts a just-unlinked opened inode but rejects extra hard links, symlinks and public permissions. Snapshot reservation/block fields are informational to the Claude-only pilot.

Migration retains budget identity, charged input tokens, settlement count, last settlement and reservation sequence. It rejects a pending request, blocked settlement, existing writer lock, missing source and invalid history. Legacy USD1 configuration cannot silently reopen a migrated v2 ledger. Token-native limit is 10,000,000 total input tokens inclusive of historical spend.

`onStdout` writes partial CLI output into a private live file. It does not extract incomplete source code. The no-tools file-generation scaffold and post-plan 30-minute phase budget remain. Shared snapshots must not be used as per-condition cost deltas; use each condition's own request/usage events. Shared Claude account load/cache remains a comparison limitation.

Independent verification command:

```sh
node --test test/benchmark-budget-v2.test.mjs test/benchmark-budget.test.mjs test/benchmark-budget-lifecycle.test.mjs
```

Observed 54 tests, 54 pass, 0 fail. Prior `git diff --check` also passed. This is source/unit-test review, not evidence that a live simultaneous comparison completed. Main agent owns migration, protocol freezing, dispatch and final accounting.
