#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadModelCatalog} from '../src/orchestration/model-catalog.mjs';
const {catalog,source}=await loadModelCatalog();
const location=name=>new URL(`../docs/orchestration/contracts/${name}`,import.meta.url);
const questions=JSON.parse(await readFile(location('questions.v1.json')));
console.log(JSON.stringify({modelCatalog:source,models:catalog.families.map(({id,name,model,efforts,availability})=>({id,name,model,efforts,availability})),questions:{path:fileURLToPath(location('questions.v1.json')),kinds:questions.kinds},workerInstructions:{path:fileURLToPath(location('worker-task.v2.json')),document:JSON.parse(await readFile(location('worker-task.v2.json')))},entrypoints:{claude:'CLAUDE.md imports AGENTS.md',codex:'AGENTS.md',isolatedWorker:'Explicit materialized prompt and source hashes; no implicit cwd discovery'},providerCalls:0},null,2));
