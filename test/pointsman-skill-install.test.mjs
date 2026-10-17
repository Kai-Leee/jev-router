import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {materializeSkill} from '../scripts/install-pointsman-skill.mjs';

test('isolated host bundles dispatch fixed CLI; existing project survives and unknown commands are refused', () => {
  const temp=mkdtempSync(join(tmpdir(),'pointsman-install-'));
  try {
    const root=join(temp,'runtime');
    mkdirSync(join(root,'skills/pointsman-routing/references'),{recursive:true});
    mkdirSync(join(root,'skills/pointsman-routing/scripts'));
    mkdirSync(join(root,'bin'));
    mkdirSync(join(root,'benchmarks/e2e-swe/manifests'),{recursive:true});
    for(const path of ['SKILL.md','references/routing-contract.md','scripts/pointsman.mjs']) {
      writeFileSync(join(root,'skills/pointsman-routing',path),readFileSync(new URL('../skills/pointsman-routing/'+path,import.meta.url)));
    }
    writeFileSync(join(root,'bin/pointsman.mjs'),'process.stdout.write(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));');
    writeFileSync(join(root,'benchmarks/e2e-swe/manifests/pointsman-d083.json'),'{}');
    execFileSync('git',['init','--quiet'],{cwd:root});
    execFileSync('git',['-c','user.name=fixture','-c','user.email=fixture@example.invalid','commit','--quiet','--allow-empty','-m','fixture'],{cwd:root});
    const target=join(temp,'project');
    const receipt=materializeSkill({target,host:'both',sourceRoot:root});
    assert.equal(receipt.files.length,6);
    for(const prefix of ['.claude','.agents']) {
      const wrapper=join(target,prefix,'skills/pointsman-routing/scripts/pointsman.mjs');
      const result=spawnSync(process.execPath,[wrapper,'doctor'],{cwd:target,encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
      assert.deepEqual(JSON.parse(result.stdout),{args:['doctor'],cwd:realpathSync(target)});
      const live=spawnSync(process.execPath,[wrapper,'run','--out','new-run','--spend'],{cwd:target,encoding:'utf8'});
      assert.equal(live.status,0,live.stderr);
      assert.deepEqual(JSON.parse(live.stdout).args,['run','--out','new-run','--spend']);
      const bad=spawnSync(process.execPath,[wrapper,'spend'],{cwd:target,encoding:'utf8'});
      assert.equal(bad.status,1);
      assert.equal(bad.stdout,'');
    }
    const before=readFileSync(join(target,'pointsman-skill-install.json'),'utf8');
    assert.throws(()=>materializeSkill({target,host:'both',sourceRoot:root}),/EEXIST/);
    assert.equal(readFileSync(join(target,'pointsman-skill-install.json'),'utf8'),before);
  } finally {rmSync(temp,{recursive:true,force:true});}
});
