#!/usr/bin/env node
// One explicitly requested small decision, sharing the benchmark allowance.
import { readFileSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validateRunConfig } from '../src/benchmark/launch.mjs';
import { createTokenBudget, BUDGET_ERROR_CODES } from '../src/benchmark/budget.mjs';
import { createMeasuredDecider } from '../src/benchmark/telemetry.mjs';
import { createJevClient } from '../src/client.mjs';
import { loadConfig } from '../src/config.mjs';

let budget, journal;
try {
  const [flag, file, traceFlag, trace, spend] = process.argv.slice(2);
  if (process.argv.length !== 7 || flag !== '--config' || traceFlag !== '--trace' || spend !== '--spend') throw new Error('INVALID_ARGUMENTS');
  const configPath = resolve(file);
  const config = validateRunConfig(JSON.parse(readFileSync(configPath, 'utf8')), dirname(configPath));
  if (!config.jev_budget) throw new Error('JEV_BUDGET_REQUIRED');
  journal = openSync(resolve(trace), 'wx', 0o600);
  budget = createTokenBudget(config.jev_budget);
  const record = async event => { writeFileSync(journal, JSON.stringify({recorded_at:new Date().toISOString(),...event})+'\n'); fsyncSync(journal); };
  const decide = createMeasuredDecider({client:createJevClient(loadConfig()), budget, record,
    identifiers:{run_id:'d020-small-decision',attempt_id:'d020-small-decision',group_id:'d020-small-decision',agent_role:'implementation'}});
  const response = await decide({model:'jev-latest',state:'The task is to repair a failing Python unit test.',
    questions:{work_type:{type:'choice',instructions:'Which capability is needed to perform this task?',criteria:{coding:'Inspect and modify software.',writing:'Edit prose without changing software.',abstain:'Insufficient evidence.'}}}}, {decision_id:1});
  console.log(JSON.stringify({status:'completed',model:response.model,choice:response.answers.work_type.choice,
    input_tokens:response.usage.input_tokens,output_tokens:response.usage.output_tokens,
    charged_input_tokens:response.billing.paidInputTokensUsed,billing_mode:response.billing.mode,
    destination:response.receipt.destination,actual_billed_usd:null,budget:budget.snapshot(),automatic_retries:0}));
} catch (error) {
  const allowed = ['INVALID_ARGUMENTS','INVALID_RUN_CONFIG','JEV_BUDGET_REQUIRED','HTTP_ERROR','TRANSPORT_ERROR','INVALID_RESPONSE',...BUDGET_ERROR_CODES];
  console.error(JSON.stringify({status:'stopped',code:allowed.includes(error?.code??error?.message)?error.code??error.message:'CHECK_FAILED',budget:budget?.snapshot()??null,automatic_retries:0}));
  process.exitCode=1;
} finally { if(journal!==undefined)closeSync(journal);budget?.close(); }
