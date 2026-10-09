import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate } from '../src/evaluation/index.mjs';

test('offline example matches independent hand-calculated cohort and probability metrics', () => {
  const manifest = JSON.parse(readFileSync(new URL('../examples/evaluation/manifest.json', import.meta.url), 'utf8'));
  const records = readFileSync(new URL('../examples/evaluation/records.jsonl', import.meta.url), 'utf8')
    .trim().split('\n').map(JSON.parse);
  const report = evaluate({ manifest, records });

  assert.equal(report.dataset.provenance, 'synthetic');
  assert.equal(report.cases.counts.manifest, 7);
  assert.equal(report.cases.coverage.value, 4 / 7);
  assert.equal(report.cases.scorable_coverage.value, 4 / 6);
  assert.equal(report.cases.accuracy.value, 3 / 4);
  assert.equal(report.trials.success_rate.value, 1 / 4);
  assert.equal(report.costs.operational.units.usd.total, null);
  assert.ok(Math.abs(report.costs.operational.units.usd.observed_subtotal - 0.005) < 1e-12);

  const categorical = report.probability.groups.find(group => group.kind === 'categorical'
    && group.labels.join(',') === 'coding,research');
  const binary = report.probability.groups.find(group => group.kind === 'binary');
  // Two categorical examples: (.04 + .04 + .49 + .49) / 2 = .53.
  assert.ok(Math.abs(categorical.brier.value - 0.53) < 1e-12);
  // The one scored binary example assigns .9 to the true event: (.9 - 1)^2 = .01.
  assert.ok(Math.abs(binary.brier.value - 0.01) < 1e-12);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});
