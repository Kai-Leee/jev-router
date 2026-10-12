import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('package, Codex plugin and changelog agree on the release version', () => {
  const { version } = JSON.parse(read('package.json'));
  assert.equal(JSON.parse(read('.codex-plugin/plugin.json')).version, version);
  assert.match(read('CHANGELOG.md'), new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm'));
});
