import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {posix} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {projectCodexWorkerInputV2} from './codex-worker-input-projection-v2.mjs';

export const CODEX_WORKER_INPUT_PROJECTION_CONTRACT = 'docs/orchestration/contracts/codex-worker-input-projection.v1.json';
const contractText = readFileSync(new URL('../../docs/orchestration/contracts/codex-worker-input-projection.v1.json', import.meta.url), 'utf8');
const contract = JSON.parse(contractText);
const sha = value => createHash('sha256').update(value).digest('hex');
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = code => {throw Object.assign(new Error(code), {code});};
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rows = value => Array.isArray(value) ? value : Array.isArray(value?.columns) && Array.isArray(value?.rows)
  ? value.rows.map(row => Object.fromEntries(value.columns.map((column, i) => [column, row[i]]))) : [];
const strings = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
const safePath = path => typeof path === 'string' && path.length && !path.startsWith('/') && !path.includes('\\')
  && path.split('/').every(part => part && part !== '.' && part !== '..');

/** Conservative source closure; original bytes and authorization remain outside this projection. */
export function projectCodexWorkerInput(packet, {policy, catalog} = {}) {
  if (policy === 'artifact-family-closed-v2') return projectCodexWorkerInputV2(packet, {catalog, legacyProject: projectCodexWorkerInput});
  if (policy !== contract.policy) fail('CODEX_WORKER_INPUT_POLICY_INVALID');
  const original = structuredClone(packet), next = structuredClone(packet), available = packet.available_files;
  if (!Array.isArray(available)) fail('CODEX_WORKER_INPUT_FILES_INVALID');
  const byPath = new Map(), reasons = new Map(), fallback = [];
  for (const file of available) {
    if (!safePath(file?.path) || typeof file.content !== 'string' || byPath.has(file.path)
      || file.sha256 !== sha(file.content) || file.bytes !== Buffer.byteLength(file.content)) fail('CODEX_WORKER_INPUT_SOURCE_IDENTITY');
    byPath.set(file.path, file);
  }
  const keep = (path, reason, required = true) => {
    if (!byPath.has(path)) {if (required) fallback.push(`missing_source:${path}`); return;}
    const list = reasons.get(path) ?? new Set(); list.add(reason); reasons.set(path, list);
  };
  const repair = packet.artifact_repair, failure = repair?.failure, scope = failure?.repair_scope;
  const eligible = packet.operation === 'repair';
  if (eligible) {
    if (!object(repair) || !object(failure) || failure.outcome_uncertain !== false || !object(scope)
      || scope.fallback_required === true || !Array.isArray(scope.observed_failures) || !scope.observed_failures.length
      || !scope.observed_failures.every(item => object(item) && typeof item.check_id === 'string' && typeof item.test_id === 'string')
      || !Array.isArray(failure?.public_evidence) || !failure.public_evidence.length)
      fallback.push('incomplete_failure_or_owner_evidence');
    if ((failure?.failed_task_ids ?? []).length || (failure?.undispatched_task_ids ?? []).length
      || ['unresolved', 'unexecuted', 'fixture_blockers', 'not_reached_assertions'].some(key => (scope?.[key] ?? []).length)
      || (scope?.inferred_ownership?.unknown_failure_ids ?? []).length || (scope?.causal?.unresolved ?? []).length)
      fallback.push('unresolved_or_unexecuted_evidence');
    for (const check of failure?.public_evidence ?? []) {
      const effective = {...failure.public_evidence_defaults, ...check};
      if (effective.outcome_uncertain !== false || effective.executed !== true || !['passed', 'failed'].includes(effective.status)
        || (check.evidence?.unexecuted_test_ids ?? []).length || check.evidence?.error) fallback.push('incomplete_public_evidence');
    }
    for (const check of failure?.local_evidence ?? []) {
      const effective = {...failure.local_evidence_defaults, ...check};
      if (effective.status !== 'passed' || effective.outcome_uncertain !== false || effective.executed !== true) fallback.push('incomplete_local_evidence');
    }
    if (!Array.isArray(packet.task?.write_scope) || !Array.isArray(packet.task?.read_scope)
      || !isDeepStrictEqual(repair.allowed_write_paths, packet.task.write_scope)) fallback.push('missing_write_or_read_binding');
    for (const path of packet.task?.write_scope ?? []) keep(path, 'writable');
    for (const path of packet.task?.read_scope ?? []) keep(path, 'declared_read');
    for (const [field, label] of [['artifacts', 'selected_artifact'], ['required_read_artifacts', 'required_read'],
      ['read_only_dependencies', 'read_dependency'], ['inherited_same_owner_artifacts', 'inherited_same_owner']])
      for (const item of rows(repair?.[field])) for (const path of item.paths ?? []) keep(path, label);
    for (const chain of scope?.causal?.chains ?? []) for (const node of chain.nodes ?? []) if (node.path) keep(node.path, 'causal_source');
    const originalText = strings([failure, packet.public_docstring_guidance]).join('\n');
    for (const path of byPath.keys()) if (new RegExp(`(^|[^A-Za-z0-9_./-])${escape(path)}($|[^A-Za-z0-9_./-])`).test(originalText)) keep(path, 'public_failure_source');
    // Interfaces and file bodies resolve only known files; no arbitrary filesystem lookup.
    const modules = new Map([...byPath.keys()].filter(path => path.endsWith('.py')).map(path => [path.replace(/(?:\/__init__)?\.py$/, '').replaceAll('/', '.'), path]));
    const classes = new Map(), functions = new Map();
    for (const file of available.filter(file => file.path.endsWith('.py'))) for (const match of file.content.matchAll(/^\s*(class|(?:async\s+)?def)\s+([A-Za-z_]\w*)\b/gm)) {
      const registry = match[1] === 'class' ? classes : functions;
      const paths = registry.get(match[2]) ?? []; paths.push(file.path); registry.set(match[2], paths);
    }
    const artifactPaths = new Map((catalog?.artifacts ?? []).map(artifact => [artifact.id, artifact.paths]));
    const interfaces = [...rows(repair?.units), ...rows(repair?.causal_read_interfaces), ...Object.values(repair?.dependency_interfaces ?? {})];
    const interfaceTexts = interfaces.flatMap(item => typeof item === 'string' ? [item] : typeof item?.interface === 'string' ? [item.interface] : []);
    for (const unit of catalog?.units ?? []) if ((unit.artifact_ids ?? []).some(id => (artifactPaths.get(id) ?? []).some(path => reasons.has(path))))
      interfaceTexts.push(unit.interface ?? '');
    const inspectText = (text, basis) => {
      for (const path of byPath.keys()) if (new RegExp(`(^|[^A-Za-z0-9_./-])${escape(path)}($|[^A-Za-z0-9_./-])`).test(text)) keep(path, `${basis}:path`);
      for (const [module, path] of modules) if (new RegExp(`(^|[^A-Za-z0-9_.])${escape(module)}($|[^A-Za-z0-9_.])`).test(text)) keep(path, `${basis}:module`);
      for (const [name, paths] of classes) if (new RegExp(`\\b${name}\\b`).test(text)) for (const path of paths) keep(path, `${basis}:class`);
      if (basis === 'interface') for (const [name, paths] of functions) if (new RegExp(`\\b${name}\\b`).test(text))
        for (const path of paths) keep(path, 'interface:function');
    };
    for (const text of interfaceTexts) inspectText(text, 'interface');
    const inspected = new Set();
    for (;;) {
      const path = [...reasons.keys()].find(path => !inspected.has(path)); if (!path) break;
      inspected.add(path); const text = byPath.get(path).content; inspectText(text, 'source');
      if (path.endsWith('.py')) {
        if (/\b(?:__import__|import_module)\s*\(/.test(text)) fallback.push(`dynamic_import:${path}`);
        for (const match of text.matchAll(/\bget_template\s*\(\s*([^\n]+)/g)) {
          const literal = match[1].match(/^(['"])([^'"]+)\1/);
          if (!literal) {fallback.push(`dynamic_template_reference:${path}`); continue;}
          const targets = [...byPath.keys()].filter(candidate => candidate === literal[2] || candidate.endsWith('/' + literal[2]));
          if (targets.length !== 1) fallback.push(`unresolved_template:${path}:${literal[2]}`); else keep(targets[0], 'python_template_reference');
        }
        for (const match of text.matchAll(/^\s*from\s+([.\w]+)\s+import\s+([^\n]+)/gm)) {
          let module = match[1], clause = match[2].replace(/#.*$/, '').trim();
          if (clause.startsWith('(')) {
            const start = match.index + match[0].indexOf('(', match[0].indexOf('import'));
            const end = text.indexOf(')', start + 1);
            if (end < 0 || end - start > 5000) {fallback.push(`unresolved_multiline_import:${path}:${module}`); continue;}
            clause = text.slice(start + 1, end).replace(/#[^\n]*/g, '').replaceAll('\n', ' ').trim();
          }
          const names = clause.replace(/,\s*$/, '').split(',').map(name => name.trim());
          if (!names.length || names.some(name => !/^(?:\*|[A-Za-z_]\w*(?:\s+as\s+[A-Za-z_]\w*)?)$/.test(name))) {
            fallback.push(`unsupported_import_clause:${path}:${module}`); continue;
          }
          const members = names.map(name => name.split(/\s+/)[0]);
          const relative = module.startsWith('.');
          if (module.startsWith('.')) {
            const dots = module.match(/^\.+/)[0].length, parts = posix.dirname(path).split('/');
            if (dots > parts.length) {fallback.push(`unresolved_import:${path}:${module}`); continue;}
            module = [...parts.slice(0, parts.length - dots + 1), ...module.slice(dots).split('.').filter(Boolean)].join('.');
          }
          const base = modules.get(module), targets = members.map(name => modules.get(`${module}.${name}`)).filter(Boolean);
          if (base) keep(base, 'static_import');
          for (const target of targets) keep(target, 'static_import_member');
          if (members.includes('*')) for (const [candidate, target] of modules) if (candidate.startsWith(module + '.')) keep(target, 'wildcard_package_import');
          if (!base && !targets.length && (relative || [...modules.keys()].some(key => key.startsWith(module.split('.')[0] + '.'))))
            fallback.push(`unresolved_import:${path}:${module}`);
        }
        for (const match of text.matchAll(/^\s*import\s+([^\n]+)/gm)) {
          for (const clause of match[1].replace(/#.*$/, '').split(',')) {
            const imported = clause.trim().match(/^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)(?:\s+as\s+[A-Za-z_]\w*)?$/);
            if (!imported) {fallback.push(`unsupported_import_clause:${path}`); continue;}
            const module = imported[1], target = modules.get(module);
            if (target) keep(target, 'module_import');
            // A package alias can access any of its children; keep the complete known package subtree.
            if (target?.endsWith('/__init__.py') || !module.includes('.')) for (const [candidate, body] of modules)
              if (candidate.startsWith(module + '.')) keep(body, 'package_import_subtree');
          }
        }
      }
      if (path.endsWith('.jinja')) for (const match of text.matchAll(/{%[-+]?\s*(?:include|extends|import|from)\s+([^%]+)%}/g)) {
        const literal = match[1].match(/^(['"])([^'"]+)\1/);
        if (!literal) {fallback.push(`dynamic_template_reference:${path}`); continue;}
        const target = [...byPath.keys()].filter(candidate => candidate === literal[2] || candidate.endsWith('/' + literal[2]));
        if (target.length !== 1) fallback.push(`unresolved_template:${path}:${literal[2]}`); else keep(target[0], 'template_reference');
      }
    }
  }
  let mode = !eligible ? 'implementation_unchanged' : fallback.length ? 'full_context_fallback' : 'dependency_closed';
  let omitted = mode === 'dependency_closed' ? available.filter(file => !reasons.has(file.path)) : [];
  if (omitted.length) {
    next.available_files = available.filter(file => reasons.has(file.path));
    next.omitted_readable_files = omitted.map(({path, bytes, sha256}) => ({path, bytes, sha256, access: 'metadata_only_not_inline'}));
    next.read_context_policy = {policy: contract.policy, instructions: contract.instructions};
    if (bytes(next) >= bytes(original)) {
      next.available_files = original.available_files;
      delete next.omitted_readable_files; delete next.read_context_policy;
      mode = 'not_smaller_unchanged'; omitted = [];
    }
  }
  // Projection cannot modify any instruction, failure, interface, authority, file body or output path.
  const untouched = {...next}; delete untouched.omitted_readable_files; delete untouched.read_context_policy;
  untouched.available_files = original.available_files;
  if (!isDeepStrictEqual(untouched, original)) fail('CODEX_WORKER_INPUT_MEANING_CHANGED');
  const report = {schema_version: contract.schema_version, policy: contract.policy, mode, fallback_reasons: [...new Set(fallback)],
    contract: {path: CODEX_WORKER_INPUT_PROJECTION_CONTRACT, sha256: sha(contractText)},
    original_packet_bytes: bytes(original), projected_packet_bytes: bytes(next), original_packet_characters: [...JSON.stringify(original)].length,
    projected_packet_characters: [...JSON.stringify(next)].length, character_basis: 'Unicode code points in compact JSON',
    original_packet_sha256: sha(JSON.stringify(original)), projected_packet_sha256: sha(JSON.stringify(next)),
    available_file_count: available.length, retained_file_count: next.available_files.length, omitted_file_count: omitted.length,
    original_source_bytes: available.reduce((n, file) => n + file.bytes, 0), omitted_source_bytes: omitted.reduce((n, file) => n + file.bytes, 0),
    retained: next.available_files.map(file => ({path: file.path, sha256: file.sha256, reasons: [...(reasons.get(file.path) ?? [])]})),
    omitted: omitted.map(({path, bytes, sha256}) => ({path, bytes, sha256})),
    authority_failure_requirements_interfaces_unchanged: true, retained_file_bytes_unchanged: true, model_input_tokens: null};
  return {packet: next, report};
}
