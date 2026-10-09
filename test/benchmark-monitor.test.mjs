import test from 'node:test';
import assert from 'node:assert/strict';
import {monitorArguments,monitorDefinition,monitorCompletion,monitorFingerprint,monitorTerminal,finishMonitor,MONITOR_MODEL} from '../src/benchmark/monitor.mjs';
import {processResult} from '../src/benchmark/docker.mjs';
test('monitor has exact requested model, separate role and zero execution tools',()=>{
  const args=monitorArguments('agents.json','mcp.json');
  assert.equal(args[args.indexOf('--model')+1],MONITOR_MODEL);
  assert.equal(args[args.indexOf('--agent')+1],'benchmark-monitor');
  assert.equal(args[args.indexOf('--tools')+1],'');assert.ok(!args.includes('--max-budget-usd'));
  assert.deepEqual(monitorDefinition('role')['benchmark-monitor'].tools,[]);
});
test('polling time and token changes do not trigger model calls but incident changes do',()=>{
  const run={id:'r0-test',status:'running',providers:[{tokens:1}],execution:{heartbeat_at:'first'},incidents:[]};
  assert.equal(monitorFingerprint(run),monitorFingerprint({...run,providers:[{tokens:99}],execution:{heartbeat_at:'later'}}));
  assert.notEqual(monitorFingerprint(run),monitorFingerprint({...run,incidents:[{code:'TOOL_FAILED'}]}));
  assert.equal(monitorTerminal(run),false);assert.equal(monitorTerminal({...run,execution:{runner_status:'completed',phase:'terminal'}}),true);
  assert.equal(monitorTerminal({...run,status:'uncertain',execution:{runner_status:'uncertain',phase:'provider'}}),false);
});
test('monitor rejects identity drift, malformed reports and uncertain completion',()=>{
  const final={type:'result',subtype:'success',is_error:false,modelUsage:{[MONITOR_MODEL]:{}},result:JSON.stringify({assessment:'ok',evidence:[],next_action:'Observe',limitations:[]})};
  const result={exit_code:0,outcome_uncertain:false,stdout:JSON.stringify(final)};
  assert.equal(monitorCompletion(result).status,'completed');
  assert.equal(monitorCompletion({...result,outcome_uncertain:true}).status,'uncertain');
  assert.equal(monitorCompletion({...result,stdout:JSON.stringify({...final,modelUsage:{other:{}}})}).code,'MODEL_IDENTITY_MISMATCH');
  assert.equal(monitorCompletion({...result,stdout:JSON.stringify({...final,result:'ok'})}).code,'MONITOR_REPORT_INVALID');
  assert.equal(monitorCompletion({...result,stdout:JSON.stringify({...final,is_error:true})+'\n'+result.stdout}).code,'PROVIDER_FINAL_CONFLICT');
  assert.equal(monitorCompletion({...result,stdout:'malformed\n'+result.stdout}).code,'PROVIDER_FINAL_INVALID');
});
test('terminal journal failure downgrades saved monitor success atomically without losing usage',()=>{
  const writes=[];let journal=0;
  const result=finishMonitor({runner_status:'completed',claude_usage:{input_tokens:5}},{save:(value,atomic)=>writes.push({value,atomic}),event:()=>{journal++;throw new Error('disk');}});
  assert.equal(result.runner_status,'uncertain');assert.equal(writes[1].atomic,true);assert.equal(writes[1].value.claude_usage.input_tokens,5);assert.equal(journal,1);
});
test('aborting monitor subprocess stops it with uncertain outcome and no replay',async()=>{
  const controller=new AbortController();
  const pending=processResult(process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMs:10000,killProcessTree:true,abortSignal:controller.signal});
  setTimeout(()=>controller.abort(),25);
  const result=await pending;assert.equal(result.interrupted,'CANCELLED');assert.equal(result.outcome_uncertain,true);
  await assert.rejects(processResult(process.execPath,['-e','process.exit(0)'],{abortSignal:controller.signal}),/PROCESS_ABORTED/);
});
