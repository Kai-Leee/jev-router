import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateBudgetConfig } from './budget.mjs';

export const SAFE_RUN_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}$/;

export function validateRunConfig(input, base = process.cwd()) {
  const allowed = ['schema_version','mode','workflow','container','instructions','output_dir','claude_max_budget_usd','max_decisions','wall_timeout_seconds','model','effort','auth','run_id','attempt_id','group_id','agent_role','jev_budget'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key)) ||
      input.schema_version !== 'jev-benchmark-run/v1' || !['jev','baseline'].includes(input.mode) ||
      (input.workflow !== undefined && input.workflow !== 'checkpoint-v1') ||
      input.model !== 'claude-opus-5-5' || !['medium','high','low','xhigh','max'].includes(input.effort) ||
      !['cli','api-key'].includes(input.auth) || !/^jev-[a-z0-9][a-z0-9_.-]{0,90}$/.test(input.container ?? '') ||
      !Array.isArray(input.instructions) || !input.instructions.length || input.instructions.some(p => typeof p !== 'string' || !p.trim()) ||
      typeof input.output_dir !== 'string' || !input.output_dir.trim() ||
      !(input.claude_max_budget_usd === null && input.auth === 'cli' || Number.isFinite(input.claude_max_budget_usd) && input.claude_max_budget_usd > 0) ||
      !(input.max_decisions === null || Number.isSafeInteger(input.max_decisions) && input.max_decisions >= 1 && input.max_decisions <= 10000) ||
      ['run_id','attempt_id','group_id'].some(key => Object.hasOwn(input,key) && (typeof input[key] !== 'string' || !SAFE_RUN_ID.test(input[key]))) ||
      Object.hasOwn(input,'agent_role') && !['implementation','monitor'].includes(input.agent_role) ||
      !Number.isSafeInteger(input.wall_timeout_seconds) || input.wall_timeout_seconds < 1 || input.wall_timeout_seconds > 14400) throw new Error('INVALID_RUN_CONFIG');
  const runId = input.run_id ?? `run-${randomUUID()}`;
  const budget = input.jev_budget === undefined ? undefined : validateBudgetConfig(input.jev_budget, base);
  return { ...input, run_id:runId, attempt_id:input.attempt_id ?? runId, group_id:input.group_id ?? runId,
    ...(budget ? { jev_budget: budget } : {}),
    agent_role:input.agent_role ?? 'implementation',
    instructions: input.instructions.map(path => resolve(base, path)), output_dir: resolve(base, input.output_dir) };
}

export const SYSTEM_PROMPT = `You are the sole implementation agent in an isolated software construction benchmark.
The product specification is the goal. No implementation plan or task decomposition is supplied: create your own.
Your only execution tools are the supplied benchmark MCP tools. Shell commands run in /app in a separate offline container, never on the host.
Use act to inspect, create files, install available offline dependencies, run your own tests and repair results.
Provide meaningful alternative actions with English purpose, evidence and descriptions. Preserve original source identifiers and evidence.
In Jev mode, Jev chooses the action; do not supply selected_id. Respect abstention and reported failures.
In baseline mode, supply your own selected_id. Both modes use the same structured action interface.
Commands may bundle a coherent bounded operation; never duplicate an uncertain operation. No background services that outlive a command, no sandbox escape or access to hidden evaluation assets.
Do not try to change the controller or budget. Do not claim hidden tests passed. Call finish with your actual evidence when the goal is satisfied.
If limits, missing dependencies or infrastructure prevent completion, report that precisely. A completion claim is not an independent score.`;

export function claudeArguments(config, mcpConfig) {
  return ['--print', ...(config.auth === 'api-key' ? ['--bare'] : ['--restricted']),
    '--model', config.model, '--effort', config.effort, '--tools', '',
    '--disable-slash-commands', '--no-chrome', '--strict-mcp-config', '--mcp-config', mcpConfig,
    '--setting-sources', '', '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
    '--allowedTools', 'mcp__jev_benchmark__act,mcp__jev_benchmark__finish,mcp__jev_benchmark__status'+(config.workflow==='checkpoint-v1'?',mcp__jev_benchmark__route':''),
    ...(config.claude_max_budget_usd === null ? [] : ['--max-budget-usd', String(config.claude_max_budget_usd)]), '--no-session-persistence',
    '--output-format', 'stream-json', '--verbose', '--system-prompt', config.workflow==='checkpoint-v1'?CHECKPOINT_PROMPT:SYSTEM_PROMPT];
}

export const CHECKPOINT_PROMPT = `You are the implementation agent in an isolated software construction benchmark.
The supplied product specification is the goal. Create your own plan; no implementation task list is supplied.
Use route BEFORE generating implementation commands: propose concise meaningful alternative high-level roles or work strategies with no source code. This chooses the work scope before implementation effort is spent.
In Jev mode do not choose a role or supply selected_id: Jev makes the route and completion decisions. In baseline mode provide selected_id yourself for route and finish.
After a role is selected, use act with that role_id and exactly one command. Do not generate alternative commands or ask for per-command approval. Coherent inspection, implementation and local verification may be bundled within that role. The host records actual command outcomes as evidence.
Tools run only in /app in an offline container. No host tools, hidden tests, network, background services, sandbox escape or budget changes. A role name grants no extra privileges. Never replay uncertain operations.
An observed nonzero command invalidates the current route: request a new route using the actual failure evidence. Otherwise reuse the selected role while appropriate; request another route only when its scope must change.
Call finish with actual evidence and goal coverage; the host supplies the full goal and recorded outcomes to the decision. In baseline mode selected_id is finish, continue or abstain. In Jev mode Jev chooses. A rejected finish requires new execution evidence before another finish; do not rephrase the same claim. A completion claim is not independent evaluator success.
Keep decision prose concise and English. Do not invent test results. Return a clear failure report if missing dependencies or uncertainty prevent completion.`;
