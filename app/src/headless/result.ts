import {hasToolOutcomeCarrier,toolOutcomesFromCliEvent,type CliEvent,type ToolOutcomeEvidence} from '../events/bridge.ts';
import {renderTalosFailureLine,safeTalosFailure,type TalosFailure} from '../errors.ts';

export type RunResult={schema:'talos.cli.result.v1';ok:boolean;sessionId:string|null;result?:{text:string;outcome:'success';changedFiles:string[];usage:unknown};error?:{code:string;message:string;details:Record<string,unknown>};warnings:string[];failure?:TalosFailure;toolOutcomes?:ToolOutcomeEvidence[]};

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
export function createRunResultAccumulator(){
  let text='';const changed=new Set<string>();let usage:unknown=null;const warnings:string[]=[];let failed:RunResult['error'];let failure:TalosFailure|undefined;let sid:string|null=null;let toolOutcomeSource:CliEvent|null=null;
  return{
    add(input:CliEvent){
      const e=canonicalizeFailureEvent(input);
      sid=e.sessionId||sid;
      if(hasToolOutcomeCarrier(e))toolOutcomeSource=e;
      if(e.type==='message.delta')text+=String(e.data.delta??e.data.text??'');
      if(e.type==='file.changed'&&typeof e.data.path==='string')changed.add(e.data.path);
      if(e.type==='usage.updated')usage=e.data.value??e.data;
      if(e.type==='warning')warnings.push(String(e.data.message??e.data.code??'warning'));
      if(e.type==='run.failed'){failure=eventFailure(e);failed={code:String(e.data.code??'AGENT_FAILED'),message:String(e.data.message??'Agent run failed'),details:e.data};}
    },
    result():RunResult{
      const toolOutcomes=toolOutcomeSource?toolOutcomesFromCliEvent(toolOutcomeSource):[];
      if(failed){
        const value:RunResult={schema:'talos.cli.result.v1',ok:false,sessionId:sid,error:failed,warnings:[...warnings]};
        return hiddenToolOutcomes(hiddenFailure(value,failure??safeTalosFailure(failed,{component:'runtime'})),toolOutcomes);
      }
      const value:RunResult={schema:'talos.cli.result.v1',ok:true,sessionId:sid,result:{text,outcome:'success',changedFiles:[...changed],usage},warnings:[...warnings]};
      return hiddenToolOutcomes(value,toolOutcomes);
    }
  };
}
export function reduceRunResult(events:CliEvent[]):RunResult{const acc=createRunResultAccumulator();for(const e of events)acc.add(e);return acc.result();}
export function renderJson(r:RunResult){return`${JSON.stringify(r)}\n`;}
export function renderStreamJson(events:CliEvent[]){return events.map(e=>JSON.stringify(canonicalizeFailureEvent(e))).join('\n')+(events.length?'\n':'');}
export function renderText(r:RunResult){return r.ok?`${r.result?.text??''}${r.result?.text?'\n':''}`:renderTalosFailureLine(ensuredFailure(r));}
export function exitCodeForResult(r:RunResult):number{return r.ok?0:ensuredFailure(r).exitCode;}
