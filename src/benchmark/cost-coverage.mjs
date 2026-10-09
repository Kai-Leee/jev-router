// Receipt coverage, not invoice reconciliation. Missing terminal/settlement is unknown.
export function jevCostCoverage(events){
 const started=events.filter(x=>x.event==='inference_started');
 const finished=events.filter(x=>x.event==='inference_finished');
 const reservations=events.filter(x=>x.event==='budget_reserved');
 const settlements=events.filter(x=>x.event==='budget_settled');
 const safeInteger=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:typeof v==='string'&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))?Number(v):null;
 const unique=a=>a.every(x=>typeof x.request_id==='string')&&new Set(a.map(x=>x.request_id)).size===a.length;
 const zero=v=>v===0||typeof v==='string'&&/^0(?:\.0+)?$/.test(v);
 const successful=finished.filter(x=>x.status==='completed');
 const idsMatch=unique(started)&&unique(finished)&&started.length===finished.length&&started.every(x=>finished.some(y=>y.request_id===x.request_id));
 const settled=unique(reservations)&&unique(settlements)&&reservations.length===settlements.length&&reservations.every(x=>settlements.some(y=>y.request_id===x.request_id));
 const billingKnown=successful.length===finished.length&&successful.every(x=>x.billing?.mode==='tokens'&&zero(x.billing?.creditsCharged)&&safeInteger(x.billing?.paidInputTokensUsed)!==null);
 const complete=idsMatch&&settled&&billingKnown&&(started.length===0?reservations.length===0:reservations.length===started.length&&started.every(x=>reservations.some(y=>y.request_id===x.request_id)));
 const charged=complete?successful.reduce((s,x)=>s+safeInteger(x.billing.paidInputTokensUsed),0):null;
 return {attempts_started:started.length,terminal_receipts:finished.length,successful_calls:successful.length,coverage_complete:complete,charged_input_tokens:charged,
 monthly_allocation_usd:charged===null?null:charged*29/60000000,conservative_budget_usd:charged===null?null:charged*.6/1e6};
}
