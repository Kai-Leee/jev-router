import test from 'node:test';
import assert from 'node:assert/strict';
import {claudeEnvironment} from '../src/benchmark/claude-env.mjs';

test('OAuth keychain identity reaches implementation and monitor without forwarding unrelated secrets',()=>{
  const env={PATH:'/bin',HOME:'/home/test',USER:'test',LOGNAME:'test',TMPDIR:'/tmp',LANG:'en_US',
    ANTHROPIC_API_KEY:'fake-api',CLAUDE_CODE_OAUTH_TOKEN:'fake-oauth',JEV_AI_API_KEY:'fake-jev',SECRET:'unrelated'};
  const actor=claudeEnvironment(env,{auth:'cli',includeJev:true});
  const monitor=claudeEnvironment(env);
  for (const scope of [actor,monitor]) {
    assert.equal(scope.USER,'test');assert.equal(scope.LOGNAME,'test');assert.equal(scope.HOME,'/home/test');
    assert.equal(scope.SECRET,undefined);assert.equal(scope.ANTHROPIC_API_KEY,undefined);
    assert.equal(scope.CLAUDE_CODE_OAUTH_TOKEN,'fake-oauth');
  }
  assert.equal(actor.JEV_AI_API_KEY,'fake-jev');assert.equal(monitor.JEV_AI_API_KEY,undefined);
  const api=claudeEnvironment(env,{auth:'api-key'});assert.equal(api.ANTHROPIC_API_KEY,'fake-api');assert.equal(api.CLAUDE_CODE_OAUTH_TOKEN,undefined);
});
