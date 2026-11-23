/*
 * R5b D7 (owner decision Q-R5-17): what `/status` adds to its R4 block — the sandbox verdict, the permission rules counted
 * in each scope's own file, the open tasks and the notes, and the session's usage in the status bar's own words. A fact
 * that could not be read says so; nothing is shown as zero because it was not measured.
 */
import {t} from '../i18n/index.ts';
import {readConfigScope} from '../config/load.ts';
import type {CliPaths} from '../paths.ts';
import {statusBar} from './status-bar.ts';
import type {UsageSnapshot} from '../runtime/usage-snapshot.ts';

export type RuleCount={allow:number;ask:number;deny:number};
export type StatusFacts={
  sandbox:boolean|null;
  rules:{user:RuleCount;project:RuleCount;projectUser:RuleCount}|null;
  work:{open:number;doing:number;notes:number}|null;
  usage:string|null;
};

const size=(value:unknown)=>Array.isArray(value)?value.length:0;
export async function permissionRuleCounts({paths,projectRoot}:{paths:CliPaths;projectRoot:string}):Promise<StatusFacts['rules']>{
  try{
    const count=async(scope:'user'|'project'|'project-user'):Promise<RuleCount>=>{const rules=(await readConfigScope({paths,projectRoot,scope})).permissions;return{allow:size(rules?.allow),ask:size(rules?.ask),deny:size(rules?.deny)};};
    const [user,project,projectUser]=await Promise.all([count('user'),count('project'),count('project-user')]);
    return{user,project,projectUser};
  }catch{return null;}
}

/** The usage segments of the status bar (tokens, cache, context, cost, compactions), unshortened, in one line. */
export function usageLine(snapshot:UsageSnapshot|null,model:string):string|null{
  if(!snapshot)return null;
  const parts=statusBar({snapshot,model,width:10_000,safety:{fullAccess:false,noSandbox:false}}).segments.filter(row=>['tokens','cached','context','cost','compactions'].includes(row.id)).map(row=>row.id==='context'&&row.text===t('screen.statusbar.contextUnknown')?t('screen.status.contextUnknown'):row.text);
  return parts.length?parts.join(' · '):null;
}

export function statusFactLines(facts:StatusFacts):string[]{
  const lines=[t(facts.sandbox===true?'screen.status.sandboxVerified':facts.sandbox===false?'screen.status.sandboxNone':'screen.status.sandboxUnknown')];
  if(!facts.rules)lines.push(t('screen.status.rulesUnknown'));
  else{
    const total=(row:RuleCount)=>row.allow+row.ask+row.deny;const {user,project,projectUser}=facts.rules;
    const all={allow:user.allow+project.allow+projectUser.allow,ask:user.ask+project.ask+projectUser.ask,deny:user.deny+project.deny+projectUser.deny};
    lines.push(total(all)===0?t('screen.status.rulesNone'):t('screen.status.rules',{...all,user:total(user),project:total(project),projectUser:total(projectUser)}));
  }
  lines.push(facts.work?t('screen.status.work',facts.work):t('screen.status.workUnknown'));
  lines.push(facts.usage?t('screen.status.usage',{usage:facts.usage}):t('screen.status.usageNone'));
  return lines;
}
