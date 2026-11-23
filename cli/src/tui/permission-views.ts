/*
 * Stage 7.21 (mockup permissions; owner 03/10): the rules and the last decisions as /permissions shows them. A rule says where
 * it is saved — «project» (the project's shared file), «you» (the person's file for this project), «all projects» (the
 * person's settings) — as the mockup's «project · you». A decision says what was asked in a few words (the command, the tool
 * and the path inside the project), what came of it and when; a block says why in the error's own words; and «a» offers the
 * same rule «allow always» would have written, or none when such a request is answered each time.
 */
import {homedir} from 'node:os';
import {isAbsolute,relative,sep} from 'node:path';
import {t,type MessageId} from '../i18n/index.ts';
import {describeError} from '../i18n/error-view.ts';
import type {DecisionRecord} from '../security/decision-log.ts';
import {ruleToPersist} from '../security/persist.ts';
import type {RuleRow} from '../security/permission-rules-store.ts';
import type {PermissionAction} from '../security/types.ts';
import type {RecentView,RuleView} from './panel/commands.ts';
import {panelWhen} from './panel/when.ts';

export function ruleViews(rows:readonly RuleRow[]):RuleView[]{
  return rows.map(row=>({rule:row.rule,effect:row.effect,meta:t(`panel.permissions.scope.${row.origin}` as MessageId)}));
}
function where(path:string,projectRoot:string){
  if(!isAbsolute(path))return path;
  const inside=relative(projectRoot,path);if(inside&&!inside.startsWith('..')&&!isAbsolute(inside))return inside.split(sep).join('/');
  const home=homedir();const fromHome=relative(home,path);if(fromHome&&!fromHome.startsWith('..')&&!isAbsolute(fromHome))return `~/${fromHome.split(sep).join('/')}`;
  return path;
}
export function actionLabel(action:PermissionAction,projectRoot:string):string{
  if(action.tool==='Bash')return action.command??'Bash';
  if(action.tool==='Mcp')return [action.serverId,action.operation].filter(Boolean).join(' · ')||'MCP';
  return action.resource?`${action.tool} ${where(action.resource,projectRoot)}`:action.tool;
}
export function recentViews(records:readonly DecisionRecord[],{projectRoot,now=Date.now()}:{projectRoot:string;now?:number}):RecentView[]{
  return records.map((record,i)=>{
    let rule:string|null=null;if(record.action.sensitive!=='network'){try{rule=ruleToPersist('allow',record.action,projectRoot);}catch{rule=null;}}
    const desc=record.outcome==='blocked'?describeError({code:record.code??'PERMISSION_REQUIRED'}).what:t(record.outcome==='allowed-always'||record.outcome==='denied-always'?'panel.permissions.savedRule':'panel.permissions.fromCard');
    return{id:`d${i}`,label:actionLabel(record.action,projectRoot),outcome:t(`panel.permissions.outcome.${record.outcome}`),bad:record.outcome==='blocked'||record.outcome.startsWith('denied'),
      meta:panelWhen(record.at,{now,ago:true}),desc,rule};
  });
}
