#!/usr/bin/env node
// Authored public-specification cases, not generated product tests or hidden grader cases.
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE_PATH = '.benchmarks/E2E-SWE/tasks/openapi_python_client/instruction.md';
export const SHARED_PATH = 'benchmarks/e2e-swe/manifests/d052-requirements.json';
export const OUTPUT_PATH = 'benchmarks/e2e-swe/manifests/d056-obligations.json';
export const SOURCE_SHA256 = '983112ee5615c227830f968a820bcf3a4b1ef94a80f2efcc57c7d3d6979c5d22';
export const SHARED_SHA256 = 'b0c0111140bb5351b31511205f984266eb48680cce4e05df8ff851df4cb4fa62';
export const SCHEMA_VERSION = 'jev-recursive-task-test-input/v1';
export const hash = value => createHash('sha256').update(value).digest('hex');

// These are source clauses and acceptance scenarios. Their ordering is source order,
// not a proposed implementation order, task partition, or assignment to a worker.
const atom = (id, lines, title, scope, input, expected, context_lines = []) =>
  ({id, lines, title, scope, input, expected, context_lines});
export const ATOM_DEFINITIONS = [
  atom('R01.01', [3,7], 'Complete OpenAPI client package', 'e2e',
    'Generate clients from minimal valid OpenAPI 3.0 and 3.1 documents, each with an object schema and an HTTP operation.',
    'Each generated package is usable Python, contains typed schema models, an httpx-based callable for the operation, and the runtime support layer.'),
  atom('R01.02', [9,10], 'Installed console entry point', 'e2e',
    'Install the generator through the required offline setup procedure, then invoke pyclientgen from the command line.',
    'The installed console command is named pyclientgen and invokes the generator.'),
  atom('R01.03', [12,13], 'Transport, value equality, and source formats', 'integration',
    'Generate equivalent clients from JSON and YAML documents; construct two generated model instances with equal property values.',
    'Both formats are read; generated client code imports httpx; equal model values compare equal.'),
  atom('R02.01', [17,20], 'Offline environment and setup boundary', 'e2e',
    'Run generator preparation and setup in an offline environment with the documented dependencies already installed.',
    'No downloads or installation of missing dependencies occur. The required setup.sh installs the local project offline as specified in R20; the brief does not authorize fetching dependencies.'),
  atom('R02.02', [22,29], 'Available dependency choices and YAML loader', 'integration',
    'Generate from YAML and JSON using only the available libraries; inspect the chosen YAML loader and transport dependency.',
    'YAML uses ruamel.yaml, JSON uses the standard-library json module, and generated transport uses httpx. Models may use attrs or standard-library dataclasses; pydantic, jinja2, typer with shellingham, and ruff are optional available choices, not mandatory features.'),
  atom('R02.03', [31,32], 'Declared runtime dependencies', 'integration',
    'Inspect generator packaging metadata for the runtime libraries actually used, then install offline with those libraries present.',
    'Appropriate runtime dependencies are declared and setup does not fetch them.'),
  atom('R03.01', [36,44], 'Generate command and exclusive source selection', 'e2e',
    'Invoke pyclientgen generate with only --path; only --url backed by a controlled local transport; both selectors; and neither selector.',
    'The single selected local path or URL is read. Supplying both --path and --url, or neither, exits non-zero. The command shape is pyclientgen generate [OPTIONS].'),
  atom('R03.02', [45,47], 'Output and metadata CLI options', 'e2e',
    'Invoke generation with --output-path P and each --meta value none, poetry, setup, pdm, uv; also omit --meta.',
    'The selected output path and metadata mode are accepted and used; omitted --meta selects poetry. Layout and metadata content remain governed by R04 and R18.'),
  atom('R03.03', [48,48], 'JSON and YAML configuration option', 'integration',
    'Pass equivalent JSON and YAML configuration files using --config PATH, and generate with the option omitted.',
    'Both configuration formats are accepted; documented keys are optional and feed their specified generator behaviors.', [[317,317]]),
  atom('R03.04', [49,50], 'Existing output overwrite behavior', 'e2e',
    'Generate into an existing output directory first without --overwrite, then with --overwrite.',
    'Without --overwrite an existing directory is an error; with --overwrite the existing output directory can be overwritten.'),
  atom('R03.05', [51,52], 'Warning exit policy', 'e2e',
    'Generate a document that produces a public-spec warning, once with --fail-on-warning and once without it.',
    'Any warning makes --fail-on-warning exit non-zero; warnings alone do not change the default successful exit code.'),
  atom('R03.06', [54,54], 'Source suffix selects parser', 'integration',
    'Read a .json source and a source with another suffix, each containing its expected format.',
    'A .json source is parsed as JSON; every other source is parsed as YAML.'),
  atom('R04.01', [58,64], 'Project and package naming', 'integration',
    'Generate from info.title equal to My Cool API.',
    'The project name is my-cool-api-client and its importable package name is my_cool_api_client: kebab-case title plus -client, then hyphens replaced by underscores.'),
  atom('R04.02', [68,70], 'Package-only output paths', 'e2e',
    'Generate with --meta none, once with --output-path P and once without it.',
    'Only the importable package is emitted, without metadata. Explicit P contains the package contents directly; the default location is ./<package_name>.'),
  atom('R04.03', [71,73], 'Project output paths', 'e2e',
    'Generate with each non-none metadata mode, with and without --output-path P.',
    'Metadata and a <package_name>/ package subdirectory appear under P when supplied or under the default <project> directory otherwise.'),
  atom('R04.04', [75,80], 'Generated runtime module layout', 'integration',
    'Inspect a generated package directory and import its public runtime modules.',
    'The package has __init__.py, types.py, client.py defining Client and AuthenticatedClient, and errors.py defining UnexpectedStatus.'),
  atom('R04.05', [81,83], 'Model modules and re-exports', 'integration',
    'Generate object and enum schemas, then import their classes from the generated models package.',
    'models/__init__.py and the schema modules exist; modules use snake_case, classes use PascalCase, and every model/enum class is re-exported.'),
  atom('R04.06', [84,87], 'Tagged operation modules', 'integration',
    'Generate operations with an explicit tag and with no tag, using camelCase operationId values.',
    'api/__init__.py and per-tag API packages exist; one snake_case operationId module is emitted per operation, and untagged operations go under default.'),
  atom('R05.01', [91,95], 'Named schema class boundary', 'integration',
    'Generate named object, enum, oneOf, anyOf, and multi-type schemas under components/schemas.',
    'Object/enum component keys determine PascalCase class and snake_case module names. Union schemas are not referenced through their own generated class names.'),
  atom('R05.02', [96,99], 'Inline property model and enum naming', 'integration',
    'Generate MyModel with inline object and inline enum properties, including inlineEnumProp.',
    'Each inline class uses owning class plus PascalCase property; inlineEnumProp yields MyModelInlineEnumProp.'),
  atom('R05.03', [100,104], 'Inline request-body naming', 'integration',
    'Generate an inline requestBody.content.<media>.schema for operationId uploadThing.',
    'The inline body model is UploadThingBody in upload_thing_body.'),
  atom('R05.04', [105,108], 'Python attribute and parameter names preserve JSON keys', 'integration',
    'Generate a model property stringProp and an operation parameter with a camelCase name; round-trip the model.',
    'Python names use snake_case. stringProp maps to string_prop, while serialization uses the original stringProp JSON key; parameter keywords also use snake_case.'),
  atom('R06.01', [112,113], 'Unset runtime sentinel', 'unit',
    'Import Unset and UNSET, evaluate bool(Unset()) and bool(UNSET), and inspect an optional value without a schema default.',
    'Unset instances are falsy, UNSET is the exported singleton, and optional absent values use UNSET to mean not provided.'),
  atom('R06.02', [114,116], 'File value and tuple contract', 'unit',
    'Construct File(payload=<binary stream>, file_name="sample.bin", mime_type="application/octet-stream") and another with None metadata.',
    'File is a value class; to_tuple() returns (file_name, payload, mime_type) in that order, preserving stream identity and None metadata.'),
  atom('R06.03', [117,118], 'Generic Response runtime contract', 'unit',
    'Construct a Response with a typed parsed payload, status_code, content, and headers.',
    'Response supports a generic parsed type and exposes all four attributes: status_code, content, headers, parsed.'),
  atom('R07.01', [122,126], 'Value model constructor and requiredness', 'unit',
    'Construct an object model with required and optional properties but no explicit defaults; compare equal-valued instances; inspect constructor parameters.',
    'Models have value equality. Required properties have no default, optional properties default to UNSET, and additional/free-form properties are not constructor parameters.'),
  atom('R07.02', [127,128], 'Model dictionary serialization', 'unit',
    'Serialize a model with a differently named JSON property and optional properties set to UNSET or an explicit value.',
    'to_dict() returns a JSON-ready dict using original JSON names; UNSET optional properties are omitted and provided values are serialized.'),
  atom('R07.03', [129,130], 'Mapping parsing and required-property errors', 'unit',
    'Call Model.from_dict with a valid Mapping, a mapping missing a required property, and a non-mapping value.',
    'from_dict is a classmethod returning the model for valid input; a missing required property raises KeyError and a non-mapping argument raises an exception whose exact type is not specified.'),
  atom('R07.04', [132,138], 'Class-level string annotations', 'unit',
    'Inspect __annotations__ on a generated model with required and optional properties.',
    'Every property is annotated in the class body and discoverable in __annotations__; annotations are strings. Required annotations contain only the declared type; optional ones include Unset, with union member order immaterial.'),
  atom('R08.01', [144,149], 'Scalar, null, and unconstrained types', 'unit',
    'Generate properties for boolean, string, integer, number, null, and an empty schema; round-trip representative matching JSON values.',
    'Annotations are bool, str, int, float, None, and Any respectively, and decode/encode pass their values through as specified.', [[142,143]]),
  atom('R08.02', [150,153], 'Formatted strings and unknown-format fallback', 'unit',
    'Round-trip ISO date "2020-01-02", ISO datetime "2020-01-02T03:04:05", UUID "12345678-1234-5678-1234-567812345678", and a string with an unknown format.',
    'Date, datetime, and UUID decode to datetime.date, datetime.datetime, and uuid.UUID and encode to strings; annotations match those Python types. An unknown format remains str and passes through unchanged.', [[142,143]]),
  atom('R08.03', [154,154], 'Referenced object conversion', 'unit',
    'Parse and serialize a property that references a named object schema.',
    'The annotation is that object class; decode and encode use nested from_dict/to_dict.', [[142,143]]),
  atom('R08.04', [155,156], 'Homogeneous and unconstrained arrays', 'unit',
    'Round-trip an array with items referencing an object and an array with items: {}.',
    'Typed arrays annotate list[<S>] and convert elements individually; items: {} uses list[Any] and preserves values as-is.', [[142,143]]),
  atom('R08.05', [158,159], 'Reference-chain resolution', 'unit',
    'Use a reference-only schema that points through another reference-only schema to a concrete object or scalar.',
    'The chain resolves to the final concrete schema and uses its conversion and type.'),
  atom('R08.06', [159,161], 'allOf property merging', 'unit',
    'Generate an allOf combining a base object with an object containing extra properties.',
    'One class includes the listed schemas\' properties, including the base and extra properties.'),
  atom('R08.07', [163,165], 'prefixItems union arrays', 'unit',
    'Generate and round-trip arrays with prefixItems [ObjA, string], first without items and then with items adding integer.',
    'The result is a list; its element annotation includes the union of all prefix types and any items type. The first variant is list[ObjA | str], and the second additionally includes int; values use the corresponding element conversions.'),
  atom('R09.01', [169,172], 'Unknown property storage and schema conversion', 'unit',
    'Parse unknown keys for models with unspecified additionalProperties, typed additionalProperties, and additionalProperties: false; inspect constructor parameters.',
    'Unspecified additional properties are kept as-is, typed ones are parsed by their schema, and storage is additional_properties outside the constructor. additionalProperties:false disables the specified acceptance behavior; rejection-versus-ignoring is not prescribed.'),
  atom('R09.02', [173,175], 'Additional property mapping and round-trip', 'unit',
    'Read, write, check membership, enumerate additional_keys, and round-trip unknown fields on a model accepting additional properties.',
    'instance[key], assignment, key in instance, and additional_keys operate on additional_properties; from_dict routes unknown fields there and to_dict includes them.'),
  atom('R10.01', [179,186], 'Google-style model docstrings', 'unit',
    'Generate a described model containing properties with and without descriptions; inspect its docstring and class annotations.',
    'Google-style sections use Header: lines, entries on separate lines, and blank lines between sections. The schema description leads; Attributes: has one name (type): description entry per property. Type matches the string annotation and a missing description retains the trailing colon.'),
  atom('R10.02', [188,192], 'Endpoint description and argument docstrings', 'unit',
    'Generate an operation with description, parameters with and without descriptions, and a request body; inspect all endpoint function docstrings.',
    'Operation description leads. Args: lists every OpenAPI parameter and body as name (type): description, retains a colon without description, and excludes client.', [[179,180]]),
  atom('R10.03', [193,195], 'Endpoint return docstrings', 'unit',
    'Generate endpoints with one and several documented response types; inspect sync, asyncio, sync_detailed, and asyncio_detailed docstrings.',
    'Returns: for sync/asyncio names the parsed success type, including the documented union when several status codes exist; detailed variants name Response[...].', [[179,180]]),
  atom('R11.01', [199,201], 'String and integer enum value behavior', 'unit',
    'Construct generated string and integer enums by valid and invalid values, and round-trip a model containing an enum property.',
    'Enum(value) returns a member for a valid value and raises ValueError for an unknown value; the model holds a member and to_dict writes its raw value.'),
  atom('R11.02', [203,210], 'String enum member naming', 'unit',
    'Generate string enum values including "a", "B", "a23", "123" at index 3, an empty string at index 6, and "a Thing WIth spaces".',
    'The named members follow the public examples: A, B, A23, VALUE_3, VALUE_6, and A_THING_WITH_SPACES. Identifier values are upper-cased; unusable identifier values use the documented index fallback; spaces/symbols normalize to underscores where specified.'),
  atom('R11.03', [211,212], 'Integer enum member naming', 'unit',
    'Generate integer enum values 2 and -4.',
    'Members are VALUE_2 and VALUE_NEGATIVE_4, preserving integer values.'),
  atom('R11.04', [213,219], 'x-enum-varnames word splitting', 'unit',
    'Generate an enum with x-enum-varnames ["One", "More than OnE", "not_quite_four", "Negative Four"].',
    'Names are ONE, MORE_THAN_ON_E, NOT_QUITE_FOUR, and NEGATIVE_FOUR, using snake_case word splitting including whitespace, non-identifier characters, lowercase-to-uppercase and acronym boundaries, then upper-casing.'),
  atom('R11.05', [221,223], 'Nullable and null-only enums', 'unit',
    'Generate enums made nullable by oneOf with null and by a type list containing null, plus an enum containing only [null]; round-trip None.',
    'Nullable enum properties annotate Enum | None and accept/round-trip None; an enum of only [null] is None.'),
  atom('R11.06', [225,226], 'Constant validation', 'unit',
    'Call from_dict for a property with const using the constant and a different value.',
    'The constant is accepted; any other value raises ValueError.'),
  atom('R12.01', [230,233], 'Literal-enum configuration semantics', 'unit',
    'Generate with literal_enums: true for a non-null string or integer enum; inspect its type alias, model value, and invalid from_dict input.',
    'The generated enum symbol equals typing.Literal[<values...>] instead of an enum class, the model holds a raw value, and an invalid decoded value raises TypeError.', [[322,322]]),
  atom('R13.01', [237,246], 'Union annotations and inlining references', 'unit',
    'Generate oneOf, anyOf, and multi-type schemas in required, optional, and nullable positions, referenced directly, through $ref, and through allOf. Include ThingAOrB referenced by thing.',
    'Annotations inline member type spellings with None for nullable and Unset for optional. Referenced union schemas never use their own generated name; thing uses ThingA | ThingB with Unset if optional.'),
  atom('R13.02', [246,249], 'Union matching and flattening', 'unit',
    'Decode object-union values distinguished by different required keys, an object/scalar union, and nested unions.',
    'Required properties disambiguate object members, JSON shape distinguishes object from scalar, and nested unions are flattened.'),
  atom('R13.03', [248,249], 'Union encoding uses concrete type', 'unit',
    'Encode a union property separately holding an object model and a scalar member.',
    'The concrete value\'s type selects serialization, including to_dict for the model and the scalar\'s corresponding representation.'),
  atom('R14.01', [253,256], 'Date, datetime, and UUID defaults', 'unit',
    'Generate properties with date "2020-01-02", date-time "2020-01-02T03:04:05", and UUID "12345678-1234-5678-1234-567812345678" defaults, then construct the model without arguments.',
    'Defaults are carried by the constructed attributes as date, datetime, and UUID objects with the corresponding values, rather than strings.'),
  atom('R14.02', [256,257], 'Numeric-string defaults', 'unit',
    'Generate integer default "4" and number default "5.5", then construct the model without arguments.',
    'Defaults are the integer 4 and float 5.5, checking both value and Python type.', [[253,255]]),
  atom('R14.03', [257,258], 'Boolean-string defaults', 'unit',
    'Generate boolean properties defaulting to "True", "true", "False", and "false", then construct the model without arguments.',
    'The first two defaults are bool True and the latter two bool False; neither false spelling becomes a truthy string.', [[253,255]]),
  atom('R14.04', [258,259], 'Enum default through allOf reference', 'unit',
    'Generate an enum property whose default is supplied through an allOf wrapper around its enum $ref, then construct without arguments.',
    'The attribute has the specified default converted to the enum\'s Python type, and serializes to its value.', [[253,255]]),
  atom('R15.01', [263,267], 'Client value constructors and authentication settings', 'unit',
    'Construct Client and AuthenticatedClient with base_url, then with explicit unexpected-status, token, prefix, and auth header settings; compare equal-valued instances.',
    'Both are value classes and take base_url with raise_on_unexpected_status default False. AuthenticatedClient also takes token with prefix default Bearer and auth_header_name default Authorization.'),
  atom('R15.02', [268,273], 'Sync and async httpx client storage', 'unit',
    'Set explicit httpx.Client and AsyncClient objects, retrieve them, and retrieve clients without prior setters; exercise default and custom authentication settings.',
    'Getters return explicitly set objects or construct them from stored settings when absent. Authentication uses auth_header_name with "<prefix> <token>"; matching sync and async setter/getter behavior is provided.'),
  atom('R15.03', [274,275], 'Immutable-style client configuration helpers', 'unit',
    'Call with_headers on a client with existing headers; also call with_cookies and with_timeout.',
    'Each helper returns a new client preserving the other settings. Headers are merged; cookies and timeout receive their corresponding updated settings.'),
  atom('R16.01', [279,286], 'Four keyword-only endpoint functions', 'integration',
    'Generate an operation with parameters and a request body; invoke sync_detailed, sync, asyncio_detailed, and asyncio through controlled transports and inspect their signatures.',
    'Functions are keyword-only with client, operation parameters, and body when present. Detailed calls return Response with HTTPStatus status_code, content, headers, parsed; sync/asyncio return parsed; async functions provide the matching behavior.'),
  atom('R16.02', [290,292], 'Path parameter percent encoding', 'unit',
    'Build a request for a path parameter containing slash, space, #, ?, and &.',
    'Template replacement encodes these path-segment characters as %2F, %20, %23, %3F, and %26 respectively.'),
  atom('R16.03', [293,295], 'Query serialization and omission', 'unit',
    'Build a request containing enum and array query parameters and an optional query parameter left UNSET.',
    'params contains the enum\'s raw value and the array as a list so its key can repeat; the UNSET optional parameter is omitted.'),
  atom('R16.04', [296,297], 'JSON request body', 'unit',
    'Build an application/json operation request using a generated body model.',
    'The request sends json=body.to_dict().'),
  atom('R16.05', [297,299], 'Multipart request body', 'unit',
    'Build a multipart/form-data body containing a binary File and a scalar field.',
    'The request sends files=body.to_multipart(), a list of (field-name, file-tuple) pairs. File uses to_tuple(); scalar fields contribute (None, <bytes>, "text/plain").'),
  atom('R16.06', [300,301], 'Form and binary request bodies', 'unit',
    'Build one application/x-www-form-urlencoded request and one application/octet-stream request.',
    'URL-encoded form uses data=body.to_dict(); octet-stream uses content=<bytes>.'),
  atom('R16.07', [302,304], 'Body media type header', 'unit',
    'Build requests for the documented JSON, multipart, form, and octet-stream body media types.',
    'Each body request carries a Content-Type header equal to its media type, including a multipart/form-data value for multipart.'),
  atom('R16.08', [305,307], 'Explicit transport request dispatch', 'integration',
    'Install controlled sync and async httpx transports on a client and invoke generated endpoint functions.',
    'Sync uses client.get_httpx_client().request(method=..., url=..., ...); async awaits client.get_async_httpx_client().request(...).'),
  atom('R16.09', [309,311], 'Documented response parsing', 'integration',
    'Return each documented status with its declared body, including a model and a list of models.',
    'Each documented status is parsed to its declared type, using model from_dict and element conversion where applicable, and exposed as Response.parsed.'),
  atom('R16.10', [311,313], 'Unexpected response status policy', 'integration',
    'Return an undocumented status using clients with raise_on_unexpected_status False and True.',
    'Default/False yields parsed=None; True raises errors.UnexpectedStatus.'),
  atom('R17.01', [319,321], 'Post-generation hook behavior', 'e2e',
    'Generate with a successful hook that records its working directory, an empty post_hooks list, and a command name that is not found.',
    'Hooks run after generation in the output directory; an empty list disables post-processing; a missing command produces a warning rather than a failure under the default warning policy.', [[317,317]]),
  atom('R17.02', [323,324], 'Class and module overrides', 'integration',
    'Provide class_overrides mapping a generated class name to class_name and module_name, then import and use references to it.',
    'Both the generated class and its module are renamed according to the supplied mapping.', [[317,317]]),
  atom('R17.03', [325,327], 'Field prefix default and override', 'unit',
    'Generate properties beginning with a digit or underscore using default configuration and a custom field_prefix.',
    'The prefix, default field_, is prepended to the property names described as invalid in the brief to form Python attribute names.', [[317,317]]),
  atom('R18.01', [334,336], 'Poetry metadata content', 'integration',
    'Generate with default/poetry metadata from known info.title and info.version.',
    'Output includes pyproject.toml with project name, info.version-derived version and runtime dependencies, README.md, .gitignore, and the package subdirectory.'),
  atom('R18.02', [337,338], 'Setup, pdm, and uv metadata variants', 'integration',
    'Generate separately with --meta setup, pdm, and uv.',
    'setup includes the poetry outputs plus setup.py; pdm and uv emit their pyproject.toml variants. Exact backend table contents beyond the brief are not prescribed.'),
  atom('R18.03', [339,339], 'No metadata mode', 'integration',
    'Generate with --meta none and inspect output.',
    'Only the package is emitted, with no project metadata.'),
  atom('R19.01', [343,349], 'Named nonfatal unsupported-schema warnings', 'e2e',
    'Generate a document with a valid schema alongside a mixed string/integer enum and an array with neither items nor prefixItems; repeat with --fail-on-warning.',
    'Output names each unsupported schema in a warning; those schemas are omitted while the rest is generated. Default exit is 0; --fail-on-warning exits non-zero.'),
  atom('R19.02', [350,352], 'Circular property reference warning', 'e2e',
    'Generate a document whose property reaches a circular $ref chain, plus an unaffected schema.',
    'The cycle is detected, the diagnostic contains Circular, the affected schema is dropped, and generation still completes with exit 0 under the default warning policy.'),
  atom('R19.03', [353,355], 'Malformed source diagnostics', 'e2e',
    'Invoke generation on invalid JSON in a .json source and invalid YAML in a YAML-parsed source.',
    'Both exit non-zero; their messages contain Invalid JSON and Invalid YAML respectively.'),
  atom('R19.04', [355,357], 'Invalid OpenAPI structure diagnostics', 'e2e',
    'Generate from a non-OpenAPI document and, separately, documents missing openapi, info.title, info.version, or paths.',
    'Each exits non-zero with a message containing Failed to parse OpenAPI document.'),
  atom('R19.05', [357,358], 'Swagger 2.0 rejection', 'e2e',
    'Pass a Swagger/OpenAPI 2.0 document.',
    'Generation exits non-zero and the message mentions Swagger.'),
  atom('R20.01', [362,368], 'Offline editable setup script', 'e2e',
    'Run setup.sh with dependencies and the build backend preinstalled and network unavailable, then invoke pyclientgen.',
    'setup.sh installs the local package with pip install -e . --no-build-isolation, making the command available without build isolation or network fetches.'),
];

// Cross-clause specifications remain separate from tasks. They are not ownership
// hints and must retain links to every contributing leaf after recursive splitting.
const integration = (id, refs, scenario, input, expected) =>
  ({id, refs, scenario, input, expected, scope:'e2e'});
export const INTEGRATION_DEFINITIONS = [
  integration('T.integration.defaults', ['R06.01','R07.01','R07.02','R07.04','R14.01','R14.02','R14.03','R14.04'],
    'Generate, import, construct, inspect, and serialize a model using all public default conversions.',
    'One public-spec OpenAPI document combines date/date-time/UUID defaults, integer "4", number "5.5", all four boolean string spellings, and an allOf enum-ref default, plus an optional property without a default.',
    'The generated package imports; no-argument construction carries converted values and Python types, the unrelated absent optional value is UNSET, annotations remain strings, and to_dict emits the corresponding JSON values while omitting UNSET.'),
  integration('T.integration.unions-arrays', ['R05.01','R07.04','R08.03','R08.04','R08.05','R08.06','R08.07','R13.01','R13.02','R13.03'],
    'Generate and round-trip nested referenced unions in prefixItems arrays.',
    'Combine referenced object members, nested oneOf/anyOf/multi-type schemas, an allOf wrapper, and prefixItems with and without an additional items type.',
    'The generated package imports; annotations inline and flatten member types and include every prefix/items type, object matching respects required keys and JSON shape, and encoding follows concrete types. No union schema name replaces its member annotation.'),
  integration('T.integration.transports', ['R06.02','R06.03','R15.01','R15.02','R16.01','R16.02','R16.03','R16.04','R16.05','R16.06','R16.07','R16.08','R16.09','R16.10'],
    'Exercise generated endpoint functions with controlled synchronous and asynchronous transports.',
    'Operations cover path/query arguments, JSON/multipart/form/octet-stream bodies, documented model/list responses, and an undocumented status under both client status policies.',
    'Both transports receive the specified encoded URL, query, media-type header and body representation; detailed functions preserve status/content/headers/parsed and simple functions return parsed; undocumented statuses follow the configured policy.'),
  integration('T.integration.config-layout', ['R01.02','R03.01','R03.02','R03.03','R04.01','R04.02','R04.03','R04.04','R04.05','R04.06','R05.02','R05.03','R05.04','R12.01','R17.02','R17.03','R18.01','R18.02','R18.03'],
    'Use the installed CLI with JSON/YAML configuration and every metadata layout.',
    'Generate the same valid document with no config and with class_overrides, field_prefix and literal_enums, across all five metadata modes and explicit/default output paths.',
    'The corresponding package imports with the specified naming, module/class overrides, literal enum behavior and generated runtime/API files. Metadata and paths match the selected mode, title, version and configuration.'),
  integration('T.integration.diagnostics', ['R03.04','R03.05','R03.06','R17.01','R19.01','R19.02','R19.03','R19.04','R19.05'],
    'Preserve error severity and surviving outputs across generation failures and warnings.',
    'Use separate cases for overwrite, missing post-hook command, mixed-type enum, untyped array, circular reference, malformed source, missing required OpenAPI fields, Swagger 2.0, and the warning flag.',
    'Public diagnostics and exit policies remain intact. Warning cases preserve unaffected generated code and identify the relevant schema where required; fatal parse/Swagger cases exit non-zero with the required message fragments.'),
];

export const CONTEXT_LINE_RANGES = [
  [1,2,'heading'], [8,8,'formatting'], [11,11,'formatting'], [14,16,'heading'],
  [21,21,'formatting'], [30,30,'formatting'], [33,35,'heading'], [39,41,'option-list-introduction'],
  [53,53,'formatting'], [55,57,'heading'], [65,67,'layout-introduction'], [74,74,'formatting'], [88,90,'heading'],
  [109,111,'heading'], [119,121,'heading'], [131,131,'formatting'], [139,143,'type-table-heading'],
  [157,157,'formatting'], [162,162,'formatting'], [166,168,'heading'], [176,178,'heading'],
  [187,187,'formatting'], [196,198,'heading'], [202,202,'formatting'], [220,220,'formatting'],
  [224,224,'formatting'], [227,229,'heading'], [234,236,'heading'], [250,252,'heading'],
  [260,262,'heading'], [276,278,'heading'], [287,289,'request-building-introduction'],
  [308,308,'formatting'], [314,318,'configuration-introduction'], [322,322,'cross-reference-to-R12'],
  [328,333,'optional-nonrequired-options-and-heading'], [340,342,'heading'], [359,361,'heading'],
];

function sourceLines(sourceText) {
  const lines = sourceText.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
  let position = 0;
  return lines.map(text => {
    const result = {text, start_byte: position, end_byte: position + Buffer.byteLength(text)};
    position = result.end_byte;
    return result;
  });
}

function spanFor(lines, start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lines.length) throw Error('Invalid source line range');
  const text = lines.slice(start - 1, end).map(line => line.text).join('');
  return {text, source_ref:{path:SOURCE_PATH, sha256:SOURCE_SHA256, start_line:start, end_line:end},
    source_span:{start_byte:lines[start-1].start_byte, end_byte:lines[end-1].end_byte, sha256:hash(text)}};
}

const disclosure = 'No dependency is asserted at the obligation level. An empty depends_on array is not evidence of independence; shared-file access and known interface producer/consumer facts still require sequencing or integration.';
const caseProvenance = refs => ({kind:'authored_public_specification_case',
  examples:'Concrete inputs are authored derivations of the public instruction, not hidden tests, prior candidate observations, or measured executions.',
  expectation_basis:'Public instruction clauses identified by source_refs; wording is an authored acceptance paraphrase, not an additional product requirement.',
  source_refs:refs});

export function buildObligations({sourceText, sharedManifest, sharedText}) {
  if (hash(sourceText) !== SOURCE_SHA256) throw Error('Public source differs from the frozen D056 instruction hash');
  if (typeof sharedText !== 'string' || hash(sharedText) !== SHARED_SHA256
    || JSON.stringify(JSON.parse(sharedText)) !== JSON.stringify(sharedManifest)) throw Error('Public shared manifest differs from its frozen D056 hash');
  const lines = sourceLines(sourceText);
  const requirements = new Map(sharedManifest.requirements.map(record => [record.id, record]));
  if (sharedManifest.provenance?.public_source?.sha256 !== SOURCE_SHA256) throw Error('Shared manifest refers to another public source');
  const sharedRef = {path:SHARED_PATH, sha256:hash(sharedText)};
  const obligations = ATOM_DEFINITIONS.map(def => {
    const requirement_id = def.id.split('.')[0];
    const requirement = requirements.get(requirement_id);
    if (!requirement) throw Error(`Missing public requirement ${requirement_id}`);
    const exact = spanFor(lines, ...def.lines);
    return {id:def.id, requirement_id, title:def.title, ...exact,
      inputs:[def.input], outputs:[def.expected], write_scope:[...requirement.artifact_paths], depends_on:[], gaps:[],
      context_refs:def.context_lines.map(range => spanFor(lines, ...range).source_ref),
      dependency_assertion:'unasserted', dependency_note:disclosure,
      write_scope_provenance:{...sharedRef, kind:'reused_requirement_artifact_relevance', requirement_id,
        basis:'Conservative potential write scope copied from the public D052 requirement artifact map; not exact edit ownership, an implementation assignment, or independently established necessity.'},
    };
  });
  const byId = new Map(obligations.map(obligation => [obligation.id, obligation]));
  const makeTest = (id, refs, scenario, input, expected, scope) => {
    const source_refs = refs.flatMap(ref => [byId.get(ref).source_ref, ...byId.get(ref).context_refs]);
    return {id, requirement_refs:refs, scenario, input, expected, scope, runner_ref:null, status:'not_run',
      source_refs, provenance:caseProvenance(source_refs)};
  };
  const tests = ATOM_DEFINITIONS.map(def => makeTest(`T.${def.id}`, [def.id], def.title, def.input, def.expected, def.scope));
  for (const def of INTEGRATION_DEFINITIONS) tests.push(makeTest(def.id, def.refs, def.scenario, def.input, def.expected, def.scope));
  const sections = sharedManifest.requirements.map(requirement => {
    const exact = spanFor(lines, requirement.source_ref.start_line, requirement.source_ref.end_line);
    if (exact.text !== requirement.source) throw Error(`Source section mismatch: ${requirement.id}`);
    return {requirement_id:requirement.id, title:requirement.title, source_ref:exact.source_ref, source_span:exact.source_span};
  });
  const context_segments = CONTEXT_LINE_RANGES.map(([start, end, kind]) => {
    const exact = spanFor(lines, start, end);
    return {kind, source_ref:exact.source_ref, source_span:exact.source_span};
  });
  const artifact_interfaces = sharedManifest.files.map(file => ({path:file.path, purpose:file.purpose,
    dependency_paths:[...file.dependency_paths], dependency_note:file.dependency_note,
    provenance:{...sharedRef, upstream_source_ref:file.source_ref}}));
  const source = {path:SOURCE_PATH, sha256:SOURCE_SHA256, text:sourceText, encoding:'utf-8', byte_length:Buffer.byteLength(sourceText), line_count:lines.length};
  const result = {schema_version:SCHEMA_VERSION, goal:sharedManifest.goal, source, obligations, tests,
    constraints:[
      'Planning-only input: authored test specifications have no runner and have not executed against a product.',
      'Preserve all source obligations, constraints and test expectations; the complete frozen public instruction remains authoritative.',
      'The product environment is offline; dependencies are preinstalled. Only the required offline local-project setup installation is authorized by the public instruction.',
      'Potential write scopes may overlap. They do not preassign tasks or permit simultaneous shared-file writes.',
      disclosure,
      'No original Personal OS or vault edits, hidden tests, generated benchmark candidate inspection, API calls, commits or pushes are part of fixture preparation.',
    ],
    interfaces:[sharedManifest.integrationInstructions], artifact_interfaces, sections, context_segments,
    provenance:{
      preparation:'Deterministic extraction of exact public instruction clauses plus explicitly authored public-specification test cases.',
      source_inputs:[{path:SOURCE_PATH, sha256:SOURCE_SHA256}, sharedRef],
      shared_design:{...sharedManifest.provenance.shared_design, accessed_via:SHARED_PATH,
        limitation:'Only the existing public interface/artifact manifest was read. Its referenced historical design and candidate implementation were not opened; architecture reuse is disclosed and is not new Jev architecture invention.'},
      ownership_imported:false, task_groups_imported:false, task_dependencies_imported:false,
      dependency_status:disclosure,
      test_status:'All test records are specifications only: runner_ref null, status not_run. No generated client behavior has been executed here.',
      preparation_cost:'Source extraction, authored cases and review are preparation work. No provider call was made; labor/runtime cost is not measured or claimed zero.',
      semantic_limit:'Line/byte reconstruction, declared atom coverage and test-link integrity are measured mechanically. Whether the authored cases detect every incorrect implementation requires independent semantic review and future executable negative controls.',
    },
    coverage:{
      source:{method:'Frozen SHA-256 and ordered source-section byte spans reconstruct all public source bytes; source.text is stored once.', total_lines:lines.length, total_bytes:Buffer.byteLength(sourceText), section_count:sections.length},
      declared_atoms:{count:obligations.length, requirement_count:new Set(obligations.map(o=>o.requirement_id)).size, specification_count:tests.length, cross_atom_specification_count:INTEGRATION_DEFINITIONS.length},
      semantic:{status:'authored_public_spec_cases_not_product_verified', completeness_proven:false, executable_test_count:0, executed_product_test_count:0},
    }};
  const validation = validateObligations(result);
  if (!validation.valid) throw Error(`Invalid generated obligations: ${validation.issues.join('; ')}`);
  return result;
}

export function reconstructSource(input) {
  const bytes = Buffer.from(input.source.text, 'utf8');
  return Buffer.concat(input.sections.map(section => bytes.subarray(section.source_span.start_byte, section.source_span.end_byte))).toString('utf8');
}

export function validateObligations(input) {
  const issues = [];
  const fail = (condition, message) => { if (!condition) issues.push(message); };
  if (!input || typeof input !== 'object' || typeof input.source?.text !== 'string') return {valid:false, issues:['Missing source text']};
  fail(input.schema_version === SCHEMA_VERSION, 'Schema version mismatch');
  const text = input.source.text, lines = sourceLines(text), bytes = Buffer.from(text);
  fail(input.source.path === SOURCE_PATH && input.source.sha256 === SOURCE_SHA256 && hash(bytes) === SOURCE_SHA256, 'Frozen source hash/path mismatch');
  fail(input.source.byte_length === bytes.length && input.source.line_count === lines.length, 'Source measurement mismatch');
  const spanValid = (record, label) => {
    const ref = record?.source_ref, span = record?.source_span;
    if (!ref || !span || !Number.isInteger(ref.start_line) || !Number.isInteger(ref.end_line) || ref.start_line < 1 || ref.end_line < ref.start_line || ref.end_line > lines.length) {
      issues.push(`Invalid source range: ${label}`); return false;
    }
    fail(ref.path === SOURCE_PATH && ref.sha256 === SOURCE_SHA256, `Wrong source identity: ${label}`);
    const expected = spanFor(lines, ref.start_line, ref.end_line);
    fail(span.start_byte === expected.source_span.start_byte && span.end_byte === expected.source_span.end_byte && span.sha256 === expected.source_span.sha256, `Line/byte span mismatch: ${label}`);
    if (Object.hasOwn(record,'text')) fail(record.text === expected.text, `Source excerpt mismatch: ${label}`);
    return true;
  };
  const sections = input.sections ?? [];
  let next = 0;
  for (const section of sections) {
    spanValid(section, section.requirement_id);
    fail(section.source_span?.start_byte === next, 'Noncontiguous source sections');
    next = section.source_span?.end_byte;
  }
  fail(sections.length === 20 && next === bytes.length, 'Incomplete source section coverage');
  if (sections.every(s => s.source_span)) fail(reconstructSource(input) === text, 'Source reconstruction mismatch');
  const obligations = input.obligations ?? [], tests = input.tests ?? [];
  const ids = new Set(), obligationById = new Map();
  const definitions = new Map(ATOM_DEFINITIONS.map(def => [def.id, def]));
  const coveredLines = new Set();
  for (const obligation of obligations) {
    fail(!ids.has(obligation.id), `Duplicate obligation ${obligation.id}`); ids.add(obligation.id); obligationById.set(obligation.id, obligation);
    const def = definitions.get(obligation.id);
    fail(!!def, `Unknown authored obligation ${obligation.id}`);
    const rangeValid = spanValid(obligation, obligation.id);
    if (def) fail(obligation.requirement_id === def.id.split('.')[0] && obligation.source_ref?.start_line === def.lines[0] && obligation.source_ref?.end_line === def.lines[1], `Authored clause mapping changed: ${obligation.id}`);
    if (def) fail(JSON.stringify(obligation.context_refs) === JSON.stringify(def.context_lines.map(range=>spanFor(lines,...range).source_ref)), `Authored clause context changed: ${obligation.id}`);
    for (const field of ['inputs','outputs','write_scope','depends_on','gaps']) fail(Array.isArray(obligation[field]) && obligation[field].every(v => typeof v === 'string'), `Invalid ${field}: ${obligation.id}`);
    fail(obligation.inputs?.length > 0 && obligation.outputs?.length > 0, `Missing declared IO: ${obligation.id}`);
    fail(obligation.dependency_assertion === 'unasserted' && obligation.depends_on?.length === 0, `Invented obligation dependency: ${obligation.id}`);
    fail(obligation.write_scope_provenance?.kind === 'reused_requirement_artifact_relevance'
      && obligation.write_scope_provenance.path === SHARED_PATH && obligation.write_scope_provenance.sha256 === SHARED_SHA256, `Missing write-scope disclosure: ${obligation.id}`);
    fail(!['owner','role','group','task_id','assigned_to'].some(key => Object.hasOwn(obligation,key)), `Preassigned work: ${obligation.id}`);
    if (rangeValid) for (let line = obligation.source_ref.start_line; line <= obligation.source_ref.end_line; line++) coveredLines.add(line);
  }
  fail(ids.size === ATOM_DEFINITIONS.length && [...definitions.keys()].every(id=>ids.has(id)), 'Missing authored behavior obligation');
  fail(new Set(obligations.map(o=>o.requirement_id)).size === 20, 'Missing public requirement section');
  const contexts = input.context_segments ?? [];
  fail(contexts.length === CONTEXT_LINE_RANGES.length, 'Context inventory mismatch');
  for (let index = 0; index < contexts.length; index++) {
    const context = contexts[index], rangeValid = spanValid(context, `context ${index}`);
    const expected = CONTEXT_LINE_RANGES[index];
    fail(!!expected && context.kind === expected[2] && context.source_ref?.start_line === expected[0] && context.source_ref?.end_line === expected[1], `Authored context classification changed: ${index}`);
    if (rangeValid) for (let line=context.source_ref.start_line; line<=context.source_ref.end_line; line++) coveredLines.add(line);
  }
  fail(coveredLines.size === lines.length, 'Unclassified public source lines');
  const testIds = new Set(), tested = new Set();
  const expectedTests = new Map(ATOM_DEFINITIONS.map(def => [`T.${def.id}`, {refs:[def.id], input:def.input, expected:def.expected}]));
  for (const def of INTEGRATION_DEFINITIONS) expectedTests.set(def.id, {refs:def.refs,input:def.input,expected:def.expected});
  for (const spec of tests) {
    fail(!testIds.has(spec.id), `Duplicate test specification ${spec.id}`); testIds.add(spec.id);
    fail(spec.runner_ref === null && spec.status === 'not_run', `Specification falsely marked executable/executed: ${spec.id}`);
    fail(['unit','integration','e2e'].includes(spec.scope) && typeof spec.scenario === 'string' && spec.scenario.length > 0, `Invalid test scenario/scope: ${spec.id}`);
    const refs = spec.requirement_refs ?? [];
    fail(refs.length > 0 && new Set(refs).size === refs.length && refs.every(ref=>ids.has(ref)), `Invalid test mapping: ${spec.id}`);
    for (const ref of refs) tested.add(ref);
    const expected = expectedTests.get(spec.id);
    fail(!!expected, `Unknown authored specification ${spec.id}`);
    if (expected) {
      fail(JSON.stringify(refs) === JSON.stringify(expected.refs), `Authored specification coverage changed: ${spec.id}`);
      fail(spec.input === expected.input && spec.expected === expected.expected, `Authored acceptance case changed: ${spec.id}`);
    }
    const expectedRefs = refs.flatMap(ref=>obligationById.has(ref) ? [obligationById.get(ref).source_ref,...(obligationById.get(ref).context_refs ?? [])] : []);
    fail(JSON.stringify(spec.source_refs) === JSON.stringify(expectedRefs) && JSON.stringify(spec.provenance?.source_refs) === JSON.stringify(expectedRefs), `Test source links changed: ${spec.id}`);
    fail(spec.provenance?.kind === 'authored_public_specification_case', `Missing case derivation disclosure: ${spec.id}`);
  }
  fail([...ids].every(id=>tested.has(id)), 'Obligation without a linked specification');
  fail(testIds.size === expectedTests.size && [...expectedTests.keys()].every(id=>testIds.has(id)), 'Missing authored test specification');
  fail(input.coverage?.semantic?.completeness_proven === false && input.coverage?.semantic?.executable_test_count === 0 && input.coverage?.semantic?.executed_product_test_count === 0, 'Unsupported semantic/execution claim');
  return {valid:issues.length === 0, issues, measured:{source_bytes:bytes.length, source_lines:lines.length, sections:sections.length, obligations:obligations.length, specifications:tests.length, linked_obligations:tested.size}};
}

export async function buildFromPublicFiles(root = ROOT) {
  const [sourceText, sharedText] = await Promise.all([readFile(resolve(root,SOURCE_PATH),'utf8'),readFile(resolve(root,SHARED_PATH),'utf8')]);
  return buildObligations({sourceText, sharedText, sharedManifest:JSON.parse(sharedText)});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--check'].includes(arg))) throw Error('Usage: node scripts/build-d056-obligations.mjs [--check]');
  const manifest = await buildFromPublicFiles();
  const serialized = `${JSON.stringify(manifest,null,2)}\n`;
  if (args.includes('--check')) {
    const actual = await readFile(resolve(ROOT,OUTPUT_PATH),'utf8');
    if (actual !== serialized) throw Error('D056 fixture differs from reproducible public-source generation');
  } else await writeFile(resolve(ROOT,OUTPUT_PATH),serialized);
  process.stdout.write(`${JSON.stringify({mode:args.includes('--check')?'check':'write',...validateObligations(manifest).measured,product_tests_executed:0})}\n`);
}
