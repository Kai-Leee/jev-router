# Dashboard UI role

Purpose: implement a usable Korean local read-only dashboard for user comparing Jev/Claude call count, tokens and cost per run.
Read AGENTS and docs/DASHBOARD_CONTRACT.md. Own `dashboard/index.html`, `dashboard/app.js`, `dashboard/style.css`,
and `docs/agents/dashboard-ui-STATUS.md` only. Vanilla JS/CSS; no dependency/CDN/fonts/remote assets.
Fetch `/api/snapshot`, refresh every 3 seconds plus manual button; preserve selected run on refresh; surface API errors.
Design a polished light dashboard: warm neutral canvas, dark typography, restrained green/blue accents, clear hierarchy,
compact provider comparison cards/table, call/token/cost views, run filter/selector, event timeline, evidence warnings.
Show observed model turns separately from unobservable HTTP attempts. Jev credits vs USD separate; unknown is 미확인, measured0=0.
Make synthetic/control badges unmistakable; no savings claims; no grand aggregate mixing evidence kinds.
Accessible labels, responsive layout, keyboard controls, textContent for untrusted strings, no innerHTML from source data.
Use SVG/CSS bars if helpful; no made-up graph values. No fake live demo in production default.
Main owns data/server/tests/browser verification; send needs early. No model calls, secrets, new chats or shared files.
On context pressure write temporary handoff and role status then stop.
