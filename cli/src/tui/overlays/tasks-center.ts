import {en,t,type MessageId} from '../../i18n/index.ts';
import type {TaskBoardRow,TaskBoardSnapshot} from '../../services/task-board-facade.ts';
import {centerTones,listOverlay,type OverlayContent} from './scroll-window.ts';

export type TasksCenterModel={snapshot:TaskBoardSnapshot;selected:number};
const UNSAFE=/[\\\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
function inert(value:unknown){return String(value??'').replace(UNSAFE,ch=>{if(ch==='\\')return'\\\\';const cp=ch.codePointAt(0)??0;return cp<=0xffff?'\\u'+cp.toString(16).padStart(4,'0'):'\\u{'+cp.toString(16)+'}';});}
/* R2 (gate §1.5, E4): the kernel's `origine` value (modello|persona) is mapped by value, never printed raw. */
function writerLabel(value:unknown){const id=`screen.writer.${String(value)}`;return Object.hasOwn(en,id)?t(id as MessageId):inert(value);}
function clamp(value:number,count:number){return count?Math.max(0,Math.min(count-1,value)):0;}
export function createTasksCenterModel(snapshot:TaskBoardSnapshot,selected=0):TasksCenterModel{return{snapshot,selected:clamp(selected,snapshot.rows.length)};}
export function moveTasksCenterSelection(model:TasksCenterModel,delta:number):TasksCenterModel{return{...model,selected:clamp(model.selected+delta,model.snapshot.rows.length)};}
export function selectedTask(model:TasksCenterModel):TaskBoardRow|null{return model.snapshot.rows[model.selected]??null;}
function evidenceLabel(row:TaskBoardRow['evidence'][number]){
  if(row.state==='dangling'||!row.measurement)return'evidence '+inert(row.sessionId)+' · dangling';
  const m=row.measurement;return'evidence '+inert(row.sessionId)+' · available · writes '+m.scritture+' · artifacts '+m.artefatti+' · tools '+m.toolCalls+' · ok '+m.toolCallsOk+' · failed '+m.toolCallsFalliti+' · verifiable '+(m.verificabile?'yes':'no');
}
function scheduleLabel(row:TaskBoardRow['schedules'][number]){
  if(row.state==='dangling')return'schedule '+inert(row.automationId)+' · dangling';
  return'schedule '+inert(row.automationId)+' · available · executes '+inert(row.executionTaskId??'unavailable')+' · interval '+inert(row.intervalMinutes??'unavailable')+'m · '+(row.active?'active':'inactive')+' · next '+inert(row.nextExecution??'unavailable');
}
export function renderTasksCenterLines(model:TasksCenterModel):string[]{
  const lines=[t('screen.tasks.title')];
  if(model.snapshot.state==='invalid'){lines.push('Store: invalid · '+inert(model.snapshot.error?.code??'TASK_BOARD_INVALID')+' · '+inert(model.snapshot.error?.message??'unavailable'));lines.push(t('screen.center.closeRefresh'));return lines;}
  if(!model.snapshot.rows.length){lines.push(t('screen.tasks.empty'));lines.push(t('screen.center.closeRefresh'));return lines;}
  lines.push(...model.snapshot.rows.map((row,index)=>(index===model.selected?'› ':'  ')+'['+inert(row.status)+'] '+inert(row.priority)+' · '+inert(row.title)+' · '+inert(row.id)));
  const row=selectedTask(model);
  if(row){
    lines.push('ID: '+inert(row.id)+' · writer '+writerLabel(row.writer)+' ('+inert(row.writerEvidence)+')');
    if(row.description)lines.push('Description: '+inert(row.description));
    if(row.dependencies.length){lines.push('Dependencies:');for(const dep of row.dependencies)lines.push('- depends '+inert(dep.targetTaskId)+' · '+inert(dep.state)+(dep.label?' · '+inert(dep.label):''));}else lines.push('Dependencies: none');
    if(row.evidence.length){lines.push('Evidence:');for(const evidence of row.evidence)lines.push('- '+evidenceLabel(evidence));}else lines.push('Evidence: none');
    if(row.agents.length){lines.push('Agents:');for(const agent of row.agents)lines.push('- agent '+inert(agent.sessionId)+' · '+inert(agent.state)+' · parent '+inert(agent.parentSessionId??'unavailable')+' · depth '+inert(agent.depth??'unavailable')+' · '+inert(agent.task??'unavailable')+' · '+inert(agent.outcome));}else lines.push('Agents: none');
    if(row.schedules.length){lines.push('Schedules:');for(const schedule of row.schedules)lines.push('- '+scheduleLabel(schedule));}else lines.push('Schedules: none');
  }
  lines.push(t('screen.center.selectRefresh'));
  lines.push(t('screen.tasks.edges'));
  lines.push(t('screen.tasks.edgesEvidence'));
  lines.push(t('screen.tasks.edgesAssign'));
  lines.push(t('screen.tasks.edgesSchedule'));
  return lines;
}
// R1 Q-R1-3: the same lines as a capped, scrolling overlay — the list keeps the selection visible, the detail scrolls.
// The four /tasks edge reference lines follow the key hint: they scroll with the detail, the hint stays.
export function tasksCenterOverlay(model:TasksCenterModel):OverlayContent{
  const lines=renderTasksCenterLines(model),list=model.snapshot.state==='invalid'?0:model.snapshot.rows.length;
  const reference=list?4:0,hint=lines.length-1-reference;
  return listOverlay([...lines.slice(0,hint),...lines.slice(hint+1),lines[hint]!],{head:1,list,selected:model.selected,foot:1,tones:centerTones});
}
