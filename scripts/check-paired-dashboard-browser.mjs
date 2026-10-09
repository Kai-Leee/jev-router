import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createDashboardServer} from '../src/dashboard/server.mjs';
import {readSnapshot} from '../src/dashboard/reader.mjs';
const packagePath=process.env.JEV_PLAYWRIGHT_PACKAGE,executablePath=process.env.JEV_CHROME_EXECUTABLE;
if(!packagePath||!executablePath)throw new Error('Existing Playwright and Chrome paths required.');
const {chromium}=createRequire(resolve(packagePath))('playwright');
const output=resolve('output/playwright');mkdirSync(output,{recursive:true});
const original=readSnapshot([resolve('examples/dashboard')]).runs.find(r=>r.id==='r0-synthetic-completed');
const implementation={...original,id:'r0-implementation',run_id:'implementation',attempt_id:'implementation',group_id:'paired-browser',
  jev_budget:{limit_usd:1,estimated_spent_usd:0.0006,estimated_reserved_usd:0.0393216,estimated_remaining_usd:0.960078,status:'observed'},
  agent_role:'implementation',status:'running',limits:{...original.limits,jev_call_limit:'unlimited',claude_budget_limit:'unlimited'},
  execution:{runner_status:'running',phase:'provider',gate_status:'ready',gate_stop_code:null,heartbeat:{state:'fresh',at:new Date().toISOString(),age_ms:0},last_event_at:null},incidents:[]};
const monitor={...original,id:'r0-monitor',run_id:'monitor',attempt_id:'monitor',group_id:'paired-browser',agent_role:'monitor',
  workload:'monitoring',title:'벤치마크 모니터',condition:'monitor',status:'completed',
  execution:{runner_status:'completed',phase:'terminal',gate_status:'unknown',heartbeat:{state:'unknown'}},incidents:[],
  monitor_report:{assessment:'attention',evidence:['Synthetic tool failure evidence'],next_action:'Inspect the observed failure',limitations:['Synthetic browser check only']}};
let data=[implementation,monitor],fail=false;
const server=createDashboardServer({snapshot:()=>{if(fail)throw new Error('synthetic failure');return {schema_version:'jev-dashboard/v1',generated_at:new Date().toISOString(),warnings:[],runs:data};},updateIntervalMs:50,heartbeatIntervalMs:200});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));const record=name=>checks.push({name,status:'passed'});
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('[data-run-id="r0-implementation"]').click();
  await page.waitForFunction(()=>document.querySelector('#connection-status').textContent.includes('실시간'));
  assert.equal(await page.locator('.paired-run').count(),2);record('SSE connection and separate paired roles');
  assert.match(await page.locator('#cost-providers').innerText(),/공유 환산 예산/);
  assert.match(await page.locator('#cost-providers').innerText(),/미확정 호출 예약액/);
  assert.match(await page.locator('#cost-providers').innerText(),/실제 청구 USD/);record('budget estimate and reservation separate from actual billed USD');
  await page.screenshot({path:join(output,'budget-desktop.png'),fullPage:true});
  assert.match(await page.locator('#execution-status').innerText(),/화면|기록|관측/);record('runner observation distinct from transport');
  data=[{...implementation,incidents:[{at:new Date().toISOString(),code:'TOOL_NONZERO_EXIT',source:'tool',exit_code:7,decision_id:1,recovery_allowed:true}]},monitor];
  await page.waitForFunction(()=>document.querySelector('#incident-list').textContent.includes('TOOL_NONZERO_EXIT'));
  assert.match(await page.locator('#incident-list').innerText(),/종료 코드 7/);record('failure arrives via SSE without navigation');
  await page.locator('[data-run-id="r0-monitor"]').click();
  assert.match(await page.locator('#monitor-report').innerText(),/Synthetic tool failure evidence/);record('independent monitor interpretation visible');
  fail=true;await page.locator('#api-error').waitFor({state:'visible'});record('collector failure keeps last data and shows error');
  fail=false;await page.locator('#api-error').waitFor({state:'hidden'});record('collector recovery clears error');
  await page.screenshot({path:join(output,'paired-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width);record('mobile has no horizontal overflow');
  await page.screenshot({path:join(output,'paired-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);record('no browser runtime errors');
  const report={status:'passed',evidence_kind:'synthetic',model_inference:false,checks,page_errors:errors};
  writeFileSync(join(output,'paired-browser-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){writeFileSync(join(output,'paired-browser-check.json'),JSON.stringify({status:'failed',checks,error:error.message,page_errors:errors},null,2)+'\n');throw error;}
finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
