import {createTrustAuthority,type FolderTrustDecision,type FolderTrustTarget,type TrustAuthoritySnapshot} from './trust-authority.ts';
import type {ExecutableResourceIdentity,ProjectTrustState} from './project-trust.ts';
import {findNestedRepositories,type NestedRepository,type WorkspaceIdentity} from './workspace-identity.ts';

/**
 * `trusted` keeps its meaning (no project file is untrusted: headless and the runtime rely on it, gate E3). `folder` is the
 * R4 folder decision (Q-R4-1): an interactive start asks when either says so (`needsTrustQuestion`). It is optional so an
 * assessment built by hand (tests, older callers) behaves as before R4.
 */
export type ProjectTrustAssessment={trusted:boolean;reason:ProjectTrustState['reason']|'NO_PROJECT_RESOURCES';workspace:WorkspaceIdentity;resources:ExecutableResourceIdentity[];storeSchema:'v1'|'v2'|null;migrationRequired:boolean;folder?:FolderTrustDecision};

const reviewInstruction='Review with `talos project status`; if the change is expected, run `talos project trust` (or `talos project trust --include-nested` when status lists nested repositories).';

function assessmentOf(snapshot:TrustAuthoritySnapshot,folder:FolderTrustDecision):ProjectTrustAssessment{
  return{trusted:snapshot.trusted,reason:snapshot.reason,workspace:snapshot.workspace,resources:snapshot.resources.flatMap(row=>row.current?[row.current]:[]),storeSchema:snapshot.storeSchema,migrationRequired:snapshot.migrationRequired,folder};
}
export async function assessProjectTrust({projectRoot,trustRoot,homeDir}:{projectRoot:string;trustRoot:string;homeDir?:string}):Promise<ProjectTrustAssessment>{
  const authority=createTrustAuthority({projectRoot,trustRoot,...(homeDir?{homeDir}:{})});const snapshot=await authority.inspect();
  return assessmentOf(snapshot,await authority.folderDecision(snapshot));
}
export async function nestedRepositoriesForProjectTrust(assessment:ProjectTrustAssessment):Promise<NestedRepository[]>{return findNestedRepositories(assessment.workspace,[...new Set(assessment.resources.map(resource=>resource.relativePath))]);}

/** R4 Q-R4-1: an interactive start asks when a project file is not trusted OR the folder has no saved decision. */
export function needsTrustQuestion(assessment:ProjectTrustAssessment):boolean{return!assessment.trusted||(assessment.folder!==undefined&&!assessment.folder.decided);}

export function projectTrustFailure(assessment:ProjectTrustAssessment):Error{
  /* A folder that was never decided (no project files, or the home folder) is "not trusted", never "changed". */
  const neverDecided=assessment.reason==='PROJECT_UNTRUSTED'||assessment.reason==='NO_PROJECT_RESOURCES'||assessment.trusted;
  const code=neverDecided?'PROJECT_TRUST_REQUIRED':'PROJECT_TRUST_INVALIDATED';
  const message=code==='PROJECT_TRUST_REQUIRED'
    ?(assessment.resources.length
      ?`${code}: TALOS did not load project instructions or executable resources because this folder is not trusted. ${reviewInstruction}`
      :`${code}: TALOS did not start because this folder is not trusted. Trust it with \`talos project trust\`, or start \`talos\` here and answer the question.`)
    :assessment.reason==='RESOURCE_SCRIPTS_NOW_PINNED'
      ?`${code}: TALOS now also checks the scripts that this project's hooks and MCP servers run, and they were never reviewed (${assessment.reason}). The settings you trusted did not change. ${reviewInstruction}`
      :`${code}: the trusted project snapshot changed (${assessment.reason}). TALOS did not load the changed snapshot. ${reviewInstruction}`;
  /* third review of 0.6.8 (F4): the headline is the same for both; the advice says the true reason when only the scripts are new */
  const hint=assessment.reason==='RESOURCE_SCRIPTS_NOW_PINNED'?"TALOS now also checks the scripts that this project's hooks and MCP servers run, and they were never reviewed; the settings you trusted did not change. Review them with `talos project status`, then trust the project again with `talos project trust`.":undefined;
  return Object.assign(new Error(message),{code,reason:assessment.reason,projectIdentity:assessment.workspace.identityHash,...(hint?{hint}:{})});
}

/* «One line», step 3 (11/11/2026, brief point b; the PC's «never asked is not trusted», c707d057a): a start that cannot ask
   (`talos -p`, and any runtime composed without a verified grant) does not run in a folder nobody decided. `trusted` keeps its
   meaning (no project file is untrusted); the folder decision is what was missing. As pi, whose trust question answers «no» when
   the mode is not interactive (packages/coding-agent/src/cli/project-trust.ts:35). */
export async function assertProjectTrusted(input:{projectRoot:string;trustRoot:string}):Promise<ProjectTrustAssessment>{
  const assessment=await assessProjectTrust(input);
  if(assessment.trusted&&(assessment.folder===undefined||assessment.folder.decided))return assessment;
  throw projectTrustFailure(assessment);
}

/** `folder` (R4 Q-R4-2): which folder decision the grant saves; omitted, this folder (nothing for the home folder or a drive root).
 *  `sessionOnly` (R4 Q-R4-17): "Trust this folder for this session" — the grant lives in memory for this process, nothing is written. */
export async function trustProjectAssessment({assessment,trustRoot,nestedRepositories=[],folder,homeDir,sessionOnly=false}:{assessment:ProjectTrustAssessment;trustRoot:string;nestedRepositories?:readonly NestedRepository[];folder?:FolderTrustTarget;homeDir?:string;sessionOnly?:boolean}):Promise<ProjectTrustAssessment>{
  const authority=createTrustAuthority({projectRoot:assessment.workspace.canonicalRoot,trustRoot,...(homeDir?{homeDir}:{})});
  const trusted=await authority.trustProject({expected:{workspaceIdentityHash:assessment.workspace.identityHash,resources:assessment.resources,nestedRepositories},includeNested:nestedRepositories.length>0,...(folder?{folder}:{}),...(sessionOnly?{session:true}:{})});
  return assessmentOf(trusted,await authority.folderDecision(trusted));
}
