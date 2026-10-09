// Mechanical evidence-reference admission, not semantic truth verification.
export function validateEvidenceOutput(output,evidence){
  const errors=[];
  if(!output||typeof output!=='object'||Array.isArray(output))return {valid:false,errors:['OUTPUT_OBJECT_REQUIRED']};
  if(output.evidence_revision!==evidence.revision)errors.push('EVIDENCE_REVISION_MISMATCH');
  const ids=new Set(evidence.items.map(item=>item.id));
  for(const key of ['observed_facts','missing_evidence']){
    if(!Array.isArray(output[key])){errors.push(`${key}:ARRAY_REQUIRED`);continue;}
    output[key].forEach((item,index)=>{
      const field=key==='observed_facts'?'fact':'gap';
      if(!item||typeof item[field]!=='string'||!item[field].trim())errors.push(`${key}[${index}]:TEXT_REQUIRED`);
      if(!Array.isArray(item?.evidence_ids)||!item.evidence_ids.length||item.evidence_ids.some(id=>!ids.has(id)))errors.push(`${key}[${index}]:UNKNOWN_OR_MISSING_EVIDENCE_ID`);
    });
  }
  return {valid:errors.length===0,errors};
}
