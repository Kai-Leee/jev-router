import { constants, lstatSync, realpathSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, fsyncSync, renameSync, unlinkSync, fstatSync } from 'node:fs';
import { resolve, dirname, join, parse } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const fail = code => { throw Object.assign(new Error(code), { code }); };
const hash = content => createHash('sha256').update(content).digest('hex');
const validPath = path => typeof path === 'string' && path.length <= 1024 && /^[A-Za-z0-9_.\-/]+$/.test(path) && !path.startsWith('/') && path.split('/').every(part => part && part !== '.' && part !== '..' && !['.git','.env','.claude','.codex'].includes(part));
const overlaps = (left,right) => left===right || left.startsWith(right+'/') || right.startsWith(left+'/');
const sameFile = (left,right) => left.dev===right.dev && left.ino===right.ino;
const sourceRootStat = root => {
  try {
    const stat=lstatSync(root);
    if(!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(root)!==root)fail('UNSAFE_ARTIFACT_READ_SOURCE_ROOT');
    return stat;
  } catch(error) { if(error.code==='UNSAFE_ARTIFACT_READ_SOURCE_ROOT')throw error;fail('UNSAFE_ARTIFACT_READ_SOURCE_ROOT'); }
};
const prepareReadSources = (sources,root,ordinaryPaths) => {
  if(!Array.isArray(sources))fail('INVALID_ARTIFACT_READ_SOURCES');
  const prepared=new Map();
  for(const source of sources) {
    if(!source || typeof source!=='object' || Array.isArray(source) || Object.keys(source).sort().join(',')!=='path,root,sha256' || !validPath(source.path) || typeof source.root!=='string' || source.root!==resolve(source.root) || source.root===parse(source.root).root || typeof source.sha256!=='string' || !/^[a-f0-9]{64}$/i.test(source.sha256))fail('INVALID_ARTIFACT_READ_SOURCE');
    if(overlaps(source.root,root))fail('UNSAFE_ARTIFACT_READ_SOURCE_ROOT');
    if([...ordinaryPaths,...prepared.keys()].some(path=>overlaps(path,source.path)))fail('ARTIFACT_READ_SOURCE_CONFLICT');
    const stat=sourceRootStat(source.root);
    prepared.set(source.path,Object.freeze({path:source.path,root:source.root,sha256:source.sha256.toLowerCase(),dev:stat.dev,ino:stat.ino}));
  }
  return prepared;
};
const schema = properties => ({ type:'object', additionalProperties:false, required:Object.keys(properties), properties });
export const artifactTools = [
  {name:'write_file',description:'Save one complete UTF-8 source file within the assigned exact path allowlist. Call once per file; never put all files into the final reply. A successful response includes byte length and SHA-256.',inputSchema:schema({path:{type:'string'},content:{type:'string'}})},
  {name:'read_file',description:'Read one explicitly permitted source or dependency file. Controller-pinned read-only sources are hash-checked on every read. No shell execution.',inputSchema:schema({path:{type:'string'}})},
  {name:'status',description:'Read expected file list, persisted file hashes, missing paths and optional read-only source pins. A source pin is checked when read; presence is not functional verification.',inputSchema:schema({})}
];

// Root and journal are controller-owned. Workers cannot choose these or extend access.
export function createArtifactSession({root,allowedPaths,readablePaths=allowedPaths,readSources=[],journalPath,maxFileBytes=262144,maxTotalBytes=2097152}) {
  if (typeof root!=='string' || root!==resolve(root) || !Array.isArray(allowedPaths) || !allowedPaths.length || !Array.isArray(readablePaths) || [...allowedPaths,...readablePaths].some(p=>!validPath(p)) || new Set(allowedPaths).size!==allowedPaths.length || !Number.isSafeInteger(maxFileBytes) || maxFileBytes<1 || !Number.isSafeInteger(maxTotalBytes) || maxTotalBytes<maxFileBytes) fail('INVALID_ARTIFACT_CONFIG');
  if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory() || realpathSync(root)!==root) fail('UNSAFE_ARTIFACT_ROOT');
  if (typeof journalPath!=='string' || !journalPath.startsWith('/') || resolve(journalPath).startsWith(root+'/') || resolve(journalPath)===root) fail('INVALID_JOURNAL_PATH');
  const writable=new Set(allowedPaths), readable=new Set([...readablePaths,...allowedPaths]);
  const sources=prepareReadSources(readSources,root,readable);
  let closed=false, sequence=0;
  const journal=openSync(journalPath,'wx',0o600);
  const assertOpen=()=>{if(closed)fail('ARTIFACT_SESSION_CLOSED');};
  const target=(path,create=false)=>{
    if(!validPath(path))fail('INVALID_ARTIFACT_PATH');
    let current=root;
    for(const part of path.split('/').slice(0,-1)) {
      current=join(current,part);
      try { const stat=lstatSync(current); if(!stat.isDirectory()||stat.isSymbolicLink())fail('UNSAFE_ARTIFACT_PATH'); }
      catch(error) { if(error.code!=='ENOENT'||!create)throw error; mkdirSync(current,{mode:0o700}); }
    }
    const full=join(root,path);
    try { const stat=lstatSync(full); if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)fail('UNSAFE_ARTIFACT_PATH'); }
    catch(error){if(error.code!=='ENOENT')throw error;}
    return full;
  };
  const read=(path)=>{
    const fd=openSync(target(path),constants.O_RDONLY|constants.O_NOFOLLOW);
    try {const stat=fstatSync(fd);if(!stat.isFile()||stat.nlink!==1)fail('UNSAFE_ARTIFACT_PATH');if(stat.size>maxFileBytes)fail('ARTIFACT_FILE_TOO_LARGE');return readFileSync(fd);}
    finally{closeSync(fd);}
  };
  const readSource=source=>{
    const checkPath=()=>{
      if(!sameFile(source,sourceRootStat(source.root)))fail('UNSAFE_ARTIFACT_READ_SOURCE_ROOT');
      let current=source.root;
      for(const part of source.path.split('/').slice(0,-1)) {
        current=join(current,part);
        const stat=lstatSync(current);
        if(!stat.isDirectory() || stat.isSymbolicLink())fail('UNSAFE_ARTIFACT_READ_SOURCE_PATH');
      }
      const full=join(source.root,source.path), stat=lstatSync(full);
      if(!stat.isFile() || stat.isSymbolicLink() || stat.nlink!==1 || realpathSync(full)!==full)fail('UNSAFE_ARTIFACT_READ_SOURCE_PATH');
      return {full,stat};
    };
    const before=checkPath(), fd=openSync(before.full,constants.O_RDONLY|constants.O_NOFOLLOW);
    try {
      const stat=fstatSync(fd);
      if(!stat.isFile() || stat.nlink!==1 || !sameFile(before.stat,stat))fail('UNSAFE_ARTIFACT_READ_SOURCE_PATH');
      if(stat.size>maxFileBytes)fail('ARTIFACT_FILE_TOO_LARGE');
      const content=readFileSync(fd), after=checkPath();
      if(!sameFile(stat,after.stat))fail('UNSAFE_ARTIFACT_READ_SOURCE_PATH');
      if(content.length>maxFileBytes)fail('ARTIFACT_FILE_TOO_LARGE');
      if(hash(content)!==source.sha256)fail('ARTIFACT_READ_SOURCE_HASH_MISMATCH');
      record({event:'read_source_finished',path:source.path,bytes:content.length,sha256:source.sha256});
      return content;
    } finally {closeSync(fd);}
  };
  const files=()=>allowedPaths.flatMap(path=>{try{const content=read(path);return [{path,bytes:content.length,sha256:hash(content)}];}catch(error){if(error.code==='ENOENT')return [];throw error;}});
  const record=(event)=>{writeFileSync(journal,JSON.stringify({recorded_at:new Date().toISOString(),sequence:++sequence,...event})+'\n');fsyncSync(journal);};
  const api={
    writeFile(args){
      assertOpen();if(!args||Object.keys(args).sort().join(',')!=='content,path'||!writable.has(args.path)||typeof args.content!=='string')fail('ARTIFACT_WRITE_NOT_ALLOWED');
      const content=Buffer.from(args.content,'utf8');if(content.length>maxFileBytes)fail('ARTIFACT_FILE_TOO_LARGE');
      const existing=files();if(existing.filter(f=>f.path!==args.path).reduce((sum,f)=>sum+f.bytes,0)+content.length>maxTotalBytes)fail('ARTIFACT_TOTAL_TOO_LARGE');
      const destination=target(args.path,true), temporary=join(dirname(destination),`.artifact-${randomUUID()}.tmp`);
      const receipt={path:args.path,bytes:content.length,sha256:hash(content)};
      record({event:'write_started',...receipt});
      let fd;
      try{fd=openSync(temporary,'wx',0o600);writeFileSync(fd,content);fsyncSync(fd);closeSync(fd);fd=undefined;target(args.path);renameSync(temporary,destination);record({event:'write_finished',...receipt});}
      catch(error){if(fd!==undefined)closeSync(fd);try{unlinkSync(temporary);}catch{}throw error;}
      return receipt;
    },
    readFile(args){assertOpen();if(!args||Object.keys(args).join(',')!=='path'||(!readable.has(args.path)&&!sources.has(args.path)))fail('ARTIFACT_READ_NOT_ALLOWED');const content=sources.has(args.path)?readSource(sources.get(args.path)):read(args.path);return {path:args.path,content:content.toString('utf8'),bytes:content.length,sha256:hash(content)};},
    status(){assertOpen();const persisted=files();return {schema_version:'artifact-session/v1',allowed_paths:[...allowedPaths],files:persisted,missing:allowedPaths.filter(path=>!persisted.some(f=>f.path===path)),total_bytes:persisted.reduce((sum,f)=>sum+f.bytes,0),max_file_bytes:maxFileBytes,max_total_bytes:maxTotalBytes,...(sources.size?{read_only_sources:[...sources.values()].map(({path,sha256})=>({path,sha256}))}:{})};},
    close(){if(!closed){closed=true;closeSync(journal);}},
    async dispatch(message){
      const reply=result=>({jsonrpc:'2.0',id:message.id,result});
      if(!message||message.jsonrpc!=='2.0'||typeof message.method!=='string')return {jsonrpc:'2.0',id:message?.id??null,error:{code:-32600,message:'Invalid request'}};
      if(!Object.hasOwn(message,'id'))return null;
      if(message.method==='initialize')return reply({protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'artifact-worker',version:'1.0.0'}});
      if(message.method==='ping')return reply({});
      if(message.method==='tools/list')return reply({tools:artifactTools});
      if(message.method!=='tools/call')return {jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Method not found'}};
      const methods={write_file:api.writeFile,read_file:api.readFile,status:api.status};
      try{if(!Object.hasOwn(methods,message.params?.name))fail('UNKNOWN_ARTIFACT_TOOL');const args=message.params.arguments??{};if(message.params.name==='status'&&Object.keys(args).length)fail('INVALID_ARTIFACT_ARGUMENTS');const value=methods[message.params.name](args);return reply({content:[{type:'text',text:JSON.stringify(value)}]});}
      catch(error){return reply({isError:true,content:[{type:'text',text:JSON.stringify({error:/^[A-Z_]+$/.test(error.code??'')?error.code:'ARTIFACT_IO_FAILED'})}]});}
    }
  };
  return api;
}
