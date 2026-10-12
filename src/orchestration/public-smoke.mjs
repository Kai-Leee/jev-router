import {readFileSync,writeFileSync,mkdirSync,lstatSync,readdirSync,existsSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {processResult} from '../benchmark/docker.mjs';
const repo=resolve(import.meta.dirname,'../..');
const manifest=join(repo,'benchmarks/e2e-swe/manifests/openapi_python_client.json');
const adapter=join(repo,'benchmarks/e2e-swe/adapter.py');
export const PUBLIC_SMOKE_PYTHON=`import ast,json,subprocess,time
from pathlib import Path
base=Path('/tmp/jev-public-smoke');base.mkdir(exist_ok=True)
steps=[]; errors=[]
def command(stage,args,timeout=40):
 try:
  r=subprocess.run(args,cwd='/app',capture_output=True,text=True,timeout=timeout)
  steps.append({'stage':stage,'exit_code':r.returncode,'stdout':r.stdout[-6000:],'stderr':r.stderr[-6000:]})
  if r.returncode: errors.append({'stage':stage,'code':'COMMAND_FAILED','exit_code':r.returncode});return False
  return True
 except subprocess.TimeoutExpired:
  errors.append({'stage':stage,'code':'COMMAND_TIMEOUT'});return False
 except OSError as e:
  errors.append({'stage':stage,'code':'COMMAND_UNAVAILABLE','message':str(e)});return False
spec={'openapi':'3.0.3','info':{'title':'Public Smoke','version':'1.0.0'},'paths':{'/widgets':{'get':{'operationId':'listWidgets','responses':{'200':{'description':'Widget list','content':{'application/json':{'schema':{'type':'array','items':{'$ref':'#/components/schemas/Widget'}}}}}}}}},'components':{'schemas':{'Widget':{'type':'object','required':['id'],'properties':{'id':{'type':'integer'},'label':{'type':'string'}}}}}}
spec['components']['schemas']['Status']={'type':'string','enum':["navigator's choice",'quiet']}
spec['components']['schemas']['Widget']['properties'].update({'enabled':{'type':'boolean'},'ratio':{'type':'number'},'status':{'$ref':'#/components/schemas/Status'},'nullableStatus':{'oneOf':[{'$ref':'#/components/schemas/Status'},{'type':'null'}]}})
spec['components']['schemas']['Defaults']={'type':'object','properties':{'quantity':{'type':'integer','default':'29'},'ratio':{'type':'number','default':'8.375'},'enabled':{'type':'boolean','default':'False'},'tags':{'type':'array','items':{'type':'string'},'default':['violet','copper']}}}
(base/'input.json').write_text(json.dumps(spec))
from ruamel.yaml import YAML
with (base/'input.yaml').open('w') as stream: YAML().dump(spec,stream)
(base/'literal.json').write_text(json.dumps({'literal_enums':True}))
checker="""import importlib,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(sys.argv[1]).parent))
models=importlib.import_module(Path(sys.argv[1]).name+'.models')
Widget=models.Widget; Defaults=models.Defaults; Status=models.Status
payload={'id':73,'label':'amber','enabled':True,'ratio':2.75,'status':"navigator's choice",'nullableStatus':None}
obj=Widget.from_dict(payload)
assert obj.to_dict()==payload, ('scalar_nullable_enum_roundtrip',obj.to_dict())
assert obj.id==73 and isinstance(obj.id,int)
assert obj.enabled is True and isinstance(obj.ratio,float)
assert obj.nullable_status is None
assert isinstance(Widget.__annotations__['id'],str)
assert 'Unset' not in Widget.__annotations__['id']
assert 'Unset' in Widget.__annotations__['label']
assert 'None' in Widget.__annotations__['nullable_status']
try: Widget.from_dict({})
except KeyError: pass
else: raise AssertionError('missing required id must raise KeyError')
assert 'label' not in Widget(id=73).to_dict(), 'unset optional label must be omitted'
if sys.argv[2]=='literal': assert obj.status=="navigator's choice"
else: assert isinstance(obj.status,Status) and obj.status.value=="navigator's choice"
try: Widget.from_dict({'id':73,'status':'unsupported-public-value'})
except (ValueError,TypeError): pass
else: raise AssertionError('invalid enum must be rejected')
defaults=Defaults()
assert type(defaults.quantity) is int and defaults.quantity==29
assert type(defaults.ratio) is float and defaults.ratio==8.375
assert defaults.enabled is False
assert type(defaults.tags) is list and defaults.tags==['violet','copper']
assert Defaults.from_dict(defaults.to_dict()).to_dict()==defaults.to_dict()
print(json.dumps({'ok':True,'checks':['scalar_roundtrip','enum_apostrophe','nullable_enum','required_optional_annotations','default_python_types','list_default']}))
"""
(base/'check_generated.py').write_text(checker)
if command('offline_setup',['bash','/app/setup.sh'],60):
 for extension in ['json','yaml','literal']:
  output=base/('generated_'+extension)
  source=base/('input.yaml' if extension=='yaml' else 'input.json')
  args=['pyclientgen','generate','--path',str(source),'--meta','none','--output-path',str(output)]
  if extension=='literal': args += ['--config',str(base/'literal.json')]
  if command('generate_'+extension,args):
   missing=[name for name in ['__init__.py','types.py','client.py','errors.py','models/__init__.py','api/__init__.py'] if not (output/name).is_file()]
   if missing: errors.append({'stage':'layout_'+extension,'code':'MISSING_GENERATED_FILES','paths':missing})
   files=sorted(output.rglob('*.py'))
   if not files: errors.append({'stage':'syntax_'+extension,'code':'NO_GENERATED_PYTHON'})
   for path in files:
    try: ast.parse(path.read_text(),filename=str(path.relative_to(output)))
    except (SyntaxError,UnicodeError,ValueError) as e: errors.append({'stage':'syntax_'+extension,'code':type(e).__name__,'path':str(path.relative_to(output)),'message':str(e)})
   steps.append({'stage':'syntax_'+extension,'generated_python_files':len(files)})
   if not any(e.get('stage') in ['syntax_'+extension,'layout_'+extension] for e in errors):
    command('behavior_'+extension,['python',str(base/'check_generated.py'),str(output),extension])
print(json.dumps({'schema_version':'public-smoke/v1','ok':not errors,'steps':steps,'errors':errors,'requirements_verified':False}))
`;
function inspectSource(root){
 let bytes=0;
 function walk(path){for(const entry of readdirSync(path)){const p=join(path,entry),st=lstatSync(p);if(st.isSymbolicLink()||(!st.isFile()&&!st.isDirectory())||(st.isFile()&&st.nlink!==1))throw Error('UNSAFE_SMOKE_SOURCE');if(st.isDirectory())walk(p);else bytes+=st.size;}}
 if(lstatSync(root).isSymbolicLink()||realpathSync(root)!==root)throw Error('UNSAFE_SMOKE_SOURCE');walk(root);if(bytes>4194304)throw Error('SMOKE_SOURCE_TOO_LARGE');return bytes;
}
export async function runPublicSmoke({root,outputDir,imageLock,requiredPaths=[],timeoutMs=180000},{run=processResult}={}){
 const started=performance.now();root=resolve(root);outputDir=resolve(outputDir);imageLock=resolve(imageLock);
 if(outputDir===root||outputDir.startsWith(root+'/')||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>600000||!Array.isArray(requiredPaths)||requiredPaths.some(p=>typeof p!=='string'||p.startsWith('/')||p.split('/').some(x=>!x||x==='..'||x==='.')))throw Error('INVALID_SMOKE_CONFIG');
 const bytes=inspectSource(root);mkdirSync(outputDir,{mode:0o700});
 const save=(name,value)=>writeFileSync(join(outputDir,name),JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
 const missing=requiredPaths.filter(p=>!existsSync(join(root,p)));
 if(!existsSync(join(root,'setup.sh')))missing.push('setup.sh');
 if(!['pyproject.toml','setup.py','setup.cfg'].some(p=>existsSync(join(root,p))))missing.push('packaging_metadata');
 if(missing.length){const result={ok:null,applicable:false,status:'not_applicable',checks:[],errors:[],missing:[...new Set(missing)],requirements_verified:false,independent_grade:'pending',container_removed:null,wall_ms:performance.now()-started};save('result.json',result);return result;}
 const name=`jev-public-smoke-${randomUUID()}`,receipt=join(outputDir,'container.json');
 const result={ok:false,applicable:true,status:'environment_error',checks:['offline_setup','public_json_generation','public_yaml_generation','generated_layout','generated_python_ast','public_enum_nullable_defaults_roundtrip'],errors:[],requirements_verified:false,independent_grade:'pending',container:name,container_removed:false,source_bytes:bytes};
 let attempted=false,owned=false;
 async function checked(command,args){const remaining=timeoutMs-(performance.now()-started);if(remaining<=0)throw Error('PUBLIC_SMOKE_TIMEOUT');const r=await run(command,args,{timeoutMs:remaining,maxBytes:1000000});if(r.exit_code!==0||r.outcome_uncertain)throw Error(r.interrupted==='TIMEOUT'?'PUBLIC_SMOKE_TIMEOUT':'PUBLIC_SMOKE_INFRASTRUCTURE');return r;}
 try{
  const lock=JSON.parse(readFileSync(imageLock,'utf8')),m=JSON.parse(readFileSync(manifest,'utf8'));if(lock.image_digest!==m.image_digest||!/^sha256:[a-f0-9]{64}$/.test(lock.image_id))throw Error('IMAGE_LOCK_MISMATCH');
  attempted=true;await checked('python3',[adapter,'--manifest',manifest,'start-agent','--name',name,'--image-lock',imageLock,'--output',receipt]);owned=true;
  await checked('docker',['update','--pids-limit','128','--cpus','2','--memory','2g',name]);
  const info=JSON.parse((await checked('docker',['container','inspect',name])).stdout)[0];
  if(info.Image!==lock.image_id||info.HostConfig.NetworkMode!=='none'||info.HostConfig.Privileged||info.HostConfig.PidsLimit!==128||!(info.HostConfig.Memory>0)||!(info.HostConfig.NanoCpus>0)||(info.Mounts??[]).length)throw Error('UNSAFE_SMOKE_CONTAINER');
  await checked('docker',['cp',root+'/.',name+':/app']);
  const script=join(outputDir,'public-smoke.py');writeFileSync(script,PUBLIC_SMOKE_PYTHON,{mode:0o600,flag:'wx'});
  await checked('docker',['cp',script,name+':/tmp/jev-public-smoke.py']);
  const raw=await checked('docker',['exec','--workdir','/app',name,'python','/tmp/jev-public-smoke.py']);
  writeFileSync(join(outputDir,'stdout.log'),raw.stdout,{mode:0o600,flag:'wx'});writeFileSync(join(outputDir,'stderr.log'),raw.stderr,{mode:0o600,flag:'wx'});
  const report=JSON.parse(raw.stdout);if(report.schema_version!=='public-smoke/v1'||typeof report.ok!=='boolean'||!Array.isArray(report.errors)||!Array.isArray(report.steps))throw Error('INVALID_PUBLIC_SMOKE_RESPONSE');
  result.ok=report.ok;result.status=report.ok?'passed':'artifact_failed';result.steps=report.steps;result.errors=report.errors;
 }catch(error){result.errors.push({code:/^[A-Z_]+$/.test(error.message)?error.message:'PUBLIC_SMOKE_INFRASTRUCTURE'});}
 finally{
  if(attempted){
   // Unique random name belongs to this invocation. The adapter may have cleaned startup failure already.
   try{const removed=await run('docker',['rm','-f',name],{timeoutMs:15000,maxBytes:10000});result.container_removed=removed.exit_code===0&&!removed.outcome_uncertain;
    if(!result.container_removed&&!owned){const check=await run('docker',['container','inspect',name],{timeoutMs:10000,maxBytes:10000});result.container_removed=check.exit_code!==0&&!check.outcome_uncertain&&/no such (object|container)/i.test(check.stderr??'');}
   }catch{}
   if(!result.container_removed){result.ok=false;result.status='environment_error';result.errors.push({code:'SMOKE_CONTAINER_CLEANUP_FAILED'});}
  }
 }
 result.wall_ms=performance.now()-started;save('result.json',result);return result;
}
