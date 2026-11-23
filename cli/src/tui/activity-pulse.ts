/*
 * Stage 4 (owner 01/10 + decisions 02/10; research in registro 12, «Tappa 4 … PRIMA del codice»): the pulse of the turn,
 * what the activity line needs beyond the phase. `tokens` is the model's text of this turn as it streams (Claude Code's
 * «↓ N tokens» is the same estimate, four characters a token). `modelWaitSince` is when TALOS started waiting on the model
 * — the turn's start, the model's last streamed byte, a tool's end — and null while nothing is expected from the model (a
 * tool runs, the turn ended): the stall notice reads it, so a silent tool is never called a silent model (owner decision
 * 1). The rest are the turn's measured facts for its summary (decision 3): files written, long silences of the model,
 * requests the person denied. A new turn starts from zero; a replayed `run.started` changes nothing.
 */
import type {TuiEvent} from './event-adapter.ts';
import {rendererKindFor,toolDisplay} from './tool-display.ts';
import {maskToolArguments} from './tools/argument-masks.ts';

export const STALL_MS=30_000;
export type DeniedKind='edit'|'command'|'request';
export type ActivityPulse={
  tokens:number;modelWaitSince:number|null;
  silences:number;longestSilenceMs:number;
  files:readonly string[];denied:readonly DeniedKind[];
};
export const EMPTY_PULSE:ActivityPulse=Object.freeze({tokens:0,modelWaitSince:null,silences:0,longestSilenceMs:0,files:[],denied:[]});

type ToolRowView={id:string;name:string;status:string;argsText:string};
type PulseState={tools:readonly ToolRowView[];approval:null|{requestId:string;toolCallId:string|null}};
const ACTIVE=new Set(['queued','approval','running','streaming']);
const MODEL_DATA=new Set(['message.started','message.delta','reasoning.started','reasoning.delta','reasoning.pulse','tool.started']);

/** The arguments of a tool call once they parse; while they still stream, none. Round 7 of twin 0.2.2: masked as on the card (the activity line draws them). */
export function toolArguments(argsText:string):Record<string,unknown>|undefined{
  try{const value=JSON.parse(argsText) as unknown;return value&&typeof value==='object'&&!Array.isArray(value)?maskToolArguments(value as Record<string,unknown>):undefined;}catch{return undefined;}
}

/** The model sent something: a silence over the stall threshold is counted for the summary. */
function heard(pulse:ActivityPulse,now:number):ActivityPulse{
  const silence=pulse.modelWaitSince===null?0:now-pulse.modelWaitSince;
  return silence>STALL_MS?{...pulse,silences:pulse.silences+1,longestSilenceMs:Math.max(pulse.longestSilenceMs,silence)}:pulse;
}

export function reducePulse(pulse:ActivityPulse,state:PulseState,event:TuiEvent,now:number):ActivityPulse{
  if(event.type==='run.started')return event.history?pulse:{...EMPTY_PULSE,modelWaitSince:now};
  if(MODEL_DATA.has(event.type)){
    if(event.type==='message.started'&&event.role!=='assistant')return pulse;
    const next=heard(pulse,now);
    if(event.type==='tool.started')return{...next,modelWaitSince:null};
    const delta=event.type==='message.delta'||event.type==='reasoning.delta'?event.delta:'';
    return{...next,tokens:next.tokens+Math.ceil(delta.length/4),modelWaitSince:now};
  }
  if(event.type==='tool.completed'){
    const others=state.tools.some(row=>row.id!==event.toolCallId&&ACTIVE.has(row.status));
    const row=state.tools.find(x=>x.id===event.toolCallId);
    const written=row&&(event.outcome?.status??'completed')==='completed'&&['write','edit'].includes(rendererKindFor(row.name));
    const path=written?toolDisplay(row.name,toolArguments(row.argsText)).primaryArg??row.id:null;
    return{...pulse,modelWaitSince:others?pulse.modelWaitSince:now,...(path!==null&&!pulse.files.includes(path)?{files:[...pulse.files,path]}:{})};
  }
  if(event.type==='provider.attempt'){
    const wait=typeof event.waitMs==='number'&&Number.isFinite(event.waitMs)&&event.waitMs>0?event.waitMs:0;
    return{...pulse,modelWaitSince:now+wait};
  }
  if(event.type==='approval.resolved'&&event.approved===false&&state.approval?.requestId===event.requestId){
    const row=state.tools.find(x=>x.id===state.approval!.toolCallId);
    const kind=row?rendererKindFor(row.name):'generic';
    return{...pulse,denied:[...pulse.denied,kind==='write'||kind==='edit'?'edit':kind==='bash'?'command':'request']};
  }
  if(event.type==='run.completed'||event.type==='run.failed'||event.type==='run.cancelled')return{...pulse,modelWaitSince:null};
  return pulse;
}
