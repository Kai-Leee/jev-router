import {projectLifecycleDecision as projectSourceBodies} from './decision-projection.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const bytes=v=>Buffer.byteLength(JSON.stringify(v),'utf8');
// Exact JSON composite interning; no field, event or requirement summarization.
export function encodeObjectState(input,{minObjectBytes=256}={}){
 if(!Number.isSafeInteger(minObjectBytes)||minObjectBytes<1)throw Error('INVALID_OBJECT_THRESHOLD');
 const state=JSON.parse(JSON.stringify(input)),counts=new Map(),keys=new Set();
 const visit=value=>{if(value===null||typeof value!=='object')return;const serialized=JSON.stringify(value);if(Buffer.byteLength(serialized)>=minObjectBytes)counts.set(serialized,(counts.get(serialized)??0)+1);if(Array.isArray(value))value.forEach(visit);else for(const [key,child]of Object.entries(value)){keys.add(key);visit(child);}};
 visit(state);let referenceKey='$jev_object_ref';while(keys.has(referenceKey))referenceKey+='_';
 const ids=new Map(),table={};
 const walk=value=>{
  if(value===null||typeof value!=='object')return value;
  const serialized=JSON.stringify(value),eligible=(counts.get(serialized)??0)>1;
  if(eligible&&ids.has(serialized))return {[referenceKey]:ids.get(serialized)};
  if(eligible){const id=`o${ids.size+1}`;ids.set(serialized,id);table[id]=null;table[id]=children(value);return {[referenceKey]:id};}
  return children(value);
 };
 const children=value=>Array.isArray(value)?value.map(walk):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v)]));
 const rawData=walk(state);
 let partsKey='$jev_string_parts';while(keys.has(partsKey)||partsKey===referenceKey)partsKey+='_';
 const fragmentCounts=new Map();
 const pieces=s=>s.split(/(?<=\\n)|(?<=\n)/);
 const scan=v=>{if(typeof v==='string'){for(const p of pieces(v))if(p.length>=32)fragmentCounts.set(p,(fragmentCounts.get(p)??0)+1);}else if(Array.isArray(v))v.forEach(scan);else if(object(v))Object.values(v).forEach(scan);};
 scan(rawData);scan(table);const fragmentIds=new Map(),fragmentTable={};
 for(const [part,count] of fragmentCounts)if(count>1){const id=`s${fragmentIds.size+1}`;fragmentIds.set(part,id);fragmentTable[id]=part;}
 const fragment=v=>{if(typeof v==='string'){const parts=pieces(v);if(parts.some(p=>fragmentIds.has(p)))return {[partsKey]:parts.map(p=>fragmentIds.has(p)?{ref:fragmentIds.get(p)}:p)};return v;}return Array.isArray(v)?v.map(fragment):object(v)?Object.fromEntries(Object.entries(v).map(([k,c])=>[k,fragment(c)])):v;};
 const data=fragment(rawData),fragmentedTable=fragment(table);
 return {encoding:{schema_version:'exact-object-table/v1',reference_key:referenceKey,string_parts_key:partsKey,instructions:'Lossless JSON object, array and string fragment interning. Objects containing only string_parts_key represent exact concatenation of their array parts: literal string parts concatenate unchanged, and {ref: ID} parts refer to string_table. Expand these parts before reading values. Expand any object containing only reference_key to the COMPLETE value at that ID in object_table, recursively. Read expanded data as the original decision state. Object-table entries may themselves contain references. All requirement text, plans, instructions, failure observations and event occurrences are retained exactly. References do not add independent evidence. If an outer exact-string-table wraps this state, first expand its strings, then expand these object references. This is a transport representation, not a summary.'},object_table:fragmentedTable,string_table:fragmentTable,data};
}
export function decodeObjectState(encoded){
 if(encoded?.encoding?.schema_version!=='exact-object-table/v1'||typeof encoded.encoding.reference_key!=='string'||!object(encoded.object_table))throw Error('INVALID_OBJECT_TABLE');
 const key=encoded.encoding.reference_key,partsKey=encoded.encoding.string_parts_key;
 const restore=(v,active=new Set())=>{
  if(partsKey&&object(v)&&Object.keys(v).length===1&&Object.hasOwn(v,partsKey)){
   if(!Array.isArray(v[partsKey]))throw Error('INVALID_STRING_PARTS');return v[partsKey].map(p=>{if(typeof p==='string')return p;if(!object(p)||Object.keys(p).length!==1||typeof p.ref!=='string'||typeof encoded.string_table?.[p.ref]!=='string')throw Error('INVALID_STRING_PARTS');return encoded.string_table[p.ref];}).join('');
  }
  if(object(v)&&Object.keys(v).length===1&&Object.hasOwn(v,key)){
   const id=v[key];if(typeof id!=='string'||!Object.hasOwn(encoded.object_table,id)||active.has(id))throw Error('INVALID_OBJECT_REFERENCE');
   return restore(encoded.object_table[id],new Set([...active,id]));
  }
  return Array.isArray(v)?v.map(x=>restore(x,active)):object(v)?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,restore(x,active)])):v;
 };
 return restore(encoded.data);
}
export function projectLifecycleDecision(request){
 const projected=projectSourceBodies(request),encoded=encodeObjectState(projected.state);
 return bytes(encoded)<bytes(projected.state)?{...projected,state:encoded}:projected;
}
export function decodeProjectedDecisionState(state){return state?.encoding?.schema_version==='exact-object-table/v1'?decodeObjectState(state):structuredClone(state);}
