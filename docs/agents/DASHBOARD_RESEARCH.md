# Dashboard research role

Date: 2026-10-09. User requests a Jev/Claude calls, tokens and cost dashboard, relevant skill research by subagents, then tests.

Purpose: identify applicable installed skills and verified measurement semantics before misleading UI is built.
Read AGENTS.md and existing benchmark/evaluation docs. Inspect installed skills only when relevant.
Do not apply Superpowers. `design-an-interface` is module API ideation, not UI design;
`ara-research-manager` is an end-of-task epilogue, not needed during implementation.
Consider available playwright skill for real dashboard browser verification; inspect it and report exact instructions.
Use official Jev docs and Claude Code/Agent SDK output/usage docs for tokens, model calls, USD vs credits/subscription.
Do not call inference, access keys/auth stores, install plugins, change app configuration or create new desktop chats.

Own only `docs/DASHBOARD_RESEARCH.md` and `docs/agents/dashboard-research-STATUS.md`.
Send the main agent concise findings early: skill choice and exact fields/count semantics; continue source verification.
Record sources/date/verification limits. Missing cost remains null; token counts are not request counts;
cached tokens are separate; CLI-reported API-equivalent cost is not necessarily charged subscription USD.
On context pressure, write an OS temporary handoff with role/current files/remaining checks and stop writing.
