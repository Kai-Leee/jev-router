#!/usr/bin/env node
// Explicit, offline v2 -> v3 migration. Never creates or moves a ledger.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BUDGET_ERROR_CODES, migrateTokenBudget, validateBudgetConfig } from '../src/benchmark/budget.mjs';

const readConfig = file => {
  const path = resolve(file);
  const config = JSON.parse(readFileSync(path, 'utf8'));
  return validateBudgetConfig(config.jev_budget ?? config, dirname(path));
};

try {
  const [sourcePath, targetPath] = process.argv.slice(2);
  if (!sourcePath || !targetPath || process.argv.length !== 4) {
    throw Object.assign(new Error(), { code: 'INVALID_ARGUMENTS' });
  }
  const source = readConfig(sourcePath);
  const target = readConfig(targetPath);
  if (source.schema_version !== 'jev-token-budget/v2' || target.schema_version !== 'jev-token-budget/v3') {
    throw Object.assign(new Error(), { code: 'BUDGET_MIGRATION_NOT_ALLOWED' });
  }
  const snapshot = migrateTokenBudget(source, target);
  console.log(JSON.stringify({ status: 'migrated', snapshot, provider_calls: 0 }));
} catch (error) {
  const code = ['INVALID_ARGUMENTS', ...BUDGET_ERROR_CODES].includes(error?.code) ? error.code : 'MIGRATION_FAILED';
  console.error(JSON.stringify({ status: 'stopped', code, provider_calls: 0 }));
  process.exitCode = 1;
}
