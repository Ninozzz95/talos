/*
 * ASYNC phase, step 4 (owner 01/10). Leaving TALOS while delegated agents work stops them: they run inside this CLI's
 * process. `/exit` then asks (owner's choice of three): wait for them and exit by itself, stop them and exit, or stay —
 * Claude Code's «Background this session? · Background anyway (N tasks will be stopped) / Stay», plus the wait that
 * `talos -p` does for its children. The double Ctrl+C keeps exiting at once; interrupt.ts names the cost in its hint.
 */
import {t,tn} from '../i18n/index.ts';
import type {LiveAgent} from './live-agents.ts';
import type {OverlayContent,OverlayLine} from './overlays/scroll-window.ts';

export type ExitChoice='wait'|'stop'|'stay';
export const EXIT_CHOICES:readonly ExitChoice[]=['wait','stop','stay'];
/* After the agents waited for have ended, how long an idle main agent may stay without a wake before the wait gives up:
   the kernel wakes the parent at once (session-registry `risvegliaPadreConFiglie`); a result it could not deliver never
   wakes it, and the wait must not hang on that. */
export const EXIT_WAIT_GRACE_MS=15_000;

export function exitWithAgentsOverlay(selected:number,count:number):OverlayContent{
  /* s39 (built CLI): the choice was told by its colour only; the pickers' `›` says it without colour too. */
  /* stage 6c (mockup `exit:i`): a click on a choice chooses it */
  const lines:OverlayLine[]=EXIT_CHOICES.map((choice,index)=>({text:`${index===selected?'›':' '} ${t(`screen.exitAgents.${choice}`)}`,tone:index===selected?'selected':'plain',action:`exit:${index}`}));
  return{head:[{text:tn('screen.exitAgents.title',count),tone:'title'},{text:tn('screen.exitAgents.detail',count),tone:'plain'}],
    sections:[{lines,selected}],foot:[{text:t('screen.exitAgents.keys'),tone:'dim'}]};
}

/**
 * Whether «Wait for them, then exit» is over: every agent it waits for (still in the list) has ended and its result was
 * answered by a run of the main agent, and no turn is open — or they ended and no wake came within the grace.
 * `settledSinceMs`: since when every agent waited for has ended with no turn open (null while that is not so).
 */
export function exitWaitDone({waitFor,agents,running,settledSinceMs,nowMs}:{waitFor:readonly string[];agents:readonly LiveAgent[];running:boolean;settledSinceMs:number|null;nowMs:number}):boolean{
  if(running)return false;
  const known=agents.filter(agent=>waitFor.includes(agent.childId));
  if(known.some(agent=>!agent.ended))return false;
  if(known.every(agent=>agent.reported))return true;
  return settledSinceMs!==null&&nowMs-settledSinceMs>=EXIT_WAIT_GRACE_MS;
}
