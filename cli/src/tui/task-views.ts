/*
 * Stage 7.19 (mockup tasks; owner 03/10: the mockup's sheet in front, what the task board has more in the detail beside it):
 * the task board's rows as the /tasks sheet shows them. The right column is the mockup's — «today» or the date for a task done,
 * «in progress», «agent working» while an agent linked to it runs, «open» — and the detail says the state and priority, the
 * description, and each link in words (a link whose target is gone says so).
 */
import {t} from '../i18n/index.ts';
import type {TaskBoardRow} from '../services/task-board-facade.ts';
import type {TaskView} from './panel/commands.ts';
import {panelDay} from './panel/when.ts';

export function taskViews(rows:readonly TaskBoardRow[],{now=Date.now(),offsetMinutes}:{now?:number;offsetMinutes?:number}={}):TaskView[]{
  const day=(at:string|null)=>panelDay(at,{now,...(offsetMinutes!==undefined?{offsetMinutes}:{})});
  return rows.map(row=>{
    const running=row.agents.some(agent=>agent.state==='available'&&agent.outcome==='running');
    const meta=row.status==='done'?day(row.updatedAt??row.createdAt):row.status==='doing'?t('panel.tasks.meta.doing'):running?t('panel.tasks.meta.agent'):t('panel.tasks.meta.open');
    return{id:row.id,title:row.title,done:row.status==='done',state:row.status==='done'?'done':row.status==='doing'?'doing':'open',meta,detail:{
      description:row.description,status:t(`panel.tasks.status.${row.status}`),priority:t(`panel.tasks.priority.${row.priority}`),
      depends:row.dependencies.map(link=>link.state==='available'&&link.label?link.label:t('panel.tasks.gone',{id:link.targetTaskId})),
      evidence:row.evidence.map(link=>link.measurement?t('panel.tasks.evidenceLine',{session:link.sessionId.slice(0,6),writes:link.measurement.scritture,calls:link.measurement.toolCalls}):t('panel.tasks.gone',{id:link.sessionId.slice(0,6)})),
      agents:row.agents.map(link=>link.state==='available'?t('panel.tasks.agentLine',{task:link.task??link.sessionId.slice(0,6),outcome:link.outcome}):t('panel.tasks.gone',{id:link.sessionId.slice(0,6)})),
      schedules:row.schedules.map(link=>link.state==='available'?t('panel.tasks.scheduleLine',{name:link.name??link.automationId,minutes:link.intervalMinutes??'?'}):t('panel.tasks.gone',{id:link.automationId})),
    }};
  });
}
