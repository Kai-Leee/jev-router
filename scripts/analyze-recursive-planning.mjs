#!/usr/bin/env node
import {readFileSync,writeFileSync,readdirSync,existsSync,realpathSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {validateRecursivePlan} from '../src/orchestration/recursive-task-tests.mjs';

const root=resolve(import.meta.dirname,'..');
const run=realpathSync(resolve(root,process.argv[2]??'benchmark-runs/d056-recursive-01'));
if(relative(root,run).startsWith('..'))throw new Error('RUN_OUTSIDE_REPOSITORY');
const read=path=>JSON.parse(readFileSync(join(run,path),'utf8'));
const result=read('result.json'),{input}=read('inputs.json');
const plan=existsSync(join(run,'plan.json'))?read('plan.json'):null;
const events=readFileSync(join(run,'events.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const receipts=readdirSync(join(run,'receipts')).filter(p=>p.endsWith('.json')).sort().map(p=>read(`receipts/${p}`));
const http=events.filter(e=>e.event==='inference_finished');
const timing=http.map(e=>e.duration_ms).filter(Number.isFinite).sort((a,b)=>a-b);
const sizes=events.filter(e=>e.event==='planning_request_prepared').map(e=>e.body_bytes).filter(Number.isFinite);
const quantile=q=>timing.length?timing[Math.ceil(q*timing.length)-1]:null;
const sum=(a,key)=>a.reduce((n,r)=>n+(Number.isFinite(r[key])?r[key]:0),0);
const leaves=plan?.tasks.filter(t=>!t.children.length)??[];
const title=new Map(input.obligations.map(o=>[o.id,o.title??o.text]));
const stages={};
for(const receipt of receipts){
  const row=stages[receipt.stage]??={requests:0,completed:0,known_input_tokens:0,wall_ms:0};
  row.requests++;row.completed+=receipt.status==='completed';
  row.known_input_tokens+=receipt.usage?.input_tokens??0;row.wall_ms+=receipt.wall_ms;
}
const analysis={schema_version:'recursive-planning-analysis/v1',run:relative(root,run),mode:result.mode,status:result.status,
  structural_validation:plan?validateRecursivePlan({input,tasks:plan.tasks,tests:plan.tests}):null,
  source_obligations:input.obligations.length,source_tests:input.tests.length,
  unique_owned_obligations:new Set(leaves.flatMap(t=>t.obligation_ids)).size,
  all_nodes:plan?.tasks.length??null,leaves:leaves.length,max_depth:leaves.length?Math.max(...leaves.map(t=>t.depth)):null,
  leaf_obligation_counts:leaves.map(t=>({id:t.id,count:t.obligation_ids.length,planning_status:t.planning_status,method:t.review?.provenance?.method??null})),
  retained_test_specs:plan?.tests.length??null,executable_tests_run:result.executable_tests_run,
  shared_write_paths:[...new Set(leaves.flatMap(t=>t.write_serialization.map(s=>s.path)))],
  planning_wall_ms:result.wall_ms,http_requests_observed:http.length,http_duration_sum_ms:timing.length?sum(http,'duration_ms'):null,
  http_p50_ms:quantile(.5),http_p95_ms:quantile(.95),max_body_bytes:sizes.length?Math.max(...sizes):null,
  stages,usage:result.usage,issues:result.issues,source_changes_during_run:result.source_changes_during_run,
  observations:'Task ownership and test mappings are structural evidence; test specification quality, execution safety and whole-task efficiency remain unmeasured.'};
const text=['# D056 실제 작업·테스트 계획', '', `실행: ${analysis.run}`, `상태: ${result.status}; 모드: ${result.mode}.`,
  '', `공개 의무 ${input.obligations.length}개, 테스트 명세 ${input.tests.length}개. 최종 leaf ${leaves.length}개, 최대 깊이 ${analysis.max_depth??'미확인'}.`,
  '작업자 실행과 제품 테스트는 수행하지 않았다. 아래 제목은 원문 항목 제목을 표시한 것이며 Jev가 자유 서술로 생성한 이름이 아니다.', '',
  '## 분할 트리',''];
if(plan){
  text.push('```text');
  const show=id=>{const task=plan.tasks.find(t=>t.id===id);text.push(`${'  '.repeat(task.depth)}${task.id}: ${task.children.length?'집계':'leaf'} / 의무 ${task.obligation_ids.length}개 / ${task.planning_status}`);task.children.forEach(show);};
  show(plan.tasks.find(t=>t.parent_id===null).id);
  text.push('```','');
}
for(const task of leaves){
  text.push(`## ${task.id}`,'',`계획 상태: ${task.planning_status}; 판단 출처: ${task.review?.provenance?.method??'미검토'}.`,
    `잠재 수정 범위: ${task.write_scope.map(p=>'`'+p+'`').join(', ')}.`,
    `연결 테스트: ${task.test_ids.length}개. 공유 파일 잠금 필요 경로: ${task.write_serialization.map(s=>s.path).join(', ')||'없음'}.`,'');
  for(const id of task.obligation_ids)text.push(`- ${id}: ${title.get(id)}`);
  text.push('');
}
text.push('## 테스트 목록','', '모든 항목은 명세이며 `runner_ref: null`, `status: not_run`이다. 실제 입력과 예상 결과는 `tests.json`에 그대로 보존한다.','');
for(const test of plan?.tests??[])text.push(`- ${test.id}: ${test.scenario} — ${test.scope}; 담당 ${test.task_ids.join(', ')}.`);
text.push('', '## 해석 경계','', '미선언 의존 관계는 독립성을 뜻하지 않는다. 수정 경로는 D052에서 가져온 보수적인 관련 범위이며 실제 파일 소유권 확정이 아니다. 구조 검사를 통과해도 제품 구현·성능 개선은 입증되지 않는다.','');
if(process.argv.includes('--write')){
  writeFileSync(join(run,'analysis.json'),JSON.stringify(analysis,null,2)+'\n',{flag:'wx',mode:0o600});
  writeFileSync(join(run,'TASKS.md'),text.join('\n'),{flag:'wx',mode:0o600});
}
console.log(JSON.stringify(analysis,null,2));
