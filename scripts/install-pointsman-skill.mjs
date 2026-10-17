#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export function materializeSkill({target, host, sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')}) {
  if (!target || !['claude', 'codex', 'both'].includes(host)) throw new Error('Provide --target NEW_DIRECTORY --host claude|codex|both');
  const root = realpathSync(sourceRoot);
  const output = resolve(target);
  const paths = ['SKILL.md', 'references/routing-contract.md', 'scripts/pointsman.mjs'];
  const files = paths.map(path => ({path, data: readFileSync(join(root, 'skills/pointsman-routing', path))}));
  // Validate the runtime is actually present before creating any project directory.
  const cli = realpathSync(join(root, 'bin/pointsman.mjs'));
  const manifest = 'benchmarks/e2e-swe/manifests/pointsman-d083.json';
  JSON.parse(readFileSync(join(root, manifest), 'utf8'));
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root, encoding:'utf8'}).trim();
  // Non-recursive, exclusive mkdir rejects existing projects and symlink targets.
  mkdirSync(output, {mode:0o700});
  const hosts = host === 'both' ? ['claude','codex'] : [host];
  const receipt = {schema:'pointsman-skill-install.v1', sourceRoot:root, sourceRevision:revision, target:output, hosts, files:[], credentialsRead:false, providerCalls:0};
  for (const name of hosts) {
    const prefix = name === 'claude' ? '.claude' : '.agents';
    const dest = join(output, prefix, 'skills/pointsman-routing');
    for (const {path,data} of files) {
      mkdirSync(dirname(join(dest,path)), {recursive:true, mode:0o700});
      writeFileSync(join(dest,path), data, {flag:'wx',mode:0o600});
      receipt.files.push({host:name,path:join(prefix,'skills/pointsman-routing',path),sha256:createHash('sha256').update(data).digest('hex')});
    }
    const config = {schema:'pointsman-skill-runtime.v1', sourceRoot:root, sourceRevision:revision, cli, manifest};
    writeFileSync(join(dest,'runtime.json'), JSON.stringify(config,null,2)+'\n', {flag:'wx',mode:0o600});
  }
  writeFileSync(join(output,'pointsman-skill-install.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== '--target' || args[2] !== '--host') throw new Error('Usage: node scripts/install-pointsman-skill.mjs --target NEW_DIRECTORY --host claude|codex|both');
    process.stdout.write(JSON.stringify(materializeSkill({target:args[1],host:args[3]}),null,2)+'\n');
  } catch(error) { process.stderr.write(`Pointsman skill installation: ${error.message}\n`); process.exitCode=1; }
}
