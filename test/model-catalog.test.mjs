import test from 'node:test';
import assert from 'node:assert/strict';
import {loadModelCatalog,selectModelProfile} from '../src/orchestration/model-catalog.mjs';
test('official catalog contains requested families and explicit valid effort selections',async()=>{
 const {catalog}=await loadModelCatalog();assert.deepEqual(catalog.families.map(f=>f.id),['opus55','fable51','sonnet55','haiku55']);
 for(const f of catalog.families)for(const effort of f.efforts){const p=selectModelProfile(catalog,{model:f.id,effort,allowedProfiles:[`${f.id}_${effort}`]});assert.equal(p.model,f.model);assert.equal(p.effort,effort);assert.equal(p.actualAvailability,'unverified');assert.equal(p.effectiveEffort,null);}
});
test('catalog rejects unsupported efforts/models and non-allowlisted choices',async()=>{
 const {catalog}=await loadModelCatalog();for(const p of [{model:'opus55',effort:'ultra',allowedProfiles:['opus55_ultra']},{model:'invented',effort:'low',allowedProfiles:[]},{model:'fable51',effort:'max',allowedProfiles:['opus55_medium']}])assert.throws(()=>selectModelProfile(catalog,p));
});
