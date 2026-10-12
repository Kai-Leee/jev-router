# D051 observed repair dispatch

Measured runtime: Jev group1 source-file verification returned ok:true, publicgeneratedsmoke notapplicable because packaging groupnotready. Jev post_worker_review selected repair(confidence0.58); boundedgroup1repair dispatched. Evidence: benchmark-runs/d051-jev-01/events.jsonl, calls/003-decision.response.json and repair request.

The typed review answer supplies choice/confidence, not a requirement/issue ID or repair rationale. The repair worker receives carried requirements, full original worker result/source and generic repair=true. Therefore it must locate a repair target itself. A correct choice may still entail expensive duplicate diagnosis. No claim that the chosen repair was unnecessary or wrong is established before its outcome/independent grade.

Proposal after this frozen experiment: offer executable concrete issue candidates derived from actual checks or structured worker gap reports; bind issue ID to repair scope. If no concrete defect is known, separate additional public validation from code repair. Do not change D051 midrun or assume confidence is calibrated correctness. Test whole-task outcome/cost before adopting.

## Terminal evidence

After the repair, Jev selected stop (confidence0.26; accept0.37/stop0.63), terminating before later groups. Confidence did not gate execution. All decision POSTs returned200. The lack of concrete repair targets is observed; its causal contribution to stop is a hypothesis because no textual rationale was returned. See [final results](D051_RESULTS.md).
