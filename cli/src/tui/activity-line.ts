/*
 * Stage 4 (owner 01/10, the approved mockup's `activityRow`; owner decisions 02/10). The activity line says the REAL
 * phase with ITS clock: before it every state carried `busySince`, the turn's start, so a long turn read «⠹ thinking
 * 306.1s» (the owner's report). Research (registro 12): Codex `status_indicator_widget.rs` (header, compact time, the
 * interrupt hint on the same row) and `chatwidget/streaming.rs` (the header is the reasoning summary's last bold title);
 * Claude Code's spinner (verb, time, «↓ N tokens», «esc to interrupt») and #98720 (a timer that counts after the turn:
 * the anti-pattern); Codex #46111 (with animations off the time froze: the clock never depends on the animation); Gemini
 * CLI #24570/#25397 («Thinking» for minutes saying nothing: the stall notice).
 *
 * The phases: working (a header, its clock, the tokens while the model writes, the turn's clock at ≥100 columns),
 * waiting for the person, a provider retry, a stall after 30 s without data — only while the model is awaited (decision
 * 1) —, and the end of the turn with its time frozen and a summary of measured facts only (decision 3). Tokens flow only
 * while the model writes (decision 2). Pure: state and clock in, styled segments (the mockup's roles) out.
 */
import {t,tn} from '../i18n/index.ts';
import type {StyledSegment} from './components/styled-rows.ts';
import {activeToolRow,retryLine,type LiveActivity,type RetryView,type TurnOutcome} from './live-activity.ts';
import {EMPTY_PULSE,STALL_MS,toolArguments,type ActivityPulse} from './activity-pulse.ts';
import {externalToolParts,rendererKindFor,toolDisplay} from './tool-display.ts';
import {displayWidth,truncateDisplay} from './text-width.ts';

export {STALL_MS};
export type ActivityView=
  |{phase:'working';kind:'thinking'|'writing'|'tool'|'starting'|'agents'|'other';header:string;flow:boolean;phaseStart:number;
    modelWaitSince:number|null;turnStart:number|null;tokens:number;background?:number;hint?:string}
  |{phase:'waiting';phaseStart:number;notified?:readonly string[]}
  |{phase:'retry';retry:RetryView}
  |{phase:'ended';outcome:TurnOutcome;ms:number|null;summary:readonly string[]};
export type PhaseMark={key:string;start:number};
/* What the line reads from the screen's state (state.ts TuiState). */
export type ActivityInput={
  running:boolean;waitingForPerson?:boolean;turnStartedAt?:number|null;sentAt?:number|null;
  reasoning:null|{text:string};reasoningTitle?:string|null;tools:readonly {id:string;name:string;status:string;argsText:string}[];
  retry?:RetryView|null;lastTurn?:{outcome:TurnOutcome;durationMs:number|null}|null;pulse?:ActivityPulse;
};

const seg=(text:string,roles=''):StyledSegment=>({text,roles:roles.split(' ').filter(Boolean)});
/* The fixed glyphs, and their ASCII forms for a terminal without Unicode (status-indicator.ts kept the same pairs). */
const GLYPHS={done:['✓','+'],failed:['✗','x'],stopped:['■','-'],waiting:['?','?'],retry:['↻','~'],stall:['!','!']} as const;
const TARGET_MAX=60;
const NOTIFIED_NAME_MAX=20;
const NOTIFIED_NAME_MIN=4;

/** The compact clock of the mockup: «7s», «1m 12s». */
export function activityClock(ms:number):string{
  const s=Math.floor(Math.max(0,ms)/1000);
  return s<60?`${s}s`:`${Math.floor(s/60)}m ${String(s%60).padStart(2,'0')}s`;
}
function thousands(n:number):string{return n>=1000?`${(n/1000).toFixed(1).replace(/\.0$/u,'')}k`:String(Math.round(n));}

/** Codex shows the reasoning summary's last **bold** title as the header; plain reasoning has none. */
export function reasoningHeader(text:string):string|null{
  const titles=[...text.matchAll(/\*\*([^*\n]{3,80})\*\*/gu)].map(match=>match[1]!.trim()).filter(title=>title.length>=3);
  return titles.at(-1)??null;
}

/** A new key starts a new phase clock; the same key keeps it (the object itself, so a render changes nothing). */
export function trackPhase(previous:PhaseMark|null,key:string,now:number):PhaseMark{
  return previous?.key===key?previous:{key,start:now};
}

function oneLine(value:string):string{
  const line=value.split(/\r?\n/u)[0]!.trim();
  return line.length>TARGET_MAX?`${line.slice(0,TARGET_MAX-1)}…`:line;
}
/** What a tool call is doing, in words: «Searching for "retry"», «Reading src/export/», «Calling the github MCP server». */
function toolHeader(row:{name:string;argsText:string}):string{
  const external=externalToolParts(row.name);
  if(external?.kind==='mcp')return t('screen.activity.mcp',{server:external.owner});
  const display=toolDisplay(row.name,toolArguments(row.argsText));
  if(display.primaryArg===null)return display.verb;
  const target=oneLine(display.primaryArg);
  return rendererKindFor(row.name)==='search'?t('screen.activity.searchTarget',{verb:display.verb,target}):t('screen.activity.toolTarget',{verb:display.verb,target});
}

/** The header of the phase the line shows. */
export function activityHeader(state:ActivityInput,live:LiveActivity):string{
  if(live.kind==='thinking')return reasoningHeader(state.reasoning?.text??'')??state.reasoningTitle??t('screen.activity.thinking');
  if(live.kind==='writing')return t('screen.activity.writing');
  if(live.kind==='starting')return t('screen.activity.starting');
  if(live.kind==='agents')return state.running?tn('screen.activity.delegating',live.agents??1):tn('screen.busy.agentsCount',live.agents??1);
  if(live.kind==='tool'){const row=activeToolRow(state.tools);return row?toolHeader(row):t('screen.activity.tool');}
  const word=t(`screen.busy.${live.kind}`);
  return word.charAt(0).toUpperCase()+word.slice(1);
}

/** The key of the phase: a new tool call, a new reasoning title or another kind starts the phase clock again. */
export function phaseKey(state:ActivityInput,live:LiveActivity):string{
  if(live.kind==='tool')return`tool|${activeToolRow(state.tools)?.id??''}`;
  if(live.kind==='thinking')return`thinking|${activityHeader(state,live)}`;
  if(live.kind==='agents')return`agents|${live.agents??0}`;
  return live.kind;
}

/** The turn's summary: measured facts only (owner decision 3). */
export function turnSummary(state:Pick<ActivityInput,'pulse'>,agentsWorking:number):string[]{
  const pulse=state.pulse??EMPTY_PULSE;const parts:string[]=[];
  if(pulse.files.length)parts.push(tn('screen.activity.files',pulse.files.length));
  if(pulse.silences===1)parts.push(t('screen.activity.silentOnce',{time:activityClock(pulse.longestSilenceMs)}));
  else if(pulse.silences>1)parts.push(t('screen.activity.silentMany',{count:pulse.silences,time:activityClock(pulse.longestSilenceMs)}));
  if(pulse.denied.length===1)parts.push(t(`screen.activity.denied.${pulse.denied[0]!}`));
  else if(pulse.denied.length>1)parts.push(tn('screen.activity.deniedMany',pulse.denied.length));
  if(agentsWorking>0)parts.push(tn('screen.busy.agentsCount',agentsWorking));
  return parts;
}

const MODEL_KINDS=new Set(['thinking','writing']);
/** What the line shows for this state: null when there is nothing to say (idle, no turn yet). */
export function activityView(state:ActivityInput,live:LiveActivity,mark:PhaseMark,agentsWorking:number,notified:readonly string[]=[]):ActivityView|null{
  const pulse=state.pulse??EMPTY_PULSE;
  if(live.kind==='idle'||live.kind==='error')return null;
  if(live.kind==='done'||live.kind==='interrupted'||live.kind==='failed')return{phase:'ended',outcome:live.kind,ms:live.frozenMs??null,summary:turnSummary(state,agentsWorking)};
  if(!state.running&&live.kind==='agents'&&state.lastTurn)return{phase:'ended',outcome:state.lastTurn.outcome,ms:state.lastTurn.durationMs,summary:turnSummary(state,agentsWorking)};
  if(live.kind==='waiting')return{phase:'waiting',phaseStart:mark.start,...(notified.length?{notified}:{})};
  if(live.kind==='retrying'&&state.retry)return{phase:'retry',retry:state.retry};
  const model=MODEL_KINDS.has(live.kind);
  const kind=live.kind==='thinking'||live.kind==='writing'||live.kind==='tool'||live.kind==='starting'||live.kind==='agents'?live.kind:'other';
  return{phase:'working',kind,header:activityHeader(state,live),flow:model,phaseStart:mark.start,modelWaitSince:model?pulse.modelWaitSince:null,
    turnStart:state.turnStartedAt??null,tokens:pulse.tokens,...(live.background?{background:live.background}:{}),
    ...(!state.running&&live.kind==='agents'?{hint:t('screen.activity.agentsWatch')}:{})};
}

/** The line itself, as the mockup draws it. `glyph` is the spinner's current frame (the caller owns the animation). */
export function activityRow(view:ActivityView,{now,cols,glyph,unicode=true}:{now:number;cols:number;glyph:string;unicode?:boolean}):StyledSegment[]{
  const fixed=(name:keyof typeof GLYPHS)=>GLYPHS[name][unicode?0:1];
  if(view.phase==='ended'){
    const outcome=view.outcome==='done'?'done':view.outcome==='failed'?'failed':'stopped';
    const role=outcome==='done'?'ok':outcome==='failed'?'del':'dim',mark=fixed(outcome);
    /* A duration nobody measured (a replayed turn) is left out, never shown as «0s» (REV-FAST-DURATION-UNKNOWN). */
    const words=view.ms===null?t(`screen.activity.${outcome}Unmeasured`):t(`screen.activity.${outcome}`,{time:activityClock(view.ms)});
    return[seg(` ${mark} `,role),seg(words,role),...(view.summary.length?[seg(` · ${view.summary.join(' · ')}`,'dim')]:[])];
  }
  if(view.phase==='waiting'){
    /* T5 (owner «Notifica inviata», «Riga discreta»): a notification sent to a device takes the note's place, in the same quiet
       style; one device by name, more by count. Block 8 E-R3: the name gets what is left of the line (at most NOTIFIED_NAME_MAX
       columns; a long wait's clock takes more), the count form or the bare «notification sent» when even that does not fit */
    const head=[seg(` ${fixed('waiting')} `,'acc'),seg(t('screen.activity.waiting'),'acc b'),seg(` · ${activityClock(now-view.phaseStart)}`,'dim')];
    const left=cols-width(head);
    const fits=(text:string)=>displayWidth(text)<=left;
    let sent:string|null=null;
    if(view.notified?.length){
      const room=Math.min(NOTIFIED_NAME_MAX,left-displayWidth(t('screen.activity.notifiedOne',{device:''})));
      const one=view.notified.length===1&&room>=NOTIFIED_NAME_MIN?t('screen.activity.notifiedOne',{device:truncateDisplay(view.notified[0]!,room).replace(/\s+…$/u,'…')}):null;
      const many=view.notified.length>1?t('screen.activity.notifiedMany',{count:view.notified.length}):null;
      sent=[one,many,t('screen.activity.notifiedShort')].find((text):text is string=>typeof text==='string'&&fits(text))??t('screen.activity.notifiedShort');
    }
    return[...head,seg(sent??t('screen.activity.waitingNote'),'faint')];
  }
  if(view.phase==='retry')return[seg(` ${fixed('retry')} `,'warn'),seg(retryLine(view.retry,now),'warn'),seg(t('screen.activity.escToStop'),'faint')];
  /* F-Q4 (owner 03/10: «"no data from the model for n seconds" è fuorviante e può far pensare all'utente che ci sia qualcosa che
     non va»; decisione «Solo colore, come Claude Code»): a model that reasons in silence is not a fault, so no sentence says so.
     After 30 s without data the same line only turns to the warning colour — Claude Code turns its spinner text red when no
     tokens arrive (anthropics/claude-code#22048); Codex says nothing (status_indicator_widget.rs). A real event keeps its words
     (retry, waiting for you). The silence is still told as a measured fact after the turn («the model was silent for …»). */
  const quiet=view.modelWaitSince===null?0:now-view.modelWaitSince;
  const tone=quiet>STALL_MS?'warn':'acc';
  let flow=view.flow?t('screen.activity.tokens',{tokens:thousands(view.tokens)}):'';
  let background=view.background?` · ${tn('screen.busy.background',view.background)}`:'';
  const turn=cols>=100&&view.turnStart!==null?t('screen.activity.turn',{time:activityClock(now-view.turnStart)}):'';
  const row=(header:string)=>[seg(` ${glyph} `,tone),seg(header,`${tone} b`),seg(` · ${activityClock(now-view.phaseStart)}`,'dim'),seg(flow,'dim'),seg(background,'dim'),
    seg(view.hint??t('screen.activity.escToStop'),'faint'),seg(turn,'faint')];
  /* Stage 4 (s17 at 60 columns): the header gives way first, so the phase's time and «esc to stop» always stay on the
     line, as Codex shortens its header before its time and interrupt hint; on a very narrow line the background count
     and then the tokens go too. */
  const room=()=>cols-width(row(''));
  if(room()<HEADER_MIN)background='';
  if(room()<HEADER_MIN)flow='';
  return row(displayWidth(view.header)>room()?truncateDisplay(view.header,Math.max(HEADER_MIN,room())):view.header);
}
const HEADER_MIN=12;
const width=(row:readonly StyledSegment[])=>row.reduce((sum,segment)=>sum+displayWidth(segment.text),0);
