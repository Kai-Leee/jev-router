// Offline structural verification only. Uses an existing YAML package; no install.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const require = createRequire('/Users/lee/workspace/plugins/rea-local/package.json');
const YAML = require('yaml');
const files = ['skills/pointsman-routing/SKILL.md', 'skills/pointsman-routing/references/routing-contract.md', 'docs/skills/POINTSMAN_ROUTING_DESIGN.md'];
const skill = readFileSync(files[0], 'utf8');
const match = skill.match(/^---\n([\s\S]*?)\n---/);
assert.ok(match, 'frontmatter required');
const doc = YAML.parseDocument(match[1]);
assert.equal(doc.errors.length, 0);
const meta = doc.toJS();
assert.equal(meta.name, 'pointsman-routing');
assert.deepEqual(Object.keys(meta).sort(), ['description', 'name']);
assert.ok(typeof meta.description === 'string' && meta.description.length > 0 && meta.description.length <= 1024);
assert.ok(!/[<>]/.test(meta.description));
assert.ok(!skill.includes('[TODO:'));
const links = [];
for (const file of files) {
  const body = readFileSync(file, 'utf8');
  for (const m of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    if (/^https?:/.test(m[1])) continue;
    const path = resolve(dirname(file), m[1].split('#')[0]);
    assert.ok(existsSync(path), `${file}: missing ${m[1]}`);
    links.push({file, target:m[1], exists:true});
  }
}
const inventoryCommand = ['skills/jev-skill-maintenance/scripts/inventory_skills.py', '--source-root', 'skills', '--installed-root', '/Users/lee/.codex/skills', '--installed-root', '/Users/lee/.agents/skills', '--installed-root', '/Users/lee/.claude/skills'];
const inventory = JSON.parse(execFileSync('python3', inventoryCommand, { encoding: 'utf8' }));
const entry = inventory.skills.find(s => s.name === 'pointsman-routing');
assert.ok(entry);
const output = {
  date:'2026-10-14', scope:'offline syntax, explicit Markdown links, source inventory; not semantic routing or host execution',
  command:'node docs/skills/routing-evidence-20261014/check.mjs',
  inventory_command: ['python3', ...inventoryCommand],
  yaml_parser:require.resolve('yaml'), result:'passed',
  official_validator_attempts:[
    {python:'python3', exit:1, error:"ModuleNotFoundError: No module named 'yaml'"},
    {python:'/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',exit:1,error:"ModuleNotFoundError: No module named 'yaml'"}
  ],
  fallback:'Existing Node YAML parser plus explicit structural assertions. Not an execution of the official quick_validate.py.',
  files:files.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})),
  relative_links:links, installed_copies:entry.copies.map(c=>({path:c.path,status:c.status})),
  host_discovery_verified:false, host_execution_verified:false, live_routing_measured:false
};
writeFileSync('docs/skills/routing-evidence-20261014/verification.json', JSON.stringify(output,null,2)+'\n');
process.stdout.write(JSON.stringify(output,null,2)+'\n');
