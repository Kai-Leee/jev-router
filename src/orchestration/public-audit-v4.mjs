// D071 opt-in additions to the immutable D056 public source. No hidden grader input.
const fail = code => { throw Object.assign(new Error(code), {code}); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const BASE = 'benchmarks/e2e-swe/public-checks';
const functions = ['sync', 'sync_detailed', 'asyncio', 'asyncio_detailed'];
const scenarios = ['distinct', 'request-only'];

/** Validate the extension before exposing an in-memory, 93-case audit manifest. */
export function extendPublicAuditV4({manifest, inventory, registry, protocol,
  legacyRegistry, legacyInventory, assertions, legacyAssertions}) {
  if (protocol?.schema_version !== 'public-description-provenance-protocol/v1' || protocol.version !== '1'
      || protocol.legacy_test_count !== 85 || protocol.additional_test_count !== 8 || protocol.total_test_count !== 93
      || protocol.check_id !== 'public.description-provenance' || protocol.check_version !== '4'
      || protocol.registry !== BASE + '/registry.v4.json' || protocol.assertion_contract !== BASE + '/assertions.v2.json'
      || !same(protocol.public_source, {path: manifest.source.path, sha256: manifest.source.sha256})
      || !Array.isArray(protocol.tests) || protocol.tests.length !== 8
      || inventory.additional_test_protocol !== BASE + '/description-provenance.v1.json') fail('PUBLIC_V4_PROTOCOL_INVALID');
  const clause = manifest.obligations.find(row => row.id === 'R10.02');
  if (!clause) fail('PUBLIC_V4_SOURCE_CLAUSE_MISSING');
  const expectedIds = scenarios.flatMap(scenario => functions.map(name => `T.R10.02.body-description.${scenario}.${name}`));
  if (!same(protocol.tests.map(row => row.id), expectedIds)) fail('PUBLIC_V4_EXTENSION_ID_DRIFT');
  for (const row of protocol.tests) {
    if (!same(row.requirement_refs, ['R10.02']) || !same(row.source_refs, [clause.source_ref])
        || row.assertion_id !== 'A' + row.id.slice(1) || !scenarios.includes(row.scenario) || !functions.includes(row.function)
        || row.id !== `T.R10.02.body-description.${row.scenario}.${row.function}`
        || typeof row.input !== 'string' || !row.input.trim() || typeof row.expected !== 'string' || !row.expected.trim()) {
      fail('PUBLIC_V4_EXTENSION_SOURCE_DRIFT');
    }
  }
  if (registry.length !== 8 || legacyRegistry.length !== 7 || inventory.rows.length !== 93) fail('PUBLIC_V4_COVERAGE_INVALID');
  for (const [index, old] of legacyRegistry.entries()) {
    const current = registry[index];
    const expected = {...old, version: '4', runner_ref: BASE + '/run_public_checks_v4.py',
      argv: old.argv.map(value => value === 'run_public_checks.py' ? 'run_public_checks_v4.py' : value)};
    if (!same(current, expected)) fail('PUBLIC_V4_LEGACY_CHECK_DRIFT');
  }
  for (const [index, old] of legacyInventory.rows.entries()) {
    const current = inventory.rows[index];
    if (!current || !same({...current, case_refs: old.case_refs}, old)) fail('PUBLIC_V4_LEGACY_INVENTORY_DRIFT');
  }
  if (assertions?.schema_version !== 'public-assertion-contract/v1' || assertions.version !== '2'
      || assertions.assertions?.length !== 12 || !same(assertions.assertions.slice(0, 4), legacyAssertions.assertions)) {
    fail('PUBLIC_V4_ASSERTION_CONTRACT_DRIFT');
  }
  for (const [index, row] of protocol.tests.entries()) {
    const assertion = assertions.assertions[index + 4];
    if (assertion.id !== row.assertion_id || assertion.test_id !== row.id || !same(assertion.requirement_ids, row.requirement_refs)
        || !same([assertion.source_ref], row.source_refs)) fail('PUBLIC_V4_ASSERTION_SOURCE_DRIFT');
  }
  // Inventory uses the authored human-readable scenario; protocol.scenario is its short fixture key.
  return {...manifest, tests: [...manifest.tests, ...protocol.tests.map(row => ({...row, scenario: row.input}))]};
}
