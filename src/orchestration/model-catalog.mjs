import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const catalogUrl=new URL('../../docs/orchestration/contracts/models.v2.json',import.meta.url);
export async function loadModelCatalog(){
 const raw=await readFile(catalogUrl,'utf8'); const catalog=JSON.parse(raw);
 if(!Array.isArray(catalog.families)||!catalog.families.length)throw new Error('INVALID_MODEL_CATALOG');
 const ids=new Set();
 for(const f of catalog.families){if(ids.has(f.id)||!f.id||!f.model||f.adapter!=='claude-cli'||!Array.isArray(f.efforts)||!f.efforts.length||f.efforts.some(e=>!['low','medium','high','xhigh','max'].includes(e))||new Set(f.efforts).size!==f.efforts.length)throw new Error('INVALID_MODEL_CATALOG');ids.add(f.id);}
 return {catalog,source:{path:fileURLToPath(catalogUrl),sha256:createHash('sha256').update(raw).digest('hex')}};
}
export function selectModelProfile(catalog,{model,effort,allowedProfiles}){
 const f=catalog.families.find(x=>x.model===model||x.id===model);
 if(!f||!f.efforts.includes(effort))throw new Error('UNSUPPORTED_MODEL_EFFORT');
 const id=`${f.id}_${effort}`;
 if(!Array.isArray(allowedProfiles)||!allowedProfiles.includes(id))throw new Error('PROFILE_NOT_ALLOWED_FOR_RUN');
 return {id,model:f.model,effort,adapter:f.adapter,catalogAvailability:f.availability,actualAvailability:'unverified',effectiveEffort:null};
}
