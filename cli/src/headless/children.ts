/*
 * ASYNC phase, step 6 (owner 01/10: «talos -p aspetta i figli»). What a one-shot run must still wait for, read from the
 * kernel's own events on the session it watches: `CUSTOM talos.agenti` (a delegated agent created, changed or ended;
 * session-registry `annunciaAgenteAgliAntenati`) and the `RunStarted` the kernel opens with children's results
 * (`input.origine: 'delega'`, `risultatiDelega`; `risvegliaPadreConFiglie`). Hermes waits for its children inside a
 * one-shot call; Claude Code's print mode waits for background tasks up to a ceiling. A child is waited for while it
 * works and, once ended, until a turn answers its result — or, with no wake, for a grace (EXIT_WAIT_GRACE_MS, as /exit).
 */
import {delegationResultsOf} from '../protocol/v2/delegation.ts';
import {EXIT_WAIT_GRACE_MS} from '../tui/exit-with-agents.ts';

export type ChildrenTracker={
  observe(raw:unknown):void;
  /** Delegated agents still working (the ids to stop on Ctrl+C or a timeout). */
  working():string[];
  /** Whether the run must still wait: a child works, or one ended and no turn answered it yet (within the grace). */
  waiting(nowMs:number):boolean;
  /** F-ENG-2: every delegated agent this run has seen, working or ended (their background commands are stopped at the end). */
  known():string[];
};

export function createChildrenTracker({graceMs=EXIT_WAIT_GRACE_MS}:{graceMs?:number}={}):ChildrenTracker{
  const working=new Set<string>(),unanswered=new Set<string>(),answered=new Set<string>();
  let turnOpen=false,settledSince:number|null=null;
  const settle=(nowMs:number)=>{if(turnOpen||working.size||!unanswered.size)settledSince=null;else settledSince??=nowMs;};
  return{
    observe(raw){
      const event=raw&&typeof raw==='object'?raw as Record<string,any>:null;if(!event)return;
      if(event.type==='CUSTOM'&&event.name==='talos.agenti'){
        const value=event.value&&typeof event.value==='object'?event.value:null;
        const childId=typeof value?.childId==='string'&&value.childId?value.childId:null;if(!childId)return;
        const ended=value.agent?.conclusa===true||value.agent?.interrotta===true||value.reason==='completed';
        if(ended){working.delete(childId);if(!answered.has(childId))unanswered.add(childId);}
        else if(!answered.has(childId)&&!unanswered.has(childId))working.add(childId);
      }else if(event.type==='RunStarted'){
        turnOpen=true;
        for(const result of delegationResultsOf(event.input)){answered.add(result.childId);unanswered.delete(result.childId);}
      }else if(event.type==='RunFinished'||event.type==='RunError')turnOpen=false;
      settle(Date.now());
    },
    working:()=>[...working],
    known:()=>[...new Set([...working,...unanswered,...answered])],
    waiting(nowMs){
      if(working.size)return true;
      if(!unanswered.size)return false;
      settle(nowMs);
      return settledSince===null||nowMs-settledSince<graceMs;
    },
  };
}
