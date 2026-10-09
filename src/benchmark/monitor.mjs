import {createHash} from 'node:crypto';
import {providerOutcome} from './runner.mjs';

export const MONITOR_MODEL='claude-opus-5-5';
export const MONITOR_AGENT='benchmark-monitor';
const terminal=new Set(['completed','failed','uncertain']);
// Snapshot inputs have already passed the dashboard's allowlisted projection.
// Exclude activity/tokens/heartbeat times from triggering new paid interpretations.
export function monitorFingerprint(run) {
  const stable={run_id:run.run_id??run.id,status:run.status,
    gate:run.execution?.gate_status??run.execution?.gate?.state??null,
    incidents:run.incidents??[],warnings:run.warnings??[],evaluation:run.evaluation};
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
export function monitorTerminal(run) {
  // A stale heartbeat may project "uncertain" while the attempt is still alive.
  return run.execution?.phase==='terminal'&&terminal.has(run.execution?.runner_status);
}
export function monitorArguments(agentsFile,mcpFile) {
  return ['--print','--restricted','--model',MONITOR_MODEL,'--effort','medium',
    '--agent',MONITOR_AGENT,'--agents',agentsFile,'--tools','',
    '--strict-mcp-config','--mcp-config',mcpFile,'--setting-sources','',
    '--disable-slash-commands','--no-chrome','--permission-mode','dontAsk',
    '--permission-prompts','none','--no-session-persistence','--output-format','stream-json','--verbose'];
}
export function monitorDefinition(prompt) {
  return {[MONITOR_AGENT]:{description:'Read sanitized benchmark state and report failures independently.',
    prompt,model:MONITOR_MODEL,tools:[],permissionMode:'dontAsk',omitClaudeMd:true}};
}
export function monitorCompletion(result) {
  const provider=providerOutcome(result,MONITOR_MODEL);
  const {completion:final,models,identity}=provider;
  let report=null;
  try {
    const text=final?.result?.trim()?.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
    const parsed=JSON.parse(text);
    if(['ok','attention','failed','uncertain'].includes(parsed.assessment)&&
      Array.isArray(parsed.evidence)&&parsed.evidence.every(s=>typeof s==='string')&&
      typeof parsed.next_action==='string'&&Array.isArray(parsed.limitations)&&parsed.limitations.every(s=>typeof s==='string'))report=parsed;
  }catch{}
  const status=provider.status==='completed'&&!report?'failed':provider.status;
  const code=provider.code??(!report?'MONITOR_REPORT_INVALID':null);
  return {final,report,status,code,models,identity};
}

export function finishMonitor(summary,{save,event}) {
  let saved=false;
  try {save(summary,false);saved=true;event(summary);return summary;}
  catch {
    const uncertain={...summary,runner_status:'uncertain',runner_error_code:'MONITOR_RECORD_OR_START_FAILED',outcome_uncertain:true};
    try {save(uncertain,true);}catch{}
    // Use the independent channel if result writing failed. Never retry a failed journal write.
    if(!saved)try {event(uncertain);}catch{}
    return uncertain;
  }
}
