import test from 'node:test';
import assert from 'node:assert/strict';
import { priceClaudeUsage, priceJevUsage, OPUS_55_RATES } from '../src/dashboard/pricing.mjs';
import { summarizeRun } from '../src/dashboard/metrics.mjs';

const model = 'claude-opus-5-5';
const metric = value => ({ value, observed: value, known: 1, expected: 1 });
const usage = (input = 100, output = 20, read = 1000, write = 100) => ({ input_tokens: input,
  output_tokens: output, cache_read_input_tokens: read, cache_creation_input_tokens: write });
const split = (five, hour) => ({ ephemeral_5m_input_tokens: five, ephemeral_1h_input_tokens: hour });
const camel = u => ({ inputTokens: u.input_tokens, outputTokens: u.output_tokens,
  cacheReadInputTokens: u.cache_read_input_tokens, cacheCreationInputTokens: u.cache_creation_input_tokens });

test('official Opus rates price disjoint categories and mixed TTL without counting thinking twice', () => {
  assert.deepEqual(OPUS_55_RATES, { input: 4, output: 20, cache_creation_5m: 5, cache_creation_1h: 8, cache_read: 0.2 });
  const pricing = priceClaudeUsage({ rows: [{ model, usage: { ...usage(), cache_creation: split(40, 60),
    output_tokens_details: { thinking_tokens: 7 } } }], expected: 1 });
  assert.equal(pricing.estimated_usd.input.value, 0.0004);
  assert.equal(pricing.estimated_usd.output.value, 0.0004);
  assert.equal(pricing.estimated_usd.cache_read.value, 0.0002);
  assert.equal(pricing.estimated_usd.cache_creation_5m.value, 0.0002);
  assert.equal(pricing.estimated_usd.cache_creation_1h.value, 0.00048);
  assert.equal(pricing.estimated_usd.total.value, 0.00168);
  assert.equal(pricing.estimated_usd.total.known, 4);
});

test('attempt04 recorded totals reconcile exactly using 1h cache TTL from matching final usage', () => {
  const u = { ...usage(52, 52563, 1488059, 84670), cache_creation: split(0, 84670),
    output_tokens_details: { thinking_tokens: 16020 } };
  const run = summarizeRun({ result: { runner_status: 'uncertain', runner_error_code: 'GATE_COMPLETION_UNCONFIRMED',
    process_exit: 0, outcome_uncertain: true, claude_is_error: false, claude_usage: u,
    claude_model_usage: { [model]: { ...camel(u), thinkingTokens: 16020, costUSD: 2.0264398 } },
    claude_reported_cost_usd: 2.0264398 } });
  const provider = run.providers.find(item => item.provider === 'claude');
  assert.equal(provider.pricing.estimated_usd.cache_creation_1h.value, 0.67736);
  assert.equal(provider.pricing.estimated_usd.total.value, 2.0264398);
  assert.equal(provider.pricing.estimated_usd.total.value, provider.costs.reported_usd.value);
  assert.equal(provider.costs.billed_usd.value, null);
});

test('positive cache creation without TTL leaves its price and full total unknown', () => {
  const p = priceClaudeUsage({ rows: [{ model, usage: usage() }], expected: 1 }).estimated_usd;
  assert.equal(p.cache_creation.value, null);
  assert.deepEqual(p.total, { value: null, observed: 0.001, known: 3, expected: 4 });
});

test('zero cache creation has zero price even without a TTL', () => {
  const p = priceClaudeUsage({ rows: [{ model, usage: usage(100, 20, 1000, 0) }], expected: 1 }).estimated_usd;
  assert.equal(p.cache_creation.value, 0);
  assert.equal(p.total.value, 0.001);
});

test('TTL from narrower main-loop usage is not assigned to mismatching model totals', () => {
  const u = { ...usage(), cache_creation: split(0, 100) };
  const p = priceClaudeUsage({ rows: [{ model, usage: { ...camel(u), inputTokens: 101 } }],
    expected: 1, camel: true, mainUsage: u }).estimated_usd;
  assert.equal(p.cache_creation.value, null);
  assert.equal(p.total.value, null);
});

test('multiple model rows do not borrow one main-loop TTL and unknown models never use Opus rates', () => {
  const u = { ...usage(), cache_creation: split(100, 0) };
  const p = priceClaudeUsage({ rows: [{ model, usage: camel(u) }, { model: 'claude-other', usage: camel(u) }],
    expected: 2, camel: true, mainUsage: u }).estimated_usd;
  assert.equal(p.input.value, null);
  assert.equal(p.input.observed, 0.0004);
  assert.equal(p.cache_creation.observed, null);
  assert.equal(p.total.value, null);
  assert.equal(p.total.expected, 8);
});

test('live stream placeholder output does not become a priced output or complete total', () => {
  const p = priceClaudeUsage({ rows: [{ model, usage: { ...usage(100, 999999, 1000, 100), cache_creation: split(100, 0) } }],
    expected: null, live: true }).estimated_usd;
  assert.equal(p.output.observed, null);
  assert.equal(p.total.value, null);
  assert.equal(p.total.observed, 0.0011);
  assert.equal(p.total.expected, null);
});

test('mismatched TTL totals and fractional token counts are not priced as valid usage', () => {
  const p = priceClaudeUsage({ rows: [{ model, usage: { ...usage(1.5), cache_creation: split(10, 20) } }], expected: 1 }).estimated_usd;
  assert.equal(p.input.value, null);
  assert.equal(p.cache_creation.value, null);
  assert.equal(p.total.value, null);
});

test('Jev Creator full included allowance allocates monthly29 using paid tokens, not raw input', () => {
  const p = priceJevUsage({ costs: { paid_input_tokens: metric(60000000), credits: metric(0) },
    tokens: { input: metric(40000000), output: metric(30) } });
  assert.equal(p.estimated_usd.input.value, 29);
  assert.equal(p.estimated_usd.total.value, 29);
  assert.equal(p.estimated_usd.output.value, 0);
  assert.equal(p.estimated_usd.cache_creation.value, null);
  assert.equal(p.plan.monthly_usd, 29);
  assert.equal(p.source.url, 'https://jev-ai.pro/pricing');
  assert.equal(p.basis, 'subscription_allocation');
});

test('Jev missing paid billing cannot be substituted with known raw input or output zeros', () => {
  const p = priceJevUsage({ costs: { credits: metric(0) }, tokens: { input: metric(100) } }).estimated_usd;
  assert.equal(p.input.value, null);
  assert.equal(p.output.value, null);
  assert.equal(p.total.value, null);
});

test('Jev credits-paid and incomplete credit receipts keep total unknown even when paid tokens are zero', () => {
  for (const credits of [metric(1), undefined, { value: null, observed: 0, known: 1, expected: 2 }]) {
    const p = priceJevUsage({ costs: { paid_input_tokens: metric(0), credits }, tokens: { output: metric(0) } });
    assert.equal(p.estimated_usd.input.value, 0);
    assert.equal(p.estimated_usd.total.value, null);
    assert.equal(p.estimated_usd.total.observed, 0);
    assert.ok(p.notes.some(note => note.includes('총비용은 미확인')));
  }
});

test('Jev partial paid receipts preserve allocation subtotal and never alter billing USD', () => {
  const paid = { value: null, observed: 120, known: 1, expected: 2 };
  const p = priceJevUsage({ costs: { paid_input_tokens: paid, credits: metric(0) }, tokens: { output: metric(0) } });
  assert.deepEqual(p.estimated_usd.input, { value: null, observed: 0.000058, known: 1, expected: 2 });
  assert.equal(p.estimated_usd.total.value, null);
});

test('failed usage prices remain partial and pricing metadata never returns raw record fields', () => {
  const p = priceClaudeUsage({ rows: [{ model: 'SECRET_SENTINEL', usage: { ...usage(), private: 'SECRET_SENTINEL' } }], expected: null });
  assert.equal(p.estimated_usd.total.value, null);
  assert.ok(!JSON.stringify(p).includes('SECRET_SENTINEL'));
  assert.equal(p.source.verified_at, '2026-10-09');
});
