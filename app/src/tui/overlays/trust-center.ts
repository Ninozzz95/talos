import type {TrustAuthoritySnapshot} from '../../security/trust-authority.ts';

export type TrustCenterModel={
  title:string;
  projectSection:string[];
  permissionSection:string[];
  resourceSection:string[];
  nestedSection:string[];
  actions:string[];
};
const UNSAFE=/[\\\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
const BACKSLASH=String.fromCharCode(92);
export function inertTrustCenterText(value:string):string{return String(value).replace(UNSAFE,character=>{if(character===BACKSLASH)return BACKSLASH+BACKSLASH;const code=character.codePointAt(0)!;return code>0xffff?`${BACKSLASH}u{${code.toString(16)}}`:`${BACKSLASH}u${code.toString(16).padStart(4,'0')}`;});}
function shown(value:string){return inertTrustCenterText(value);}
function statusLabel(snapshot:TrustAuthoritySnapshot){return snapshot.trusted?'TRUSTED':`NOT TRUSTED · ${snapshot.reason}`;}
export function trustCenterModel(snapshot:TrustAuthoritySnapshot,{permissionMode}:{permissionMode:string}):TrustCenterModel{
  const projectSection=[
    `Project: ${shown(snapshot.workspace.canonicalRoot)}`,
    `Project trust: ${statusLabel(snapshot)}`,
    `Store: ${snapshot.storeSchema?snapshot.storeSchema==='v1'?'legacy v1':'v2':'none'}${snapshot.migrationRequired?' · migration available':''}${snapshot.rollbackAvailable?' · rollback available':''}`
  ];
  const permissionSection=[`Permission mode: ${shown(permissionMode)}`,'Project/resource trust does not replace per-action permission policy.'];
  const resourceSection=snapshot.resources.length?snapshot.resources.map(row=>`${row.kind} · ${shown(row.id)} · ${row.state} · ${shown(row.relativePath)}`):['No executable or instruction resources discovered.'];
  const nestedSection=snapshot.nestedRepositories.length?snapshot.nestedRepositories.map(row=>`Nested repository · ${shown(row.relativePath)} · ${row.resources.length} resource${row.resources.length===1?'':'s'}`):['Nested repositories: none'];
  const actions=['Review: talos project status','Accept current snapshot: talos project trust','Revoke project trust: talos project revoke'];
  if(snapshot.migrationRequired)actions.push(snapshot.nestedRepositories.length?'Migrate legacy store with explicit nested-boundary consent: talos project migrate-trust --include-nested':'Migrate legacy store explicitly: talos project migrate-trust');
  if(snapshot.rollbackAvailable)actions.push('Rollback migration: talos project rollback-trust-migration');
  return{title:'TALOS · Security & trust',projectSection,permissionSection,resourceSection,nestedSection,actions};
}
export function renderTrustCenterLines(model:TrustCenterModel):string[]{return[model.title,'',...model.projectSection,'',...model.permissionSection,'','Resources',...model.resourceSection,'',...model.nestedSection,'','Actions',...model.actions];}
