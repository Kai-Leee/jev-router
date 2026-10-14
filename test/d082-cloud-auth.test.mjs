import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {claudeAuthAccepted, claudeAuthMethods} from '../src/benchmark/dag-runner.mjs';
import {loadAdaptiveRunManifest} from '../src/benchmark/adaptive-dag-runner.mjs';

const root = resolve(import.meta.dirname, '..');
const manifests = join(root, 'benchmarks/e2e-swe/manifests');
const subscription = {loggedIn: true, authMethod: 'claude.ai'};
const cloud = {loggedIn: true, authMethod: 'oauth_token'};

test('manifests without claude_auth_methods keep the claude.ai-only rule', () => {
  const d081 = loadAdaptiveRunManifest(join(manifests, 'd081-defaults.json'), root);
  assert.deepEqual(claudeAuthMethods(d081), ['claude.ai']);
  assert.equal(claudeAuthAccepted(d081, subscription), true);
  assert.equal(claudeAuthAccepted(d081, cloud), false);
  assert.equal(claudeAuthAccepted(d081, {loggedIn: false, authMethod: 'claude.ai'}), false);
});

test('d082 accepts the cloud host token and differs from d081 only in auth and semantics', () => {
  const d082 = loadAdaptiveRunManifest(join(manifests, 'd082-cloud-defaults.json'), root);
  assert.deepEqual(claudeAuthMethods(d082), ['claude.ai', 'oauth_token']);
  assert.equal(claudeAuthAccepted(d082, cloud), true);
  assert.equal(claudeAuthAccepted(d082, subscription), true);
  for (const status of [{loggedIn: false, authMethod: 'oauth_token'}, {loggedIn: true, authMethod: 'api_key'},
    {loggedIn: true, authMethod: 'third_party'}, {loggedIn: true}]) assert.equal(claudeAuthAccepted(d082, status), false);
  const raw = name => JSON.parse(readFileSync(join(manifests, name), 'utf8'));
  const {claude_auth_methods: methods, session_semantics: semantics82, ...rest82} = raw('d082-cloud-defaults.json');
  const {session_semantics: semantics81, ...rest81} = raw('d081-defaults.json');
  assert.deepEqual(rest82, rest81);
  assert.deepEqual(methods, ['claude.ai', 'oauth_token']);
  assert.notEqual(semantics82, semantics81);
});

test('invalid claude_auth_methods are rejected', () => {
  for (const value of [[], 'oauth_token', ['api_key'], ['claude.ai', 'claude.ai'], [null]])
    assert.throws(() => claudeAuthMethods({claude_auth_methods: value}), {code: 'DAG_INVALID_RUN_MANIFEST'});
});
