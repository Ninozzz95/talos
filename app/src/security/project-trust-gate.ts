import {createTrustAuthority,type TrustAuthoritySnapshot} from './trust-authority.ts';
import type {ExecutableResourceIdentity,ProjectTrustState} from './project-trust.ts';
import {findNestedRepositories,type NestedRepository,type WorkspaceIdentity} from './workspace-identity.ts';

export type ProjectTrustAssessment={trusted:boolean;reason:ProjectTrustState['reason']|'NO_PROJECT_RESOURCES';workspace:WorkspaceIdentity;resources:ExecutableResourceIdentity[];storeSchema:'v1'|'v2'|null;migrationRequired:boolean};

const reviewInstruction='Review with `talos project status`; if the change is expected, run `talos project trust` (or `talos project trust --include-nested` when status lists nested repositories).';

function assessmentOf(snapshot:TrustAuthoritySnapshot):ProjectTrustAssessment{
  return{trusted:snapshot.trusted,reason:snapshot.reason,workspace:snapshot.workspace,resources:snapshot.resources.flatMap(row=>row.current?[row.current]:[]),storeSchema:snapshot.storeSchema,migrationRequired:snapshot.migrationRequired};
}
export async function assessProjectTrust({projectRoot,trustRoot}:{projectRoot:string;trustRoot:string}):Promise<ProjectTrustAssessment>{return assessmentOf(await createTrustAuthority({projectRoot,trustRoot}).inspect());}
export async function nestedRepositoriesForProjectTrust(assessment:ProjectTrustAssessment):Promise<NestedRepository[]>{return findNestedRepositories(assessment.workspace,[...new Set(assessment.resources.map(resource=>resource.relativePath))]);}

export function projectTrustFailure(assessment:ProjectTrustAssessment):Error{
  const code=assessment.reason==='PROJECT_UNTRUSTED'?'PROJECT_TRUST_REQUIRED':'PROJECT_TRUST_INVALIDATED';
  const message=code==='PROJECT_TRUST_REQUIRED'
    ?`${code}: TALOS did not load project instructions or executable resources because this folder is not trusted. ${reviewInstruction}`
    :`${code}: the trusted project snapshot changed (${assessment.reason}). TALOS did not load the changed snapshot. ${reviewInstruction}`;
  return Object.assign(new Error(message),{code,reason:assessment.reason,projectIdentity:assessment.workspace.identityHash});
}

export async function assertProjectTrusted(input:{projectRoot:string;trustRoot:string}):Promise<ProjectTrustAssessment>{
  const assessment=await assessProjectTrust(input);if(assessment.trusted)return assessment;throw projectTrustFailure(assessment);
}

export async function trustProjectAssessment({assessment,trustRoot,nestedRepositories=[]}:{assessment:ProjectTrustAssessment;trustRoot:string;nestedRepositories?:readonly NestedRepository[]}):Promise<ProjectTrustAssessment>{
  const authority=createTrustAuthority({projectRoot:assessment.workspace.canonicalRoot,trustRoot});
  try{
    const trusted=await authority.trustProject({expected:{workspaceIdentityHash:assessment.workspace.identityHash,resources:assessment.resources,nestedRepositories},includeNested:nestedRepositories.length>0});
    return assessmentOf(trusted);
  }catch(error:any){
    if(error?.code==='PROJECT_TRUST_NESTED_REPOSITORY_CONSENT_REQUIRED'||error?.code==='PROJECT_TRUST_INVALIDATED')throw error;
    throw error;
  }
}
