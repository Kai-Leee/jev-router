#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

try {
  const config = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../runtime.json'), 'utf8'));
  if (config.schema !== 'pointsman-skill-runtime.v1') throw new Error('Unsupported skill runtime binding');
  const args = process.argv.slice(2);
  if (!(args.length === 1 && args[0] === 'doctor') &&
      !(args.length === 3 && args[0] === 'smoke' && args[1] === '--out' && args[2]) &&
      !(args.length === 4 && args[0] === 'run' && args[1] === '--out' && args[2] && args[3] === '--spend')) {
    throw new Error('Usage: pointsman.mjs doctor | smoke --out NEW_DIRECTORY | run --out NEW_DIRECTORY --spend');
  }
  const root = realpathSync(config.sourceRoot);
  const cli = realpathSync(resolve(root, 'bin/pointsman.mjs'));
  if (cli !== resolve(root, 'bin/pointsman.mjs')) throw new Error('Unexpected CLI symlink');
  const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit', cwd: process.cwd(), shell: false });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  process.stderr.write(`Pointsman skill: ${error.message}\n`);
  process.exitCode = 1;
}
