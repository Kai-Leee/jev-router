import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentRuleLifecycle, evidenceHash, validateAgentRules } from '../src/benchmark/agent-rules.mjs';

const policy = { allowedTools: ['Read'], workspace: '/app' };
const draft = () => ({ role: 'implementation-review', purpose: 'Review implementation evidence.', inputs: ['Goal and source evidence'], outputs: ['Findings with evidence IDs'], acceptance: ['Every finding references supplied evidence'], escalation: ['Request missing evidence'], update_conditions: ['New goal or observed failure'], tools: ['Read'], workspace: '/app' });
const evidence = { revision: 'v1', items: [{ id: 'goal', content: 'Implement the specified behavior in /app.' }] };
const input = () => ({ goal: 'Implement a reliable module', evidence, currentEvidenceHash: evidenceHash(evidence) });
const answer = choice => ({ answers: { rule_review: { type: 'choice', choice } } });
function fixture(choices = ['accept'], overrides = {}) {
  const generations = [], requests = [], events = [];
  const lifecycle = createAgentRuleLifecycle({ policy,
    generate: async value => { generations.push(value); return draft(); },
    decide: async value => { requests.push(value); return answer(choices.shift()); },
    record: async value => { events.push(value); }, ...overrides
  });
  return { lifecycle, generations, requests, events };
}

test('Claude proposes once and Jev accepts with preserved evidence and restricted export', async () => {
  const f = fixture();
  const result = await f.lifecycle.create(input());
  assert.equal(result.status, 'accepted');
  assert.equal(result.rules.version, 1);
  assert.equal(result.rules.evidence_hash, evidenceHash(evidence));
  assert.match(result.rules.rule_hash, /^[a-f0-9]{64}$/);
  assert.equal(f.generations.length, 1);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.requests[0].state.evidence, evidence);
  const exported = (await f.lifecycle.exportClaudeAgent(result))['implementation-review'];
  assert.deepEqual(exported.tools, ['Read']);
  assert.equal(exported.model, 'claude-opus-5-5');
  assert.equal(exported.permissionMode, 'dontAsk');
  assert.equal(exported.omitClaudeMd, true);
  assert.equal(f.events.length, 3);
});

test('permission expansion and recursive spawn fail before Jev call', async () => {
  for (const changed of [{ tools: ['Bash'] }, { workspace: '/Users/lee' }, { spawn: true }]) {
    const f = fixture([], { generate: async () => ({ ...draft(), ...changed }) });
    await assert.rejects(f.lifecycle.create(input()), /AGENT_RULES_INVALID/);
    assert.equal(f.requests.length, 0);
  }
  assert.throws(() => validateAgentRules({ ...draft(), tools: ['Agent'] }, { ...policy, allowedTools: ['Agent'] }), /recursive/);
  assert.throws(() => validateAgentRules({ ...draft(), tools: ['Agent(foo)'] }, { ...policy, allowedTools: ['Agent(foo)'] }), /recursive/);
});

test('stale evidence prevents generation and calls', async () => {
  const f = fixture();
  const result = await f.lifecycle.create({ ...input(), currentEvidenceHash: 'new' });
  assert.equal(result.status, 'stale');
  assert.equal(f.generations.length + f.requests.length, 0);
});

test('evidence changing during generation stops before paid decision', async () => {
  let current = evidenceHash(evidence);
  const f = fixture([], { generate: async () => { current = 'new'; return draft(); } });
  const result = await f.lifecycle.create({ ...input(), currentEvidenceHash: () => current });
  assert.equal(result.status, 'stale');
  assert.equal(f.requests.length, 0);
});

test('evidence changing during decision invalidates acceptance and export', async () => {
  let current = evidenceHash(evidence);
  const f = fixture([], { decide: async () => { current = 'new'; return answer('accept'); } });
  const result = await f.lifecycle.create({ ...input(), currentEvidenceHash: () => current });
  assert.equal(result.status, 'stale');
  await assert.rejects(f.lifecycle.exportClaudeAgent(result), /approved/);
});

test('abstain and revise stop without automatic generation loops or export', async () => {
  for (const choice of ['abstain', 'revise']) {
    const f = fixture([choice]);
    const result = await f.lifecycle.create(input());
    assert.equal(result.status, choice);
    assert.equal(f.generations.length, 1);
    assert.equal(f.requests.length, 1);
    await assert.rejects(f.lifecycle.exportClaudeAgent(result), /approved/);
  }
});

test('Jev keep avoids Claude regeneration; revision generates once then validates', async () => {
  const f = fixture(['accept', 'keep', 'revise', 'accept']);
  const initial = await f.lifecycle.create(input());
  const keep = await f.lifecycle.update({ ...input(), rules: initial.rules });
  assert.equal(keep.status, 'keep');
  assert.equal(f.generations.length, 1);
  const revised = await f.lifecycle.update({ ...input(), rules: initial.rules });
  assert.equal(revised.status, 'accepted');
  assert.equal(revised.rules.version, 2);
  assert.equal(f.generations.length, 2);
  assert.deepEqual(f.generations[1].previous, initial.rules);
  assert.equal(f.generations[1].update_decision.answers.rule_review.choice, 'revise');
  assert.equal(f.requests.length, 4);
});

test('tampered prior rules or different goal reject; accepted result mutation cannot export', async () => {
  const f = fixture();
  const initial = await f.lifecycle.create(input());
  await assert.rejects(f.lifecycle.update({ ...input(), rules: { ...initial.rules, purpose: 'changed' } }), /prior rules changed/);
  await assert.rejects(f.lifecycle.update({ ...input(), goal: 'Different goal', rules: initial.rules }), /another goal/);
  initial.rules.tools = [];
  await assert.rejects(f.lifecycle.exportClaudeAgent(initial), /approved/);
});

test('unknown Jev answer and uncertain call failure stop without retry', async () => {
  const invalid = fixture(['maybe']);
  await assert.rejects(invalid.lifecycle.create(input()), /invalid decision choice/);
  let calls = 0;
  const uncertain = fixture([], { decide: async () => { calls++; throw new Error('unknown transport outcome'); } });
  await assert.rejects(uncertain.lifecycle.create(input()), /unknown transport outcome/);
  assert.equal(calls, 1);
});

test('evidence hash ignores object key ordering but tracks content; duplicate ids reject', () => {
  assert.equal(evidenceHash(evidence), evidenceHash({ items: [{ content: evidence.items[0].content, id: 'goal' }], revision: 'v1' }));
  assert.notEqual(evidenceHash(evidence), evidenceHash({ ...evidence, revision: 'v2' }));
  assert.throws(() => evidenceHash({ ...evidence, items: [...evidence.items, ...evidence.items] }), /unique ids/);
});

test('export rechecks current evidence after prior approval', async () => {
  let current = evidenceHash(evidence);
  const f = fixture();
  const result = await f.lifecycle.create({ ...input(), currentEvidenceHash: () => current });
  current = 'changed-after-approval';
  await assert.rejects(f.lifecycle.exportClaudeAgent(result), /stale before export/);
  current = evidenceHash(evidence);
  await assert.rejects(f.lifecycle.exportClaudeAgent(result), /approved/);
});

test('generation callback cannot expand the trusted policy by mutating its input', async () => {
  const f = fixture([], { generate: async value => {
    value.policy.allowedTools.push('Bash');
    return { ...draft(), tools: ['Bash'] };
  } });
  await assert.rejects(f.lifecycle.create(input()), /tool expansion/);
  assert.equal(f.requests.length, 0);
});
