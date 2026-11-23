import {en,t,type MessageId} from '../../i18n/index.ts';
import {displayWidth,truncateDisplay} from '../text-width.ts';
import {sanitizeStatus} from './footer.ts';
import type {BusyKind} from './status-indicator.ts';
import type {AgentRosterRow} from '../agent-roster.ts';
import type {UiBusyInput} from '../../config/types.ts';

export type TerminalSize={rows:number;columns:number};
type TerminalSizeStream={rows?:number;columns?:number;on?:(event:string,listener:()=>void)=>unknown;off?:(event:string,listener:()=>void)=>unknown;removeListener?:(event:string,listener:()=>void)=>unknown};
function validTerminalDimension(value:unknown,fallback:number){const measured=Number(value);return Number.isFinite(measured)&&measured>0?Math.max(1,Math.floor(measured)):Math.max(1,Math.floor(fallback));}
export function terminalSizeSnapshot(stream:TerminalSizeStream|undefined,fallback:TerminalSize):TerminalSize{
  return{rows:validTerminalDimension(stream?.rows,fallback.rows),columns:validTerminalDimension(stream?.columns,fallback.columns)};
}
export function createTerminalSizeStore(stream:TerminalSizeStream|undefined,fallback:TerminalSize={rows:30,columns:100},onError?:(error:unknown)=>void){
  let snapshot=terminalSizeSnapshot(stream,fallback),disposed=false;const listeners=new Set<(size:TerminalSize)=>void>();
  const onResize=()=>{if(disposed)return;try{const next=terminalSizeSnapshot(stream,snapshot);if(next.rows===snapshot.rows&&next.columns===snapshot.columns)return;snapshot=next;for(const listener of [...listeners])listener(snapshot);}catch(error){try{onError?.(error);}catch{/* resize diagnostics cannot break rendering */}}};
  try{stream?.on?.('resize',onResize);}catch(error){try{onError?.(error);}catch{/* best effort */}}
  return{
    getSnapshot:()=>snapshot,
    subscribe(listener:(size:TerminalSize)=>void){if(disposed)return()=>{};listeners.add(listener);return()=>listeners.delete(listener);},
    dispose(){if(disposed)return;disposed=true;listeners.clear();try{if(typeof stream?.off==='function')stream.off('resize',onResize);else stream?.removeListener?.('resize',onResize);}catch(error){try{onError?.(error);}catch{/* best effort */}}},
  };
}

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

/* R4 Q-R4-12: the permission mode as the person reads it (`manual`, `accept edits`, `plan`, `auto`, `don't ask`,
   `Full access`); the id stays what the runtime and the config use. A mode this table does not know is shown as it came. */
export function permissionModeLabel(mode:string):string{
  const id=`screen.mode.${mode}`;
  return Object.hasOwn(en,id)?t(id as MessageId):shellSafeText(mode);
}

/*
 * R5a S5 (owner decision Q-R5-7; gate E8, finding 8): while a turn runs and the busy-input mode is known, the strip leads
 * with what Enter does in that mode ("Enter queues · Alt+S steers · Esc interrupts") — one field, never split — then the
 * mode in its short form, so both fit at 60 columns. Without a mode (callers before R5a) the strip is as it was.
 */
export function terminalShortcutStrip({mode,running,queueCount,width,busyInput}:{mode:string;running:boolean;queueCount:number;width:number;busyInput?:UiBusyInput}):string{
  if(running&&busyInput)return fitStrip([
    {text:t(`screen.busyLine.${busyInput}`),priority:100},
    {text:t('screen.shortcut.modeShort',{mode:permissionModeLabel(mode)}),priority:95},
    ...(queueCount>0?[{text:t('screen.shortcut.queue',{count:queueCount}),priority:90}]:[]),
    {text:t('screen.shortcut.transcript'),priority:70},
  ],width);
  return fitStrip([
    {text:t('screen.shortcut.mode',{mode:permissionModeLabel(mode)}),priority:100},
    ...(running?[{text:t('screen.shortcut.interrupt'),priority:95}]:[]),
    ...(queueCount>0?[{text:t('screen.shortcut.queue',{count:queueCount}),priority:90}]:[]),
    {text:t('screen.shortcut.transcript'),priority:70},
    {text:t('screen.shortcut.help'),priority:60},
  ],width);
}

function busyLabel(kind:BusyKind):string{
  if(kind==='idle')return t('screen.status.ready');
  if(kind==='error')return t('screen.status.error');
  return t(`screen.busy.${kind}`);
}
/* R2: the outcome words of a roster row; an outcome this table does not know is shown as it came (it is an English id). */
function outcomeLabel(outcome:string):string{
  const id=`screen.outcome.${outcome}`;
  return Object.hasOwn(en,id)?t(id as MessageId):outcome;
}

/* R5a S9 (review D-14): the model now leads the status row (Q-R5-2), so the main roster row may leave it out (`model` null). */
export function mainRosterLine({kind,model,width,marker='●'}:{kind:BusyKind;model:string|null;width:number;marker?:string}):string{
  const line=model===null?t('screen.roster.mainStatus',{marker,status:busyLabel(kind)}):t('screen.roster.main',{marker,status:busyLabel(kind),model});
  return truncateDisplay(shellSafeText(line),Math.max(0,Math.floor(width)));
}

export function queueRosterLine({count,preview,width,marker='○'}:{count:number;preview?:string|null;width:number;marker?:string}):string{
  if(count<=0)return'';
  const suffix=preview?` · ${shellSafeText(preview)}`:'';
  return truncateDisplay(shellSafeText(t('screen.roster.queue',{marker,count,preview:suffix})),Math.max(0,Math.floor(width)));
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


/* R3 Q-R3-7 (gate E7): `status` = the CLI's own activity word for the main row while a turn is open; the kernel list says
   `unknown` or `running` then (measured, gate §0.3). Without it the kernel's outcome word stays. */
export function agentRosterLine({row,width,nowMs,marker,status:activity,hideModel=false}:{row:AgentRosterRow;width:number;nowMs:number;marker?:string;status?:string;hideModel?:boolean}):string{
  const indent='  '.repeat(Math.max(0,Math.min(8,row.level)));
  const pointer=marker??(row.focused?'›':'·');
  const identity=row.role==='main'?t('screen.roster.mainName'):row.name?t('screen.roster.agentNamed',{name:shellSafeText(row.name)}):t('screen.roster.agent');
  const status=activity??outcomeLabel(row.interrupted?'interrupted':row.outcome);
  const duration=agentDurationLabel(row,nowMs);
  const task=row.task?` · ${truncateDisplay(shellSafeText(row.task),32)}`:'';
  const elapsed=duration?` · ${duration}`:'';
  const model=row.model&&!hideModel?` · ${t('screen.roster.model',{model:shellSafeText(row.model)})}`:'';
  const collision=row.hasCollision?` · ${t('screen.roster.collision',{count:row.collisionCount})}`:'';
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
    ...(input.unseen?[{id:'unseen' as const,text:t('screen.footer.unseen',{count:input.unseen}),priority:95}]:[]),
    ...(input.sessionId?[{id:'session' as const,text:t('screen.footer.session',{id:sanitizeStatus(input.sessionId)}),priority:70}]:[]),
    {id:'workspace' as const,text:sanitizeStatus(input.workspace),priority:50},
  ];
}


/*
 * Q-R1-6, the single switch for the frame height. Ink 7.1.1 full-clears the screen and rewrites the whole frame on
 * EVERY commit on win32 once a frame is as tall as the terminal (`ink/build/ink.js:83-112, 748-772`, its guard for
 * Ink #969: Windows consoles scroll when the bottom-right cell is written). A frame one row shorter takes Ink's
 * incremental path, which also skips an unchanged frame. The owner decided to measure both on win32 and adopt
 * `rows − 1` if the screens are clean. Measured 2026-09-24 under ConPTY, acceptance s11 (same session script, 100×30):
 * `rows` 186 frames / 186 full clears (ESC[2J+ESC[3J) / 822,822 bytes; `rows − 1` 179 frames / 2 clears (the two
 * resizes) / 808,404 bytes; idle 0 bytes in both; s01, s06, s13 clean in both. ⇒ `rows − 1`. Other platforms: `rows`.
 */
export type FrameHeightPolicy='rows'|'rows-1';
export const WIN32_FRAME_HEIGHT:FrameHeightPolicy='rows-1';
export function frameRowsFor(rows:number,platform:string=process.platform,policy:FrameHeightPolicy=WIN32_FRAME_HEIGHT):number{
  const measured=Math.max(1,Math.floor(Number(rows)||1));
  return platform==='win32'&&policy==='rows-1'?Math.max(1,measured-1):measured;
}

/*
 * P11 (owner, 2026-09-25, "changing theme crashes the process"): Ink's Box wraps its children in a background Provider
 * ONLY when it has a colour (ink/build/components/Box.js:27). `mono` has no background, so crossing it in /theme changed
 * the tree's shape, React remounted the whole app, and its unmount closed the session controller (app.ts, the
 * `controller.close()` cleanup): the conversation was lost. When the session paints the background the frame therefore
 * ALWAYS has a background colour; for a theme without one it is a name chalk does not know, which Ink leaves unpainted
 * (ink/build/colorize.js returns the text unchanged), so mono stays colourless and the shape never changes.
 */
export const UNPAINTED_BACKGROUND='transparent';
/*
 * UI Phase 0 D2 (owner 27/09: "paint the whole screen", like OpenCode). The frame's background fills every cell but a
 * border's: Ink draws borders with `borderBackgroundColor` only (ink/build/render-border.js:23-27), so the composer's frame
 * (202 cells at 100x30) stayed on the terminal's own background, unreadable on a light terminal. This `Ink` gives every
 * bordered Box the painted background unless it sets its own; `background()` is read at render time (the theme is live)
 * and returns undefined when the session does not paint. Only a style is added: the tree's shape never changes.
 */
export function paintedBorders<T extends {Box:any}>(React:any,Ink:T,background:()=>string|undefined):T{
  /* The ref is forwarded: app.ts measures transcript rows through a Box ref (Ink.measureElement). A React without
     forwardRef (a test double) cannot forward it, so it gets Ink unchanged rather than a Box that drops the ref. */
  if(typeof React?.forwardRef!=='function')return Ink;
  const Box=React.forwardRef(function PaintedBox(props:any,ref:any){
    const color=props?.borderStyle&&props.borderBackgroundColor===undefined?background():undefined;
    return React.createElement(Ink.Box,color?{...props,borderBackgroundColor:color,ref}:{...props,ref});
  });
  return{...Ink,Box};
}
export function terminalFrameProps({
  session,background,rows,columns,platform=process.platform,
}:{
  session:{mode:'full'|'mono'|'plain';alternateScreen:boolean;paintBackground:boolean;fallbackReason:string|null};
  background?:string;
  rows:number;
  columns:number;
  platform?:string;
}){
  if(session.mode==='plain')return{flexDirection:'column' as const};
  const width=Math.max(1,Math.floor(columns));
  const height=frameRowsFor(rows,platform);
  return{
    flexDirection:'column' as const,
    width,
    height,
    ...(session.paintBackground?{backgroundColor:background||UNPAINTED_BACKGROUND}:{}),
  };
}
