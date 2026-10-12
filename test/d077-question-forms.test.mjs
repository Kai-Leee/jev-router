import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describeOwnerCriteria} from '../src/orchestration/adaptive-owner-criteria.mjs';
import {splitProfileRequest, combineProfileAnswers, loadProfileSplitContract} from '../src/orchestration/adaptive-profile-split.mjs';
import {selectInferredOwnerScope} from '../src/orchestration/adaptive-inferred-scope.mjs';
import {createDeferringDecider, answerCertainty} from '../src/orchestration/jev-confidence-deferral.mjs';

const ownerRequest = () => JSON.parse(readFileSync(new URL('../examples/jev-preflight/inferred-v2.request.json', import.meta.url), 'utf8'));

test('owner criteria gain inline path labels while keys, unknown and state stay unchanged', () => {
  const request = ownerRequest(), described = describeOwnerCriteria(request);
  const [id] = Object.keys(request.questions);
  assert.deepEqual(Object.keys(described.questions[id].criteria), Object.keys(request.questions[id].criteria));
  assert.equal(described.questions[id].criteria['A-producer'], 'src/producer.py');
  assert.equal(described.questions[id].criteria.unknown, request.questions[id].criteria.unknown);
  assert.deepEqual(described.state, request.state);
  assert.throws(() => describeOwnerCriteria({...request, questions: {[id]: {...request.questions[id],
    criteria: {...request.questions[id].criteria, 'A-other': null}}}}), /ADAPTIVE_OWNER_CRITERIA_UNEXPECTED/);
});

function profileRequest() {
  const {base_instructions: base} = loadProfileSplitContract();
  const price = (input, output) => ({prompt_tiers: [{rates: {input, output}}]});
  const efforts = ['low', 'medium', 'high', 'xhigh', 'max'];
  return {model: 'jev-latest', state: {
    profiles: ['opus55', 'sonnet55'].flatMap(family => efforts.map(effort => ({id: `claude_${family}_${effort}`, family_id: family, effort}))),
    models: [{id: 'opus55', model: 'claude-opus-5-5', selection_hypothesis: 'Long work.', price: price(4, 20)},
      {id: 'sonnet55', model: 'claude-sonnet-5-5', selection_hypothesis: 'Scoped work.', price: price(2, 10)},
      {id: 'haiku55', model: 'claude-haiku-5-5', selection_hypothesis: 'Not allowed here.', price: price(0.1, 0.5)}]},
  questions: {'adaptive.profile.1': {type: 'choice', instructions: 'For task "t1". ' + base,
    criteria: Object.fromEntries([...['opus55', 'sonnet55'].flatMap(f => efforts.map(e => [`claude_${f}_${e}`, 'x'])), ['stop', 'Stop.']])}}};
}

test('profile choice splits into model choice and effort score and maps back to the v2 profile ID', () => {
  const request = profileRequest(), split = splitProfileRequest(request);
  assert.deepEqual(Object.keys(split.questions), ['adaptive.profile.1.model', 'adaptive.profile.1.effort']);
  assert.deepEqual(Object.keys(split.questions['adaptive.profile.1.model'].criteria), ['opus55', 'sonnet55', 'stop']);
  assert.match(split.questions['adaptive.profile.1.model'].criteria.sonnet55, /^claude-sonnet-5-5\. Scoped work\. .*input \$2, output \$10\.$/);
  assert.equal(split.questions['adaptive.profile.1.effort'].type, 'score');
  assert.equal(split.questions['adaptive.profile.1.effort'].criteria.length, 5);
  assert.ok(split.questions['adaptive.profile.1.model'].instructions.startsWith('For task "t1". '));
  const answer = (model, score) => ({answers: {'adaptive.profile.1.model': {type: 'choice', choice: model},
    'adaptive.profile.1.effort': {type: 'score', score}}});
  assert.equal(combineProfileAnswers(request, answer('sonnet55', 1.4)).answers['adaptive.profile.1'].choice, 'claude_sonnet55_medium');
  assert.equal(combineProfileAnswers(request, answer('opus55', 2.6)).answers['adaptive.profile.1'].choice, 'claude_opus55_xhigh');
  assert.equal(combineProfileAnswers(request, answer('stop', 0)).answers['adaptive.profile.1'].choice, 'stop');
});

test('inferred scope is the union candidate, or a stop without any provider call', () => {
  const union = {id: 'repair-inferred-owners', task_ids: ['t1', 't2'], artifact_ids: ['A1', 'A2']};
  const selected = selectInferredOwnerScope({candidates: [{id: 'repair-inferred-x', task_ids: ['t1']}, union]});
  assert.equal(selected.status, 'selected'); assert.deepEqual(selected.candidate, union);
  assert.equal(selected.stats.provider_calls, 0);
  assert.equal(selectInferredOwnerScope({candidates: []}).status, 'stopped');
});

test('low-certainty answers are held and replaced only by the fresh Claude answer', async () => {
  assert.equal(answerCertainty({type: 'noul', noul: 0.6}).toFixed(2), '0.20');
  assert.equal(answerCertainty({type: 'choice', choice: 'a'}), null);
  const request = {model: 'jev-latest', state: {x: 1}, questions: {
    sure: {type: 'choice', instructions: 'Q1?', criteria: {a: null, b: null}},
    unsure: {type: 'choice', instructions: 'Q2?', criteria: {a: null, b: null}},
    pair: {type: 'noul', instructions: 'Q3?'}}};
  const claudeRequests = [], events = [];
  const decide = createDeferringDecider({
    jev: async () => ({model: 'jev', answers: {sure: {type: 'choice', choice: 'a', confidence: 0.9, probabilities: {a: 0.95, b: 0.05}},
      unsure: {type: 'choice', choice: 'a', confidence: 0.2, probabilities: {a: 0.6, b: 0.4}}, pair: {type: 'noul', noul: 0.55}}}),
    claude: async sub => { claudeRequests.push(sub); return {answers: {unsure: {type: 'choice', choice: 'b'}, pair: {type: 'noul', noul: 0.1}}}; },
    record: async event => { events.push(event.event); }});
  const result = await decide(request, {stage: 'relations', decision_id: 'd1'});
  assert.deepEqual(Object.keys(claudeRequests[0].questions), ['unsure', 'pair']);
  assert.deepEqual(claudeRequests[0].state, request.state);
  assert.equal(result.answers.sure.choice, 'a'); assert.equal(result.answers.unsure.choice, 'b'); assert.equal(result.answers.pair.noul, 0.1);
  assert.equal(result.deferral.deferrals.length, 2);
  assert.deepEqual(events, ['jev_confidence_deferral_started', 'jev_confidence_deferral_completed']);
  const failing = createDeferringDecider({jev: async () => ({answers: {sure: {type: 'choice', choice: 'a', confidence: 0.1}}}),
    claude: async () => { throw Object.assign(new Error('CLAUDE_FAILED'), {code: 'CLAUDE_FAILED'}); }});
  await assert.rejects(failing({model: 'jev-latest', state: {x: 1}, questions: {sure: request.questions.sure}}), /CLAUDE_FAILED/);
});
