// Official list/allocation estimates. Never invoice data and never budget policy.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const rounded = value => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
  ? Number(value.toFixed(12)) : null;

export const OPUS_55_RATES = Object.freeze({ input: 4, output: 20, cache_creation_5m: 5,
  cache_creation_1h: 8, cache_read: 0.20 });
export const JEV_CREATOR_PLAN = Object.freeze({ name: 'Creator', billing_period: 'monthly', monthly_usd: 29,
  included_input_tokens: 60_000_000 });

function metric(values, expected) {
  const valid = values.map(amount).filter(value => value !== null);
  const observed = valid.length ? rounded(valid.reduce((sum, value) => sum + value, 0)) : expected === 0 ? 0 : null;
  return { value: expected !== null && valid.length === expected ? observed : null,
    observed, known: valid.length, expected };
}
const unknown = () => metric([], null);
const fieldNames = camel => camel
  ? ['inputTokens', 'outputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens']
  : ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];

function ttlSplit(usage, cacheTokens) {
  if (cacheTokens === 0) return { five: 0, hour: 0 };
  const five = count(usage?.cache_creation?.ephemeral_5m_input_tokens);
  const hour = count(usage?.cache_creation?.ephemeral_1h_input_tokens);
  return five !== null && hour !== null && cacheTokens !== null && five + hour === cacheTokens
    ? { five, hour } : null;
}

/** Rows must describe one non-overlapping token source (final modelUsage OR
 * main-loop usage OR live unique messages), never their concatenation. */
export function priceClaudeUsage({ rows = [], expected = null, camel = false, mainUsage = null, live = false } = {}) {
  const validRows = Array.isArray(rows) ? rows : [];
  const coverage = count(expected);
  const fields = fieldNames(camel), snakeFields = fieldNames(false);
  const categoryValues = { input: [], output: [], cache_read: [], cache_creation_5m: [], cache_creation_1h: [], cache_creation: [] };
  const totalCells = [];
  let missingRate = false, missingTtl = false;
  for (const row of validRows) {
    const usage = object(row?.usage) ? row.usage : {};
    const tokens = fields.map(key => count(usage[key]));
    const rateKnown = row?.model === 'claude-opus-5-5';
    missingRate ||= !rateKnown;
    // Final main-loop TTL can annotate a model row only when their complete
    // token vectors match, excluding silent subagent/multimodel extrapolation.
    const sameScope = camel && validRows.length === 1 && object(mainUsage)
      && tokens.every((value, index) => value !== null && value === count(mainUsage[snakeFields[index]]));
    const ttl = ttlSplit(camel && sameScope ? mainUsage : usage, tokens[3]);
    missingTtl ||= tokens[3] !== null && tokens[3] > 0 && ttl === null;
    const price = (tokenCount, rate) => rateKnown && tokenCount !== null ? rounded(tokenCount * rate / 1e6) : null;
    const input = price(tokens[0], OPUS_55_RATES.input);
    const output = live ? null : price(tokens[1], OPUS_55_RATES.output);
    const read = price(tokens[2], OPUS_55_RATES.cache_read);
    const five = price(ttl?.five ?? null, OPUS_55_RATES.cache_creation_5m);
    const hour = price(ttl?.hour ?? null, OPUS_55_RATES.cache_creation_1h);
    const write = five !== null && hour !== null ? rounded(five + hour) : null;
    for (const [name, value] of Object.entries({ input, output, cache_read: read, cache_creation_5m: five,
      cache_creation_1h: hour, cache_creation: write })) categoryValues[name].push(value);
    totalCells.push(input, output, read, write);
  }
  const estimated = Object.fromEntries(Object.entries(categoryValues).map(([key, values]) => [key, metric(values, coverage)]));
  // Four disjoint categories per row. The TTL split is nested in cache_creation,
  // so cache-write cost is included once, never three times.
  estimated.total = metric(totalCells, coverage === null ? null : coverage * 4);
  const notes = [
    '표준 Claude Opus 5.5 공식 API 단가로 계산한 추정입니다. OAuth 구독의 추가 청구액이나 실제 결제 금액이 아닙니다.',
    'thinking 토큰은 output 토큰에 이미 포함되어 있어 다시 더하지 않습니다.',
    'cache 생성은 5분·1시간 TTL별 단가를 적용합니다. TTL이 없으면 양수 cache 생성 비용을 추정하지 않습니다.',
  ];
  if (missingRate) notes.push('공식 단가가 등록되지 않은 모델의 토큰 가격은 미확인입니다. Opus 단가로 다른 모델을 대신 계산하지 않습니다.');
  if (missingTtl) notes.push('일부 cache 생성 TTL을 확인할 수 없어 전체 추정 비용은 미확인이고 확인된 항목의 관측 부분합만 표시합니다.');
  if (live) notes.push('실행 중 assistant 출력 토큰은 placeholder이므로 출력 비용과 완전한 총액을 계산하지 않습니다.');
  return { basis: 'official_api_list', token_basis: 'provider_usage', total_coverage_unit: 'model_token_categories',
    source: { title: 'Anthropic 공식 Claude API 가격', url: 'https://platform.claude.com/docs/en/about-claude/pricing',
      verified_at: '2026-10-09', currency: 'USD' },
    rates_per_million: { ...OPUS_55_RATES }, estimated_usd: estimated, plan: null, notes };
}

function scaleMetric(source, rate) {
  if (!object(source)) return unknown();
  const known = count(source.known), expected = count(source.expected);
  if (known === null || (expected !== null && known > expected)) return unknown();
  const observed = amount(source.observed), value = amount(source.value);
  const scaledObserved = observed === null ? null : rounded(observed * rate / 1e6);
  return { value: value !== null && expected !== null && known === expected ? rounded(value * rate / 1e6) : null,
    observed: scaledObserved, known, expected };
}

/** Allocate the verified monthly subscription fee over its included paid-input
 * token allowance. This is not marginal usage billing or a new budget rate. */
export function priceJevUsage({ tokens = null, costs = null } = {}) {
  const rate = JEV_CREATOR_PLAN.monthly_usd / (JEV_CREATOR_PLAN.included_input_tokens / 1e6);
  const input = scaleMetric(costs?.paid_input_tokens, rate);
  const output = scaleMetric(tokens?.output, 0);
  const credits = costs?.credits;
  const creditsConfirmedZero = object(credits) && credits.value === 0 && credits.observed === 0
    && count(credits.expected) !== null && credits.known === credits.expected;
  // A credit-paid request may consume zero subscription allowance. Zero paid
  // tokens therefore does not establish zero total USD-equivalent cost.
  const total = creditsConfirmedZero ? { ...input } : { ...input, value: null, expected: null };
  const notes = [
    '현재 Creator 월간 $29 / 포함 입력 잔액 60,000,000토큰 기준의 구독료 배분 추정입니다. 호출별 실제 청구 USD가 아닙니다.',
    '계산식은 관측된 paidInputTokensUsed × 29 / 60,000,000입니다. 모델 배율이 반영된 잔액 차감을 사용하며 원시 입력 토큰과 다를 수 있습니다.',
    '입력 잔액에 구독료를 배분하므로 출력은 사용량을 확인한 항목에만 배분 비용 0을 표시합니다. cache 비용은 해당 단가 근거가 없어 미확인입니다.',
    'credits와 USD를 합치거나 잔액 차분으로 호출 비용을 역산하지 않습니다. 별도의 보수적 실행 예산 단가는 변경하지 않습니다.',
  ];
  if (!creditsConfirmedZero) notes.push('credits 차감이 양수이거나 완전히 관측되지 않아 총비용은 미확인입니다. 관측된 입력 잔액의 구독료 배분만 부분합으로 표시합니다.');
  return { basis: 'subscription_allocation', token_basis: 'paid_input_tokens', total_coverage_unit: 'paid_input_receipts',
    source: { title: 'Jev AI Creator 월간 요금제', url: 'https://jev-ai.pro/pricing', verified_at: '2026-10-09', currency: 'USD' },
    rates_per_million: { input: rate, output: 0, cache_read: null, cache_creation_5m: null, cache_creation_1h: null },
    estimated_usd: { input, output, cache_read: unknown(), cache_creation_5m: unknown(), cache_creation_1h: unknown(),
      cache_creation: unknown(), total }, plan: { ...JEV_CREATOR_PLAN }, notes };
}
