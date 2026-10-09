import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,existsSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {processResult} from '../src/benchmark/docker.mjs';

test('normal provider exit gives its budget-owning child time to close the shared ledger',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'jev-budget-lifecycle-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const ledger=join(directory,'budget.json'),worker=join(directory,'worker.mjs'),parent=join(directory,'parent.mjs');
  writeFileSync(worker,`import {createTokenBudget} from ${JSON.stringify(new URL('../src/benchmark/budget.mjs',import.meta.url).href)};
const b=createTokenBudget({schema_version:'jev-token-budget/v1',ledger_path:process.argv[2],max_usd:1,usd_per_million_input_tokens:0.6,reserve_input_tokens:65536});
process.on('SIGTERM',()=>{b.close();process.exit(0);});
setInterval(()=>{},1000);process.send('ready');`);
  writeFileSync(parent,`import {fork} from 'node:child_process';const child=fork(process.argv[2],[process.argv[3]],{stdio:['ignore','ignore','ignore','ipc']});child.once('message',()=>{child.disconnect();process.exit(0);});`);
  const result=await processResult(process.execPath,[parent,worker,ledger],{killProcessTree:true,timeoutMs:5000});
  assert.equal(result.exit_code,0);assert.equal(result.outcome_uncertain,false);
  assert.equal(existsSync(ledger+'.lock'),false);
  assert.equal(JSON.parse(readFileSync(ledger)).charged_input_tokens,0);
});
