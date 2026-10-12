# Jev prompting source boundaries

Checked **2026-10-12 KST** by reading the public pages below with the web tool. This is document verification, without authenticated GET, inference, tokenizer verification or an independent reproduction of vendor benchmarks. Refresh changing service rules before changing a pinned project policy; retain the old policy and its run evidence.

## Hosted API rules

[Jev AI SDK setup](https://jev-ai.pro/docs#official-sdk) and [errors](https://jev-ai.pro/docs#errors) describe the service used here:

- TypeSafe publishes `@typesafe-ai/sdk`; Jev AI hosts the compatible endpoint. Reuse the application's client, set `baseURL: 'https://jev-ai.pro/api'`, server-side `JEV_AI_API_KEY`, and `retry: { maxRetries: 0 }`. Final destination: `POST https://jev-ai.pro/api/v1/systemone`; default model: `jev-latest`.
- `GET /api/v1/models` is authenticated and inference-free, but is not an inference-success guarantee. Never log a key or Authorization header.
- JSON body ≤256000 bytes; 1–64 questions; ID length ≤64. Choice has 2–255 alternatives; score has 2–10 ordered levels; noul returns a yes probability. The model's context limit is separate.
- Correct invalid requests before resending. Honor `Retry-After` for rate limits. Reconcile timeouts/lost connections before another POST; documented bounded retries require confirmed failure. This is not the TypeSafe SDK's generic retry default.

The repository checker implements a narrower fixed-template workflow than the service API. The service's supported shapes do not imply support in every local adapter.

## Manufacturer guidance

| Source | Relevant finding | Boundary |
| --- | --- | --- |
| [TypeSafe models](https://docs.typesafe.ai/models) | Jev 1.13 documentation gives 64k context for state plus all questions, and 32k for state plus the longest question. It describes English as the primary training language with best current accuracy; domain material belongs in state and decision boundaries in questions. | These are manufacturer statements, not our measured accuracy or an exact local tokenizer. Direct TypeSafe limits, prices and retry defaults do not replace Jev AI's service policy. |
| [Primitives](https://docs.typesafe.ai/primitives) | Question IDs are not passed to the model. Complete instructions and concrete state paths carry meaning. Independent typed questions can be combined by code. | A typed response is not proof that its interpretation is correct. The skill's execution and unresolved-answer policies belong to this project. |
| [State](https://docs.typesafe.ai/concepts/state) | One request shares text or JSON state across its questions. Named structure makes related information easier to reference. | Grouping preserves access to evidence; it does not establish that any compression preserved every needed fact. |
| [Advanced structure](https://docs.typesafe.ai/primitives/advanced) | Manufacturer primitives accept structured content in instructions and criteria. | Current repository instructions are a string subset. Use the local adapter contract, not an unsupported direct copy of these examples. |
| [Introducing System One models and Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) | The authors present typed judgments embedded in code-controlled workflows and report their own benchmark. | Their reference is a comparison-model reference, not independent ground truth. Their workflow speed claims are not measurements of this router or SWE completion. |
| [Customer-service workflow evaluation](https://evals.typesafe.ai/customer_service) | The example uses independent initial readings, conditional follow-up questions and ordered code branches for actions. | This is the producer's illustrative/evaluation workflow, not our repair experiment. It motivates a design to test, not a promised speedup. |
| [Jev AI version guide](https://jev-ai.pro/model/jev-1.13) | The host summarizes Jev's version, model limits and external benchmarks. | For manufacturer behavior, prefer the original TypeSafe sources above. A documented alias is not a live account/model receipt. |

The web tool could not open the linked TypeSafe `how-to-build-with-system-one` page during this role's review, including its `.md` URL. No claim here depends on an unread page; the main owner separately cross-checked it. The source index was discoverable at [TypeSafe llms.txt](https://docs.typesafe.ai/llms.txt).

## Project policies and unmeasured proposals

The English default, prewritten question reuse, complete binding validation, current owner allowlist, `unknown` behavior, original failure preservation and answer-to-handler mapping follow the repository's AGENTS and runtime contracts. Deterministic code handles facts it can verify; Jev chooses bounded interpretations; the development agent investigates missing evidence and implements changes. This role split is a project design.

`docs/orchestration/D074_PROMPTING_AND_FAILURE_LOOP.md` preserves the original failure-loop design and offline results. The current D075 gate/recovery usage is documented separately in `docs/orchestration/D075_FORCED_PREFLIGHT_AND_RECOVERY.md`; these runtime policies are project implementation, not manufacturer guarantees. Neither a prompt rewrite nor offline preflight establishes improved accuracy, successful repair, fewer provider calls, or lower completion time/cost. Those require separately observed provider, worker and quality evidence with the appropriate comparison denominator.
