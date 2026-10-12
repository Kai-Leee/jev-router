import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createJevClient,prepareDecision} from '../src/client.mjs';
import {validateJevPrompt,jevPromptPolicy,checkJevConnectionWithMock} from '../src/orchestration/jev-prompt-preflight.mjs';

const fixture=()=>JSON.parse(readFileSync('examples/jev-preflight/inferred-v2.request.json'));
const options={stage:'repair_owners',template:'inferred-v2',policy:'v2'};
const sha=value=>createHash('sha256').update(value).digest('hex');
const call=request=>validateJevPrompt(request,options);

test('fixed inferred-v2 prompt binds exact targets, inline evidence and current enum handler without executing it',()=>{
  const request=fixture(),before=structuredClone(request),result=call(request);
  // Current builder's canonical identity object for public.example/T.example/A.example.
  assert.deepEqual(Object.keys(request.questions),['owner.7c59feaaf5b87e0f7742']);
  assert.equal(result.passed,true);assert.deepEqual(request,before);
  assert.equal(result.request_sha256,sha(prepareDecision(request).serialized));
  assert.equal(result.structural_links.questions,1);assert.equal(result.structural_links.artifacts,2);
  assert.equal(result.structural_links.unknown_option_present,true);assert.equal(result.handler.executed,false);
  assert.equal(result.source_integrity.sources.length,10);assert.ok(result.source_integrity.sources.every(row=>row.unchanged));
  assert.equal(result.exact_context_fit,'unknown');assert.equal(result.live_authentication,'not_checked');
  assert.deepEqual(result.performed_calls,{GET:0,POST:0});assert.equal(result.key_loaded,false);
  const report=JSON.stringify(result);
  for(const text of [request.state.instructions,request.state.evidence_quotes[0].quote,Object.values(request.questions)[0].instructions])assert.ok(!report.includes(text));
});

test('valid API-shaped requests with wrong target, evidence, owner, enum, requirement or observed failure are blocked',()=>{
  const mutations=[
    ['JEV_PROMPT_DOCUMENT_TEXT_DRIFT',r=>{r.state.instructions+=' Decide freely.';}],
    ['JEV_PROMPT_TARGET_BINDING',r=>{Object.values(r.questions)[0].instructions=Object.values(r.questions)[0].instructions.replace('T.example','T.other');}],
    ['JEV_PROMPT_EVIDENCE_BINDING',r=>{r.state.evidence_quotes.pop();}],
    ['JEV_PROMPT_OWNER_BINDING',r=>{r.state.artifact_contracts[0].owner_task_id='invented';}],
    ['JEV_PROMPT_PATH_BINDING',r=>{r.state.artifact_contracts[0].paths=['../outside.py'];}],
    ['JEV_PROMPT_ENUM_BINDING',r=>{delete Object.values(r.questions)[0].criteria.unknown;}],
    ['JEV_PROMPT_ENUM_BINDING',r=>{Object.values(r.questions)[0].criteria.invented=null;}],
    ['JEV_PROMPT_REQUIREMENT_BINDING',r=>{r.state.detailed_failed_cases[0].original_requirement_ids=['missing'];}],
    ['JEV_PROMPT_TARGET_BINDING',r=>{r.state.detailed_failed_cases[0].testcase.assertion_results[0].status='not_reached';}],
    ['JEV_PROMPT_FAILURE_COVERAGE',r=>{r.state.public_gate.results[0].executed=false;}],
    ['JEV_PROMPT_INTERFACE_BINDING',r=>{r.state.unit_interfaces[0].artifact_ids=['A-renderer'];}],
  ];
  for(const [code,mutate] of mutations){
    const request=fixture();mutate(request);const result=call(request);
    assert.equal(result.official_adapter.passed,true,code);assert.equal(result.passed,false,code);
    assert.ok(result.reason_codes.includes(code),JSON.stringify(result.reason_codes));
  }
});

test('source/request hashes and unsupported stages stay distinct from schema and no language regex certifies semantics',()=>{
  const request=fixture();
  assert.ok(validateJevPrompt(request,{...options,expectedRequestSha256:'0'.repeat(64)}).reason_codes.includes('JEV_TOKEN_ADMISSION_REQUEST_CHANGED'));
  assert.ok(validateJevPrompt(request,{...options,expectedPolicySha256:'0'.repeat(64)}).reason_codes.includes('JEV_PROMPT_POLICY_CHANGED'));
  assert.ok(validateJevPrompt(request,{...options,stage:'profiles'}).reason_codes.includes('JEV_PROMPT_TEMPLATE_UNSUPPORTED'));
  assert.ok(validateJevPrompt(request,{...options,template:'inferred-v1'}).reason_codes.includes('JEV_PROMPT_TEMPLATE_UNSUPPORTED'));
  const snapshot=jevPromptPolicy({policy:'v2'});snapshot.template.stage='profiles';assert.equal(call(request).passed,true);
  request.state.evidence_quotes[0].quote='뜻이 충분한지 이 검사기는 알 수 없다.';
  const result=call(request);assert.equal(result.passed,true);assert.equal(result.semantic_sufficiency,'not_checked');
  assert.equal(result.English_language_quality,'not_checked');assert.equal(result.evidence_authenticity,'not_checked');
  const optional=call({...request,session_id:'official-feature-outside-adapter'});
  assert.equal(optional.passed,false);assert.equal(optional.official_adapter.subset,true);
  assert.equal(optional.official_adapter.complete_provider_api_certified,false);
});

test('projected local evidence must be known successful, including count and incomplete execution controls',()=>{
  const baseline=fixture();assert.equal(call(baseline).passed,true); // Zero local checks is a legal empty summary.
  baseline.state.local_check_results.known_successful_check_ids=['local.one'];baseline.state.local_check_results.count=1;
  assert.equal(call(baseline).passed,true);
  const mutations=[
    r=>{r.state.local_check_results={status:'failed',executed:false,exit_code:null,evidence_error:'Synthetic harness never started.',count:0,known_successful_check_ids:[]};},
    r=>{r.state.local_check_results.evidence_error='Synthetic local harness error.';},
    r=>{r.state.local_check_results.executed=false;},
    r=>{r.state.local_check_results.exit_code=1;},
    r=>{r.state.local_check_results.outcome_uncertain=true;},
    r=>{r.state.local_check_results.skipped=1;},
    r=>{r.state.local_check_results.count=99;},
    r=>{delete r.state.local_check_results;},
  ];
  for(const mutate of mutations){const r=fixture();mutate(r);const result=call(r);
    assert.equal(result.official_adapter.passed,true);assert.equal(result.passed,false);
    assert.ok(result.reason_codes.includes('JEV_PROMPT_LOCAL_EVIDENCE_UNSUPPORTED'));}
});

test('all public gate rows must be observed and their exact case identities must agree with declared totals',()=>{
  const valid=fixture();
  valid.state.public_gate.results.push({check_id:'public.other',status:'passed',executed:true,outcome_uncertain:false,
    passed_test_ids:['T.example'],failed_test_ids:[],error:null,unexecuted_test_ids:[]});
  valid.state.public_gate.case_count=2;valid.state.public_gate.passed_count=1;
  assert.equal(call(valid).passed,true); // Same test id in a different public check is a distinct case.
  const mutations=[
    ['JEV_PROMPT_GATE_COUNTS',r=>{Object.assign(r.state.public_gate,{case_count:0,passed_count:99,failed_count:1});}],
    ['JEV_PROMPT_GATE_COUNTS',r=>{Object.assign(r.state.public_gate,{case_count:3,passed_count:2});}],
    ['JEV_PROMPT_GATE_COUNTS',r=>{r.state.public_gate.case_count=-1;}],
    ['JEV_PROMPT_FAILURE_COVERAGE',r=>{r.state.public_gate.results[0].unexecuted_test_ids=['T.not-executed'];}],
    ['JEV_PROMPT_FAILURE_COVERAGE',r=>{r.state.public_gate.results[0].error='Synthetic verifier setup failed.';}],
    ['JEV_PROMPT_FAILURE_COVERAGE',r=>{r.state.public_gate.results[1].executed=false;}],
    ['JEV_PROMPT_FAILURE_COVERAGE',r=>{r.state.public_gate.results[1].outcome_uncertain=true;}],
    ['JEV_PROMPT_FAILURE_COVERAGE',r=>{r.state.public_gate.results.push({check_id:'public.extra',status:'blocked',executed:false,outcome_uncertain:false,passed_test_ids:[],failed_test_ids:[],unexecuted_test_ids:['T.extra']});}],
    ['JEV_PROMPT_FAILURE_COVERAGE',r=>{r.state.public_gate.results[0].passed_test_ids=['T.example'];}],
    ['JEV_PROMPT_FAILURE_COVERAGE',r=>{r.state.public_gate.results[1].passed_test_ids=['T.example','T.example'];}],
    ['JEV_PROMPT_FAILURE_COVERAGE',r=>{r.state.public_gate.results.push(structuredClone(r.state.public_gate.results[1]));}],
  ];
  for(const [code,mutate] of mutations){const r=structuredClone(valid);mutate(r);const result=call(r);
    assert.equal(result.official_adapter.passed,true);assert.equal(result.passed,false);
    assert.ok(result.reason_codes.includes(code),JSON.stringify(result.reason_codes));}
});

test('v4 local sizing remains non-blocking while official body boundary and schema still block',()=>{
  const request=fixture(),target=245000;
  request.state.evidence_quotes[0].quote+='x'.repeat(target-Buffer.byteLength(prepareDecision(request).serialized));
  const result=call(request);assert.equal(result.passed,true);assert.equal(result.v4_admission.wire_bytes,target);
  assert.ok(result.v4_admission.warning_codes.length>0);assert.equal(result.v4_admission.local_caps.request_tokens,null);
  assert.equal(result.exact_context_fit,'unknown');assert.equal(result.performance_improvement,'not_measured');
  request.state.evidence_quotes[0].quote+='x'.repeat(11001);
  assert.equal(call(request).passed,false);assert.equal(call(request).official_adapter.passed,false);
  const invalid=fixture();Object.values(invalid.questions)[0].criteria={only:null};assert.equal(call(invalid).official_adapter.passed,false);
});

test('mock connection exercises exact URL/auth/serialization, error non-retries, mismatch rejection and no live transport',async()=>{
  const previous=globalThis.fetch;globalThis.fetch=()=>{throw new Error('Live transport must not be used.');};
  try {
    const result=await checkJevConnectionWithMock({policy:'v2'});assert.equal(result.passed,true);
    assert.deepEqual(result.mock_calls,{GET:1,POST:5});assert.deepEqual(result.performed_calls,{GET:0,POST:0});
    assert.ok(result.scenarios.every(row=>row.passed));assert.equal(result.real_key_loaded,false);
    assert.equal(result.deployment_configuration,'not_checked');assert.equal(result.live_model_availability,'not_checked');
    const bad=await checkJevConnectionWithMock({policy:'v2',clientFactory:config=>createJevClient({...config,fetchImpl:(url,init)=>
      config.fetchImpl(url,{...init,redirect:'follow',headers:{...init.headers,Authorization:'wrong'}})})});
    assert.equal(bad.passed,false);assert.equal(JSON.stringify(bad).includes('offline-fixture-jev-not-a-real-key'),false);
    assert.equal(JSON.stringify(bad).includes('Authorization'),false);
  } finally {globalThis.fetch=previous;}
});

test('CLI writes only new reports, rejects environment files/invalid input safely, and distinguishes mock-only mode',t=>{
  const directory=mkdtempSync(join(tmpdir(),'jev-prompt-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const input=join(directory,'request.json'),output=join(directory,'report.json');writeFileSync(input,JSON.stringify(fixture()));
  const cli=args=>spawnSync(process.execPath,['scripts/validate-jev-prompt.mjs','--policy','v2',...args],{encoding:'utf8'});
  const args=['--request',input,'--stage','repair_owners','--template','inferred-v2','--out',output];
  assert.equal(cli(args).status,0);const before=readFileSync(output);assert.equal(cli(args).status,1);assert.deepEqual(readFileSync(output),before);
  assert.equal(cli(['--connection-only']).status,0);
  assert.equal(cli(['--request',input,'--stage','repair','--template','inferred-v2']).status,2);
  assert.equal(cli(['--request',input,'--stage','repair_owners','--template','inferred-v2','--spend']).status,1);
  writeFileSync(input,'RAW_PAYLOAD_MUST_NOT_ECHO');const invalid=cli(args.slice(0,6));assert.equal(invalid.status,1);
  assert.ok(!invalid.stderr.includes('RAW_PAYLOAD_MUST_NOT_ECHO'));
  const environment=join(directory,'.env.local'),alias=join(directory,'alias.json');writeFileSync(environment,JSON.stringify(fixture()));symlinkSync(environment,alias);
  assert.equal(cli(['--request',alias,'--stage','repair_owners','--template','inferred-v2']).status,1);
});

test('historical v1 remains the explicit default and refuses changed producer pins rather than adopting v2',()=>{
  const metadata=jevPromptPolicy();assert.equal(metadata.schema_version,'jev-prompt-policy/v1');
  assert.equal(metadata.source.path,'docs/orchestration/contracts/jev-prompt-policy.v1.json');
  assert.equal(metadata.source.sha256,'3c6cb90d56d8e8d433ed57d23548c977174056177348b7e315544f834d787ebc');
  const result=validateJevPrompt(fixture(),{stage:'repair_owners',template:'inferred-v2'});
  const changed=metadata.source_pins.some(row=>sha(readFileSync(row.path))!==row.sha256);
  assert.equal(result.source_integrity.passed,!changed);
  if(changed){assert.equal(result.passed,false);assert.ok(result.reason_codes.includes('JEV_PROMPT_SOURCE_DRIFT'));}
  assert.equal(call(fixture()).passed,true);
});
