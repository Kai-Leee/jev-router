import {readdirSync,lstatSync,openSync,readFileSync,fstatSync,closeSync,constants} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {summarizeRun} from './metrics.mjs';

const MAX_FILE_BYTES=24_000_000;
const MAX_RUNS=200;
const safeName=name=>/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/.test(name);
function readRegular(path,code,issues) {
  let fd;
  try {
    fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const stat=fstatSync(fd);
    if(!stat.isFile()||stat.size>MAX_FILE_BYTES)throw new Error('BOUNDED_REGULAR_FILE_REQUIRED');
    const bytes=readFileSync(fd);
    if(bytes.length>MAX_FILE_BYTES)throw new Error('BOUNDED_REGULAR_FILE_REQUIRED');
    return bytes;
  } catch(error) {
    if(error.code!=='ENOENT')issues.push(`${code}_unreadable`);
    return null;
  } finally {if(fd!==undefined)closeSync(fd);}
}
function json(path,code,issues) {
  const bytes=readRegular(path,code,issues);
  if(bytes===null)return null;
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{issues.push(`${code}_invalid_json`);return null;}
}
function jsonl(path,code,issues) {
  const bytes=readRegular(path,code,issues);
  if(bytes===null)return [];
  const values=[];
  let offset=0,records=0;
  while(offset<bytes.length) {
    const end=bytes.indexOf(10,offset);
    // A writer may pause halfway through a UTF-8 character. Decode only complete rows.
    if(end<0){issues.push(`${code}_pending_line`);break;}
    const row=bytes.subarray(offset,end);offset=end+1;
    if(++records>30000){issues.push(`${code}_record_limit`);break;}
    try{
      const line=new TextDecoder('utf-8',{fatal:true}).decode(row);
      if(line.trim())values.push(JSON.parse(line));
    }catch{issues.push(`${code}_invalid_jsonl`);}
  }
  return values;
}
function directory(path) {try{return lstatSync(path).isDirectory()&&!lstatSync(path).isSymbolicLink();}catch{return false;}}
function hasRunFiles(path) {
  try{return readdirSync(path).some(name=>['manifest.json','result.json','decisions.jsonl','claude.stream.jsonl',
    'runner.jsonl','runner-heartbeat.json','gate-state.json','monitor-report.json'].includes(name));}
  catch{return false;}
}

export function readSnapshot(roots,{now=()=>new Date().toISOString()}={}) {
  const generatedAt=now();
  const runs=[],warnings=[];
  const add=(dir,id)=>{
    if(runs.length>=MAX_RUNS){warnings.push('run_limit_reached');return;}
    const issues=[];
    const manifest=json(join(dir,'manifest.json'),'manifest',issues);
    const result=json(join(dir,'result.json'),'result',issues);
    const decisions=jsonl(join(dir,'decisions.jsonl'),'decisions',issues);
    const claudeEvents=jsonl(join(dir,'claude.stream.jsonl'),'claude',issues);
    const runnerEvents=jsonl(join(dir,'runner.jsonl'),'runner',issues);
    const heartbeat=json(join(dir,'runner-heartbeat.json'),'heartbeat',issues);
    const gateState=json(join(dir,'gate-state.json'),'gate_state',issues);
    const monitorReport=json(join(dir,'monitor-report.json'),'monitor_report',issues);
    // Older completed runner output was one JSON object rather than a stream.
    if(!claudeEvents.length) {
      const legacy=json(join(dir,'claude.stdout.json'),'claude',issues);
      if(legacy&&typeof legacy==='object')claudeEvents.push(legacy);
    }
    runs.push(summarizeRun({id,manifest,result,decisions,claudeEvents,runnerEvents,heartbeat,gateState,monitorReport,issues,observedAt:generatedAt}));
  };
  for(let index=0;index<roots.length;index++) {
    const root=resolve(roots[index]);
    if(!directory(root)){warnings.push('run_root_unavailable');continue;}
    if(hasRunFiles(root))add(root,`r${index}-${safeName(basename(root))?basename(root):'run'}`);
    let entries;try{entries=readdirSync(root,{withFileTypes:true});}catch{warnings.push('run_root_unreadable');continue;}
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
      if(!entry.isDirectory()||entry.isSymbolicLink()||!safeName(entry.name))continue;
      const child=join(root,entry.name);
      if(directory(child)&&hasRunFiles(child))add(child,`r${index}-${entry.name}`);
    }
  }
  return {schema_version:'jev-dashboard/v1',generated_at:generatedAt,warnings:[...new Set(warnings)],runs};
}
