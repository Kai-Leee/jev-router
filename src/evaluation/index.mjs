import { validateEvaluation } from './contract.mjs';
import { evaluateMetrics } from './metrics.mjs';

// Offline evaluation only: no configuration, secret loading, or inference imports.
export function evaluate({ manifest, records } = {}) {
  const validated = validateEvaluation(manifest, records);
  return evaluateMetrics(validated.manifest, validated.records);
}

export { EvaluationInputError, validateEvaluation } from './contract.mjs';
