import type {TaskBoardRow,TaskBoardSnapshot} from '../../services/task-board-facade.ts';

export type TasksCenterModel={snapshot:TaskBoardSnapshot;selected:number};
const UNSAFE=/[\\\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
function inert(value:unknown){return String(value??'').replace(UNSAFE,ch=>{if(ch==='\\')return'\\\\';const cp=ch.codePointAt(0)??0;return cp<=0xffff?'\\u'+cp.toString(16).padStart(4,'0'):'\\u{'+cp.toString(16)+'}';});}
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
  const lines=['Task Board'];
  if(model.snapshot.state==='invalid'){lines.push('Store: invalid · '+inert(model.snapshot.error?.code??'TASK_BOARD_INVALID')+' · '+inert(model.snapshot.error?.message??'unavailable'));lines.push('Esc/q close · r refresh');return lines;}
  if(!model.snapshot.rows.length){lines.push('(no tasks)');lines.push('Esc/q close · r refresh');return lines;}
  lines.push(...model.snapshot.rows.map((row,index)=>(index===model.selected?'› ':'  ')+'['+inert(row.status)+'] '+inert(row.priority)+' · '+inert(row.title)+' · '+inert(row.id)));
  const row=selectedTask(model);
  if(row){
    lines.push('ID: '+inert(row.id)+' · writer '+inert(row.writer)+' ('+inert(row.writerEvidence)+')');
    if(row.description)lines.push('Description: '+inert(row.description));
    if(row.dependencies.length){lines.push('Dependencies:');for(const dep of row.dependencies)lines.push('- depends '+inert(dep.targetTaskId)+' · '+inert(dep.state)+(dep.label?' · '+inert(dep.label):''));}else lines.push('Dependencies: none');
    if(row.evidence.length){lines.push('Evidence:');for(const evidence of row.evidence)lines.push('- '+evidenceLabel(evidence));}else lines.push('Evidence: none');
    if(row.agents.length){lines.push('Agents:');for(const agent of row.agents)lines.push('- agent '+inert(agent.sessionId)+' · '+inert(agent.state)+' · parent '+inert(agent.parentSessionId??'unavailable')+' · depth '+inert(agent.depth??'unavailable')+' · '+inert(agent.task??'unavailable')+' · '+inert(agent.outcome));}else lines.push('Agents: none');
    if(row.schedules.length){lines.push('Schedules:');for(const schedule of row.schedules)lines.push('- '+scheduleLabel(schedule));}else lines.push('Schedules: none');
  }
  lines.push('↑/↓ select · r refresh · Esc/q close');
  lines.push('Edges: /tasks depend|undepend <task-id> <task-id>');
  lines.push('       /tasks evidence|unevidence <task-id> <session-id>');
  lines.push('       /tasks assign|unassign <task-id> <agent-session-id>');
  lines.push('       /tasks schedule|unschedule <task-id> <automation-id>');
  return lines;
}
