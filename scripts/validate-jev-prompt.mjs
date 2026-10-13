#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,existsSync,realpathSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateJevPrompt,checkJevConnectionWithMock} from '../src/orchestration/jev-prompt-preflight.mjs';

const help = `Offline Jev prompt preflight; no key, live GET/POST, ledger or Docker.
  node scripts/validate-jev-prompt.mjs --request REQUEST.json --stage repair_owners --template inferred-v2 [--policy v1|v2|v3] [--out NEW.json]
  node scripts/validate-jev-prompt.mjs --connection-only [--policy v1|v2|v3] [--out NEW.json]
Only projected inferred-v2 owner questions are supported. Other stages can use validate-jev-input.mjs --policy v4 for adapter checks.
Default policy v1 preserves D074 source pins. D075 explicitly uses v2; an intentional source change may block historical v1.
Output contains fixed codes, counts and hashes, never request text or Authorization headers.
Exit 0: supported structural/mock checks pass; 2: check blocked; 1: invalid CLI/I/O.
Passing does not establish meaning, English quality, exact context fit, live authentication, deployment or performance.
`;
function parse(args) {
  if(args.length===1&&['--help','-h'].includes(args[0]))return {help:true};
  const options={};
  for(let i=0;i<args.length;i++){
    const flag=args[i];
    if(flag==='--connection-only'){if(options.connectionOnly)throw new Error();options.connectionOnly=true;continue;}
    if(!['--request','--stage','--template','--policy','--out'].includes(flag))throw new Error();
    const value=args[++i],key=flag.slice(2);
    if(!value||value.startsWith('--')||options[key]!==undefined)throw new Error();
    options[key]=['request','out'].includes(key)?resolve(value):value;
  }
  if(options.connectionOnly ? options.request||options.stage||options.template : !options.request||!options.stage||!options.template)throw new Error();
  if(options.policy!==undefined&&!['v1','v2','v3'].includes(options.policy))throw new Error();
  if(options.out&&existsSync(options.out))throw new Error();
  if(options.request&&['.env'].includes(basename(options.request)))throw new Error();
  return options;
}
export async function runCLI(args) {
  const options=parse(args);if(options.help){process.stdout.write(help);return 0;}
  let report;
  if(options.connectionOnly)report=await checkJevConnectionWithMock({policy:options.policy??'v1'});
  else {
    // Reads only the explicitly supplied request, never an environment file or arbitrary references in its state.
    if(basename(realpathSync(options.request)).startsWith('.env'))throw new Error();
    const bytes=readFileSync(options.request),before=createHash('sha256').update(bytes).digest('hex');
    report=validateJevPrompt(JSON.parse(bytes),{stage:options.stage,template:options.template,policy:options.policy??'v1'});
    report.connection_mock=await checkJevConnectionWithMock({policy:options.policy??'v1'});
    report.passed=report.passed&&report.connection_mock.passed;
    report.input_file_sha256=before;
    report.input_file_unchanged=before===createHash('sha256').update(readFileSync(options.request)).digest('hex');
    if(!report.input_file_unchanged){report.passed=false;report.reason_codes.push('JEV_PROMPT_INPUT_CHANGED');}
  }
  if(options.out){
    mkdirSync(dirname(options.out),{recursive:true});
    writeFileSync(options.out,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    process.stdout.write(JSON.stringify({report_written:true,passed:report.passed,reason_codes:report.reason_codes??[],performed_calls:{GET:0,POST:0}})+'\n');
  } else process.stdout.write(JSON.stringify(report,null,2)+'\n');
  return report.passed?0:2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{process.exitCode=await runCLI(process.argv.slice(2));}
  catch{process.stderr.write(JSON.stringify({error:'JEV_PROMPT_PREFLIGHT_FAILED',message:'Check arguments, JSON input and a new output path. Use --help.',performed_calls:{GET:0,POST:0}})+'\n');process.exitCode=1;}
}
