import {developmentLog,developmentLogError,developmentTextEvidence} from '../diagnostics/development-log.ts';
import {execFile} from 'node:child_process';
import {join} from 'node:path';
import {promisify} from 'node:util';
import type {CliInvocation} from '../args.ts';
import type {CliPaths} from '../paths.ts';
import type {CliContextStatus,CliRuntime} from '../runtime/types.ts';
import type {AutoClassifier} from '../security/permission-engine.ts';
import type {PermissionMode,RuleSetInput} from '../security/types.ts';
import type {TuiCatalogService,TuiKeySave,TuiModel,TuiProvider,TuiProviderProbe,TuiReadiness} from './catalog-service.ts';
import {benchedKeyText,unusableKeyRefusal} from './catalog-service.ts';
import {providerOfModel,screenChildEnvironment} from '../provider/environment-keys.ts';
import {createBootSequenceComponent} from './boot/boot-sequence.ts';
import {completeBoot,createBootState,markBootError,markBootReady,shouldRenderBootLogo,skipBoot,type BootState} from './boot/boot-sequence.ts';
import {commandMenuFastTextInput,commandMenuItems,completeCommandSelection,createCommandMenuSelectionStore,type CommandMenuSelectionStore} from './components/command-menu.ts';
import {applyComposerFastEditorAction,applyComposerFastPasteInput,composerDisplay,composerFastEditorAction,composerFastPasteInput,composerFastTextInput,composerOwnsPaste,createComposerStore,planComposerHistoryAction,reverseHistoryMatch,type ComposerStore} from './components/composer.ts';
import {headerLine} from './components/header.ts';
import {createMarkdownParseMemo,markdownBlockLines,markdownRenderPropsEqual,markdownSafeText,parseMarkdownInline,type MarkdownInlineToken} from './components/markdown.ts';
import {renderDiffModel} from './components/diff.ts';
import {parseUnifiedDiff} from './diff-model.ts';
import {busyIndicatorText} from './components/status-indicator.ts';
import {agentRosterLine} from './components/terminal-shell.ts';
import {toolRowView} from './components/tool-row.ts';
import {copySelection,createEditorState,deleteBackward,deleteForward,editInsert,insertPaste,killToEnd,killToStart,killWordBackward,moveCursor,moveVertical,moveWord,previousGraphemeBoundary,redoEditor,replaceEditorText,undoEditor,yank,type EditorState} from './editor.ts';
import {editExternally} from './external-editor.ts';
import {completeProjectPath} from './file-completion.ts';
import {closeFocus,createFocusState,openFocus} from './focus-manager.ts';
import {createInterruptController} from './interrupt.ts';
import {KEYBINDINGS,cyclePermissionMode,type Keybinding} from './keybindings.ts';
import {approvalChoiceForAction,approvalDialogModel,renderApprovalDialog} from './overlays/approval-dialog.ts';
import {commitModelSelection,createModelPickerModel,type ModelPickerModel} from './overlays/model-picker.ts';
import type {OverlayState} from './overlays/overlay-host.ts';
import {consentQuestion,createProviderPickerModel,maskedSecret,providerKeySourceLabel,providerPickerEnter,type ConsentChoice,type ProviderPickerModel} from './overlays/provider-picker.ts';
import {createSessionPickerModel,filterSessions,type SessionPickerModel} from './overlays/session-picker.ts';
import {agentTreeOverlayLines,createAgentTreeOverlayModel,moveAgentTreeSelection,selectedAgentRow,type AgentTreeOverlayModel} from './overlays/agent-tree.ts';
import {agentRosterRows,type AgentRosterRow} from './agent-roster.ts';
import {helpDialogText} from './overlays/help-dialog.ts';
import {queueEditorLines,queueEditorSelected} from './overlays/queue-editor.ts';
import {contextInspectorLines} from './overlays/context-inspector.ts';
import {createTranscriptSearchState,moveTranscriptSearchSelection,selectedTranscriptMatch,transcriptSearchLines,transcriptSearchMatches,type TranscriptSearchState} from './overlays/transcript-search.ts';
import {trustCenterModel,renderTrustCenterLines,type TrustCenterModel} from './overlays/trust-center.ts';
import {createMcpCenterModel,moveMcpCenterSelection,renderMcpCenterLines,replaceMcpCenterRow,selectedMcpServer,type McpCenterModel} from './overlays/mcp-center.ts';
import {createMcpFacade} from '../services/mcp-facade.ts';
import {createHookCenterModel,moveHookCenterSelection,renderHookCenterLines,replaceHookCenterRow,selectedHook,type HookCenterModel} from './overlays/hook-center.ts';
import {createHookFacade} from '../services/hook-facade.ts';
import {createPluginCenterModel,movePluginCenterSelection,renderPluginCenterLines,selectedPlugin,type PluginCenterModel} from './overlays/plugin-center.ts';
import {createPluginFacade} from '../services/plugin-facade.ts';
import {createMemoryCenterModel,moveMemoryCenterSelection,renderMemoryCenterLines,selectedMemory,type MemoryCenterModel} from './overlays/memory-center.ts';
import {createMemoryFacade} from '../services/memory-facade.ts';
import {createNotesCenterModel,moveNotesCenterSelection,renderNotesCenterLines,selectedNote,type NotesCenterModel} from './overlays/notes-center.ts';
import {createNotesFacade,type NoteTargetKind} from '../services/notes-facade.ts';
import {createTasksCenterModel,moveTasksCenterSelection,renderTasksCenterLines,selectedTask,type TasksCenterModel} from './overlays/tasks-center.ts';
import {createTaskBoardFacade} from '../services/task-board-facade.ts';
import {createLibraryCenterModel,moveLibraryCenterSelection,renderLibraryCenterLines,selectedLibraryEntry,setLibraryCenterDuplicateScan,setLibraryCenterPreview,type LibraryCenterModel} from './overlays/library-center.ts';
import {attachLibraryContextToken,createLibraryFacade,detachLibraryContextToken} from '../services/library-facade.ts';
import {createResearchCenterModel,moveResearchCenterSelection,renderResearchCenterLines,selectedResearch,setResearchCenterDetail,type ResearchCenterModel} from './overlays/research-center.ts';
import {createResearchFacade,type ResearchExportFormat} from '../services/research-facade.ts';
import {createAutomationCenterModel,moveAutomationCenterSelection,renderAutomationCenterLines,selectedAutomation,setAutomationCenterDetail,type AutomationCenterModel} from './overlays/automation-center.ts';
import {createAutomationFacade} from '../services/automation-facade.ts';
import {createForgeCenterModel,moveForgeCenterSelection,renderForgeCenterLines,selectedForgeTool,setForgeCenterDetail,type ForgeCenterModel} from './overlays/forge-center.ts';
import {createForgeFacade} from '../services/forge-facade.ts';
import {createTrustAuthority} from '../security/trust-authority.ts';
import {sessionMetadataRoot} from '../sessions/metadata-store.ts';
import {moveSelection,type SelectionState} from './selection-list.ts';
import {createTuiSessionController,TuiNotReadyError,type PendingTuiApproval,type TuiQueuedAction,type TuiQueueEntry,type TuiSteerState} from './session-controller.ts';
import {parseSlashCommand,SLASH_COMMANDS} from './slash-commands.ts';
import {initialTuiState,reasoningUsageLabel,reduceTuiEvent,type TuiState} from './state.ts';
import {appendTranscriptMessage,appendTranscriptWarning,createTranscriptModel,transcriptItemRaw,transcriptItemText,type TranscriptItem} from './transcript-model.ts';
import type {TerminalCapabilities} from './terminal-capabilities.ts';
import {createTuiTheme,themeColor} from './theme.ts';
import type {ThemeAccentId} from './theme-catalog.ts';
import type {ReasoningEffort,UiTheme} from '../config/types.ts';
import {configSet,configUnset} from '../config/commands.ts';
import {osc52CopySequence,reduceViewport,transcriptEventAddsItem,transcriptViewportForIndex,transcriptWindow,type TranscriptViewport} from './components/transcript.ts';
import {
  MODEL_ID,NO_MODEL,NO_PROVIDER_MODEL,
  closeOverlay,createTuiAppState,lastProjectToken,modelItems,openOverlay,permissionDryRunSlash,pickerMove,providerItems,queuedActionPreview,reduceAppAction,replaceLastProjectToken,slashCommandIntent,slashCommandToCliArgs,togglePlanMode,
  type TuiAppState,
} from './shell-model.ts';
import {deriveShellLayout,pickerWindow} from './shell-layout.ts';
import {decideShellInput} from './shell-input.ts';
import {createRenderCoordinator,type RenderCoordinator} from './render-coordinator.ts';
import {MOTION_FRAME_MS,frameIndex} from './render-scheduler.ts';
import {onboardingSteps} from './onboarding.ts';
import {createVimState,handleVimInput,toggleVim,vimModeHint,type VimState} from './vim-mode.ts';

export {closeOverlay,createTuiAppState,permissionDryRunSlash,queuedActionPreview,reduceAppAction,slashCommandIntent,slashCommandToCliArgs,togglePlanMode} from './shell-model.ts';
export type {AppAction,SlashCommandIntent,TuiAppState} from './shell-model.ts';

const execFileAsync=promisify(execFile);
const MAX_HISTORY=200;
/* B1 slice 18 — until a provider is chosen no model is shown, and until a model of that provider is chosen none is either. */
type ProviderStep={kind:'list'}|{kind:'consent';provider:TuiProvider;choice:ConsentChoice}|{kind:'key';provider:TuiProvider;testing:boolean;result:TuiKeySave|null;remediation?:TuiProviderProbe['remediation']};
function errorCode(error:unknown){const code=(error as any)?.code;return typeof code==='string'&&/^[A-Z0-9_]{1,64}$/u.test(code)?code:'UNAVAILABLE';}

export type TuiAppProps={
  runtime:CliRuntime;registry?:any;catalog:TuiCatalogService;invocation:CliInvocation;
  projectRoot:string;paths:CliPaths;permissionRules:RuleSetInput;
  autoClassifier?:AutoClassifier;initialPrompt?:string;initialReasoningEffort?:ReasoningEffort|null;renderCoordinator?:RenderCoordinator;keymap?:ReadonlyArray<Keybinding>;uiTheme?:UiTheme;terminalSize?:{rows:number;columns:number};
};

export type ReasoningEffortChoice=ReasoningEffort|'default';
export function reasoningEffortChoices(model:TuiModel):ReasoningEffortChoice[]{
  if(model.reasoning!==true||!Array.isArray(model.reasoningEfforts)||model.reasoningEfforts.length===0)return[];
  return['default',...model.reasoningEfforts];
}
export async function selectExplicitModel(id:string,catalog:TuiCatalogService,setControllerModel:(id:string)=>void){await commitModelSelection({id,catalog,setControllerModel});}
export async function runControllerSlashAction(name:string,controller:{compact():Promise<any>}):Promise<string|null>{if(name!=='compact')return null;const result=await controller.compact();return result?.compattato===false?'Context is already compact.':'Context compacted.';}

function localMessage(state:TuiState,text:string):TuiState{const id=`local-${Date.now()}-${Math.random()}`;const base=state.messages.length>=511?state.messages.slice(-511):state.messages;return{...state,messages:[...base,{id,role:'assistant',text}],transcript:appendTranscriptWarning(state.transcript,text)};}
function userMessage(state:TuiState,text:string,id=`user-${Date.now()}-${Math.random()}`):TuiState{const base=state.messages.length>=511?state.messages.slice(-511):state.messages;return{...state,messages:[...base,{id,role:'user',text}],transcript:appendTranscriptMessage(state.transcript,{role:'user',text})};}

export function createTuiAppComponent(React:any,Ink:any,capabilities:TerminalCapabilities={interactive:true,color:true,motion:true,unicode:true},accentId?:ThemeAccentId){
  const h=React.createElement;
  const theme=createTuiTheme(capabilities,accentId);
  const bootColor=themeColor(theme,'boot');
  const transcriptColor=themeColor(theme,'transcript');
  const pickerColor=themeColor(theme,'picker');
  const approvalColor=themeColor(theme,'approval');
  const toolColor=themeColor(theme,'tool');
  const footerColor=themeColor(theme,'footer');
  const BootSequence=createBootSequenceComponent(React,Ink);

  const renderInline=(text:string,keyPrefix:string)=>parseMarkdownInline(text).map((token:MarkdownInlineToken,index:number)=>{
    const key=`${keyPrefix}-${index}`;
    if(token.kind==='strong')return h(Ink.Text,{key,bold:true},token.text);
    if(token.kind==='emphasis')return h(Ink.Text,{key,italic:true},token.text);
    if(token.kind==='code')return h(Ink.Text,{key,color:toolColor},token.text);
    if(token.kind==='strike')return h(Ink.Text,{key,strikethrough:true,dimColor:true},token.text);
    if(token.kind==='link')return h(React.Fragment,{key},h(Ink.Text,{underline:true,color:pickerColor},token.text),h(Ink.Text,{dimColor:true},` (${token.href})`));
    return h(Ink.Text,{key},token.text);
  });
  const MarkdownView=React.memo(function MarkdownView({text,width}:{text:string;width:number}){
    const parseMemoRef:{current:ReturnType<typeof createMarkdownParseMemo>|null}=React.useRef(null);
    if(!parseMemoRef.current)parseMemoRef.current=createMarkdownParseMemo();
    const blocks=parseMemoRef.current.get(text);
    return h(React.Fragment,null,...blocks.map((block,index)=>{
      if(block.kind==='heading')return h(Ink.Text,{key:index,bold:true},...renderInline(block.text,`h-${index}`));
      if(block.kind==='code')return h(Ink.Box,{key:index,flexDirection:'column'},...block.tokens.map((line:any[],lineIndex:number)=>h(Ink.Text,{key:lineIndex},...line.map((token:any,tokenIndex:number)=>h(Ink.Text,{key:tokenIndex,dimColor:token.kind==='comment',bold:token.kind==='keyword'||token.kind==='key'},markdownSafeText(token.text))))));
      if(block.kind==='blockquote')return h(Ink.Box,{key:index,flexDirection:'column',paddingLeft:1},...block.text.split('\n').map((line,lineIndex)=>h(Ink.Text,{key:lineIndex,dimColor:true},h(Ink.Text,{bold:true},'│ '),...renderInline(line,`q-${index}-${lineIndex}`))));
      if(block.kind==='list')return h(Ink.Box,{key:index,flexDirection:'column'},...block.items.map((item,itemIndex)=>h(Ink.Text,{key:itemIndex},'  '.repeat(block.depths[itemIndex]??0)+(block.ordered?String(block.start+itemIndex)+'. ':'• '),...renderInline(item,`l-${index}-${itemIndex}`))));
      if(block.kind==='table'){const layout=markdownBlockLines(block,width);return h(Ink.Box,{key:index,flexDirection:'column'},...layout.lines.map((line,lineIndex)=>h(Ink.Text,{key:lineIndex,bold:layout.mode==='wide'&&lineIndex===0,dimColor:lineIndex===1&&layout.mode==='wide'},line||' ')));}
      return h(Ink.Text,{key:index},...renderInline(block.text,`p-${index}`));
    }));
  },markdownRenderPropsEqual);
  const ComposerView=React.memo(function ComposerView({store,vimHint}:{store:ComposerStore;vimHint:string}){
    const editor:EditorState=React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
    const visual=composerDisplay(editor);
    return h(Ink.Box,{borderStyle:'single',flexDirection:'column'},
      h(Ink.Text,null,'> ',...visual.map((segment:any,index:number)=>h(Ink.Text,{key:index,inverse:segment.kind==='cursor'||segment.selected,dimColor:segment.kind==='paste'},segment.text))),
      vimHint?h(Ink.Text,{dimColor:true},vimHint):null,
      editor.text.includes('\n')?h(Ink.Text,{dimColor:true},'Shift+Enter / Ctrl+J newline · Enter send'):null
    );
  },(previous:any,next:any)=>previous.store===next.store&&previous.vimHint===next.vimHint);
  const CommandMenuView=React.memo(function CommandMenuView({composerStore,selectionStore,rowsLimit}:{composerStore:ComposerStore;selectionStore:CommandMenuSelectionStore;rowsLimit:number}){
    const editor:EditorState=React.useSyncExternalStore(composerStore.subscribe,composerStore.getSnapshot,composerStore.getSnapshot);
    const selection:SelectionState=React.useSyncExternalStore(selectionStore.subscribe,selectionStore.getSnapshot,selectionStore.getSnapshot);
    const rows=commandMenuItems(editor.text);
    const view=pickerWindow(rows,selection.selected,rowsLimit);
    return h(Ink.Box,{borderStyle:'single',flexDirection:'column'},
      h(Ink.Text,{bold:true},'Commands'),
      ...view.rows.map((row,index)=>{const absolute=view.start+index;return h(Ink.Text,{key:absolute+'-'+row.command.name,inverse:absolute===selection.selected,color:pickerColor},(absolute===selection.selected?'›':' ')+' /'+row.command.name+' · '+row.command.description);})
    );
  },(previous:any,next:any)=>previous.composerStore===next.composerStore&&previous.selectionStore===next.selectionStore&&previous.rowsLimit===next.rowsLimit);

  return function TuiApp(props:TuiAppProps){
    const {runtime,registry,catalog,invocation,projectRoot,paths,permissionRules,autoClassifier,initialPrompt,initialReasoningEffort=null,renderCoordinator,keymap:effectiveKeymap=KEYBINDINGS,terminalSize}=props;
    const inkApp=Ink.useApp();
    const stdout=Ink.useStdout?.().stdout??process.stdout;
    const baseModel=invocation.model??'openai:gpt-5-mini';
    const baseMode=(invocation.permissionMode??'default') as PermissionMode;
    const [state,setState]=React.useState(()=>initialTuiState({model:NO_PROVIDER_MODEL,permissionMode:baseMode}));
    const [appState,setAppState]=React.useState(()=>createTuiAppState());
    const composerStoreRef:{current:ComposerStore|null}=React.useRef(null);
    if(!composerStoreRef.current)composerStoreRef.current=createComposerStore(appState.editor);
    const composerStore:ComposerStore=composerStoreRef.current;
    const currentEditor=()=>composerStore.getSnapshot();
    const commandMenuSelectionStoreRef:{current:CommandMenuSelectionStore|null}=React.useRef(null);
    if(!commandMenuSelectionStoreRef.current)commandMenuSelectionStoreRef.current=createCommandMenuSelectionStore();
    const commandMenuSelectionStore:CommandMenuSelectionStore=commandMenuSelectionStoreRef.current;
    const [vim,setVim]=React.useState(()=>createVimState() as VimState);
    const [boot,setBoot]=React.useState(()=>createBootState(Date.now()) as BootState);
    const [history,setHistory]=React.useState([] as string[]);
    const historyIndexRef:{current:number}=React.useRef(-1);
    const reverseIndexRef:{current:number}=React.useRef(0);
    const [viewport,setViewport]=React.useState(()=>({offset:0,pageSize:12,unseen:0,followingTail:true}) as TranscriptViewport);
    const [pending,setPending]=React.useState(null as PendingTuiApproval|null);
    const [approvalExpanded,setApprovalExpanded]=React.useState(false);
    const [approvalScroll,setApprovalScroll]=React.useState(0);
    const [diff,setDiff]=React.useState('');
    const [pickerQuery,setPickerQuery]=React.useState('');
    const [pickerSelection,setPickerSelection]=React.useState(()=>({query:'',selected:0,pageSize:10}) as SelectionState);
    const [modelRows,setModelRows]=React.useState([] as TuiModel[]);
    const [providerRows,setProviderRows]=React.useState([] as TuiProvider[]);
    const [sessionRows,setSessionRows]=React.useState([] as any[]);
    const [agentRows,setAgentRows]=React.useState([] as AgentRosterRow[]);
    const [agentTreeOverlay,setAgentTreeOverlay]=React.useState(null as AgentTreeOverlayModel|null);
    const [providerStep,setProviderStep]=React.useState({kind:'list'} as ProviderStep);
    const [chosenProvider,setChosenProvider]=React.useState(null as string|null);
    const [selectionLoaded,setSelectionLoaded]=React.useState(false);
    const [modelList,setModelList]=React.useState({loading:false,verified:false,notice:'',label:''});
    const [providerSecret,setProviderSecret]=React.useState('');
    const [auxCompletions,setAuxCompletions]=React.useState([] as string[]);
    const [currentModelMeta,setCurrentModelMeta]=React.useState(null as TuiModel|null);
    const [reasoningEffort,setReasoningEffort]=React.useState(initialReasoningEffort as ReasoningEffort|null);
    const [modelEffortStep,setModelEffortStep]=React.useState(null as TuiModel|null);
    const [busySince,setBusySince]=React.useState(()=>Date.now());
    const [motionNow,setMotionNow]=React.useState(()=>Date.now());
    const [renderEpoch,setRenderEpoch]=React.useState(0);
    const [queuedActions,setQueuedActions]=React.useState([] as TuiQueuedAction[]);
    const [queueEditor,setQueueEditor]=React.useState(null as {selected:number;editing:boolean;draft:string}|null);
    const [transcriptSearch,setTranscriptSearch]=React.useState(null as TranscriptSearchState|null);
    const [transcriptSelectedId,setTranscriptSelectedId]=React.useState(null as string|null);
    const [transcriptRaw,setTranscriptRaw]=React.useState(false);
    const [trustCenter,setTrustCenter]=React.useState(null as TrustCenterModel|null);
    const [mcpCenter,setMcpCenter]=React.useState(null as McpCenterModel|null);
    const [hookCenter,setHookCenter]=React.useState(null as HookCenterModel|null);
    const [pluginCenter,setPluginCenter]=React.useState(null as PluginCenterModel|null);
    const [memoryCenter,setMemoryCenter]=React.useState(null as MemoryCenterModel|null);
    const [notesCenter,setNotesCenter]=React.useState(null as NotesCenterModel|null);
    const [tasksCenter,setTasksCenter]=React.useState(null as TasksCenterModel|null);
    const [libraryCenter,setLibraryCenter]=React.useState(null as LibraryCenterModel|null);
    const [researchCenter,setResearchCenter]=React.useState(null as ResearchCenterModel|null);
    const [automationCenter,setAutomationCenter]=React.useState(null as AutomationCenterModel|null);
    const [forgeCenter,setForgeCenter]=React.useState(null as ForgeCenterModel|null);
    const [contextStatus,setContextStatus]=React.useState(null as CliContextStatus|null);
    const [contextInspector,setContextInspector]=React.useState(null as CliContextStatus|null);
    const controllerRef=React.useRef(null as any);
    const modelPickerRef=React.useRef(null as ModelPickerModel|null);
    const providerPickerRef=React.useRef(null as ProviderPickerModel|null);
    const sessionPickerRef=React.useRef(null as SessionPickerModel|null);
    const mcpFacadeRef=React.useRef(null as ReturnType<typeof createMcpFacade>|null);
    const hookFacadeRef=React.useRef(null as ReturnType<typeof createHookFacade>|null);
    const pluginFacadeRef=React.useRef(null as ReturnType<typeof createPluginFacade>|null);
    const memoryFacadeRef=React.useRef(null as ReturnType<typeof createMemoryFacade>|null);
    const notesFacadeRef=React.useRef(null as ReturnType<typeof createNotesFacade>|null);
    const tasksFacadeRef=React.useRef(null as ReturnType<typeof createTaskBoardFacade>|null);
    const libraryFacadeRef=React.useRef(null as ReturnType<typeof createLibraryFacade>|null);
    const researchFacadeRef=React.useRef(null as ReturnType<typeof createResearchFacade>|null);
    const automationFacadeRef=React.useRef(null as ReturnType<typeof createAutomationFacade>|null);
    const forgeFacadeRef=React.useRef(null as ReturnType<typeof createForgeFacade>|null);
    const interruptRef=React.useRef(createInterruptController());
    const reasoningVisibleRef=React.useRef(appState.reasoningVisible);reasoningVisibleRef.current=appState.reasoningVisible;
    const renderCoordinatorRef=React.useRef(null as RenderCoordinator|null);
    if(!renderCoordinatorRef.current)renderCoordinatorRef.current=renderCoordinator??createRenderCoordinator();
    const coordinator:RenderCoordinator=renderCoordinatorRef.current;
    const visibleEpochRef=React.useRef(0);
    const eventSequenceRef=React.useRef(0);
    const onboardingShownRef=React.useRef(false);

    React.useEffect(()=>{
      const unsubscribe=coordinator.subscribe(batch=>setRenderEpoch(batch.epoch));
      return()=>{unsubscribe();if(!renderCoordinator)coordinator.dispose();};
    },[coordinator,renderCoordinator]);
    React.useLayoutEffect(()=>{
      if(renderEpoch<=visibleEpochRef.current)return;
      visibleEpochRef.current=renderEpoch;
      coordinator.markVisible(renderEpoch);
    },[coordinator,renderEpoch]);

    /* ⛔ Fails closed: a catalog that cannot answer is a send that does not happen. */
    const readinessFor=async(model:string):Promise<TuiReadiness>=>{
      if(typeof catalog?.readiness!=='function')return{ready:false,code:'PROVIDER_NOT_CHOSEN',provider:null,message:'Provider selection is unavailable here, so nothing was sent.'};
      try{return await catalog.readiness(model);}catch(error){return{ready:false,code:'PROVIDER_NOT_CHOSEN',provider:null,message:`Provider selection could not be checked (${errorCode(error)}), so nothing was sent.`};}
    };
    if(!controllerRef.current)controllerRef.current=createTuiSessionController({
      runtime,projectRoot,model:baseModel,mode:baseMode,rules:permissionRules??{allow:[],ask:[],deny:[]},paths,...(autoClassifier?{autoClassifier}:{}),readiness:readinessFor,
      onEvent:(event:any)=>{
        developmentLog('ui.runtime_event',event,event?.type==='run.failed'?'error':'debug','tui');
        const eventId=`runtime-${++eventSequenceRef.current}-${String(event.type)}`;
        coordinator.enqueueEvent(eventId,()=>{
          if(event.type==='run.started')setBusySince(Date.now());
          if(event.type==='run.completed'||event.type==='run.failed'||event.type==='run.cancelled')interruptRef.current.reset();
          if(transcriptEventAddsItem(event)&&(event.type!=='reasoning.started'||reasoningVisibleRef.current))setViewport((view:TranscriptViewport)=>reduceViewport(view,'new-content',0));
          setState((current:TuiState)=>reduceTuiEvent(current,event));
        });
      },
      onApproval:(next:PendingTuiApproval|null)=>{developmentLog('ui.approval',{requestId:next?.requestId??null,action:next?.action??null,reason:next?.reason??null},'info','tui');return coordinator.immediate('approval',()=>{
        if(next)setTranscriptSearch(null);
        setPending(next);setApprovalExpanded(false);setApprovalScroll(0);
        setAppState((current:TuiAppState)=>next?openOverlay(current,{kind:'approval',requestId:next.requestId}):(current.overlay?.kind==='approval'?closeOverlay(current):current));
      });},
      onQueueChange:(next:readonly TuiQueuedAction[])=>{developmentLog('ui.queue',{count:next.length,kinds:next.map(row=>row.kind)},'debug','tui');return coordinator.enqueueEvent(`queue-${++eventSequenceRef.current}`,()=>setQueuedActions([...next]));},
      onQueueRestored:(next:readonly TuiQueueEntry[])=>coordinator.enqueueEvent(`queue-restored-${++eventSequenceRef.current}`,()=>{setQueueEditor({selected:0,editing:false,draft:''});setState((current:TuiState)=>localMessage(current,`Restored ${next.length} queued item${next.length===1?'':'s'} in PAUSED state. Review with /queue; nothing will run until you explicitly resume it.`));}),
      onQueuedDispatch:(action:TuiQueuedAction)=>coordinator.enqueueEvent(`queue-dispatch-${++eventSequenceRef.current}`,()=>{setViewport((view:TranscriptViewport)=>reduceViewport(view,'new-content',0));setState((current:TuiState)=>userMessage(current,action.kind==='command'?`!${action.text}`:action.text));}),
      onSteerState:(next:TuiSteerState)=>coordinator.enqueueEvent(`steer-${++eventSequenceRef.current}-${next.status}`,()=>setState((current:TuiState)=>localMessage(current,
        next.status==='requested'?'Steering requested — waiting for the next safe boundary.'
        :next.status==='applied'?'Steered at safe boundary.'
        :next.status==='cancelled'?'Steering cancelled.'
        :next.status==='failed'?`Steering failed (${next.code}): ${next.message}`
        :`Steering rejected (${next.code}): ${next.message}`
      ))),
      onError:(error:unknown)=>{developmentLogError('ui.error',error,{},'tui');return coordinator.enqueueEvent(`error-${++eventSequenceRef.current}`,()=>setState((current:TuiState)=>localMessage(current,`Error: ${error instanceof Error?error.message:String(error)}`)));},
    });
    const controller=controllerRef.current;

    React.useEffect(()=>{developmentLog('ui.state',{focus:appState.focus.current,overlay:appState.overlay?.kind??null,running:state.running,sessionId:state.sessionId,model:state.status.model,permissionMode:state.status.permissionMode,queueCount:queuedActions.length},'debug','tui');},[appState.focus.current,appState.overlay?.kind,state.running,state.sessionId,state.status.model,state.status.permissionMode,queuedActions.length]);

    async function refreshContextStatus(){
      const id=state.sessionId??controller.current?.()??null;
      if(!id||typeof runtime.contextStatus!=='function'){setContextStatus(null);return null;}
      try{const next=await runtime.contextStatus(id);setContextStatus(next);return next;}catch{setContextStatus(null);return null;}
    }
    React.useEffect(()=>{void refreshContextStatus();},[state.sessionId,state.running]);

    async function refreshAgentRows(){
      try{
        const tree=await controller.agentTree();
        const rows=agentRosterRows(tree);
        setAgentRows(rows);
        setAgentTreeOverlay((current:AgentTreeOverlayModel|null)=>{
          if(!current)return current;
          const selectedId=selectedAgentRow(current)?.id??tree?.focusId??null;
          return createAgentTreeOverlayModel(rows,selectedId);
        });
      }catch{/* Agent roster is read-only chrome; runtime errors remain on the primary session path. */}
    }
    React.useEffect(()=>{void refreshAgentRows();},[state.sessionId,state.running,state.tools.length,state.messages.length]);

    React.useEffect(()=>{
      let alive=true;
      /* B1 slice 18: a prompt given on the command line waits in the composer when no provider, model or key is ready. */
      void (initialPrompt?.trim()?readinessFor(controller.model()):Promise.resolve(null)).then((readiness:TuiReadiness|null)=>{
        const prompt=readiness&&!readiness.ready?undefined:initialPrompt;
        return controller.initialize({resume:invocation.resume,fork:invocation.fork,initialPrompt:prompt}).then((id:string|null)=>{
        if(!alive)return;
        if(prompt?.trim())setState((current:TuiState)=>({...userMessage(current,prompt.trim(),`user-${Date.now()}`),sessionId:id??current.sessionId}));
        if(readiness&&!readiness.ready){const editor=replaceEditorText(currentEditor(),String(initialPrompt).trim());composerStore.replace(editor);setAppState((current:TuiAppState)=>({...current,editor}));setState((current:TuiState)=>localMessage(current,readiness.message));}
        setBoot((current:BootState)=>markBootReady(current,Date.now()));
        void refreshAgentRows();
      });}).catch((error:unknown)=>{if(alive){setBoot((current:BootState)=>markBootError(current));setState((current:TuiState)=>localMessage(current,`Error: ${error instanceof Error?error.message:String(error)}`));}});
      void refreshSelection(()=>alive);
      return()=>{alive=false;controller.close();};
    },[]);

    const updateEditor=(fn:(editor:EditorState)=>EditorState)=>{const editor=composerStore.update(fn);setAppState((current:TuiAppState)=>current.editor===editor?current:{...current,editor});return editor;};
    const setEditorText=(text:string)=>updateEditor(editor=>replaceEditorText(editor,text));
    const addLocal=(text:string)=>setState((current:TuiState)=>localMessage(current,text));
    const transcriptItemsForCurrentView=():TranscriptItem[]=>appState.reasoningVisible?(state.transcript.items as TranscriptItem[]):(state.transcript.items as TranscriptItem[]).filter((item:TranscriptItem)=>item.kind!=='reasoning');
    const transcriptItemForSelection=(preferred:string|null=transcriptSelectedId)=>{
      const items=transcriptItemsForCurrentView();
      return items.find((item:TranscriptItem)=>item.id===preferred)??items.at(-1)??null;
    };
    const jumpTranscriptItem=(itemId:string)=>{
      const items=transcriptItemsForCurrentView(),index=items.findIndex((item:TranscriptItem)=>item.id===itemId);if(index<0)return;
      setTranscriptSelectedId(itemId);setViewport((view:TranscriptViewport)=>transcriptViewportForIndex(view,items.length,index));
    };
    const copyTranscriptItem=(preferred:string|null=transcriptSelectedId)=>{
      const item=transcriptItemForSelection(preferred);
      if(!item){setTranscriptSearch((current:TranscriptSearchState|null)=>current?{...current,notice:'Nothing selected to copy.'}:{...createTranscriptSearchState(null),raw:transcriptRaw,notice:'Nothing selected to copy.'});return;}
      try{
        const text=transcriptRaw?transcriptItemRaw(item):transcriptItemText(item);
        const sequence=osc52CopySequence(text);stdout.write(sequence);setTranscriptSelectedId(item.id);
        setTranscriptSearch((current:TranscriptSearchState|null)=>current?{...current,selectedId:item.id,raw:transcriptRaw,notice:'Copy requested through the terminal clipboard (OSC 52).'}:{...createTranscriptSearchState(item.id),raw:transcriptRaw,notice:'Copy requested through the terminal clipboard (OSC 52).'});
      }catch(error){const message=error instanceof Error?error.message:String(error);setTranscriptSearch((current:TranscriptSearchState|null)=>current?{...current,notice:'Copy failed: '+message}:{...createTranscriptSearchState(item.id),raw:transcriptRaw,notice:'Copy failed: '+message});}
    };
    const openTranscriptSearch=()=>{
      const item=transcriptItemForSelection();
      const selectedId=item?.id??null;if(selectedId)setTranscriptSelectedId(selectedId);
      setTranscriptSearch({...createTranscriptSearchState(selectedId),raw:transcriptRaw});
    };
    const showModel=(provider:string|null,model:string)=>setState((current:TuiState)=>({...current,status:{...current.status,model:!provider?NO_PROVIDER_MODEL:providerOfModel(model)===provider?model:NO_MODEL}}));
    async function refreshSelection(isAlive:()=>boolean=()=>true){
      try{
        const id=typeof catalog?.chosenProvider==='function'?await catalog.chosenProvider():null;if(!isAlive())return;
        setChosenProvider(id);const model=controller.model();showModel(id,model);
        if(id&&providerOfModel(model)===id){
          const rows=await catalog.listModels({provider:id});if(!isAlive())return;
          setCurrentModelMeta(rows.find(row=>row.id===model)??null);
        }else setCurrentModelMeta(null);
      }catch{if(isAlive())setCurrentModelMeta(null);}
      finally{if(isAlive())setSelectionLoaded(true);}
    }
    React.useEffect(()=>{
      if(!selectionLoaded||onboardingShownRef.current)return;
      const steps=onboardingSteps({projectTrusted:true,providerConfigured:Boolean(chosenProvider),modelConfigured:Boolean(chosenProvider&&providerOfModel(controller.model())===chosenProvider)});
      if(!steps.length)return;
      onboardingShownRef.current=true;
      setState((current:TuiState)=>localMessage(current,['Setup:',...steps.map(step=>'• '+step.text+' '+step.command)].join('\n')));
    },[selectionLoaded,chosenProvider,currentModelMeta]);
    const closeCurrentOverlay=()=>{setTrustCenter(null);setMcpCenter(null);setHookCenter(null);setPluginCenter(null);setMemoryCenter(null);setNotesCenter(null);setTasksCenter(null);setLibraryCenter(null);setProviderSecret('');setProviderStep({kind:'list'});setModelEffortStep(null);setPickerQuery('');setPickerSelection({query:'',selected:0,pageSize:10});setAppState((current:TuiAppState)=>closeOverlay(current));};
    const applyOverlay=(overlay:Exclude<OverlayState,null>)=>setAppState((current:TuiAppState)=>openOverlay(current,overlay));

    /* B1 slice 18: the models of the chosen provider only; with none chosen, /provider opens first and comes back here. */
    const loadModels=async(provider?:string)=>{
      const target=provider??chosenProvider;
      if(!target){await loadProviders();return;}
      applyOverlay({kind:'model',provider:target});setModelEffortStep(null);setPickerQuery('');setPickerSelection({query:'',selected:0,pageSize:10});setModelRows([]);setModelList({loading:true,verified:false,notice:'Loading the live model list…',label:target});
      modelPickerRef.current?.cancel();
      const model=createModelPickerModel(catalog,{provider:target});modelPickerRef.current=model;
      try{await model.open();if(modelPickerRef.current!==model)return;setModelRows([...model.rows()]);setModelList({loading:false,verified:model.verified(),notice:model.notice(),label:model.label()});}catch(error){addLocal(`Model picker failed: ${errorCode(error)}`);}
    };
    const chooseProviderAndOpenModels=async(row:TuiProvider)=>{
      try{await catalog.chooseProvider(row.id);}catch(error){addLocal(`The provider choice could not be saved (${errorCode(error)}).`);return;}
      setChosenProvider(row.id);showModel(row.id,controller.model());
      setProviderStep({kind:'list'});setProviderSecret('');setAppState((current:TuiAppState)=>closeOverlay(current));
      await loadModels(row.id);
    };
    const loadProviders=async()=>{
      applyOverlay({kind:'provider'});setPickerQuery('');setPickerSelection({query:'',selected:0,pageSize:10});setProviderStep({kind:'list'});setProviderSecret('');
      const model=createProviderPickerModel(catalog);providerPickerRef.current=model;
      try{await model.open();setProviderRows([...model.rows()]);}catch(error){addLocal(`Provider picker failed: ${error instanceof Error?error.message:String(error)}`);}
    };
    const routeProviderSelection=async(row:TuiProvider,{allowEnvironmentConsent=true}:{allowEnvironmentConsent?:boolean}={})=>{
      const originalIndex=providerRows.findIndex((provider:TuiProvider)=>provider.id===row.id);
      if(originalIndex>=0)providerPickerRef.current?.select(originalIndex);
      if(allowEnvironmentConsent){
        const preliminary=providerPickerEnter({selectedProvider:row.id,configured:row.configured,requiresKey:row.requiresKey,keySource:row.keySource});
        if(preliminary.kind==='environment-consent'){setProviderStep({kind:'consent',provider:row,choice:'no'});return;}
      }
      let probe:TuiProviderProbe|null=null;
      try{probe=await providerPickerRef.current?.probeSelected()??await catalog.probeProvider(row.id);}
      catch(error){addLocal(`${row.label} health check failed (${errorCode(error)}); nothing was changed.`);return;}
      const next=providerPickerEnter({selectedProvider:row.id,configured:row.configured,requiresKey:row.requiresKey,keySource:row.keySource,probe});
      if(next.kind==='provider-setup'){setProviderSecret('');setProviderStep({kind:'key',provider:row,testing:false,result:null,...(next.remediation?{remediation:next.remediation}:{})});return;}
      if(next.kind==='provider-remediation'){addLocal(next.remediation?.message||probe?.detail||`${row.label} is not ready.`);return;}
      if(next.kind==='environment-consent'){setProviderStep({kind:'consent',provider:row,choice:'no'});return;}
      if(next.remediation&&next.remediation.code!=='none')addLocal(next.remediation.message);
      await chooseProviderAndOpenModels(row);
    };
    const loadSessions=async(action:'resume'|'fork')=>{
      applyOverlay({kind:'session',action});setPickerQuery('');setPickerSelection({query:'',selected:0,pageSize:10});
      const model=createSessionPickerModel(controller,action,{metadataRoot:sessionMetadataRoot(paths.dataRoot)});sessionPickerRef.current=model;
      try{await model.open();setSessionRows([...model.rows()]);}catch(error){addLocal(`Session picker failed: ${error instanceof Error?error.message:String(error)}`);}
    };
    const loadTrustCenter=async()=>{
      try{
        const snapshot=await createTrustAuthority({projectRoot,trustRoot:paths.trust.projects}).inspect();
        setTrustCenter(trustCenterModel(snapshot,{permissionMode:controller.mode()}));
      }catch(error){addLocal(`Trust center failed: ${error instanceof Error?error.message:String(error)}`);}
    };
    const mcpFacade=():ReturnType<typeof createMcpFacade>=>mcpFacadeRef.current??=(createMcpFacade({projectRoot,paths}));
    const loadMcpCenter=async(selectedId?:string)=>{
      try{
        const rows=await mcpFacade().list();
        const selected=selectedId?Math.max(0,rows.findIndex(row=>row.id===selectedId)):mcpCenter?.selected??0;
        setMcpCenter(createMcpCenterModel(rows,selected));
      }catch(error){addLocal('MCP center failed: '+(error instanceof Error?error.message:String(error)));}
    };
    const actOnMcpCenter=async(action:'probe'|'trust'|'untrust')=>{
      const row=mcpCenter?selectedMcpServer(mcpCenter):null;if(!row)return;
      try{
        if(action==='probe'){
          const measured=await mcpFacade().probe(row.id);
          setMcpCenter((current:McpCenterModel|null)=>current?replaceMcpCenterRow(current,measured):current);
          return;
        }
        if(action==='trust')await mcpFacade().trust(row.id);else await mcpFacade().untrust(row.id);
        await loadMcpCenter(row.id);
      }catch(error){addLocal('MCP '+action+' failed: '+(error instanceof Error?error.message:String(error)));}
    };
    const hookFacade=():ReturnType<typeof createHookFacade>=>hookFacadeRef.current??=(createHookFacade({projectRoot,paths}));
    const loadHookCenter=async(selectedId?:string)=>{
      try{
        const rows=await hookFacade().list();
        const found=selectedId?rows.findIndex(row=>row.id===selectedId):-1;
        const selected=found>=0?found:hookCenter?.selected??0;
        setHookCenter(createHookCenterModel(rows,selected));
      }catch(error){addLocal('Hook center failed: '+(error instanceof Error?error.message:String(error)));}
    };
    const actOnHookCenter=async(action:'dry-run'|'trust'|'untrust'|'toggle-quarantine')=>{
      const row=hookCenter?selectedHook(hookCenter):null;if(!row)return;
      try{
        if(action==='dry-run'){
          if(state.running){addLocal('Finish or cancel the active run before executing a hook dry-run.');return;}
          const eventType=row.events[0];if(!eventType){addLocal('This hook declares no event that can be dry-run.');return;}
          const result=await hookFacade().dryRun(row.id,{eventType});
          setHookCenter((current:HookCenterModel|null)=>current?replaceHookCenterRow(current,{...row,lastDryRun:result}):current);
          return;
        }
        if(action==='trust')await hookFacade().trust(row.id);
        else if(action==='untrust')await hookFacade().untrust(row.id);
        else if(row.quarantine.active)await hookFacade().releaseQuarantine(row.id);
        else await hookFacade().quarantine(row.id,'manual quarantine from Hook Center');
        await loadHookCenter(row.id);
      }catch(error){addLocal('Hook '+action+' failed: '+(error instanceof Error?error.message:String(error)));}
    };
    const pluginFacade=():ReturnType<typeof createPluginFacade>=>pluginFacadeRef.current??=(createPluginFacade({projectRoot,paths}));
    const loadPluginCenter=async(selectedId?:string)=>{
      try{
        const rows=await pluginFacade().list();
        const found=selectedId?rows.findIndex(row=>row.id===selectedId):-1;
        const selected=found>=0?found:pluginCenter?.selected??0;
        setPluginCenter(createPluginCenterModel(rows,selected));
      }catch(error){addLocal('Plugin Center failed: '+(error instanceof Error?error.message:String(error)));}
    };
    const actOnPluginCenter=async(action:'trust'|'untrust'|'toggle-quarantine')=>{
      const row=pluginCenter?selectedPlugin(pluginCenter):null;if(!row)return;
      try{
        if(action==='trust')await pluginFacade().trust(row.id);
        else if(action==='untrust')await pluginFacade().untrust(row.id);
        else if(row.quarantine.active)await pluginFacade().releaseQuarantine(row.id);
        else await pluginFacade().quarantine(row.id,'manual quarantine from Plugin Center');
        await loadPluginCenter(row.id);
      }catch(error){addLocal('Plugin '+action+' failed: '+(error instanceof Error?error.message:String(error)));}
    };
    const memoryFacade=():ReturnType<typeof createMemoryFacade>=>memoryFacadeRef.current??=(createMemoryFacade({projectRoot,paths}));
    const loadMemoryCenter=async(query?:string,selectedId?:string)=>{
      try{
        const snapshot=query===undefined?await memoryFacade().list():await memoryFacade().search(query);
        const found=selectedId?snapshot.rows.findIndex(row=>row.id===selectedId):-1;
        const selected=found>=0?found:memoryCenter?.selected??0;
        setMemoryCenter(createMemoryCenterModel(snapshot,selected));
      }catch(error){addLocal('Memory Center failed: '+(error instanceof Error?error.message:String(error)));}
    };
    const notesFacade=():ReturnType<typeof createNotesFacade>=>notesFacadeRef.current??=(createNotesFacade({projectRoot,paths}));
    const loadNotesCenter=async(selectedId?:string)=>{
      try{
        const snapshot=await notesFacade().list();
        const found=selectedId?snapshot.rows.findIndex(row=>row.id===selectedId):-1;
        const selected=found>=0?found:notesCenter?.selected??0;
        setNotesCenter(createNotesCenterModel(snapshot,selected));
      }catch(error){addLocal('Notes Center failed: '+(error instanceof Error?error.message:String(error)));}
    };
    const tasksFacade=():ReturnType<typeof createTaskBoardFacade>=>tasksFacadeRef.current??=(createTaskBoardFacade({projectRoot,paths}));
    const loadTasksCenter=async(selectedId?:string)=>{
      try{
        const snapshot=await tasksFacade().list();
        const found=selectedId?snapshot.rows.findIndex(row=>row.id===selectedId):-1;
        const selected=found>=0?found:tasksCenter?.selected??0;
        setTasksCenter(createTasksCenterModel(snapshot,selected));
      }catch(error){addLocal('Task Board failed: '+(error instanceof Error?error.message:String(error)));}
    };
    const libraryFacade=():ReturnType<typeof createLibraryFacade>=>libraryFacadeRef.current??=(createLibraryFacade({projectRoot,paths}));
    const loadLibraryCenter=async(selectedId?:string)=>{
      try{
        const snapshot=await libraryFacade().list();
        const found=selectedId?snapshot.rows.findIndex(row=>row.id===selectedId):-1;
        const selected=found>=0?found:libraryCenter?.selected??0;
        setLibraryCenter(createLibraryCenterModel(snapshot,selected));
      }catch(error){addLocal('Library Center failed: '+(error instanceof Error?error.message:String(error)));}
    };
    const forgeFacade=():ReturnType<typeof createForgeFacade>=>forgeFacadeRef.current??=createForgeFacade({forgeRoot:join(paths.dataRoot,'forge')},{registry});
    const loadForgeCenter=async(selectedId?:string)=>{
      try{const snapshot=await forgeFacade().list();const found=selectedId?snapshot.rows.findIndex(row=>row.id===selectedId):-1;const selected=found>=0?found:forgeCenter?.selected??0;const base=createForgeCenterModel(snapshot,selected);setForgeCenter(base);const row=snapshot.rows[selected];if(row){const detail=await forgeFacade().read(row.id);setForgeCenter((current:ForgeCenterModel|null)=>current?setForgeCenterDetail(current,detail):current);}}
      catch(error){addLocal('Forge Center failed: '+(error instanceof Error?error.message:String(error)));}
    };
    const automationFacade=():ReturnType<typeof createAutomationFacade>=>automationFacadeRef.current??=createAutomationFacade({projectRoot,dataRoot:paths.dataRoot});
    const loadAutomationCenter=async(selectedId?:string)=>{
      try{const snapshot=await automationFacade().list();const found=selectedId?snapshot.rows.findIndex(row=>row.id===selectedId):-1;const selected=found>=0?found:automationCenter?.selected??0;const base=createAutomationCenterModel(snapshot,selected);setAutomationCenter(base);const row=snapshot.rows[selected];if(row){const detail=await automationFacade().read(row.id);setAutomationCenter((current:AutomationCenterModel|null)=>current?setAutomationCenterDetail(current,detail):current);}}
      catch(error){addLocal('Automation Center failed: '+(error instanceof Error?error.message:String(error)));}
    };
    const researchFacade=():ReturnType<typeof createResearchFacade>=>researchFacadeRef.current??=createResearchFacade({projectRoot},{registry});
    const loadResearchCenter=async(selectedId?:string)=>{
      try{
        const snapshot=await researchFacade().list();const found=selectedId?snapshot.rows.findIndex(row=>row.id===selectedId):-1;const selected=found>=0?found:researchCenter?.selected??0;const base=createResearchCenterModel(snapshot,selected);setResearchCenter(base);
        const row=snapshot.rows[selected];if(row){const detail=await researchFacade().read(row.id);setResearchCenter((current:ResearchCenterModel|null)=>current?setResearchCenterDetail(current,detail):current);}
      }catch(error){addLocal('Research Center failed: '+(error instanceof Error?error.message:String(error)));}
    };

    const applyConfiguredReasoningDefault=(row:TuiModel|null)=>{
      const supported=Boolean(reasoningEffort&&row?.reasoning===true&&row.reasoningEfforts?.includes(reasoningEffort));
      if(typeof runtime.setDefaultReasoningEffort==='function')runtime.setDefaultReasoningEffort(supported?reasoningEffort:null);
      if(reasoningEffort&&!supported){setReasoningEffort(null);addLocal(`Configured reasoning effort "${reasoningEffort}" is not affirmed for ${row?.id??controller.model()}; using model default in this process.`);}
    };

    const executeSlash=async(text:string)=>{
      const parsed=parseSlashCommand(text);setAuxCompletions([]);
      if(!SLASH_COMMANDS.some(command=>command.name===parsed.name)){addLocal(`Unknown /${parsed.name}${parsed.suggestions.length?`. Did you mean ${parsed.suggestions.map(value=>`/${value}`).join(', ')}?`:''}`);return;}
      const intent=slashCommandIntent(text);
      if(intent?.kind==='open-overlay'){
        if(intent.overlay.kind==='model'){await loadModels(intent.overlay.provider);return;}
        if(intent.overlay.kind==='provider'){await loadProviders();return;}
        if(intent.overlay.kind==='session'){await loadSessions(intent.overlay.action);return;}
        applyOverlay(intent.overlay);return;
      }
      if(intent?.kind==='key-action'){setAppState((current:TuiAppState)=>reduceAppAction(current,{type:'key-action',action:intent.action}));return;}
      if(intent?.kind==='select-model'){
        if(!MODEL_ID.test(intent.id)){addLocal('Usage: /model provider:model');return;}
        const providerId=providerOfModel(intent.id);
        try{
          const row=(await catalog.listProviders()).find((entry:TuiProvider)=>entry.id===providerId);
          if(!row){addLocal(`${providerId} is not a provider TALOS can send to. Choose one with /provider.`);return;}
          if(!row.configured){
            if(row.requiresKey){const refusal=unusableKeyRefusal(row.label,row.benched);addLocal(refusal.message);}
            else addLocal(`Configure ${row.label} with /provider before selecting one of its models.`);
            return;
          }
          const probe=await catalog.probeProvider(row.id);
          if(probe.readinessCode){addLocal(probe.remediation?.message||probe.detail||`${row.label} is not ready.`);return;}
          if(probe.remediation&&probe.remediation.code!=='none')addLocal(probe.remediation.message);
          if(chosenProvider!==row.id){await catalog.chooseProvider(row.id);setChosenProvider(row.id);}
        }catch(error){addLocal(`Model change failed: ${errorCode(error)}`);return;}
        try{await selectExplicitModel(intent.id,catalog,(id:string)=>controller.setModel(id));setState((current:TuiState)=>localMessage({...current,status:{...current.status,model:intent.id}},`Model changed to ${intent.id} for subsequent runs.`));const rows=await catalog.listModels({provider:providerId??undefined});const meta=rows.find(row=>row.id===intent.id)??null;setCurrentModelMeta(meta);applyConfiguredReasoningDefault(meta);}catch(error){addLocal(`Model change failed: ${error instanceof Error?error.message:String(error)}`);}return;
      }
      if(intent?.kind==='session-id'){
        try{const id=intent.action==='resume'?await controller.resumeSession(intent.id):await controller.forkSession(intent.id);addLocal(intent.action==='resume'?`Attached to ${id}`:`Forked ${intent.id} → ${id}`);}catch(error){addLocal(`${intent.action==='resume'?'Resume':'Fork'} failed: ${error instanceof Error?error.message:String(error)}`);}return;
      }
      if(parsed.name==='forge'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'||operation==='inspect'){const id=operation==='inspect'?parsed.args[1]:undefined;if(operation==='inspect'&&!id){addLocal('Usage: /forge inspect <tool-id>');return;}await loadForgeCenter(id);return;}
        if(operation==='enable'||operation==='disable'){const id=parsed.args[1],ownerSessionId=state.sessionId;if(!id||!ownerSessionId){addLocal('Forge enable/disable needs an active owner session and tool id.');return;}try{await forgeFacade().setEnabled(ownerSessionId,id,operation==='enable');await loadForgeCenter(id);}catch(error){addLocal('/forge '+operation+' failed: '+(error instanceof Error?error.message:String(error)));}return;}
        if(operation==='rollback'){const id=parsed.args[1],revision=Number(parsed.args[2]),ownerSessionId=state.sessionId;if(!id||!Number.isSafeInteger(revision)||revision<1||!ownerSessionId){addLocal('Usage: /forge rollback <tool-id> <revision> (with an active owner session)');return;}try{await forgeFacade().rollback(ownerSessionId,id,revision);await loadForgeCenter(id);}catch(error){addLocal('/forge rollback failed: '+(error instanceof Error?error.message:String(error)));}return;}
        if(!['validate','scan','simulate','install','versions'].includes(operation)){addLocal('Usage: /forge [list|inspect|validate|scan|simulate|install|versions|rollback|enable|disable] [args...]');return;}
      }
      if(parsed.name==='automations'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'||operation==='read'||operation==='dry-run'||operation==='history'){
          const id=operation==='list'?undefined:parsed.args[1];if(operation!=='list'&&!id){addLocal('Usage: /automations '+operation+' <automation-id>');return;}await loadAutomationCenter(id);return;
        }
        if(operation==='health'){try{const health=await automationFacade().health();addLocal('Automation runner: '+health.state);}catch(error){addLocal('/automations health failed: '+(error instanceof Error?error.message:String(error)));}return;}
        if(!['add','enable','disable','delete','run','serve','schedule','install-runner','uninstall-runner'].includes(operation)){addLocal('Usage: /automations [list|read|dry-run|history|health|schedule|add|enable|disable|delete|run] [args...]');return;}
      }
      if(parsed.name==='research'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'||operation==='read'){
          const id=operation==='read'?parsed.args[1]:undefined;if(operation==='list'&&parsed.args.length>1){addLocal('Usage: /research [list|read|pause|resume|cancel|export|start|rename|delete] [args...]');return;}if(operation==='read'&&(!id||parsed.args.length!==2)){addLocal('Usage: /research read <research-id>');return;}await loadResearchCenter(id);return;
        }
        if(operation==='pause'||operation==='resume'||operation==='cancel'){
          const id=parsed.args[1];if(!id||parsed.args.length!==2){addLocal('Usage: /research '+operation+' <research-id>');return;}const ownerSessionId=state.sessionId??id;
          try{if(operation==='pause')await researchFacade().pause(ownerSessionId,id);else if(operation==='resume')await researchFacade().resume(ownerSessionId,id);else await researchFacade().cancel(ownerSessionId,id);await loadResearchCenter(id);}catch(error){addLocal('/research '+operation+' failed: '+(error instanceof Error?error.message:String(error)));}return;
        }
        if(operation==='export'){
          const id=parsed.args[1],format=(parsed.args[2]??'md') as ResearchExportFormat,out=parsed.args[3];if(!id||parsed.args.length>4){addLocal('Usage: /research export <research-id> [md|json|bib|ris|fonti|html|pdf|docx] [output]');return;}
          try{const result=await researchFacade().exportFile(id,format,out);addLocal('Research exported: '+result.path);}catch(error){addLocal('/research export failed: '+(error instanceof Error?error.message:String(error)));}return;
        }
        if(!['start','rename','delete'].includes(operation)){addLocal('Usage: /research [list|read|pause|resume|cancel|export|start|rename|delete] [args...]');return;}
        /* start/rename/delete keep the existing child-CLI behavior; live controls above never cross the process boundary. */
      }
      if(parsed.name==='library'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'){
          if(parsed.args.length>1){addLocal('Usage: /library [list|search|read|preview|duplicates|context-ref|import|export|rename|delete] [args...]');return;}
          await loadLibraryCenter();return;
        }
        if(!['search','read','preview','duplicates','context-ref','import','export','rename','delete'].includes(operation)){addLocal('Usage: /library [list|search|read|preview|duplicates|context-ref|import|export|rename|delete] [args...]');return;}
        /* non-list operations continue through the child CLI; runLibraryCommand uses this same facade. */
      }
      if(parsed.name==='tasks'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'){
          if(parsed.args.length>1){addLocal('Usage: /tasks [list|add|update|complete|delete|depend|undepend|evidence|unevidence|assign|unassign|schedule|unschedule] [args...]');return;}
          await loadTasksCenter();return;
        }
        if(['depend','undepend','evidence','unevidence','assign','unassign','schedule','unschedule'].includes(operation)){
          const taskId=parsed.args[1],targetId=parsed.args[2];
          if(parsed.args.length!==3||!taskId||!targetId){addLocal('Usage: /tasks '+operation+' <task-id> <target-id>');return;}
          try{
            if(operation==='depend')await tasksFacade().depend(taskId,targetId);
            else if(operation==='undepend')await tasksFacade().undepend(taskId,targetId);
            else if(operation==='evidence')await tasksFacade().addEvidence(taskId,targetId);
            else if(operation==='unevidence')await tasksFacade().removeEvidence(taskId,targetId);
            else if(operation==='assign')await tasksFacade().assignAgent(taskId,targetId);
            else if(operation==='unassign')await tasksFacade().unassignAgent(taskId,targetId);
            else if(operation==='schedule')await tasksFacade().attachSchedule(taskId,targetId);
            else await tasksFacade().detachSchedule(taskId,targetId);
            await loadTasksCenter(taskId);
          }catch(error){addLocal('/tasks '+operation+' failed: '+(error instanceof Error?error.message:String(error)));}
          return;
        }
        if(!['add','update','complete','delete'].includes(operation)){addLocal('Usage: /tasks [list|add|update|complete|delete|depend|undepend|evidence|unevidence|assign|unassign|schedule|unschedule] [args...]');return;}
        /* add/update/complete/delete deliberately continue through the child CLI; runTasksCommand uses this same facade. */
      }
      if(parsed.name==='notes'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'){
          if(parsed.args.length>1){addLocal('Usage: /notes [list|add|update|delete|link|unlink] [args...]');return;}
          await loadNotesCenter();return;
        }
        if(operation==='link'||operation==='unlink'){
          const noteId=parsed.args[1],targetKind=parsed.args[2],targetId=parsed.args[3];
          if(parsed.args.length!==4||!noteId||!targetKind||!targetId||!['session','task','research'].includes(targetKind)){addLocal('Usage: /notes '+operation+' <note-id> <session|task|research> <target-id>');return;}
          try{
            if(operation==='link')await notesFacade().link(noteId,targetKind as NoteTargetKind,targetId);else await notesFacade().unlink(noteId,targetKind as NoteTargetKind,targetId);
            await loadNotesCenter(noteId);
          }catch(error){addLocal('/notes '+operation+' failed: '+(error instanceof Error?error.message:String(error)));}
          return;
        }
        if(!['add','update','delete'].includes(operation)){addLocal('Usage: /notes [list|add|update|delete|link|unlink] [args...]');return;}
        /* add/update/delete deliberately continue through the existing child CLI path; runNotesCommand uses this same facade. */
      }
      if(parsed.name==='memory'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'){
          if(parsed.args.length>1){addLocal('Usage: /memory [list|search <query>|add|update|delete]');return;}
          await loadMemoryCenter();return;
        }
        if(operation==='search'){
          const query=parsed.args.slice(1).join(' ').trim();
          if(!query){addLocal('Usage: /memory search <query>');return;}
          await loadMemoryCenter(query);return;
        }
        /* add/update/delete deliberately continue through the existing child CLI path; that command now uses this same facade. */
      }
      if(parsed.name==='mcp'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'){
          if(parsed.args.length>1){addLocal('Usage: /mcp [list|test|trust|untrust] [server-id]');return;}
          await loadMcpCenter();return;
        }
        if(!['test','trust','untrust'].includes(operation)||parsed.args.length!==2){addLocal('Usage: /mcp [list|test|trust|untrust] [server-id]');return;}
        const serverId=parsed.args[1]!;
        try{
          if(operation==='test'){
            const measured=await mcpFacade().probe(serverId);
            const rows=await mcpFacade().list();
            const selected=Math.max(0,rows.findIndex(row=>row.id===serverId));
            setMcpCenter(replaceMcpCenterRow(createMcpCenterModel(rows,selected),measured));
          }else{
            if(operation==='trust')await mcpFacade().trust(serverId);else await mcpFacade().untrust(serverId);
            await loadMcpCenter(serverId);
          }
        }catch(error){addLocal('/mcp '+operation+' failed: '+(error instanceof Error?error.message:String(error)));}
        return;
      }
      if(parsed.name==='hooks'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'){
          if(parsed.args.length>1){addLocal('Usage: /hooks [list|dry-run|history|trust|untrust|quarantine|release] [hook-id] [args...]');return;}
          await loadHookCenter();return;
        }
        const hookId=parsed.args[1];
        if(!hookId){addLocal('Usage: /hooks [list|dry-run|history|trust|untrust|quarantine|release] [hook-id] [args...]');return;}
        try{
          if(operation==='history'){
            if(parsed.args.length>3){addLocal('Usage: /hooks history <hook-id> [limit]');return;}
            const rawLimit=parsed.args[2];let limit=8;
            if(rawLimit!==undefined){limit=Number(rawLimit);if(!Number.isSafeInteger(limit)||limit<1||limit>50){addLocal('Hook history limit must be an integer from 1 to 50.');return;}}
            const [history,rows]=await Promise.all([hookFacade().history(hookId,{limit}),hookFacade().list()]);
            const selected=Math.max(0,rows.findIndex(row=>row.id===hookId));const base=createHookCenterModel(rows,selected);const row=selectedHook(base);
            setHookCenter(row?replaceHookCenterRow(base,{...row,lastExecutions:history}):base);return;
          }
          if(operation==='dry-run'){
            const eventType=parsed.args[2];if(!eventType){addLocal('Usage: /hooks dry-run <hook-id> <event-type> [action]');return;}
            const action=parsed.args.length>3?parsed.args.slice(3).join(' '):null;
            const result=await hookFacade().dryRun(hookId,{eventType,action});
            const rows=await hookFacade().list();const selected=Math.max(0,rows.findIndex(row=>row.id===hookId));
            const base=createHookCenterModel(rows,selected);const row=selectedHook(base);
            setHookCenter(row?replaceHookCenterRow(base,{...row,lastDryRun:result}):base);return;
          }
          if(operation==='trust'){if(parsed.args.length!==2){addLocal('Usage: /hooks trust <hook-id>');return;}await hookFacade().trust(hookId);}
          else if(operation==='untrust'){if(parsed.args.length!==2){addLocal('Usage: /hooks untrust <hook-id>');return;}await hookFacade().untrust(hookId);}
          else if(operation==='quarantine'){await hookFacade().quarantine(hookId,parsed.args.length>2?parsed.args.slice(2).join(' '):null);}
          else if(operation==='release'||operation==='release-quarantine'){if(parsed.args.length!==2){addLocal('Usage: /hooks release <hook-id>');return;}await hookFacade().releaseQuarantine(hookId);}
          else{addLocal('Usage: /hooks [list|dry-run|history|trust|untrust|quarantine|release] [hook-id] [args...]');return;}
          await loadHookCenter(hookId);
        }catch(error){addLocal('/hooks '+operation+' failed: '+(error instanceof Error?error.message:String(error)));}
        return;
      }
      if(parsed.name==='plugins'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'){
          if(parsed.args.length>1){addLocal('Usage: /plugins [list|install|remove|trust|untrust|quarantine|release] [plugin-id] [args...]');return;}
          await loadPluginCenter();return;
        }
        if(['trust','untrust','quarantine','release','release-quarantine'].includes(operation)){
          const pluginId=parsed.args[1];
          if(!pluginId){addLocal('Usage: /plugins '+operation+' <plugin-id>');return;}
          try{
            if(operation==='trust'){if(parsed.args.length!==2){addLocal('Usage: /plugins trust <plugin-id>');return;}await pluginFacade().trust(pluginId);}
            else if(operation==='untrust'){if(parsed.args.length!==2){addLocal('Usage: /plugins untrust <plugin-id>');return;}await pluginFacade().untrust(pluginId);}
            else if(operation==='quarantine')await pluginFacade().quarantine(pluginId,parsed.args.length>2?parsed.args.slice(2).join(' '):null);
            else{if(parsed.args.length!==2){addLocal('Usage: /plugins release <plugin-id>');return;}await pluginFacade().releaseQuarantine(pluginId);}
            await loadPluginCenter(pluginId);
          }catch(error){addLocal('/plugins '+operation+' failed: '+(error instanceof Error?error.message:String(error)));}
          return;
        }
        if(operation!=='install'&&operation!=='remove'){addLocal('Usage: /plugins [list|install|remove|trust|untrust|quarantine|release] [plugin-id] [args...]');return;}
        /* install/remove deliberately continue into the existing child CLI installer path below. */
      }
      if(parsed.name==='exit'){inkApp.exit();return;}
      if(parsed.name==='clear'){setState((current:TuiState)=>({...current,messages:[],streamingAssistant:null,reasoning:null,tools:[],warnings:[],transcript:createTranscriptModel()}));setDiff('');setViewport((view:TranscriptViewport)=>({...view,offset:0,unseen:0,followingTail:true}));return;}
      if(parsed.name==='status'){addLocal(`Session: ${state.sessionId??'none'}\nRunning: ${state.running?'yes':'no'}\nModel: ${state.status.model}\nMode: ${state.status.permissionMode}\nTools: ${state.tools.length}`);return;}
      if(parsed.name==='queue'){
        const operation=parsed.args[0]??'show';
        if(operation==='clear'){try{const dropped=await controller.clearQueue();setQueueEditor(null);addLocal(dropped.length?`Cleared ${dropped.length} queued item${dropped.length===1?'':'s'}.`:'Queue is empty.');}catch(error){addLocal(`Queue clear failed: ${error instanceof Error?error.message:String(error)}`);}return;}
        if(operation==='run'){
          if(state.running){addLocal('The queue has not been resumed; finish or cancel the active turn first.');return;}
          try{if(!controller.queue().length){addLocal('Queue is empty.');return;}await controller.dispatchQueue();addLocal('Queued work explicitly resumed.');}catch(error){addLocal(`Queue dispatch failed: ${error instanceof Error?error.message:String(error)}`);}return;
        }
        if(operation!=='show'){addLocal('Usage: /queue [clear|run]');return;}
        if(!controller.queue().length){addLocal('Queue is empty.');return;}setQueueEditor({selected:0,editing:false,draft:''});return;
      }
      if(parsed.name==='context'){
        if(!state.sessionId){addLocal('No active session has context to inspect.');return;}
        if(typeof runtime.contextStatus!=='function'){addLocal('Context inspection is unavailable in this runtime.');return;}
        try{const next=await runtime.contextStatus(state.sessionId);setContextStatus(next);setContextInspector(next);}catch(error){addLocal(`Context inspection failed: ${error instanceof Error?error.message:String(error)}`);}return;
      }
      if(parsed.name==='permissions'){
        try{const dry=permissionDryRunSlash(parsed.args,permissionRules??{allow:[],ask:[],deny:[]},projectRoot);if(dry!==null){addLocal(dry);return;}}
        catch(error){addLocal(`Permission dry-run failed: ${error instanceof Error?error.message:String(error)}`);return;}
        await loadTrustCenter();return;
      }
      if(parsed.name==='plan'){const next=togglePlanMode(controller.mode(),baseMode);controller.setMode(next);setState((current:TuiState)=>localMessage({...current,status:{...current.status,permissionMode:next}},next==='plan'?'Plan mode enabled.':'Plan mode disabled.'));return;}
      if(parsed.name==='diff'){try{const result=await execFileAsync('git',['diff','--no-ext-diff','--unified=3'],{cwd:projectRoot,windowsHide:true,maxBuffer:512*1024});setDiff(String(result.stdout||'(no changes)'));}catch(error:any){setDiff(String(error?.stdout||error?.stderr||error?.message||'git diff failed'));}return;}
      try{const local=await runControllerSlashAction(parsed.name,controller);if(local!==null){addLocal(local);return;}}catch(error){addLocal(`/${parsed.name} failed: ${error instanceof Error?error.message:String(error)}`);return;}
      const cliArgs=slashCommandToCliArgs(parsed.name,parsed.args);
      /* ⛔ B1 slice 18: the child runs with TALOS_ENVIRONMENT_KEYS=consent, so a command started from this screen never uses an
         environment key the person has not approved here, whatever this process's own environment says. */
      if(cliArgs){try{const entry=process.argv[1];if(!entry)throw new Error('CLI_ENTRY_UNAVAILABLE');const result=await execFileAsync(process.execPath,[entry,'--project',projectRoot,'--no-color',...cliArgs],{windowsHide:true,maxBuffer:512*1024,env:screenChildEnvironment(process.env)});addLocal(String(result.stdout||result.stderr||'ok').trim());}catch(error:any){addLocal(`/${parsed.name} failed: ${String(error?.stderr||error?.message||error).trim()}`);}return;}
      addLocal(`/${parsed.name} is not available in this TUI context.`);
    };

    const submit=async()=>{
      const text=currentEditor().text;if(!text.trim())return;developmentLog('ui.submit.begin',{text:developmentTextEvidence(text),model:controller.model(),running:state.running,mode:controller.mode()},'info','tui');
      const clearedEditor=createEditorState('');composerStore.replace(clearedEditor);setAppState((current:TuiAppState)=>({...current,editor:clearedEditor,focus:current.focus.current==='composer'?current.focus:createFocusState('composer'),overlay:null}));
      setVim((current:VimState)=>current.enabled?{...current,mode:'insert'}:current);
      setHistory((rows:string[])=>[text,...rows.filter(row=>row!==text)].slice(0,MAX_HISTORY));historyIndexRef.current=-1;reverseIndexRef.current=0;setViewport((view:TranscriptViewport)=>({...view,offset:0,unseen:0,followingTail:true}));
      if(text.trim().startsWith('/')){await executeSlash(text.trim());return;}
      if(!text.trim().startsWith('!')){const readiness=await readinessFor(controller.model());developmentLog('ui.readiness',{model:controller.model(),readiness},readiness.ready?'debug':'warning','tui');if(!readiness.ready){setEditorText(text);addLocal(readiness.message);return;}}
      const willQueue=state.running||controller.queue().length>0;
      if(!willQueue)setState((current:TuiState)=>userMessage(current,text.trim()));
      try{const outcome=await controller.send(text,{model:controller.model(),running:state.running});developmentLog('ui.submit.accepted',{outcome},'info','tui');}catch(error:any){developmentLogError('ui.submit.failure',error,{model:controller.model()},'tui');addLocal(error instanceof TuiNotReadyError?error.message:`Error: ${error?.message??error}`);}
    };

    const historyMove=(delta:number)=>{if(!history.length)return;const next=Math.max(-1,Math.min(history.length-1,historyIndexRef.current+delta));historyIndexRef.current=next;reverseIndexRef.current=0;setEditorText(next>=0?(history[next]??''):'');};
    const reverseSearch=()=>{const found=reverseHistoryMatch(history,currentEditor().text,reverseIndexRef.current);if(!found){reverseIndexRef.current=0;return;}reverseIndexRef.current=found.index+1;historyIndexRef.current=found.index;setEditorText(found.value);};
    const cycleMode=()=>{const next=cyclePermissionMode(controller.mode());controller.setMode(next);setState((current:TuiState)=>({...current,status:{...current.status,permissionMode:next}}));};
    const cancelActiveRun=()=>{void controller.cancel().then((dropped:TuiQueuedAction[])=>{if(dropped.length)addLocal(`Cancelled the active run; ${dropped.length} queued item${dropped.length===1?' was':'s were'} not sent. They remain in input history for recovery.`);}).catch((error:unknown)=>addLocal(`Cancel failed: ${error instanceof Error?error.message:String(error)}`));};

    const filteredModels=modelItems(modelRows,pickerQuery);
    const effortRows=modelEffortStep?reasoningEffortChoices(modelEffortStep):[];
    const filteredProviders=providerItems(providerRows,pickerQuery);
    const filteredSessions=filterSessions(sessionRows,pickerQuery);
    const activePickerRows=appState.focus.current==='model-picker'?(modelEffortStep?effortRows:filteredModels):appState.focus.current==='provider-picker'?filteredProviders:appState.focus.current==='session-picker'?filteredSessions:[];

    const movePicker=(action:string)=>{
      const movement=pickerMove(action);if(!movement)return;
      if(appState.focus.current==='command-menu'){commandMenuSelectionStore.move(commandMenuItems(currentEditor().text).length,movement);return;}
      setPickerSelection((current:SelectionState)=>moveSelection({...current,query:pickerQuery},activePickerRows.length,movement));
    };
    const pickerBackspace=()=>{
      if(appState.focus.current==='model-picker'&&modelEffortStep){setModelEffortStep(null);setPickerSelection({query:'',selected:0,pageSize:10});return;}
      if(appState.focus.current==='command-menu'){
        updateEditor(editor=>{const next=deleteBackward(editor);if(next.text.length===0)setTimeout(()=>setAppState((current:TuiAppState)=>({...current,focus:closeFocus(current.focus)})),0);return next;});
        commandMenuSelectionStore.reset();
        return;
      }
      if(appState.focus.current==='provider-picker'&&providerStep.kind==='key')setProviderSecret((value:string)=>value.slice(0,-1));
      else if(appState.focus.current==='provider-picker'&&providerStep.kind==='consent'){/* nothing to erase */}
      else setPickerQuery((value:string)=>value.slice(0,-1));
      setPickerSelection((current:SelectionState)=>({...current,selected:0}));
    };
    const confirmPicker=async()=>{
      if(appState.focus.current==='command-menu'){
        const selected=commandMenuSelectionStore.getSnapshot().selected;
        const row=commandMenuItems(currentEditor().text)[selected];if(!row)return;
        setEditorText(completeCommandSelection(row.command));
        setAppState((current:TuiAppState)=>({...current,focus:closeFocus(current.focus)}));
        commandMenuSelectionStore.reset();
        setPickerSelection({query:'',selected:0,pageSize:10});
        return;
      }
      const selected=pickerSelection.selected;
      if(appState.focus.current==='model-picker'){
        if(modelEffortStep){
          const row=modelEffortStep;const choice=effortRows[selected];if(!choice)return;const sameLiveModel=Boolean(state.sessionId&&state.status.model===row.id);
          try{
            await commitModelSelection({id:row.id,catalog,setControllerModel:(id:string)=>controller.setModel(id)});
            if(choice==='default'){
              await configUnset({paths,projectRoot,scope:'project-user',path:'reasoningEffort'});
              if(typeof runtime.setDefaultReasoningEffort==='function')runtime.setDefaultReasoningEffort(null);
              const retainedLiveEffort=sameLiveModel?reasoningEffort:null;
              setReasoningEffort(retainedLiveEffort);
              setCurrentModelMeta(row);
              setState((current:TuiState)=>localMessage({...current,status:{...current.status,model:row.id}},retainedLiveEffort
                ?`Model changed to ${row.id}. The project reasoning-effort override was cleared; new sessions in this process use model default, while the current session keeps ${retainedLiveEffort}. A lower-precedence config may apply next launch.`
                :`Model changed to ${row.id}. The project reasoning-effort override was cleared; new sessions in this process use model default. A lower-precedence config may apply next launch.`));
            }else{
              await configSet({paths,projectRoot,scope:'project-user',path:'reasoningEffort',value:choice});
              if(typeof runtime.setDefaultReasoningEffort==='function')runtime.setDefaultReasoningEffort(choice);
              if(sameLiveModel&&typeof runtime.setReasoningEffort==='function')await runtime.setReasoningEffort(state.sessionId!,choice);
              setReasoningEffort(choice);setCurrentModelMeta(row);
              setState((current:TuiState)=>localMessage({...current,status:{...current.status,model:row.id}},`Model changed to ${row.id}. Reasoning effort ${choice} applies ${sameLiveModel?'to this session and ':''}to subsequent runs.`));
            }
            closeCurrentOverlay();
          }catch(error){addLocal(`Model/effort change failed: ${error instanceof Error?error.message:String(error)}`);}
          return;
        }
        const row=filteredModels[selected];if(!row)return;
        const choices=reasoningEffortChoices(row);
        if(choices.length){setModelEffortStep(row);setPickerQuery('');setPickerSelection({query:'',selected:0,pageSize:10});return;}
        try{
          await commitModelSelection({id:row.id,catalog,setControllerModel:(id:string)=>controller.setModel(id)});
          if(typeof runtime.setDefaultReasoningEffort==='function')runtime.setDefaultReasoningEffort(null);
          setReasoningEffort(null);setCurrentModelMeta(row);
          setState((current:TuiState)=>localMessage({...current,status:{...current.status,model:row.id}},`Model changed to ${row.id} for subsequent runs. This model does not advertise configurable reasoning effort; using model default in this process.`));
          closeCurrentOverlay();
        }catch(error){addLocal(`Model change failed: ${error instanceof Error?error.message:String(error)}`);}
        return;
      }
      if(appState.focus.current==='provider-picker'){
        if(providerStep.kind==='consent'){
          const step=providerStep;
          try{await catalog.answerEnvironmentKey(step.provider.id,step.choice);}catch(error){addLocal(`The answer could not be recorded (${errorCode(error)}).`);return;}
          const refreshed=(await catalog.listProviders()).find((entry:TuiProvider)=>entry.id===step.provider.id)??{...step.provider,keySource:step.choice==='yes'?'environment':'environment-declined'};
          if(step.choice==='yes')addLocal(`${step.provider.environmentVariable??'The environment key'} will be used for ${step.provider.label} if the provider accepts it.`);
          await routeProviderSelection(step.choice==='yes'?refreshed:{...refreshed,keySource:'environment-declined'},{allowEnvironmentConsent:false});return;
        }
        if(providerStep.kind==='key'){
          const step=providerStep;if(step.testing)return;
          let secret=providerSecret;setProviderSecret('');
          if(!secret.trim())return;
          setProviderStep({...step,testing:true,result:null});
          let result:TuiKeySave;
          try{result=await catalog.setProviderKey(step.provider.id,secret);}catch(error){setProviderStep({...step,testing:false,result:null});addLocal(`The key could not be tested (${errorCode(error)}). It was not saved.`);return;}finally{secret='';}
          if(!result.saved){setProviderStep({...step,testing:false,result});return;}
          addLocal(`${result.message} Saved to the system keyring.`);
          const refreshed=(await catalog.listProviders()).find((entry:TuiProvider)=>entry.id===step.provider.id)??{...step.provider,configured:true};
          await chooseProviderAndOpenModels(refreshed);return;
        }
        const row=filteredProviders[selected];if(!row)return;
        await routeProviderSelection(row);return;
      }
      if(appState.focus.current==='session-picker'){
        const model=sessionPickerRef.current;if(!model)return;model.setQuery(pickerQuery);if(!model.rows()[selected])return;model.select(selected);
        try{await model.confirm();closeCurrentOverlay();}catch(error){addLocal(`Session action failed: ${error instanceof Error?error.message:String(error)}`);}return;
      }
    };

    const handleSemanticAction=(action:string,key:any)=>{
      if(action==='approval-view'&&appState.focus.current==='approval'){setApprovalExpanded((value:boolean)=>!value);setApprovalScroll(0);return;}
      if(appState.focus.current==='approval'){
        const choice=approvalChoiceForAction(action);if(choice&&pending){void controller.resolveApproval(pending.requestId,choice).catch((error:unknown)=>addLocal(`Approval failed: ${error instanceof Error?error.message:String(error)}`));return;}
      }
      if(action==='overlay-close'){closeCurrentOverlay();return;}
      if(action==='picker-cancel'){if(appState.focus.current==='provider-picker')providerPickerRef.current?.cancel();if(appState.focus.current==='model-picker')modelPickerRef.current?.cancel();if(appState.focus.current==='session-picker')sessionPickerRef.current?.cancel();closeCurrentOverlay();return;}
      if(appState.focus.current==='provider-picker'&&providerStep.kind==='consent'&&(action==='picker-up'||action==='picker-home')){setProviderStep({...providerStep,choice:'no'});return;}
      if(appState.focus.current==='provider-picker'&&providerStep.kind==='consent'&&(action==='picker-down'||action==='picker-end')){setProviderStep({...providerStep,choice:'yes'});return;}
      if(appState.focus.current==='provider-picker'&&providerStep.kind!=='list'&&action.startsWith('picker-')&&action!=='picker-confirm'&&action!=='picker-backspace')return;
      if(action.startsWith('picker-')&&action!=='picker-confirm'&&action!=='picker-backspace'){movePicker(action);return;}
      if(action==='picker-backspace'){pickerBackspace();return;}
      if(action==='picker-confirm'){void confirmPicker();return;}
      if(action==='command-complete'&&appState.focus.current==='command-menu'){void confirmPicker();return;}
      if(action==='interrupt'){
        if(key?.escape){if(state.running){void controller.interrupt().catch((error:unknown)=>addLocal(`Interrupt failed: ${error instanceof Error?error.message:String(error)}`));}else{setAuxCompletions([]);setViewport((view:TranscriptViewport)=>({...view,offset:0,unseen:0,followingTail:true}));}return;}
        const result=interruptRef.current.ctrlC(state.running);if(result==='cancel')cancelActiveRun();else inkApp.exit();return;
      }
      if(action==='vim-toggle'){setVim((current:VimState)=>toggleVim(current));return;}
      if(action==='agent-tree'){
        void controller.agentTree().then((tree:any)=>{
          const rows=agentRosterRows(tree);setAgentRows(rows);
          if(!rows.length){addLocal('No native agent tree is available for this session.');return;}
          setAgentTreeOverlay(createAgentTreeOverlayModel(rows,tree?.focusId??controller.current()));
        }).catch((error:unknown)=>addLocal(`Agent tree unavailable: ${error instanceof Error?error.message:String(error)}`));
        return;
      }
      if(action==='steer'){
        const text=currentEditor().text;
        void controller.steer(text,{running:state.running}).then((outcome:any)=>{
          if(outcome.status!=='requested')return;
          const clearedEditor=createEditorState('');composerStore.replace(clearedEditor);setAppState((current:TuiAppState)=>({...current,editor:clearedEditor}));
          setHistory((rows:string[])=>text.trim()?[text,...rows.filter(row=>row!==text)].slice(0,MAX_HISTORY):rows);historyIndexRef.current=-1;reverseIndexRef.current=0;setAuxCompletions([]);
        }).catch((error:unknown)=>addLocal(`Steering rejected: ${error instanceof Error?error.message:String(error)}`));
        return;
      }
      if(action==='command-menu'){const editor=composerStore.update(current=>editInsert(current,'/'));commandMenuSelectionStore.reset();setAppState((current:TuiAppState)=>({...current,editor,focus:openFocus(current.focus,'command-menu')}));setPickerSelection({query:'',selected:0,pageSize:10});return;}
      if(action==='model-picker'){void loadModels();return;}
      if(action==='provider-picker'){void loadProviders();return;}
      if(action==='help'){applyOverlay({kind:'help'});return;}
      if(action==='reasoning-toggle'||action==='tool-details'||action==='redraw'){setAppState((current:TuiAppState)=>reduceAppAction(current,{type:'key-action',action}));return;}
      if(action==='transcript-search'){openTranscriptSearch();return;}
      if(action==='transcript-raw'){setTranscriptRaw((value:boolean)=>!value);setTranscriptSearch((current:TranscriptSearchState|null)=>current?{...current,raw:!transcriptRaw,notice:null}:current);return;}
      if(action==='transcript-copy'){copyTranscriptItem();return;}
      if(action==='permission-cycle'){cycleMode();return;}
      if(action==='page-up'){setViewport((view:TranscriptViewport)=>reduceViewport(view,'page-up',transcriptItemsForCurrentView().length));return;}
      if(action==='page-down'){setViewport((view:TranscriptViewport)=>reduceViewport(view,'page-down',transcriptItemsForCurrentView().length));return;}
      if(action==='history-search'){reverseSearch();return;}
      if(action==='history-prev'&&key?.ctrl){historyMove(1);return;}
      if(action==='history-next'&&key?.ctrl){historyMove(-1);return;}
      if(action==='external-editor'){void editExternally({text:currentEditor().text,editor:process.env.VISUAL??process.env.EDITOR,tmpRoot:paths.cacheRoot}).then(setEditorText).catch(error=>addLocal(`External editor: ${error instanceof Error?error.message:String(error)}`));return;}
      if(action==='palette'){
        const token=lastProjectToken(currentEditor().text);if(token){void completeProjectPath(projectRoot,token).then(rows=>{setAuxCompletions(rows.map(row=>row.value));if(rows.length===1)updateEditor(editor=>replaceLastProjectToken(editor,token,rows[0]!.value));});return;}
        const rows=commandMenuItems(currentEditor().text);setAuxCompletions(rows.slice(0,8).map(row=>`/${row.command.name}`));if(rows.length===1)setEditorText(completeCommandSelection(rows[0]!.command));return;
      }
      if(action==='newline'){updateEditor(editor=>editInsert(editor,'\n'));return;}
      if(action==='submit'){void submit();return;}
      if(action==='undo'){updateEditor(undoEditor);return;}
      if(action==='redo'){updateEditor(redoEditor);return;}
      if(action==='home'){updateEditor(editor=>moveCursor(editor,'home'));return;}
      if(action==='end'){updateEditor(editor=>moveCursor(editor,'end'));return;}
      if(action==='left'){updateEditor(editor=>moveCursor(editor,'left'));return;}
      if(action==='right'){updateEditor(editor=>moveCursor(editor,'right'));return;}
      if(action==='word-left'){updateEditor(editor=>moveWord(editor,-1));return;}
      if(action==='word-right'){updateEditor(editor=>moveWord(editor,1));return;}
      if(action==='select-home'){updateEditor(editor=>moveCursor(editor,'home',true));return;}
      if(action==='select-end'){updateEditor(editor=>moveCursor(editor,'end',true));return;}
      if(action==='select-left'){updateEditor(editor=>moveCursor(editor,'left',true));return;}
      if(action==='select-right'){updateEditor(editor=>moveCursor(editor,'right',true));return;}
      if(action==='select-up'){updateEditor(editor=>moveVertical(editor,-1,true));return;}
      if(action==='select-down'){updateEditor(editor=>moveVertical(editor,1,true));return;}
      if(action==='select-word-left'){updateEditor(editor=>moveWord(editor,-1,true));return;}
      if(action==='select-word-right'){updateEditor(editor=>moveWord(editor,1,true));return;}
      if(action==='copy-selection'){updateEditor(copySelection);return;}
      if(action==='kill-start'){updateEditor(killToStart);return;}
      if(action==='kill-end'){updateEditor(killToEnd);return;}
      if(action==='kill-word'){updateEditor(killWordBackward);return;}
      if(action==='yank'){updateEditor(yank);return;}
      if(action==='delete-forward'){if(currentEditor().text.length===0&&!state.running)inkApp.exit();else updateEditor(deleteForward);return;}
      if(action==='backspace'){updateEditor(deleteBackward);return;}
      if(action==='history-prev'){const editor=currentEditor();const hadSelection=editor.selectionAnchor!==undefined;const moved=moveVertical(editor,-1);if(moved.cursor!==editor.cursor||hadSelection)updateEditor(()=>moved);else historyMove(1);return;}
      if(action==='history-next'){const editor=currentEditor();const hadSelection=editor.selectionAnchor!==undefined;const moved=moveVertical(editor,1);if(moved.cursor!==editor.cursor||hadSelection)updateEditor(()=>moved);else historyMove(-1);return;}
    };

    const pasteOwner=composerOwnsPaste({
      bootPhase:boot.phase,
      focus:appState.focus.current,
      modalOwner:Boolean(appState.overlay||queueEditor||transcriptSearch||contextInspector||agentTreeOverlay||trustCenter||mcpCenter||hookCenter||pluginCenter||memoryCenter||notesCenter||tasksCenter||libraryCenter||researchCenter||automationCenter||forgeCenter||pending),
      vimMode:vim.enabled?vim.mode:'disabled',
      auxCount:auxCompletions.length,
    });
    Ink.usePaste((pastedText:string)=>{
      composerStore.update(editor=>applyComposerFastPasteInput(editor,pastedText));
    },{isActive:pasteOwner});

    Ink.useInput((ch:string,key:any)=>{
      const modalOwner=Boolean(appState.overlay||queueEditor||transcriptSearch||contextInspector||agentTreeOverlay||trustCenter||mcpCenter||hookCenter||pluginCenter||memoryCenter||notesCenter||tasksCenter||libraryCenter||researchCenter||automationCenter||forgeCenter||pending);
      const fastDecision=decideShellInput({
        ch,key,focus:appState.focus.current,composerText:currentEditor().text,commandMenuOpen:appState.focus.current==='command-menu',
        trustCenterOpen:Boolean(trustCenter),approvalExpanded,boot,keymap:effectiveKeymap,
      });
      const commandQuery=commandMenuFastTextInput({bootPhase:boot.phase,focus:appState.focus.current,modalOwner,key,routed:fastDecision.routed});
      if(commandQuery!==null){commandMenuSelectionStore.reset();composerStore.update(editor=>editInsert(editor,commandQuery));return;}
      const fastText=composerFastTextInput({bootPhase:boot.phase,focus:appState.focus.current,modalOwner,vimMode:vim.enabled?vim.mode:'disabled',auxCount:auxCompletions.length,key,routed:fastDecision.routed});
      if(fastText!==null){composerStore.update(editor=>editInsert(editor,fastText));return;}
      const fastPaste=composerFastPasteInput({bootPhase:boot.phase,focus:appState.focus.current,modalOwner,vimMode:vim.enabled?vim.mode:'disabled',auxCount:auxCompletions.length,key,routed:fastDecision.routed});
      if(fastPaste!==null){composerStore.update(editor=>applyComposerFastPasteInput(editor,fastPaste));return;}
      const fastEditorAction=composerFastEditorAction({bootPhase:boot.phase,focus:appState.focus.current,modalOwner,vimMode:vim.enabled?vim.mode:'disabled',auxCount:auxCompletions.length,routed:fastDecision.routed,editor:currentEditor()});
      if(fastEditorAction!==null){composerStore.update(editor=>applyComposerFastEditorAction(editor,fastEditorAction));return;}
      const historyPlan=planComposerHistoryAction({
        bootPhase:boot.phase,focus:appState.focus.current,modalOwner,vimMode:vim.enabled?vim.mode:'disabled',auxCount:auxCompletions.length,
        routed:fastDecision.routed,key,editor:currentEditor(),history,historyIndex:historyIndexRef.current,reverseIndex:reverseIndexRef.current,
      });
      if(historyPlan!==null){
        historyIndexRef.current=historyPlan.historyIndex;
        reverseIndexRef.current=historyPlan.reverseIndex;
        composerStore.replace(historyPlan.editor);
        return;
      }
      coordinator.immediate('input',()=>{
      if(forgeCenter){
        if(key.ctrl&&(ch==='c'||ch==='C')){setForgeCenter(null);return;}
        if(key.escape||(ch==='q'&&!key.ctrl&&!key.meta)){setForgeCenter(null);return;}
        const loadSelected=(next:ForgeCenterModel)=>{setForgeCenter(next);const row=selectedForgeTool(next);if(row)void forgeFacade().read(row.id).then(detail=>setForgeCenter((current:ForgeCenterModel|null)=>current?setForgeCenterDetail(current,detail):current)).catch((error:unknown)=>addLocal('Forge detail failed: '+(error instanceof Error?error.message:String(error))));};
        if(key.upArrow){loadSelected(moveForgeCenterSelection(forgeCenter,-1));return;}if(key.downArrow){loadSelected(moveForgeCenterSelection(forgeCenter,1));return;}
        const row=selectedForgeTool(forgeCenter);if(ch==='r'){void loadForgeCenter(row?.id);return;}if(!row)return;const ownerSessionId=state.sessionId;
        if(ch==='e'){if(!ownerSessionId){addLocal('Forge enable/disable needs an active owner session.');return;}void forgeFacade().setEnabled(ownerSessionId,row.id,!row.enabled).then(()=>loadForgeCenter(row.id)).catch((error:unknown)=>addLocal('Forge enable/disable failed: '+(error instanceof Error?error.message:String(error))));return;}
        if(ch==='b'){if(!ownerSessionId){addLocal('Forge rollback needs an active owner session.');return;}const versions=Array.isArray(forgeCenter.detail?.versions)?forgeCenter.detail.versions:[];const current=row.ownerRevision??Number.MAX_SAFE_INTEGER;const candidates=versions.map((v:any)=>Number(v.revision??v.ownerRevision)).filter((v:number)=>Number.isSafeInteger(v)&&v<current).sort((a:number,b:number)=>b-a);const target=candidates[0];if(!target){addLocal('No earlier retained owner revision to roll back to.');return;}void forgeFacade().rollback(ownerSessionId,row.id,target).then(()=>loadForgeCenter(row.id)).catch((error:unknown)=>addLocal('Forge rollback failed: '+(error instanceof Error?error.message:String(error))));return;}
        return;
      }
      if(automationCenter){
        if(key.ctrl&&(ch==='c'||ch==='C')){setAutomationCenter(null);return;}
        if(key.escape||(ch==='q'&&!key.ctrl&&!key.meta)){setAutomationCenter(null);return;}
        const loadSelected=(next:AutomationCenterModel)=>{setAutomationCenter(next);const row=selectedAutomation(next);if(row)void automationFacade().read(row.id).then(detail=>setAutomationCenter((current:AutomationCenterModel|null)=>current?setAutomationCenterDetail(current,detail):current)).catch((error:unknown)=>addLocal('Automation detail failed: '+(error instanceof Error?error.message:String(error))));};
        if(key.upArrow){loadSelected(moveAutomationCenterSelection(automationCenter,-1));return;}
        if(key.downArrow){loadSelected(moveAutomationCenterSelection(automationCenter,1));return;}
        const row=selectedAutomation(automationCenter);if(ch==='u'){void loadAutomationCenter(row?.id);return;}if(ch==='d'&&row){void automationFacade().read(row.id).then(detail=>setAutomationCenter((current:AutomationCenterModel|null)=>current?setAutomationCenterDetail(current,detail):current)).catch((error:unknown)=>addLocal('Automation dry-run failed: '+(error instanceof Error?error.message:String(error))));return;}return;
      }
      if(researchCenter){
        if(key.ctrl&&(ch==='c'||ch==='C')){setResearchCenter(null);return;}
        if(key.escape||(ch==='q'&&!key.ctrl&&!key.meta)){setResearchCenter(null);return;}
        if(key.upArrow){const next=moveResearchCenterSelection(researchCenter,-1);setResearchCenter(next);const row=selectedResearch(next);if(row)void researchFacade().read(row.id).then(detail=>setResearchCenter((current:ResearchCenterModel|null)=>current?setResearchCenterDetail(current,detail):current)).catch((error:unknown)=>addLocal('Research detail failed: '+(error instanceof Error?error.message:String(error))));return;}
        if(key.downArrow){const next=moveResearchCenterSelection(researchCenter,1);setResearchCenter(next);const row=selectedResearch(next);if(row)void researchFacade().read(row.id).then(detail=>setResearchCenter((current:ResearchCenterModel|null)=>current?setResearchCenterDetail(current,detail):current)).catch((error:unknown)=>addLocal('Research detail failed: '+(error instanceof Error?error.message:String(error))));return;}
        const row=selectedResearch(researchCenter);if(ch==='u'){void loadResearchCenter(row?.id);return;}if(!row)return;const ownerSessionId=state.sessionId??row.id;
        if(ch==='p'){void researchFacade().pause(ownerSessionId,row.id).then(()=>loadResearchCenter(row.id)).catch((error:unknown)=>addLocal('Research pause failed: '+(error instanceof Error?error.message:String(error))));return;}
        if(ch==='r'){void researchFacade().resume(ownerSessionId,row.id).then(()=>loadResearchCenter(row.id)).catch((error:unknown)=>addLocal('Research resume failed: '+(error instanceof Error?error.message:String(error))));return;}
        if(ch==='c'){void researchFacade().cancel(ownerSessionId,row.id).then(()=>loadResearchCenter(row.id)).catch((error:unknown)=>addLocal('Research cancel failed: '+(error instanceof Error?error.message:String(error))));return;}
        if(ch==='e'){void researchFacade().exportFile(row.id,'md').then(result=>addLocal('Research exported: '+result.path)).catch((error:unknown)=>addLocal('Research export failed: '+(error instanceof Error?error.message:String(error))));return;}
        return;
      }
      if(libraryCenter){
        if(key.ctrl&&(ch==='c'||ch==='C')){setLibraryCenter(null);return;}
        if(key.escape||(ch==='q'&&!key.ctrl&&!key.meta)){setLibraryCenter(null);return;}
        if(key.upArrow){setLibraryCenter((current:LibraryCenterModel|null)=>current?moveLibraryCenterSelection(current,-1):current);return;}
        if(key.downArrow){setLibraryCenter((current:LibraryCenterModel|null)=>current?moveLibraryCenterSelection(current,1):current);return;}
        if(ch==='r'){const row=selectedLibraryEntry(libraryCenter);void loadLibraryCenter(row?.id);return;}
        if(ch==='p'){
          const row=selectedLibraryEntry(libraryCenter);if(!row)return;
          void libraryFacade().preview(row.id).then(preview=>setLibraryCenter((current:LibraryCenterModel|null)=>current?setLibraryCenterPreview(current,preview):current)).catch((error:unknown)=>addLocal('Library preview failed: '+(error instanceof Error?error.message:String(error))));return;
        }
        if(ch==='u'){
          const row=selectedLibraryEntry(libraryCenter);if(!row)return;
          void libraryFacade().duplicates(row.id).then(scan=>setLibraryCenter((current:LibraryCenterModel|null)=>current?setLibraryCenterDuplicateScan(current,scan):current)).catch((error:unknown)=>addLocal('Library duplicate scan failed: '+(error instanceof Error?error.message:String(error))));return;
        }
        if(ch==='a'){
          const row=selectedLibraryEntry(libraryCenter);if(!row)return;
          void libraryFacade().prepareContextReference(row.id).then(reference=>{setEditorText(attachLibraryContextToken(currentEditor().text,reference.token));setLibraryCenter(null);}).catch((error:unknown)=>addLocal('Library attach failed: '+(error instanceof Error?error.message:String(error))));return;
        }
        if(ch==='d'){
          const row=selectedLibraryEntry(libraryCenter),token=row?.context.token;if(!token)return;
          setEditorText(detachLibraryContextToken(currentEditor().text,token));setLibraryCenter(null);return;
        }
        return;
      }
      if(tasksCenter){
        if(key.ctrl&&(ch==='c'||ch==='C')){setTasksCenter(null);return;}
        if(key.escape||(ch==='q'&&!key.ctrl&&!key.meta)){setTasksCenter(null);return;}
        if(key.upArrow){setTasksCenter((current:TasksCenterModel|null)=>current?moveTasksCenterSelection(current,-1):current);return;}
        if(key.downArrow){setTasksCenter((current:TasksCenterModel|null)=>current?moveTasksCenterSelection(current,1):current);return;}
        if(ch==='r'){const row=selectedTask(tasksCenter);void loadTasksCenter(row?.id);return;}
        return;
      }
      if(notesCenter){
        if(key.ctrl&&(ch==='c'||ch==='C')){if(state.running)cancelActiveRun();else setNotesCenter(null);return;}
        if(key.escape||(ch==='q'&&!key.ctrl&&!key.meta)){setNotesCenter(null);return;}
        if(key.upArrow){setNotesCenter((current:NotesCenterModel|null)=>current?moveNotesCenterSelection(current,-1):current);return;}
        if(key.downArrow){setNotesCenter((current:NotesCenterModel|null)=>current?moveNotesCenterSelection(current,1):current);return;}
        if(ch==='r'){const row=selectedNote(notesCenter);void loadNotesCenter(row?.id);return;}
        if(ch==='c'){
          const row=selectedNote(notesCenter);if(!row)return;
          void notesFacade().composerReference(row.id).then((reference:string)=>{const existing=currentEditor().text;setEditorText(existing.trim()?existing+'\n\n'+reference:reference);setNotesCenter(null);}).catch((error:unknown)=>addLocal('Note composer attach failed: '+(error instanceof Error?error.message:String(error))));return;
        }
        return;
      }
      if(memoryCenter){
        if(key.ctrl&&(ch==='c'||ch==='C')){if(state.running)cancelActiveRun();else setMemoryCenter(null);return;}
        if(key.escape||(ch==='q'&&!key.ctrl&&!key.meta)){setMemoryCenter(null);return;}
        if(key.upArrow){setMemoryCenter((current:MemoryCenterModel|null)=>current?moveMemoryCenterSelection(current,-1):current);return;}
        if(key.downArrow){setMemoryCenter((current:MemoryCenterModel|null)=>current?moveMemoryCenterSelection(current,1):current);return;}
        if(ch==='r'){const row=selectedMemory(memoryCenter);void loadMemoryCenter(undefined,row?.id);return;}
        return;
      }
      if(pluginCenter){
        if(key.ctrl&&(ch==='c'||ch==='C')){if(state.running)cancelActiveRun();else setPluginCenter(null);return;}
        if(key.escape){setPluginCenter(null);return;}
        if(key.upArrow){setPluginCenter((current:PluginCenterModel|null)=>current?movePluginCenterSelection(current,-1):current);return;}
        if(key.downArrow){setPluginCenter((current:PluginCenterModel|null)=>current?movePluginCenterSelection(current,1):current);return;}
        if(ch==='t'){void actOnPluginCenter('trust');return;}
        if(ch==='u'){void actOnPluginCenter('untrust');return;}
        if(ch==='q'){void actOnPluginCenter('toggle-quarantine');return;}
        if(ch==='r'){const row=selectedPlugin(pluginCenter);void loadPluginCenter(row?.id);return;}
        return;
      }
      if(hookCenter){
        if(key.ctrl&&(ch==='c'||ch==='C')){if(state.running)cancelActiveRun();else setHookCenter(null);return;}
        if(key.escape){setHookCenter(null);return;}
        if(key.upArrow){setHookCenter((current:HookCenterModel|null)=>current?moveHookCenterSelection(current,-1):current);return;}
        if(key.downArrow){setHookCenter((current:HookCenterModel|null)=>current?moveHookCenterSelection(current,1):current);return;}
        if(ch==='d'){void actOnHookCenter('dry-run');return;}
        if(ch==='t'){void actOnHookCenter('trust');return;}
        if(ch==='u'){void actOnHookCenter('untrust');return;}
        if(ch==='q'){void actOnHookCenter('toggle-quarantine');return;}
        if(ch==='r'){const row=selectedHook(hookCenter);void loadHookCenter(row?.id);return;}
        return;
      }
      if(mcpCenter){
        if(key.ctrl&&(ch==='c'||ch==='C')){if(state.running)cancelActiveRun();else setMcpCenter(null);return;}
        if(key.escape||(ch==='q'&&!key.ctrl&&!key.meta)){setMcpCenter(null);return;}
        if(key.upArrow){setMcpCenter((current:McpCenterModel|null)=>current?moveMcpCenterSelection(current,-1):current);return;}
        if(key.downArrow){setMcpCenter((current:McpCenterModel|null)=>current?moveMcpCenterSelection(current,1):current);return;}
        if(key.return||ch==='p'){void actOnMcpCenter('probe');return;}
        if(ch==='t'){void actOnMcpCenter('trust');return;}
        if(ch==='u'){void actOnMcpCenter('untrust');return;}
        if(ch==='r'){const row=selectedMcpServer(mcpCenter);void loadMcpCenter(row?.id);return;}
        return;
      }
      if(contextInspector){
        if(key.escape||key.return||(ch==='q'&&!key.ctrl&&!key.meta)){setContextInspector(null);return;}
        return;
      }
      if(agentTreeOverlay){
        if(key.ctrl&&(ch==='c'||ch==='C')){if(state.running)cancelActiveRun();else setAgentTreeOverlay(null);return;}
        if(key.escape||(ch==='q'&&!key.ctrl&&!key.meta)){setAgentTreeOverlay(null);return;}
        if(key.upArrow){setAgentTreeOverlay((current:AgentTreeOverlayModel|null)=>current?moveAgentTreeSelection(current,-1):current);return;}
        if(key.downArrow){setAgentTreeOverlay((current:AgentTreeOverlayModel|null)=>current?moveAgentTreeSelection(current,1):current);return;}
        if(key.pageUp||key.pageup){setAgentTreeOverlay((current:AgentTreeOverlayModel|null)=>current?moveAgentTreeSelection(current,-5):current);return;}
        if(key.pageDown||key.pagedown){setAgentTreeOverlay((current:AgentTreeOverlayModel|null)=>current?moveAgentTreeSelection(current,5):current);return;}
        if(key.home){setAgentTreeOverlay((current:AgentTreeOverlayModel|null)=>current?{...current,selected:0}:current);return;}
        if(key.end){setAgentTreeOverlay((current:AgentTreeOverlayModel|null)=>current?{...current,selected:Math.max(0,current.rows.length-1)}:current);return;}
        return;
      }
      if(queueEditor){
        const entries:TuiQueueEntry[]=controller.queueEntries(),selected=queueEditorSelected(entries,queueEditor.selected);
        if(queueEditor.editing){
          if(key.escape){setQueueEditor({...queueEditor,editing:false,draft:''});return;}
          if(key.return){if(selected)void controller.editQueue(selected.id,queueEditor.draft).then(()=>setQueueEditor((current:any)=>current?{...current,editing:false,draft:''}:current)).catch((error:unknown)=>addLocal(`Queue edit failed: ${error instanceof Error?error.message:String(error)}`));return;}
          if(key.backspace){setQueueEditor({...queueEditor,draft:queueEditor.draft.slice(0,previousGraphemeBoundary(queueEditor.draft,queueEditor.draft.length))});return;}
          if(ch&&!key.ctrl&&!key.meta){setQueueEditor({...queueEditor,draft:queueEditor.draft+ch});return;}
        }else{
          if(key.escape||(ch==='q'&&!key.ctrl&&!key.meta)){setQueueEditor(null);return;}
          if(key.shift&&key.upArrow&&selected){void controller.moveQueue(selected.id,-1).then(()=>setQueueEditor((current:any)=>current?{...current,selected:Math.max(0,current.selected-1)}:current)).catch((error:unknown)=>addLocal(`Queue move failed: ${error instanceof Error?error.message:String(error)}`));return;}
          if(key.shift&&key.downArrow&&selected){void controller.moveQueue(selected.id,1).then(()=>setQueueEditor((current:any)=>current?{...current,selected:Math.min(Math.max(0,controller.queueEntries().length-1),current.selected+1)}:current)).catch((error:unknown)=>addLocal(`Queue move failed: ${error instanceof Error?error.message:String(error)}`));return;}
          if(key.upArrow){setQueueEditor({...queueEditor,selected:Math.max(0,queueEditor.selected-1)});return;}
          if(key.downArrow){setQueueEditor({...queueEditor,selected:Math.min(Math.max(0,entries.length-1),queueEditor.selected+1)});return;}
          if(ch==='e'&&selected){setQueueEditor({...queueEditor,editing:true,draft:selected.text});return;}
          if(ch==='d'&&selected){void controller.deleteQueue(selected.id).then(()=>setQueueEditor((current:any)=>{const count=controller.queueEntries().length;if(!count)return null;return current?{...current,selected:Math.min(current.selected,count-1)}:current;})).catch((error:unknown)=>addLocal(`Queue delete failed: ${error instanceof Error?error.message:String(error)}`));return;}
          if(ch==='c'){void controller.clearQueue().then(()=>setQueueEditor(null)).catch((error:unknown)=>addLocal(`Queue clear failed: ${error instanceof Error?error.message:String(error)}`));return;}
          if(ch==='r'){if(state.running){addLocal('Finish or cancel the active run before explicitly resuming restored queue work.');return;}void controller.dispatchQueue().then(()=>{if(!controller.queue().length)setQueueEditor(null);}).catch((error:unknown)=>addLocal(`Queue resume failed: ${error instanceof Error?error.message:String(error)}`));return;}
        }
      }
      if(transcriptSearch){
        const items=transcriptItemsForCurrentView();
        const matches=transcriptSearchMatches(items,transcriptSearch.query,transcriptSearch.mode);
        const selected=selectedTranscriptMatch(matches,transcriptSearch.selectedId??transcriptSelectedId);
        const applySelection=(itemId:string|null)=>{setTranscriptSelectedId(itemId);setTranscriptSearch((current:TranscriptSearchState|null)=>current?{...current,selectedId:itemId,notice:null}:current);if(itemId)jumpTranscriptItem(itemId);};
        if(key.escape){setTranscriptSearch(null);return;}
        if(key.tab){
          const mode=transcriptSearch.mode==='literal'?'fuzzy':'literal';
          const nextMatches=transcriptSearchMatches(items,transcriptSearch.query,mode);
          const itemId=selectedTranscriptMatch(nextMatches,transcriptSearch.selectedId??transcriptSelectedId)?.itemId??null;
          setTranscriptSelectedId(itemId);setTranscriptSearch({...transcriptSearch,mode,selectedId:itemId,notice:null});if(itemId)jumpTranscriptItem(itemId);return;
        }
        if(key.meta&&ch.toLowerCase()==='r'){const raw=!transcriptRaw;setTranscriptRaw(raw);setTranscriptSearch({...transcriptSearch,raw,notice:null});return;}
        if(key.meta&&ch.toLowerCase()==='c'){copyTranscriptItem(selected?.itemId??null);return;}
        if(key.upArrow||key.downArrow){const itemId=moveTranscriptSearchSelection(matches,selected?.itemId??null,key.downArrow?1:-1);applySelection(itemId);return;}
        if(key.return){if(selected)jumpTranscriptItem(selected.itemId);setTranscriptSearch(null);return;}
        if(key.backspace){
          const query=transcriptSearch.query.slice(0,previousGraphemeBoundary(transcriptSearch.query,transcriptSearch.query.length));
          const nextMatches=transcriptSearchMatches(items,query,transcriptSearch.mode),itemId=selectedTranscriptMatch(nextMatches,transcriptSearch.selectedId)?.itemId??null;
          setTranscriptSelectedId(itemId);setTranscriptSearch({...transcriptSearch,query,selectedId:itemId,notice:null});if(itemId)jumpTranscriptItem(itemId);return;
        }
        if(ch&&!key.ctrl&&!key.meta){
          const query=transcriptSearch.query+ch,nextMatches=transcriptSearchMatches(items,query,transcriptSearch.mode),itemId=selectedTranscriptMatch(nextMatches,transcriptSearch.selectedId)?.itemId??null;
          setTranscriptSelectedId(itemId);setTranscriptSearch({...transcriptSearch,query,selectedId:itemId,notice:null});if(itemId)jumpTranscriptItem(itemId);return;
        }
        return;
      }
      const vimOwnsInput=boot.phase==='ready'&&!trustCenter&&!mcpCenter&&!hookCenter&&!pluginCenter&&!memoryCenter&&!notesCenter&&!tasksCenter&&!libraryCenter&&!researchCenter&&!automationCenter&&!forgeCenter&&appState.focus.current==='composer'&&vim.enabled&&(vim.mode==='normal'||Boolean(key.escape));
      if(vimOwnsInput){
        const vimResult=handleVimInput({state:vim,editor:currentEditor(),ch,key});
        if(vimResult.handled){setVim(vimResult.state);if(vimResult.editor!==currentEditor())updateEditor(()=>vimResult.editor);setAuxCompletions([]);return;}
      }
      const decision=decideShellInput({
        ch,key,focus:appState.focus.current,composerText:currentEditor().text,commandMenuOpen:appState.focus.current==='command-menu',
        trustCenterOpen:Boolean(trustCenter),approvalExpanded,boot,keymap:effectiveKeymap,
      });
      if(decision.closeTrustCenter){setTrustCenter(null);return;}
      if(decision.approvalScrollDelta!==null){const delta=decision.approvalScrollDelta;setApprovalScroll((value:number)=>Math.max(0,value+delta));return;}
      if(decision.skipBoot)setBoot((current:BootState)=>skipBoot(current));
      const routed=decision.routed;if(!routed)return;
      if(routed.kind==='action'){handleSemanticAction(routed.action,key);return;}
      if(routed.kind==='text'){
        if(appState.focus.current==='provider-picker'&&providerStep.kind==='key'){if(!providerStep.testing){if(providerStep.result)setProviderStep({...providerStep,result:null});setProviderSecret((value:string)=>value+routed.text);}return;}
        if(appState.focus.current==='provider-picker'&&providerStep.kind==='consent'){const letter=routed.text.trim().toLowerCase();if(letter==='y'||letter==='n')setProviderStep({...providerStep,choice:letter==='y'?'yes':'no'});return;}
        if(appState.focus.current==='model-picker'&&modelEffortStep)return;
        if(appState.focus.current==='model-picker'||appState.focus.current==='provider-picker'||appState.focus.current==='session-picker'){setPickerQuery((value:string)=>value+routed.text);setPickerSelection((current:SelectionState)=>({...current,selected:0}));return;}
        if(appState.focus.current==='command-menu'){updateEditor(editor=>editInsert(editor,routed.text));commandMenuSelectionStore.reset();setPickerSelection((current:SelectionState)=>({...current,selected:0}));return;}
        setAuxCompletions([]);updateEditor(editor=>routed.text.length>1||routed.text.includes('\n')?insertPaste(editor,routed.text):editInsert(editor,routed.text));
      }
      });
    });

    const layoutState={...state,usage:contextStatus??state.usage};
    const layout=deriveShellLayout({
      state:layoutState,appState,viewport,
      terminalRows:terminalSize?.rows??Number(stdout?.rows??process.stdout.rows??30),terminalColumns:terminalSize?.columns??Number(stdout?.columns??process.stdout.columns??100),
      projectRoot,currentModelContextWindow:null,queuedActions,busySince,
      bullet:theme.glyphs.bullet,branch:theme.glyphs.branch,
    });
    const {rows,columns,activity,visual,shortcutLine,rosterLine,queueLine,pickerRowsLimit,footerLine}=layout;
    const visibleTranscriptItems=transcriptItemsForCurrentView();
    const transcriptRows=transcriptWindow(visibleTranscriptItems,viewport);
    const diffView=diff?renderDiffModel(parseUnifiedDiff(diff),columns):null;
    const vimHint=vimModeHint(vim);
    React.useEffect(()=>{
      if(!capabilities.motion||boot.phase!=='ready'||activity.kind==='idle'||activity.kind==='error')return;
      return coordinator.startMotion(()=>setMotionNow(Date.now()));
    },[coordinator,capabilities.motion,boot.phase,activity.kind]);
    const statusStartedAt=activity.startedAt??busySince;
    const statusElapsed=Math.max(0,motionNow-statusStartedAt);
    const statusFrame=frameIndex(statusElapsed,MOTION_FRAME_MS,theme.glyphs.spinner.length);
    const statusText=busyIndicatorText({kind:activity.kind,elapsedMs:statusElapsed,frame:statusFrame,unicode:capabilities.unicode,frames:theme.glyphs.spinner});
    React.useEffect(()=>{
      const total=visibleTranscriptItems.length;
      coordinator.immediate('resize',()=>setViewport((view:TranscriptViewport)=>{
        const pageSize=layout.desiredPageSize,maxOffset=Math.max(0,total-pageSize),offset=Math.min(view.offset,maxOffset);
        if(view.pageSize===pageSize&&view.offset===offset)return view;
        return{...view,pageSize,offset,followingTail:offset===0?true:view.followingTail,unseen:offset===0?0:view.unseen};
      }));
    },[coordinator,layout.desiredPageSize,visibleTranscriptItems.length]);
    if(boot.phase!=='ready'&&boot.phase!=='error')return h(Ink.Box,{key:`boot-${appState.redrawNonce}`,flexDirection:'column',paddingTop:1},h(BootSequence,{state:boot,logo:shouldRenderBootLogo(capabilities),motion:capabilities.motion,unicode:capabilities.unicode,width:columns,accentColor:bootColor,mutedColor:footerColor,onComplete:()=>setBoot((current:BootState)=>completeBoot(current,Date.now()))}),h(Ink.Text,{dimColor:true,color:footerColor},projectRoot));

    const renderPickerRows=(rowsToRender:any[],selected:number,label:(row:any)=>string)=>{const view=pickerWindow(rowsToRender,selected,pickerRowsLimit);return view.rows.map((row,index)=>{const absolute=view.start+index;return h(Ink.Text,{key:`${absolute}-${label(row)}`,inverse:absolute===selected,color:pickerColor},`${absolute===selected?'›':' '} ${label(row)}`);});};
    const renderTranscriptItem=(item:TranscriptItem)=>{const selected=item.id===transcriptSelectedId,prefix=selected?'› ':'';if(transcriptRaw)return h(Ink.Text,{key:item.id,inverse:selected,dimColor:!selected},prefix+transcriptItemRaw(item));if(item.kind==='message')return h(Ink.Box,{key:item.id,flexDirection:'column'},h(Ink.Text,{bold:item.role==='user',color:transcriptColor,inverse:selected},prefix+(item.role==='user'?'You':'TALOS')),h(MarkdownView,{text:item.text,width:columns}));if(item.kind==='reasoning')return h(Ink.Box,{key:item.id,borderStyle:'single',flexDirection:'column'},h(Ink.Text,{dimColor:true,inverse:selected},prefix+'Reasoning'),h(Ink.Text,{dimColor:true},item.text||' '));if(item.kind==='tool'){const rendered=toolRowView(item,columns,appState.expandedTools);return h(Ink.Box,{key:item.id,flexDirection:'column'},h(Ink.Text,{color:toolColor,inverse:selected},prefix+rendered.title+' · '+rendered.statusLabel),...rendered.detailLines.map((line,index)=>h(Ink.Text,{key:index,dimColor:true},line)));}if(item.kind==='warning')return h(Ink.Text,{key:item.id,dimColor:true,inverse:selected},prefix+item.text);const detail=item.message?' · '+item.message:'';return h(Ink.Text,{key:item.id,dimColor:true,inverse:selected},prefix+'Run · '+item.status+detail);};

    let overlayNode:any=null;
    if(contextInspector)overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},...contextInspectorLines(contextInspector,{width:columns}).map((line,index)=>h(Ink.Text,{key:`context-${index}`,color:index===0?pickerColor:undefined,dimColor:index>0},line)));
    else if(agentTreeOverlay)overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},...agentTreeOverlayLines(agentTreeOverlay,{width:columns,nowMs:motionNow,currentSessionId:controller.current(),running:state.running}).map((line,index)=>h(Ink.Text,{key:`agent-tree-${index}`,color:index===0?pickerColor:undefined,bold:/COLLISION/u.test(line),dimColor:index>0&&!/COLLISION/u.test(line)},line)));
    else if(trustCenter)overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},...renderTrustCenterLines(trustCenter).map((line,index)=>h(Ink.Text,{key:`trust-${index}`,dimColor:index>0},line)),h(Ink.Text,{dimColor:true},'Esc / Enter / q closes'));
    else if(mcpCenter)overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},...renderMcpCenterLines(mcpCenter).map((line,index)=>h(Ink.Text,{key:`mcp-${index}`,color:index===0?pickerColor:undefined,dimColor:index>0},line)));
    else if(hookCenter)overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},...renderHookCenterLines(hookCenter).map((line,index)=>h(Ink.Text,{key:`hook-${index}`,color:index===0?pickerColor:undefined,dimColor:index>0},line)));
    else if(pluginCenter)overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},...renderPluginCenterLines(pluginCenter).map((line,index)=>h(Ink.Text,{key:`plugin-${index}`,color:index===0?pickerColor:undefined,dimColor:index>0},line)));
    else if(memoryCenter)overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},...renderMemoryCenterLines(memoryCenter).map((line,index)=>h(Ink.Text,{key:`memory-${index}`,color:index===0?pickerColor:undefined,dimColor:index>0},line)));
    else if(notesCenter)overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},...renderNotesCenterLines(notesCenter).map((line,index)=>h(Ink.Text,{key:`notes-${index}`,color:index===0?pickerColor:undefined,dimColor:index>0},line)));
    else if(tasksCenter)overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},...renderTasksCenterLines(tasksCenter).map((line,index)=>h(Ink.Text,{key:`tasks-${index}`,color:index===0?pickerColor:undefined,dimColor:index>0},line)));
    else if(forgeCenter)overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},...renderForgeCenterLines(forgeCenter).map((line,index)=>h(Ink.Text,{key:`forge-${index}`,color:index===0?pickerColor:undefined,dimColor:index>0},line)));
    else if(automationCenter)overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},...renderAutomationCenterLines(automationCenter).map((line,index)=>h(Ink.Text,{key:`automation-${index}`,color:index===0?pickerColor:undefined,dimColor:index>0},line)));
    else if(researchCenter)overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},...renderResearchCenterLines(researchCenter).map((line,index)=>h(Ink.Text,{key:`research-${index}`,color:index===0?pickerColor:undefined,dimColor:index>0},line)));
    else if(libraryCenter)overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},...renderLibraryCenterLines(libraryCenter).map((line,index)=>h(Ink.Text,{key:`library-${index}`,color:index===0?pickerColor:undefined,dimColor:index>0},line)));
    else if(queueEditor)overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},...queueEditorLines({entries:controller.queueEntries(),selected:queueEditor.selected,paused:controller.queuePaused(),editing:queueEditor.editing,draft:queueEditor.draft}).map((line,index)=>h(Ink.Text,{key:`queue-${index}`,color:index===0?pickerColor:undefined,dimColor:index>0},line)));
    else if(appState.overlay?.kind==='help')overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},h(Ink.Text,{bold:true,color:pickerColor},'Help'),h(Ink.Text,null,helpDialogText(effectiveKeymap)),h(Ink.Text,{dimColor:true},'Esc / Enter / ? closes help'));
    else if(appState.overlay?.kind==='approval'&&pending){const model=approvalDialogModel(pending,{expanded:approvalExpanded});overlayNode=renderApprovalDialog(h,Ink,model,{accentColor:approvalColor,columns,rows,scrollOffset:approvalScroll});}
    else if(transcriptSearch)overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},...transcriptSearchLines({items:visibleTranscriptItems,state:{...transcriptSearch,selectedId:transcriptSelectedId,raw:transcriptRaw},raw:transcriptRaw}).map((line,index)=>h(Ink.Text,{key:`transcript-search-${index}`,color:index===0?pickerColor:undefined,dimColor:index>0},line)));
    else if(appState.overlay?.kind==='model')overlayNode=modelEffortStep
      ?h(Ink.Box,{borderStyle:'round',flexDirection:'column'},
        h(Ink.Text,{bold:true,color:pickerColor},`Reasoning effort · ${modelEffortStep.name}`),
        h(Ink.Text,{dimColor:true},'Only efforts affirmed for this model are shown. “model default” sends no effort override.'),
        ...renderPickerRows(effortRows,pickerSelection.selected,(choice:ReasoningEffortChoice)=>choice==='default'?'model default':choice))
      :h(Ink.Box,{borderStyle:'round',flexDirection:'column'},
        h(Ink.Text,{bold:true,color:pickerColor},`Model · ${modelList.label||appState.overlay.provider||''} · ${modelList.loading?'loading':modelList.verified?'live list':'NOT VERIFIED'}`),
        modelList.notice?h(Ink.Text,{dimColor:modelList.loading||modelList.verified},modelList.notice):null,
        h(Ink.Text,{dimColor:true},`search: ${pickerQuery||'—'} · ${filteredModels.length} models`),
        ...renderPickerRows(filteredModels,pickerSelection.selected,(row:TuiModel)=>{const remote=row.id.slice(row.provider.length+1);const efforts=row.reasoningEfforts?.length?` · effort ${row.reasoningEfforts.join('/')}`:'';return `${row.name}${row.name!==remote?` · ${remote}`:''}${row.contextWindow?` · ${row.contextWindow}`:''}${row.reasoning?' · reasoning':''}${efforts}${row.images?' · image':''}${modelList.verified||modelList.loading?'':' [not verified]'}`;}));
    else if(appState.overlay?.kind==='provider'&&providerStep.kind==='consent'){
      const asked=consentQuestion(providerStep.provider);const choice=providerStep.choice;
      overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},h(Ink.Text,{bold:true,color:pickerColor},`Provider · ${providerStep.provider.label}`),h(Ink.Text,null,asked.question),
        ...asked.options.map(option=>h(Ink.Text,{key:option.choice,inverse:option.choice===choice,color:pickerColor},`${option.choice===choice?'›':' '} ${option.label}`)),
        h(Ink.Text,{dimColor:true},'Enter confirms · Esc cancels · the answer is remembered, the key is not stored'));
    }
    else if(appState.overlay?.kind==='provider'&&providerStep.kind==='key'){
      const label=providerStep.provider.label;
      /* B1 slice 18: a one-token key test is stated on this step, before Enter sends it; no further question is asked. */
      const keyTestNotice=typeof catalog?.keyTestNotice==='function'?catalog.keyTestNotice(providerStep.provider.id):null;
      /* B1 slice 25: a provider whose saved key is benched says so here, with the cause and until when, before another key is typed. */
      const remediation=providerStep.remediation?.message??null;
      const benched=!remediation&&providerStep.provider.benched?`${benchedKeyText(label,providerStep.provider.benched)}. Enter another key to test it, or Esc to wait.`:null;
      overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},h(Ink.Text,{bold:true,color:pickerColor},`Provider · ${label}`),
        remediation?h(Ink.Text,null,remediation):null,
        benched?h(Ink.Text,null,benched):null,
        h(Ink.Text,null,`API key for ${label}: ${maskedSecret(providerSecret)}${providerSecret?'':' '}`),
        keyTestNotice?h(Ink.Text,null,keyTestNotice):null,
        providerStep.testing?h(Ink.Text,{dimColor:true},`Testing the key with ${label}…`)
        :providerStep.result?h(Ink.Text,null,`${providerStep.result.message} The key was not saved.`)
        :h(Ink.Text,{dimColor:true},'Enter tests the key; it is saved only if the test passes · Esc cancels'));
    }
    else if(appState.overlay?.kind==='provider')overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},h(Ink.Text,{bold:true,color:pickerColor},'Provider'),h(Ink.Text,{dimColor:true},`search: ${pickerQuery||'—'} · Enter chooses`),...renderPickerRows(filteredProviders,pickerSelection.selected,(row:TuiProvider)=>`${row.label} · ${providerKeySourceLabel(row)} · ${row.local?'local':'cloud'}${row.endpointHost?` · ${row.endpointHost}`:''}`));
    else if(appState.overlay?.kind==='session')overlayNode=h(Ink.Box,{borderStyle:'round',flexDirection:'column'},h(Ink.Text,{bold:true,color:pickerColor},`${appState.overlay.action==='resume'?'Resume':'Fork'} session`),h(Ink.Text,{dimColor:true},`search: ${pickerQuery||'—'}`),...renderPickerRows(filteredSessions,pickerSelection.selected,(row:any)=>`${row.pinned?'★ ':''}${row.title||row.id} · ${row.project||row.path||'—'}${row.model?` · ${row.model}`:''}${row.tags?.length?` · ${row.tags.map((tag:string)=>`#${tag}`).join(' ')}`:''}`));

    return h(Ink.Box,{key:`main-${appState.redrawNonce}`,flexDirection:'column'},
      h(Ink.Text,{bold:true,color:bootColor},headerLine({workspace:projectRoot,status:boot.phase==='error'?'degraded':'interactive'})),
      ...transcriptRows.map((item:TranscriptItem)=>renderTranscriptItem(item)),
      diffView?h(Ink.Box,{borderStyle:'round',flexDirection:'column'},h(Ink.Text,{bold:true},`Diff · ${diffView.mode}`),...diffView.lines.map((line,index)=>h(Ink.Text,{key:index,bold:line.kind==='file'||line.kind==='hunk'||line.kind==='add'||line.kind==='remove',dimColor:line.kind==='meta'||line.kind==='context'||line.kind==='no-newline'||line.kind==='plain'},line.text))):null,
      overlayNode,
      auxCompletions.length&&!appState.overlay&&!queueEditor&&!transcriptSearch&&!contextInspector&&!mcpCenter&&!hookCenter&&!pluginCenter&&!memoryCenter&&!notesCenter&&!tasksCenter&&!libraryCenter&&!researchCenter&&!automationCenter&&!forgeCenter?h(Ink.Box,{flexDirection:'column'},...auxCompletions.map((value:string)=>h(Ink.Text,{key:value,dimColor:true},`  ${value}`))):null,
      appState.focus.current==='command-menu'?h(CommandMenuView,{composerStore,selectionStore:commandMenuSelectionStore,rowsLimit:pickerRowsLimit}):null,
      h(Ink.Text,{color:footerColor},statusText),
      h(ComposerView,{store:composerStore,vimHint}),
      h(Ink.Text,{dimColor:true,color:footerColor},shortcutLine),
      ...(agentRows.length
        ?agentRows.map((row:AgentRosterRow)=>h(Ink.Text,{key:`agent-roster-${row.id}`,color:row.hasCollision?approvalColor:footerColor,bold:row.hasCollision},agentRosterLine({row,width:columns,nowMs:motionNow})))
        :[h(Ink.Text,{key:'agent-roster-main',color:footerColor},rosterLine)]),
      queueLine?h(Ink.Text,{dimColor:true,color:footerColor},queueLine):null,
      (currentModelMeta?.reasoning===true||reasoningEffort!==null)?h(Ink.Text,{dimColor:true,color:footerColor},`Reasoning · effort ${reasoningEffort??'model default'} · ${reasoningUsageLabel(state.usage)}`):null,
      h(Ink.Text,{dimColor:true,color:footerColor},footerLine),
    );
  };
}
