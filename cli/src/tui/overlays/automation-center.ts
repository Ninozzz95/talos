import {t} from '../../i18n/index.ts';
import type {AutomationCenterRow} from '../../services/automation-facade.ts';
import {centerTones,listOverlay,type OverlayContent} from './scroll-window.ts';
import {modeWords,runOutcomeWords,runReasonWords,runTime} from '../../automations/run-words.ts';
export type AutomationCenterSnapshot={state:'ready'|'invalid';rows:AutomationCenterRow[];error:{code:string;message:string}|null};
export type AutomationCenterModel={snapshot:AutomationCenterSnapshot;selected:number;detail:any|null};
const UNSAFE=/[\\\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
function inert(value:unknown,max=360){const safe=String(value??'').replace(UNSAFE,ch=>{if(ch==='\\')return'\\\\';const cp=ch.codePointAt(0)??0;return cp<=0xffff?'\\u'+cp.toString(16).padStart(4,'0'):'\\u{'+cp.toString(16)+'}';});return safe.length>max?safe.slice(0,max-1)+'…':safe;}
function clamp(n:number,count:number){return count?Math.max(0,Math.min(count-1,n)):0;}
export function createAutomationCenterModel(snapshot:AutomationCenterSnapshot,selected=0):AutomationCenterModel{return{snapshot,selected:clamp(selected,snapshot.rows.length),detail:null};}
export function moveAutomationCenterSelection(model:AutomationCenterModel,delta:number):AutomationCenterModel{return{...model,selected:clamp(model.selected+delta,model.snapshot.rows.length),detail:null};}
export function selectedAutomation(model:AutomationCenterModel){return model.snapshot.rows[model.selected]??null;}
export function setAutomationCenterDetail(model:AutomationCenterModel,detail:any|null):AutomationCenterModel{return{...model,detail};}
export function renderAutomationCenterLines(model:AutomationCenterModel){
  const lines=[t('screen.automation.title')];
  if(model.snapshot.state==='invalid'){lines.push('Store: invalid · '+inert(model.snapshot.error?.message));lines.push(t('screen.center.closeRefreshU'));return lines;}
  if(!model.snapshot.rows.length){lines.push(t('screen.automation.empty'));lines.push(t('screen.center.closeRefreshU'));return lines;}
  lines.push(...model.snapshot.rows.map((row,index)=>(index===model.selected?'› ':'  ')+t(row.legacy?'automation.center.legacy':row.active?'automation.center.active':'automation.center.paused')+' · '+inert(row.name)+' · '+inert(row.id)));
  const row=selectedAutomation(model),d=model.detail?.id===row?.id?model.detail:null;
  if(row){
    /* 0.6.6: the kernel's v2 automations (instructions, folder, a schedule phrase, the history of runs); an old-format entry says it cannot run */
    lines.push(t('automation.center.id',{id:inert(row.id)})+(row.legacy?t('automation.center.idLegacy'):t('automation.center.idMode',{mode:inert(modeWords(row.mode)),model:inert(row.model??t('automation.center.defaultModel'))})));
    lines.push(t('automation.center.schedule',{schedule:inert(row.schedule)})+(row.timezone?t('automation.center.zone',{zone:inert(row.timezone)}):'')+(row.nextRunAt&&row.active?t('automation.center.next',{at:inert(row.nextRunAt)}):'')+(row.running?t('automation.center.running'):''));
    if(!row.legacy)lines.push(t('automation.center.folder',{folder:inert(row.folder)})+(row.runsLeft!==null?t('automation.center.left',{count:inert(row.runsLeft)}):''));
    if(d){
      if(!row.legacy)lines.push(t('automation.center.instructions',{text:inert(row.instructions)}));
      lines.push(t('automation.center.adapter',{state:inert(d.adapterHealth?.state??'unknown')}));
      lines.push(t('automation.center.history'));
      const runs=Array.isArray(d.runs)?d.runs.slice(0,8):[];
      if(!runs.length)lines.push(t('automation.center.none'));
      /* the second review of 0.6.6 (N4): the runs in words, as `talos automation history` says them (automations/run-words.ts) */
      else for(const r of runs){
        lines.push('  '+[runTime(r)??'?',runOutcomeWords(r.esito??r.evento),r.motivo==='fermata'?null:runReasonWords(r.motivo),r.sessionId].filter(Boolean).map(value=>inert(value)).join(' · '));
        if(typeof r.dettaglio==='string'&&r.dettaglio)lines.push('    '+inert(r.dettaglio));
      }
    }else lines.push(t('automation.center.loading'));
  }
  lines.push(t('screen.automation.keys'));
  return lines.map(line=>line.length>799?line.slice(0,798)+'…':line);
}
// R1 Q-R1-3: the same lines as a capped, scrolling overlay — the list keeps the selection visible, the detail scrolls.
export function automationCenterOverlay(model:AutomationCenterModel):OverlayContent{
  const list=model.snapshot.state==='invalid'?0:model.snapshot.rows.length;
  return listOverlay(renderAutomationCenterLines(model),{head:1,list,selected:model.selected,foot:1,tones:centerTones});
}
