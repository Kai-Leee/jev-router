import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {
  ROOT, SOURCE_PATH, SHARED_PATH, OUTPUT_PATH, SOURCE_SHA256, SHARED_SHA256,
  ATOM_DEFINITIONS, buildObligations, buildFromPublicFiles, validateObligations,
  reconstructSource, hash,
} from '../scripts/build-d056-obligations.mjs';

const [fixtureText, sharedText] = await Promise.all([
  readFile(resolve(ROOT,OUTPUT_PATH),'utf8'), readFile(resolve(ROOT,SHARED_PATH),'utf8'),
]);
const fixture = JSON.parse(fixtureText), sharedManifest = JSON.parse(sharedText);
const clone = () => structuredClone(fixture);
const spec = id => fixture.tests.find(item => item.id === id);
function rejected(mutator, pattern) {
  const changed = clone(); mutator(changed);
  const result = validateObligations(changed);
  assert.equal(result.valid,false);
  assert.match(result.issues.join('\n'),pattern);
}

test('D056 input: frozen public instruction is preserved byte-for-byte across all sections', () => {
  const result = validateObligations(fixture);
  assert.equal(result.valid,true,result.issues.join('\n'));
  assert.equal(hash(fixture.source.text),SOURCE_SHA256);
  assert.equal(reconstructSource(fixture),fixture.source.text);
  assert.deepEqual(result.measured,{source_bytes:19656,source_lines:368,sections:20,obligations:80,specifications:85,linked_obligations:80});
  const bytes=Buffer.from(fixture.source.text);
  for(const obligation of fixture.obligations) {
    const span=obligation.source_span;
    const excerpt=bytes.subarray(span.start_byte,span.end_byte);
    assert.equal(excerpt.toString('utf8'),obligation.text);
    assert.equal(hash(excerpt),span.sha256);
  }
});

test('D056 input: committed fixture regenerates exactly from frozen public inputs', () => {
  assert.equal(hash(sharedText),SHARED_SHA256);
  const regenerated=buildObligations({sourceText:fixture.source.text,sharedText,sharedManifest});
  assert.equal(`${JSON.stringify(regenerated,null,2)}\n`,fixtureText);
});

test('D056 input: available original instruction matches the embedded frozen source', async t => {
  try {
    const original=await readFile(resolve(ROOT,SOURCE_PATH),'utf8');
    assert.equal(original,fixture.source.text);
    assert.deepEqual(await buildFromPublicFiles(),fixture);
  } catch(error) {
    if(error.code === 'ENOENT') {t.skip('Public benchmark clone absent; embedded-source and pinned hash checks still run.'); return;}
    throw error;
  }
});

test('D056 input: clauses are finer than headings without importing task ownership', () => {
  assert.equal(ATOM_DEFINITIONS.length,80);
  const byRequirement=Object.groupBy(fixture.obligations,item=>item.requirement_id);
  assert.equal(Object.keys(byRequirement).length,20);
  assert.equal(byRequirement.R14.length,4);
  assert.equal(byRequirement.R16.length,10);
  assert.equal(byRequirement.R08.length,7);
  assert.ok(!Object.hasOwn(fixture,'tasks'));
  assert.equal(fixture.provenance.ownership_imported,false);
  assert.equal(fixture.provenance.task_groups_imported,false);
  for(const obligation of fixture.obligations) {
    for(const forbidden of ['owner','role','group','task_id','assigned_to']) assert.ok(!Object.hasOwn(obligation,forbidden));
  }
});

test('D056 input: every test is a disclosed source-backed unexecuted specification', () => {
  for(const item of fixture.tests) {
    assert.equal(item.runner_ref,null);
    assert.equal(item.status,'not_run');
    assert.equal(item.provenance.kind,'authored_public_specification_case');
    assert.match(item.provenance.examples,/authored derivations.*not hidden tests/);
    assert.ok(item.input.length > 0 && item.expected.length > 0 && item.source_refs.length > 0);
  }
  assert.deepEqual(fixture.coverage.semantic,{status:'authored_public_spec_cases_not_product_verified',completeness_proven:false,executable_test_count:0,executed_product_test_count:0});
});

test('D056 input: broad inherited scopes are disclosed and file facts are copied without obligation dependencies', () => {
  for(const obligation of fixture.obligations) {
    const requirement=sharedManifest.requirements.find(item=>item.id===obligation.requirement_id);
    assert.deepEqual(obligation.write_scope,requirement.artifact_paths);
    assert.match(obligation.write_scope_provenance.basis,/Conservative potential write scope.*not exact edit ownership/);
    assert.deepEqual(obligation.depends_on,[]);
    assert.equal(obligation.dependency_assertion,'unasserted');
    assert.match(obligation.dependency_note,/not evidence of independence/);
  }
  for(const file of fixture.artifact_interfaces) {
    const inherited=sharedManifest.files.find(item=>item.path===file.path);
    assert.deepEqual(file.dependency_paths,inherited.dependency_paths);
    assert.equal(file.purpose,inherited.purpose);
    assert.equal(file.provenance.path,SHARED_PATH);
  }
  assert.deepEqual(fixture.interfaces,[sharedManifest.integrationInstructions]);
});

// These assertions audit authored scenario content. They do not run a generated
// Python package or prove that these future tests detect implementation defects.
test('D056 authored-case audit: defaults retain both values and Python types, including false strings', () => {
  assert.match(spec('T.R14.01').expected,/date, datetime, and UUID objects/);
  assert.match(spec('T.R14.02').input,/integer default "4" and number default "5.5"/);
  assert.match(spec('T.R14.02').expected,/integer 4 and float 5.5.*Python type/);
  for(const spelling of ['"True"','"true"','"False"','"false"']) assert.ok(spec('T.R14.03').input.includes(spelling));
  assert.match(spec('T.R14.03').expected,/latter two bool False/);
  assert.match(spec('T.R14.04').input,/allOf wrapper.*enum \$ref/);
  assert.deepEqual(spec('T.integration.defaults').requirement_refs.slice(-4),['R14.01','R14.02','R14.03','R14.04']);
});

test('D056 authored-case audit: prefixItems includes items/no-items and all member annotations', () => {
  assert.match(spec('T.R08.07').input,/without items.*with items adding integer/);
  assert.match(spec('T.R08.07').expected,/all prefix types and any items type/);
  assert.match(spec('T.R08.07').expected,/list\[ObjA \| str\].*includes int/);
  assert.ok(spec('T.integration.unions-arrays').requirement_refs.includes('R08.07'));
});

test('D056 authored-case audit: union references, member matching, and concrete encode survive', () => {
  const annotation=spec('T.R13.01');
  for(const required of ['oneOf','anyOf','multi-type','$ref','allOf']) assert.ok(annotation.input.includes(required));
  assert.match(annotation.expected,/None.*Unset/);
  assert.match(annotation.expected,/never use their own generated name/);
  assert.match(spec('T.R13.02').expected,/Required properties.*JSON shape.*flattened/);
  assert.match(spec('T.R13.03').expected,/concrete value's type selects serialization/);
});

test('D056 authored-case audit: model/endpoint docstrings preserve optional descriptions and detailed return types', () => {
  assert.match(spec('T.R10.01').expected,/blank lines.*Attributes:.*string annotation.*trailing colon/);
  assert.match(spec('T.R10.02').expected,/every OpenAPI parameter and body.*colon.*excludes client/);
  assert.match(spec('T.R10.03').expected,/sync\/asyncio.*documented union.*detailed.*Response/);
});

test('D056 authored-case audit: diagnostics preserve schema omissions, exact fragments, and fatal/warning exits', () => {
  assert.match(spec('T.R19.01').input,/mixed string\/integer enum.*neither items nor prefixItems/);
  assert.match(spec('T.R19.01').expected,/names each unsupported schema.*omitted.*rest is generated.*exit is 0.*non-zero/);
  assert.match(spec('T.R19.02').expected,/Circular.*dropped.*exit 0/);
  for(const fragment of ['Invalid JSON','Invalid YAML']) assert.ok(spec('T.R19.03').expected.includes(fragment));
  for(const required of ['openapi','info.title','info.version','paths']) assert.ok(spec('T.R19.04').input.includes(required));
  assert.match(spec('T.R19.04').expected,/non-zero.*Failed to parse OpenAPI document/);
  assert.match(spec('T.R19.05').expected,/non-zero.*Swagger/);
});

test('D056 negative: changing source text and its advertised hash cannot bypass the frozen source', () => {
  rejected(value=>{value.source.text=value.source.text.replace('`"False"`/`"false"`','`"False"`');value.source.sha256=hash(value.source.text);},/Frozen source hash\/path mismatch/);
});
test('D056 negative: source drift stops the generator before writing', () => {
  assert.throws(()=>buildObligations({sourceText:fixture.source.text+'\n',sharedText,sharedManifest}),/frozen D056 instruction hash/);
});
test('D056 negative: changed shared architecture cannot silently regenerate as the same experiment', () => {
  const modified=structuredClone(sharedManifest);modified.files[0].purpose='different interface';
  assert.throws(()=>buildObligations({sourceText:fixture.source.text,sharedText:JSON.stringify(modified),sharedManifest:modified}),/shared manifest differs/);
});
test('D056 negative: deleting a section breaks whole-source reconstruction', () => {
  rejected(value=>{value.sections.splice(13,1);},/Noncontiguous source sections|Incomplete source section coverage|Source reconstruction mismatch/);
});
test('D056 negative: UTF-8 byte-span corruption is detected even when line numbers survive', () => {
  rejected(value=>{value.obligations.find(item=>item.id==='R14.02').source_span.start_byte+=1;},/Line\/byte span mismatch/);
});
test('D056 negative: an edited exact-source excerpt is rejected', () => {
  rejected(value=>{value.obligations.find(item=>item.id==='R14.03').text+='Always use True.';},/Source excerpt mismatch/);
});
test('D056 negative: removing a clause and its single-clause test does not hide lost behavior', () => {
  rejected(value=>{value.obligations=value.obligations.filter(item=>item.id!=='R14.03');value.tests=value.tests.filter(item=>item.id!=='T.R14.03');},/Missing authored behavior obligation/);
});
test('D056 negative: removing a full public section is detected separately from intact original source', () => {
  rejected(value=>{value.obligations=value.obligations.filter(item=>item.requirement_id!=='R12');},/Missing public requirement section/);
});
test('D056 negative: duplicate clause IDs are rejected', () => {
  rejected(value=>{value.obligations[1].id=value.obligations[0].id;},/Duplicate obligation/);
});
test('D056 negative: context cannot be relabeled to hide a normative clause', () => {
  rejected(value=>{value.context_segments[0].source_ref.end_line=13;},/Authored context classification changed/);
});
test('D056 negative: a huge invalid line span returns a diagnostic without iterating unbounded lines', () => {
  rejected(value=>{value.obligations[0].source_ref.end_line=Number.MAX_SAFE_INTEGER;},/Invalid source range/);
});
test('D056 negative: detached clause context invalidates the source linkage', () => {
  rejected(value=>{value.obligations.find(item=>item.id==='R14.03').context_refs=[];},/Authored clause context changed/);
});
test('D056 negative: an absent unit specification is detected even if an integration test still references the obligation', () => {
  rejected(value=>{value.tests=value.tests.filter(item=>item.id!=='T.R14.03');},/Missing authored test specification/);
});
test('D056 negative: removing a cross-clause test does not pass atom-only test coverage', () => {
  rejected(value=>{value.tests=value.tests.filter(item=>item.id!=='T.integration.defaults');},/Missing authored test specification/);
});
test('D056 negative: remapping a spec to a valid but unrelated clause is rejected', () => {
  rejected(value=>{value.tests.find(item=>item.id==='T.R14.03').requirement_refs=['R14.02'];},/Authored specification coverage changed/);
});
test('D056 negative: weakening a boolean expected value is caught as authored specification drift', () => {
  rejected(value=>{value.tests.find(item=>item.id==='T.R14.03').expected='All defaults are truthy.';},/Authored acceptance case changed/);
});
test('D056 negative: removing required prefixItems variants is authored specification drift', () => {
  rejected(value=>{value.tests.find(item=>item.id==='T.R08.07').input='Generate an array of strings.';},/Authored acceptance case changed/);
});
test('D056 negative: invented execution and completeness claims are rejected', () => {
  rejected(value=>{value.tests[0].runner_ref='tests/generated.py';value.tests[0].status='passed';value.coverage.semantic.completeness_proven=true;},/falsely marked executable\/executed|Unsupported semantic\/execution claim/);
});
test('D056 negative: unknown dependencies cannot silently become proven independence', () => {
  rejected(value=>{value.obligations[0].dependency_assertion='independent';},/Invented obligation dependency/);
});
test('D056 negative: fixture does not preassign owners', () => {
  rejected(value=>{value.obligations[0].owner='worker-1';},/Preassigned work/);
});
test('D056 negative: inherited write-scope provenance is mandatory', () => {
  rejected(value=>{delete value.obligations[0].write_scope_provenance;},/Missing write-scope disclosure/);
});
