import {execFileSync} from 'node:child_process';
import {lstatSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';

const environmentError=reason=>Object.assign(new Error('VERIFIER_ENVIRONMENT_ERROR'),{code:'VERIFIER_ENVIRONMENT_ERROR',reason});
const imports=`import ast,json,sys\nfrom pathlib import Path\ntry:\n import tomllib as toml\n toml_parser='tomllib'\nexcept ModuleNotFoundError as e:\n if e.name != 'tomllib': raise\n import tomli as toml\n toml_parser='tomli'\n`;
const metadata=`{'python_version':sys.version.split()[0],'toml_parser':toml_parser}`;
function runPython(python,source,args=[],input=''){
 let stdout;
 try{stdout=execFileSync(python,['-c',source,...args],{input,encoding:'utf8',maxBuffer:2*1024*1024,timeout:30000,stdio:['pipe','pipe','pipe']});}
 catch(error){throw environmentError(error.code==='ENOENT'?'interpreter_not_found':'interpreter_import_or_execution_failed');}
 try{const result=JSON.parse(stdout);if(!result||typeof result!=='object'||typeof result.python_version!=='string'||!['tomllib','tomli'].includes(result.toml_parser))throw Error();return result;}
 catch{throw environmentError('invalid_verifier_protocol');}
}
export function preflightVerifier({python='python3'}={}){
 const result=runPython(python,imports+`ast.parse('x = 1\\n')\nassert toml.loads('x = 1\\n')['x'] == 1\nprint(json.dumps(${metadata}))\n`);
 return {python,...result};
}
const validPath=path=>typeof path==='string'&&path.length>0&&path.length<=1024&&!path.startsWith('/')&&!path.includes('\\')&&!path.includes('\0')&&path.split('/').every(part=>part&&part!=='.'&&part!=='..');
export function verifyArtifacts({root,paths,allPaths=paths,maxProjectBytes=4194304,python='python3'}){
 if(typeof root!=='string'||root!==resolve(root)||!Array.isArray(paths)||!paths.length||!Array.isArray(allPaths)||[...paths,...allPaths].some(p=>!validPath(p))||new Set(paths).size!==paths.length||new Set(allPaths).size!==allPaths.length||paths.some(p=>!allPaths.includes(p))||!Number.isSafeInteger(maxProjectBytes)||maxProjectBytes<1)throw environmentError('invalid_verifier_config');
 const verifier=preflightVerifier({python});
 try{const st=lstatSync(root);if(!st.isDirectory()||st.isSymbolicLink()||realpathSync(root)!==root)throw environmentError('unsafe_candidate_root');}catch(error){if(error.code==='VERIFIER_ENVIRONMENT_ERROR')throw error;throw environmentError('candidate_root_unavailable');}
 const errors=[],present=[],requested=new Set(paths);let totalBytes=0;
 for(const path of allPaths){
  let current=root,valid=true;
  for(const [index,part] of path.split('/').entries()){
   current=join(current,part);
   try{const st=lstatSync(current),last=index===path.split('/').length-1;
    if(st.isSymbolicLink()||(!last&&!st.isDirectory())||(last&&(!st.isFile()||st.nlink!==1))){errors.push({path,code:'INVALID_FILE'});valid=false;break;}
    if(last){totalBytes+=st.size;if(requested.has(path))present.push(path);}
   }catch(error){if(error.code==='ENOENT'){if(requested.has(path))errors.push({path,code:'MISSING_FILE'});valid=false;break;}throw environmentError('candidate_metadata_unavailable');}
  }
 }
 if(totalBytes>maxProjectBytes)errors.push({code:'PROJECT_TOO_LARGE',bytes:totalBytes,limit_bytes:maxProjectBytes});
 if(!errors.length){
  const result=runPython(python,imports+`root=Path(sys.argv[1]); errors=[]\nfor name in json.loads(sys.stdin.read()):\n try:\n  text=(root/name).read_text(encoding='utf-8')\n  if name.endswith('.py'): ast.parse(text,filename=name)\n  elif name.endswith('.toml'): toml.loads(text)\n except (SyntaxError, toml.TOMLDecodeError, UnicodeError, ValueError) as e:\n  errors.append({'path':name,'code':type(e).__name__,'message':str(e)})\nresult=${metadata}\nresult['errors']=errors\nprint(json.dumps(result))\n`,[root],JSON.stringify(present));
  if(!Array.isArray(result.errors))throw environmentError('invalid_verifier_errors');errors.push(...result.errors);
 }
 return {ok:errors.length===0,checks:['exact_expected_file_presence','regular_files_no_symlinks','project_byte_limit','python_ast_syntax','toml_syntax'],errors,total_bytes:totalBytes,verifier,requirements_verified:false,independent_grade:'pending'};
}
