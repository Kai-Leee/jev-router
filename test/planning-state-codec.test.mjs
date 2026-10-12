import test from 'node:test';
import assert from 'node:assert/strict';
import {encodePlanningState, decodePlanningState, PLANNING_STATE_CODEC_VERSION,
  PLANNING_STATE_CODEC_INSTRUCTIONS} from '../src/orchestration/planning-state-codec.mjs';

const wire = value => JSON.parse(JSON.stringify(value));
const roundtrip = state => {
  const encoded = encodePlanningState(state), decoded = decodePlanningState(wire(encoded));
  assert.deepEqual(decoded, state);
  return {encoded, decoded};
};
const error = {code: 'INVALID_PLANNING_STATE_CODEC'};
const rowsFixture = () => ({objective: 'Every row is retained.', rows: Array.from({length: 24}, (_, index) => ({
  id: `row_${index}`, text: `Source obligation ${index}; preserve this exact value.`,
  source_ref: {start_line: index + 1, end_line: index + 2},
  sources: [{start_line: index + 1, end_line: index + 2}, {start_line: index + 100, end_line: index + 100}],
  input_ref: {obligation_id: `row_${index}`, field: 'inputs', index: 0},
  status: 'not_run', dependencies: [], shared_path: 'a/meaningful/shared/producer/interface.mjs',
  ...(index % 3 ? {optional: index % 2 ? null : ''} : {}),
}))});

test('wire roundtrip preserves primitive values, empty containers and negative zero', () => {
  roundtrip({string: '', bool: false, yes: true, count: 0, negative_zero: -0, none: null,
    rows: [], empty: {}, values: [false, true, 0, -0, null, '', [], {}, '한글\n雪 😀 \u0000', '\\"']});
});

test('encoding is deterministic and does not mutate the supplied state', () => {
  const state = rowsFixture(), snapshot = structuredClone(state);
  const first = encodePlanningState(state), second = encodePlanningState(state);
  assert.deepEqual(first, second);
  assert.deepEqual(state, snapshot);
  assert.equal(first.schema_version, PLANNING_STATE_CODEC_VERSION);
  assert.equal(first.instructions, PLANNING_STATE_CODEC_INSTRUCTIONS);
  assert.equal(first.data.objective, state.objective);
});

test('table columns, constants and declared nested cells retain all fields', () => {
  const state = rowsFixture(), {encoded} = roundtrip(state), table = encoded.data.rows.$table;
  assert(table);
  assert.equal(table.rows.length, state.rows.length);
  assert.equal(table.constants.status, 'not_run');
  assert.deepEqual(table.constants.dependencies, []);
  assert.deepEqual(table.record_cells.source_ref.columns, ['start_line', 'end_line']);
  assert.equal(table.record_cells.input_ref.constants.field, 'inputs');
  assert.equal(table.record_cells.input_ref.constants.index, 0);
  assert.equal(table.record_cells.sources.kind, 'array');
  assert(table.columns.includes('optional'));
  assert(table.rows.some(row => row.some(cell => cell?.$missing === true)));
});

test('shared constants decode into independent object values for every row', () => {
  const state = rowsFixture(), {decoded} = roundtrip(state);
  decoded.rows[0].dependencies.push('changed');
  assert.deepEqual(decoded.rows[1].dependencies, []);
  assert.deepEqual(state.rows[0].dependencies, []);
});

test('same-valued shared strings use an explicit exact-value text dictionary', () => {
  const repeated = 'Literal public source clause with a preserved newline.\nAnd another line.';
  const state = {a: repeated, b: repeated, c: [repeated, repeated, repeated]};
  const {encoded} = roundtrip(state);
  assert.equal(encoded.texts[encoded.data.a.$text], repeated);
  assert.deepEqual(encoded.data.a, encoded.data.b);
});

test('reserved markers remain literal input objects instead of being interpreted as codec operations', () => {
  roundtrip({$table: {columns: ['wrong'], rows: [['must remain literal']]}, nested: {
    $text: 999, $missing: true, $object: [['key', 'value']], $number: '-0', other: 'still literal',
  }, values: [{$text: 0}, {$missing: true}, {$number: '-0'}, {$object: []}, {$table: null}]});
});

test('prototype-shaped field names survive plain objects and table layouts without pollution', () => {
  const rows = Array.from({length: 20}, (_, index) => JSON.parse(`{"__proto__":{"index":${index},"kind":"literal"},"constructor":{"index":${index},"kind":"literal"},"prototype":"normal text","description":"repeated field value","index":${index}}`));
  const state = JSON.parse('{"__proto__":{"polluted":"no"},"constructor":"value","prototype":null}');
  state.rows = rows;
  roundtrip(state);
  assert.equal({}.polluted, undefined);
});

test('nested arrays with different record shapes and absent values remain distinct', () => {
  roundtrip({matrix: [[{x: null}, {}, {x: 0}], [], [{x: false}, {x: ''}, {x: []}]], mixed: [null, 1, false, {key: []}],
    records: Array.from({length: 12}, (_, index) => ({id: index, ...(index % 2 ? {data: null} : {other: 'present'})}))});
});

test('undefined, non-finite numbers, dates and non-JSON values are rejected', () => {
  for (const value of [undefined, NaN, Infinity, -Infinity, 1n, () => 1, Symbol('value'), new Date()]) {
    assert.throws(() => encodePlanningState({value}), error);
  }
  assert.throws(() => encodePlanningState('plain primitive'), error);
});

test('cycles, sparse arrays, extra properties and getters fail without evaluating getters', () => {
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => encodePlanningState(cyclic), error);
  assert.throws(() => encodePlanningState({values: [, 1]}), error);
  const extended = [1]; extended.extra = 2;
  assert.throws(() => encodePlanningState({extended}), error);
  const accessed = {}; Object.defineProperty(accessed, 'secret', {enumerable: true, get: () => assert.fail('getter invoked')});
  assert.throws(() => encodePlanningState(accessed), error);
  const hidden = {}; Object.defineProperty(hidden, 'key', {value: 1});
  assert.throws(() => encodePlanningState(hidden), error);
  assert.throws(() => encodePlanningState(Object.create(null)), error);
});

test('envelope schema, instructions and exact state hash are mandatory', () => {
  const base = encodePlanningState({value: 'original'});
  for (const mutate of [encoded => {encoded.schema_version = 'unknown';}, encoded => {encoded.instructions = 'changed';},
    encoded => {delete encoded.original_sha256;}, encoded => {encoded.extra = true;},
    encoded => {encoded.data.value = 'changed';}, encoded => {encoded.original_sha256 = '0'.repeat(64);}]) {
    const encoded = structuredClone(base); mutate(encoded);
    assert.throws(() => decodePlanningState(encoded), error);
  }
});

test('invalid dictionary references and ambiguous markers cannot silently decode', () => {
  for (const value of [-1, 0, 0.5, '0', 9007199254740992]) {
    const encoded = encodePlanningState({field: 'original'}); encoded.data.field = {$text: value};
    assert.throws(() => decodePlanningState(encoded), error);
  }
  for (const marker of [{$text: 0, extra: true}, {$missing: true}, {$missing: false}, {$number: 'NaN'}, {$object: [['x', 1], ['x', 2]]}]) {
    const encoded = encodePlanningState({field: 'original'}); encoded.data.field = marker;
    assert.throws(() => decodePlanningState(encoded), error);
  }
});

test('invalid table columns, rows, constants and record-cell declarations fail closed', () => {
  const base = encodePlanningState(rowsFixture());
  for (const mutate of [table => {table.columns.push(table.columns[0]);}, table => {table.rows[0].pop();},
    table => {table.constants[table.columns[0]] = 'overlap';}, table => {table.record_cells.unknown = {kind: 'object', columns: [], constants: {}};},
    table => {table.constants.status = 'changed';}, table => {table.rows[0][table.columns.indexOf('id')] = {$missing:true};},
    table => {table.record_cells.source_ref.kind = 'unknown';}, table => {table.rows = 'wrong';},
    table => {table.rows[0][table.columns.indexOf('source_ref')] = null;}, table => {table.extra = 1;}]) {
    const encoded = structuredClone(base); mutate(encoded.data.rows.$table);
    assert.throws(() => decodePlanningState(encoded), error);
  }
});

test('JSON wire roundtrip is also required for equal negative-zero and zero table constants', () => {
  roundtrip({rows: Array.from({length: 16}, (_, index) => ({index, negative_zero: -0, mixed: index % 2 ? -0 : 0,
    long_field_name: 'This constant is shared without changing number semantics.'}))});
});
