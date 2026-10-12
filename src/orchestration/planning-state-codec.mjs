import {createHash} from 'node:crypto';

export const PLANNING_STATE_CODEC_VERSION = 'planning-state-tables/v1';
export const PLANNING_STATE_CODEC_INSTRUCTIONS = 'Read data as the original planning state, using these exact, lossless conventions. A $table is an ordered list of records: each row follows columns in order, and constants supplies the same named fields to every record. A record_cells entry declares that column as one object or an array of objects; its cell values follow that entry\'s columns and constants. A $text integer refers to the exact string at that zero-based index in texts. A $missing:true cell means an absent field, distinct from null, false, an empty string or an empty array. A $object list contains literal key/value pairs to escape reserved marker names. $number:"-0" means negative zero. All other values are literal JSON. Column names, source text, test expectations and array order retain their original meanings; no row or fact has been dropped. original_sha256 identifies the fully decoded state, with sorted object keys.';

const reserved = new Set(['$table', '$text', '$missing', '$object', '$number']);
const MISSING = Symbol('missing');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const distinctStrings = values => Array.isArray(values) && values.every(value => typeof value === 'string')
  && new Set(values).size === values.length;
const fail = detail => { throw Object.assign(new Error('INVALID_PLANNING_STATE_CODEC'), {code: 'INVALID_PLANNING_STATE_CODEC', detail}); };
const byteLength = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const hasReserved = value => Object.keys(value).some(key => reserved.has(key));
const sameKeys = (value, expected) => object(value) && Object.keys(value).length === expected.length
  && expected.every(key => own(value, key));

function assertJson(value, ancestors = new Set(), depth = 0) {
  if (depth > 128) fail('Maximum JSON nesting exceeded');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!(Array.isArray(value) || object(value)) || ancestors.has(value)) fail('Expected acyclic JSON values');
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) fail('Expected a plain JSON array');
    if (Object.keys(value).length !== value.length || Array.from({length: value.length}, (_, index) => index).some(index => !own(value, index))) fail('Sparse or extended arrays are unsupported');
    if (Object.getOwnPropertySymbols(value).length) fail('Symbol keys are unsupported');
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== Object.keys(value).length) fail('Expected plain enumerable JSON properties');
  }
  if (Object.values(Object.getOwnPropertyDescriptors(value)).some(descriptor => descriptor.get || descriptor.set)) fail('Accessor properties are unsupported');
  ancestors.add(value);
  for (const item of Object.values(value)) assertJson(item, ancestors, depth + 1);
  ancestors.delete(value);
}

function canonical(value) {
  if (typeof value === 'number' && Object.is(value, -0)) return '-0';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const identity = value => createHash('sha256').update(canonical(value)).digest('hex');
const equal = (a, b) => canonical(a) === canonical(b);
const recordCandidate = value => object(value) && !hasReserved(value);

// Shared table headers have readable field names. Only repeated record cells use row notation.
function layoutFor(records, encode) {
  const keys = [...new Set(records.flatMap(record => Object.keys(record)))];
  const constantKeys = keys.filter(key => records.every(record => own(record, key) && equal(record[key], records[0][key])));
  return {
    columns: keys.filter(key => !constantKeys.includes(key)),
    constants: Object.fromEntries(constantKeys.map(key => [key, encode(records[0][key])])),
  };
}

function encodeStructure(input) {
  const encode = value => {
    if (typeof value === 'number' && Object.is(value, -0)) return {$number: '-0'};
    if (Array.isArray(value)) {
      const literal = value.map(encode);
      if (value.length < 2 || !value.every(recordCandidate)) return literal;
      const layout = layoutFor(value, encode), recordCells = Object.create(null);
      for (const column of layout.columns) {
        const present = value.filter(record => own(record, column)).map(record => record[column]);
        let kind, records;
        if (present.length >= 2 && present.every(recordCandidate)) { kind = 'object'; records = present; }
        else if (present.length >= 2 && present.every(Array.isArray)) {
          const flattened = present.flat();
          if (flattened.length >= 2 && flattened.every(recordCandidate)) { kind = 'array'; records = flattened; }
        }
        if (!records) continue;
        const cellLayout = {kind, ...layoutFor(records, encode)};
        const transformed = present.map(cell => kind === 'object'
          ? rowFor(cell, cellLayout, encode) : cell.map(record => rowFor(record, cellLayout, encode)));
        if (byteLength(cellLayout) + byteLength(transformed) + 12 < byteLength(present.map(encode))) recordCells[column] = cellLayout;
      }
      const rows = value.map(record => layout.columns.map(column => {
        if (!own(record, column)) return {$missing: true};
        const cell = record[column], descriptor = own(recordCells, column) ? recordCells[column] : null;
        if (!descriptor) return encode(cell);
        return descriptor.kind === 'object' ? rowFor(cell, descriptor, encode)
          : cell.map(item => rowFor(item, descriptor, encode));
      }));
      const table = {$table: {...layout, ...(Object.keys(recordCells).length ? {record_cells: recordCells} : {}), rows}};
      return byteLength(table) + 8 < byteLength(literal) ? table : literal;
    }
    if (object(value)) {
      const entries = Object.entries(value).map(([key, item]) => [key, encode(item)]);
      return hasReserved(value) ? {$object: entries} : Object.fromEntries(entries);
    }
    return value;
  };
  return encode(input);
}

function rowFor(record, layout, encode) {
  return layout.columns.map(column => own(record, column) ? encode(record[column]) : {$missing: true});
}

// Metadata such as columns and escaped literal keys remains readable, never dictionary encoded.
function mapSemanticStrings(value, map) {
  if (typeof value === 'string') return map(value);
  if (Array.isArray(value)) return value.map(item => mapSemanticStrings(item, map));
  if (!object(value)) return value;
  if (own(value, '$number') || own(value, '$missing')) return structuredClone(value);
  if (own(value, '$object')) return {$object: value.$object.map(([key, item]) => [key, mapSemanticStrings(item, map)])};
  if (own(value, '$table')) {
    const table = value.$table;
    const constants = source => Object.fromEntries(Object.entries(source).map(([key, item]) => [key, mapSemanticStrings(item, map)]));
    const recordCells = table.record_cells && Object.fromEntries(Object.entries(table.record_cells).map(([column, descriptor]) => [column,
      {...descriptor, constants: constants(descriptor.constants)}]));
    return {$table: {...table, constants: constants(table.constants),
      ...(recordCells ? {record_cells: recordCells} : {}), rows: table.rows.map(row => row.map(cell => mapSemanticStrings(cell, map)))}};
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapSemanticStrings(item, map)]));
}

/** Transparent exact-value tables for a JSON planning state; no model or tokenizer is called. */
export function encodePlanningState(state) {
  assertJson(state);
  if (!object(state)) fail('Planning state must be an object');
  const structure = encodeStructure(state), frequencies = new Map();
  mapSemanticStrings(structure, value => {frequencies.set(value, (frequencies.get(value) ?? 0) + 1); return value;});
  const texts = [], indexes = new Map();
  for (const [value, count] of frequencies) {
    const originalBytes = byteLength(value), referenceBytes = byteLength({$text: texts.length});
    if (count >= 2 && count * (originalBytes - referenceBytes) - originalBytes - 1 >= 12) {
      indexes.set(value, texts.length); texts.push(value);
    }
  }
  return {schema_version: PLANNING_STATE_CODEC_VERSION, instructions: PLANNING_STATE_CODEC_INSTRUCTIONS,
    original_sha256: identity(state), texts,
    data: mapSemanticStrings(structure, value => indexes.has(value) ? {$text: indexes.get(value)} : value)};
}

function assertLayout(layout, cell = false) {
  const fields = Object.keys(layout ?? {}), allowed = cell ? ['kind', 'columns', 'constants'] : ['columns', 'constants', 'record_cells', 'rows'];
  if (!object(layout) || fields.some(key => !allowed.includes(key)) || !distinctStrings(layout.columns)
    || !object(layout.constants) || layout.columns.some(column => own(layout.constants, column))
    || (cell && !['object', 'array'].includes(layout.kind))) fail('Invalid table layout');
  if (!cell && (!Array.isArray(layout.rows) || layout.rows.length < 2)) fail('Invalid table rows');
  if (!cell && layout.record_cells !== undefined) {
    if (!object(layout.record_cells) || Object.keys(layout.record_cells).some(column => !layout.columns.includes(column))) fail('Invalid record cell columns');
    for (const descriptor of Object.values(layout.record_cells)) assertLayout(descriptor, true);
  }
}

/** Decode wire JSON and verify exact original-state identity; ambiguous/malformed markers fail closed. */
export function decodePlanningState(envelope) {
  assertJson(envelope);
  if (!sameKeys(envelope, ['schema_version', 'instructions', 'original_sha256', 'texts', 'data'])
    || envelope.schema_version !== PLANNING_STATE_CODEC_VERSION || envelope.instructions !== PLANNING_STATE_CODEC_INSTRUCTIONS
    || !/^[a-f0-9]{64}$/.test(envelope.original_sha256 ?? '') || !Array.isArray(envelope.texts)
    || envelope.texts.some(text => typeof text !== 'string')) fail('Invalid codec envelope');
  const decode = (value, allowMissing = false) => {
    if (Array.isArray(value)) return value.map(item => decode(item));
    if (!object(value)) return value;
    if (!hasReserved(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
    const keys = Object.keys(value);
    if (keys.length !== 1) fail('Ambiguous reserved marker');
    if (keys[0] === '$text') {
      if (!Number.isSafeInteger(value.$text) || value.$text < 0 || value.$text >= envelope.texts.length) fail('Invalid text reference');
      return envelope.texts[value.$text];
    }
    if (keys[0] === '$number') {
      if (value.$number !== '-0') fail('Invalid special number');
      return -0;
    }
    if (keys[0] === '$missing') {
      if (!allowMissing || value.$missing !== true) fail('Absent field marker outside a record cell');
      return MISSING;
    }
    if (keys[0] === '$object') {
      const pairs = value.$object;
      if (!Array.isArray(pairs) || pairs.some(pair => !Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string')
        || !distinctStrings(pairs.map(pair => pair[0]))) fail('Invalid literal object escape');
      return Object.fromEntries(pairs.map(([key, item]) => [key, decode(item)]));
    }
    const table = value.$table;
    assertLayout(table);
    const constants = layout => Object.fromEntries(Object.entries(layout.constants).map(([key, item]) => [key, decode(item)]));
    const decodeRow = (row, layout, constantValues, cellLayouts = {}) => {
      if (!Array.isArray(row) || row.length !== layout.columns.length) fail('Row length differs from columns');
      const entries = Object.entries(structuredClone(constantValues));
      for (let index = 0; index < row.length; index++) {
        const column = layout.columns[index], raw = row[index], descriptor = own(cellLayouts, column) ? cellLayouts[column] : null;
        if (sameKeys(raw, ['$missing'])) {
          if (decode(raw, true) === MISSING) continue;
        }
        let decoded;
        if (!descriptor) decoded = decode(raw);
        else if (descriptor.kind === 'object') decoded = decodeRow(raw, descriptor, constants(descriptor));
        else {
          if (!Array.isArray(raw)) fail('Record array cell must be an array');
          decoded = raw.map(cell => decodeRow(cell, descriptor, constants(descriptor)));
        }
        entries.push([column, decoded]);
      }
      return Object.fromEntries(entries);
    };
    const shared = constants(table);
    return table.rows.map(row => decodeRow(row, table, shared, table.record_cells ?? {}));
  };
  const state = decode(envelope.data);
  if (!object(state) || identity(state) !== envelope.original_sha256) fail('Decoded state identity differs from original_sha256');
  return state;
}
