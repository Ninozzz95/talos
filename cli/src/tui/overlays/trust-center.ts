import {t,tn} from '../../i18n/index.ts';
import type {TrustAuthoritySnapshot} from '../../security/trust-authority.ts';
import {listOverlay,type OverlayContent} from './scroll-window.ts';

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
function statusLabel(snapshot:TrustAuthoritySnapshot){return snapshot.trusted?t('screen.trust.trusted'):t('screen.trust.notTrusted',{reason:snapshot.reason});}
export function trustCenterModel(snapshot:TrustAuthoritySnapshot,{permissionMode}:{permissionMode:string}):TrustCenterModel{
  const projectSection=[
    t('screen.trust.project',{root:shown(snapshot.workspace.canonicalRoot)}),
    t('screen.trust.projectTrust',{status:statusLabel(snapshot)}),
    `Store: ${snapshot.storeSchema?snapshot.storeSchema==='v1'?'legacy v1':'v2':'none'}${snapshot.migrationRequired?' · migration available':''}${snapshot.rollbackAvailable?' · rollback available':''}`
  ];
  const permissionSection=[t('screen.trust.permissionMode',{mode:shown(permissionMode)}),t('screen.trust.policy')];
  const resourceSection=snapshot.resources.length?snapshot.resources.map(row=>`${row.kind} · ${shown(row.id)} · ${row.state} · ${shown(row.relativePath)}`):[t('screen.trust.noResources')];
  const nestedSection=snapshot.nestedRepositories.length?snapshot.nestedRepositories.map(row=>tn('screen.trust.nested',row.resources.length,{path:shown(row.relativePath)})):[t('screen.trust.noNested')];
  const actions=[t('screen.trust.review'),t('screen.trust.accept'),t('screen.trust.revoke')];
  if(snapshot.migrationRequired)actions.push(t(snapshot.nestedRepositories.length?'screen.trust.migrateNested':'screen.trust.migrate'));
  if(snapshot.rollbackAvailable)actions.push(t('screen.trust.rollback'));
  return{title:t('screen.trust.title'),projectSection,permissionSection,resourceSection,nestedSection,actions};
}
export function renderTrustCenterLines(model:TrustCenterModel):string[]{return[model.title,'',...model.projectSection,'',...model.permissionSection,'',t('screen.trust.resources'),...model.resourceSection,'',...model.nestedSection,'',t('screen.trust.actions'),...model.actions];}
// R1 Q-R1-3: the same lines as a capped, scrolling overlay (overlays/scroll-window.ts).
export function trustCenterOverlay(model:TrustCenterModel):OverlayContent{
  return listOverlay([...renderTrustCenterLines(model),t('screen.center.closes')],{head:1,list:0,selected:0,foot:1,tones:(_line,index)=>index===0?'plain':'dim'});
}
