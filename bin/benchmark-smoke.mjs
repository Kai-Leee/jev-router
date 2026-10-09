#!/usr/bin/env node
// Exercises the real MCP process and real sandbox, using baseline mode only. No model APIs.
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { connectMcp } from '../src/mcp.mjs';
import { inspectSandbox, executeSandbox } from '../src/benchmark/docker.mjs';

if (process.argv.length !== 3) throw new Error('Usage: node bin/benchmark-smoke.mjs jev-CONTAINER');
const container=process.argv[2];
await inspectSandbox(container);
const dir=mkdtempSync(resolve('benchmark-runs/mcp-smoke-'));
const config=join(dir,'server.json');
writeFileSync(config,JSON.stringify({mode:'baseline',container,max_decisions:2,trace_path:join(dir,'decisions.jsonl')}),{mode:0o600});
const mcp=await connectMcp({command:process.execPath,args:[resolve('bin/benchmark-mcp.mjs'),'--config',config],env:{PATH:process.env.PATH,HOME:process.env.HOME}},{timeoutMs:15000});
try {
  const listed=await mcp.request('tools/list');
  const before=await mcp.tool('status');
  const action=await mcp.tool('act',{purpose:'Verify isolated shell execution through the chosen candidate only.',state:'This is an infrastructure smoke test; no model calls are permitted.',candidates:[
    {id:'chosen',description:'Write and read a synthetic controller marker in the isolated workspace.',command:"printf 'controller-ok\\n' > /app/controller-smoke.txt; cat /app/controller-smoke.txt"},
    {id:'not_chosen',description:'Write an unwanted marker; this must not run.',command:'touch /app/should-not-exist'}
  ],selected_id:'chosen'});
  const finished=await mcp.tool('finish',{purpose:'Finish the infrastructure smoke only.',state:'Selected command returned its marker; this is not product evaluation.'});
  const observation=await executeSandbox(container,'test ! -e /app/should-not-exist && test ! -e /tests && cat /app/controller-smoke.txt');
  if(action.choice!=='chosen'||observation.exit_code!==0||observation.stdout.trim()!=='controller-ok'||!finished.completion_claimed)throw new Error('SMOKE_FAILED');
  const events=readFileSync(join(dir,'decisions.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  const result={model_calls:0,tools:listed.tools.map(t=>t.name),before,selected:action.choice,completion_claimed:finished.completion_claimed,evaluator_success:null,unselected_action_absent:true,hidden_tests_absent:true,journal_events:events.length,run_directory:dir};
  writeFileSync(join(dir,'result.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(result,null,2));
} finally {mcp.close();}
