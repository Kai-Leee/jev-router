import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const JEV_MODEL_REGISTRY_PATH = 'docs/orchestration/contracts/jev-models.v1.json';
const url = new URL(`../${JEV_MODEL_REGISTRY_PATH}`, import.meta.url);
const bytes = readFileSync(url);
const sha = value => createHash('sha256').update(value).digest('hex');
const source = Object.freeze({path: JEV_MODEL_REGISTRY_PATH, sha256: sha(bytes)});
const moduleSource = Object.freeze({path: 'src/jev-model-registry.mjs', sha256: sha(readFileSync(new URL(import.meta.url)))});
const fail = code => { throw Object.assign(new Error(code), {code}); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);

export function validateJevModelRegistry(value) {
  if (!object(value) || value.schema_version !== 'jev-model-registry/v1' || !Array.isArray(value.request_models)
    || !value.request_models.length || new Set(value.request_models).size !== value.request_models.length
    || value.request_models.some(label => typeof label !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.\/-]*$/.test(label))
    || !Array.isArray(value.observed_models) || !value.observed_models.length
    || new Set(value.observed_models.map(model => model.label)).size !== value.observed_models.length
    || !Array.isArray(value.sources) || !value.sources.length) fail('JEV_MODEL_REGISTRY_INVALID');
  const sourceIds = new Set(value.sources.map(item => item.id));
  for (const model of value.observed_models) {
    if (!object(model) || typeof model.label !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.\/-]*$/.test(model.label)
      || !['version_label', 'dated_build', 'provider_alias'].includes(model.kind)
      || (model.kind === 'provider_alias' ? model.version !== null : typeof model.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(model.version))
      || model.preflight_allowed !== true || model.settlement_allowed !== true
      || model.billing_multiplier !== '1' || model.billing_mode !== 'tokens'
      || !Array.isArray(model.provenance_source_ids) || !model.provenance_source_ids.length
      || model.provenance_source_ids.some(id => !sourceIds.has(id))) fail('JEV_MODEL_REGISTRY_INVALID');
  }
  return structuredClone(value);
}
const registry = validateJevModelRegistry(JSON.parse(bytes));
export const JEV_OBSERVED_MODEL_LABELS = Object.freeze(registry.observed_models.map(model => model.label));

/** Guards the loaded canonical registry against later on-disk substitution. No network or ledger access. */
export function assertJevModelRegistrySource(expectedSha256 = null) {
  if (expectedSha256 !== null && expectedSha256 !== source.sha256) fail('JEV_MODEL_REGISTRY_SOURCE_CHANGED');
  if (sha(readFileSync(url)) !== source.sha256 || sha(readFileSync(new URL(import.meta.url))) !== moduleSource.sha256)
    fail('JEV_MODEL_REGISTRY_SOURCE_CHANGED');
  return {...source};
}
export function jevModelRegistry() { return {...structuredClone(registry), source: {...source}, module_source: {...moduleSource}}; }
export function resolveJevObservedModel(label) {
  const value = registry.observed_models.find(model => model.label === label);
  return value ? structuredClone(value) : null;
}
export function isJevRequestedModel(label) { return registry.request_models.includes(label); }
export function isJevSettlementModel(label) { return registry.observed_models.some(model => model.label === label && model.settlement_allowed === true); }
