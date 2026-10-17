import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const PUBLIC_DOCSTRING_GUIDANCE_CONTRACT = 'docs/orchestration/contracts/public-docstring-guidance.v1.json';
const contractText = readFileSync(new URL('../../docs/orchestration/contracts/public-docstring-guidance.v1.json', import.meta.url), 'utf8');
const contract = JSON.parse(contractText);
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = code => {throw Object.assign(new Error(code), {code});};
const safePath = path => typeof path === 'string' && path.length > 0 && !path.startsWith('/')
  && !path.includes('\\') && path.split('/').every(part => part && part !== '.' && part !== '..');

/** Read-only, source-bound diagnostics. No template execution or candidate modification. */
export function diagnosePublicDocstrings(files) {
  if (!Array.isArray(files)) fail('PUBLIC_DOCSTRING_FILES_INVALID');
  const diagnostics = [];
  for (const file of files) {
    if (!safePath(file?.path) || typeof file.content !== 'string') fail('PUBLIC_DOCSTRING_SOURCE_INVALID');
    const sourceSha = sha(file.content);
    if (file.sha256 !== undefined && file.sha256 !== sourceSha) fail('PUBLIC_DOCSTRING_SOURCE_HASH_MISMATCH');
    const lines = file.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      if (lines[index].trim() !== 'Returns:') continue;
      let entry = index + 1;
      while (entry < lines.length && !lines[entry].trim()) entry++;
      const actual = lines[entry]?.trim() ?? '';
      // Template expressions are kept opaque; no attempt to infer a resolved model/type.
      if (!actual || !/^[^:]+:\s*$/.test(actual)) continue;
      diagnostics.push({
        kind: 'bare_return_type_entry', path: file.path, source_sha256: sourceSha,
        line: entry + 1, section_line: index + 1,
        actual: actual.slice(0, contract.source_line_limit),
        expected_format: 'ActualParsedType: Meaningful return-value description.',
        interpretation: 'Potential section-header ambiguity if the rendered type is alphabetic; source observation only.',
        verification: 'not_executed',
      });
      if (diagnostics.length >= contract.source_diagnostic_limit) return diagnostics;
    }
  }
  return diagnostics;
}

function publicFailures(artifactRepair) {
  const failures = [];
  for (const check of artifactRepair?.failure?.public_evidence ?? []) {
    const cases = check.evidence?.cases;
    const entries = Array.isArray(cases) ? cases : Array.isArray(cases?.rows)
      ? cases.rows.map(row => Object.fromEntries(cases.columns.map((column, index) => [column, row[index]]))) : [];
    for (const row of entries) {
      const details = row.details ?? row;
      if (row.status !== 'failed' || row.test_id !== 'T.R10.03') continue;
      failures.push({check_id: check.check_id, test_id: row.test_id, status: row.status,
        error_type: details.error_type ?? null, message: details.message ?? null,
        outcome: 'observed_public_failure_not_generated_location'});
    }
  }
  return failures;
}

/** Fixed public guidance is identical for both arms and for initial/repair attempts. */
export function buildPublicDocstringGuidance({task, availableFiles = [], artifactRepair = null}) {
  const requirements = task?.requirement_ids ?? [];
  if (!Array.isArray(requirements)) fail('PUBLIC_DOCSTRING_TASK_INVALID');
  if (!requirements.some(id => contract.requirement_ids.includes(id))) return null;
  const relevant = availableFiles.filter(file => /(?:^|\/)(?:templates\/)?[^/]*(?:endpoint|model)[^/]*\.(?:py|jinja|py\.jinja)$/.test(file.path));
  return {
    schema_version: contract.schema_version, policy: contract.policy,
    contract: {path: PUBLIC_DOCSTRING_GUIDANCE_CONTRACT, sha256: sha(contractText)},
    requirement_ids: requirements.filter(id => contract.requirement_ids.includes(id)),
    instructions: [...contract.instructions],
    source_diagnostics: diagnosePublicDocstrings(relevant),
    public_failures: publicFailures(artifactRepair),
    automatic_source_rewrite: false,
  };
}
