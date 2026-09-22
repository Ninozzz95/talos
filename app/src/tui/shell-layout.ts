import {assistantStreamView} from './components/assistant-stream.ts';
import {composerDisplay} from './components/composer.ts';
import {contextUsageLabel,layoutFooter,type FooterField} from './components/footer.ts';
import {edgeRosterLine,mainRosterLine,queueRosterLine,residualFooterFields,terminalShortcutStrip} from './components/terminal-shell.ts';
import {thinkingRowText} from './components/thinking-row.ts';
import {transcriptWindow,type TranscriptViewport} from './components/transcript.ts';
import {deriveLiveActivity,type LiveActivity} from './live-activity.ts';
import {queuedActionPreview,type TuiAppState} from './shell-model.ts';
import type {TuiState} from './state.ts';

export type ShellLayout={
  rows:number;
  columns:number;
  desiredPageSize:number;
  messages:ReturnType<typeof transcriptWindow>;
  live:ReturnType<typeof assistantStreamView>;
  reasoning:string|null;
  context:string|null;
  footerFields:FooterField[];
  footerLine:string;
  activity:LiveActivity;
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

export function deriveShellLayout(input:{
  state:TuiState;
  appState:TuiAppState;
  viewport:TranscriptViewport;
  terminalRows:number;
  terminalColumns:number;
  projectRoot:string;
  currentModelContextWindow:number|null;
  queuedActions:readonly {text:string}[];
  busySince:number;
  bullet:string;
  branch:string;
}):ShellLayout{
  const {state,appState,viewport,projectRoot,currentModelContextWindow,queuedActions,busySince,bullet,branch}=input;
  const {rows,columns,desiredPageSize}=shellDimensions(input.terminalRows,input.terminalColumns);
  const messages=transcriptWindow(state.messages,viewport);
  const live=assistantStreamView(state.streamingAssistant);
  const reasoning=thinkingRowText(state.reasoning?.text??'',appState.reasoningVisible);
  const context=contextUsageLabel(state.usage,currentModelContextWindow);
  const footerFields:FooterField[]=residualFooterFields({workspace:projectRoot,sessionId:state.sessionId,unseen:viewport.unseen});
  const footerLine=layoutFooter(footerFields,columns);
  const activity=deriveLiveActivity(state,busySince);
  const visual=composerDisplay(appState.editor);
  const shortcutLine=terminalShortcutStrip({mode:state.status.permissionMode,running:state.running,queueCount:queuedActions.length,width:columns});
  const mainLine=mainRosterLine({kind:activity.kind,model:state.status.model,width:columns,marker:bullet});
  const rosterLine=edgeRosterLine({left:mainLine,right:context,width:columns});
  const queueLine=queueRosterLine({count:queuedActions.length,preview:queuedActions[0]?queuedActionPreview(queuedActions[0].text):null,width:columns,marker:branch});
  return{
    rows,columns,desiredPageSize,messages,live,reasoning,context,footerFields,footerLine,activity,visual,shortcutLine,rosterLine,queueLine,
    toolRowsLimit:Math.max(2,Math.floor(rows/3)),
    pickerRowsLimit:Math.max(4,Math.min(12,rows-4)),
  };
}
