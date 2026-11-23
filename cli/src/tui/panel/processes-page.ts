/*
 * C12d of the redesign (mockup `sezioni-lato.js` Processi; form FORMA-FILE-GIT-PROCESSI-NOTIFICHE, accepted 01/11): the commands the
 * conversations of this window ran, from the kernel's process ledger. Filters Running · Finished · All (Frontend), changed with Tab;
 * s stops one, a twice stops every running one. No CPU, memory or ports in this round (Performance's budget first).
 * Tester 01/11 (R2) and Frontend's form of the same evening: a row that runs is alive — its sign turns and its time counts from its
 * start while the page is open; one asked to stop says «stopping…» with its seconds until it really ends, and past 10 s that it did not.
 */
import type {CliProcessRow} from '../../runtime/types.ts';
import {t,type MessageId} from '../../i18n/index.ts';
import {S,SPIN,wrap,type PanelItem,type SegRow} from './sheet.ts';

export type ProcessesData={rows:readonly CliProcessRow[];readAt:number;error:string|null;
  /** the ones asked to stop and still running: `session:call` → when s was pressed */stopping?:Readonly<Record<string,number>>;
  /** the clock of this drawing (the page redraws while something runs); the ledger was read at `readAt` */now?:number;motion?:boolean};
export const PROCESS_FILTERS=['running','finished','all'] as const;
export type ProcessFilter=(typeof PROCESS_FILTERS)[number];
/** Past this, a command asked to stop and still running says so (Frontend 01/11). */
export const STOP_PATIENCE_MS=10_000;

export const processRunning=(row:CliProcessRow)=>row.outcome==='in-corso'||row.outcome==='in-sfondo';
export const processId=(row:CliProcessRow)=>`${row.sessionId}:${row.toolCallId}`;
const id=processId;
export const processOf=(data:ProcessesData,key:string|undefined)=>data.rows.find(row=>id(row)===key);
const nowOf=(data:ProcessesData)=>data.now??data.readAt;
const stoppingSince=(data:ProcessesData,row:CliProcessRow)=>processRunning(row)?data.stopping?.[id(row)]??null:null;
/** Whether anything on the page is alive: the screen redraws it only then. */
export const processesAlive=(data:ProcessesData)=>data.rows.some(processRunning);

/** The state in words, and its colour: a finished command with an exit code other than 0 failed. */
export function processState(row:CliProcessRow,data?:ProcessesData):[MessageId,string]{
  const since=data?stoppingSince(data,row):null;
  if(since!==null)return nowOf(data!)-since>STOP_PATIENCE_MS?['panel.processes.state.notStopping','err']:['panel.processes.state.stopping','warn'];
  if(row.outcome==='in-corso')return['panel.processes.state.running','acc'];
  if(row.outcome==='in-sfondo')return['panel.processes.state.background','ok'];
  if(row.outcome==='concluso')return row.exitCode!==null&&row.exitCode!==0?['panel.processes.state.failed','err']:['panel.processes.state.done','ok'];
  if(row.outcome==='annullato'||row.outcome==='interrotto')return['panel.processes.state.stopped','warn'];
  if(row.outcome==='rifiutato')return['panel.processes.state.refused','warn'];
  if(row.outcome==='non-eseguito')return['panel.processes.state.notRun','dim'];
  return['panel.processes.state.unknown','dim'];
}
/** «2m 05s», «1h 03m», «40 s» (the mockup's `durata`). */
export function processDuration(ms:number|null):string{
  if(ms===null||!Number.isFinite(ms))return'';
  const s=Math.max(0,Math.round(ms/1000));
  return s>=3600?`${Math.floor(s/3600)}h ${String(Math.floor(s%3600/60)).padStart(2,'0')}m`:s>=60?`${Math.floor(s/60)}m ${String(s%60).padStart(2,'0')}s`:`${s} s`;
}
/** How long it has run: a running one from its start to now (the ledger's own figure lags behind, tester 01/11 R2); a finished one its own. */
export function processElapsed(row:CliProcessRow,now:number):number|null{
  const started=row.startedAt?Date.parse(row.startedAt):Number.NaN;
  if(processRunning(row)&&Number.isFinite(started)&&now>=started)return Math.max(now-started,row.runningForMs??0);
  return row.durationMs??row.runningForMs;
}
export const processMatch=(filter:ProcessFilter)=>(row:CliProcessRow|undefined)=>filter==='all'||Boolean(row&&(filter==='running'?processRunning(row):!processRunning(row)));

/** The turning sign of a live row; still when motion is off. */
const sign=(data:ProcessesData)=>data.motion===false?SPIN[0]!:SPIN[Math.floor(nowOf(data)/120)%SPIN.length]!;

export function processItems(data:ProcessesData):PanelItem[]{
  const now=nowOf(data);
  return data.rows.map(row=>{const [word,role]=processState(row,data);const since=stoppingSince(data,row);
    const time=since!==null?processDuration(now-since):processDuration(processElapsed(row,now));
    const late=since!==null&&now-since>STOP_PATIENCE_MS;
    return{id:id(row),label:row.command??t('panel.processes.noCommand'),badge:t(word),badgeRoles:[role,'band'],meta:processRunning(row)&&time?`${sign(data)} ${time}`:time,
      desc:[row.sessionTitle??row.sessionId.slice(0,8),late?t('panel.processes.stillRunning',{after:processDuration(now-since!)}):row.description].filter(Boolean).join(' · ')};});
}

const when=(at:string|null)=>{const d=at?new Date(at):null;return d&&Number.isFinite(d.getTime())?d.toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'';};
export function processDetail(data:ProcessesData,key:string|undefined,width:number):SegRow[]{
  const row=processOf(data,key);if(!row)return[];const [word,role]=processState(row,data);
  const pair=(label:MessageId,value:string,roles=''):SegRow=>[S(t(label).padEnd(12),'faint'),S(value,roles)];
  const out:SegRow[]=[...wrap(row.command??t('panel.processes.noCommand'),width).map(line=>[S(line,'b code')] as SegRow),...(row.description?wrap(row.description,width).map(line=>[S(line,'dim')] as SegRow):[]),[S('')],
    pair('panel.processes.stateLabel',t(word),role),pair('panel.processes.duration',processDuration(processElapsed(row,nowOf(data)))||t('panel.processes.notMeasured')),
    pair('panel.processes.started',when(row.startedAt)||t('panel.processes.notMeasured')),pair('panel.processes.chat',row.sessionTitle??row.sessionId)];
  const since=stoppingSince(data,row);
  if(since!==null&&nowOf(data)-since>STOP_PATIENCE_MS)out.push([S('')],...wrap(t('panel.processes.stillRunningDetail',{after:processDuration(nowOf(data)-since)}),width).map(line=>[S(line,'warn')] as SegRow));
  if(row.exitCode!==null)out.push(pair('panel.processes.exit',String(row.exitCode),row.exitCode===0?'ok':'err'));
  if(row.outputFile)out.push([S('')],[S(t('panel.processes.output'),'faint')],...wrap(row.outputFile,width).map(line=>[S(line,'code')] as SegRow));
  return out;
}

/** Over the list: while something runs the page follows it; with nothing running, when it was read and how to read it again. The question of a
    «stop all» waiting for its second a stands here, whole at 80 columns, and leaves with the page: it was a line in the chat, cut, that stayed
    after Esc with nothing left to confirm (tester N2, N3; Codex keeps its «press again» out of the transcript, `bottom_pane/footer.rs:11,:182`). */
export function processesTop(data:ProcessesData,width:number,now:number,asking=false):SegRow[]{
  const read=new Date(data.readAt);const at=`${String(read.getHours()).padStart(2,'0')}:${String(read.getMinutes()).padStart(2,'0')}:${String(read.getSeconds()).padStart(2,'0')}`;
  const running=data.rows.filter(processRunning).length;void now;
  const line=running?t('panel.processes.live',{running}):t('panel.processes.readAt',{at});
  const ask=asking&&running?wrap(` ${t('panel.processes.stopAllAsk',{count:running})}`,width).map(text=>[S(text,'warn')] as SegRow):[];
  return[...ask,...wrap(` ${line}`,width).map(text=>[S(text,'faint')] as SegRow),...(data.error?[[S(` ${data.error}`,'warn')] as SegRow]:[]),[S('')]];
}
