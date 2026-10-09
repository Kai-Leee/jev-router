import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSandbox, processResult } from '../src/benchmark/docker.mjs';
import { createDispatcher, benchmarkTools } from '../src/benchmark/protocol.mjs';
import { validateRunConfig, claudeArguments } from '../src/benchmark/launch.mjs';

const sandbox=()=>({Id:'abc',Config:{Labels:{'org.jev-router.benchmark':'true','org.jev-router.benchmark.role':'agent'},WorkingDir:'/app'},HostConfig:{NetworkMode:'none',Memory:1024,NanoCpus:1000000000},Mounts:[],State:{Running:true}});
test('sandbox rejects unrelated, mounted, host-network or stopped containers',()=>{
  assert.equal(assertSandbox(sandbox()),'abc');
  for(const mutate of [s=>delete s.Config.Labels,s=>s.Mounts.push({Source:'/'}),s=>s.HostConfig.NetworkMode='host',s=>s.HostConfig.Privileged=true,s=>s.State.Running=false,s=>s.HostConfig.PidMode='host',s=>s.Config.Labels['org.jev-router.benchmark.role']='verifier',s=>s.HostConfig.Memory=0,s=>s.HostConfig.NanoCpus=0,s=>s.HostConfig.CapAdd=['SYS_ADMIN'],s=>s.HostConfig.SecurityOpt=['seccomp=unconfined']]){
    const value=sandbox();mutate(value);assert.throws(()=>assertSandbox(value),/UNSAFE_SANDBOX/);
  }
});
test('deadline terminates inherited-pipe descendants without waiting for their timer',async()=>{
  const start=performance.now();
  const code=`require('child_process').spawn(process.execPath,['-e','setTimeout(()=>{},10000)'],{stdio:'inherit'});setTimeout(()=>{},10000);`;
  const result=await processResult(process.execPath,['-e',code],{timeoutMs:100,killProcessTree:true});
  assert.equal(result.interrupted,'TIMEOUT');assert.ok(performance.now()-start<3000);
});
test('subprocess records completed nonzero separately from deadline uncertainty',async()=>{
  const fail=await processResult(process.execPath,['-e','process.exit(7)']);assert.equal(fail.exit_code,7);assert.equal(fail.outcome_uncertain,false);
  const timeout=await processResult(process.execPath,['-e','setTimeout(()=>{},5000)'],{timeoutMs:30});assert.equal(timeout.interrupted,'TIMEOUT');assert.equal(timeout.outcome_uncertain,true);
});
test('MCP exposes only decision-controlled tools and hides selected_id from Jev mode',()=>{
  assert.deepEqual(benchmarkTools('jev').map(t=>t.name),['act','finish','status']);
  assert.equal(benchmarkTools('jev')[0].inputSchema.properties.selected_id,undefined);
  assert.ok(benchmarkTools('baseline')[0].inputSchema.required.includes('selected_id'));
});
test('MCP notifications do not execute tools; only calls invoke gate',async()=>{
  let calls=0;const gate={status:()=>({ok:true}),act:async()=>{calls++;return {choice:'a'};}};
  const dispatch=createDispatcher(gate,'jev');
  assert.equal(await dispatch({jsonrpc:'2.0',method:'tools/call',params:{name:'act'}}),null);
  const result=await dispatch({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'act',arguments:{}}});
  assert.equal(calls,1);assert.deepEqual(JSON.parse(result.result.content[0].text),{choice:'a'});
});
test('MCP error never reflects arbitrary callback diagnostics',async()=>{
  const dispatch=createDispatcher({act:async()=>{throw new Error('secret-placeholder');},status:()=>({state:'stopped'})},'jev');
  const response=await dispatch({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'act'}});
  assert.equal(response.result.isError,true);assert.ok(!JSON.stringify(response).includes('secret-placeholder'));
});
const config=()=>({schema_version:'jev-benchmark-run/v1',mode:'jev',container:'jev-test',instructions:['goal.md'],output_dir:'run',claude_max_budget_usd:1,max_decisions:2,wall_timeout_seconds:60,model:'claude-opus-5-5',effort:'medium',auth:'api-key'});
test('runner requires explicit finite paid/time bounds and requested model',()=>{
  assert.equal(validateRunConfig(config(),'/tmp').instructions[0],'/tmp/goal.md');
  for(const mutate of [c=>c.claude_max_budget_usd=0,c=>c.max_decisions=Infinity,c=>c.wall_timeout_seconds=0,c=>c.model='opus',c=>c.key='not-allowed']){const c=config();mutate(c);assert.throws(()=>validateRunConfig(c));}
});
test('Claude launch disables host built-ins, global MCP, skills and fallback',()=>{
  const args=claudeArguments(config(),'/tmp/mcp.json');
  assert.equal(args[args.indexOf('--tools')+1],'');assert.ok(args.includes('--strict-mcp-config'));
  assert.ok(args.includes('--bare'));assert.ok(!args.includes('--fallback-model'));
  assert.equal(args[args.indexOf('--permission-mode')+1],'dontAsk');
});
