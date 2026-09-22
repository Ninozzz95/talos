import type {AutomationCenterRow} from '../../services/automation-facade.ts';
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
  const lines=['Automation Center'];
  if(model.snapshot.state==='invalid'){lines.push('Store: invalid · '+inert(model.snapshot.error?.message));lines.push('Esc/q close · u refresh');return lines;}
  if(!model.snapshot.rows.length){lines.push('(no automations)');lines.push('Esc/q close · u refresh');return lines;}
  lines.push(...model.snapshot.rows.map((row,index)=>(index===model.selected?'› ':'  ')+(row.active?'active':'paused')+' · '+inert(row.name)+' · '+inert(row.id)));
  const row=selectedAutomation(model),d=model.detail?.id===row?.id?model.detail:null;
  if(row){
    lines.push('ID: '+inert(row.id)+' · taskId '+inert(row.taskId));
    lines.push('Schedule: '+inert(row.schedule)+' · timezone '+inert(row.timezone??'legacy/UTC-store'));
    if(d){
      lines.push('Missed-run: '+inert(d.missedRun?.mode??'legacy')+' · grace '+inert(d.missedRun?.graceMinutes??'—')+'m · catch-up '+inert(d.missedRun?.catchupWindowMinutes??'—')+'m');
      lines.push('Backoff: failures '+inert(d.backoff?.consecutiveFailures??0)+' · next '+inert(d.backoff?.nextRetryAt??'none'));
      lines.push('OS adapter: '+inert(d.adapterHealth?.state??'unknown'));
      lines.push('dry-run: '+inert(d.dryRun?.action??'unavailable')+' · '+inert(d.dryRun?.reason??'')+(d.dryRun?.nextAt?' · next '+inert(d.dryRun.nextAt):''));
      lines.push('History:');
      const history=Array.isArray(d.history)?d.history.slice(-8):[];
      if(!history.length)lines.push('  (none)');
      else for(const h of history)lines.push('  '+inert(h.attemptedAt)+' · '+inert(h.outcome)+(h.sessionId?' · session '+inert(h.sessionId):'')+(h.errorCode?' · '+inert(h.errorCode):''));
    }else lines.push('Detail: loading/unavailable');
  }
  lines.push('↑/↓ select · d dry-run/detail · u refresh · Esc/q close');
  return lines.map(line=>line.length>799?line.slice(0,798)+'…':line);
}
