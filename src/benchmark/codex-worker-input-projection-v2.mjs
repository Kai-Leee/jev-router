import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {posix} from 'node:path';
import {isDeepStrictEqual} from 'node:util';

export const CODEX_WORKER_INPUT_PROJECTION_V2_CONTRACT = 'docs/orchestration/contracts/codex-worker-input-projection.v2.json';
const contractText = readFileSync(new URL('../../docs/orchestration/contracts/codex-worker-input-projection.v2.json', import.meta.url), 'utf8');
const contract = JSON.parse(contractText), sha = value => createHash('sha256').update(value).digest('hex');
const script = new URL('./codex-worker-source-analysis.py', import.meta.url);
const safe = path => typeof path === 'string' && path && !path.startsWith('/') && !path.includes('\\') && path.split('/').every(part => part && part !== '.' && part !== '..');
const rows = value => Array.isArray(value) ? value : Array.isArray(value?.columns) && Array.isArray(value?.rows)
  ? value.rows.map(row => Object.fromEntries(value.columns.map((name, i) => [name, row[i]]))) : [];
const strings = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bytes = value => Buffer.byteLength(JSON.stringify(value));

export function analyzeCodexWorkerSources(files) {
  return JSON.parse(execFileSync('python3', ['-I', fileURLToPath(script)], {
    input: JSON.stringify({files}), encoding: 'utf8', timeout: 3000, maxBuffer: 8 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  }));
}

/** New policy; legacy validation and legacy behavior remain independently selectable. */
export function projectCodexWorkerInputV2(packet, {catalog, legacyProject, analyze = analyzeCodexWorkerSources} = {}) {
  const baseline = legacyProject(packet, {policy: 'dependency-closed-v1', catalog});
  if (packet.operation !== 'repair') return {...baseline, report: {...baseline.report, schema_version: contract.schema_version,
    policy: contract.policy, contract: {path: CODEX_WORKER_INPUT_PROJECTION_V2_CONTRACT, sha256: sha(contractText)}}};
  const original = structuredClone(packet), next = structuredClone(packet), files = packet.available_files;
  const byPath = new Map(files.map(file => [file.path, file])), reasons = new Map(), proofs = [], fallback = [];
  // Replace only the legacy lexical dependency checks with AST-backed checks. Evidence and authority blocks stay binding.
  const lexical = /^(?:dynamic_import|dynamic_template_reference|unresolved_template|unresolved_import|unsupported_import_clause|unresolved_multiline_import):/;
  fallback.push(...baseline.report.fallback_reasons.filter(reason => !lexical.test(reason)));
  let analysis = {};
  try {analysis = analyze(files);} catch {fallback.push('source_analysis_unavailable');}
  const keep = (path, reason) => {
    if (!byPath.has(path)) {fallback.push(`missing_source:${path}`); return;}
    const values = reasons.get(path) ?? new Set(); values.add(reason); reasons.set(path, values);
  };
  const repair = packet.artifact_repair;
  for (const path of [...packet.task.write_scope, ...packet.task.read_scope]) keep(path, 'declared_authority');
  for (const field of ['artifacts', 'required_read_artifacts', 'read_only_dependencies', 'inherited_same_owner_artifacts'])
    for (const item of rows(repair[field])) for (const path of item.paths ?? []) keep(path, field);
  for (const chain of repair.failure?.repair_scope?.causal?.chains ?? []) for (const node of chain.nodes ?? []) if (node.path) keep(node.path, 'causal_source');
  const publicText = strings([repair.failure, packet.public_docstring_guidance]).join('\n');
  for (const path of byPath.keys()) if (new RegExp(`(^|[^A-Za-z0-9_./-])${escape(path)}($|[^A-Za-z0-9_./-])`).test(publicText)) keep(path, 'public_failure_source');
  const modules = new Map(files.filter(file => file.path.endsWith('.py')).map(file => [file.path.replace(/(?:\/__init__)?\.py$/, '').replaceAll('/', '.'), file.path]));
  const definitions = new Map();
  for (const [path, inspected] of Object.entries(analysis)) for (const entry of inspected.definitions ?? []) {
    const paths = definitions.get(entry.name) ?? []; paths.push({path, kind: entry.kind}); definitions.set(entry.name, paths);
  }
  const selectedIds = new Set([...rows(repair.artifacts).map(row => row.id ?? row.artifact_id), ...rows(repair.required_read_artifacts).map(row => row.artifact_id)]);
  const interfaces = [...rows(repair.units), ...rows(repair.causal_read_interfaces), ...Object.values(repair.dependency_interfaces ?? {}),
    ...(catalog?.units ?? []).filter(unit => unit.artifact_ids.some(id => selectedIds.has(id)))];
  for (const item of interfaces) {
    const text = typeof item === 'string' ? item : item.interface ?? '';
    for (const [module, path] of modules) if (new RegExp(`(^|[^A-Za-z0-9_.])${escape(module)}($|[^A-Za-z0-9_.])`).test(text)) keep(path, 'selected_interface_module');
    for (const [name, paths] of definitions) if (new RegExp(`\\b${escape(name)}\\b`).test(text)) for (const {path} of paths) keep(path, 'selected_interface_definition');
  }
  const family = (root, from, line) => {
    if (!safe(root)) {fallback.push(`unverified_template_loader:${from}:${line}`); return;}
    const candidates = [...byPath.keys()].filter(path => path.startsWith(root + '/') && path.endsWith('.jinja'));
    if (!candidates.length) {fallback.push(`empty_template_family:${from}:${line}`); return;}
    for (const path of candidates) keep(path, 'verified_template_family');
    proofs.push({source_path: from, source_sha256: byPath.get(from)?.sha256, line, loader_root: root, candidate_paths: candidates});
  };
  const imported = (module, members, source, {relative = false, subtree = false} = {}) => {
    const target = modules.get(module), children = members.map(member => modules.get(`${module}.${member}`)).filter(Boolean);
    if (target) keep(target, 'ast_import'); for (const path of children) keep(path, 'ast_import_member');
    if (members.includes('*') || subtree && target?.endsWith('/__init__.py')) for (const [name, path] of modules)
      if (name.startsWith(module + '.')) keep(path, 'ast_import_package_family');
    if (!target && !children.length && (relative || [...modules.keys()].some(name => name.startsWith(module.split('.')[0] + '.'))))
      fallback.push(`unresolved_ast_import:${source}:${module}`);
  };
  const inspected = new Set();
  for (;;) {
    const path = [...reasons.keys()].find(path => !inspected.has(path)); if (!path) break;
    inspected.add(path); const file = byPath.get(path);
    if (path.endsWith('.py')) {
      const source = analysis[path];
      if (!source || source.error) {fallback.push(`source_syntax_or_analysis_error:${path}`); continue;}
      for (const row of source.imports) {
        let module = row.module;
        if (row.level) {
          const parts = posix.dirname(path).split('/');
          if (row.level > parts.length) {fallback.push(`unresolved_ast_import:${path}:${module}`); continue;}
          module = [...parts.slice(0, parts.length - row.level + 1), ...module.split('.').filter(Boolean)].join('.');
        }
        imported(module, row.members, path, {relative: row.level > 0, subtree: row.package_subtree});
      }
      for (const row of source.dynamic_imports) {
        if (row.module === null) fallback.push(`unknown_dynamic_import:${path}:${row.line}`);
        else {imported(row.module, [], path); proofs.push({source_path: path, source_sha256: file.sha256,
          line: row.line, literal_dynamic_module: row.module, candidate_paths: modules.has(row.module) ? [modules.get(row.module)] : [], external_to_verified_catalog: !modules.has(row.module)});}
      }
      for (const row of source.templates) {
        if (row.literal !== null) {
          const candidates = [...byPath.keys()].filter(target => target === row.literal || target.endsWith('/' + row.literal));
          if (candidates.length === 1 && safe(row.literal)) keep(candidates[0], 'ast_literal_template');
          else fallback.push(`unresolved_literal_template:${path}:${row.line}`);
        } else if (row.loader_root) family(row.loader_root, path, row.line);
        else fallback.push(`unknown_dynamic_template_loader:${path}:${row.line}`);
      }
      // Class names in real source can require shared representation definitions; comments/string prose are not import edges.
      for (const [name, paths] of definitions) if (paths.some(entry => entry.kind === 'class') && new RegExp(`\\b${escape(name)}\\b`).test(file.content))
        for (const entry of paths.filter(entry => entry.kind === 'class')) keep(entry.path, 'shared_class_definition');
    } else if (path.endsWith('.jinja')) for (const match of file.content.matchAll(/{%[-+]?\s*(?:include|extends|import|from)\s+([^%]+)%}/g)) {
      const literal = match[1].match(/^(['"])([^'"]+)\1/);
      if (literal) {
        const targets = [...byPath.keys()].filter(target => target === literal[2] || target.endsWith('/' + literal[2]));
        if (targets.length === 1 && safe(literal[2])) keep(targets[0], 'literal_template_reference'); else fallback.push(`unresolved_jinja_reference:${path}`);
      } else {
        const roots = [...new Set(proofs.filter(proof => proof.loader_root && path.startsWith(proof.loader_root + '/')).map(proof => proof.loader_root))];
        if (roots.length === 1) family(roots[0], path, null); else fallback.push(`unknown_dynamic_jinja_family:${path}`);
      }
    }
  }
  let mode = fallback.length ? 'full_context_fallback' : 'artifact_family_closed';
  let omitted = fallback.length ? [] : files.filter(file => !reasons.has(file.path));
  if (omitted.length) {
    next.available_files = files.filter(file => reasons.has(file.path));
    next.omitted_readable_files = omitted.map(({path, bytes, sha256}) => ({path, bytes, sha256, access: 'metadata_only_not_inline'}));
    next.read_context_policy = {policy: contract.policy, instructions: contract.instructions};
    if (bytes(next) >= bytes(original)) {next.available_files = original.available_files; delete next.omitted_readable_files;
      delete next.read_context_policy; omitted = []; mode = 'not_smaller_unchanged';}
  }
  const restored = structuredClone(next); restored.available_files = original.available_files;
  delete restored.omitted_readable_files; delete restored.read_context_policy;
  if (!isDeepStrictEqual(restored, original)) throw Object.assign(new Error('CODEX_WORKER_INPUT_MEANING_CHANGED'), {code: 'CODEX_WORKER_INPUT_MEANING_CHANGED'});
  return {packet: next, report: {...baseline.report, schema_version: contract.schema_version, policy: contract.policy, mode,
    contract: {path: CODEX_WORKER_INPUT_PROJECTION_V2_CONTRACT, sha256: sha(contractText)},
    source_analysis: {path: 'src/benchmark/codex-worker-source-analysis.py', sha256: sha(readFileSync(script)), execution: 'python3 -I; ast.parse only; candidate execution disabled'},
    legacy_lexical_fallback_reasons: baseline.report.fallback_reasons, fallback_reasons: [...new Set(fallback)], bounded_family_proofs: proofs,
    original_packet_bytes: bytes(original), projected_packet_bytes: bytes(next), original_packet_characters: [...JSON.stringify(original)].length,
    projected_packet_characters: [...JSON.stringify(next)].length, original_packet_sha256: sha(JSON.stringify(original)), projected_packet_sha256: sha(JSON.stringify(next)),
    available_file_count: files.length, retained_file_count: next.available_files.length, omitted_file_count: omitted.length,
    original_source_bytes: files.reduce((n, file) => n + file.bytes, 0), omitted_source_bytes: omitted.reduce((n, file) => n + file.bytes, 0),
    retained: next.available_files.map(file => ({path: file.path, sha256: file.sha256, reasons: [...(reasons.get(file.path) ?? [])]})),
    omitted: omitted.map(({path, bytes, sha256}) => ({path, bytes, sha256})), model_input_tokens: null}};
}
