import {displayWidth,truncateDisplay} from '../text-width.ts';
import {sanitizeStatus} from './footer.ts';
import type {BusyKind} from './status-indicator.ts';
import type {AgentRosterRow} from '../agent-roster.ts';

const TERMINAL_UNSAFE=/[\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;

export function shellSafeText(value:unknown):string{
  return String(value??'')
    .replace(TERMINAL_UNSAFE,character=>{
      if(character==='\n'||character==='\r'||character==='\t')return' ';
      const code=character.codePointAt(0)!;
      return code>0xffff?`\\u{${code.toString(16)}}`:`\\u${code.toString(16).padStart(4,'0')}`;
    })
    .replace(/\s{2,}/gu,' ')
    .trim();
}

type StripField={text:string;priority:number};

function fitStrip(fields:readonly StripField[],width:number):string{
  const limit=Math.max(0,Math.floor(width));
  if(limit===0)return'';
  const kept=fields.map(field=>({...field,text:shellSafeText(field.text)})).filter(field=>field.text);
  const render=()=>kept.map(field=>field.text).join(' · ');
  while(kept.length&&displayWidth(render())>limit){
    let lowest=0;
    for(let index=1;index<kept.length;index++)if(kept[index]!.priority<kept[lowest]!.priority)lowest=index;
    kept.splice(lowest,1);
  }
  return truncateDisplay(render(),limit);
}

export function terminalShortcutStrip({mode,running,queueCount,width}:{mode:string;running:boolean;queueCount:number;width:number}):string{
  return fitStrip([
    {text:`mode ${shellSafeText(mode)} · Shift+Tab cycle`,priority:100},
    ...(running?[{text:'Esc/Ctrl+C interrupt',priority:95}]:[]),
    ...(queueCount>0?[{text:`queue ${queueCount}`,priority:90}]:[]),
    {text:'PageUp/PageDown transcript',priority:70},
    {text:'? help',priority:60},
  ],width);
}

function busyLabel(kind:BusyKind):string{
  if(kind==='idle')return'ready';
  if(kind==='error')return'error';
  return kind;
}

export function mainRosterLine({kind,model,width,marker='●'}:{kind:BusyKind;model:string;width:number;marker?:string}):string{
  return truncateDisplay(shellSafeText(`${marker} main · ${busyLabel(kind)} · model ${model}`),Math.max(0,Math.floor(width)));
}

export function queueRosterLine({count,preview,width,marker='○'}:{count:number;preview?:string|null;width:number;marker?:string}):string{
  if(count<=0)return'';
  const suffix=preview?` · ${shellSafeText(preview)}`:'';
  return truncateDisplay(shellSafeText(`${marker} queue · ${count} pending${suffix}`),Math.max(0,Math.floor(width)));
}

function parsedMs(value:string|null):number|null{
  if(!value)return null;
  const measured=Date.parse(value);
  return Number.isFinite(measured)?measured:null;
}

export function agentDurationLabel(row:Pick<AgentRosterRow,'startedAt'|'endedAt'|'outcome'>,nowMs:number):string|null{
  const start=parsedMs(row.startedAt);
  if(start===null)return null;
  const explicitEnd=parsedMs(row.endedAt);
  const end=explicitEnd??(row.outcome==='running'&&Number.isFinite(nowMs)?nowMs:null);
  if(end===null||end<start)return null;
  const seconds=Math.floor((end-start)/1000);
  if(seconds<60)return `${seconds}s`;
  const minutes=Math.floor(seconds/60),rest=seconds%60;
  if(minutes<60)return `${minutes}m ${rest}s`;
  const hours=Math.floor(minutes/60),minuteRest=minutes%60;
  return `${hours}h ${minuteRest}m`;
}

export function agentRosterLine({row,width,nowMs,marker}:{row:AgentRosterRow;width:number;nowMs:number;marker?:string}):string{
  const indent='  '.repeat(Math.max(0,Math.min(8,row.level)));
  const pointer=marker??(row.focused?'›':'·');
  const identity=row.role==='main'?'main':row.name?`agent ${shellSafeText(row.name)}`:'agent';
  const status=row.interrupted?'interrupted':row.outcome;
  const duration=agentDurationLabel(row,nowMs);
  const task=row.task?` · ${truncateDisplay(shellSafeText(row.task),32)}`:'';
  const elapsed=duration?` · ${duration}`:'';
  const model=row.model?` · model ${shellSafeText(row.model)}`:'';
  const collision=row.hasCollision?` · COLLISION ${row.collisionCount}`:'';
  const body=shellSafeText(`${pointer} ${identity} · ${status}${collision}${elapsed}${model}${task}`);
  return truncateDisplay(`${indent}${body}`,Math.max(0,Math.floor(width)));
}

export function edgeRosterLine({left,right,width}:{left:string;right?:string|null;width:number}):string{
  const limit=Math.max(0,Math.floor(width));
  if(limit===0)return'';
  const safeLeft=shellSafeText(left);
  const safeRight=shellSafeText(right??'');
  if(!safeRight)return truncateDisplay(safeLeft,limit);
  const leftWidth=displayWidth(safeLeft),rightWidth=displayWidth(safeRight);
  if(leftWidth+1+rightWidth>limit)return truncateDisplay(safeLeft,limit);
  return `${safeLeft}${' '.repeat(Math.max(1,limit-leftWidth-rightWidth))}${safeRight}`;
}

export function residualFooterFields(input:{workspace:string;sessionId:string|null;unseen:number}){
  return[
    ...(input.unseen?[{id:'unseen' as const,text:`${input.unseen} new`,priority:95}]:[]),
    ...(input.sessionId?[{id:'session' as const,text:`session ${sanitizeStatus(input.sessionId)}`,priority:70}]:[]),
    {id:'workspace' as const,text:sanitizeStatus(input.workspace),priority:50},
  ];
}


export function terminalFrameProps({
  session,background,rows,columns,
}:{
  session:{mode:'full'|'mono'|'plain';alternateScreen:boolean;paintBackground:boolean;fallbackReason:string|null};
  background?:string;
  rows:number;
  columns:number;
}){
  if(session.mode==='plain')return{flexDirection:'column' as const};
  const width=Math.max(1,Math.floor(columns));
  const height=Math.max(1,Math.floor(rows));
  return{
    flexDirection:'column' as const,
    width,
    height,
    ...(session.paintBackground&&background?{backgroundColor:background}:{}),
  };
}
