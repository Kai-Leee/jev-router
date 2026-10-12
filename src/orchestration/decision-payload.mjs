// Lossless JSON string interning. This is a transport representation, not a summary.
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const jsonClone=value=>JSON.parse(JSON.stringify(value));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function encodeDecisionState(input,{minStringBytes=256}={}){
 if(!Number.isSafeInteger(minStringBytes)||minStringBytes<1)throw Error('INVALID_STRING_THRESHOLD');
 const state=jsonClone(input),counts=new Map(),keys=new Set();
 const visit=value=>{if(typeof value==='string'){if(bytes(value)>=minStringBytes)counts.set(value,(counts.get(value)??0)+1);}else if(Array.isArray(value))value.forEach(visit);else if(object(value))for(const [key,child]of Object.entries(value)){keys.add(key);visit(child);}};
 visit(state);let referenceKey='$jev_text_ref';while(keys.has(referenceKey))referenceKey+='_';
 const strings=new Map(),table={};
 for(const [value,count]of counts){const id=`t${strings.size+1}`;if(count>1&&count*bytes(value)>bytes({[id]:value})+count*bytes({[referenceKey]:id})){strings.set(value,id);table[id]=value;}}
 const replace=value=>typeof value==='string'&&strings.has(value)?{[referenceKey]:strings.get(value)}:Array.isArray(value)?value.map(replace):object(value)?Object.fromEntries(Object.entries(value).map(([key,child])=>[key,replace(child)])):value;
 return {encoding:{schema_version:'exact-string-table/v1',reference_key:referenceKey,instructions:'This state is lossless JSON string interning, not a summary. Read data as the original state. Every object containing only the reference_key field denotes the COMPLETE exact string stored under that ID in text_table. Substitute that string at each occurrence while reasoning. Repeated references preserve separate evidence occurrences and chronology; do not count repeated identical source content as independent corroboration. Unique strings remain inline. All original goal, requirements, code, results and failures are preserved.'},text_table:table,data:replace(state)};
}
export function decodeDecisionState(encoded){
 if(encoded?.encoding?.schema_version!=='exact-string-table/v1'||typeof encoded.encoding.reference_key!=='string'||!object(encoded.text_table))throw Error('INVALID_STRING_TABLE');
 const key=encoded.encoding.reference_key;
 const restore=value=>{
  if(object(value)&&Object.keys(value).length===1&&Object.hasOwn(value,key)){
   if(typeof value[key]!=='string'||!Object.hasOwn(encoded.text_table,value[key])||typeof encoded.text_table[value[key]]!=='string')throw Error('INVALID_STRING_REFERENCE');return encoded.text_table[value[key]];
  }
  return Array.isArray(value)?value.map(restore):object(value)?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,restore(v)])):value;
 };
 return restore(encoded.data);
}
export function prepareDecisionPayload(input,{maxBytes=256000,minStringBytes=256}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw Error('INVALID_PAYLOAD_LIMIT');
 const original=jsonClone(input),encodedState=encodeDecisionState(original.state,{minStringBytes}),candidate={...original,state:encodedState};
 const originalBytes=bytes(original),candidateBytes=bytes(candidate),encoded=candidateBytes<originalBytes,body=encoded?candidate:original;
 const metrics={encoding:encoded?'exact-string-table/v1':'identity',original_bytes:originalBytes,serialized_bytes:bytes(body),saved_bytes:originalBytes-bytes(body),interned_strings:encoded?Object.keys(encodedState.text_table).length:0,max_bytes:maxBytes};
 if(metrics.serialized_bytes>maxBytes)throw Object.assign(Error('DECISION_PAYLOAD_TOO_LARGE'),{code:'DECISION_PAYLOAD_TOO_LARGE',metrics,outcomeUncertain:false});
 return {body,metrics};
}
