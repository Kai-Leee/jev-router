// v5 keeps all93 public cases and strengthens two predicates. Normalize for the
// legacy coverage audit only after verifying each registry field and assertions.
export function normalizePublicV5(input) {
  if(input.registry?.[0]?.version!=='5')return input;
  const copy=structuredClone(input),base='benchmarks/e2e-swe/public-checks';
  for(const row of copy.registry){
    if(row.version!=='5'||row.runner_ref!==base+'/run_public_checks_v5.py'||row.argv?.[1]!=='run_public_checks_v5.py')throw Error('PUBLIC_V5_REGISTRY_DRIFT');
    row.version='4';row.runner_ref=base+'/run_public_checks_v4.py';row.argv[1]='run_public_checks_v4.py';
  }
  const assertions=copy.assertions;
  if(assertions?.version!=='3'||assertions.assertions.length!==14
    ||assertions.assertions[12]?.id!=='A.R04.05.response-imports'||assertions.assertions[13]?.id!=='A.R18.02.prefix-roundtrip')throw Error('PUBLIC_V5_ASSERTION_DRIFT');
  assertions.version='2';assertions.assertions=assertions.assertions.slice(0,12);
  return copy;
}
