import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync, symlinkSync, linkSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createArtifactSession } from '../src/orchestration/artifact-transport.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
function setup(t) {
  const base=realpathSync(mkdtempSync(join(tmpdir(),'artifact-sources-test-')));
  const root=join(base,'stage'), snapshot=join(base,'snapshot'), path='pkg/upstream.py';
  mkdirSync(root);mkdirSync(join(snapshot,'pkg'),{recursive:true});
  const content='DESCRIPTION = "source description"\n';
  writeFileSync(join(snapshot,path),content);
  const source={path,root:snapshot,sha256:digest(content)};
  const config={root,allowedPaths:['pkg/renderer.py'],readablePaths:['pkg/current.py'],readSources:[source],journalPath:join(base,'journal.jsonl')};
  t.after(()=>rmSync(base,{recursive:true,force:true}));
  return {base,root,snapshot,path,content,source,config};
}

test('immutable causal source is readable by exact path, never writable, and status omits host roots',t=>{
  const f=setup(t), session=createArtifactSession(f.config);t.after(()=>session.close());
  const value=session.readFile({path:f.path});
  assert.deepEqual(value,{path:f.path,content:f.content,bytes:Buffer.byteLength(f.content),sha256:digest(f.content)});
  assert.deepEqual(session.status().read_only_sources,[{path:f.path,sha256:digest(f.content)}]);
  assert.equal(JSON.stringify(session.status()).includes(f.base),false);
  assert.throws(()=>session.writeFile({path:f.path,content:'modified'}),{code:'ARTIFACT_WRITE_NOT_ALLOWED'});
  assert.throws(()=>session.readFile({path:f.path,root:f.root}),{code:'ARTIFACT_READ_NOT_ALLOWED'});
  assert.throws(()=>session.readFile({path:'pkg/other.py'}),{code:'ARTIFACT_READ_NOT_ALLOWED'});
  assert.equal(readFileSync(join(f.snapshot,f.path),'utf8'),f.content);
  const journal=readFileSync(f.config.journalPath,'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(journal[0].event,'read_source_finished');assert.equal(journal[0].sha256,digest(f.content));
  assert.equal(JSON.stringify(journal).includes(f.base),false);
});

test('every causal read rechecks content; mutating controller config after construction cannot replace its pin',t=>{
  const f=setup(t), session=createArtifactSession(f.config);t.after(()=>session.close());
  assert.equal(session.readFile({path:f.path}).content,f.content);
  const changed=f.content.replace('source','edited');writeFileSync(join(f.snapshot,f.path),changed);
  f.source.sha256=digest(changed);f.source.root=f.root;f.config.readSources.length=0;
  assert.throws(()=>session.readFile({path:f.path}),{code:'ARTIFACT_READ_SOURCE_HASH_MISMATCH'});
  assert.deepEqual(session.status().read_only_sources,[{path:f.path,sha256:digest(f.content)}]);
  writeFileSync(join(f.snapshot,f.path),f.content);
  assert.equal(session.readFile({path:f.path}).content,f.content);
});

test('source paths cannot overlap ordinary grants, another source, or a path ancestor',t=>{
  const f=setup(t);
  for(const config of [
    {...f.config,allowedPaths:[f.path]},
    {...f.config,readablePaths:[f.path]},
    {...f.config,allowedPaths:['pkg']},
    {...f.config,readablePaths:[`${f.path}/child`]},
    {...f.config,readSources:[f.source,{...f.source}]},
    {...f.config,readSources:[f.source,{...f.source,path:'pkg'}]}
  ])assert.throws(()=>createArtifactSession(config),{code:'ARTIFACT_READ_SOURCE_CONFLICT'});
});

test('source configuration requires exact safe paths, canonical disjoint absolute roots, and complete hashes',t=>{
  const f=setup(t);
  assert.throws(()=>createArtifactSession({...f.config,readSources:{}}),{code:'INVALID_ARTIFACT_READ_SOURCES'});
  for(const source of [null,[],{...f.source,extra:true},{...f.source,path:'/etc/passwd'},
    {...f.source,path:'../secret'},{...f.source,path:'.env'},{...f.source,path:'pkg/../upstream.py'},
    {...f.source,root:'relative'},{...f.source,root:f.snapshot+'/'},{...f.source,root:'/'},
    {...f.source,sha256:'abc'},{...f.source,sha256:'z'.repeat(64)}
  ])assert.throws(()=>createArtifactSession({...f.config,readSources:[source]}),{code:'INVALID_ARTIFACT_READ_SOURCE'});
  for(const root of [f.root,f.base,join(f.root,'nested'),join(f.base,'missing')])
    assert.throws(()=>createArtifactSession({...f.config,readSources:[{...f.source,root}]}),{code:'UNSAFE_ARTIFACT_READ_SOURCE_ROOT'});
});

test('symlink source roots and symlink ancestors of roots are rejected at configuration',t=>{
  const f=setup(t);symlinkSync(f.snapshot,join(f.base,'alias'));
  symlinkSync(f.base,join(f.base,'base-alias'));
  for(const root of [join(f.base,'alias'),join(f.base,'base-alias','snapshot')])
    assert.throws(()=>createArtifactSession({...f.config,readSources:[{...f.source,root}]}),{code:'UNSAFE_ARTIFACT_READ_SOURCE_ROOT'});
});

test('source file symlinks, directory symlinks, and hard links are refused even when bytes match',t=>{
  const f=setup(t), session=createArtifactSession(f.config);t.after(()=>session.close());
  const other=join(f.base,'other.py');writeFileSync(other,f.content);
  rmSync(join(f.snapshot,f.path));symlinkSync(other,join(f.snapshot,f.path));
  assert.throws(()=>session.readFile({path:f.path}),{code:'UNSAFE_ARTIFACT_READ_SOURCE_PATH'});
  rmSync(join(f.snapshot,f.path));linkSync(other,join(f.snapshot,f.path));
  assert.throws(()=>session.readFile({path:f.path}),{code:'UNSAFE_ARTIFACT_READ_SOURCE_PATH'});
  rmSync(join(f.snapshot,'pkg'),{recursive:true});mkdirSync(join(f.base,'outside'));writeFileSync(join(f.base,'outside','upstream.py'),f.content);
  symlinkSync(join(f.base,'outside'),join(f.snapshot,'pkg'));
  assert.throws(()=>session.readFile({path:f.path}),{code:'UNSAFE_ARTIFACT_READ_SOURCE_PATH'});
});

test('source root identity and symlinks are rechecked after session creation',t=>{
  const f=setup(t), session=createArtifactSession(f.config);t.after(()=>session.close());
  renameSync(f.snapshot,f.snapshot+'-old');symlinkSync(f.snapshot+'-old',f.snapshot);
  assert.throws(()=>session.readFile({path:f.path}),{code:'UNSAFE_ARTIFACT_READ_SOURCE_ROOT'});
  rmSync(f.snapshot);mkdirSync(join(f.snapshot,'pkg'),{recursive:true});writeFileSync(join(f.snapshot,f.path),f.content);
  assert.throws(()=>session.readFile({path:f.path}),{code:'UNSAFE_ARTIFACT_READ_SOURCE_ROOT'});
});

test('read-only sources obey file-size limits while preserving ordinary write accounting',t=>{
  const f=setup(t), session=createArtifactSession({...f.config,maxFileBytes:5,maxTotalBytes:8});t.after(()=>session.close());
  assert.throws(()=>session.readFile({path:f.path}),{code:'ARTIFACT_FILE_TOO_LARGE'});
  session.writeFile({path:'pkg/renderer.py',content:'small'});
  assert.equal(session.status().total_bytes,5);assert.equal(session.status().missing.length,0);
});

test('existing stdio CLI accepts controller source config and exposes no new worker permission',t=>{
  const f=setup(t), configPath=join(f.base,'config.json');writeFileSync(configPath,JSON.stringify(f.config));
  const messages=[
    {jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'read_file',arguments:{path:f.path}}},
    {jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'write_file',arguments:{path:f.path,content:'bad'}}},
    {jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'status',arguments:{}}}
  ];
  const result=spawnSync(process.execPath,[resolve('bin/artifact-worker-mcp.mjs'),'--config',configPath],{input:messages.map(JSON.stringify).join('\n')+'\n',encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const replies=result.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(JSON.parse(replies[0].result.content[0].text).sha256,f.source.sha256);
  assert.equal(replies[1].result.isError,true);
  assert.equal(JSON.parse(replies[1].result.content[0].text).error,'ARTIFACT_WRITE_NOT_ALLOWED');
  assert.deepEqual(JSON.parse(replies[2].result.content[0].text).read_only_sources,[{path:f.path,sha256:f.source.sha256}]);
  assert.equal(result.stdout.includes(f.base),false);
});
