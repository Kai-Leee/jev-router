import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { readHidden, writeEnvKey } from '../src/login.mjs';

test('writeEnvKey replaces only the Jev key line and keeps the file owner-only', () => {
  const directory = mkdtempSync(join(tmpdir(), 'jev-login-test-'));
  try {
    const file = join(directory, '.env');
    writeFileSync(file, 'OTHER=1\nJEV_AI_API_KEY=old\nexport JEV_AI_API_KEY=duplicate\nLAST=2\n');
    writeEnvKey(file, 'new-test-key');
    assert.equal(readFileSync(file, 'utf8'), 'OTHER=1\nJEV_AI_API_KEY=new-test-key\nLAST=2\n');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const created = join(directory, 'nested', '.env');
    writeEnvKey(created, 'first-test-key');
    assert.equal(readFileSync(created, 'utf8'), 'JEV_AI_API_KEY=first-test-key\n');
    assert.throws(() => writeEnvKey(file, 'has space'));
    assert.throws(() => writeEnvKey(file, ''));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('readHidden returns the typed key without echoing it', async () => {
  const input = new PassThrough();
  input.setRawMode = () => {};
  const output = new PassThrough();
  let echoed = '';
  output.on('data', (chunk) => { echoed += chunk; });
  const result = readHidden('Key: ', input, output);
  input.write('ab\u007fc\r');
  assert.equal(await result, 'ac');
  assert.equal(echoed, 'Key: \n');
});

test('CLI sign-in hint and login refuse to read keys outside a terminal', () => {
  const directory = mkdtempSync(join(tmpdir(), 'jev-login-cli-'));
  try {
    const cli = fileURLToPath(new URL('../bin/jev.mjs', import.meta.url));
    const envFile = join(directory, '.env');
    const run = (env, ...args) => spawnSync(process.execPath, [cli, ...args], { env: { JEV_AI_ENV_FILE: envFile, ...env }, encoding: 'utf8' });
    const missing = run({ JEV_AI_API_KEY: '' }, 'login-check');
    assert.equal(missing.status, 0);
    const hint = JSON.parse(missing.stdout).hookSpecificOutput;
    assert.equal(hint.hookEventName, 'SessionStart');
    assert.match(hint.additionalContext, /npm run login/);
    assert.equal(run({ JEV_AI_API_KEY: 'present-test-key' }, 'login-check').stdout, '');
    const login = run({ JEV_AI_API_KEY: '' }, 'login');
    assert.equal(login.status, 1);
    assert.equal(JSON.parse(login.stderr).error, 'LOGIN_NEEDS_TERMINAL');
    assert.equal(existsSync(envFile), false);
    assert.equal(JSON.parse(run({}, 'login', '--spend').stderr).error, 'USAGE');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
