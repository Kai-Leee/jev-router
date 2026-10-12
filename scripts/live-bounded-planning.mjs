#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {profilesFromCatalog} from './sequential-e2e.mjs';
import {runSequentialPlanningV3} from '../src/benchmark/sequential-planning-runner-v3.mjs';
const root=resolve(import.meta.dirname,'..');
if(process.argv.length!==4||process.argv[3]!=='--spend')throw Error('OUTPUT_AND_EXPLICIT_SPEND_REQUIRED');
const profiles=profilesFromCatalog(JSON.parse(readFileSync(resolve(root,'docs/orchestration/contracts/models.v2.json'))));
const {result,plan}=await runSequentialPlanningV3({rootDir:root,outputDir:resolve(root,process.argv[2]),spend:true,profiles});
console.log(JSON.stringify({result,allocation:plan?{count:plan.count,cap:plan.maximum_obligations_per_worker,tasks:plan.tasks.map(t=>({id:t.id,obligations:t.obligation_ids.length,tests:t.test_ids.length,profile:t.profile.id,depends_on:t.depends_on})),coverage:plan.coverage}:null}));
if(result.status!=='complete')process.exitCode=1;
