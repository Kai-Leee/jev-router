import {readFileSync, writeFileSync, mkdirSync, readdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'docs/visualizations/jev-dag-explorer');
const sources=new Map();
const sha=x=>createHash('sha256').update(x).digest('hex');
const read=p=>{const raw=readFileSync(resolve(root,p));sources.set(p,{path:p,sha256:sha(raw)});return JSON.parse(raw);};
const text=p=>{const raw=readFileSync(resolve(root,p));sources.set(p,{path:p,sha256:sha(raw)});return raw.toString('utf8');};
const base='benchmark-runs/d070-comparison-01/jev_all';
const planning=read(`${base}/planning.json`),analysis=read('benchmark-runs/d070-analysis-01/analysis.json');
const events=text(`${base}/events.jsonl`).trim().split('\n').map(JSON.parse);
const manifest=read('benchmarks/e2e-swe/manifests/d070-adaptive.json');
const contracts={decomposition:read('docs/orchestration/contracts/adaptive-decomposition.v2.json'),dag:read('docs/orchestration/contracts/adaptive-dag.v1.json'),repair:read('docs/orchestration/contracts/adaptive-artifact-repair.v2.json')};
const sourceFiles=['src/orchestration/adaptive-dag-planner.mjs','src/orchestration/adaptive-decomposition-balancing.mjs','src/orchestration/artifact-dag.mjs','src/orchestration/dag-scheduler.mjs','src/orchestration/adaptive-dag-execution.mjs','src/orchestration/adaptive-artifact-repair-v2.mjs','src/orchestration/adaptive-artifact-repair.mjs','src/benchmark/adaptive-dag-runner.mjs','src/client.mjs'];
const launch=read('benchmark-runs/d070-preflight/launch-gate.json');
for(const p of sourceFiles){text(p);const pin=launch.pins.find(x=>x.path===p);if(!pin||pin.sha256!==sources.get(p).sha256)throw Error(`SOURCE_DRIFT:${p}`);}
const receipts=readdirSync(resolve(root,base,'receipts')).filter(x=>x.endsWith('.json')).sort().map(f=>read(`${base}/receipts/${f}`));
const jev=receipts.filter(x=>x.provider==='jev');
const selected=[],network=[],counts={};let request=null,requestEvent=null,receipt=null,options=null,next=0;
for(const e of events){
 if(e.event==='adaptive_balancing_options_prepared')options=e;
 if(e.event==='adaptive_decision_requested'){
  receipt=jev[next++]; if(!receipt)throw Error('MISSING_RECEIPT');
  request=read(`${base}/calls/${receipt.id}.request.json`);requestEvent=e;
  if(JSON.stringify(request)!==JSON.stringify(e.request)||receipt.decision_id!==e.decision_id)throw Error('REQUEST_BINDING');
 }
 if(e.event!=='adaptive_decision_selected')continue;
 const call={uid:`step-${selected.length+1}`,decision_id:e.decision_id,kind:e.kind,stage:e.stage,method:e.selection_method,elapsed_ms:e.elapsed_ms,selections:e.selections,node_id:request?(request.state.node?.id??request.state.node_id??null):(options?.node_id??null),unit_id:request?(request.state.unit_id??null):(options?.unit_id??null)};
 if(e.selection_method==='typed_choice'){
  if(!request||!receipt)throw Error('MISSING_REQUEST');
  const raw=read(`${base}/calls/${receipt.id}.response.json`);
  for(const [id,value]of Object.entries(e.selections))if(raw.answers[id]?.choice!==value)throw Error('ANSWER_BINDING');
  Object.assign(call,{id:receipt.id,receipt:{status:receipt.status,wall_ms:receipt.wall_ms,input_tokens:receipt.usage.input_tokens,output_tokens:receipt.usage.output_tokens,equivalent_usd:receipt.api_equivalent_usd,actual_billed_usd:receipt.actual_billed_usd},request,request_elapsed_ms:requestEvent.elapsed_ms,wire_bytes:Buffer.byteLength(JSON.stringify(request)),response:{model:raw.model,answers:Object.fromEntries(Object.entries(raw.answers).map(([k,v])=>[k,{type:v.type,choice:v.choice}])),usage:raw.usage},request_path:`${base}/calls/${receipt.id}.request.json`,response_path:`${base}/calls/${receipt.id}.response.json`,receipt_path:`${base}/receipts/${receipt.id}.json`});
  network.push(call);counts[call.kind]=(counts[call.kind]??0)+1;
 }else{
  call.id=`local-${selected.filter(x=>x.method==='local_singleton').length+1}`;
  call.local={criteria:options?.criteria??{},node_id:options?.node_id??null,unit_id:options?.unit_id??null};
 }
 selected.push(call);request=null;receipt=null;requestEvent=null;
}
if(next!==50||network.length!==50||selected.length!==68)throw Error('CALL_COUNTS');
const edgeList=planning.relations.filter(r=>r.choice!=='no_dependency').map(r=>({from:r.choice==='a_requires_b'?r.task_b_id:r.task_a_id,to:r.choice==='a_requires_b'?r.task_a_id:r.task_b_id,question_id:r.question_id,choice:r.choice}));
if(edgeList.length!==8)throw Error('EDGE_COUNT');
const dagAnalysisModule=await import('../src/orchestration/artifact-dag.mjs');
const dagAnalysis=dagAnalysisModule.analyzeDag(planning.plan);
const workerRows=analysis.fresh_development.worker_intervals.map(row=>{const rec=receipts.find(x=>x.id===row.id);return {...row,equivalent_usd:rec.api_equivalent_usd,total_tokens:rec.usage.input_tokens+rec.usage.output_tokens+rec.usage.cache_creation_input_tokens+rec.usage.cache_read_input_tokens};});
const ko={n6:'런타임·모델 템플릿',n7:'CLI · 기본값 · 모델 구성',n8:'Union · Operation · 진단',n10:'이름 · 타입 · Enum',n11:'설정 · 후처리 Hook',n12:'메타데이터 · 생성기',n13:'설치 · 패키징',n14:'Endpoint 템플릿',n15:'문서 로딩 · 참조 해석',n16:'중간 표현 IR'};
const nodes=planning.leaves.map(leaf=>({...leaf,title_ko:ko[leaf.node_id],task:planning.plan.tasks.find(t=>t.id===leaf.id),workers:workerRows.filter(x=>x.task_id===leaf.id)}));
const samples={split:network.find(x=>x.kind==='split_count').id,membership:network.find(x=>x.kind==='membership').id,recursive:network.find(x=>x.kind==='split_count'&&x.node_id!=='n0').id,relation:network.find(x=>x.stage==='relations').id,repair:network.find(x=>x.stage==='repair').id};
const review=read('benchmark-runs/d070-review/postrun-review-01.json');
const data={schema_version:'jev-dag-explorer/v1',snapshot:'D070 · 2026-10-11',generated_at:new Date().toISOString(),mode:'recorded_local_replay_no_inference',endpoint:'https://jev-ai.pro/api/v1/systemone',model:'jev-latest',manifest:{worker_profile:manifest.worker_profile,limits:manifest.limits,max_repair_rounds:manifest.max_repair_rounds,catalog_reuse:manifest.catalog_reuse.preparation_directory},contracts,policy:planning.decomposition_policy,catalog:planning.catalog,tree:planning.tree,nodes,edges:edgeList,relations:planning.relations,verification:planning.plan.tasks.find(x=>x.id==='verify-public'),dagAnalysis,calls:selected,counts,samples,workerRows,metrics:{arm_ms:analysis.fresh_development.wall_ms.arm,grade_ms:analysis.fresh_development.wall_ms.grade,tokens:analysis.fresh_development.accounting.usage.total_tokens_including_cache,cost:analysis.fresh_development.accounting.usage.official_rate_equivalent_usd,public:85,independent:63,additional:0,additional_total:8,broader_goal_achieved:review.broader_equivalent_quality_objective_achieved},source_pins:[...sources.values()],boundaries:['Catalog is source-backed and historically Claude-prepared; D070 reuses identical bytes without a new preparation call.','Jev selects choices inside controller-provided legal options; catalog units are indivisible.','The decomposition tree is not the execution DAG. Artifact consumption creates execution edges.','Actual D070 profiles are fixed Opus5.5 medium; this run does not select each worker model/effort.','All initial durations are unknown; critical_path_ms is null and original task order is the scheduler tie-break.','Response display selects model, type, choice and usage; request bodies are the complete saved bodies and contain no authorization header.','Additional public diagnostic is separate from original85+63 gates; quality regression blocks broader success.']};
mkdirSync(output,{recursive:true});
const serialized=JSON.stringify(data).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
const template=readFileSync(resolve(output,'template.html'),'utf8');
if(template.split('__DATA__').length!==2)throw Error('TEMPLATE_PLACEHOLDER');
const html=template.replace('__DATA__',serialized);
writeFileSync(resolve(output,'index.html'),html);
writeFileSync(resolve(output,'provenance.json'),JSON.stringify({generated_at:data.generated_at,source_pins:data.source_pins,build_command:'node scripts/build-dag-explorer.mjs',html_sha256:sha(html),html_bytes:Buffer.byteLength(html),network_calls:0,counts:{nodes:nodes.length,verification_nodes:1,tree_nodes:data.tree.length,selected_dependency_edges:edgeList.length,jev_posts:network.length,local_decisions:selected.length-network.length,by_kind:counts},runtime_source_pins_match:true},null,2)+'\n');
console.log(JSON.stringify({path:'docs/visualizations/jev-dag-explorer/index.html',bytes:Buffer.byteLength(html),calls:network.length,local:selected.length-network.length,counts,source_pins:sources.size}));
