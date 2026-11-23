import {assistantStreamView} from './components/assistant-stream.ts';
import {composerDisplay} from './components/composer.ts';
import {mainRosterLine,terminalShortcutStrip} from './components/terminal-shell.ts';
import {thinkingRowText} from './components/thinking-row.ts';
import {transcriptWindow,type TranscriptViewport} from './components/transcript.ts';
import {deriveLiveActivity,type LiveActivity} from './live-activity.ts';
import {type TuiAppState} from './shell-model.ts';
import type {TuiState} from './state.ts';
import {statusBar,type StatusBar,type StatusSafety,type StatusProviderVerification} from './status-bar.ts';
import type {UsageSnapshot} from '../runtime/usage-snapshot.ts';
import type {UiBusyInput} from '../config/types.ts';

export type ShellLayout={
  rows:number;
  columns:number;
  desiredPageSize:number;
  messages:ReturnType<typeof transcriptWindow>;
  live:ReturnType<typeof assistantStreamView>;
  reasoning:string|null;
  /* R5a S1: the one status row (status-bar.ts); `footerLine` is its text, the last row of the frame. */
  statusBar:StatusBar;
  footerLine:string;
  activity:LiveActivity;
  /* R5a S9 (review D-14): false while nothing is happening (idle, no hint): the activity row gives its row back. */
  showActivity:boolean;
  visual:ReturnType<typeof composerDisplay>;
  shortcutLine:string;
  rosterLine:string;
  queueLine:string;
  toolRowsLimit:number;
  pickerRowsLimit:number;
};

export function shellDimensions(terminalRows:number,terminalColumns:number){
  const rows=Math.max(8,Number(terminalRows)-15);
  const columns=Math.max(20,Number(terminalColumns));
  return{rows,columns,desiredPageSize:Math.max(4,Math.floor(rows/2))};
}

export function pickerWindow<T>(rows:readonly T[],selected:number,size=10){
  const start=Math.max(0,Math.min(Math.max(0,rows.length-size),selected-Math.floor(size/2)));
  return{start,rows:rows.slice(start,start+size)};
}

/*
 * The chrome of one frame, Ink-free. R5a (lane S):
 *   - S1 (Q-R5-2): the last row is the status row — `Full access · No sandbox · model X · ↑in ↓out · ctx … · ~$… · cmp N ·
 *     N new` — from lane R's usage snapshot. Before R5a the footer held the workspace path and `session <uuid>` and the
 *     roster's right edge a context label that the context status had replaced (gate finding 1, review D-14).
 *   - S9 (D-14): the path stays in the header only, the session id is in /status and in the resume line at exit, the main
 *     roster row no longer repeats the model, and the activity row is shown only when it has something to say.
 *   - S5 (Q-R5-7): while a turn runs, the shortcut strip says what Enter does in the busy-input mode.
 */
export function deriveShellLayout(input:{
  state:TuiState;
  appState:TuiAppState;
  viewport:TranscriptViewport;
  terminalRows:number;
  terminalColumns:number;
  projectRoot:string;
  queuedActions:readonly {text:string}[];
  busySince:number;
  bullet:string;
  branch:string;
  snapshot?:UsageSnapshot|null;
  safety?:StatusSafety;
  busyInput?:UiBusyInput;
  exitHint?:boolean;
  /* owner decision 02/10: the real warnings and errors the console capture counted (console-capture.ts) */
  consoleWarnings?:number;
  /* C1R: the provider's verification declaration for the status row (from the local snapshot, never awaited). */
  providerVerification?:StatusProviderVerification|null;
}):ShellLayout{
  const {state,appState,viewport,queuedActions,busySince,bullet}=input;
  const {rows,columns,desiredPageSize}=shellDimensions(input.terminalRows,input.terminalColumns);
  const messages=transcriptWindow(state.messages,viewport);
  const live=assistantStreamView(state.streamingAssistant);
  const reasoning=thinkingRowText(state.reasoning?.text??'',appState.reasoningVisible);
  const bar=statusBar({snapshot:input.snapshot??null,model:state.status.model,width:columns,safety:input.safety??{fullAccess:false,noSandbox:false},unseen:viewport.unseen,consoleWarnings:input.consoleWarnings??0,...(input.providerVerification!==undefined?{providerVerification:input.providerVerification}:{})});
  const activity=deriveLiveActivity(state,busySince);
  const visual=composerDisplay(appState.editor);
  /* While the approval dialog is open Enter and Esc answer the dialog, so the busy line would be wrong: the R3 strip stays. */
  const busyInput=input.busyInput&&!state.waitingForPerson?input.busyInput:null;
  const shortcutLine=terminalShortcutStrip({mode:state.status.permissionMode,running:state.running,queueCount:queuedActions.length,width:columns,...(busyInput?{busyInput}:{})});
  const rosterLine=mainRosterLine({kind:activity.kind,model:null,width:columns,marker:bullet});
  /* F-Q1 (owner 03/10: «la zona sotto diventa troppo affollata … metterla inline»): what waits is drawn in the conversation
     (queued-items.ts); under the composer only the shortcut strip's compact «queue N · ↑ edit» stays. */
  const queueLine='';
  return{
    rows,columns,desiredPageSize,messages,live,reasoning,statusBar:bar,footerLine:bar.text,activity,
    showActivity:activity.kind!=='idle'||input.exitHint===true,
    visual,shortcutLine,rosterLine,queueLine,
    toolRowsLimit:Math.max(2,Math.floor(rows/3)),
    pickerRowsLimit:Math.max(4,Math.min(12,rows-4)),
  };
}
