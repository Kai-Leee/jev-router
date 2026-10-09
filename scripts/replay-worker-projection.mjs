#!/usr/bin/env node
// Existing request transformation only. No API/CLI or candidate execution.
import {readFileSync,writeFileSync} from 'node:fs';
import {buildWorkerInput} from '../src/orchestration/worker-inputs.mjs';
const [input,output]=process.argv.slice(2);if(!output)throw Error('Usage: events.jsonl new-output.json');
const rows=readFileSync(input,'utf8').trim().split('\n').map(JSON.parse).filter(e=>e.event==='claude_started'&&e.label!=='planner').map(e=>{
 const r=e.request;return {label:e.label,legacy_bytes:Buffer.byteLength(JSON.stringify(r)),modes:Object.fromEntries(['deduplicated','projected'].map(mode=>{
  const {manifest}=buildWorkerInput({plan:r.plan,task:r.task,brief:r.brief,completedFiles:r.completedFiles,profile:{model:r.model,effort:r.effort},mode,executionMode:e.label.startsWith('single-')?'single':'split'});return [mode,manifest];
 }))};
});
const split=rows.filter(r=>r.label.startsWith('split-'));
const totals={legacy_bytes:split.reduce((n,r)=>n+r.legacy_bytes,0)};
for(const mode of ['deduplicated','projected']){totals[`${mode}_bytes`]=split.reduce((n,r)=>n+r.modes[mode].bytes.request,0);totals[`${mode}_reduction_percent`]=(1-totals[`${mode}_bytes`]/totals.legacy_bytes)*100;}
const result={mode:'offline-stored-input-replay',input,rows,split:totals,limitations:['Bytes exclude system prompts; not provider tokens or cost','No new generated candidate, cache result or grade','Full original brief preserved; only declared dependency evidence selected']};
writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({split:totals,selection:split.map(r=>({label:r.label,selected:r.modes.projected.selectedPaths,excluded:r.modes.projected.excludedPaths}))},null,2));
