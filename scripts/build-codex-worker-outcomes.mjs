#!/usr/bin/env node
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {buildCodexWorkerOutcomes, verifyHistorySources} from '../src/benchmark/codex-worker-outcomes.mjs';

const args = process.argv.slice(2), arms = [], mappingSourceRefs = [];
let output, mapping;
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--arm' && args[index + 1]) {const value = args[++index], split = value.indexOf('=');
    if (split < 1) throw Error('Use --arm ID=/absolute/arm-directory'); arms.push({id: value.slice(0, split), directory: resolve(value.slice(split + 1))});}
  else if (args[index] === '--mapping' && args[index + 1]) mapping = resolve(args[++index]);
  else if (args[index] === '--mapping-source' && args[index + 1]) mappingSourceRefs.push(resolve(args[++index]));
  else if (args[index] === '--out' && args[index + 1]) output = resolve(args[++index]);
  else throw Error('Use --mapping TEST_REQUIREMENTS.json --arm ID=DIR [...] --out NEW_SNAPSHOT.json');
}
if (!mapping || !output || !arms.length) throw Error('Mapping, arms and a new output file are required');
const testRequirements = JSON.parse(readFileSync(mapping, 'utf8'));
const snapshot = buildCodexWorkerOutcomes({arms, testRequirements, mappingSourceRefs: [mapping, ...mappingSourceRefs]});
verifyHistorySources(snapshot);
writeFileSync(output, JSON.stringify(snapshot, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log(JSON.stringify({output, sha256: snapshot.sha256, observations: snapshot.observations.length,
  profiles: snapshot.profiles.map(row => ({model: row.model, effort: row.effort, public_success: row.public_success})),
  excluded: snapshot.excluded, source_count: snapshot.source_refs.length}));
