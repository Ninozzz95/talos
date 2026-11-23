import {hasToolOutcomeCarrier,toolOutcomesFromCliEvent,type CliEvent,type ToolOutcomeEvidence} from '../events/bridge.ts';
import {renderTalosFailureLine,safeTalosFailure,type TalosFailure} from '../errors.ts';
import {TOOL_PERMISSION_DENIED,type PermissionDenial} from './denials.ts';
import {backgroundStopsOf} from './background.ts';
import type {BackgroundStop} from '../runtime/types.ts';

export type RunResult={schema:'talos.cli.result.v1';ok:boolean;sessionId:string|null;result?:{text:string;outcome:'success';changedFiles:string[];usage:unknown};error?:{code:string;message:string;details:Record<string,unknown>};warnings:string[];failure?:TalosFailure;toolOutcomes?:ToolOutcomeEvidence[];
  /** C-005 (additive): every tool call denied in this run and answered to the model; present only when there was one. */
  permissionDenials?:PermissionDenial[];
  /** F-ENG-2 (additive): the background commands the end of this run stopped; present only when there was one. */
  backgroundStopped?:BackgroundStop[]};

function hiddenFailure<T extends object>(value:T,failure:TalosFailure):T{Object.defineProperty(value,'failure',{value:failure,enumerable:false,configurable:false,writable:false});return value;}
function hiddenToolOutcomes<T extends object>(value:T,outcomes:readonly ToolOutcomeEvidence[]):T{if(outcomes.length===0)return value;Object.defineProperty(value,'toolOutcomes',{value:[...outcomes],enumerable:false,configurable:false,writable:false});return value;}
function resultToolOutcomes(value:RunResult):readonly ToolOutcomeEvidence[]{const outcomes=value.toolOutcomes;return Array.isArray(outcomes)?outcomes:[];}
function eventFailure(e:CliEvent,component='runtime'):TalosFailure{
  const attached=(e as any).failure as TalosFailure|undefined;if(attached)return attached;
  return safeTalosFailure({...e.data,code:String(e.data.code??e.data.sourceCode??'AGENT_FAILED'),message:String(e.data.message??e.data.detto??'Agent run failed')},{component},[]);
}
export function canonicalizeFailureEvent(e:CliEvent,component='runtime'):CliEvent{
  if(e.type!=='run.failed')return e;
  const failure=eventFailure(e,component);
  const outcomes=toolOutcomesFromCliEvent(e);
  const normalized={...e,data:{...e.data,code:failure.envelope.code,message:failure.message}} as CliEvent;
  return hiddenToolOutcomes(hiddenFailure(normalized,failure),outcomes);
}
export function createFailedRunResult(input:{sessionId:string|null;code:string;message:string;details?:Record<string,unknown>;warnings?:string[];component?:string;retryable?:boolean}):RunResult{
  const details=input.details??{};const failure=safeTalosFailure({...details,code:input.code,message:input.message},{component:input.component??'runtime',retryable:input.retryable??false});
  const value:RunResult={schema:'talos.cli.result.v1',ok:false,sessionId:input.sessionId,error:{code:failure.envelope.code,message:failure.message,details},warnings:[...(input.warnings??[])]};
  return hiddenFailure(value,failure);
}
export function withRunWarnings(r:RunResult,warnings:string[]):RunResult{
  const next={...r,warnings:[...warnings]} as RunResult;
  const failure=(r as any).failure as TalosFailure|undefined;
  const withFailure=failure?hiddenFailure(next,failure):next;
  return hiddenToolOutcomes(withFailure,resultToolOutcomes(r));
}
function ensuredFailure(r:RunResult):TalosFailure{
  const attached=(r as any).failure as TalosFailure|undefined;if(attached)return attached;
  const error=r.error??{code:'INTERNAL_ERROR',message:'Unknown error',details:{}};
  return safeTalosFailure({...error.details,code:error.code,message:error.message},{component:'runtime'},[]);
}
/**
 * Decision 245 (owner 05/11/2026), C4(c): the kernel's own row when it sent the model on once after an answer that stopped «for the
 * context» (agent-service.mjs `talos.continuazione`, motivo `fermata-contesto`). It comes between that answer and the resumed one; the
 * answer stays in the history and in the stream, but it is not the run's result: like Hermes, an answer followed by a continuation nudge
 * «is non-final» (agent/turn_final_response.py:295-297, `final_response = None`). Read from the kernel's raw event, never a v1/v2 event.
 */
export function resumesAfterContextStop(raw:unknown):boolean{
  if(!raw||typeof raw!=='object')return false;const r=raw as Record<string,unknown>;
  const value=r.value as Record<string,unknown>|null|undefined;
  return r.type==='CUSTOM'&&r.name==='talos.continuazione'&&value?.motivo==='fermata-contesto';
}
export function createRunResultAccumulator(){
  /* `beforeMessage`: the text as it was before the current message (and the blank line that opened it), so the answer that stopped for
     the context can be taken back out of the result (C4(c)). `cut`: that answer, taken out only when ANOTHER message brings text of its
     own (reviewer's R1 of A5c: a resumption that comes back empty leaves the kernel's turn on the answer that stopped). */
  let text='';let lastMessage:string|null=null;let beforeMessage=0;let cut:{at:number;messageId:string|null}|null=null;const changed=new Set<string>();let usage:unknown=null;const warnings:string[]=[];let failed:RunResult['error'];let failure:TalosFailure|undefined;let sid:string|null=null;let toolOutcomeSource:CliEvent|null=null;const denials:PermissionDenial[]=[];const stopped:BackgroundStop[]=[];
  const withDenials=(value:RunResult):RunResult=>{if(denials.length)value.permissionDenials=[...denials];if(stopped.length)value.backgroundStopped=[...stopped];return value;};
  return{
    add(input:CliEvent){
      const e=canonicalizeFailureEvent(input);
      sid=e.sessionId||sid;
      if(hasToolOutcomeCarrier(e))toolOutcomeSource=e;
      /* ASYNC step 6: a run that waited for its children has more turns; their answers are kept apart by a blank line. */
      if(e.type==='run.started'&&text&&!text.endsWith('\n\n'))text+=text.endsWith('\n')?'\n':'\n\n';
      /* a turn the kernel reopens closes with a second message: the two are kept apart the same way */
      if(e.type==='message.delta'){
        const id=typeof e.data.messageId==='string'?e.data.messageId:null;const delta=String(e.data.delta??e.data.text??'');
        /* an empty delta brings no text: it opens no message, cuts nothing and adds no blank line */
        if(delta){
          if(cut&&id!==cut.messageId){text=text.slice(0,cut.at);cut=null;}
          if(id&&id!==lastMessage)beforeMessage=text.length;
          if(id&&lastMessage&&id!==lastMessage&&text&&!text.endsWith('\n\n'))text+=text.endsWith('\n')?'\n':'\n\n';
          if(id)lastMessage=id;
          text+=delta;
        }
      }
      if(e.type==='file.changed'&&typeof e.data.path==='string')changed.add(e.data.path);
      if(e.type==='usage.updated')usage=e.data.value??e.data;
      if(e.type==='warning')warnings.push(String(e.data.message??e.data.code??'warning'));
      if(e.type==='warning'&&e.data.code===TOOL_PERMISSION_DENIED&&e.data.denial&&typeof e.data.denial==='object')denials.push(e.data.denial as PermissionDenial);
      if(e.type==='warning')stopped.push(...backgroundStopsOf(e.data));
      if(e.type==='run.failed'){failure=eventFailure(e);failed={code:String(e.data.code??'AGENT_FAILED'),message:String(e.data.message??'Agent run failed'),details:e.data};}
    },
    /** C4(c): the kernel sent the model on after its last answer stopped for the context; that answer leaves the result's text when
     *  another message brings text (an empty resumption keeps it, as the kernel does). */
    resumedAfterContextStop(){cut={at:beforeMessage,messageId:lastMessage};},
    result():RunResult{
      const toolOutcomes=toolOutcomeSource?toolOutcomesFromCliEvent(toolOutcomeSource):[];
      if(failed){
        const value:RunResult=withDenials({schema:'talos.cli.result.v1',ok:false,sessionId:sid,error:failed,warnings:[...warnings]});
        return hiddenToolOutcomes(hiddenFailure(value,failure??safeTalosFailure(failed,{component:'runtime'})),toolOutcomes);
      }
      const value:RunResult=withDenials({schema:'talos.cli.result.v1',ok:true,sessionId:sid,result:{text,outcome:'success',changedFiles:[...changed],usage},warnings:[...warnings]});
      return hiddenToolOutcomes(value,toolOutcomes);
    }
  };
}
export function reduceRunResult(events:CliEvent[]):RunResult{const acc=createRunResultAccumulator();for(const e of events)acc.add(e);return acc.result();}
export function renderJson(r:RunResult){return`${JSON.stringify(r)}\n`;}
export function renderStreamJson(events:CliEvent[]){return events.map(e=>JSON.stringify(canonicalizeFailureEvent(e))).join('\n')+(events.length?'\n':'');}
export function renderText(r:RunResult){return r.ok?`${r.result?.text??''}${r.result?.text?'\n':''}`:renderTalosFailureLine(ensuredFailure(r));}
export function exitCodeForResult(r:RunResult):number{return r.ok?0:ensuredFailure(r).exitCode;}
