# Offline Jev prompt preflight

`inferred-v2.request.json` is a synthetic fixture with one failed case and two existing artifact owners. It contains no benchmark result or real account credential. Its source references identify synthetic inline material; they do not prove evidence truth or file authenticity.

From the repository root:

```sh
node scripts/validate-jev-prompt.mjs --request examples/jev-preflight/inferred-v2.request.json --stage repair_owners --template inferred-v2
node scripts/validate-jev-prompt.mjs --connection-only
```

Add `--out NEW.json` to save a new private report. Existing files are never overwritten. Exit 0 means supported structural/mock checks passed, 2 means blocked checks, and 1 means invalid CLI/I/O.

The policy is `docs/orchestration/contracts/jev-prompt-policy.v1.json`. It pins the existing inferred-v2 question document, projection and owner handler. Only the projected `adaptive-inferred-owner-input/v2` state is supported; other stages and raw fallback are unsupported. For general adapter shape checks use `scripts/validate-jev-input.mjs --policy v4` with the trusted stage.

The check compares exact templates and inline references. It never executes the owner handler, sends requests, loads environment files or reads paths found inside state. Mock connection checks exercise the current repository client with synthetic transport and a fake key. Live authentication, account model availability, deployment configuration, semantic quality, English quality, exact provider context fit and performance remain unverified. Local token/byte estimates remain non-blocking under v4; the adapter's official body/schema validation remains enforced.

Official references reviewed 2026-10-12: [Jev setup](https://jev-ai.pro/docs#official-sdk), [Jev failures](https://jev-ai.pro/docs#errors), [Jev model guide](https://jev-ai.pro/model/jev-1.13), [TypeSafe model guidance](https://docs.typesafe.ai/models). The existing adapter supports a subset of the hosted API; this is not a full TypeSafe SDK conformance test. Source drift requires explicit review of this new policy, never rewriting old experiment evidence.
