#!/usr/bin/env node
import { readFileSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { createDecisionGate } from '../src/benchmark/decision-gate.mjs';
import { createCheckpointGate, checkpointTools } from '../src/benchmark/checkpoint-gate.mjs';
import { inspectSandbox, executeSandbox } from '../src/benchmark/docker.mjs';
import { createDispatcher } from '../src/benchmark/protocol.mjs';
import { createJevClient } from '../src/client.mjs';
import { loadConfig } from '../src/config.mjs';
import { createGateStateWriter, createMeasuredDecider, validateIdentifiers } from '../src/benchmark/telemetry.mjs';
import { createTokenBudget, BUDGET_ERROR_CODES } from '../src/benchmark/budget.mjs';

// Exported for offline integration tests; importing this module never starts
// Docker, reads credentials, opens a journal or installs a stdin listener.
export async function createBenchmarkRuntime(config, dependencies = {}) {
  if (!config || !['jev', 'baseline'].includes(config.mode)
    || (config.workflow !== undefined && config.workflow !== 'checkpoint-v1')
    || (config.workflow === 'checkpoint-v1' && (typeof config.trustedBrief !== 'string' || !config.trustedBrief.trim()))
    || (config.max_decisions !== null && (!Number.isSafeInteger(config.max_decisions) || config.max_decisions < 1 || config.max_decisions > 10000))
    || typeof config.trace_path !== 'string' || !config.trace_path.trim()
    || (config.gate_state_path !== undefined && (typeof config.gate_state_path !== 'string' || !config.gate_state_path.trim()))) throw new Error('INVALID_CONFIG');
  const identifiers = validateIdentifiers(Object.fromEntries(['run_id', 'attempt_id', 'group_id', 'agent_role']
    .filter(key => Object.hasOwn(config, key)).map(key => [key, config[key]])));
  const statePath = config.gate_state_path ?? join(dirname(config.trace_path), 'gate-state.json');
  if (resolve(statePath) === resolve(config.trace_path)) throw new Error('INVALID_CONFIG');
  await (dependencies.inspect ?? inspectSandbox)(config.container);
  // Exclusive journal means a restarted MCP process cannot silently reset its budget or replay paid calls.
  const journal = openSync(config.trace_path, 'wx', 0o600);
  let closed = false, budget;
  const close = () => { if (!closed) { try { closeSync(journal); } finally { budget?.close(); closed = true; } } };
  const record = async event => {
    writeFileSync(journal, JSON.stringify({ recorded_at: new Date().toISOString(), ...event, ...identifiers }) + '\n');
    fsyncSync(journal);
  };
  const recordState = dependencies.recordState ?? createGateStateWriter(statePath);
  try {
    if (config.mode === 'jev') {
      if (!config.jev_budget && !dependencies.client) throw new Error('JEV_BUDGET_REQUIRED');
      if (config.jev_budget) budget = createTokenBudget(config.jev_budget);
    }
    const client = config.mode === 'jev' ? (dependencies.client ?? createJevClient(loadConfig())) : null;
    const decide = config.mode === 'jev' ? createMeasuredDecider({ client, record, identifiers, budget }) : undefined;
    const factory = config.workflow === 'checkpoint-v1' ? createCheckpointGate : createDecisionGate;
    const gate = factory({ trustedBrief: config.trustedBrief, mode: config.mode, maxDecisions: config.max_decisions, decide, identifiers,
      execute: command => (dependencies.execute ?? executeSandbox)(config.container, command), record, recordState });
    await recordState(gate.status());
    const transportFailure = async () => {
      const failure = { ...gate.status(), state: 'stopped', stop_code: 'MCP_TRANSPORT_FAILED', last_code: 'MCP_TRANSPORT_FAILED',
        last_event: 'stopped', outcome_uncertain: true, recovery_allowed: false };
      try { await record({ event: 'stopped', mode: config.mode, decision_id: failure.last_decision_id,
        code: 'MCP_TRANSPORT_FAILED', recovery_allowed: false, outcome_uncertain: true }); }
      catch { failure.journal_healthy = false; failure.stop_code = 'RECORD_FAILED'; failure.last_code = 'RECORD_FAILED'; }
      await recordState(failure);
    };
    return { gate, dispatch: createDispatcher(gate, config.mode, config.workflow === 'checkpoint-v1' ? checkpointTools(config.mode) : undefined), close, transportFailure };
  } catch (error) {
    close();
    throw new Error(BUDGET_ERROR_CODES.includes(error?.code) ? error.code : 'MCP_STARTUP_FAILED');
  }
}

async function main() {
  let runtime;
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--config') throw new Error('INVALID_CONFIG');
    runtime = await createBenchmarkRuntime(JSON.parse(readFileSync(process.argv[3], 'utf8')));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
      try { runtime.close(); } finally { process.exit(signal === 'SIGINT' ? 130 : 143); }
    });
    const input = createInterface({ input: process.stdin });
    let queue = Promise.resolve();
    let stopped = false;
    input.on('line', line => {
      if (stopped) return;
      queue = queue.then(async () => {
        if (stopped) return;
        if (Buffer.byteLength(line) > 300000) throw new Error('OVERSIZED_REQUEST');
        let message;
        try { message = JSON.parse(line); }
        catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'); return; }
        const result = await runtime.dispatch(message);
        if (result) process.stdout.write(JSON.stringify(result) + '\n');
      }).catch(async () => {
        stopped = true;
        try { await runtime.transportFailure(); } catch {}
        process.stderr.write('Benchmark MCP stopped; inspect the private journal and gate state before restarting.\n');
        runtime.close();
        process.exit(1);
      });
    });
    input.on('close', () => { queue.finally(() => runtime.close()); });
  } catch (error) {
    runtime?.close();
    const code=BUDGET_ERROR_CODES.includes(error?.message)?error.message:'MCP_STARTUP_FAILED';
    process.stderr.write(`${code}: Benchmark MCP startup failed. No automatic retry.\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
