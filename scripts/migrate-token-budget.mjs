#!/usr/bin/env node
// Explicit offline migration. Config files may be full run configs or budget objects.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BUDGET_ERROR_CODES, migrateTokenBudget, validateBudgetConfig } from '../src/benchmark/budget.mjs';
const readConfig = file => {
  const path = resolve(file);
  const config = JSON.parse(readFileSync(path, 'utf8'));
  return validateBudgetConfig(config.jev_budget ?? config, dirname(path));
};
try {
  const [source, target] = process.argv.slice(2);
  if (!source || !target || process.argv.length !== 4) throw Object.assign(new Error(), { code: 'INVALID_ARGUMENTS' });
  const snapshot = migrateTokenBudget(readConfig(source), readConfig(target));
  console.log(JSON.stringify({ status: 'migrated', snapshot, provider_calls: 0 }));
} catch (error) {
  const code = ['INVALID_ARGUMENTS', ...BUDGET_ERROR_CODES].includes(error?.code) ? error.code : 'MIGRATION_FAILED';
  console.error(JSON.stringify({ status: 'stopped', code, provider_calls: 0 }));
  process.exitCode = 1;
}
