import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual, promisify} from 'node:util';

const exec = promisify(execFile);
const hash = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const unique = values => [...new Set(values)];
const fail = code => { throw Object.assign(new Error(code), {code, outcome_uncertain: false}); };
const safePath = value => typeof value === 'string' && value.length > 0 && !value.startsWith('/') &&
  !value.includes('\\') && value.split('/').every(part => part && part !== '.' && part !== '..');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => hash(JSON.stringify(canonical(value)));
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const idList = value => Array.isArray(value) && value.length > 0 && value.every(id => typeof id === 'string' && id.length > 0)
  && new Set(value).size === value.length;

// The controller reads both inputs from pinned files. Candidate messages and
// error strings never provide the contract, paths, or an implementation owner.
function assertionContext(envelope, binding, plan, failure, artifactBindings, checks, testRequirements, assertionVersion) {
  if (!envelope) return null;
  const invalid = reason => ({valid: false, reason});
  try {
    const contract = envelope.contract;
    if (!safePath(envelope.source_path) || typeof envelope.source_text !== 'string' || !sha256(envelope.sha256) ||
        hash(envelope.source_text) !== envelope.sha256 || !isDeepStrictEqual(JSON.parse(envelope.source_text), contract) ||
        contract?.schema_version !== 'public-assertion-contract/v1' || contract.version !== assertionVersion ||
        !Array.isArray(contract.assertions) || !contract.assertions.length) return invalid('ASSERTION_CONTRACT_INVALID');
    const ids = new Set();
    for (const item of contract.assertions) {
      const check = checks.get(item.check_id), requirements = testRequirements[item.test_id];
      if (typeof item.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/.test(item.id) || ids.has(item.id) ||
          !check || !Array.isArray(requirements) || !idList(item.requirement_ids) || !idList(item.artifact_paths) ||
          item.artifact_paths.some(path => !safePath(path)) ||
          item.requirement_ids.some(id => !requirements.includes(id) || !check.requirement_ids.includes(id))) {
        return invalid('ASSERTION_CONTRACT_INVALID');
      }
      ids.add(item.id);
    }
    const manifest = binding?.checker_manifest;
    if (binding?.schema_version !== 'dag-filesystem-binding/v1' || !Array.isArray(manifest) ||
        manifest.some(pin => !safePath(pin.path) || !sha256(pin.sha256)) ||
        new Set(manifest.map(pin => pin.path)).size !== manifest.length ||
        !manifest.some(pin => pin.path === envelope.source_path && pin.sha256 === envelope.sha256) ||
        !isDeepStrictEqual(binding.plan, plan) || binding.plan_hash !== digest(plan) ||
        !isDeepStrictEqual(binding.artifact_bindings, artifactBindings) ||
        !isDeepStrictEqual(binding.environment, failure.environment) ||
        !sha256(binding.environment?.fingerprint) || binding.binding_digest !== failure.binding_digest ||
        binding.binding_digest !== digest({pinManifest: manifest, environment: binding.environment,
          plan_hash: binding.plan_hash, artifact_bindings: artifactBindings})) return invalid('ASSERTION_RUNTIME_BINDING_STALE');
    return {valid: true, contract, sha256: envelope.sha256, source_path: envelope.source_path,
      runtime_binding: {binding_digest: binding.binding_digest, checker_manifest_sha256: digest(manifest),
        environment_fingerprint: binding.environment.fingerprint, plan_hash: binding.plan_hash}};
  } catch { return invalid('ASSERTION_CONTRACT_INVALID'); }
}

function assertionFailure(context, item, testcase, plan, failure, artifactBindings, leaves) {
  const unknown = (reason, not_reached = []) => ({status: 'fallback', reason, not_reached});
  if (!context?.valid) return unknown(context?.reason ?? 'ASSERTION_CONTRACT_UNAVAILABLE');
  const report = item.evidence, id = testcase.test_id ?? testcase.id;
  if (report?.assertion_contract_sha256 !== context.sha256 || report.check_id !== item.check_id ||
      report.check_version !== item.check_version || report.environment_ref !== item.environment_ref ||
      report.outcome_uncertain !== false || !isDeepStrictEqual(item.runtime_binding, context.runtime_binding) ||
      !isDeepStrictEqual(item.artifact_revisions, failure.artifact_revisions) ||
      plan.artifacts.some(artifact => !sha256(item.artifact_revisions?.[artifact.id])) ||
      item.evidence_key !== digest({check_id: item.check_id, check_version: item.check_version,
        artifact_revisions: item.artifact_revisions, runtime_binding: context.runtime_binding})) {
    return unknown('ASSERTION_EVIDENCE_BINDING_STALE');
  }
  const definitions = context.contract.assertions.filter(row => row.check_id === item.check_id && row.test_id === id);
  const rows = testcase.assertion_results;
  if (!definitions.length) return unknown('ASSERTION_CASE_UNSUPPORTED');
  if (!Array.isArray(rows) || rows.length !== definitions.length ||
      report.cases.filter(row => (row.test_id ?? row.id) === id).length !== 1 ||
      rows.some((row, index) => row?.assertion_id !== definitions[index].id || !['passed', 'failed', 'not_reached'].includes(row.status))) {
    return unknown('ASSERTION_RESULTS_INCOMPLETE_OR_INVALID');
  }
  const notReached = rows.filter(row => row.status === 'not_reached').map(row => row.assertion_id);
  const failed = rows.filter(row => row.status === 'failed');
  if (failed.length !== 1 || testcase.failed_assertion_id !== failed[0].assertion_id ||
      testcase.error_type !== 'AssertionError') return unknown('ASSERTION_FAILURE_UNMAPPED', notReached);
  const index = rows.indexOf(failed[0]);
  if (rows.slice(0, index).some(row => row.status !== 'passed') || rows.slice(index + 1).some(row => row.status !== 'not_reached')) {
    return unknown('ASSERTION_EXECUTION_ORDER_INVALID');
  }
  const definition = definitions[index], requirementOwners = leaves.filter(task => task.requirement_ids.some(id => definition.requirement_ids.includes(id)));
  const artifacts = [];
  for (const path of definition.artifact_paths) {
    const matching = plan.artifacts.filter(artifact => requirementOwners.some(task => task.id === artifact.producer_task_id &&
      task.output_artifact_ids.includes(artifact.id)) && artifactBindings?.[artifact.id]?.paths?.some(bound =>
        safePath(bound) && (path === bound || path.startsWith(`${bound}/`))));
    if (matching.length !== 1) return unknown('ASSERTION_ARTIFACT_OWNER_UNKNOWN_OR_AMBIGUOUS', notReached);
    artifacts.push(matching[0].id);
  }
  const artifactIds = unique(artifacts), ownerIds = leaves.filter(task => artifactIds.some(id => task.output_artifact_ids.includes(id))).map(task => task.id);
  return {status: 'mapped', not_reached: notReached, assertion_id: definition.id,
    requirement_ids: clone(definition.requirement_ids), artifact_ids: artifactIds, owner_task_ids: ownerIds,
    attribution_basis: 'public_interface_candidate_not_fault_proof',
    source_ref: {contract_path: context.source_path, contract_sha256: context.sha256,
      checker_manifest_sha256: context.runtime_binding.checker_manifest_sha256,
      public_source: clone(definition.source_ref ?? null)},
    artifact_revisions: Object.fromEntries(artifactIds.map(id => [id, failure.artifact_revisions[id]]))};
}

// Only parse candidate text. Never import, compile as Python bytecode, eval or
// execute a candidate. Supported expressions are string literals and f-strings
// referring to a single top-level literal assignment. Unsupported code is not
// evidence of a blocker. re.compile checks syntax, never matches input strings.
const REGEX_WITNESS = String.raw`
import ast, hashlib, json, re, sys
data = json.load(sys.stdin)
results = []
for item in data:
    try:
        tree = ast.parse(item['content'])
    except (SyntaxError, ValueError, RecursionError):
        continue
    if any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in ('globals', 'locals', 'vars', 'eval', 'exec') for n in ast.walk(tree)):
        continue
    bindings = {}
    aliases = {a.asname or a.name for n in tree.body if isinstance(n, ast.Import) for a in n.names if a.name == 're'}
    assignments, allowed_stores = {}, set()
    for n in tree.body:
        if isinstance(n, (ast.Assign, ast.AnnAssign)):
            targets = n.targets if isinstance(n, ast.Assign) else [n.target]
            for target in targets:
                if isinstance(target, ast.Name):
                    assignments.setdefault(target.id, []).append(n.value)
                    allowed_stores.add(target)
                    aliases.discard(target.id)
    changed = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name) and isinstance(n.ctx, (ast.Store, ast.Del)) and n not in allowed_stores}
    for n in ast.walk(tree):
        if isinstance(n, (ast.Import, ast.ImportFrom)):
            for imported in n.names:
                name = imported.asname or imported.name.split('.')[0]
                if name in assignments:
                    changed.add(name)
                if name in aliases and not (n in tree.body and isinstance(n, ast.Import) and imported.name == 're'):
                    aliases.discard(name)
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            changed.add(n.name)
        if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) and isinstance(n.ctx, (ast.Store, ast.Del)):
            aliases.discard(n.value.id)
        if isinstance(n, ast.Subscript) and isinstance(n.ctx, (ast.Store, ast.Del)):
            aliases -= {v.id for v in ast.walk(n.value) if isinstance(v, ast.Name)}
        if isinstance(n, ast.Call):
            for arg in n.args + [kw.value for kw in n.keywords]:
                if isinstance(arg, ast.Name):
                    aliases.discard(arg.id)
    aliases -= changed
    for name, values in assignments.items():
        if name not in changed and len(values) == 1 and isinstance(values[0], ast.Constant) and isinstance(values[0].value, str):
            bindings[name] = values[0].value
    parents = {child: node for node in ast.walk(tree) for child in ast.iter_child_nodes(node)}
    def literal(node):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return node.value
        if isinstance(node, ast.Name):
            return bindings.get(node.id)
        if isinstance(node, ast.JoinedStr):
            pieces = []
            for part in node.values:
                if isinstance(part, ast.Constant) and isinstance(part.value, str):
                    pieces.append(part.value)
                elif isinstance(part, ast.FormattedValue) and part.conversion == -1 and part.format_spec is None and isinstance(part.value, ast.Name) and part.value.id in bindings:
                    pieces.append(bindings[part.value.id])
                else:
                    return None
            return ''.join(pieces)
        return None
    for call in ast.walk(tree):
        if not isinstance(call, ast.Call) or not isinstance(call.func, ast.Attribute) or not isinstance(call.func.value, ast.Name):
            continue
        alias = call.func.value.id
        if alias not in aliases or call.func.attr not in ('compile', 'findall') or call.keywords or not call.args:
            continue
        if (call.func.attr == 'compile' and len(call.args) != 1) or (call.func.attr == 'findall' and len(call.args) != 2):
            continue
        used = {alias} | {n.id for n in ast.walk(call.args[0]) if isinstance(n, ast.Name)}
        parent, shadowed = parents.get(call), False
        while parent is not None:
            if isinstance(parent, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
                args = parent.args
                names = {a.arg for a in args.posonlyargs + args.args + args.kwonlyargs}
                names |= {a.arg for a in (args.vararg, args.kwarg) if a is not None}
                names |= {n.id for n in ast.walk(parent) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store)}
                if names & used:
                    shadowed = True
            parent = parents.get(parent)
        if shadowed:
            continue
        pattern = literal(call.args[0])
        if pattern is None or len(pattern) > 4096:
            continue
        try:
            re.compile(pattern)
        except re.error as error:
            results.append({'path': item['path'], 'line': call.lineno, 'error': str(error), 'pattern_sha256': hashlib.sha256(pattern.encode()).hexdigest()})
            if len(results) >= 32:
                break
print(json.dumps({'schema_version': 'static-python-regex-witness/v1', 'python_version': sys.version.split()[0], 'witnesses': results}))
`;

function downstream(plan, ids) {
  const selected = new Set(ids), owner = new Map(plan.artifacts.map(a => [a.id, a.producer_task_id]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of plan.tasks) if (task.kind === 'implementation' && !selected.has(task.id) &&
      task.input_artifact_ids.some(id => selected.has(owner.get(id)))) { selected.add(task.id); changed = true; }
  }
  return plan.tasks.filter(t => t.kind === 'implementation' && selected.has(t.id)).map(t => t.id);
}

function validateSources(sourceFiles, artifactBindings, plan, failure) {
  if (!Array.isArray(sourceFiles) || sourceFiles.length > 256) fail('ADAPTIVE_REPAIR_SCOPE_SOURCE');
  const seen = new Set();
  for (const source of sourceFiles) {
    const artifact = plan.artifacts.find(a => a.id === source.artifact_id), paths = artifactBindings?.[source.artifact_id]?.paths;
    if (!artifact || !safePath(source.path) || !source.path.endsWith('.py') || seen.has(source.path) ||
      !Array.isArray(paths) || !paths.some(p => safePath(p) && (source.path === p || source.path.startsWith(`${p}/`))) ||
      typeof source.content !== 'string' || Buffer.byteLength(source.content) > 262144 || hash(source.content) !== source.sha256 ||
      !/^[a-f0-9]{64}$/.test(source.artifact_revision ?? '') || source.artifact_revision !== failure.artifact_revisions?.[source.artifact_id]) {
      fail('ADAPTIVE_REPAIR_SCOPE_SOURCE');
    }
    seen.add(source.path);
  }
  if (sourceFiles.reduce((n, s) => n + Buffer.byteLength(s.content), 0) > 4194304) fail('ADAPTIVE_REPAIR_SCOPE_SOURCE');
}

async function staticRegexWitness(sourceFiles) {
  if (!sourceFiles.length) return {status: 'unavailable', reason: 'NO_VERIFIED_PYTHON_SOURCE', witnesses: []};
  try {
    const child = exec('python3', ['-I', '-c', REGEX_WITNESS], {timeout: 2000, maxBuffer: 131072, encoding: 'utf8'});
    child.child.stdin.on('error', () => {});
    child.child.stdin.end(JSON.stringify(sourceFiles.map(({path, content}) => ({path, content}))));
    const {stdout} = await child, result = JSON.parse(stdout);
    if (result.schema_version !== 'static-python-regex-witness/v1' || !Array.isArray(result.witnesses)) throw new Error('INVALID_STATIC_WITNESS');
    return {status: 'completed', script_sha256: hash(REGEX_WITNESS), ...result};
  } catch {
    return {status: 'unavailable', reason: 'STATIC_REGEX_PROBE_UNAVAILABLE', script_sha256: hash(REGEX_WITNESS), witnesses: []};
  }
}

/** sourceFiles are controller-read bytes from audited artifact manifests, never
 * paths or source supplied by an error message. This narrow witness can establish
 * a repair target; it does not establish that all other failures share its cause. */
export async function buildAdaptiveRepairScope({plan, failure, publicChecks, testRequirements, artifactBindings, sourceFiles = [],
  assertionContract, runtimeBinding, assertionVersion = '1'}) {
  if (!['1', '2', '3'].includes(assertionVersion)) fail('ADAPTIVE_REPAIR_SCOPE_ASSERTION_VERSION');
  const leaves = plan.tasks.filter(t => t.kind === 'implementation'), leafIds = new Set(leaves.map(t => t.id));
  const checks = new Map(publicChecks.map(c => [c.id, c]));
  validateSources(sourceFiles, artifactBindings, plan, failure);
  const analysis = {schema_version: 'adaptive-repair-scope/v1', policy: 'minimal-public-v1', observed_failures: [],
    unexecuted: [], fixture_blockers: [], unresolved: [], source_file_count: sourceFiles.length,
    public_recheck: 'all_public_checks_after_every_selected_repair', inference: false};
  const observedOwners = new Set((failure.failed_task_ids ?? []).filter(id => leafIds.has(id))), observedRefs = [];
  const assertionMode = Boolean(assertionContract), fullOutputOwners = new Set(observedOwners), directArtifacts = new Set();
  const assertion = assertionContext(assertionContract, runtimeBinding, plan, failure, artifactBindings, checks, testRequirements, assertionVersion);
  if (assertionMode) Object.assign(analysis, {assertion_policy: 'public-assertion-artifact/v1',
    assertion_contract_sha256: assertionContract.sha256 ?? null, not_reached_assertions: [],
    attribution_basis: 'public_interface_candidate_not_fault_proof'});
  if (assertionMode && assertionVersion !== '1') analysis.assertion_contract_version = assertionVersion;
  const fallbackRequirements = new Set(), regexRequests = [];
  for (const item of failure.public_evidence.filter(e => e.status === 'failed')) {
    const check = checks.get(item.check_id), report = item.evidence;
    if (!check || item.check_version !== check.version || item.environment_ref !== check.environment_ref || item.outcome_uncertain !== false) {
      fail('ADAPTIVE_REPAIR_SCOPE_EVIDENCE');
    }
    const missing = clone(report?.unexecuted_test_ids ?? []);
    if (missing.length) analysis.unexecuted.push({check_id: check.id, test_ids: missing});
    for (const testcase of (report?.cases ?? []).filter(c => c.status === 'failed')) {
      const id = testcase.test_id ?? testcase.id, requirementIds = testRequirements[id];
      if (assertionMode) {
        const mapped = assertionFailure(assertion, item, testcase, plan, failure, artifactBindings, leaves);
        if (mapped.not_reached.length) analysis.not_reached_assertions.push({check_id: check.id, test_id: id, assertion_ids: mapped.not_reached});
        if (mapped.status === 'mapped') {
          const {status, not_reached, ...evidence} = mapped;
          analysis.observed_failures.push({check_id: check.id, test_id: id, evidence_level: 'assertion', ...evidence});
          mapped.owner_task_ids.forEach(owner => observedOwners.add(owner));
          mapped.artifact_ids.forEach(artifact => directArtifacts.add(artifact));
          observedRefs.push(`assertion:${mapped.assertion_id}`, `test:${id}`, `check:${check.id}`);
          continue;
        }
        analysis.unresolved.push({check_id: check.id, test_id: id, reason: mapped.reason,
          fallback_scope: 'case_requirement_owners_all_outputs'});
      }
      const owners = Array.isArray(requirementIds) ? leaves.filter(t => t.requirement_ids.some(r => requirementIds.includes(r))).map(t => t.id) : [];
      analysis.observed_failures.push({check_id: check.id, test_id: id, requirement_ids: clone(requirementIds ?? []), owner_task_ids: owners,
        ...(assertionMode ? {evidence_level: 'case_fallback', artifact_ids: unique(leaves.filter(t => owners.includes(t.id)).flatMap(t => t.output_artifact_ids))} : {})});
      if (owners.length) owners.forEach(id => { observedOwners.add(id); fullOutputOwners.add(id); });
      else { check.requirement_ids.forEach(id => fallbackRequirements.add(id)); analysis.unresolved.push({check_id: check.id, test_id: id, reason: 'OBSERVED_FAILURE_OWNER_UNKNOWN'}); }
      observedRefs.push(`test:${id}`, `check:${check.id}`);
    }
    if (missing.length || report?.error) {
      const message = report?.error?.message, match = typeof message === 'string' && message.startsWith('valid public fixture generation failed:')
        ? /^re\.error: ([^\r\n]{1,512})\s*$/m.exec(message) : null;
      const bound = /^[a-f0-9]{64}$/.test(failure.binding_digest ?? '') &&
        item.runtime_binding?.binding_digest === failure.binding_digest &&
        isDeepStrictEqual(item.artifact_revisions, failure.artifact_revisions) && /^[a-f0-9]{64}$/.test(item.evidence_key ?? '');
      if (match && bound) regexRequests.push({check, item, error: match[1].trim()});
      else { analysis.unresolved.push({check_id: check.id, reason: 'FIXTURE_BLOCKER_OWNER_UNKNOWN', unexecuted_count: missing.length}); check.requirement_ids.forEach(id => fallbackRequirements.add(id)); }
    }
  }
  const probe = regexRequests.length ? await staticRegexWitness(sourceFiles) : {status: 'not_needed', witnesses: []};
  analysis.static_probe = {status: probe.status, reason: probe.reason ?? null, script_sha256: probe.script_sha256 ?? null, python_version: probe.python_version ?? null};
  const blockerOwners = new Set(), blockerRefs = [];
  for (const request of regexRequests) {
    const matches = probe.witnesses.filter(w => w.error === request.error).map(w => {
      const source = sourceFiles.find(s => s.path === w.path), artifact = plan.artifacts.find(a => a.id === source?.artifact_id);
      return source && artifact ? {...w, artifact_id: artifact.id, owner_task_id: artifact.producer_task_id,
        source_sha256: source.sha256, artifact_revision: source.artifact_revision} : null;
    }).filter(Boolean);
    const paths = unique(matches.map(w => w.path));
    if (paths.length === 1) {
      const witness = matches[0]; blockerOwners.add(witness.owner_task_id);
      directArtifacts.add(witness.artifact_id);
      blockerRefs.push(`check:${request.check.id}`, `artifact:${witness.artifact_id}`);
      analysis.fixture_blockers.push({check_id: request.check.id, evidence_key: request.item.evidence_key,
        binding_digest: failure.binding_digest, diagnosis: 'STATIC_REGEX_SYNTAX_REPRODUCED', witness,
        remaining_observed_failures: 'unresolved_until_all_public_checks_rerun'});
    } else {
      analysis.unresolved.push({check_id: request.check.id, reason: paths.length > 1 ? 'FIXTURE_BLOCKER_AMBIGUOUS' : 'FIXTURE_BLOCKER_UNPROVEN',
        matched_paths: paths, error: request.error});
      request.check.requirement_ids.forEach(id => fallbackRequirements.add(id));
    }
  }
  const order = set => leaves.filter(t => set.has(t.id)).map(t => t.id), candidates = [];
  const add = (id, task_ids, reason, evidence_refs, forceFull = false) => {
    const artifact_ids = assertionMode ? unique(leaves.filter(t => task_ids.includes(t.id)).flatMap(task => {
      const selected = task.output_artifact_ids.filter(id => directArtifacts.has(id));
      return forceFull || fullOutputOwners.has(task.id) || !selected.length ? task.output_artifact_ids : selected;
    })) : null;
    if (assertionMode && task_ids.some(id => !artifact_ids.some(artifact => plan.artifacts.some(a => a.id === artifact && a.producer_task_id === id)))) {
      fail('ADAPTIVE_REPAIR_SCOPE_ARTIFACT_OWNER');
    }
    if (task_ids.length && !candidates.some(c => isDeepStrictEqual(c.task_ids, task_ids) &&
      (!assertionMode || isDeepStrictEqual(c.artifact_ids, artifact_ids)))) {
      candidates.push({id, task_ids, reason: assertionMode ? `${reason} Artifact paths are public-interface repair candidates, not proof of the faulty implementation. A repair may remain incomplete; never widen writes silently.` : reason,
        evidence_refs: unique(evidence_refs), ...(assertionMode ? {artifact_ids, attribution_basis: 'public_interface_candidate_not_fault_proof'} : {})});
    }
  };
  const blockers = order(blockerOwners), observed = order(observedOwners);
  add('repair-fixture-blocker-owners', blockers,
    'First repair only the owners of revision-bound source files that independently reproduce the public fixture blocker. Other observed failures remain unresolved. Carry other bytes forward and rerun every public check.', blockerRefs);
  add('repair-failure-owners', observed,
    'Repair owners of observed failed assertions or failed local tasks. Unexecuted cases are not observed failures. Carry other bytes forward and rerun every public check.', [...observedRefs, ...(failure.failed_task_ids ?? []).map(id => `task:${id}`)]);
  const combined = order(new Set([...blockers, ...observed]));
  add('repair-failure-owners-and-consumers', downstream(plan, combined),
    'Repair the evidenced blocker or observed-failure owners and their downstream consumers. Rerun every public check.', [...blockerRefs, ...observedRefs, ...(failure.failed_task_ids ?? []).map(id => `task:${id}`)]);
  const fallback = order(new Set([...combined, ...leaves.filter(t => t.requirement_ids.some(r => fallbackRequirements.has(r))).map(t => t.id)]));
  if (analysis.unresolved.length) add('repair-unknown-public-scope', fallback.length ? fallback : leaves.map(t => t.id),
    'Fallback: some public failure or fixture-blocker ownership is unknown. This scope is a conservative check-scope fallback, not evidence that every task failed. Rerun every public check.',
    unique(analysis.unresolved.map(x => `check:${x.check_id}`)), true);
  analysis.blocker_owner_task_ids = blockers;
  analysis.observed_failure_owner_task_ids = observed;
  analysis.fallback_required = analysis.unresolved.length > 0;
  return {candidates, analysis};
}
