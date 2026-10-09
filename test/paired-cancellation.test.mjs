import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Evaluate the actual controller with fake child processes and disk visibility.
// No benchmark, Claude, Docker or network process can be launched by these mocks.
const controller=fileURLToPath(new URL('../bin/paired-run.mjs',import.meta.url));
const worker=String.raw`
  const {readFileSync}=await import('node:fs');
  const {EventEmitter}=await import('node:events');
  const vm=await import('node:vm');
  const path=await import('node:path');
  const url=await import('node:url');
  const [file,scenario,signal]=process.argv.slice(1);
  const fakeProcess=new EventEmitter();
  Object.assign(fakeProcess,{argv:['node',file,'--config','/tmp/mock-config.json','--spend'],execPath:process.execPath});
  let manifestReady=false;
  const calls=[],children=[],output=[];
  const mocked={
    'node:child_process':{spawn(_command,args){
      const script=path.basename(args[0]),child=new EventEmitter();
      child.kill=received=>{calls.push({kind:'signal',script,signal:received});return true;};
      children.push(child);calls.push({kind:'spawn',script});
      if(script==='benchmark-monitor.mjs')queueMicrotask(()=>{
        if(scenario==='both-active')fakeProcess.emit(signal);
        children[0].emit('close',scenario==='both-active'?1:0);
        child.emit('close',scenario==='both-active'?1:0);
      });
      return child;
    }},
    'node:fs':{readFileSync(){return '{}';},existsSync(p){return p.endsWith('manifest.json')&&manifestReady;}},
    'node:path':path,'node:url':url,
    'node:timers/promises':{async setTimeout(){
      if(scenario==='before-monitor')fakeProcess.emit(signal);
      manifestReady=true;
      if(scenario==='before-monitor')children[0].emit('close',1);
      if(scenario==='already-completed')children[0].emit('close',0);
    }},
    '../src/benchmark/launch.mjs':{validateRunConfig(){return {mode:'jev',output_dir:'/tmp/mock-output'};}}
  };
  const context=vm.createContext({process:fakeProcess,console:{log:s=>output.push(s),error:s=>output.push(s)},URL});
  const main=new vm.SourceTextModule(readFileSync(file,'utf8'),{context,identifier:file,initializeImportMeta(meta){meta.url=url.pathToFileURL(file).href;}});
  await main.link(specifier=>{
    const values=mocked[specifier];if(!values)throw Error('UNEXPECTED_IMPORT');
    return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value);},{context});
  });
  await main.evaluate();
  console.log(JSON.stringify({calls,exit_code:fakeProcess.exitCode,output}));
`;
const evaluate=(scenario,signal='SIGINT')=>JSON.parse(execFileSync(process.execPath,
  ['--no-warnings','--experimental-vm-modules','--input-type=module','-e',worker,controller,scenario,signal],
  {encoding:'utf8',timeout:5000}));

for(const signal of ['SIGINT','SIGTERM'])test(`${signal} before monitor startup prevents a new paid-role process`,()=>{
  const result=evaluate('before-monitor',signal);
  assert.deepEqual(result.calls,[{kind:'spawn',script:'benchmark-run.mjs'},
    {kind:'signal',script:'benchmark-run.mjs',signal}]);
  assert.notEqual(result.exit_code,0);
});

test('cancellation reaches both already-active children and the controller waits for closure',()=>{
  const result=evaluate('both-active');
  assert.deepEqual(result.calls,[{kind:'spawn',script:'benchmark-run.mjs'},{kind:'spawn',script:'benchmark-monitor.mjs'},
    {kind:'signal',script:'benchmark-run.mjs',signal:'SIGINT'},{kind:'signal',script:'benchmark-monitor.mjs',signal:'SIGINT'}]);
  assert.notEqual(result.exit_code,0);
  assert.equal(JSON.parse(result.output[0]).monitor_exit,1);
});

test('normal implementation completion still receives one independent terminal observation',()=>{
  const result=evaluate('already-completed');
  assert.deepEqual(result.calls,[{kind:'spawn',script:'benchmark-run.mjs'},{kind:'spawn',script:'benchmark-monitor.mjs'}]);
  assert.equal(result.exit_code,0);
  assert.equal(JSON.parse(result.output[0]).automatic_retries,0);
});
