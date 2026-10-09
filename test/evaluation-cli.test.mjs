import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/evaluate.mjs', import.meta.url));
const manifestPath = fileURLToPath(new URL('../examples/evaluation/manifest.json', import.meta.url));
const recordsPath = fileURLToPath(new URL('../examples/evaluation/records.jsonl', import.meta.url));
const defaultArguments = ['--manifest', manifestPath, '--records', recordsPath];
const PRIVATE_MARKER = 'synthetic-private-marker-do-not-reflect';

function run(args = defaultArguments, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8', timeout: 10_000, env: {}, ...options,
  });
}

function directory(t) {
  const path = mkdtempSync(join(tmpdir(), 'jev-eval-cli-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

function assertError(result, exitCode, code) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, exitCode);
  assert.equal(result.stdout, '');
  const error = JSON.parse(result.stderr);
  assert.deepEqual(Object.keys(error).sort(), ['error', 'message']);
  assert.equal(error.error, code);
  assert.equal(typeof error.message, 'string');
  assert.equal(result.stderr.includes(PRIVATE_MARKER), false);
  assert.equal(result.stderr.includes(' at '), false);
}

test('help explains the offline command without reading inputs', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /--manifest <json> --records <jsonl>/);
  assert.match(result.stdout, /never overwritten/);
});

test('synthetic example produces a deterministic report on stdout', () => {
  const first = run();
  const second = run();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stderr, '');
  assert.equal(first.stdout, second.stdout);
  const report = JSON.parse(first.stdout);
  assert.equal(report.schema_version, 'jev-eval-report/v1');
  assert.equal(report.dataset.provenance, 'synthetic');
  assert.equal(report.dataset.dataset_id, 'synthetic-routing-decisions');
});

test('output creates a new private file and never overwrites it', (t) => {
  const path = join(directory(t), 'report.json');
  const result = run([...defaultArguments, '--output', path]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  const saved = readFileSync(path, 'utf8');
  assert.equal(JSON.parse(saved).schema_version, 'jev-eval-report/v1');
  if (process.platform !== 'win32') assert.equal(statSync(path).mode & 0o777, 0o600);
  assertError(run([...defaultArguments, '--output', path]), 4, 'OUTPUT_EXISTS');
  assert.equal(readFileSync(path, 'utf8'), saved);
});

test('existing symlink and input file output targets stay unchanged', (t) => {
  const dir = directory(t);
  const original = join(dir, 'manifest.json');
  const link = join(dir, 'report-link.json');
  const source = readFileSync(manifestPath, 'utf8');
  writeFileSync(original, source);
  symlinkSync(original, link);
  assertError(run([...defaultArguments, '--output', link]), 4, 'OUTPUT_EXISTS');
  assertError(run(['--manifest', original, '--records', recordsPath, '--output', original]), 4, 'OUTPUT_EXISTS');
  assert.equal(readFileSync(original, 'utf8'), source);
});

test('invalid arguments have fixed errors without echoing arguments', () => {
  for (const args of [
    [], ['--manifest'], ['--records', recordsPath], ['--help', '--output', 'x'],
    [...defaultArguments, `--${PRIVATE_MARKER}`],
    [...defaultArguments, '--output'],
    [...defaultArguments, '--manifest', PRIVATE_MARKER],
    ['--manifest', '--records', recordsPath],
    ['--manifest', '', '--records', recordsPath],
    [PRIVATE_MARKER, manifestPath, '--records', recordsPath],
  ]) assertError(run(args), 2, 'USAGE');
});

test('unreadable inputs do not disclose their paths', (t) => {
  const missing = join(directory(t), PRIVATE_MARKER);
  assertError(run(['--manifest', missing, '--records', recordsPath]), 3, 'INPUT_READ_FAILED');
  assertError(run(['--manifest', manifestPath, '--records', missing]), 3, 'INPUT_READ_FAILED');
});

test('manifest and JSONL parse errors do not disclose their contents', (t) => {
  const dir = directory(t);
  const path = join(dir, 'invalid.json');
  writeFileSync(path, `{ "secret": "${PRIVATE_MARKER}"`);
  assertError(run(['--manifest', path, '--records', recordsPath]), 3, 'MANIFEST_JSON_INVALID');
  assertError(run(['--manifest', manifestPath, '--records', path]), 3, 'RECORD_JSON_INVALID');
});

test('invalid UTF-8 is rejected before replacement characters can alter data', (t) => {
  const path = join(directory(t), 'invalid-utf8.json');
  writeFileSync(path, Buffer.from([0x7b, 0xc3, 0x28, 0x7d]));
  assertError(run(['--manifest', path, '--records', recordsPath]), 3, 'INPUT_ENCODING_INVALID');
  assertError(run(['--manifest', manifestPath, '--records', path]), 3, 'INPUT_ENCODING_INVALID');
});

test('contract errors are sanitized and do not create the output', (t) => {
  const dir = directory(t);
  const invalidManifest = join(dir, 'invalid-manifest.json');
  const output = join(dir, 'report.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest[PRIVATE_MARKER] = PRIVATE_MARKER;
  writeFileSync(invalidManifest, JSON.stringify(manifest));
  assertError(run(['--manifest', invalidManifest, '--records', recordsPath, '--output', output]), 3, 'INPUT_CONTRACT_INVALID');
  assert.equal(existsSync(output), false);
  const invalidRecords = join(dir, 'invalid-records.jsonl');
  writeFileSync(invalidRecords, JSON.stringify({ type: PRIVATE_MARKER }));
  assertError(run(['--manifest', manifestPath, '--records', invalidRecords]), 3, 'INPUT_CONTRACT_INVALID');
});

test('blank records, blank lines, CRLF and a UTF-8 BOM are accepted', (t) => {
  const path = join(directory(t), 'records.jsonl');
  writeFileSync(path, '\n \r\n\t\n');
  const empty = run(['--manifest', manifestPath, '--records', path]);
  assert.equal(empty.status, 0, empty.stderr);
  assert.equal(JSON.parse(empty.stdout).dataset.provenance, 'synthetic');
  const source = readFileSync(recordsPath, 'utf8');
  writeFileSync(path, `\uFEFF\r\n${source.replaceAll('\n', '\r\n\r\n')}`);
  const formatted = run(['--manifest', manifestPath, '--records', path]);
  assert.equal(formatted.status, 0, formatted.stderr);
  assert.equal(formatted.stdout, run().stdout);
});

test('empty manifest and zero-byte records remain a valid zero-denominator report', (t) => {
  const dir = directory(t);
  const manifest = join(dir, 'manifest.json');
  const records = join(dir, 'records.jsonl');
  writeFileSync(manifest, JSON.stringify({
    schema_version: 'jev-eval/v1', dataset_id: 'synthetic-empty', dataset_version: '1',
    provenance: 'synthetic', trials: [], cases: [],
  }));
  writeFileSync(records, '');
  const result = run(['--manifest', manifest, '--records', records]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).dataset.dataset_id, 'synthetic-empty');
});

test('output failures do not disclose target paths', (t) => {
  const path = join(directory(t), PRIVATE_MARKER, 'report.json');
  assertError(run([...defaultArguments, '--output', path]), 4, 'OUTPUT_WRITE_FAILED');
});

test('evaluation succeeds with common network and dotenv reads forbidden', (t) => {
  const dir = directory(t);
  const guard = join(dir, 'offline-guard.mjs');
  writeFileSync(guard, `
    import fs from 'node:fs';
    import fsPromises from 'node:fs/promises';
    import http from 'node:http';
    import https from 'node:https';
    import net from 'node:net';
    import tls from 'node:tls';
    import { syncBuiltinESMExports } from 'node:module';
    const forbidden = () => { process.exit(97); };
    globalThis.fetch = forbidden;
    http.request = http.get = https.request = https.get = forbidden;
    net.connect = net.createConnection = tls.connect = forbidden;
    for (const [api, names] of [[fs, ['readFile', 'readFileSync', 'open', 'openSync']], [fsPromises, ['readFile', 'open']]]) {
      for (const name of names) {
        const original = api[name];
        api[name] = function(path, ...args) {
          if (String(path).includes('.env') || String(path).includes('${PRIVATE_MARKER}')) forbidden();
          return original.call(this, path, ...args);
        };
      }
    }
    syncBuiltinESMExports();
  `);
  writeFileSync(join(dir, '.env'), `JEV_AI_API_KEY=${PRIVATE_MARKER}\n`);
  const result = spawnSync(process.execPath, ['--import', guard, cli, ...defaultArguments], {
    encoding: 'utf8', timeout: 10_000, cwd: dir,
    env: { JEV_AI_API_KEY: PRIVATE_MARKER, JEV_AI_ENV_FILE: join(dir, '.env') },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.includes(PRIVATE_MARKER), false);
  assert.equal(JSON.parse(result.stdout).dataset.provenance, 'synthetic');
});
