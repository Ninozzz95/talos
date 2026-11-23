import {activeCredentialStore,credentialStoreName,keySavedText} from '../provider/store.ts';
import {looksItalian} from '../i18n/kernel-map.ts';
import {ZAI_ADDRESSES,ZAI_PROVIDER} from '../provider/zai-addresses.ts';
import {setupSheet,type SetupCheck,type SetupKeyView,type SetupNote,type SetupProvider,type SetupState} from './panel/setup-sheet.ts';
import {developmentLog,developmentLogError,developmentTextEvidence} from '../diagnostics/development-log.ts';
import {describeError,errorViewLines} from '../i18n/error-view.ts';
import {t,tn,type MessageId} from '../i18n/index.ts';
import {execFile} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {basename,join,resolve} from 'node:path';
import {createHostLease} from '../automations/host-lease.ts';
import {promisify} from 'node:util';
import type {CliInvocation} from '../args.ts';
import type {CliPaths} from '../paths.ts';
import type {CliContextStatus,CliRuntime,CliSessionSummary,ElicitationResponse,PlanDecisionKind} from '../runtime/types.ts';
import {modeInUntrustedFolder,type AutoClassifier} from '../security/permission-engine.ts';
import type {PermissionMode,RuleSetInput} from '../security/types.ts';
import type {TuiCatalogService,TuiKeySave,TuiModel,TuiProvider,TuiProviderProbe,TuiReadiness} from './catalog-service.ts';
import {benchedKeyText,PROVIDERS_NEVER_CHECKED,unusableKeyRefusal} from './catalog-service.ts';
import {providerOfModel,screenChildEnvironment} from '../provider/environment-keys.ts';
import {createBootSequenceComponent} from './boot/boot-sequence.ts';
import {createResumeIndicatorComponent} from './resume-indicator.ts';
import {completeBoot,initialBootState,markBootError,markBootReady,shouldRenderBootLogo,skipBoot,type BootState} from './boot/boot-sequence.ts';
import {commandMenuFastTextInput,commandMenuHighlight,commandMenuItems,commandMenuOverlay,completeCommandSelection,createCommandMenuSelectionStore,type CommandMenuSelection,type CommandMenuSelectionStore} from './components/command-menu.ts';
import {applyComposerFastEditorAction,applyComposerFastPasteInput,composerFastEditorAction,composerFastPasteInput,composerFastTextInput,composerOwnsPaste,createComposerStore,planComposerHistoryAction,reverseHistoryMatch,type ComposerStore} from './components/composer.ts';
import {FOOTER_TWO_ROWS_FROM,footerModeRow,footerModelRow,footerZenRow,headerRow} from './components/chrome-rows.ts';
import {frameShape,nextFrameView,viewColumns,type FrameView} from './regions/frame-shape.ts';
import {BAR_BOTTOM,BAR_GROUPS,BAR_TOP,barEntries,sideBarRows,type BarEntry,type BarSession} from './regions/side-bar.ts';
import {agentsCard,contextCard,PANEL_CARDS,sidePanelRows} from './regions/side-panel.ts';
import {createMarkdownParseMemo,markdownBlockWidth,markdownBlockLines,markdownRenderPropsEqual,markdownSafeText,parseMarkdownInline,type MarkdownInlineToken} from './components/markdown.ts';
import {renderDiffModel} from './components/diff.ts';
import {parseUnifiedDiff} from './diff-model.ts';
import {activityClock,activityRow,activityView,phaseKey,trackPhase,type PhaseMark} from './activity-line.ts';
import {isAnimatedActivity,retryCountdownEnd} from './live-activity.ts';
import {smallWindowNotice,usageFacts,usageViewText} from './usage-view.ts';
import {exportChosen,exportFileName,exportSession} from './session-export.ts';
import {secretValuesFromEnvironment} from '../diagnostics/redact.ts';
import {busyCommand,busyEnterAction,busyTip,tipsOnEnter} from './busy-input.ts';
import {saveUiPreference,useUiPreferences} from './ui-preferences.ts';
import {thoughtGlyph,thoughtHint,thoughtLine,visibleTranscriptItems as visibleItemsOf} from './components/thinking-row.ts';
import {ANSWER_INDENT,PROMPT_LEAD,TURN_INDENT,promptRows} from './components/conversation-rows.ts';
import type {UiBusyInput,UiReasoning,UiToolRows} from '../config/types.ts';
import {frameRowsFor,shellSafeText} from './components/terminal-shell.ts';
import {homeRows,type HomeSession} from './components/home.ts';
import {restingMedal} from './boot/cinematic.ts';
import {panelWhen} from './panel/when.ts';
import {toolRowView} from './components/tool-row.ts';
import {agentResultLines} from './components/agent-result.ts';
import {answersRows} from './components/question-receipt.ts';
import {planReceiptRows} from './components/plan-receipt.ts';
import {dialogueRows} from './components/agent-dialogue.ts';
import {cardKeysOf,openQuestionCard,questionCardClick,questionCardKey,questionCardTick,type CardOutcome,type QuestionCardState} from './question-card.ts';
import {fitCardRows} from './card-fit.ts';
import {questionCardRows} from './question-card-rows.ts';
import {openPlanCard,planCardClick,planCardKey,planCardRows,type PlanCardState,type PlanOutcome} from './plan-card.ts';
import {elicitCardClick,elicitCardKey,elicitCardRows,openElicitCard,type ElicitCardState,type ElicitOutcome} from './elicit-card.ts';
import {pairingKeyOf,remoteCardRows} from './remote-card.ts';
import {runPairingFlow,type PairingIo,type PairingKey} from '../remote/pairing-flow.ts';
import type {PairingState} from '../remote/pairing-view.ts';
import {cleanDeviceName} from '../remote/device-name.ts';
import {deviceRows} from './panel/devices-page.ts';
import {CONSENT_PANEL_IDLE_MS,consentCardClick,consentCardKey,consentCardRows,consentCardWaits,consentPanelInUse,openConsentCard,type ConsentCardState,type ConsentOutcome} from './consent-card.ts';
import {asPage,COMMAND_PAGES,pageRows} from './panel/page.ts';
import {projectsOf,type ProjectSession} from './panel/projects-page.ts';
import {queueBandRows,type BandEntry} from './regions/queue-band.ts';
import {createPageLoader,loadingPanel} from './panel/loading.ts';
import {requestRelaunch,RELAUNCHED_ENV} from '../relaunch.ts';
import {listTrustedFolders} from '../security/trust-authority.ts';
import {shelfAutomation,shelfProjects,type ShelfColors,type ShelfState,type ShelfView} from './panel/shelf.ts';
import {terminalTrueColor} from './terminal-capabilities.ts';
import {createTerminalSessionPlan} from './terminal-session.ts';
import {listItems,panelClick,panelHeight,panelKey,panelRows,type Panel,type PanelStep,type SheetKey} from './panel/sheet.ts';
import {compactTokens} from './status-bar.ts';
import {modelRowOf,setupDescOf} from './model-rows.ts';
import {providerViewOf} from './provider-rows.ts';
import {overlayAsPanel} from './panel/from-overlay.ts';
import type {UndoPoint} from './panel/commands.ts';
import {randomUUID} from 'node:crypto';
import {sessionMark,sessionState,type SessionState} from './session-state.ts';
import {boardKeep,type BoardRow} from './panel/board.ts';
import {capabilityTools} from './panel/capability-page.ts';
import type {McpServerView} from '../services/mcp-facade.ts';
import type {HookView} from '../services/hook-facade.ts';
import type {PluginView} from '../services/plugin-facade.ts';
import {unavailableContextStatus} from '../runtime/context-status.ts';
import {type SystemView,systemTabBody,processesRedraw,automationsSheet,devicesSheet,processesSheet,doctorSheet,forgeSheet,researchSheet,projectsSheet,capabilitySheet,boardSheet,contextSheet,homeSheet,leaveSheet,shelfSheet,usageSheet,busySheet,clearSheet,copySheet,diffSheet,helpSheet,librarySheet,memorySheet,notesSheet,permissionsSheet,queueSheet,tasksSheet,compactSheet,modelSheet,providerSheet,effortSheet,exportSheet,forkSheet,undoSheet,sizeText,historySheet,planSheet,renameSheet,resumeSheet,retrySheet,sheetStep,type SheetAction,type SheetState} from './panel/commands.ts';
import {copyText} from './clipboard.ts';
import {openInBrowser} from '../provider/openrouter-login.ts';
import {PLAN_FEEDBACK_MAX,planEditFeedback} from '../runtime/plan-feedback.ts';
import {renderStyledRows,type HitRegister,type StyledRow} from './components/styled-rows.ts';
import {FRAME_BLOCKS,frameMemo,inHiddenBox,hitAt,hitElementAt,hitTargets,type HitTarget} from './hit-map.ts';
import {questionTimeoutMs,type UiQuestionTimeout} from '../config/types.ts';
/* Lane RD contract (R3): toolRowView(row,width,expanded,now?) draws `running 12 s` from `now`; a renderer without the
   parameter ignores it. */
const toolRowWithClock:(row:Parameters<typeof toolRowView>[0],width:number,expanded:boolean,now?:number)=>ReturnType<typeof toolRowView>=toolRowView;
import {groupExploration,toggleOpenItem,toolGroupHint,toolGroupLine,toolGroupOpenRows,toolGroupWorking,type TranscriptDisplayItem} from './components/tool-group.ts';
const NO_OPEN_ITEMS:ReadonlySet<string>=new Set();
import {countAboveView,createTranscriptMeasurementStore,estimateTranscriptItemRows,planTranscriptVirtualWindow,promptStartsAboveView,textRows,transcriptAnnouncementRow,transcriptJumpPillRow,transcriptMeasurementKey,type TranscriptMeasurementStore} from './components/transcript-virtualizer.ts';
import {copySelection,createEditorState,deleteBackward,deleteForward,draftDisplayText,draftOf,editInsert,editorFromDraft,insertPaste,killToEnd,killToStart,killWordBackward,moveCursor,moveVertical,moveWord,previousGraphemeBoundary,redoEditor,replaceEditorText,undoEditor,yank,type EditorDraft,type EditorState} from './editor.ts';
import {editExternally,openFileInEditor} from './external-editor.ts';
import {diffSubtitle,gitDiffFiles,untrackedDiffFile} from './diff-files.ts';
import {turnDiffs} from './turn-diffs.ts';
import {taskViews} from './task-views.ts';
import {noteViews} from './note-views.ts';
import {fileRows,memoryRows} from './memory-views.ts';
import {libraryRows} from './library-views.ts';
import {findTalosRepoRoot,importTalosModule} from '../runtime/repo.ts';
import {kernelSecretClassifier} from '../security/permission-dry-run.ts';
import {recentViews,ruleViews} from './permission-views.ts';
import {addRule,changeRule,readRuleRows,type RuleRow} from '../security/permission-rules-store.ts';
import {openTranscriptMode,transcriptModeHeader,transcriptModeHelp,transcriptModeKey,transcriptModeMarks,transcriptModeOpen,transcriptModePromptOf,transcriptModePromptRow,transcriptModeStamp,transcriptModeStatus,transcriptModeTurn,type TranscriptModeItem,type TranscriptModeState} from './transcript-mode.ts';
import {MOUSE_OFF,MOUSE_ON} from './mouse.ts';
import {formatExitOutput} from './exit-output.ts';
import {FILE_COMPLETION_MAX_ROWS,completeProjectFiles,fileCompletionOverlay,type CompletionSource,type ProjectPathRow} from './file-completion.ts';
import {createProjectFileIndexCache} from './project-file-index.ts';
import {permissionRuleCounts,usageLine} from './status-view.ts';
import {filterHistory,historyPickerOverlay,type HistoryPicker} from './overlays/history-picker.ts';
import {closeFocus,createFocusState,dropFocus,openFocus} from './focus-manager.ts';
import {createInterruptController,EXIT_CONFIRM_WINDOW_MS,exitHintText,type ExitKey,type InterruptDecision} from './interrupt.ts';
import {bootPlan,branchFrom,currentBuildId,type BootPlan} from './launch-state.ts';
import {sessionDigest,sessionTurns} from '../sessions/digest.ts';
import {CLI_VERSION,TALOS_BASE_COMMIT} from '../version.ts';
import {KEYBINDINGS,cyclePermissionMode,resolveKeybinding,sanitizeInputText,splitInputChunk,type Keybinding} from './keybindings.ts';
import {researchEditRows,researchEditStep,APPROVAL_DEFAULT_SELECTED,approvalCardRows,approvalChoicesFor,approvalClickChoice,approvalDefaultSelected,approvalDialogModel,approvalInputGate,approvalKeyOutcome} from './overlays/approval-dialog.ts';
import type {UserApprovalChoice} from './approval.ts';
import {fitOverlay,renderFittedOverlay,renderOverlay,type FittedOverlay,type OverlayContent} from './overlays/scroll-window.ts';
import {commitModelSelection,createModelPickerModel,modelPickerOverlay,type ModelPickerModel} from './overlays/model-picker.ts';
import {effortLineOverlay,orderedEfforts} from './overlays/effort-line.ts';
import type {OverlayState} from './overlays/overlay-host.ts';
import {consentQuestion,createProviderPickerModel,maskedSecret,providerConsentOverlay,providerKeyOverlay,providerKeySourceLabel,providerPickerEnter,providerPickerItems,providerPickerOverlay,type ConsentChoice,type ProviderPickerModel,providerLoginChoiceOverlay,providerAddressOverlay,providerOAuthOverlay,type LoginChoice,KEY_ACTIONS,keyActionsFor,providerKeyActionsOverlay,type KeyAction} from './overlays/provider-picker.ts';
import {createSessionPickerModel,filterSessions,sessionPickerOverlay,type SessionPickerModel} from './overlays/session-picker.ts';
import {stoppableAgent} from './overlays/agent-tree.ts';
import {createAgentView,type AgentViewState} from './agent-view.ts';
import {agentRosterRows,resolveAgentTargets,type AgentRosterRow} from './agent-roster.ts';
import {workingAgents,type LiveAgent} from './live-agents.ts';
import {agentReply,simpleQuestion} from './agent-questions.ts';
import {withToast,AGENT_TABS,AGENT_VIEWS,AGENTS_CLOSED,agentCards,agentsCount,agentsOrder,agentsPageRows,agentsPill,cycleAgentsSurface,moveAgentSelection,openAgentsPage,showAgentsSurface,type AgentCard,type AgentsStep,type AgentsSurface} from './agents-panel.ts';
import {EXIT_CHOICES,exitWaitDone,exitWithAgentsOverlay} from './exit-with-agents.ts';
import {helpDialogOverlay} from './overlays/help-dialog.ts';
import {queueEditorOverlay,queueEditorSelected} from './overlays/queue-editor.ts';
import {contextInspectorOverlay} from './overlays/context-inspector.ts';
import {createTranscriptSearchState,moveTranscriptSearchSelection,selectedTranscriptMatch,transcriptSearchMatches,transcriptSearchOverlay,type TranscriptSearchState} from './overlays/transcript-search.ts';
import {trustCenterModel,trustCenterOverlay,type TrustCenterModel} from './overlays/trust-center.ts';
import {createMcpCenterModel,moveMcpCenterSelection,mcpCenterOverlay,replaceMcpCenterRow,selectedMcpServer,type McpCenterModel} from './overlays/mcp-center.ts';
import {createMcpFacade} from '../services/mcp-facade.ts';
import {createHookCenterModel,moveHookCenterSelection,hookCenterOverlay,replaceHookCenterRow,selectedHook,type HookCenterModel} from './overlays/hook-center.ts';
import {createHookFacade} from '../services/hook-facade.ts';
import {createPluginCenterModel,movePluginCenterSelection,pluginCenterOverlay,selectedPlugin,type PluginCenterModel} from './overlays/plugin-center.ts';
import {createPluginFacade} from '../services/plugin-facade.ts';
import {createMemoryCenterModel,moveMemoryCenterSelection,memoryCenterOverlay,selectedMemory,type MemoryCenterModel} from './overlays/memory-center.ts';
import {createMemoryFacade} from '../services/memory-facade.ts';
import {createNotesCenterModel,moveNotesCenterSelection,notesCenterOverlay,selectedNote,type NotesCenterModel} from './overlays/notes-center.ts';
import {createNotesFacade,type NoteTargetKind} from '../services/notes-facade.ts';
import {createTasksCenterModel,moveTasksCenterSelection,tasksCenterOverlay,selectedTask,type TasksCenterModel} from './overlays/tasks-center.ts';
import {createTaskBoardFacade} from '../services/task-board-facade.ts';
import {createLibraryCenterModel,moveLibraryCenterSelection,libraryCenterOverlay,selectedLibraryEntry,setLibraryCenterDuplicateScan,setLibraryCenterPreview,type LibraryCenterModel} from './overlays/library-center.ts';
import {attachLibraryContextToken,createLibraryFacade,detachLibraryContextToken} from '../services/library-facade.ts';
import {createResearchCenterModel,moveResearchCenterSelection,researchCenterOverlay,selectedResearch,setResearchCenterDetail,type ResearchCenterModel} from './overlays/research-center.ts';
import {createResearchFacade,type ResearchExportFormat} from '../services/research-facade.ts';
import {createAutomationCenterModel,moveAutomationCenterSelection,automationCenterOverlay,selectedAutomation,setAutomationCenterDetail,type AutomationCenterModel} from './overlays/automation-center.ts';
import {createAutomationFacade} from '../services/automation-facade.ts';
import {createForgeCenterModel,moveForgeCenterSelection,forgeCenterOverlay,selectedForgeTool,setForgeCenterDetail,type ForgeCenterModel} from './overlays/forge-center.ts';
import {createForgeFacade} from '../services/forge-facade.ts';
import {createTrustAuthority} from '../security/trust-authority.ts';
import {createSessionMetadataStore,sessionMetadataRoot} from '../sessions/metadata-store.ts';
import {moveSelection,type SelectionState} from './selection-list.ts';
import {createTuiSessionController,TuiNotReadyError,type PendingTuiApproval,type PendingTuiElicitation,type PendingTuiPlan,type PendingTuiQuestion,type PendingAgentQuestion,type TuiQueuedAction,type TuiQueueEntry,type TuiSteerState,type TuiKernelQueue} from './session-controller.ts';
import {queuedTranscriptItems} from './queued-items.ts';
import {helpCommands,parseSlashCommand,SLASH_COMMANDS} from './slash-commands.ts';
import {freshConversationView,initialTuiState,reasoningUsageLabel,reduceTuiEvent,type TuiState} from './state.ts';
import {appendTranscriptAnswers,appendTranscriptMessage,appendTranscriptWarning,EARLIER_ROW_ID,revealEarlier,summarizeEarlier,transcriptItemRaw,transcriptItemText,type TranscriptItem} from './transcript-model.ts';
import {earlierRowText} from './components/earlier-row.ts';
import type {TerminalCapabilities} from './terminal-capabilities.ts';
import {createTuiTheme,themeColor} from './theme.ts';
import {DEFAULT_THEME_ACCENT,type ThemeAccentId} from './theme-catalog.ts';
import {THEME_CHOICES,createThemeStore,parseThemeChoice,type LiveTheme,type ThemeStore} from './theme-store.ts';
import {THEME_PAGE,themeLabel,themePageRows} from './overlays/theme-picker.ts';
/* stage 7.18: the /theme page's themes, in the mockup's order (Mono stays /theme mono) */
const PAGE_THEMES:readonly UiTheme[]=THEME_PAGE.map(row=>row.id);
import {createConfigPanelStore,loadConfigPanelValues} from './config-panel.ts';
import {configPanelOverlay} from './overlays/config-panel.ts';
import {CHECKPOINT_ROW_FILES,checkpointFilesText,rangeFiles,undoRange,type UndoPicker} from './overlays/checkpoint-picker.ts';
import {undoPoints} from './undo-points.ts';
import {fullAccessConfirmationOverlay} from './overlays/full-access-confirmation.ts';
import {requestTooLargeAttachable,requestTooLargeOverlay} from './overlays/request-too-large.ts';
import {isRequestTooLarge,requestTooLargeOf,type RequestTooLarge} from '../runtime/request-too-large.ts';
import {checkpointChanges,createCheckpointStore,sessionCheckpoints,type CheckpointStore} from '../workspace/checkpoint-store.ts';
import {reapplyToCheckpoint,rewindToCheckpoint} from '../workspace/restore.ts';
import {safeGitArgs,safeGitDiffArgs} from '../workspace/safe-git.ts';
import {hasActiveRuns} from '../runtime/active-run.ts';
import {PROMPT_HISTORY_LIMIT,createPromptHistoryStore,promptHistoryEnabled,type PromptHistoryStore} from './prompt-history-store.ts';
import {REASONING_EFFORTS,type ReasoningEffort,type UiTheme} from '../config/types.ts';
import type {TuiStartup} from './startup.ts';
import {configSet,configUnset} from '../config/commands.ts';
import {loadEffectiveConfig} from '../config/load.ts';
import {settingsSheet,type SettingsState,type SettingsTab} from './panel/settings-sheet.ts';
import {compactAtShare,contextOf,homePath,osName,statusLines,terminalName,usageLines,type McpRow} from './settings-rows.ts';
import {settingChanges,settingDefs,settingFields} from './settings-config.ts';
import {createUsageRecorder,createUsageRecordWriter,readUsageHistory,readUsageRecord,usageRecordFile} from '../sessions/usage-record.ts';
import {homedir,release as osRelease} from 'node:os';
import {osc52CopySequence,reduceViewport,transcriptEventAddsItem,type TranscriptViewport} from './components/transcript.ts';
import {
  MODEL_ID,NO_MODEL,NO_PROVIDER_MODEL,
  closeOverlay,createTuiAppState,lastProjectToken,modelItems,openOverlay,permissionDryRunSlash,pickerMove,providerItems,queuedActionPreview,reduceAppAction,replaceLastProjectToken,sessionStatusText,slashCommandIntent,slashCommandToCliArgs,togglePlanMode,
  type TuiAppState,
} from './shell-model.ts';
import {deriveShellLayout,pickerWindow} from './shell-layout.ts';
import {budget as layoutBudget,MIN_COLUMNS,MIN_ROWS,type Budget} from './regions/budget.ts';
import {composerMeasure,createRegionViews} from './regions/views.ts';
import {displayWidth,truncateDisplay,truncateMiddle,wrapReadable} from './text-width.ts';
import {decideShellInput} from './shell-input.ts';
import {createRenderCoordinator,type RenderCoordinator} from './render-coordinator.ts';
import {MOTION_FRAME_MS,frameIndex} from './render-scheduler.ts';
import {onboardingSteps} from './onboarding.ts';
import {setupEndLines,setupStart} from './setup-wizard.ts';
import {runToolsCheck} from './setup-tools-check.ts';
import type {OpenRouterLogin} from '../provider/openrouter-login.ts';
import type {TuiChatgptLogin} from './catalog-service.ts';
import {chatgptFailureReason,chatgptSignedInNote} from '../commands/provider-chatgpt.ts';
import {createVimState,handleVimInput,toggleVim,vimModeHint,type VimState} from './vim-mode.ts';

export {closeOverlay,createTuiAppState,permissionDryRunSlash,queuedActionPreview,reduceAppAction,slashCommandIntent,slashCommandToCliArgs,togglePlanMode} from './shell-model.ts';
export type {AppAction,SlashCommandIntent,TuiAppState} from './shell-model.ts';

const execFileAsync=promisify(execFile);
/* R5b D5 (Q-R5-15): the last 1,000 prompts, the same bound in memory and on disk. */
const MAX_HISTORY=PROMPT_HISTORY_LIMIT;
/* B1 slice 18 — until a provider is chosen no model is shown, and until a model of that provider is chosen none is either. */
/* P21: OpenRouter's key step is a choice first (browser sign-in or pasted key), then the sign-in under way. */
type OAuthPhase='waiting'|'paste'|'exchanging'|'failed';
type ProviderStep={kind:'list'}|{kind:'key-actions';provider:TuiProvider;choice:KeyAction;/* signed in, the plan not allowed yet: allow it or sign out */planNeeded?:boolean}|{kind:'consent';provider:TuiProvider;choice:ConsentChoice}|{kind:'login-choice';provider:TuiProvider;choice:LoginChoice;remediation?:TuiProviderProbe['remediation']}|{kind:'oauth';provider:TuiProvider;url:string;mode:'browser'|'paste';opened:boolean;phase:OAuthPhase;message:string|null;/* the ChatGPT plan's sign-in: its own first line, no code to paste */intro?:string;pasteable?:boolean}|{kind:'key';provider:TuiProvider;testing:boolean;result:TuiKeySave|null;remediation?:TuiProviderProbe['remediation']}|{kind:'address';provider:TuiProvider;/* index in ZAI_ADDRESSES */choice:number;route:{allowEnvironmentConsent:boolean;keyActionChosen:boolean}};
/* What the transcript region reports after each plan (R1, E9/E15): the geometry PageUp/PageDown/Ctrl+Home need, and an
   anchor (the newest mounted item and the rows below it) that keeps a scrolled-up view still while content grows below. */
type OverlayPanel={element:any;rows:number};
type TranscriptPlanReport={totalRows:number;maxScroll:number;scrollRows:number;itemRows:number;anchorId:string|null;anchorBelow:number;belowOf:(id:string)=>number|null};
/* R1 lane I (E5): a refresh after a run ends returns equal data in new objects; keeping the old object keeps React from
   committing an identical frame on an idle screen. */
function sameValue(a:unknown,b:unknown){if(a===b)return true;try{return JSON.stringify(a)===JSON.stringify(b);}catch{return false;}}
function errorCode(error:unknown){const code=(error as any)?.code;return typeof code==='string'&&/^[A-Z0-9_]{1,64}$/u.test(code)?code:'UNAVAILABLE';}
/* The provider, catalog and key paths printed only the error's code before R2; the error anatomy keeps it that way (it
   gets the code and nothing else), so no message text of those paths reaches the screen. */
function codeOnly(error:unknown){return{code:errorCode(error)};}
/*
 * R2 (Q-R2-4, gate E6): every error the app shows is lane E's anatomy — headline · what to do · dim "Details: … (CODE)
 * · where to look" — with the action that failed in front of the headline; `note` is a fact the person must also read
 * ("The key was not saved."); `rejected` says the action was refused, not broken. The raw message reaches only the
 * details line, through describeError.
 */
export function screenErrorText(error:unknown,context?:string,{note,rejected=false}:{note?:string;rejected?:boolean}={}):string{
  const view=describeError(error);
  const what=note?t('screen.error.withNote',{what:view.what,note}):view.what;
  return errorViewLines({...view,what:context?t(rejected?'screen.error.rejected':'screen.error.context',{context,what}):what}).join('\n');
}
/* One row (a notice inside an overlay): the same parts, joined. */
function screenErrorLine(error:unknown,context?:string){return screenErrorText(error,context).split('\n').join(' · ');}
/* The action that failed: a dictionary label, or a slash command with its operation. */
const act=(id:MessageId,params?:Record<string,string>)=>t(id,params);

/* no console capture (tests, plain mode): nothing counted, a stable store so useSyncExternalStore never resubscribes */
const NO_CONSOLE_WARNINGS=Object.freeze({subscribe:()=>()=>{},getSnapshot:()=>0});
/* 0.6.15: no remote bridge (tests, `-p`): the snapshot of remote control turned off */
const NO_REMOTE_SNAPSHOT=Object.freeze({state:'off' as const,phones:[] as readonly {id:string;name:string}[],elsewhere:null as string|null,consents:[] as readonly {richiestaId:string;device:string;folder:string;expiresAt:number}[],error:null as string|null});
const NO_REMOTE=Object.freeze({subscribe:()=>()=>{},getSnapshot:()=>NO_REMOTE_SNAPSHOT});
export type TuiAppProps={
  runtime:CliRuntime;registry?:any;catalog:TuiCatalogService;invocation:CliInvocation;
  /** Form B, No (a): the fixed line, and every change and command asks. */projectUntrusted?:boolean;
  projectRoot:string;paths:CliPaths;permissionRules:RuleSetInput;
  /** UI Phase 3: the wheel (run.ts / mouse.ts): -1 = up (older rows), +1 = down. */
  mouseWheel?:{subscribe(listener:(delta:-1|1)=>void):()=>void};
  /* stage 6c: the CLI's own selection (pointer-selection.ts, wired in run.ts) */
  mouseSelection?:{subscribe(listener:(info:import('./pointer-selection.ts').CopiedInfo)=>void):()=>void;key():void;active():boolean;copyAgain():Promise<boolean>;onClick?(handler:import('./pointer-selection.ts').ClickHandler|null):void};
  /* owner decision 02/10 (run.ts, console-capture.ts): how many real warnings and errors went to logs/console.log */
  consoleWarnings?:{subscribe(listener:()=>void):()=>void;getSnapshot():number};
  /* 0.6.15 remote control: the window's bridge (src/remote/tui-remote.ts, main.ts); the footer, the consent card and /remote read it */
  remote?:import('../remote/tui-remote.ts').TuiRemote;
  /* owner 14/10 (new boot): run.ts says whether TALOS paints the background, so the boot can lay its glow over a known colour */
  paintedBackground?:boolean;
  terminalNotifications?:import('./notifications.ts').TerminalNotifications;
  autoClassifier?:AutoClassifier;initialPrompt?:string;initialReasoningEffort?:ReasoningEffort|null;startup?:Promise<TuiStartup|null>;configuredModel?:string|null;renderCoordinator?:RenderCoordinator;keymap?:ReadonlyArray<Keybinding>;uiTheme?:UiTheme;terminalSize?:{rows:number;columns:number};
  /* R1 lane contract (X consumes it in run.ts): the last transcript, reported exactly once when the app unmounts. */
  onExit?:(snapshot:{sessionId:string|null;items:readonly TranscriptItem[]})=>void;
  /* R3 approval key race (owner decision): the clock the grace period is measured with; injected by tests. */
  clock?:()=>number;
  /* how long «checking…» may stay for one check (PROVIDER_CHECKING_SHOWN_MS); injected by tests, which do not wait four seconds */
  providerCheckingShownMs?:number;
  /* R3 Q-R3-13 (R0 decision 4): whether shell commands run in a verified sandbox (main.ts passes cliShellIsolation). */
  shellIsolation?:()=>Promise<{verified:boolean;reason?:string;aborted?:boolean}>;
  /* R4 Q-R4-13 (lane F contract): the project files TALOS loaded (e.g. AGENTS.md), passed to onboardingSteps as
     `loadedFiles`; whoever composes the runtime provides them. */
  loadedFiles?:readonly string[];
  /* R5a (Q-R5-7, Q-R5-9): the remembered `ui.busyInput` and `ui.reasoning`; when main.ts does not pass them the app reads
     the effective configuration itself once (ui-preferences.ts). */
  busyInput?:UiBusyInput;reasoning?:UiReasoning;maxProseWidth?:number|null;
  /* stage 7.11 (Settings): the editor of Ctrl+G and the tool rows, as configured; the sheet changes them live */
  editor?:string|null;toolRows?:UiToolRows;startView?:FrameView;
  /* Stage 3: how long a question of the model waits (ui.questionTimeout); read from the configuration when not given. */
  questionTimeout?:UiQuestionTimeout;
};
/* R4 Q-R4-8: the live `@` list — the token it answers, its rows, the highlighted row. */
type FileCompletion={token:string;rows:ProjectPathRow[];selected:number;source?:CompletionSource};

export type ReasoningEffortChoice=ReasoningEffort|'default';
export function reasoningEffortChoices(model:TuiModel):ReasoningEffortChoice[]{
  if(model.reasoning!==true||!Array.isArray(model.reasoningEfforts)||model.reasoningEfforts.length===0)return[];
  /* R5a (owner 2026-09-24): always in TALOS's order, default first, never in the order the model declares them. */
  return['default',...orderedEfforts(model.reasoningEfforts)];
}
export async function selectExplicitModel(id:string,catalog:TuiCatalogService,setControllerModel:(id:string)=>void){await commitModelSelection({id,catalog,setControllerModel});}
/* 0.6.13, D5 of the compaction inventory (owner 21/10/2026): /compact said «Context is already compact.» for ANY `compattato:false`,
   so a summary that failed read as a success. «Already compact» is ONLY nothing to compact: the Context Engine's
   CTX_NOTHING_TO_COMPACT (context-desktop-service.mjs `compact` → `error.code`) or the kernel's `motivo:'niente-da-compattare'`
   (talosHarness.mjs `compattaConversazione`). Every other `false` is a failure with its reason and its code, and nothing replaced
   (opencode: the failure on the session, `packages/core/src/session/compaction.ts:638-646`; pi: «Compaction failed: …»,
   `modes/interactive/interactive-mode.ts:3700-3737`). The registry hands the kernel's `motivo` and `codice` on since r4
   2439d0dae (D5 a); a `false` without them is COMPACTION_FAILED, «the kernel did not say why». */
/* release review S4-1 of 0.6.13 (22/10/2026): every summary reason the kernel has at 06b9ed101 (compattazione-desktop.mjs:494-498 and
   the turn's ceiling of three failures), as the warnings of protocol/v2/events.ts say them; before, these read «did not say why» */
const KERNEL_COMPACTION_CODES:Record<string,string>={errore:'COMPACTION_SUMMARY_FAILED',troncato:'COMPACTION_SUMMARY_TRUNCATED',vuoto:'COMPACTION_SUMMARY_EMPTY',
  attrezzo:'COMPACTION_SUMMARY_TOOL_CALL',rifiuto:'COMPACTION_SUMMARY_REFUSED',esaurito:'COMPACTION_SUMMARY_EXHAUSTED','non-salvata':'COMPACTION_NOT_SAVED',
  /* r4, cure of the CLI's review 3 S2-2 (22/10/2026): above the threshold with nothing that can be shortened, and a summary that would not
     reduce the context: said as what they are, never «already compact» */
  'al-minimo':'COMPACTION_AT_MINIMUM',inefficace:'COMPACTION_INEFFECTIVE',
  /* r4, cure of the CLI's review 6 S3-1 (22/10/2026): an older part exists, but a summary would remove too little to pay for itself;
     before it read «already compact», which was false */
  'poco-utile':'COMPACTION_LITTLE_GAIN'};
function compactFailure(result:any):{code:string;message?:string;provider?:string}{
  const engine=result?.error&&typeof result.error==='object'?result.error:null;
  if(typeof engine?.code==='string'&&engine.code)return{code:engine.code,...(typeof engine.message==='string'?{message:engine.message}:{})};
  const motivo=typeof result?.motivo==='string'?result.motivo:'';
  if(motivo==='errore'&&typeof result?.codice==='string'&&result.codice)return{code:result.codice};
  /* block 19 of the Desktop: the kernel no longer fails on a summary model it cannot use, it says which one and why */
  if(motivo==='non-disponibile'){
    const gone=result?.nonDisponibile,provider=typeof gone?.modello==='string'?gone.modello.split(':')[0]:'';
    return gone?.motivo==='senza-chiave'&&provider?{code:'PROVIDER_KEY_MISSING',provider}:{code:'CTX_SUMMARY_MODEL_UNAVAILABLE'};
  }
  return{code:KERNEL_COMPACTION_CODES[motivo]??'COMPACTION_FAILED'};
}
export type CompactResultView={kind:'done'}|{kind:'already';noSpaceFreed?:true}|{kind:'failed';code:string;headline:string;todo?:string;text:string};
/* 0.6.13, contract with the Desktop (r4 e4823614d, d17df5813): every /compact result whose projection plus the session's gap
   reaches the declared window carries `nonEntra:{finestra,pavimento}`, compacted or not. It is said after what /compact did, with
   both numbers, as the turn's COMPACTION_WINDOW_TOO_SMALL says it: no compaction can make that model fit, only a larger window
   (Claude Code and Codex say the same with «start a new conversation»; here the model is the way out). Null without both numbers. */
const wholeTokens=(value:unknown):number|null=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0?value:null;
export function compactWindowNote(result:any):string|null{
  const window=wholeTokens(result?.nonEntra?.finestra),floor=wholeTokens(result?.nonEntra?.pavimento);
  return window!==null&&floor!==null?t('screen.compact.windowTooSmall',{window:window.toLocaleString('en-US'),floor:floor.toLocaleString('en-US')}):null;
}
const withWindowNote=(text:string,result:unknown)=>{const note=compactWindowNote(result);return note?`${text}\n${note}`:text;};
const compactAlreadyText=(view:{noSpaceFreed?:true})=>t(view.noSpaceFreed?'screen.compact.noSpaceFreed':'screen.compact.already');
export function compactResultView(result:any):CompactResultView{
  if(result?.compattato!==false)return{kind:'done'};
  if(result?.error?.code==='CTX_NOTHING_TO_COMPACT'||result?.motivo==='niente-da-compattare')return{kind:'already'};
  /* a compaction the person asked for, paid, that freed nothing: an outcome, as on the other apps (the cost is said by its own row) */
  if(result?.error?.code==='CTX_NO_REDUCTION')return{kind:'already',noSpaceFreed:true};
  const failure=compactFailure(result);const view=describeError(failure);const note=t('screen.compact.notReplaced');
  return{kind:'failed',code:view.code??failure.code,headline:t('screen.error.withNote',{what:view.what,note}),...(view.todo?{todo:view.todo}:{}),
    text:screenErrorText(failure,act('screen.action.command',{command:'compact'}),{note})};
}
/* The Context Engine REFUSES to start a job with nothing to compact: `startCompaction` throws CTX_NOTHING_TO_COMPACT
   (context-engine/src/engine.mjs, through context-desktop-service.mjs `request`), and the registry lets it through. That is the
   same «already compact», never «/compact failed». */
export function compactNothingToDo(error:unknown):boolean{
  const e=error as {code?:unknown;cause?:{code?:unknown}}|null;
  return e?.code==='CTX_NOTHING_TO_COMPACT'||e?.cause?.code==='CTX_NOTHING_TO_COMPACT';
}
export async function runControllerSlashAction(name:string,controller:{compact():Promise<any>}):Promise<string|null>{
  if(name!=='compact')return null;
  let result:unknown;
  try{result=await controller.compact();}catch(error){if(compactNothingToDo(error))return t('screen.compact.already');throw error;}
  const view=compactResultView(result);
  return withWindowNote(view.kind==='failed'?view.text:view.kind==='already'?compactAlreadyText(view):t('screen.compact.done'),result);
}

/* P13: what still works while an agent is watched (the rest of the keys do nothing; Esc goes back). */
/* Stage 6b: how long the mockup's toast stays (its `toast()`: 2.4 s). */
const AGENTS_TOAST_MS=2_400;
/* how long the status row may say «<provider>: checking…» for one check (the check's own budget is 2 s once the kernel is loaded) */
export const PROVIDER_CHECKING_SHOWN_MS=4_000;
/* how long after an answer stops vouching the status row reads it again (see the timer next to `providerVerification`) */
const PROVIDER_HOUR_PAD_MS=100;
const AGENT_VIEW_ACTIONS=new Set(['interrupt','exit','agent-tree','page-up','page-down','transcript-top','transcript-bottom','redraw','reasoning-toggle','tool-details','help']);
function localMessage(state:TuiState,text:string):TuiState{const id=`local-${Date.now()}-${Math.random()}`;const base=state.messages.length>=511?state.messages.slice(-511):state.messages;return{...state,messages:[...base,{id,role:'assistant',text}],transcript:appendTranscriptWarning(state.transcript,text)};}
function userMessage(state:TuiState,text:string,id=`user-${Date.now()}-${Math.random()}`):TuiState{const base=state.messages.length>=511?state.messages.slice(-511):state.messages;return{...state,messages:[...base,{id,role:'user',text}],transcript:appendTranscriptMessage(state.transcript,{role:'user',text})};}

/* R5b D4 (Q-R5-14): the theme is live. run.ts hands the app the store it paints the background from; without one (tests,
   embedders) the app keeps its own, seeded from `capabilities` and `accentId` as before. The colours below follow the store
   at every render, and a change of theme remounts the main tree (its key), so memoised rows are drawn again. */
/* the bar lists twelve; the shelf reads further, so a project with old conversations still has its disks */
const BAR_SESSIONS=12,SESSIONS_READ=60;
/* the shelf draws four kinds of disk */
const SHELF_STATE:Record<SessionState,ShelfState>={waiting:'waiting',progress:'working',concluded:'done',toResume:'stopped',interrupted:'stopped',unknown:'stopped'};
const LOADING_WORDS:Record<string,readonly [MessageId,MessageId]>={processes:['panel.processes.title','screen.loading.processes'],devices:['panel.devices.title','screen.loading.devices'],doctor:['panel.doctor.title','screen.loading.doctor'],research:['panel.research.title','screen.loading.research'],forge:['panel.forge.title','screen.loading.forge'],automations:['panel.automations.title','screen.loading.automations'],capability:['panel.capability.title','screen.loading.capability'],board:['panel.board.title','screen.loading.sessions'],context:['panel.context.title','screen.loading.context'],usage:['panel.usage.title','screen.loading.usage'],new:['panel.new.title','screen.loading.projects'],shelf:['panel.new.title','screen.loading.sessions'],resume:['panel.resume.title','screen.loading.sessions'],history:['panel.history.title','screen.loading.messages'],fork:['panel.fork.title','screen.loading.messages'],
  model:['panel.model.title','screen.loading.models'],provider:['panel.models.title','screen.loading.providers'],models:['panel.models.title','screen.loading.providers'],memory:['panel.memory.title','screen.loading.memory'],notes:['panel.notes.title','screen.loading.notes'],
  tasks:['panel.tasks.title','screen.loading.tasks'],library:['panel.library.title','screen.loading.library'],permissions:['panel.permissions.title','screen.loading.permissions'],diff:['panel.diff.title','screen.loading.changes']};
/* a reason must stay long enough to be read */
const PAGE_NOTE_MS=6000;
export function createTuiAppComponent(React:any,Ink:any,baseCapabilities:TerminalCapabilities={interactive:true,color:true,motion:true,unicode:true},accentId?:ThemeAccentId,givenThemeStore?:ThemeStore){
  const h=React.createElement;
  const themeStore:ThemeStore=givenThemeStore??createThemeStore(baseCapabilities,accentId??DEFAULT_THEME_ACCENT);
  let capabilities=baseCapabilities,theme=createTuiTheme(capabilities,accentId);
  let bootColor:string|undefined,transcriptColor:string|undefined,pickerColor:string|undefined,approvalColor:string|undefined,toolColor:string|undefined,footerColor:string|undefined;
  const applyLive=(live:LiveTheme)=>{
    capabilities=live.capabilities;theme=live.theme;
    bootColor=themeColor(theme,'boot');transcriptColor=themeColor(theme,'transcript');pickerColor=themeColor(theme,'picker');
    approvalColor=themeColor(theme,'approval');toolColor=themeColor(theme,'tool');footerColor=themeColor(theme,'footer');
  };
  applyLive(themeStore.getSnapshot());
  const BootSequence=createBootSequenceComponent(React,Ink);
  const ResumeIndicator=createResumeIndicatorComponent(React,Ink);
  const Regions=createRegionViews(React,Ink);
  /* The composer region (regions/views.ts): subscribes to the composer store itself, capped by the budget. */
  const ComposerView=Regions.ComposerRegion;

  /* stage 7.12 «+1 completa»: the transcript mode's search shows its words in reverse wherever they are */
  const marked=(text:string,mark?:string)=>mark?transcriptModeMarks(text,mark).map((piece,index)=>piece.hit?h(Ink.Text,{key:`m-${index}`,inverse:true},piece.text):piece.text):text;
  const renderInline=(text:string,keyPrefix:string,mark?:string)=>parseMarkdownInline(text).map((token:MarkdownInlineToken,index:number)=>{
    const key=`${keyPrefix}-${index}`;
    if(token.kind==='strong')return h(Ink.Text,{key,bold:true},marked(token.text,mark));
    if(token.kind==='emphasis')return h(Ink.Text,{key,italic:true},marked(token.text,mark));
    if(token.kind==='code')return h(Ink.Text,{key,color:toolColor},marked(token.text,mark));
    if(token.kind==='strike')return h(Ink.Text,{key,strikethrough:true,dimColor:true},marked(token.text,mark));
    if(token.kind==='link')return h(React.Fragment,{key},h(Ink.Text,{underline:true,color:pickerColor},marked(token.text,mark)),h(Ink.Text,{dimColor:true},` (${token.href})`));
    return h(Ink.Text,{key},marked(token.text,mark));
  });
  const MarkdownView=React.memo(function MarkdownView({text,width,maxProseWidth,mark}:{text:string;width:number;maxProseWidth?:number|null;mark?:string}){
    const parseMemoRef:{current:ReturnType<typeof createMarkdownParseMemo>|null}=React.useRef(null);
    if(!parseMemoRef.current)parseMemoRef.current=createMarkdownParseMemo();
    const blocks=parseMemoRef.current.get(text);
    return h(React.Fragment,null,...blocks.map((block,index)=>{
      const content=(()=>{
      if(block.kind==='heading')return h(Ink.Text,{key:index,bold:true},...renderInline(block.text,`h-${index}`,mark));
      /* FMT: a thematic break is a dim rule as wide as the prose (Codex `Event::Rule`, Pi `case "hr"`). */
      if(block.kind==='rule')return h(Ink.Text,{key:index,dimColor:true,wrap:'truncate'},markdownBlockLines(block,markdownBlockWidth(block,width,maxProseWidth),{unicode:capabilities.unicode}).lines[0]);
      if(block.kind==='code')return h(Ink.Box,{key:index,flexDirection:'column'},...block.tokens.map((line:any[],lineIndex:number)=>h(Ink.Text,{key:lineIndex},...line.map((token:any,tokenIndex:number)=>h(Ink.Text,{key:tokenIndex,dimColor:token.kind==='comment',bold:token.kind==='keyword'||token.kind==='key'},markdownSafeText(token.text))))));
      if(block.kind==='blockquote')return h(Ink.Box,{key:index,flexDirection:'column',paddingLeft:1},...block.text.split('\n').map((line,lineIndex)=>h(Ink.Text,{key:lineIndex,dimColor:true},h(Ink.Text,{bold:true},'│ '),...renderInline(line,`q-${index}-${lineIndex}`,mark))));
      /* UI Phase 0 D7: the marker has its own box and the text wraps in the box beside it (a hanging indent). The text box
         keeps the last column free: a wrapped row that filled it left ConPTY a pending wrap, and 8 ms after each such frame
         it wrote a cursor fix-up (ESC[m CR LF ESC[60C) that s11 R1-IDLE counted as idle output (measured A/B 27/09). */
      if(block.kind==='list')return h(Ink.Box,{key:index,flexDirection:'column'},...block.items.map((item,itemIndex)=>h(Ink.Box,{key:itemIndex,flexDirection:'row'},h(Ink.Text,null,'  '.repeat(block.depths[itemIndex]??0)+(block.ordered?String(block.start+itemIndex)+'. ':'• ')),h(Ink.Box,{flexShrink:1,paddingRight:1},h(Ink.Text,null,...renderInline(item,`l-${index}-${itemIndex}`,mark))))));
      /* UI Phase 0 D10: a boxed table on a Unicode terminal; its borders are dim and its header bold (`roles`). */
      if(block.kind==='table'){const layout=markdownBlockLines(block,width,{unicode:capabilities.unicode});return h(Ink.Box,{key:index,flexDirection:'column'},...layout.lines.map((line,lineIndex)=>{const role=layout.roles?.[lineIndex];return h(Ink.Text,{key:lineIndex,bold:role?role==='header':layout.mode==='wide'&&lineIndex===0,dimColor:role?role==='border':lineIndex===1&&layout.mode==='wide'},line||' ');}));}
      return h(Ink.Text,{key:index},...renderInline(block.text,`p-${index}`,mark));
      })();
      return maxProseWidth!=null&&block.kind!=='code'&&block.kind!=='table'
        ?h(Ink.Box,{key:index,width:markdownBlockWidth(block,width,maxProseWidth),flexDirection:'column'},content):content;
    }));
  },(previous:any,next:any)=>markdownRenderPropsEqual(previous,next)&&previous.mark===next.mark);
  /* The command menu (lane O builder, fitted to its budget like every overlay, Q-R1-3). It subscribes to the composer and
     selection stores itself, so typing a query re-renders the menu, not the root. */
  const CommandMenuView=React.memo(function CommandMenuView({composerStore,selectionStore,maxRows,columns,hit}:{composerStore:ComposerStore;selectionStore:CommandMenuSelectionStore;maxRows:number;columns:number;hit?:HitRegister}){
    const editor:EditorState=React.useSyncExternalStore(composerStore.subscribe,composerStore.getSnapshot,composerStore.getSnapshot);
    const selection:CommandMenuSelection=React.useSyncExternalStore(selectionStore.subscribe,selectionStore.getSnapshot,selectionStore.getSnapshot);
    /* R4 Q-R4-5: the highlight is the row Enter runs; none after a typo (Enter then sends the text as typed). */
    return renderFittedOverlay(h,Ink,fitOverlay(commandMenuOverlay({text:editor.text,selected:commandMenuHighlight(editor.text,selection)}),{maxRows,columns}),{accentColor:pickerColor,hit,hitKey:'command-menu'});
  },(previous:any,next:any)=>previous.composerStore===next.composerStore&&previous.selectionStore===next.selectionStore&&previous.maxRows===next.maxRows&&previous.columns===next.columns&&previous.hit===next.hit);

  const MeasuredTranscriptRow=React.memo(function MeasuredTranscriptRow({item,measurementKey,measurementStore,renderItem}:{item:TranscriptDisplayItem;measurementKey:string;measurementStore:TranscriptMeasurementStore;renderItem:(item:TranscriptDisplayItem)=>any}){
    const ref=React.useRef(null);
    /* R1 lane I measurement (E5): `useBoxMetrics` also tracks left/top and sets state when a row only MOVES (an overlay
       opens, the terminal resizes), which cost one identical full repaint. The height is read after layout instead, on
       every render of this row, and the store publishes only a changed height; a row that only moved commits nothing. */
    React.useLayoutEffect(()=>{
      const node=ref.current;if(!node)return;
      const {height}=Ink.measureElement(node);
      if(height>0)measurementStore.measure(measurementKey,height);
    });
    return h(Ink.Box,{ref,flexDirection:'column'},renderItem(item));
  },(previous:any,next:any)=>previous.item===next.item&&previous.measurementKey===next.measurementKey&&previous.measurementStore===next.measurementStore&&previous.renderItem===next.renderItem);

  /*
   * R1 (Q-R1-2, E4, E9): the transcript inside its region. The window is planned in ROWS with measured heights
   * (`useBoxMetrics` per mounted item; an item never mounted is counted, not estimated), the region is bottom-anchored
   * and clipped, and the one announcement row keeps the person's latest prompt in sight (D-04). `onPlan` reports the
   * geometry the key handlers need (PageUp/PageDown, Ctrl+Home) and the rows added while the person reads above the
   * tail, so the view stays where they left it.
   */
  const TranscriptView=React.memo(function TranscriptView({variantTag='',items,scrollRows,rowBudget,width,maxProseWidth,raw,expandedTools,reasoningVisible=true,revealId,measurementStore,renderItem,onPlan,dimColor,now,hit,openItems=NO_OPEN_ITEMS,clipRef,pill=null}:{variantTag?:string;openItems?:ReadonlySet<string>;clipRef?:(key:string,node:unknown)=>void;hit?:HitRegister;pill?:{text:string;targetFrom:number}|null;items:readonly TranscriptDisplayItem[];scrollRows:number;rowBudget:number;width:number;maxProseWidth?:number|null;raw:boolean;expandedTools:boolean;reasoningVisible?:boolean;revealId:string|null;measurementStore:TranscriptMeasurementStore;renderItem:(item:TranscriptDisplayItem)=>any;onPlan:(plan:TranscriptPlanReport)=>void;dimColor?:string;now?:number}){
    React.useSyncExternalStore(measurementStore.subscribe,measurementStore.getSnapshot,measurementStore.getSnapshot);
    /* R5a S8: a collapsed reasoning block is one row, a shown one a box: the choice is part of every measured height. */
    const variant=(raw?'raw':expandedTools?'pretty-expanded':'pretty-compact')+(reasoningVisible?'':'-thought')+'-prose-'+(maxProseWidth??'full')+variantTag;
    /* a call folded into a group is revealed by its group */
    const revealIndex=revealId?items.findIndex((item:TranscriptDisplayItem)=>item.id===revealId||(item.kind==='toolGroup'&&item.tools.some(tool=>tool.id===revealId))):-1;
    /* Lane RD contract (R3): the estimate may read the clock of a running row; an estimator without it ignores it. */
    const estimateOptions={raw,expandedTools,reasoningVisible,maxProseWidth:maxProseWidth??null,...(typeof now==='number'?{now}:{})};
    /* UI Phase 1: a group of exploring calls is one line (components/tool-group.ts) until it is measured. */
    /* stage 6c: an item a click opened is measured and estimated as open, under its own key */
    const opened=(item:TranscriptDisplayItem)=>openItems.has(item.id);
    const keyOf=(item:TranscriptDisplayItem)=>transcriptMeasurementKey(item.id,width,opened(item)?variant+'-open':variant);
    const heightOf=(item:TranscriptDisplayItem)=>measurementStore.height(keyOf(item))??(item.kind==='toolGroup'?(opened(item)?1+item.tools.length:1):estimateTranscriptItemRows(item,width,opened(item)?{...estimateOptions,expandedTools:true,reasoningVisible:true}:estimateOptions));
    const plan=(budgetRows:number)=>planTranscriptVirtualWindow({items,offset:0,rowBudget:budgetRows,scrollRows,revealIndex,heightOf});
    let planned=plan(rowBudget),announcement:{text:string;promptFrom:number|null}|null=null;
    const latestUser=(()=>{for(let index=items.length-1;index>=0;index--){const item=items[index]!;if(item.kind==='message'&&item.role==='user')return index;}return -1;})();
    const announce=(window:typeof planned,windowBudget:number)=>{
      /* long chats, tappa D: the earlier row is the first item; it is not a message above the view */
      const {hidden,messages:messagesAbove}=countAboveView(items,window.hiddenAbove??0);
      /* Tappa 8 C2 (g-q23, dossier RICERCA-5x5x5x5-TAPPA8-CONFORMITA-2026-10-07): the predicate is evaluated on the
         layout that will actually serve the announcement, and a header exactly on its topmost visible row IS visible —
         it is never named (the old inline `>=` named a message on screen). */
      const promptAboveView=latestUser>=0&&window.firstRowFromBottom!==undefined&&promptStartsAboveView(window.firstRowFromBottom(latestUser),window.scrollRows??0,windowBudget);
      const latest=latestUser>=0?items[latestUser]!:null;
      return transcriptAnnouncementRow({hiddenAbove:hidden,hiddenMessagesAbove:messagesAbove,latestPrompt:latest&&latest.kind==='message'?latest.text:null,promptAboveView,width});
    };
    /* Tappa 8 C1 (mockup :701-702): the jump pill rides on the last row too — one more row the items give up while it shows. */
    const reserve=1+(pill?1:0);
    if(rowBudget>1){
      const narrowed=plan(Math.max(1,rowBudget-reserve));
      announcement=announce(narrowed,Math.max(1,rowBudget-reserve));
      if(announcement)planned=narrowed;else if(pill)planned=plan(rowBudget-1);
    }
    const anchorIndex=planned.end>0?planned.end-1:-1;
    const indexById=(id:string)=>items.findIndex((item:TranscriptDisplayItem)=>item.id===id);
    const report:TranscriptPlanReport={
      totalRows:planned.totalRows??0,maxScroll:planned.maxScroll??0,scrollRows:planned.scrollRows??0,itemRows:rowBudget-(announcement?1:0)-(pill?1:0),
      anchorId:anchorIndex>=0?items[anchorIndex]!.id:null,anchorBelow:anchorIndex>=0&&planned.rowsBelow?planned.rowsBelow(anchorIndex):0,
      belowOf:(id:string)=>{const index=indexById(id);return index>=0&&planned.rowsBelow?planned.rowsBelow(index):null;},
    };
    React.useLayoutEffect(()=>{onPlan(report);},[onPlan,report.totalRows,report.maxScroll,report.scrollRows,report.itemRows,report.anchorId,report.anchorBelow]);
    return h(Regions.TranscriptRegion,{rows:rowBudget,announcement:announcement?.text??null,promptFrom:announcement?.promptFrom??null,pill,hit,clipRef,clipBelow:planned.clipBelow??0,color:dimColor},...planned.rows.map((item:TranscriptDisplayItem)=>{
      const measurementKey=keyOf(item);
      return h(MeasuredTranscriptRow,{key:item.id,item,measurementKey,measurementStore,renderItem});
    }));
  },(previous:any,next:any)=>previous.items===next.items&&previous.scrollRows===next.scrollRows&&previous.rowBudget===next.rowBudget&&previous.width===next.width&&previous.maxProseWidth===next.maxProseWidth&&previous.raw===next.raw&&previous.expandedTools===next.expandedTools&&previous.reasoningVisible===next.reasoningVisible&&previous.revealId===next.revealId&&previous.measurementStore===next.measurementStore&&previous.renderItem===next.renderItem&&previous.onPlan===next.onPlan&&previous.dimColor===next.dimColor&&previous.now===next.now&&previous.openItems===next.openItems&&previous.variantTag===next.variantTag&&(previous.pill?.text??null)===(next.pill?.text??null)&&(previous.pill?.targetFrom??null)===(next.pill?.targetFrom??null));

  return function TuiApp(props:TuiAppProps){
    const live:LiveTheme=React.useSyncExternalStore(themeStore.subscribe,themeStore.getSnapshot,themeStore.getSnapshot);applyLive(live);
    const {projectUntrusted=false,remote,runtime,registry,catalog,invocation,projectRoot,paths,permissionRules,autoClassifier,initialPrompt,initialReasoningEffort=null,startup,configuredModel=null,renderCoordinator,keymap:effectiveKeymap=KEYBINDINGS,terminalSize,mouseWheel,consoleWarnings,paintedBackground=false}=props;
    const inkApp=Ink.useApp();
    const inkStdout=Ink.useStdout?.();
    const stdout=inkStdout?.stdout??process.stdout;
    const baseModel=invocation.model??'openai:gpt-5-mini';
    const askedMode=(invocation.permissionMode??'default') as PermissionMode;
    /* decision 173: Full access in a folder the person said No to works as Normal, and the fixed line says so */
    const baseMode=modeInUntrustedFolder(askedMode,projectUntrusted);
    /* Startup stage 1 (owner 02/10): the screen is up before the catalog answers. A configured model is shown from the first
       frame, as the approved mockup does (step-01-avvio-t0); «none · /provider» is for no configured model, and the
       catalog corrects either once it answers (refreshSelection). */
    const [state,setState]=React.useState(()=>initialTuiState({model:configuredModel||NO_PROVIDER_MODEL,permissionMode:baseMode}));
    const [appState,setAppState]=React.useState(()=>({...createTuiAppState(),reasoningVisible:props.reasoning==='visible'}) as TuiAppState);
    const composerStoreRef:{current:ComposerStore|null}=React.useRef(null);
    if(!composerStoreRef.current)composerStoreRef.current=createComposerStore(appState.editor);
    const composerStore:ComposerStore=composerStoreRef.current;
    const currentEditor=()=>composerStore.getSnapshot();
    const commandMenuSelectionStoreRef:{current:CommandMenuSelectionStore|null}=React.useRef(null);
    if(!commandMenuSelectionStoreRef.current)commandMenuSelectionStoreRef.current=createCommandMenuSelectionStore();
    const commandMenuSelectionStore:CommandMenuSelectionStore=commandMenuSelectionStoreRef.current;
    const transcriptMeasurementStoreRef:{current:TranscriptMeasurementStore|null}=React.useRef(null);
    if(!transcriptMeasurementStoreRef.current)transcriptMeasurementStoreRef.current=createTranscriptMeasurementStore();
    const transcriptMeasurementStore:TranscriptMeasurementStore=transcriptMeasurementStoreRef.current;
    const [vim,setVim]=React.useState(()=>createVimState() as VimState);
    /* R4 contract (lane F owns launch-state.ts and BootSequence): the boot plays full only on the first launch and after an
       update, short otherwise (Q-R4-4). Asked once per mount; a plan that cannot be read is a full boot. */
    const bootPlanRef:{current:BootPlan|null}=React.useRef(null);
    if(!bootPlanRef.current){try{bootPlanRef.current=bootPlan({dataRoot:paths.dataRoot,version:CLI_VERSION,build:currentBuildId()??TALOS_BASE_COMMIT,now:Date.now()});/* another folder of the same session of work: no medal again (Frontend) */if(process.env[RELAUNCHED_ENV])bootPlanRef.current={...bootPlanRef.current,mode:'short'};}catch{bootPlanRef.current={mode:'full',firstLaunch:true};}}
    /* P-A (owner 07/10 sera, «Compositore subito»): a short boot with nothing to load starts already ready — the first frame is the
       composer. Resume, fork and a prompt on the command line have something to load, so they keep the boot (the guided setup has nothing to load: its sheet opens in the composer's place, once the profile is read). */
    const [boot,setBoot]=React.useState(()=>initialBootState({mode:bootPlanRef.current!.mode,plainStart:!invocation.resume&&!invocation.fork&&!initialPrompt?.trim(),now:Date.now()}) as BootState);
    /* R4 Q-R4-9 / E9: each entry keeps its paste blocks, so a recalled paste stays collapsed; the text is sent as it was. */
    const [history,setHistory]=React.useState([] as EditorDraft[]);
    const historyIndexRef:{current:number}=React.useRef(-1);
    const reverseIndexRef:{current:number}=React.useRef(0);
    const [viewport,setViewport]=React.useState(()=>({offset:0,pageSize:12,unseen:0,followingTail:true}) as TranscriptViewport);
    const [pending,setPending]=React.useState(null as PendingTuiApproval|null);
    const [approvalExpanded,setApprovalExpanded]=React.useState(false);
    const [approvalScroll,setApprovalScroll]=React.useState(0);
    /* R3 gate E11 (Q-R3-6): the highlighted choice of the approval dialog, Deny by default. */
    const [approvalSelected,setApprovalSelected]=React.useState(APPROVAL_DEFAULT_SELECTED);
    /*
     * R3 approval key race, owner decision (binding): for APPROVAL_GRACE_MS after the dialog is first shown for a request,
     * keys keep going to the composer and never answer it; after that the dialog takes every key. What the key handler
     * needs is read from refs set synchronously when the approval arrives, never from the last render (Ink's useInput
     * closes over the previous render, so routing by render state made a key's target depend on paint timing).
     */
    const clockRef:{current:()=>number}=React.useRef(props.clock??Date.now);
    const approvalShownRef:{current:{requestId:string;shownAt:number;answered:boolean}|null}=React.useRef(null);
    /*
     * Stage 3 (owner 01-02/10): the model's question card (question-card.ts). As for approvals, what the key handler needs is
     * in refs set when the question arrives, and the card has the same grace: for APPROVAL_GRACE_MS after it first shows,
     * keys still go to the composer (Claude Code #72614: a key typed as the card appears never picks an option). The clock
     * starts when the card is shown (the desktop's rule), with the person's setting (ui.questionTimeout).
     */
    const questionRef:{current:QuestionCardState|null}=React.useRef(null);
    const [questionCard,setQuestionCard]=React.useState(null as QuestionCardState|null);
    const questionShownRef:{current:{requestId:string;shownAt:number;answered:boolean}|null}=React.useRef(null);
    const questionTimeoutRef:{current:UiQuestionTimeout}=React.useRef(props.questionTimeout??'5m');
    const [questionNow,setQuestionNow]=React.useState(()=>Date.now());
    /* Stage 3 (owner 02/10): the plan card (plan-card.ts), with the same refs and the same 300 ms grace as the question card. */
    const planRef:{current:PlanCardState|null}=React.useRef(null);
    const [planCard,setPlanCard]=React.useState(null as PlanCardState|null);
    const planShownRef:{current:{requestId:string;shownAt:number;answered:boolean}|null}=React.useRef(null);
    /* Stage 3 (owner 02/10): an MCP server's request (elicit-card.ts), with the same refs and grace as the other cards. */
    const elicitRef:{current:ElicitCardState|null}=React.useRef(null);
    const [elicitCard,setElicitCard]=React.useState(null as ElicitCardState|null);
    const elicitShownRef:{current:{requestId:string;shownAt:number;answered:boolean}|null}=React.useRef(null);
    /* 0.6.15 remote control: a phone asks for a folder (consent-card.ts). Only the person answers it, with the cards' refs and grace. */
    const consentRef:{current:ConsentCardState|null}=React.useRef(null);
    const [consentCard,setConsentCard]=React.useState(null as ConsentCardState|null);
    const consentShownRef:{current:{requestId:string;shownAt:number;answered:boolean}|null}=React.useRef(null);
    const [consentNow,setConsentNow]=React.useState(()=>Date.now());
    /* T4: `/remote` — the pairing screen the card shows, the keys waiting for the flow, and the flow running (one at a time) */
    const [remoteCard,setRemoteCard]=React.useState(null as PairingState|null);
    const remoteKeysRef:{current:{queue:(PairingKey|null)[];waiting:((key:PairingKey|null)=>void)[]}}=React.useRef({queue:[],waiting:[]});
    const remoteFlowRef:{current:boolean}=React.useRef(false);
    /* owner 27/10/2026: the pairing goes through an administrator window — the QR and the code say what the device gets */
    const remoteAdminRef:{current:boolean}=React.useRef(false);
    /* T6: the model's `remote_phone_pair` calls of this window, by id, until they finish (the card opens the QR on a success) */
    const pairToolsRef:{current:Set<string>}=React.useRef(new Set());
    const startRemotePairingRef:{current:((open?:{soloSeAcceso:true})=>void)|null}=React.useRef(null);
    /* review 5 (D-1), owner «Aspetta che smetti»: when the agents panel last took a key (Ctrl+A, ↑/↓, Enter); a tick redraws once idle */
    const [panelKeyAt,setPanelKeyAt]=React.useState(null as number|null);
    const [,setPanelIdleTick]=React.useState(0);
    const pendingRef:{current:PendingTuiApproval|null}=React.useRef(null);
    const approvalUiRef:{current:{expanded:boolean;selected:number}}=React.useRef({expanded:false,selected:APPROVAL_DEFAULT_SELECTED});
    /* R3 Q-R3-13: null while unknown (no probe, or not answered yet). */
    const [sandboxVerified,setSandboxVerified]=React.useState(null as boolean|null);
    const sandboxAskedRef:{current:boolean}=React.useRef(false);
    const askSandboxRef:{current:()=>void}=React.useRef(()=>{});
    askSandboxRef.current=()=>{
      const probe=props.shellIsolation;if(!probe||sandboxAskedRef.current)return;sandboxAskedRef.current=true;
      /* A check stopped because TALOS is quitting answers nothing: no label either way. */
      void probe().then(result=>{if(!result.aborted)setSandboxVerified(result.verified===true);},()=>{});
    };
    /* R3 (lane RD contract): a once-a-second clock for running tool rows (`running 12 s`), ticking only while a tool runs. */
    const [toolNow,setToolNow]=React.useState(()=>Date.now());
    /* R1 lane O contract: help scrolls inside maxRows (PgUp/PgDn, Up/Down); the approval scroll stops at the fit's last offset. */
    const [helpOffset,setHelpOffset]=React.useState(0);
    const helpMaxOffsetRef:{current:number}=React.useRef(0);const helpPageRef:{current:number}=React.useRef(1);
    const approvalMaxOffsetRef:{current:number}=React.useRef(0);
    const [diff,setDiff]=React.useState('');
    const [pickerQuery,setPickerQuery]=React.useState('');
    const [pickerSelection,setPickerSelection]=React.useState(()=>({query:'',selected:0,pageSize:10}) as SelectionState);
    const [modelRows,setModelRows]=React.useState([] as TuiModel[]);
    const [providerRows,setProviderRows]=React.useState([] as TuiProvider[]);
    const [sessionRows,setSessionRows]=React.useState([] as any[]);
    const [agentRows,setAgentRows]=React.useState([] as AgentRosterRow[]);
    /* Stage 6a (owner 01/10, mockup cycleAgents): the agents docked on the left and their full page, replacing the tree list. */
    const [agentsSurface,setAgentsSurface]=React.useState(AGENTS_CLOSED as AgentsSurface);
    const agentsShown=agentsSurface.page!==null;
    /* Stage 6b (owner 02/10): the sub-agents' questions waiting on the person (controller, descendant-approvals.ts), and the
       mockup's toast («An agent needs you · ctrl+a», «Answer sent to the agent»): a line that leaves by itself. */
    const [agentQuestions,setAgentQuestions]=React.useState([] as readonly PendingAgentQuestion[]);
    const [toast,setToast]=React.useState(null as string|null);
    const [pageNote,setPageNote]=React.useState(null as string|null);
    /* stage 7.13 (mockup clear «Clear the screen»): the items the main view no longer draws; the transcript mode still has them */
    const [clearedIds,setClearedIds]=React.useState(null as ReadonlySet<string>|null);
    /* Stage 6c (owner 01/10 «tutto cliccabile»): the blocks of rows that carry actions register their Ink element; a click
       measures where they are NOW (hit-map.ts; Codex works on the most recently painted layout). Measured at the click, not
       after this component's commit: a child that renders alone (the composer growing) moves the layout without it —
       s48 measured the pill two rows above where it was painted. */
    const cardOpenRef:{current:boolean}=React.useRef(false);
    const hitBlocksRef:{current:Map<string,{node:unknown;rows:readonly StyledRow[];clip?:string}>}=React.useRef(new Map());
    const registerHit:HitRegister=React.useCallback((key:string,node:unknown,rows:readonly StyledRow[],clip?:string)=>{if(node)hitBlocksRef.current.set(key,{node,rows,...(clip?{clip}:{})});else hitBlocksRef.current.delete(key);},[]);
    /* the regions a block is seen through (the transcript): a block whose region is not on screen takes no click */
    const clipNodesRef:{current:Map<string,unknown>}=React.useRef(new Map());
    const registerClip=React.useCallback((key:string,node:unknown)=>{if(node)clipNodesRef.current.set(key,node);else clipNodesRef.current.delete(key);},[]);
    const currentHitTargets=():HitTarget[]=>hitTargets([...hitBlocksRef.current.entries()].flatMap(([key,{node,rows,clip}])=>{
      if(inHiddenBox(node)||(cardOpenRef.current&&FRAME_BLOCKS.has(key)))return[];
      const at=Ink.measureElement(node);if(!clip)return[{x:at.x,y:at.y,rows}];
      const region=clipNodesRef.current.get(clip);if(!region)return[];
      const box=Ink.measureElement(region);return[{x:at.x,y:at.y,rows,clip:{top:box.y,bottom:box.y+box.height-1}}];
    }));
    /* the hover reads the targets on every move: it reads them once per frame. A click always reads them anew: it may come with no frame painted */
    const frameTargetsRef:{current:{get():HitTarget[];clear():void}}=React.useRef(frameMemo(currentHitTargets));
    /* Stage 6c (mockup `toggle:id`): the transcript items a click has opened (Ctrl+O and Ctrl+T still open all of them). */
    const [openItems,setOpenItems]=React.useState(()=>new Set<string>() as ReadonlySet<string>);
    /* the transcript feeds only the result summaries, so it is read only while the agents are on screen */
    const agentCardsNow:AgentCard[]=React.useMemo(()=>agentCards(state.agents,agentsShown?state.transcript.items:[],agentQuestions),[state.agents,agentsShown?state.transcript.items:null,agentQuestions]);
    /* P13 (owner decisions 2026-09-26): the agent whose transcript takes the main view (agent-view.ts), read-only. */
    const [agentView,setAgentView]=React.useState(null as AgentViewState|null);
    const agentViewRef:{current:{close():void}|null}=React.useRef(null);
    const mainViewportRef:{current:TranscriptViewport|null}=React.useRef(null);
    const [providerStep,setProviderStep]=React.useState({kind:'list'} as ProviderStep);
    const [chosenProvider,setChosenProvider]=React.useState(null as string|null);
    const [selectionLoaded,setSelectionLoaded]=React.useState(false);
    const [keyMissing,setKeyMissing]=React.useState(false);
    const [modelList,setModelList]=React.useState({loading:false,verified:false,notice:'',label:'',engineDown:false});
    /* P17 (owner decisions 2026-09-26) and stage 7.10d (owner 03/10 «stesso foglio anche al primo avvio»): the guided setup —
       first launch when something is missing, /setup, `talos setup` — is the four-tab sheet (panel/setup-sheet.ts).
       `setupOpenRef`: it is open, so its closing says whether TALOS is ready. */
    const setupOpenRef:{current:boolean}=React.useRef(false);
    const setupProvidersRef:{current:readonly TuiProvider[]}=React.useRef([] as readonly TuiProvider[]);
    const setupModelsRef:{current:readonly TuiModel[]}=React.useRef([] as readonly TuiModel[]);
    const setupAbortRef:{current:AbortController|null}=React.useRef(null);
    /* P21: the OpenRouter sign-in under way (its loopback port closes on cancel, timeout or success). */
    const oauthLoginRef:{current:OpenRouterLogin|TuiChatgptLogin|null}=React.useRef(null);
    /* Finding 6 (bugfixer, 13/10/2026): a sign-in takes a moment to OPEN (the kernel's modules, the local address), and Esc in that
       moment found nothing to cancel: the sign-in then opened by itself, waited ten minutes, and on success changed provider under a
       person who had cancelled. Each start takes a number; closing the window (or a newer start) moves it on, and a start that
       comes back to a number that moved cancels itself. */
    const oauthEpochRef:{current:number}=React.useRef(0);
    const [providerSecret,setProviderSecret]=React.useState('');
    const [auxCompletions,setAuxCompletions]=React.useState([] as string[]);
    const [fileCompletion,setFileCompletion]=React.useState(null as FileCompletion|null);
    const fileCompletionRef:{current:FileCompletion|null}=React.useRef(null);fileCompletionRef.current=fileCompletion;
    /* The token last looked up, the token the person closed with Esc (the list stays closed until the token changes), and a
       sequence number so a slow answer for an older token is dropped. */
    /* R5b D6: the project walk behind @, built once and reused for a short while (project-file-index.ts). */
    const projectIndexRef:{current:ReturnType<typeof createProjectFileIndexCache>}=React.useRef(createProjectFileIndexCache(projectRoot));
    const completionWatchRef:{current:{token:string|null;dismissed:string|null;seq:number}}=React.useRef({token:null,dismissed:null,seq:0});
    const [currentModelMeta,setCurrentModelMeta]=React.useState(null as TuiModel|null);
    const [reasoningEffort,setReasoningEffort]=React.useState(initialReasoningEffort as ReasoningEffort|null);
    /* owner 27/10/2026: the effort on screen now, for the kernel's settings snapshot (its handler is made once, with the controller) */
    const reasoningEffortRef=React.useRef(reasoningEffort);reasoningEffortRef.current=reasoningEffort;
    const [modelEffortStep,setModelEffortStep]=React.useState(null as TuiModel|null);
    /* R5a: the effort line was opened by /effort (not as /model's second step): Backspace does not lead to a model list. */
    const [effortOnly,setEffortOnly]=React.useState(false);
    const [busySince,setBusySince]=React.useState(()=>Date.now());
    const [motionNow,setMotionNow]=React.useState(()=>Date.now());
    const [activityClockNow,setActivityClockNow]=React.useState(()=>Date.now());
    const [renderEpoch,setRenderEpoch]=React.useState(0);
    const [queuedActions,setQueuedActions]=React.useState([] as TuiQueuedAction[]);
    /* F-Q1 (owner 03/10): the kernel's queue of this session, drawn gray at the end of the conversation */
    const [kernelQueue,setKernelQueue]=React.useState({items:[],paused:false} as TuiKernelQueue);
    const [queueEditor,setQueueEditor]=React.useState(null as {selected:number;editing:boolean;draft:string}|null);
    const [transcriptSearch,setTranscriptSearch]=React.useState(null as TranscriptSearchState|null);
    const [transcriptSelectedId,setTranscriptSelectedId]=React.useState(null as string|null);
    const [transcriptRevealId,setTranscriptRevealId]=React.useState(null as string|null);
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
    /* R5b D4: the /theme picker — the row chosen, and the theme in use when it opened (Esc puts it back). */
    const [themePicker,setThemePicker]=React.useState(null as {selected:number;original:UiTheme}|null);
    /* R5b D3 (Q-R5-13): the /undo picker (its rows, the highlighted one, and the question: null, 0 Cancel or 1 act). */
    const [researchEdit,setResearchEdit]=React.useState(null as string|null);const researchEditRef=React.useRef(null as string|null);
    const [fullAccessPrompt,setFullAccessPrompt]=React.useState(null as 0|1|null);
    const fullAccessPromptRef=React.useRef(null as 0|1|null);
    const modeChangingRef=React.useRef(false);
    const fullAccessConsentRef=React.useRef({sessionId:null as string|null,confirmed:askedMode==='bypassPermissions'});
    const [fullAccessHeldBack,setFullAccessHeldBack]=React.useState(()=>baseMode!==askedMode);
    const showFullAccessPrompt=(selected:0|1|null)=>{fullAccessPromptRef.current=selected;setFullAccessPrompt(selected);};
    /*
     * 0.6.13 (owner 22/10/2026, «a request too large for the model»: a small choice dialog, as the Full access confirmation). The
     * turn stopped before any paid call (REQUEST_TOO_LARGE); the text it sent is back in the composer when the composer was empty
     * (`restored`), and the dialog offers ONE action, «Send as attachment» (the same text with the kernel's `allegaSeTroppoGrande`),
     * or «Edit the message». gemini-cli gives the prompt back only when the input still matches it (AppContainer.tsx:1348-1376):
     * here too what the person typed meanwhile is never overwritten, and the dialog still offers the action on the sent text.
     */
    type TooLargePrompt={selected:0|1;draft:EditorDraft;facts:RequestTooLarge|null;restored:boolean};
    const [tooLargePrompt,setTooLargePrompt]=React.useState(null as TooLargePrompt|null);
    const tooLargePromptRef=React.useRef(null as TooLargePrompt|null);
    const showTooLargePrompt=(next:TooLargePrompt|null)=>{tooLargePromptRef.current=next;setTooLargePrompt(next);};
    /* what the screen last sent to the model (with its collapsed pastes), and the prompt of the last live turn: the text a
       REQUEST_TOO_LARGE turn gives back is the sent draft when it is that turn's prompt, the turn's prompt otherwise */
    const lastSentDraftRef=React.useRef(null as EditorDraft|null);
    const lastRunPromptRef=React.useRef(null as string|null);
    /* set every render (further down): the controller's event sink is made once, so it calls the current one through this */
    const requestTooLargeReturnedRef:{current:(error:unknown)=>void}=React.useRef((_error:unknown)=>{});
    /* ASYNC step 4 (owner 01/10): /exit with delegated agents working asks wait · stop · stay (exit-with-agents.ts); «wait»
       keeps the ids it waits for until they ended and the main agent answered them. */
    /* Stage 7.3 (owner 01/10 «ogni comando deve avere il suo pannello»): the command's sheet open in the composer's place */
    const [sheet,setSheetState]=React.useState(null as SheetState|null);
    const sheetRef:{current:SheetState|null}=React.useRef(null);
    /* FE-048 (owner 01/11, «pagine intere»): one list says which commands take the centre; the rest stay small cards */
    const pageLoaderRef=React.useRef(createPageLoader<SheetState>());
    const setSheet=(given:SheetState|null)=>{
      if(!pageLoaderRef.current.letThrough(given,Boolean(sheetRef.current?.context?.loading)))return;
      const next=given&&COMMAND_PAGES.has(given.name)&&!given.panel.page?asPage(given):given;sheetRef.current=next;setSheetState(next);
      /* a notice said while a page was loading belongs to the page that comes (Frontend 01/11) */
      if(next&&next.name!=='loading'&&pageNoteOwnerRef.current==='loading')pageNoteOwnerRef.current=next.name;
      /* suite 01/11 (s70): what was typed while the page loaded (a search started at once) reaches the page that comes, in order */
      if(next?.name!=='loading'&&typedWhileLoadingRef.current.length){const keys=typedWhileLoadingRef.current;typedWhileLoadingRef.current=[];
        if(next)queueMicrotask(()=>{for(const sheetKey of keys){const now=sheetRef.current;if(!now||now.name==='loading')return;runSheetStepRef.current?.(panelKey(now.panel,sheetKey));}});}
    };
    const typedWhileLoadingRef:{current:SheetKey[]}=React.useRef([]);
    const runSheetStepRef:{current:((step:PanelStep)=>void)|null}=React.useRef(null);
    /* Frontend 01/11: a notice born in a page lives in that page (across its tabs) and is not shown in the next one */
    const pageNoteOwnerRef:{current:string|null}=React.useRef(null);
    /* FE-052: the tone of the page note, set with it; only the shelf's dashed disk gives one (the mockup's yellow notice, index.html:2532) */
    const pageNoteToneRef:{current:'warn'|null}=React.useRef(null);
    /* owner 01/11: what may be heavy says so; `words` are the page's title and its line */
    const withLoadingPage=(title:string,what:string,task:()=>Promise<void>)=>pageLoaderRef.current.run({
      free:()=>!sheetRef.current,apply:(result:SheetState|null)=>setSheet(result),
      show:()=>setSheet({name:'loading',context:{loading:true},panel:loadingPanel(title,what,Date.now(),{motion:capabilities.motion})}),
    },task);

    /* stage 7.14: an open /queue sheet follows the queue (a turn that ends sends from it), keeping its row of edit or delete */
    /* F-Q1: /queue lists the messages waiting in the kernel's queue (`kernel:` ids, no «move up»: they all go in together, owner
       03/10) before the CLI's own queue */
    const queueSheetEntries=()=>[...(controllerRef.current?.kernelQueue().items??[]).filter((item:any)=>item.origin==='person'&&item.text).map((item:any)=>({id:`kernel:${item.id}`,kind:'prompt' as const,text:item.text as string,inTurn:true})),...(controllerRef.current?.queueEntries()??[])];
    const refreshQueueSheet=()=>{
      const open=sheetRef.current;if(open?.name!=='queue')return;
      const body=open.panel.tabs[0]!.body;const fresh=queueSheet(queueSheetEntries(),{sel:body.kind==='list'?body.sel:0});
      setSheet({...fresh,...(open.context?{context:open.context}:{}),panel:{...fresh.panel,edit:open.panel.edit??null,confirmDel:open.panel.confirmDel??null}});
    };
    const effortRowRef:{current:TuiModel|null}=React.useRef(null);
    const [exitPrompt,setExitPrompt]=React.useState(null as number|null);
    const exitPromptRef=React.useRef(null as number|null);
    const showExitPrompt=(selected:number|null)=>{exitPromptRef.current=selected;setExitPrompt(selected);};
    /* the exit choice, from Enter or a click (stage 6c, mockup `exit:i`) */
    const chooseExit=(index:number)=>{
      showExitPrompt(null);
      const choice=EXIT_CHOICES[index];
      if(choice==='stop'){inkApp.exit();return;}
      if(choice==='wait'){const ids=workingAgents(state.agents).map((agent:LiveAgent)=>agent.childId);if(!ids.length){inkApp.exit();return;}startExitWait(ids);}
    };
    const [exitWait,setExitWait]=React.useState(null as readonly string[]|null);
    const exitWaitRef=React.useRef(null as readonly string[]|null);
    const startExitWait=(ids:readonly string[]|null)=>{exitWaitRef.current=ids;setExitWait(ids);};
    /* R5b: the /history list (its filter and the highlighted row). */
    const [historyPicker,setHistoryPicker]=React.useState(null as HistoryPicker|null);
    const checkpointStoreRef:{current:CheckpointStore|null|undefined}=React.useRef(undefined);
    const checkpointStoreFor=()=>{if(checkpointStoreRef.current===undefined)checkpointStoreRef.current=paths?.checkpointsRoot?createCheckpointStore({rootDir:paths.checkpointsRoot,projectRoot}):null;return checkpointStoreRef.current;};
    const controllerRef=React.useRef(null as any);
    const modelPickerRef=React.useRef(null as ModelPickerModel|null);
    const providerPickerRef=React.useRef(null as ProviderPickerModel|null);
    const sessionPickerRef=React.useRef(null as SessionPickerModel|null);
    /* R4: a resume or fork being confirmed; a second Enter meanwhile attached the session twice and left its cut-off run
       "writing" (measured in s09 once Enter ran the command on the first press: review D-08). */
    const sessionConfirmingRef:{current:boolean}=React.useRef(false);
    const mcpFacadeRef=React.useRef(null as ReturnType<typeof createMcpFacade>|null);
    const hookFacadeRef=React.useRef(null as ReturnType<typeof createHookFacade>|null);
    const pluginFacadeRef=React.useRef(null as ReturnType<typeof createPluginFacade>|null);
    const memoryFacadeRef=React.useRef(null as ReturnType<typeof createMemoryFacade>|null);
    /* stage 7.21: the rows of /permissions Rules, acted on by index */
    const ruleRowsRef=React.useRef([] as RuleRow[]);
    const notesFacadeRef=React.useRef(null as ReturnType<typeof createNotesFacade>|null);
    const tasksFacadeRef=React.useRef(null as ReturnType<typeof createTaskBoardFacade>|null);
    const libraryFacadeRef=React.useRef(null as ReturnType<typeof createLibraryFacade>|null);
    const researchFacadeRef=React.useRef(null as ReturnType<typeof createResearchFacade>|null);
    const automationFacadeRef=React.useRef(null as ReturnType<typeof createAutomationFacade>|null);
    const forgeFacadeRef=React.useRef(null as ReturnType<typeof createForgeFacade>|null);
    /* R4 Q-R4-7 / E7: the exit rule lives in interrupt.ts; it reads, at the moment of the key, whether the composer has a
       draft, a picker or dialog is open, or the `@` list is open (interruptContextRef is refreshed on every render). */
    const interruptContextRef:{current:()=>{draft:boolean;dialog:boolean;completion:boolean}}=React.useRef(()=>({draft:false,dialog:false,completion:false}));
    const interruptRef=React.useRef(null as ReturnType<typeof createInterruptController>|null);
    if(!interruptRef.current)interruptRef.current=createInterruptController({context:()=>interruptContextRef.current()});
    /* R1 lane X contract (D-12): the first Ctrl+C at idle only arms the exit; the hint stays in the status row for the
       confirmation window. Its single timer is the only commit an idle screen may make (one clear after 2 s, gate E5).
       R4: the hint names the key that armed it (Ctrl+C or Ctrl+D). */
    const [exitHint,setExitHint]=React.useState(false);
    const [exitHintKey,setExitHintKey]=React.useState('ctrl-c' as ExitKey);
    const exitHintTimerRef:{current:ReturnType<typeof setTimeout>|null}=React.useRef(null);
    const clearExitHintTimer=()=>{if(exitHintTimerRef.current!==null){clearTimeout(exitHintTimerRef.current);exitHintTimerRef.current=null;}};
    const showExitHint=(key:ExitKey='ctrl-c')=>{clearExitHintTimer();setExitHintKey(key);setExitHint(true);exitHintTimerRef.current=setTimeout(()=>{exitHintTimerRef.current=null;setExitHint(false);},EXIT_CONFIRM_WINDOW_MS);};
    const hideExitHint=()=>{if(exitHintTimerRef.current===null)return;clearExitHintTimer();setExitHint(false);};
    React.useEffect(()=>()=>clearExitHintTimer(),[]);
    /* R1 lane contract (TuiAppProps.onExit): the last session id and transcript, reported once on unmount. The unmount
       covers /exit, Ctrl+C, Ctrl+D and a forced exit, and runs before Ink leaves the alternate screen. */
    const exitSnapshotRef:{current:{sessionId:string|null;items:readonly TranscriptItem[]}}=React.useRef({sessionId:null,items:[]});
    exitSnapshotRef.current={sessionId:state.sessionId,items:state.transcript.items as TranscriptItem[]};
    const onExitRef=React.useRef(props.onExit);onExitRef.current=props.onExit;
    React.useEffect(()=>()=>{onExitRef.current?.(exitSnapshotRef.current);},[]);
    /* R1 E9/E15: the transcript's last plan, read by the scroll keys; its anchor keeps a scrolled view still. */
    const transcriptPlanRef:{current:TranscriptPlanReport}=React.useRef({totalRows:0,maxScroll:0,scrollRows:0,itemRows:0,anchorId:null,anchorBelow:0,belowOf:()=>null});
    const onTranscriptPlan=React.useCallback((plan:TranscriptPlanReport)=>{
      const previous=transcriptPlanRef.current;transcriptPlanRef.current=plan;
      if(!previous.anchorId)return;
      const below=plan.belowOf(previous.anchorId);
      if(below===null||below===previous.anchorBelow)return;
      const delta=below-previous.anchorBelow;
      setViewport((view:TranscriptViewport)=>view.followingTail||view.offset===0?view:{...view,offset:Math.max(0,view.offset+delta)});
    },[]);
    const transcriptPageRows=()=>Math.max(1,transcriptPlanRef.current.itemRows-1);
    /* Long chats, tappa D (Codex app/event_dispatch.rs:317-326 asks for the next older page when the view nears the top): scrolling up once the view is already at
       the top - or a click on the row - puts the next page of the beginning on the list. Nothing happens in an agent's view or when nothing waits. */
    const loadEarlierPage=()=>{if(agentView)return;setState((current:TuiState)=>current.transcript.earlier?.length?{...current,transcript:revealEarlier(current.transcript)}:current);};
    const viewIsAtTop=()=>{const plan=transcriptPlanRef.current;return plan.maxScroll<=0||plan.scrollRows>=plan.maxScroll;};
    const scrollTranscript=(event:'page-up'|'page-down'|'top'|'jump-tail')=>{
      if((event==='page-up'||event==='top')&&viewIsAtTop())loadEarlierPage();
      setTranscriptRevealId(null);
      setViewport((view:TranscriptViewport)=>{
        const plan=transcriptPlanRef.current,pageSize=transcriptPageRows(),current={...view,offset:Math.min(plan.maxScroll,Math.max(0,plan.scrollRows)),pageSize};
        if(event==='top')return plan.maxScroll>0?{...current,offset:plan.maxScroll,followingTail:false}:reduceViewport(current,'jump-tail',0);
        if(event==='jump-tail')return reduceViewport(current,'jump-tail',0);
        return reduceViewport(current,event,plan.maxScroll+pageSize);
      });
    };
    /* UI Phase 3 (owner 27/09): one wheel step moves the conversation 3 rows, within the same bounds as PageUp/PageDown;
       back at the newest row the view follows the tail again. */
    const WHEEL_ROWS=3;
    const scrollTranscriptRows=(rows:number)=>{
      if(rows>0&&viewIsAtTop())loadEarlierPage();
      setTranscriptRevealId(null);
      setViewport((view:TranscriptViewport)=>{
        const plan=transcriptPlanRef.current,current={...view,offset:Math.min(plan.maxScroll,Math.max(0,plan.scrollRows)),pageSize:transcriptPageRows()};
        const offset=Math.min(plan.maxScroll,Math.max(0,current.offset+rows));
        return offset===0?reduceViewport(current,'jump-tail',0):{...current,offset,followingTail:false};
      });
    };
    const scrollTranscriptRowsRef=React.useRef(scrollTranscriptRows);scrollTranscriptRowsRef.current=scrollTranscriptRows;
    React.useEffect(()=>mouseWheel?mouseWheel.subscribe(delta=>scrollTranscriptRowsRef.current(-delta*WHEEL_ROWS)):undefined,[mouseWheel]);
    const consoleStore=consoleWarnings??NO_CONSOLE_WARNINGS;
    const consoleWarningCount=React.useSyncExternalStore(consoleStore.subscribe,consoleStore.getSnapshot,consoleStore.getSnapshot);
    const remoteStore=remote??NO_REMOTE;
    /* T3b: the conversation on this screen, for the host window: a device's operation on it runs HERE, not in the host */
    React.useEffect(()=>{remote?.setAttached?.(()=>{const id=controllerRef.current?.current?.();return typeof id==='string'&&id?[id]:[];});},[remote]);
    /* T5: «notification sent to» is read only while this screen waits for the person (approval, question, plan) */
    /* the wall-clock time this wait began, compared with the kernel's `alle` (block 8: a record from an earlier wait never counts) */
    const waitingSinceRef=React.useRef(null as number|null);
    if(state.waitingForPerson!==true)waitingSinceRef.current=null;else if(waitingSinceRef.current===null)waitingSinceRef.current=Date.now();
    React.useEffect(()=>{remote?.setWaiting?.(()=>waitingSinceRef.current);},[remote]);
    const remoteSnapshot=React.useSyncExternalStore(remoteStore.subscribe,remoteStore.getSnapshot,remoteStore.getSnapshot);
    const reasoningVisibleRef=React.useRef(appState.reasoningVisible);reasoningVisibleRef.current=appState.reasoningVisible;
    const renderCoordinatorRef=React.useRef(null as RenderCoordinator|null);
    if(!renderCoordinatorRef.current)renderCoordinatorRef.current=renderCoordinator??createRenderCoordinator();
    const coordinator:RenderCoordinator=renderCoordinatorRef.current;
    /* judge v1611: the session controller outlives the screen. A send whose `start` answers after Ctrl+C, the end of -p or the terminal
       closing still tells the screen about its queue; once the screen is gone that word has nowhere to land, so the controller's callbacks
       drop it (expected and handled at unmount), never an unhandled RENDER_COORDINATOR_DISPOSED. Keys and clocks keep `coordinator`: they
       end with the screen. */
    const screenGoneRef=React.useRef(false);
    const forScreen={
      enqueueEvent:(eventId:string,apply:()=>void)=>{if(!screenGoneRef.current)coordinator.enqueueEvent(eventId,apply);},
      immediate:(reason:'input'|'approval'|'resize',apply:()=>void)=>screenGoneRef.current?null:coordinator.immediate(reason,apply),
    };
    const visibleEpochRef=React.useRef(0);
    const eventSequenceRef=React.useRef(0);
    /* stage 3: the latest changeSession, for the controller's callbacks made once */
    const changeSessionRef:{current:((action:'resume'|'fork',id:string)=>Promise<unknown>)|null}=React.useRef(null);
    /* riga 224: the same empty view as /clear, /resume and /fork, for a plan approved in a clean conversation */
    const freshViewRef:{current:(()=>void)|null}=React.useRef(null);
    const onboardingShownRef=React.useRef(false);

    React.useEffect(()=>{
      screenGoneRef.current=false;const unsubscribe=coordinator.subscribe(batch=>setRenderEpoch(batch.epoch));
      return()=>{screenGoneRef.current=true;unsubscribe();if(!renderCoordinator)coordinator.dispose();};
    },[coordinator,renderCoordinator]);
    React.useLayoutEffect(()=>{
      if(renderEpoch<=visibleEpochRef.current)return;
      visibleEpochRef.current=renderEpoch;
      coordinator.markVisible(renderEpoch);
    },[coordinator,renderEpoch]);

    /* ⛔ Fails closed: a catalog that cannot answer is a send that does not happen. */
    const readinessFor=async(model:string):Promise<TuiReadiness>=>{
      if(typeof catalog?.readiness!=='function')return{ready:false,code:'PROVIDER_NOT_CHOSEN',provider:null,message:t('screen.readiness.unavailable')};
      try{return await catalog.readiness(model);}catch(error){return{ready:false,code:'PROVIDER_NOT_CHOSEN',provider:null,message:t('screen.readiness.unchecked',{code:errorCode(error)})};}
    };
    /* stage 7.11e (owner 03/10): every turn's tokens and cost go to this project's usage record in the profile (numbers only) */
    const usageRecordRef:{current:ReturnType<typeof createUsageRecorder>|null}=React.useRef(null);
    /* stage 7.12 «+1 completa»: when each answer began and with which model, for the full transcript (a replayed turn has none) */
    const messageStampsRef:{current:Map<string,{at:number;model:string}>}=React.useRef(new Map());
    const replayingRef:{current:boolean}=React.useRef(false);
    if(!usageRecordRef.current){const writer=createUsageRecordWriter(usageRecordFile(paths.dataRoot,projectRoot));usageRecordRef.current=createUsageRecorder({write:row=>writer.append(row),model:()=>controllerRef.current?.model()??baseModel,session:()=>controllerRef.current?.current()??null});}
    if(!controllerRef.current)controllerRef.current=createTuiSessionController({
      ...(projectUntrusted?{askEverything:true}:{}),runtime,projectRoot,model:baseModel,mode:baseMode,rules:permissionRules??{allow:[],ask:[],deny:[]},paths,...(autoClassifier?{autoClassifier}:{}),readiness:readinessFor,
      onEvent:(event:any)=>{
        props.terminalNotifications?.event(event,(controllerRef.current?.queue().length??0)>0);
        if(!controllerRef.current?.replaying?.())developmentLog('ui.runtime_event',event,event?.type==='run.failed'?'error':'debug','tui');
        usageRecordRef.current?.observe(event);
        if(event?.type==='run.started')replayingRef.current=Boolean(event.history);
        if(event?.type==='run.started'&&!event.history)lastRunPromptRef.current=typeof event.prompt==='string'?event.prompt:null;
        /* T6: the model's `remote_phone_pair` succeeded after the person's card — live, never replayed — so the QR the kernel promised
           the model («now on the person's screen») opens here, with `soloSeAcceso` (session-registry.mjs R5.12) */
        if(event?.type==='tool.started'&&event.toolName==='remote_phone_pair'&&typeof event.toolCallId==='string')pairToolsRef.current.add(event.toolCallId);
        if(event?.type==='tool.completed'&&pairToolsRef.current.delete(event.toolCallId)&&event.result?.status==='completed'&&!replayingRef.current&&!controllerRef.current?.replaying?.())
          startRemotePairingRef.current?.({soloSeAcceso:true});
        /* 0.6.13: a live turn whose request does not fit the model — never one replayed from the journal */
        const tooLargeNow=event?.type==='run.failed'&&isRequestTooLarge(event.error)&&!replayingRef.current&&!controllerRef.current?.replaying?.();
        if(event?.type==='message.started'&&event.role==='assistant'&&!replayingRef.current&&!messageStampsRef.current.has('message:'+event.messageId)){
          const model=String(controllerRef.current?.model()??baseModel);messageStampsRef.current.set('message:'+event.messageId,{at:Date.now(),model:model.slice(model.indexOf(':')+1)});
        }
        const eventId=`runtime-${++eventSequenceRef.current}-${String(event.type)}`;
        forScreen.enqueueEvent(eventId,()=>{
          if(event.type==='run.started')setBusySince(Date.now());
          /* UI Phase 0 D23: the first message titles the session in /resume (kept once; a failure only loses the title). */
          if(event.type==='run.started'&&typeof event.prompt==='string'&&event.prompt&&typeof event.sessionId==='string'&&event.sessionId&&!event.history)void createSessionMetadataStore({rootDir:sessionMetadataRoot(paths.dataRoot)}).setFirstMessage(event.sessionId,event.prompt).catch((error:unknown)=>developmentLogError('ui.session.first_message',error,{},'tui'));
          if(event.type==='run.completed'||event.type==='run.failed'||event.type==='run.cancelled')interruptRef.current!.reset();
          /* UI Phase 1: a collapsed block now shows its live preview too (unless motion is reduced), so it is new content */
          if(transcriptEventAddsItem(event)&&(event.type!=='reasoning.started'||reasoningVisibleRef.current||capabilities.motion))setViewport((view:TranscriptViewport)=>reduceViewport(view,'new-content',0));
          setState((current:TuiState)=>reduceTuiEvent(current,event));
          if(tooLargeNow)requestTooLargeReturnedRef.current(event.error);
        });
      },
      onApproval:(next:PendingTuiApproval|null)=>{developmentLog('ui.approval',{requestId:next?.requestId??null,action:next?.action??null,reason:next?.reason??null},'info','tui');
        props.terminalNotifications?.approval(next?.requestId??null);
        /* R3 approval key race: the grace starts when a request is first shown, not on every redraw. */
        pendingRef.current=next;
        if(!next)approvalShownRef.current=null;
        else if(approvalShownRef.current?.requestId!==next.requestId){approvalShownRef.current={requestId:next.requestId,shownAt:clockRef.current(),answered:false};approvalUiRef.current={expanded:false,selected:approvalDefaultSelected(approvalChoicesFor(next.action))};}
        return forScreen.immediate('approval',()=>{
        if(next)setTranscriptSearch(null);
        setPending(next);setApprovalExpanded(false);setApprovalScroll(0);setApprovalSelected(next?approvalDefaultSelected(approvalChoicesFor(next.action)):APPROVAL_DEFAULT_SELECTED);
        /* R3 Q-R3-7 (gate E7): the status says `waiting for you` exactly while the dialog is open. */
        setState((current:TuiState)=>current.waitingForPerson===Boolean(next)?current:{...current,waitingForPerson:Boolean(next)});
        setAppState((current:TuiAppState)=>next?openOverlay(current,{kind:'approval',requestId:next.requestId}):(current.overlay?.kind==='approval'?closeOverlay(current):current));
      });},
      onPlan:(next:PendingTuiPlan|null)=>{developmentLog('ui.plan',{requestId:next?.requestId??null,revision:next?.revision??null},'info','tui');
        const now=clockRef.current();
        if(!next){planRef.current=null;planShownRef.current=null;}
        else if(planRef.current?.requestId!==next.requestId||planRef.current.hash!==next.hash){
          planRef.current=openPlanCard({requestId:next.requestId,hash:next.hash,content:next.content});
          planShownRef.current={requestId:next.requestId,shownAt:now,answered:false};
        }
        return forScreen.immediate('approval',()=>{
        if(next)setTranscriptSearch(null);
        setPlanCard(planRef.current);
        setState((current:TuiState)=>current.waitingForPerson===Boolean(next)?current:{...current,waitingForPerson:Boolean(next)});
        setAppState((current:TuiAppState)=>next?openOverlay(current,{kind:'plan',requestId:next.requestId}):(current.overlay?.kind==='plan'?closeOverlay(current):current));
      });},
      /* Stage 3: after an approval the screen shows the mode the kernel set; a clean conversation moves the screen into it. */
      onElicitation:(next:PendingTuiElicitation|null)=>{developmentLog('ui.elicitation',{requestId:next?.requestId??null,mode:next?.mode??null},'info','tui');
        const now=clockRef.current();
        if(!next){elicitRef.current=null;elicitShownRef.current=null;}
        else if(elicitRef.current?.requestId!==next.requestId){elicitRef.current=openElicitCard(next);elicitShownRef.current={requestId:next.requestId,shownAt:now,answered:false};}
        return forScreen.immediate('approval',()=>{
        if(next)setTranscriptSearch(null);
        setElicitCard(elicitRef.current);
        setState((current:TuiState)=>current.waitingForPerson===Boolean(next)?current:{...current,waitingForPerson:Boolean(next)});
        setAppState((current:TuiAppState)=>next?openOverlay(current,{kind:'elicit',requestId:next.requestId}):(current.overlay?.kind==='elicit'?closeOverlay(current):current));
      });},
      onPlanApproved:({mode,newSessionId}:{mode:PermissionMode;newSessionId?:string})=>forScreen.enqueueEvent(`plan-approved-${++eventSequenceRef.current}`,()=>{
        setState((current:TuiState)=>({...current,status:{...current.status,permissionMode:mode}}));
        if(newSessionId){freshViewRef.current?.();void changeSessionRef.current?.('resume',newSessionId).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.plan'))));}
      }),
      /* Stage 3, pezzo 13c: the kernel changed the mode by itself (the model asked for plan mode): the screen shows it. */
      /* owner 27/10/2026 («da remoto il dispositivo collegato deve poter cambiare tutte le impostazioni e sul pc devono essere visibili
         subito come modello, ragionamento etc»): the kernel's settings snapshot reaches the status row at once; a change made from a
         device is also said once in the transcript, so the model does not change under the person's eyes without a word */
      onKernelSettings:({model,reasoningEffort:effort,origin}:{model:string|null;reasoningEffort:string|null;origin:{kind:'computer'}|{kind:'model'}|{kind:'device';deviceId:string};reason:string})=>forScreen.enqueueEvent(`kernel-settings-${++eventSequenceRef.current}`,()=>{
        /* Desktop review block 11 E-R3: the kernel also takes «minimal» and «none» (config.mjs EFFORT_AMMESSI), which the CLI's own
           choices do not offer; a device may pick them, and the screen says the kernel's level as it is, never «model default» */
        const nextEffort=([...REASONING_EFFORTS,'minimal','none'] as readonly string[]).includes(String(effort))?effort as ReasoningEffort:null;
        const changedEffort=reasoningEffortRef.current!==nextEffort;
        if(changedEffort){reasoningEffortRef.current=nextEffort;setReasoningEffort(nextEffort);}
        const said=changedEffort&&origin.kind==='device'?[t('screen.settings.fromDeviceEffort',{effort:nextEffort??t('screen.effort.modelDefault')})]:[];
        setState((current:TuiState)=>{
          const changedModel=Boolean(model)&&current.status.model!==model;
          const next=changedModel?{...current,status:{...current.status,model:model!}}:current;
          const lines=[...(changedModel&&origin.kind==='device'?[t('screen.settings.fromDeviceModel',{model:model!})]:[]),...said];
          return lines.length?localMessage(next,lines.join(' · ')):next;
        });
      }),
      onKernelMode:({mode}:{mode:PermissionMode;reason?:string})=>forScreen.enqueueEvent(`kernel-mode-${++eventSequenceRef.current}`,()=>setState((current:TuiState)=>current.status.permissionMode===mode?current:{...current,status:{...current.status,permissionMode:mode}})),
      onAgentQuestions:(list:readonly PendingAgentQuestion[])=>forScreen.enqueueEvent(`agent-questions-${++eventSequenceRef.current}`,()=>setAgentQuestions(list)),
      onQuestion:(next:PendingTuiQuestion|null)=>{developmentLog('ui.question',{requestId:next?.requestId??null,count:next?.questions.length??0},'info','tui');
        const now=clockRef.current();
        if(!next){questionRef.current=null;questionShownRef.current=null;}
        else if(questionRef.current?.requestId!==next.requestId){
          questionRef.current=openQuestionCard({requestId:next.requestId,questions:next.questions,now,timeoutMs:questionTimeoutMs(questionTimeoutRef.current),asker:next.asker});
          questionShownRef.current={requestId:next.requestId,shownAt:now,answered:false};
        }
        /* the person's dialogs share the approval flush reason */
        return forScreen.immediate('approval',()=>{
        if(next)setTranscriptSearch(null);
        setQuestionCard(questionRef.current);setQuestionNow(now);
        setState((current:TuiState)=>current.waitingForPerson===Boolean(next)?current:{...current,waitingForPerson:Boolean(next)});
        setAppState((current:TuiAppState)=>next?openOverlay(current,{kind:'question',requestId:next.requestId}):(current.overlay?.kind==='question'?closeOverlay(current):current));
      });},
      onQueueChange:(next:readonly TuiQueuedAction[])=>{developmentLog('ui.queue',{count:next.length,kinds:next.map(row=>row.kind)},'debug','tui');return forScreen.enqueueEvent(`queue-${++eventSequenceRef.current}`,()=>{setQueuedActions([...next]);refreshQueueSheet();});},
      onQueueRestored:(next:readonly TuiQueueEntry[])=>forScreen.enqueueEvent(`queue-restored-${++eventSequenceRef.current}`,()=>{/* stage 7.14: the notice names /queue; the sheet opens when asked */setState((current:TuiState)=>localMessage(current,tn('screen.queue.restored',next.length)));}),
      onKernelQueue:(next:TuiKernelQueue)=>forScreen.enqueueEvent(`kernel-queue-${++eventSequenceRef.current}`,()=>{setKernelQueue(next);refreshQueueSheet();}),
      /* F-Q1 (owner 03/10, «Tornano nel composer»): after a stop the queued messages come back as the draft, before what is typed */
      onComposerRestore:(text:string)=>forScreen.enqueueEvent(`composer-restore-${++eventSequenceRef.current}`,()=>{const typed=currentEditor().text;setEditorText(typed.trim()?[text,typed].join('\n\n'):text);}),
      onQueuedSlash:(text:string)=>executeSlashRef.current(text),
      onQueuedDispatch:(action:TuiQueuedAction)=>forScreen.enqueueEvent(`queue-dispatch-${++eventSequenceRef.current}`,()=>{setViewport((view:TranscriptViewport)=>reduceViewport(view,'new-content',0));setState((current:TuiState)=>userMessage(current,action.kind==='command'?`!${action.text}`:action.text));}),
      onSteerState:(next:TuiSteerState)=>forScreen.enqueueEvent(`steer-${++eventSequenceRef.current}-${next.status}`,()=>setState((current:TuiState)=>localMessage(current,
        next.status==='requested'?t('screen.steer.requested')
        :next.status==='applied'?t('screen.steer.applied')
        :next.status==='cancelled'?t('screen.steer.cancelled')
        :screenErrorText(Object.assign(new Error(next.message),{code:next.code}),act('screen.action.steering'),{rejected:next.status!=='failed'})
      ))),
      onError:(error:unknown)=>{developmentLogError('ui.error',error,{},'tui');return forScreen.enqueueEvent(`error-${++eventSequenceRef.current}`,()=>setState((current:TuiState)=>localMessage(current,screenErrorText(error))));},
    });
    const controller=controllerRef.current;
    const executeSlashRef:{current:(text:string)=>Promise<void>}=React.useRef(async()=>{});

    React.useEffect(()=>{developmentLog('ui.state',{focus:appState.focus.current,overlay:appState.overlay?.kind??null,running:state.running,sessionId:state.sessionId,model:state.status.model,permissionMode:state.status.permissionMode,queueCount:queuedActions.length},'debug','tui');},[appState.focus.current,appState.overlay?.kind,state.running,state.sessionId,state.status.model,state.status.permissionMode,queuedActions.length]);

    async function refreshContextStatus(){
      const id=state.sessionId??controller.current?.()??null;
      if(!id||typeof runtime.contextStatus!=='function'){setContextStatus(null);return null;}
      try{const next=await runtime.contextStatus(id);setContextStatus((current:any)=>sameValue(current,next)?current:next);return next;}catch{setContextStatus(null);return null;}
    }
    React.useEffect(()=>{void refreshContextStatus();},[state.sessionId,state.running]);

    function closeAgentView(){
      const handle=agentViewRef.current;agentViewRef.current=null;handle?.close();setAgentView(null);
      const saved=mainViewportRef.current;mainViewportRef.current=null;
      setViewport((view:TranscriptViewport)=>saved??{...view,offset:0,unseen:0,followingTail:true});
    }
    function openAgentView(row:{id:string;task:string|null}){
      agentViewRef.current?.close();
      if(!mainViewportRef.current)mainViewportRef.current=viewport;
      setViewport((view:TranscriptViewport)=>({...view,offset:0,unseen:0,followingTail:true}));
      agentViewRef.current=createAgentView({runtime,target:{sessionId:row.id,task:row.task},secretValues:secretValuesFromEnvironment(process.env),onChange:(next:AgentViewState)=>setAgentView(next)});
    }
    /* Another session in use (resume, fork, /clear) and the app closing let go of the watched agent. */
    React.useEffect(()=>{if(agentViewRef.current)closeAgentView();},[state.sessionId]);
    React.useEffect(()=>()=>{agentViewRef.current?.close();agentViewRef.current=null;},[]);
    async function refreshAgentRows(){
      try{
        const tree=await controller.agentTree();
        const rows=agentRosterRows(tree);
        setAgentRows((current:AgentRosterRow[])=>sameValue(current,rows)?current:rows);
      }catch{/* Agent roster is read-only chrome; runtime errors remain on the primary session path. */}
    }
    React.useEffect(()=>{void refreshAgentRows();},[state.sessionId,state.running,state.tools.length,state.messages.length]);
    /* UI Phase 0 (owner 27/09, agents in the footer while one works): the main session is quiet while it waits for its
       child, so nothing above re-read the kernel list and the child only showed once it had finished. While a delegation
       runs the list is read once a second (Claude Code's footer follows its agents live). */
    const delegating=state.tools.some((row:any)=>row.name==='delega_sottotask'&&(row.status==='queued'||row.status==='running'||row.status==='streaming'));
    /* ASYNC step 3: a delegated agent outlives its parent's turn; the list is read while one works, and again when one is
       announced or ends (not on every step it takes: those arrive many times a second). */
    const agentsWorking=workingAgents(state.agents).length>0;
    const agentsKey=state.agents.map((agent:LiveAgent)=>`${agent.childId}${agent.ended?'.':''}`).join(',');
    React.useEffect(()=>{if(!delegating&&!agentsWorking)return;const timer=setInterval(()=>{void refreshAgentRows();},1_000);return()=>clearInterval(timer);},[delegating,agentsWorking]);
    React.useEffect(()=>{if(agentsKey)void refreshAgentRows();},[agentsKey]);
    /* ASYNC step 4: «wait for them, then exit» leaves once its agents ended and the main agent answered them (or, with no
       wake, after the grace), checked on every change and once a second for the grace. */
    /* ASYNC step 5: the terminal's progress indicator stays on while delegated agents work with no turn open. */
    const workingCount=workingAgents(state.agents).length;
    React.useEffect(()=>{props.terminalNotifications?.agents(workingCount);},[workingCount,state.running]);
    const exitSettledRef=React.useRef(null as number|null);
    React.useEffect(()=>{
      if(!exitWait){exitSettledRef.current=null;return;}
      const check=()=>{
        const settled=!state.running&&!state.agents.some((agent:LiveAgent)=>exitWait.includes(agent.childId)&&!agent.ended);
        if(!settled)exitSettledRef.current=null;else if(exitSettledRef.current===null)exitSettledRef.current=Date.now();
        if(exitWaitDone({waitFor:exitWait,agents:state.agents,running:state.running,settledSinceMs:exitSettledRef.current,nowMs:Date.now()}))inkApp.exit();
      };
      check();
      const timer=setInterval(check,1_000);
      return()=>clearInterval(timer);
    },[exitWait,state.agents,state.running]);
    /* ASYNC step 3: stopping delegated agents (/agents stop, x in the list). The kernel stops only that child
       (`ferma`, no cascade) and hands its parent a «did not finish» result, which wakes the parent like any result. */
    async function stopAgents(rows:readonly AgentRosterRow[],{explicit}:{explicit:boolean}){
      const stoppable=rows.filter(row=>stoppableAgent(row,state.agents)!==null);
      if(!stoppable.length){addLocal(explicit&&rows.length===1?t('screen.agents.notRunning',{task:rows[0]!.task??rows[0]!.id.slice(0,8)}):t('screen.agents.noneRunning'));return;}
      for(const row of stoppable){
        addLocal(t('screen.agents.stopping',{task:row.task??row.id.slice(0,8)}));
        try{await runtime.cancel(row.id);}catch(error){addLocal(screenErrorText(error,act('screen.action.agentStop')));}
      }
      void refreshAgentRows();
    }
    /* Stage 6a (mockup): `/agents` shows the panel when there is room for it, else the page; Ctrl+A and Alt+A cycle them. */
    /* the agents' clock moves at once, so the first frame of the panel or the page does not show a stale time */
    /* FE-048: the right panel opens on a card and takes the focus (the mockup's `aprireCarta`) */
    function openPanelCard(id:string){
      setPanelCards((open:ReadonlySet<string>)=>new Set([...open,id]));setPanelSelected(Math.max(0,(PANEL_CARDS as readonly string[]).indexOf(id)));
      setFrameSide('panel');setPanelOpen(true);setPanelFocused(true);setBarFocused(false);setPanelKeyAt(clockRef.current());
    }
    /* Alt+N and /sidebar; Alt+D and /panel (the mockup's `cambiaBarra` and `cambiaDestra`) */
    function toggleBar(){
      setFrameSide('bar');setPanelFocused(false);
      if(barOpen&&barFocused){setBarOpen(false);setBarFocused(false);}else{setBarOpen(true);setBarFocused(true);setBarSelected(0);}
    }
    function togglePanel(){
      setPanelKeyAt(clockRef.current());
      if(panelColumnsRef.current>0&&panelFocused){setPanelOpen(false);setPanelFocused(false);setFrameSide('bar');return;}
      setFrameSide('panel');setPanelOpen(true);setPanelFocused(true);setBarFocused(false);
    }
    function agentsStep(step:AgentsStep){
      setMotionNow(Date.now());
      if(step==='card'){openPanelCard('agents');return;}
      setPanelFocused(false);
      if(step==='page'){setAgentsSurface((current:AgentsSurface)=>openAgentsPage(current,agentCardsNow,null));return;}
      setAgentsSurface((current:AgentsSurface)=>({...current,page:null}));
      if(frameViewRef.current!=='full'){setPanelOpen(false);setFrameSide('bar');}
    }
    const agentsPlace=()=>({cardShown:panelColumnsRef.current>0&&panelCards.has('agents'),columns:terminalColumns});
    function showAgents(){agentsStep(showAgentsSurface(agentsSurface,agentsPlace()));}
    function cycleAgents(){agentsStep(cycleAgentsSurface(agentsSurface,agentsPlace()));}
    /* the keys of the right panel while it has the focus (the mockup's `tastoDestra`) */
    function handlePanelKey(ch:string,key:any){
      const count=PANEL_CARDS.length,id=PANEL_CARDS[panelSelected]??PANEL_CARDS[0];
      const used=()=>{setPanelKeyAt(clockRef.current());return true;};
      if(key.downArrow){setPanelSelected((at:number)=>(at+1)%count);return used();}
      if(key.upArrow){setPanelSelected((at:number)=>(at+count-1)%count);return used();}
      if(key.leftArrow||key.rightArrow||ch===' '){
        setPanelCards((open:ReadonlySet<string>)=>{const next=new Set(open);if(ch===' '?!next.has(id):key.rightArrow===true)next.add(id);else next.delete(id);return next;});
        return used();
      }
      if(key.return){
        setPanelFocused(false);
        if(id==='context')void executeSlashRef.current('/context');else agentsStep('page');
        return true;
      }
      if(key.escape){
        setPanelFocused(false);
        if(frameViewRef.current!=='full'){setPanelOpen(false);setFrameSide('bar');}
        return true;
      }
      /* a typed letter goes to the composer, and the focus with it: the card keys must not eat a sentence */
      if(ch&&!key.ctrl&&!key.meta)setPanelFocused(false);
      return false;
    }
    /* x on the page (mockup agentsKey): stops the selected agent unless it is done; the page stays open. */
    async function stopAgentCard(card:AgentCard){
      if(card.state==='done'){addLocal(t('screen.agents.notRunning',{task:card.task}));return;}
      addLocal(t('screen.agents.stopping',{task:card.task}));
      try{await runtime.cancel(card.id);setToast(t('screen.agentsPanel.toastStopped',{task:[...card.task].slice(0,40).join('')}));}catch(error){addLocal(screenErrorText(error,act('screen.action.agentStop')));}
      void refreshAgentRows();
    }
    /* The page owns the keys while it is open (mockup agentsKey): Esc back, ←/→ the view, Tab filter, ↑/↓ choose, Enter its
       conversation, x stop. Space and the numbers answer an agent's question (stage 6b). */
    /* Stage 6b: the reply goes to the child's own session; the mockup's toast says it went (a refusal says why). */
    function sendAgentReply(ask:PendingAgentQuestion,reply:{number:number}|{text:string}){
      const response=agentReply(ask,reply);if(!response)return;
      void controller.answerAgentQuestion(ask.requestId,response).then(()=>setToast(t('screen.agentsPanel.toastSent'))).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.question'))));
    }
    function runBarAction(verb:string,id:string){
      if(verb==='card'){setPanelCards((open:ReadonlySet<string>)=>{const next=new Set(open);if(next.has(id))next.delete(id);else next.add(id);return next;});return;}
      if(verb==='group'){setBarGroups((open:ReadonlySet<string>)=>{const next=new Set(open);if(next.has(id))next.delete(id);else next.add(id);return next;});return;}
      setBarFocused(false);
      if(verb==='session'){void executeSlashRef.current(`/resume ${id}`);return;}
      const voice=[...BAR_TOP,...BAR_GROUPS.flatMap(group=>group.voices),...BAR_BOTTOM].find(row=>row.id===id);
      if(voice)void executeSlashRef.current(voice.command);
    }
    /* the keys of the bar while it has the focus; a letter works with its group closed too */
    function handleBarKey(ch:string,key:any){
      const entries=barEntriesRef.current;if(!entries.length)return false;
      const move=(delta:number)=>{setBarSelected((at:number)=>Math.max(0,Math.min(entries.length-1,at+delta)));return true;};
      if(key.upArrow)return move(-1);
      if(key.downArrow)return move(1);
      if(key.escape){setBarFocused(false);return true;}
      if(key.return||key.rightArrow||key.leftArrow){
        const entry=entries[Math.min(barSelected,entries.length-1)]!;
        if(entry.kind==='group'){runBarAction('group',entry.group.id);return true;}
        if(key.leftArrow)return true;
        if(entry.kind==='session')runBarAction('session',entry.session.id);else runBarAction('bar',entry.voice.id);
        return true;
      }
      if(ch&&ch.length===1&&!key.ctrl&&!key.meta){
        const voice=[...BAR_TOP,...BAR_GROUPS.flatMap(group=>group.voices),...BAR_BOTTOM].find(row=>row.key===ch);
        if(voice){runBarAction('bar',voice.id);return true;}
      }
      return true;
    }
    /* Stage 6c: a click runs its target's verb, as the approved mockup's `click(verb:arg)` (MOCKUP-FASE-UI-2026-10-01.html). */
    function runClickAction(action:string){
      const at=action.indexOf(':'),verb=at<0?action:action.slice(0,at),arg=at<0?'':action.slice(at+1);
      if(verb==='centre'&&arg==='review'){void executeSlashRef.current('/diff');return;}
      if(verb==='centre'&&arg==='chat'){setSheet(null);return;}
      if(verb==='open'){void executeSlashRef.current(`/${arg}`);return;}
      if(verb==='frame'&&arg==='mode'){cycleMode();return;}
      if(verb==='frame'&&arg==='close-bar'){setBarOpen(false);setBarFocused(false);return;}
      if(verb==='frame'&&arg==='close-panel'){setPanelOpen(false);setPanelFocused(false);setFrameSide('bar');return;}
      if(verb==='frame'&&arg==='todo'){agentsStep('page');return;}
      if(verb==='queue'){void applySheetAction({kind:'queueSend',id:arg});return;}
      if(verb==='shelf'&&arg==='automation'){setSheet(null);void executeSlashRef.current('/automations');return;}
      if(verb==='shelf'&&sheetRef.current?.name==='shelf'){runSheetStep({panel:sheetRef.current.panel,effect:{kind:'key',key:action,index:null,item:null}});return;}
      if(verb==='uday'&&sheetRef.current?.name==='usage'){runSheetStep({panel:sheetRef.current.panel,effect:{kind:'key',key:action,index:null,item:null}});return;}
      if((verb==='bfilter'||verb==='bcard'||verb==='blane')&&sheetRef.current?.name==='board'){runSheetStep({panel:sheetRef.current.panel,effect:{kind:'key',key:action,index:null,item:null}});return;}
      if(verb==='bar'||verb==='group'||verb==='session'||verb==='card'){runBarAction(verb,arg);return;}
      /* the card above the composer takes its own buttons, once its grace is over, as its keys do (stage 3) */
      const cardOpen=(shown:unknown)=>approvalInputGate(shown as any,clockRef.current())==='dialog';
      /* the sheet's own targets (the mockup's panelClick verbs) */
      if(sheetRef.current&&/^p(?:key|tab|item|field|fopt|alt|filter)$/u.test(verb)){runSheetStep(panelClick(sheetRef.current.panel,action));return;}
      if(appState.overlay?.kind==='approval'&&pendingRef.current){if(cardOpen(approvalShownRef.current)){const choice=approvalClickChoice(action,approvalChoicesFor(pendingRef.current.action));if(choice)answerApproval(choice,false);}return;}
      if(appState.overlay?.kind==='question'&&questionRef.current){if(cardOpen(questionShownRef.current)){const result=questionCardClick(questionRef.current,action);if(result)applyQuestion(result);}return;}
      if(appState.overlay?.kind==='plan'&&planRef.current){if(cardOpen(planShownRef.current)){const outcome=planCardClick(planRef.current,action);if(outcome)applyPlan(outcome);}return;}
      if(appState.overlay?.kind==='elicit'&&elicitRef.current){if(cardOpen(elicitShownRef.current)){const card=elicitRef.current;const result=elicitCardClick(card,action);if(result)applyElicit(card,result);}return;}
      if(appState.overlay?.kind==='consent'&&consentRef.current){if(cardOpen(consentShownRef.current)){const result=consentCardClick(consentRef.current,action);if(result)applyConsent(result);}return;}
      /* the «You: …» part of the row above the view: the latest prompt comes into view (Claude Code fullscreen) */
      /* the menus (stage 6c): the `/` list runs the command, a picker chooses its row, the theme list shows the theme, the exit
         prompt chooses — each as its Enter or ↑/↓ would */
      if(verb==='slash'&&appState.focus.current==='command-menu'){const index=commandMenuItems(currentEditor().text).findIndex(row=>`/${row.command.name}`===arg);if(index>=0){commandMenuSelectionStore.highlight(index);void confirmPicker();}return;}
      if(verb==='pick'&&(appState.focus.current==='model-picker'||appState.focus.current==='provider-picker'||appState.focus.current==='session-picker')){const index=Number(arg);setPickerSelection((current:SelectionState)=>({...current,selected:index}));void confirmPicker('run',index);return;}
      if(verb==='theme'&&themePicker){const index=Number(arg);if(index>=0&&index<PAGE_THEMES.length){setThemePicker({...themePicker,selected:index});themeStore.set(PAGE_THEMES[index]!);}return;}
      if(verb==='exit'&&exitPromptRef.current!==null){const index=Number(arg);if(index>=0&&index<EXIT_CHOICES.length)chooseExit(index);return;}
      if(verb==='unwatch'&&agentView){closeAgentView();return;}
      if(verb==='file'&&fileCompletionRef.current&&appState.focus.current==='composer'){const index=Number(arg);const current=fileCompletionRef.current;if(index>=0&&index<current.rows.length){fileCompletionRef.current={...current,selected:index};setFileCompletion(fileCompletionRef.current);acceptCompletion('tab');}return;}
      if(verb==='toggle'){setOpenItems((current:ReadonlySet<string>)=>toggleOpenItem(current,arg));return;}
      if(verb==='jump'){scrollTranscript('jump-tail');return;}
      if(verb==='earlier'){loadEarlierPage();return;}
      if(verb==='jumpprompt'){const prompt=[...transcriptItemsForCurrentView()].reverse().find((item:TranscriptItem)=>item.kind==='message'&&item.role==='user');if(prompt)jumpTranscriptItem(prompt.id);return;}
      if(verb==='agents'){showAgents();return;}
      if(verb==='agentspage'){setMotionNow(Date.now());setAgentsSurface((current:AgentsSurface)=>openAgentsPage(current,agentCardsNow,null));return;}
      if(verb==='agentpage'){setMotionNow(Date.now());setAgentsSurface((current:AgentsSurface)=>openAgentsPage(current,agentCardsNow,arg));return;}
      if(verb==='atab'){setAgentsSurface((current:AgentsSurface)=>current.page?{...current,page:{...current.page,tab:Number(arg)}}:current);return;}
      if(verb==='aview'){setAgentsSurface((current:AgentsSurface)=>current.page?{...current,page:{...current.page,view:Number(arg)}}:current);return;}
      if(verb==='agent'){setAgentsSurface((current:AgentsSurface)=>current.page?{...current,page:{...current.page,selectedId:arg,reply:null}}:current);return;}
      if(verb==='areply'){
        const selected=agentCardsNow.find(card=>card.id===agentsSurface.page?.selectedId)??agentsOrder(agentCardsNow,agentsSurface.page?.tab??0)[0];
        const ask=selected?.question?.requestId?agentQuestions.find((q:PendingAgentQuestion)=>q.requestId===selected.question!.requestId):null;
        if(ask)sendAgentReply(ask,{number:Number(arg)+1});
      }
    }
    const runClickRef:{current:(action:string)=>void}=React.useRef(runClickAction);runClickRef.current=runClickAction;
    function handleAgentsPageKey(ch:string,key:any){
      const page=agentsSurface.page;if(!page)return;
      if(key.ctrl&&(ch==='c'||ch==='C')){if(state.running)cancelActiveRun();else setAgentsSurface((current:AgentsSurface)=>({...current,page:null}));return;}
      const order=agentsOrder(agentCardsNow,page.tab);
      const selected=agentCardsNow.find(card=>card.id===page.selectedId)??order[0]??null;
      /* Stage 6b (mockup agentsKey): Space replies to the selected agent's question on the page, or opens the stage 3 card when it
         holds several questions or choices; a number picks a choice; while replying Enter sends, Esc gives up the reply. */
      const ask=selected?.question?.requestId?agentQuestions.find((q:PendingAgentQuestion)=>q.requestId===selected.question!.requestId)??null:null;
      const reply=page.reply??null;
      const setReply=(next:string|null)=>setAgentsSurface((current:AgentsSurface)=>current.page?{...current,page:{...current.page,reply:next}}:current);
      if(reply!==null){
        if(key.escape){setReply(null);return;}
        if(key.return){if(ask)sendAgentReply(ask,{text:reply});setReply(null);return;}
        if(key.backspace||key.delete){setReply(reply.slice(0,-1));return;}
        if(/^[1-9]$/u.test(ch)&&!reply&&ask){sendAgentReply(ask,{number:Number(ch)});setReply(null);return;}
        if(ch&&!key.ctrl&&!key.meta&&!key.tab&&!key.upArrow&&!key.downArrow&&!key.leftArrow&&!key.rightArrow){setReply(reply+ch);return;}
        return;
      }
      if(key.escape){setAgentsSurface((current:AgentsSurface)=>({...current,page:null}));return;}
      if(key.leftArrow||key.rightArrow){setAgentsSurface((current:AgentsSurface)=>current.page?{...current,page:{...current.page,view:((current.page.view??0)+1)%AGENT_VIEWS.length}}:current);return;}
      /* the Timeline is a chart: nothing on it is selected, so the keys of an agent do not reach it */
      if(page.view)return;
      if(ch===' '&&!key.ctrl&&!key.meta&&ask){
        if(simpleQuestion(ask.questions))setReply('');
        else{setAgentsSurface((current:AgentsSurface)=>({...current,page:null}));controller.openAgentQuestion(ask.requestId);}
        return;
      }
      if(/^[1-9]$/u.test(ch)&&!key.ctrl&&!key.meta&&ask&&simpleQuestion(ask.questions)){sendAgentReply(ask,{number:Number(ch)});return;}
      if(key.tab&&!key.shift){setAgentsSurface((current:AgentsSurface)=>current.page?{...current,page:{...current.page,tab:(current.page.tab+1)%AGENT_TABS.length}}:current);return;}
      if(key.upArrow||key.downArrow){const next=moveAgentSelection(order,page.selectedId,key.upArrow?-1:1);setAgentsSurface((current:AgentsSurface)=>current.page?{...current,page:{...current.page,selectedId:next}}:current);return;}
      if(key.return){
        if(!selected)return;
        setAgentsSurface((current:AgentsSurface)=>({...current,page:null}));
        if(selected.id!==agentView?.sessionId)openAgentView({id:selected.id,task:selected.task});
        return;
      }
      if((ch==='x'&&!key.ctrl&&!key.meta)||(key.ctrl&&(ch==='x'||ch==='X'))){if(selected)void stopAgentCard(selected);return;}
    }

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
        /* F-Q3 (owner 03/10): started on a resumed or forked session, the screen shows that session's own effort */
        if(id&&(invocation.resume||invocation.fork))void controller.listSessions({scope:'loaded'}).then((rows:readonly CliSessionSummary[])=>{
          const row=rows.find(summary=>summary.id===id);if(alive&&row)setReasoningEffort(row.reasoningEffort);
        }).catch(()=>{/* the list is a mirror: a failure keeps the configured effort on screen */});
        /* owner 02/10 («ripresa visibile»): a turn the last TALOS left in the middle is said once, with the way back */
        if(!invocation.resume&&!invocation.fork)void runtime.interruptedByPreviousProcess?.().then((rows:readonly CliSessionSummary[])=>{
          if(!alive)return;
          for(const row of rows)addLocal(t('screen.restart.interrupted',{name:row.name??t('screen.restart.unnamed'),id:row.id.slice(0,8)}));
        }).catch((error:unknown)=>developmentLogError('tui.restart.interrupted_failure',error,{},'tui-app'));
      });}).catch((error:unknown)=>{if(alive){setBoot((current:BootState)=>markBootError(current));setState((current:TuiState)=>localMessage(current,screenErrorText(error,act('screen.action.startup'))));}});
      void refreshSelection(()=>alive);
      return()=>{alive=false;controller.close();};
    },[]);

    const updateEditor=(fn:(editor:EditorState)=>EditorState)=>{const editor=composerStore.update(fn);setAppState((current:TuiAppState)=>current.editor===editor?current:{...current,editor});return editor;};
    const setEditorText=(text:string)=>updateEditor(editor=>replaceEditorText(editor,text));
    /*
     * R4 Q-R4-8 / E8: the `@` list follows the composer while the person types (it opened on Tab only: gate §0.8). It
     * listens to the composer store, so the fast input path keeps its speed: a key that does not change the `@` token at
     * the end of the text costs one comparison and no render. Nothing runs while the screen is idle (R1).
     */
    const checkCompletion=(force=false)=>{
      const watch=completionWatchRef.current;
      const token=lastProjectToken(composerStore.getSnapshot().text);
      if(!force&&token===watch.token)return;
      watch.token=token;const seq=++watch.seq;
      if(force)watch.dismissed=null;
      if(!token||token===watch.dismissed){if(!token)watch.dismissed=null;setFileCompletion((current:FileCompletion|null)=>current===null?current:null);return;}
      void completeProjectFiles(projectRoot,token,{index:()=>projectIndexRef.current.get()}).then(({rows,source})=>{if(watch.seq===seq)setFileCompletion({token,rows,selected:0,source});},()=>{if(watch.seq===seq)setFileCompletion(null);});
    };
    const checkCompletionRef:{current:()=>void}=React.useRef(()=>{});checkCompletionRef.current=()=>checkCompletion(false);
    React.useEffect(()=>{const run=()=>checkCompletionRef.current();run();return composerStore.subscribe(run);},[composerStore]);
    /* a page covers the chat: what is said is also said on its row, also when the page opens right after, with no tick: it may be a refusal */
    const addLocal=(text:string,tone:'warn'|null=null)=>{pageNoteOwnerRef.current=sheetRef.current?.name??null;pageNoteToneRef.current=tone;setPageNote(text);setState((current:TuiState)=>localMessage(current,text));};
    /* Startup stage 1 (owner 02/10; registro 12): the screen is up before the kernel. When it is ready, main's startup says
       which reasoning effort it applied and what it used to write on stderr before the screen; a choice the person made
       meanwhile (/effort, /model) is kept. A startup that fails ends the TUI from run.ts. */
    const effortChosenRef=React.useRef(false);
    /* the first answer of the catalog, once DRAWN: a command typed before it waits for it, then runs again from the render
       that has it (its own closure still holds the state from before the catalog answered) */
    const selectionShownRef=React.useRef(null as null|{done:boolean;promise:Promise<void>;resolve:()=>void});
    if(!selectionShownRef.current){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});selectionShownRef.current={done:false,promise,resolve};}
    React.useEffect(()=>{if(selectionLoaded&&selectionShownRef.current&&!selectionShownRef.current.done){selectionShownRef.current.done=true;selectionShownRef.current.resolve();}},[selectionLoaded]);
    React.useEffect(()=>{
      if(!startup)return;let alive=true;
      startup.then((result:TuiStartup|null)=>{
        if(!alive||!result)return;
        if(!effortChosenRef.current)setReasoningEffort(result.reasoningEffort);
        for(const notice of result.notices)addLocal(t('screen.startup.notice',{message:notice.message}));
      },()=>{});
      return()=>{alive=false;};
    },[]);
    /* R4 Q-R4-6: Ctrl+L and /redraw repaint the screen and keep the conversation and the draft (Claude Code
       `chat:clearInput` "Force a full screen redraw, preserving input and conversation", keybindings.md, 2.1.280 → 2026-09-22,
       gate B.3). Ink's own write erases the frame it drew and draws it again; a remount alone wrote nothing (Ink skips a
       frame equal to the last one). */
    const repaintScreen=()=>{try{if(typeof inkStdout?.write==='function')inkStdout.write('');}catch{/* a repaint that cannot be written leaves the screen as it is */}};
    /* R5a S5/S8 (Q-R5-7, Q-R5-9): what Enter does while TALOS works, and the reasoning choice, both remembered. */
    /* stage 7.11: «Thinking hidden» draws no reasoning at all; Ctrl+T then shows it again */
    const [reasoningHidden,setReasoningHidden]=React.useState(props.reasoning==='hidden');
    const [toolRows,setToolRows]=React.useState((props.toolRows??'grouped') as UiToolRows);
    const editorCommandRef:{current:string|null}=React.useRef(props.editor??null);
    const externalEditor=()=>editorCommandRef.current??process.env.VISUAL??process.env.EDITOR;
    const applyReasoningMode=(mode:UiReasoning)=>{setReasoningHidden(mode==='hidden');const visible=mode==='visible';setAppState((current:TuiAppState)=>current.reasoningVisible===visible?current:{...current,reasoningVisible:visible});};
    /* FE-048: the three views; the app starts in Essential (owner 31/10) */
    const startView=(props.startView??'essential') as FrameView;
    const [frameView,setFrameView]=React.useState(startView);
    const frameViewRef:{current:FrameView}=React.useRef(frameView);frameViewRef.current=frameView as FrameView;
    const beforeZenRef:{current:FrameView}=React.useRef('essential');
    /* FE-048: the left bar; a closed bar reads nothing (BUDGET-VELOCITA rule 3) */
    const [barOpen,setBarOpen]=React.useState(viewColumns(startView).bar);
    const [barFocused,setBarFocused]=React.useState(false);
    const [barSelected,setBarSelected]=React.useState(0);
    const [barGroups,setBarGroups]=React.useState(()=>new Set<string>() as ReadonlySet<string>);
    const [barSessions,setBarSessions]=React.useState([] as readonly BarSession[]);
    const shelfDataRef=React.useRef({projects:[],now:0,glyph:''} as Omit<ShelfView,'selected'|'disk'|'list'>);
    const shelfColorsRef=React.useRef(null as ShelfColors|null);
    const shelfHomeRef=React.useRef([] as readonly HomeSession[]);
    /* the list is read after the first frame; until it answers the Home says so, never «no sessions» */
    const [sessionsRead,setSessionsRead]=React.useState(false);
    const sessionsAskedAt=React.useRef(Date.now());
    const [shelfAutomations,setShelfAutomations]=React.useState([] as readonly {name:string;active:boolean;nextRunAt:string|null}[]);
    const barEntriesRef:{current:readonly BarEntry[]}=React.useRef([]);
    const [panelOpen,setPanelOpen]=React.useState(viewColumns(startView).panel);
    const [frameSide,setFrameSide]=React.useState('bar' as 'bar'|'panel');
    const [panelFocused,setPanelFocused]=React.useState(false);
    const [panelSelected,setPanelSelected]=React.useState(0);
    const [panelCards,setPanelCards]=React.useState(()=>new Set(['context','agents']) as ReadonlySet<string>);
    const barColumnsRef:{current:number}=React.useRef(0);
    const panelFromRef:{current:number}=React.useRef(0);
    const panelColumnsRef:{current:number}=React.useRef(0);
    const showFrameView=(next:FrameView)=>{if(next==='zen'&&frameViewRef.current!=='zen')beforeZenRef.current=frameViewRef.current;setFrameView(next);const columns=viewColumns(next==='zen'?'zen':next);setBarOpen(columns.bar);setPanelOpen(columns.panel);setFrameSide(columns.side);if(!columns.bar)setBarFocused(false);};
    const prefs=useUiPreferences(React,{paths,projectRoot,given:{...(props.busyInput?{busyInput:props.busyInput}:{}),...(props.reasoning?{reasoning:props.reasoning}:{})},applyReasoning:applyReasoningMode,onSaveError:(error:unknown)=>addLocal(screenErrorText(error,act('screen.action.saveSetting')))});
    const [maxProseWidth,setMaxProseWidth]=React.useState(props.maxProseWidth??null) as [number|null,(value:number|null)=>void];
    const proseTouched=React.useRef(false);
    const configStoreRef:{current:ReturnType<typeof createConfigPanelStore>|null}=React.useRef(null);
    const questionTimeoutTouched:{current:boolean}=React.useRef(false);
    if(!configStoreRef.current)configStoreRef.current=createConfigPanelStore({paths,projectRoot,onProseWidth:value=>{proseTouched.current=true;setMaxProseWidth(value);},onQuestionTimeout:value=>{questionTimeoutTouched.current=true;questionTimeoutRef.current=value;}});
    const configStore=configStoreRef.current;
    const configPanel=React.useSyncExternalStore(configStore.subscribe,configStore.getSnapshot,configStore.getSnapshot);
    React.useEffect(()=>{
      let alive=true;
      if(props.maxProseWidth===undefined)void loadConfigPanelValues({paths,projectRoot}).then(values=>{if(alive&&!proseTouched.current)setMaxProseWidth(values.maxProseWidth);}).catch(()=>{});
      if(props.questionTimeout===undefined)void loadConfigPanelValues({paths,projectRoot}).then(values=>{if(alive&&!questionTimeoutTouched.current)questionTimeoutRef.current=values.questionTimeout;}).catch(()=>{});
      return()=>{alive=false;configStore.close();};
    },[]);
    /* R5b D4 (Q-R5-14): a theme kept from /theme holds at once and is saved in the user configuration (every project). */
    /* R5b D3: go back to (or re-apply up to) the chosen checkpoint; another TALOS on this project refuses it first. */
    const runUndo=async(picked:UndoPicker)=>{
      const store=checkpointStoreFor(),chosen=picked.rows[picked.selected];if(!store||!chosen)return;
      try{
        if(await hasActiveRuns(paths,{exceptPid:process.pid,projectRoot})){addLocal(t('screen.undo.otherRun'));return;}
        const {direction}=undoRange(picked.rows,picked.selected);
        const done=(direction==='rewind'?await rewindToCheckpoint({store,id:chosen.id}):await reapplyToCheckpoint({store,id:chosen.id})).filter(row=>checkpointChanges(row).length>0);
        addLocal(tn(direction==='rewind'?'screen.undo.done':'screen.undo.redone',done.length,{files:checkpointFilesText(rangeFiles(done))}));
      }catch(error){addLocal(screenErrorText(error,act('screen.action.command',{command:'undo'})));}
    };
    /* R5b D3 (gate finding 10: nothing on screen said a checkpoint was taken): a turn that changed files leaves one dim row. The
       runtime finalizes the checkpoint after the run's last event, so an open one is waited for, briefly. */
    const runStartedAtRef:{current:string|null}=React.useRef(null);
    React.useEffect(()=>{
      if(state.running){if(!runStartedAtRef.current)runStartedAtRef.current=new Date().toISOString();return;}
      const since=runStartedAtRef.current,sessionId=state.sessionId;runStartedAtRef.current=null;
      const store=since&&sessionId?checkpointStoreFor():null;if(!store||!since||!sessionId)return;
      let alive=true;
      void (async()=>{
        for(let attempt=0;attempt<20&&alive;attempt+=1){
          const rows=(await sessionCheckpoints(store,sessionId)).filter(row=>row.createdAt>=since);
          if(!rows.length)return;
          if(rows.some(row=>row.state==='open')){await new Promise(resolve=>setTimeout(resolve,150));continue;}
          const files=rangeFiles(rows);
          if(files.length&&alive)setState((current:TuiState)=>({...current,transcript:appendTranscriptWarning(current.transcript,t('screen.undo.marker',{files:checkpointFilesText(files,{max:CHECKPOINT_ROW_FILES})}))}));
          return;
        }
      })().catch((error:unknown)=>developmentLogError('tui.checkpoint.marker.failure',error,{},'tui-app'));
      return()=>{alive=false;};
    },[state.running]);
    const keepTheme=(id:UiTheme)=>{
      themeStore.set(id);
      void saveUiPreference({paths,projectRoot,patch:{theme:id}}).then(()=>addLocal(t('screen.theme.set',{theme:themeLabel(id)})),()=>addLocal(t('screen.theme.setUnsaved',{theme:themeLabel(id)})));
    };
    /* stage 7.12 (mockup transcript mode; Claude Code fullscreen): the whole conversation on the whole screen, with less-style
       search; [ hands it to the terminal's own scrollback until q, v opens it in the editor */
    const [transcriptMode,setTranscriptModeState]=React.useState(null as TranscriptModeState|null);
    const transcriptModeRef:{current:TranscriptModeState|null}=React.useRef(null);
    const setTranscriptMode=(next:TranscriptModeState|null)=>{transcriptModeRef.current=next;setTranscriptModeState(next);setTranscriptSelectedId(next?.at??null);if(next)setTranscriptRevealId(next.at);};
    const [nativeScrollback,setNativeScrollback]=React.useState(false);
    const nativeScrollbackRef:{current:boolean}=React.useRef(false);
    /* the items the page draws: every item, ungrouped and with its reasoning, in the full view; the main view's in the compact one */
    const transcriptPageItems=(mode:TranscriptModeState):TranscriptDisplayItem[]=>mode.full?visibleItemsOf(shownTranscriptItems,true):drawnTranscriptItems;
    const transcriptModeItems=(mode:TranscriptModeState=transcriptModeRef.current??openTranscriptMode()):TranscriptModeItem[]=>transcriptPageItems(mode).map((item:TranscriptDisplayItem)=>({id:item.id,prompt:item.kind==='message'&&item.role==='user',
      /* a message is its words: the prompt row and f match them against the turns the kernel kept */
      text:item.kind==='toolGroup'?item.tools.map(tool=>transcriptItemText(tool)).join('\n'):item.kind==='message'?item.text:transcriptItemText(item)}));
    const openTranscript=(search=false)=>{setSheet(null);/* tappa D: the transcript is the whole conversation, search included */setState((current:TuiState)=>current.transcript.earlier?.length?{...current,transcript:revealEarlier(current.transcript,Number.POSITIVE_INFINITY)}:current);setTranscriptMode(openTranscriptMode({search}));};
    const enterScrollback=()=>{
      const text=formatExitOutput({sessionId:state.sessionId,items:state.transcript.items},{mode:'transcript',color:capabilities.color});
      nativeScrollbackRef.current=true;setNativeScrollback(true);
      /* the blank frame is drawn first, on the alternate screen; then the terminal's own screen gets the conversation */
      setTimeout(()=>{
        if(!nativeScrollbackRef.current)return;
        if(props.mouseSelection)stdout.write(MOUSE_OFF);
        stdout.write('\u001b[?1049l');stdout.write(text.endsWith('\n')?text:text+'\n');
        stdout.write(t('screen.transcriptMode.scrollback',{lines:text.split('\n').length})+'\n');
      },60);
    };
    const leaveScrollback=()=>{
      stdout.write('\u001b[?1049h');if(props.mouseSelection)stdout.write(MOUSE_ON);
      nativeScrollbackRef.current=false;setNativeScrollback(false);setAppState((current:TuiAppState)=>({...current,redrawNonce:current.redrawNonce+1}));repaintScreen();
    };
    const handleTranscriptModeKey=(ch:string,key:any)=>{
      const current=transcriptModeRef.current;if(!current)return;
      const name=key.return?'Enter':key.escape?'Escape':key.backspace||key.delete?'Backspace':key.upArrow?'ArrowUp':key.downArrow?'ArrowDown':key.home?'Home':key.end?'End':ch;
      if(!name)return;
      const items=transcriptModeItems(current);
      const out=transcriptModeKey(current,{name,ctrl:Boolean(key.ctrl)},items);
      if(out.effect==='close'){setTranscriptMode(null);return;}
      /* f on your prompt: the turn it started, found in the conversation the kernel kept; /fork's cut, when the kernel has it */
      if(out.effect==='fork'){
        const from=state.sessionId??controller.current()??null;
        const prompts=items.filter(item=>item.prompt),index=prompts.findIndex(item=>item.id===(current.at??items.at(-1)?.id));
        let turns:ReturnType<typeof sessionTurns>=[];try{if(from)turns=sessionTurns((runtime.export(from) as any)?.eventi);}catch{/* nothing to fork from */}
        const runId=from&&runtime.capabilities?.().forkBeforeRun===true?transcriptModeTurn(prompts.map(item=>item.text),index,turns):null;
        if(!from||!runId){addLocal(t('panel.fork.cannotCut'));return;}
        setTranscriptMode(null);void forkBeforeTurn(from,runId,prompts[index]!.text,'fork');return;
      }
      if(out.effect==='scrollback'){enterScrollback();return;}
      if(out.effect==='editor'){
        const text=formatExitOutput({sessionId:state.sessionId,items:state.transcript.items},{mode:'transcript',color:false});
        void editExternally({text,editor:externalEditor(),tmpRoot:paths.cacheRoot}).then(()=>addLocal(t('screen.transcriptMode.editor'))).catch(error=>addLocal(screenErrorText(error,act('screen.action.externalEditor'))));
        return;
      }
      setTranscriptMode(out.state);
    };
    const runKeyAction=(action:'redraw'|'reasoning-toggle'|'tool-details')=>{
      setAppState((current:TuiAppState)=>reduceAppAction(current,{type:'key-action',action}));if(action==='redraw')repaintScreen();
      /* R5a S8 (Q-R5-9): Ctrl+T shows or hides every reasoning block, and the choice is remembered in `ui.reasoning`. */
      /* hidden reasoning comes back expanded: the key that shows it always shows it */
      if(action==='reasoning-toggle'&&reasoningHidden){setReasoningHidden(false);setAppState((current:TuiAppState)=>({...current,reasoningVisible:true}));prefs.rememberReasoning(true);return;}
      if(action==='reasoning-toggle')prefs.rememberReasoning(!reasoningVisibleRef.current);
    };
    /* R4 Q-R4-9: a draft goes back into the composer with its paste blocks. */
    const restoreDraft=(draft:EditorDraft|string)=>{const editor=editorFromDraft(draft);composerStore.replace(editor);setAppState((current:TuiAppState)=>current.editor===editor?current:{...current,editor});return editor;};
    /* stage 7.4: each sent draft keeps when it was sent (the /history sheet says «14 min», «yesterday») */
    const rememberDraft=(draft:EditorDraft)=>setHistory((rows:EditorDraft[])=>draft.text.trim()?[{...draft,at:draft.at??new Date().toISOString()},...rows.filter(row=>row.text!==draft.text)].slice(0,MAX_HISTORY):rows);
    /* R5b D5 (Q-R5-15): what was SENT is also kept on disk for the next sessions of this project (a cleared draft is not: the
       person chose to drop it). The kept rows are read once, after the ones typed meanwhile; a prompt sent before the store
       is ready waits for it. Off (ui.history.persist false): nothing is read or written. */
    const historyStoreRef:{current:{store:PromptHistoryStore|null;ready:boolean;waiting:EditorDraft[]}}=React.useRef({store:null,ready:false,waiting:[]});
    const persistDraft=(draft:EditorDraft)=>{
      const kept=historyStoreRef.current;if(!draft.text.trim())return;
      if(!kept.ready){kept.waiting.push(draft);return;}
      if(kept.store)void kept.store.append(draft).catch((error:unknown)=>developmentLogError('tui.history.append.failure',error,{},'tui-app'));
    };
    const rememberSent=(draft:EditorDraft)=>{rememberDraft(draft);persistDraft(draft);};
    React.useEffect(()=>{
      let alive=true;
      void (async()=>{
        const kept=historyStoreRef.current;
        try{
          if(await promptHistoryEnabled({paths,projectRoot})){
            const store=createPromptHistoryStore({paths,projectRoot,secrets:secretValuesFromEnvironment(process.env)});
            const rows=await store.load();kept.store=store;
            if(alive)setHistory((current:EditorDraft[])=>{const seen=new Set(current.map(row=>row.text));return[...current,...rows.filter(row=>!seen.has(row.text))].slice(0,MAX_HISTORY);});
          }
        }catch(error){developmentLogError('tui.history.load.failure',error,{},'tui-app');}
        kept.ready=true;const waiting=kept.waiting.splice(0);for(const draft of waiting)persistDraft(draft);
      })();
      return()=>{alive=false;};
    },[]);
    const transcriptItemsForCurrentView=():TranscriptItem[]=>appState.reasoningVisible?(state.transcript.items as TranscriptItem[]):(state.transcript.items as TranscriptItem[]).filter((item:TranscriptItem)=>item.kind!=='reasoning');
    const transcriptItemForSelection=(preferred:string|null=transcriptSelectedId)=>{
      const items=transcriptItemsForCurrentView();
      return items.find((item:TranscriptItem)=>item.id===preferred)??items.at(-1)??null;
    };
    const jumpTranscriptItem=(itemId:string)=>{
      const items=transcriptItemsForCurrentView(),index=items.findIndex((item:TranscriptItem)=>item.id===itemId);if(index<0)return;
      /* R1: the row planner scrolls the target into view (revealIndex); the view stops following the tail. */
      setTranscriptSelectedId(itemId);setTranscriptRevealId(itemId);setViewport((view:TranscriptViewport)=>index===items.length-1?view:{...view,followingTail:false});
    };
    const copyTranscriptItem=(preferred:string|null=transcriptSelectedId)=>{
      const item=transcriptItemForSelection(preferred);
      if(!item){const notice=t('screen.copy.nothing');setTranscriptSearch((current:TranscriptSearchState|null)=>current?{...current,notice}:{...createTranscriptSearchState(null),raw:transcriptRaw,notice});return;}
      try{
        const text=transcriptRaw?transcriptItemRaw(item):transcriptItemText(item);
        const sequence=osc52CopySequence(text);stdout.write(sequence);setTranscriptSelectedId(item.id);
        const notice=t('screen.copy.requested');setTranscriptSearch((current:TranscriptSearchState|null)=>current?{...current,selectedId:item.id,raw:transcriptRaw,notice}:{...createTranscriptSearchState(item.id),raw:transcriptRaw,notice});
      }catch(error){const notice=screenErrorLine(error,act('screen.action.copy'));setTranscriptSearch((current:TranscriptSearchState|null)=>current?{...current,notice}:{...createTranscriptSearchState(item.id),raw:transcriptRaw,notice});}
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
          /* R4 Q-R4-13 (lane F's onboardingSteps): a missing key is said on the first screen, before anything is sent. */
          const readiness=await readinessFor(model);if(!isAlive())return;
          setKeyMissing(!readiness.ready&&(readiness.code==='PROVIDER_KEY_MISSING'||readiness.code==='PROVIDER_SIGN_IN_REQUIRED'||readiness.code==='PROVIDER_KEY_BENCHED'));
        }else setCurrentModelMeta(null);
      }catch{if(isAlive())setCurrentModelMeta(null);}
      finally{if(isAlive())setSelectionLoaded(true);}
    }
    React.useEffect(()=>{
      if(!selectionLoaded||onboardingShownRef.current)return;
      const steps=onboardingSteps({projectTrusted:true,providerConfigured:Boolean(chosenProvider),modelConfigured:Boolean(chosenProvider&&providerOfModel(controller.model())===chosenProvider),keyMissing:keyMissing&&chosenProvider?chosenProvider:keyMissing,...(props.loadedFiles?{loadedFiles:props.loadedFiles}:{})});
      if(!steps.length)return;
      onboardingShownRef.current=true;
      const info=steps.filter(step=>step.kind==='info').map(step=>step.text);
      /* P17: on the first launch the missing steps are the guided setup, not a list of commands to type. */
      if(bootPlanRef.current?.firstLaunch&&!initialPrompt?.trim()&&!invocation.setup){
        void (async()=>{
          let row:TuiProvider|undefined;
          try{row=chosenProvider?(await catalog.listProviders()).find((entry:TuiProvider)=>entry.id===chosenProvider):undefined;}catch{row=undefined;}
          const plan=setupStart({firstLaunch:true,providerChosen:Boolean(chosenProvider),providerUsable:Boolean(row?.configured),keyBenched:Boolean(row?.benched),modelChosen:Boolean(chosenProvider&&providerOfModel(controller.model())===chosenProvider)});
          if(info.length)setState((current:TuiState)=>localMessage(current,info.join('\n')));
          if(plan.start){await startSetup(plan.from);return;}
          const todo=steps.filter(step=>step.kind!=='info');
          if(todo.length)setState((current:TuiState)=>localMessage(current,[t('screen.onboarding.setup'),...todo.map(step=>'• '+step.text+(step.command?' '+step.command:''))].join('\n')));
        })();
        return;
      }
      const todo=steps.filter(step=>step.kind!=='info');
      setState((current:TuiState)=>localMessage(current,[...info,...(todo.length?[t('screen.onboarding.setup'),...todo.map(step=>'• '+step.text+(step.command?' '+step.command:''))]:[])].join('\n')));
    },[selectionLoaded,chosenProvider,currentModelMeta,keyMissing]);
    const closeCurrentOverlay=()=>{configStore.close();oauthEpochRef.current+=1;oauthLoginRef.current?.cancel();oauthLoginRef.current=null;setTrustCenter(null);setMcpCenter(null);setHookCenter(null);setPluginCenter(null);setMemoryCenter(null);setNotesCenter(null);setTasksCenter(null);setLibraryCenter(null);setProviderSecret('');setProviderStep({kind:'list'});setModelEffortStep(null);setEffortOnly(false);setPickerQuery('');setPickerSelection({query:'',selected:0,pageSize:10});setAppState((current:TuiAppState)=>closeOverlay(current));};
    const applyOverlay=(overlay:Exclude<OverlayState,null>)=>setAppState((current:TuiAppState)=>openOverlay(current,overlay));

    /* B1 slice 18: the models of the chosen provider only; with none chosen, /provider opens first and comes back here. */
    const loadModels=async(provider?:string)=>{
      const target=provider??chosenProvider;
      if(!target){await loadProviders();return;}
      applyOverlay({kind:'model',provider:target});setModelEffortStep(null);setPickerQuery('');setPickerSelection({query:'',selected:0,pageSize:10});setModelRows([]);setModelList({loading:true,verified:false,notice:t('screen.model.loading'),label:target,engineDown:false});
      modelPickerRef.current?.cancel();
      const model=createModelPickerModel(catalog,{provider:target,current:controller.model()});modelPickerRef.current=model;
      try{await model.open();if(modelPickerRef.current!==model)return;setModelRows([...model.rows()]);setModelList({loading:false,verified:model.verified(),notice:model.notice(),label:model.label(),engineDown:model.engineDown()});}catch(error){addLocal(screenErrorText(codeOnly(error),act('screen.action.modelPicker')));}
    };
    /* stage 7.10 (mockup PANELS.model; owner 03/10 «scala vera del prodotto»): the chosen provider's models, live when it
       answers (model-picker.ts), the effort scale TALOS knows under the list */
    const modelSheetRowsRef:{current:readonly TuiModel[]}=React.useRef([] as readonly TuiModel[]);
    const loadModelSheet=async(provider?:string)=>{
      const target=provider??chosenProvider;if(!target){await loadProviderSheet();return;}
      modelPickerRef.current?.cancel();
      const model=createModelPickerModel(catalog,{provider:target,current:controller.model()});modelPickerRef.current=model;
      try{await model.open();}catch(error){addLocal(screenErrorText(codeOnly(error),act('screen.action.modelPicker')));return;}
      if(modelPickerRef.current!==model)return;
      const rows=model.rows();modelSheetRowsRef.current=rows;
      const local=Boolean((await catalog.listProviders().catch(()=>[] as TuiProvider[])).find(row=>row.id===target)?.local);
      const preferences=await runtime.modelPreferences?.().catch(()=>null)??null;
      const places=(await catalog.listProviders().catch(()=>[] as TuiProvider[])).map((row:TuiProvider)=>({id:row.id,label:row.label,meta:row.id===target?t('panel.model.inUse'):''}));
      setSheet(modelSheet(rows.map(row=>modelRowOf(row,{providerLabel:model.label()||target,local})),
        {favourites:preferences?.preferiti??[],recent:preferences?.recenti??[],places,current:controller.model(),providerLabel:model.label()||target,effort:reasoningEffort??'default',scale:['default','low','medium','high','xhigh','max'],...(model.verified()?{}:{notice:model.notice()})}));
    };
    /* stage 7.10b (owner 03/10 «foglio + subito /model del nuovo provider»): the providers as the mockup's sheet, the usable
       ones first (providerPickerItems); a choice made there ends in the provider's /model sheet, whatever steps it passes
       through (an environment key's consent, the browser login, a key — the picker's own steps until stage 7.10c) */
    const providerViaSheetRef:{current:boolean}=React.useRef(false);
    React.useEffect(()=>{if(appState.overlay?.kind!=='provider')providerViaSheetRef.current=false;},[appState.overlay]);
    const loadProviderSheet=async()=>{
      const model=createProviderPickerModel(catalog);providerPickerRef.current=model;
      try{await model.open();}catch(error){addLocal(screenErrorText(error,act('screen.action.providerPicker')));return;}
      if(providerPickerRef.current!==model)return;
      const rows=[...model.rows()];setProviderRows(rows);
      /* suite 01/11 (s61): reading the device starts the kernel, over 10 s the first time; the providers do not wait for it */
      const mode={color:capabilities.color&&terminalTrueColor(process.env),unicode:capabilities.unicode};
      const opened=providerSheet(providerPickerItems(rows,'',{reachable:model.reachable}).map(row=>providerViewOf(row,{current:row.id===chosenProvider,reachable:model.reachable(row.id)})),{system:'loading',mode,motion:capabilities.motion});
      setSheet(opened);
      const system=await Promise.resolve(runtime.machineCapacity?.()).catch(()=>null) as SystemView|undefined;
      const now=sheetRef.current;if(now?.name!=='provider'||now.context?.providers!==opened.context?.providers||now.panel.tabs.length<2)return;
      const {ticking:_done,...rest}=now.context??{};
      setSheet({...now,context:rest,panel:{...now.panel,tabs:now.panel.tabs.map((tab,index)=>index===1?{...tab,body:systemTabBody(system??null,mode)}:tab)}});
    };
    const chooseProviderAndOpenModels=async(row:TuiProvider)=>{
      try{await catalog.chooseProvider(row.id);}catch(error){addLocal(screenErrorText(codeOnly(error),act('screen.action.providerChoice')));return;}
      if(providerViaSheetRef.current){
        providerViaSheetRef.current=false;setChosenProvider(row.id);showModel(row.id,controller.model());
        setProviderStep({kind:'list'});setProviderSecret('');setAppState((current:TuiAppState)=>closeOverlay(current));
        await loadModelSheet(row.id);return;
      }
      setChosenProvider(row.id);showModel(row.id,controller.model());
      setProviderStep({kind:'list'});setProviderSecret('');setAppState((current:TuiAppState)=>closeOverlay(current));
      await loadModels(row.id);
    };
    /* stage 7.10d (mockup PANELS.setup; owner 03/10 «foglio a schede + Check vero, a costo minimo», «chiave + 1 token sempre,
       strumenti a richiesta», «stesso foglio anche al primo avvio»): the setup sheet opens on the first tab that is missing and
       is redrawn in place, keeping the tab and what was moved or typed; an answer that comes after it closed changes nothing.
       P17's rules stay: an environment key only on a yes, a key saved only once its provider accepted it, the provider chosen
       only with one of its models (s-code #80, OpenClaw's onboarding). When it closes it says whether TALOS is ready, checked. */
    const setupState=():SetupState|null=>sheetRef.current?.name==='setup'?sheetRef.current.context?.setup??null:null;
    const updateSetup=(change:(state:SetupState)=>SetupState,tab?:number)=>{
      const current=sheetRef.current;const state=current?.name==='setup'?current.context?.setup:undefined;if(!current||!state)return;
      setSheet(setupSheet(change(state),{tab:tab??current.panel.tab,prev:current.panel}));
    };
    const setupProviderRow=(id:string|null)=>id?setupProvidersRef.current.find(row=>row.id===id)??null:null;
    /* where the key goes, by the store in use: «Windows Credential Manager», «macOS Keychain», or this process's memory */
    const keyHelpText=()=>activeCredentialStore()?.kind==='memory'?t('panel.setup.keyHelpMemory',{store:credentialStoreName('memory')}):t('panel.setup.keyHelp',{store:credentialStoreName('system')});
    /* «Continue with ChatGPT» (owner 13/10/2026): the plan is signed in to in the browser, with the windows the OpenRouter sign-in
       already has. ⛔ Never a key field for it, and no code to paste: the browser comes back to this machine by itself. */
    const signsIn=(row:TuiProvider)=>row.authType==='oauth-pkce'&&typeof catalog?.chatgpt?.startLogin==='function';
    const planWindow=(login:{opened:boolean;remote:boolean})=>({intro:t(login.remote?'key.chatgpt.login.remote':login.opened?'key.chatgpt.login.opened':'key.chatgpt.login.open'),pasteable:false});
    const PLAN_WINDOW_FAILED={intro:'',pasteable:false};
    const whoText=(email:string|null)=>email?t('key.chatgpt.who',{email}):'';
    /** What a sign-in that ended says when it did not make the plan usable; null when it did. A cancel says nothing: the person did it. */
    const planSignInFailure=(outcome:Awaited<TuiChatgptLogin['outcome']>):string|null=>!outcome.ok?chatgptFailureReason(outcome.code):outcome.planEnabled?null:t('panel.setup.signInPlanNeeded');
    const setupKeyView=(row:TuiProvider,notes:readonly SetupNote[]=[]):SetupKeyView=>{
      if(signsIn(row))return row.configured?{kind:'none',text:t('panel.setup.signedIn')}
        :{kind:'login',lines:[...notes.map(note=>note.text),t(row.keySource==='saved'?'panel.setup.signInPlanNeeded':'panel.setup.signInNeeded',{provider:row.label})],foot:'',paste:false,retry:false,start:true};
      if(!row.requiresKey)return{kind:'none',text:t(row.local?'panel.setup.noKeyLocal':'panel.setup.noKey',{provider:row.label})};
      const consent=providerPickerEnter({selectedProvider:row.id,configured:row.configured,requiresKey:row.requiresKey,keySource:row.keySource}).kind==='environment-consent';
      const variable=row.environmentVariable??t('screen.provider.consentVariableFallback');
      const cost=typeof catalog?.keyTestNotice==='function'?catalog.keyTestNotice(row.id):null;
      const have:SetupNote[]=row.benched?[{text:t('screen.provider.benchedRetry',{benched:benchedKeyText(row.label,row.benched)}),roles:'warn'}]
        :row.configured?[{text:row.keySource==='environment'?t('panel.setup.fromEnvironment',{provider:row.label,variable}):t('panel.setup.stored',{provider:row.label})}]:[];
      return{kind:'ask',provider:row.label,help:keyHelpText(),...(consent?{consent:{variable}}:{}),...(row.id===ZAI_PROVIDER&&row.addressChosen===false?{address:{options:ZAI_ADDRESSES.map((address,index)=>index===0?`${address.label} (${t('screen.word.recommended')})`:address.label)}}:{}),...(row.id==='openrouter'&&typeof catalog?.startOpenRouterLogin==='function'?{browser:true}:{}),
        notes:[...notes,...have,...(cost?[{text:cost}]:[])]};
    };
    const refreshSetupProvider=async(id:string):Promise<TuiProvider|null>=>{
      const row=(await catalog.listProviders().catch(()=>[] as TuiProvider[])).find((entry:TuiProvider)=>entry.id===id);
      if(row)setupProvidersRef.current=setupProvidersRef.current.map(entry=>entry.id===id?row:entry);
      return row??setupProviderRow(id);
    };
    const loadSetupModels=async(provider:string)=>{
      modelPickerRef.current?.cancel();
      const model=createModelPickerModel(catalog,{provider,current:controller.model()});modelPickerRef.current=model;
      updateSetup(state=>({...state,models:null,modelsNotice:null,engineDown:false}));
      try{await model.open();}
      catch(error){if(modelPickerRef.current===model)updateSetup(state=>({...state,models:[],modelsNotice:screenErrorText(codeOnly(error),act('screen.action.modelPicker'))}));return;}
      if(modelPickerRef.current!==model||setupState()?.provider!==provider)return;
      const rows=model.rows();setupModelsRef.current=rows;
      const providerRow=setupProviderRow(provider);const local=Boolean(providerRow?.local);const label=model.label()||providerRow?.label||provider;
      updateSetup(state=>({...state,models:rows.map(row=>({id:row.id,name:modelRowOf(row,{providerLabel:label,local}).name,desc:setupDescOf(row,{local})})),
        modelsNotice:model.verified()?null:model.notice(),engineDown:model.engineDown()}));
    };
    /* the sign-in under way, as the Key tab shows it: the lines of the old window (the address always), a code to paste when
       OpenRouter shows one, «Try again» after a failure */
    const setupLoginView=(row:TuiProvider,login:{url:string;mode:'browser'|'paste';opened:boolean},phase:'waiting'|'paste'|'exchanging'|'failed',message:string|null,window:{intro?:string;pasteable?:boolean}={}):SetupKeyView=>{
      const content=providerOAuthOverlay({label:row.label,url:login.url,mode:login.mode,opened:login.opened,phase,masked:'',message,...window});
      const typing=phase==='paste'||(login.mode==='paste'&&phase!=='failed');const codeLine=t('screen.provider.oauthPaste',{masked:''}).trim();
      return{kind:'login',lines:(content.sections[0]?.lines??[]).map(line=>line.text).filter(text=>text&&!text.startsWith(codeLine)),foot:content.foot?.[0]?.text??'',paste:typing,retry:phase==='failed'};
    };
    const setupKeyDone=async(row:TuiProvider)=>{
      const fresh=await refreshSetupProvider(row.id);
      updateSetup(state=>({...state,key:fresh?setupKeyView(fresh):state.key}),2);
      await loadSetupModels(row.id);
    };
    const setupSignIn=async(row:TuiProvider)=>{
      oauthLoginRef.current?.cancel();oauthLoginRef.current=null;
      if(signsIn(row)){
        let plan:TuiChatgptLogin;
        try{plan=await catalog.chatgpt!.startLogin();}
        catch(error){updateSetup(state=>({...state,key:setupLoginView(row,{url:'',mode:'browser',opened:false},'failed',chatgptFailureReason(String((error as any)?.code??'CHATGPT_ERRORE')),PLAN_WINDOW_FAILED)}));return;}
        if(!setupState()){plan.cancel();return;}
        oauthLoginRef.current=plan;const window=planWindow(plan);const shown={url:plan.url,mode:'browser' as const,opened:plan.opened};
        addLocal(t('screen.provider.oauthAddress',{provider:t('key.chatgpt.name'),url:plan.url}));
        updateSetup(state=>({...state,key:setupLoginView(row,shown,'waiting',null,window)}));
        void plan.outcome.then(async outcome=>{
          if(oauthLoginRef.current!==plan)return;
          oauthLoginRef.current=null;
          const failed=planSignInFailure(outcome);
          if(failed){updateSetup(state=>({...state,key:setupLoginView(row,shown,'failed',failed,window)}));return;}
          addLocal(chatgptSignedInNote(whoText(outcome.ok?outcome.email:null),activeCredentialStore()?.kind));
          await setupKeyDone(row);
          setProviderVerificationTick((current:number)=>current+1);
        });
        return;
      }
      let login:OpenRouterLogin;
      try{login=await catalog.startOpenRouterLogin!();}
      catch(error){updateSetup(state=>({...state,key:setupLoginView(row,{url:'',mode:'browser',opened:false},'failed',oauthErrorText(row,error))}));return;}
      if(!setupState()){login.cancel();return;}
      oauthLoginRef.current=login;
      /* the address also goes to the conversation, unboxed: a person copies it there without the sheet's borders */
      addLocal(t('screen.provider.oauthAddress',{provider:row.label,url:login.url}));
      updateSetup(state=>({...state,key:setupLoginView(row,login,login.mode==='paste'?'paste':'waiting',null)}));
      login.key.then(async(key:string)=>{
        if(oauthLoginRef.current!==login)return;
        updateSetup(state=>({...state,key:setupLoginView(row,login,'exchanging',null)}));
        let result:TuiKeySave;
        try{result=await catalog.setProviderKey(row.id,key);}
        catch(error){updateSetup(state=>({...state,key:setupLoginView(row,login,'failed',screenErrorText(codeOnly(error),act('screen.action.keyTest')))}));return;}
        finally{key='';}
        oauthLoginRef.current=null;
        if(!result.saved){updateSetup(state=>({...state,key:setupLoginView(row,login,'failed',result.message)}));return;}
        addLocal(t('screen.provider.oauthSaved',{provider:row.label}));
        await setupKeyDone(row);
      },(error:unknown)=>{
        if(oauthLoginRef.current!==login||(error as any)?.code==='OAUTH_CANCELLED')return;
        oauthLoginRef.current=null;
        updateSetup(state=>({...state,key:setupLoginView(row,login,'failed',oauthErrorText(row,error))}));
      });
    };
    /* Check (owner 03/10 «chiave + 1 token sempre»): the key against its provider (no tokens), then one token from the model
       when the kernel can (`provaModello`), then whether a message would leave now; the tools check only on r */
    const runSetupChecks=async()=>{
      const state=setupState();if(!state?.provider||!state.current)return;
      const provider=state.provider;const model=state.current;const row=setupProviderRow(provider);
      setupAbortRef.current?.abort();const abort=new AbortController();setupAbortRef.current=abort;
      const can=runtime.capabilities?.().modelCheck===true&&typeof runtime.checkModel==='function';
      const keyLabel=t(row&&signsIn(row)?'panel.setup.check.signIn':row&&!row.requiresKey?'panel.setup.check.engine':'panel.setup.check.key');
      let key:SetupCheck={label:keyLabel,state:'run',detail:t('panel.setup.checking')};
      let answer:SetupCheck={label:t('panel.setup.check.model'),state:'pending',...(can?{}:{detail:t('panel.setup.modelNotYet')})};
      const tools:SetupCheck={label:t('panel.setup.check.tools'),state:'pending',detail:t('panel.setup.toolsNotRun')};
      const show=(result:SetupState['result']=null)=>{if(!abort.signal.aborted)updateSetup(current=>({...current,checks:[key,answer,tools],result}));};
      show();
      try{
        const probe=await catalog.probeProvider(provider,abort.signal);
        key=probe.state==='available'?{label:keyLabel,state:'ok',...(probe.latencyMs!==null?{detail:t('panel.setup.ms',{ms:Math.round(probe.latencyMs)})}:{})}
          :{label:keyLabel,state:'fail',detail:probe.remediation?.message||probe.detail};
      }catch(error){if(abort.signal.aborted)return;key={label:keyLabel,state:'fail',detail:screenErrorText(codeOnly(error),act('screen.action.healthCheck',{provider:row?.label??provider}))};}
      if(can&&key.state==='ok'){
        answer={...answer,state:'run',detail:t('panel.setup.checking')};show();
        try{
          const checked=await runtime.checkModel!(model);
          answer=checked.answers?{label:answer.label,state:'ok',...(checked.firstTokenMs!==null?{detail:t('panel.setup.firstToken',{seconds:(checked.firstTokenMs/1000).toFixed(1)})}:checked.ms!==null?{detail:t('panel.setup.ms',{ms:Math.round(checked.ms)})}:{})}
            :{label:answer.label,state:'fail',detail:checked.reason&&!looksItalian(checked.reason)?checked.reason:t('panel.setup.modelNoAnswer',{code:checked.code??'?'})};
        }catch(error){answer={label:answer.label,state:'fail',detail:screenErrorText(codeOnly(error),act('screen.action.healthCheck',{provider:row?.label??provider}))};}
      }else if(can)answer={label:answer.label,state:'pending'};
      if(abort.signal.aborted)return;
      let result:SetupState['result'];
      try{
        const readiness=await readinessFor(model);
        result=readiness.ready&&key.state==='ok'&&answer.state!=='fail'?{ready:true}
          :{ready:false,text:readiness.ready?t('panel.setup.notReady',{what:(answer.state==='fail'?answer.detail:key.detail)??''}):readiness.message};
      }catch(error){result={ready:false,text:screenErrorText(codeOnly(error),act('screen.action.healthCheck',{provider:row?.label??provider}))};}
      /* the tools check is offered once the key and the model answered: r, and its cost said first */
      const offer=key.state==='ok'&&answer.state!=='fail';
      if(!abort.signal.aborted)updateSetup(current=>({...current,checks:[key,answer,offer?{...tools,detail:t('panel.setup.toolsPending')}:tools],result,tools:offer}));
    };
    /* r on Check (owner 03/10 «strumenti a richiesta»): one throwaway turn that reads a file and runs pwd (setup-tools-check.ts) */
    const runSetupTools=async()=>{
      const state=setupState();if(!state?.checks||!state.current)return;
      const abort=new AbortController();setupAbortRef.current=abort;const label=t('panel.setup.check.tools');
      const setTools=(check:SetupCheck,offer:boolean)=>{if(!abort.signal.aborted)updateSetup(current=>({...current,tools:offer,checks:current.checks?[...current.checks.slice(0,2),check]:current.checks}));};
      setTools({label,state:'run',detail:t('panel.setup.toolsRunning')},false);
      let checked;
      try{checked=await runToolsCheck({runtime,projectRoot,model:state.current,signal:abort.signal});}
      catch(error){setTools({label,state:'fail',detail:screenErrorText(codeOnly(error),act('screen.action.sessionAction'))},true);return;}
      if(checked.reason==='stopped')return;
      setTools(checked.ok?{label,state:'ok',detail:t('panel.setup.toolsDone')}:{label,state:'fail',detail:checked.reason==='timeout'?t('panel.setup.toolsTimeout')
        :checked.reason==='failed'?(checked.message&&!looksItalian(checked.message)?checked.message:t('panel.setup.toolsFailed')):!checked.read?t('panel.setup.toolsNoRead'):t('panel.setup.toolsNoCommand')},true);
    };
    const setupAction=async(action:SheetAction)=>{
      const state=setupState();if(!state)return;
      if(action.kind==='setupTab'){
        if(action.tab===2&&state.provider&&!state.models)await loadSetupModels(state.provider);
        if(action.tab===3&&!state.checks&&state.provider&&state.current&&providerOfModel(state.current)===state.provider)await runSetupChecks();
        return;
      }
      if(action.kind==='setupProvider'){
        const row=setupProviderRow(action.id);if(!row)return;
        oauthLoginRef.current?.cancel();oauthLoginRef.current=null;setupAbortRef.current?.abort();
        updateSetup(current=>({...current,provider:row.id,key:setupKeyView(row),models:null,modelsNotice:null,engineDown:false,checks:null,result:null}),1);
        return;
      }
      if(action.kind==='setupModels'){if(state.provider)await loadSetupModels(state.provider);return;}
      if(action.kind==='setupModel'){
        const row=setupModelsRef.current.find(entry=>entry.id===action.id);const provider=state.provider;if(!row||!provider)return;
        try{await catalog.chooseProvider(provider);}catch(error){addLocal(screenErrorText(codeOnly(error),act('screen.action.providerChoice')));return;}
        setChosenProvider(provider);showModel(provider,controller.model());
        if(!await useModelWithoutEffort(row))return;
        updateSetup(current=>({...current,current:row.id,checks:null,result:null}),3);
        await runSetupChecks();return;
      }
      if(action.kind==='setupTools'){await runSetupTools();return;}
      if(action.kind!=='setupKey')return;
      let row=setupProviderRow(state.provider);if(!row)return;
      /* 14/10/2026 (owner: the Z.AI key only to the address you chose): the address asked on the Key tab is chosen before anything
         that sends the key (its test, an approved environment key) */
      if(row.id===ZAI_PROVIDER&&row.addressChosen===false&&typeof action.address==='number'){
        const address=ZAI_ADDRESSES[action.address];if(!address)return;const asked=row;
        try{await catalog.chooseProviderAddress(row.id,address.endpoint);}
        catch(error){updateSetup(current=>({...current,key:setupKeyView(asked,[{text:screenErrorText(codeOnly(error),act('screen.action.providerAddress')),roles:'warn'}])}));return;}
        addLocal(t('screen.provider.addressChosen',{provider:row.label,address:address.label}));
        row=(await refreshSetupProvider(row.id))??row;
      }
      if(action.use==='browser'||action.use==='retry'){await setupSignIn(row);return;}
      if(action.use==='code'){
        const login=oauthLoginRef.current;const code=action.key??'';if(!login||!code||!('submit' in login))return;
        try{await login.submit(code);}
        catch(error){if((error as any)?.code==='OAUTH_CODE_MISSING')updateSetup(current=>current.key?.kind==='login'?{...current,key:{...current.key,lines:[...current.key.lines,oauthErrorText(row,error)]}}:current);}
        return;
      }
      if(action.use==='environment'){
        try{await catalog.answerEnvironmentKey(row.id,'yes');}
        catch(error){updateSetup(current=>({...current,key:setupKeyView(row,[{text:screenErrorText(codeOnly(error),act('screen.action.answer')),roles:'warn'}])}));return;}
        addLocal(t('screen.provider.envKeyUsed',{variable:row.environmentVariable??t('screen.provider.envKeyFallback'),provider:row.label}));
        await setupKeyDone(row);return;
      }
      /* a no to the environment key is remembered, as the old window did; the typed key, if any, is tested then */
      if(action.declined){try{await catalog.answerEnvironmentKey(row.id,'no');}catch(error){addLocal(screenErrorText(codeOnly(error),act('screen.action.answer')));}}
      if(action.use==='next'){
        const fresh=action.declined?await refreshSetupProvider(row.id):row;if(!fresh)return;
        if(!fresh.requiresKey||fresh.configured){await setupKeyDone(fresh);return;}
        updateSetup(current=>({...current,key:setupKeyView(fresh,[{text:t('panel.setup.typeKey'),roles:'warn'}])}));return;
      }
      let secret=action.key??'';if(!secret)return;
      updateSetup(current=>current.key?.kind==='ask'?{...current,key:{...current.key,testing:true}}:current);
      let result:TuiKeySave;
      try{result=await catalog.setProviderKey(row.id,secret);}
      catch(error){updateSetup(current=>({...current,key:setupKeyView(row,[{text:screenErrorText(codeOnly(error),act('screen.action.keyTest'),{note:t('screen.provider.keyNotSaved')}),roles:'warn'}])}));return;}
      finally{secret='';}
      if(!result.saved){updateSetup(current=>({...current,key:setupKeyView(row,[{text:result.message,roles:'warn'}])}));return;}
      addLocal(t('panel.provider.keySaved',{provider:row.label}));
      await setupKeyDone(row);
    };
    const startSetup=async(from:'provider'|'key'|'model')=>{
      let providers:SetupProvider[];
      try{
        const model=createProviderPickerModel(catalog);providerPickerRef.current=model;await model.open();
        const rows=providerPickerItems([...model.rows()],'',{reachable:model.reachable});setupProvidersRef.current=rows;
        providers=rows.map(row=>({id:row.id,label:row.label,local:row.local&&!row.requiresKey}));
      }catch(error){addLocal(screenErrorText(error,act('screen.action.providerPicker')));return;}
      const row=setupProviderRow(chosenProvider);const provider=row?.id??null;
      setupOpenRef.current=true;
      setSheet(setupSheet({providers,provider,key:row?setupKeyView(row):null,models:null,current:controller.model(),checks:null},{tab:!provider||from==='provider'?0:from==='key'?1:2}));
      if(provider&&from==='model')await loadSetupModels(provider);
    };
    const finishSetup=async()=>{
      oauthLoginRef.current?.cancel();oauthLoginRef.current=null;setupAbortRef.current?.abort();setupAbortRef.current=null;modelPickerRef.current?.cancel();
      const model=controller.model();let ready=false;
      try{
        const provider=typeof catalog?.chosenProvider==='function'?await catalog.chosenProvider():null;
        ready=Boolean(provider&&providerOfModel(model)===provider&&(await readinessFor(model)).ready);
      }catch{ready=false;}
      addLocal(setupEndLines(ready?{ready:true,model}:{ready:false}).join('\n'));
    };
    React.useEffect(()=>{
      if(sheet?.name==='setup'||!setupOpenRef.current)return;
      setupOpenRef.current=false;void finishSetup();
    },[sheet]);
    const setupAskedRef:{current:boolean}=React.useRef(false);
    React.useEffect(()=>{
      if(!invocation.setup||!selectionLoaded||setupAskedRef.current)return;
      setupAskedRef.current=true;void startSetup('provider');
    },[selectionLoaded]);
    const loadProviders=async()=>{
      applyOverlay({kind:'provider'});setPickerQuery('');setPickerSelection({query:'',selected:0,pageSize:10});setProviderStep({kind:'list'});setProviderSecret('');
      const model=createProviderPickerModel(catalog);providerPickerRef.current=model;
      try{await model.open();setProviderRows([...model.rows()]);}catch(error){addLocal(screenErrorText(error,act('screen.action.providerPicker')));}
    };
    const keyStepFor=(row:TuiProvider,remediation?:TuiProviderProbe['remediation']):ProviderStep=>
      row.id==='openrouter'&&typeof catalog?.startOpenRouterLogin==='function'
        ?{kind:'login-choice',provider:row,choice:'browser',...(remediation?{remediation}:{})}
        :{kind:'key',provider:row,testing:false,result:null,...(remediation?{remediation}:{})};
    const oauthErrorText=(provider:TuiProvider,error:unknown)=>{
      const code=String((error as any)?.code??'');const status=(error as any)?.status??'?';
      const known=['OAUTH_TIMEOUT','OAUTH_SCAMBIO_RIFIUTATO','OAUTH_RETE','OAUTH_RISPOSTA_INATTESA','OAUTH_DENIED','OAUTH_CODE_MISSING'];
      return known.includes(code)?t(`screen.provider.oauthError.${code}` as any,{provider:provider.label,status}):t('screen.provider.oauthError.other');
    };
    /* P21 (owner decisions 2026-09-26): the browser opens (the address is shown anyway), the loopback waits, a code can be
       pasted instead; the key that comes back is tested and saved like a pasted one, then the models open. */
    const completeOAuth=async(provider:TuiProvider,key:string)=>{
      setProviderStep((current:ProviderStep)=>current.kind==='oauth'?{...current,phase:'exchanging',message:null}:current);
      let result:TuiKeySave;
      try{result=await catalog.setProviderKey(provider.id,key);}
      catch(error){setProviderStep((current:ProviderStep)=>current.kind==='oauth'?{...current,phase:'failed',message:screenErrorText(codeOnly(error),act('screen.action.keyTest'))}:current);return;}
      finally{key='';}
      if(!result.saved){setProviderStep((current:ProviderStep)=>current.kind==='oauth'?{...current,phase:'failed',message:result.message}:current);return;}
      oauthLoginRef.current=null;
      addLocal(t('screen.provider.oauthSaved',{provider:provider.label}));
      const refreshed=(await catalog.listProviders()).find((entry:TuiProvider)=>entry.id===provider.id)??{...provider,configured:true};
      await chooseProviderAndOpenModels(refreshed);
    };
    const startOAuth=async(provider:TuiProvider)=>{
      oauthLoginRef.current?.cancel();oauthLoginRef.current=null;setProviderSecret('');
      if(signsIn(provider)){
        let plan:TuiChatgptLogin;const epoch=++oauthEpochRef.current;
        try{plan=await catalog.chatgpt!.startLogin();}
        catch(error){if(oauthEpochRef.current!==epoch)return;setProviderStep({kind:'oauth',provider,url:'',mode:'browser',opened:false,phase:'failed',message:chatgptFailureReason(String((error as any)?.code??'CHATGPT_ERRORE')),...PLAN_WINDOW_FAILED});return;}
        if(oauthEpochRef.current!==epoch){plan.cancel();return;}/* the window was closed, or a newer sign-in started, meanwhile */
        oauthLoginRef.current=plan;const window=planWindow(plan);
        addLocal(t('screen.provider.oauthAddress',{provider:t('key.chatgpt.name'),url:plan.url}));
        setProviderStep({kind:'oauth',provider,url:plan.url,mode:'browser',opened:plan.opened,phase:'waiting',message:null,...window});
        void plan.outcome.then(async outcome=>{
          if(oauthLoginRef.current!==plan)return;
          oauthLoginRef.current=null;
          const failed=planSignInFailure(outcome);
          if(failed){setProviderStep((current:ProviderStep)=>current.kind==='oauth'?{...current,phase:'failed',message:failed}:current);return;}
          addLocal(chatgptSignedInNote(whoText(outcome.ok?outcome.email:null),activeCredentialStore()?.kind));
          const refreshed=(await catalog.listProviders()).find((entry:TuiProvider)=>entry.id===provider.id)??{...provider,configured:true};
          await chooseProviderAndOpenModels(refreshed);
          setProviderVerificationTick((current:number)=>current+1);
        });
        return;
      }
      let login:OpenRouterLogin;
      try{login=await catalog.startOpenRouterLogin!();}
      catch(error){setProviderStep({kind:'oauth',provider,url:'',mode:'browser',opened:false,phase:'failed',message:oauthErrorText(provider,error)});return;}
      oauthLoginRef.current=login;
      /* The address also goes to the conversation, unboxed: a person copies it there without the window's borders. */
      addLocal(t('screen.provider.oauthAddress',{provider:provider.label,url:login.url}));
      setProviderStep({kind:'oauth',provider,url:login.url,mode:login.mode,opened:login.opened,phase:login.mode==='paste'?'paste':'waiting',message:null});
      login.key.then((key:string)=>{if(oauthLoginRef.current===login)void completeOAuth(provider,key);},(error:unknown)=>{
        if(oauthLoginRef.current!==login||(error as any)?.code==='OAUTH_CANCELLED')return;
        oauthLoginRef.current=null;
        setProviderStep((current:ProviderStep)=>current.kind==='oauth'?{...current,phase:'failed',message:oauthErrorText(provider,error)}:current);
      });
    };
    /* Owner 11/10/2026: with a key in use (saved, or an approved environment variable), Enter offers to use it, sign in again or
       remove it (provider-picker.ts KEY_ACTIONS); "use it" goes on exactly as before. */
    /* finding 5 (13/10/2026): a plan signed in to offers its choices with or without the plan allowed — signing out must be on the screen */
    const offersKeyActions=(row:TuiProvider)=>(signsIn(row)&&row.keySource==='saved')||row.configured&&row.requiresKey!==false&&(row.keySource==='saved'||row.keySource==='environment')&&typeof catalog?.clearProviderKey==='function';
    const removeProviderKey=async(row:TuiProvider)=>{
      if(signsIn(row)){
        try{const done=await catalog.chatgpt!.signOut();addLocal(t(!done.signedOut?'key.chatgpt.logout.none':done.revoked?'screen.provider.signedOut':'screen.provider.signedOutNotConfirmed'));}
        catch(error){addLocal(screenErrorText(codeOnly(error),act('screen.action.providerChoice')));}
        setProviderStep({kind:'list'});setProviderSecret('');setProviderVerificationTick((current:number)=>current+1);
        /* from the /provider sheet: its window closes and the sheet comes back with the row as it is now (as choosing a provider
           closes it and opens /model); from the old picker, its list is read again */
        if(providerViaSheetRef.current){providerViaSheetRef.current=false;setAppState((current:TuiAppState)=>closeOverlay(current));await loadProviderSheet();return;}
        try{await providerPickerRef.current?.open();setProviderRows([...(providerPickerRef.current?.rows()??[])]);}catch{/* the list stays as it was */}
        return;
      }
      try{
        await catalog.clearProviderKey(row.id);
        /* the same door as `talos provider remove-key` (F-S-002): an approved environment key is taken back too */
        const variable=row.keySource==='environment'&&typeof catalog?.answerEnvironmentKey==='function'?(await catalog.answerEnvironmentKey(row.id,'no'),row.environmentVariable??null):null;
        addLocal(variable?t('screen.provider.keyRemovedEnvironment',{provider:row.label,variable,id:row.id}):t('screen.provider.keyRemoved',{provider:row.label}));
      }catch(error){addLocal(screenErrorText(codeOnly(error),act('screen.action.providerChoice')));}
      setProviderStep({kind:'list'});setProviderSecret('');
      /* Found by acceptance s65 (c), 14/10/2026: as the sign-out above — from the /provider sheet the window closes and the sheet
         comes back with the row as it is now. It stayed open with nothing drawn for it, and the screen's keys went to it: Ctrl+C
         Ctrl+C did not end TALOS until an Esc pressed blind. */
      if(providerViaSheetRef.current){providerViaSheetRef.current=false;setAppState((current:TuiAppState)=>closeOverlay(current));await loadProviderSheet();return;}
      try{await providerPickerRef.current?.open();setProviderRows([...(providerPickerRef.current?.rows()??[])]);}catch{/* the list stays as it was */}
    };
    const routeProviderSelection=async(row:TuiProvider,{allowEnvironmentConsent=true,keyActionChosen=false}:{allowEnvironmentConsent?:boolean;keyActionChosen?:boolean}={})=>{
      /* 14/10/2026 (owner: the Z.AI key only to the address you chose, «Te lo chiede quando metti la chiave»): before any check, key or
         environment key — each of them sends the key — the address is asked, the plan first */
      if(row.id===ZAI_PROVIDER&&row.addressChosen===false){setProviderStep({kind:'address',provider:row,choice:0,route:{allowEnvironmentConsent,keyActionChosen}});return;}
      const originalIndex=providerRows.findIndex((provider:TuiProvider)=>provider.id===row.id);
      if(originalIndex>=0)providerPickerRef.current?.select(originalIndex);
      if(allowEnvironmentConsent){
        const preliminary=providerPickerEnter({selectedProvider:row.id,configured:row.configured,requiresKey:row.requiresKey,keySource:row.keySource});
        if(preliminary.kind==='environment-consent'){setProviderStep({kind:'consent',provider:row,choice:'no'});return;}
      }
      if(!keyActionChosen&&offersKeyActions(row)){const planNeeded=signsIn(row)&&!row.configured;setProviderStep({kind:'key-actions',provider:row,choice:planNeeded?'sign-in':'use',...(planNeeded?{planNeeded:true}:{})});return;}
      let probe:TuiProviderProbe|null=null;
      try{probe=await providerPickerRef.current?.probeSelected()??await catalog.probeProvider(row.id);}
      catch(error){addLocal(screenErrorText(codeOnly(error),act('screen.action.healthCheck',{provider:row.label})));return;}
      const next=providerPickerEnter({selectedProvider:row.id,configured:row.configured,requiresKey:row.requiresKey,keySource:row.keySource,probe});
      if(next.kind==='provider-setup'){setProviderSecret('');if(signsIn(row)){await startOAuth(row);return;}setProviderStep(keyStepFor(row,next.remediation??undefined));return;}
      if(next.kind==='provider-remediation'){
        addLocal(next.remediation?.message||probe?.detail||t('screen.provider.notReady',{provider:row.label}));return;
      }
      if(next.kind==='environment-consent'){setProviderStep({kind:'consent',provider:row,choice:'no'});return;}
      if(next.remediation&&next.remediation.code!=='none')addLocal(next.remediation.message);
      await chooseProviderAndOpenModels(row);
    };
    /* R4 Q-R4-13: the local list is read first and the picker opens with it, so its first frame already holds the rows or
       the empty-state line (it never shows an empty box that only later turns out to be empty or failed). */
    const changeSession=async(action:'resume'|'fork',id:string)=>{
      const previous=controller.current();
      modeChangingRef.current=true;
      try{
        if(controller.mode()==='bypassPermissions'&&(action==='fork'||id!==previous)){
          await controller.setMode('default');
          setState((current:TuiState)=>({...current,status:{...current.status,permissionMode:'default'}}));
        }
        const next=action==='resume'?await controller.resumeSession(id):await controller.forkSession(id);
        if(next!==previous)fullAccessConsentRef.current={sessionId:next,confirmed:false};
        /* F-Q3 (owner 03/10): the screen shows the effort the resumed (or forked) session really uses — the kernel keeps it per
           session — not the configured default, which stays for new sessions */
        try{const row=(await controller.listSessions({scope:'loaded'})).find((summary:CliSessionSummary)=>summary.id===next);if(row)setReasoningEffort(row.reasoningEffort);}catch{/* the list is a mirror: a failure keeps what the screen shows */}
        await controller.setMode(controller.mode());
        setState((current:TuiState)=>({...current,status:{...current.status,permissionMode:controller.mode()}}));
        return next;
      }finally{modeChangingRef.current=false;}
    };
    changeSessionRef.current=changeSession;
    /* stage 7.5 (owner 03/10 «Tutto, lato CLI»): /resume is the mockup's sheet — the same conversations as the picker, each with
       its messages and last exchange read from its events (sessionDigest) and the branch the CLI kept for it */
    const loadResumeSheet=async()=>{
      const model=createSessionPickerModel({...controller,resumeSession:(id:string)=>changeSession('resume',id),forkSession:(id:string)=>changeSession('fork',id)},'resume',{metadataRoot:sessionMetadataRoot(paths.dataRoot)});
      try{await model.open();}catch(error){addLocal(screenErrorText(error,act('screen.action.sessionPicker')));return;}
      const current=controller.current();
      /* B2: the sheet reads each session's events (messages, last exchange), and the list is served from the index without loading them: load them now, as the list always did before */
      try{await runtime.restore();}catch{/* the digests below simply stay empty; every conversation still resumes */}
      const rows=model.rows().map(row=>{
        let digest=sessionDigest([]);try{digest=sessionDigest((runtime.export(row.sessionId||row.id) as any)?.eventi);}catch{/* a conversation that cannot be read still resumes */}
        return{id:row.id,title:row.title||row.id,state:sessionState(row),at:row.updatedAt??row.startedAt,messages:digest.messages,branch:digest.branch,model:row.model,current:Boolean(current)&&(row.id===current||row.sessionId===current),you:digest.you,answer:digest.answer};
      });
      setSheet(resumeSheet(rows,{project:basename(projectRoot)}));
    };
    /* stages 7.6/7.8 (owner 03/10 «taglio prima + messaggio nel composer»; desktop 88c68695c): a new conversation just before
       that turn, the person's message back in the composer; the one of now stays in /resume */
    const sheetPointsRef:{current:readonly UndoPoint[]}=React.useRef([] as readonly UndoPoint[]);
    const forkBeforeTurn=async(from:string,runId:string,label:string,why:'fork'|'undo'|'retry'):Promise<boolean>=>{
      if(!runtime.forkBeforeRun){addLocal(t('panel.fork.cannotCut'));return false;}
      if(sessionConfirmingRef.current)return false;sessionConfirmingRef.current=true;
      try{
        const store=createSessionMetadataStore({rootDir:sessionMetadataRoot(paths.dataRoot)});
        const meta=await store.get(from).catch(()=>null);const title=meta?.name??meta?.firstMessage??'';
        const cut=await runtime.forkBeforeRun(from,runId);
        freshView();await changeSession('resume',cut.sessionId);
        const name=title?t('panel.fork.name',{name:[...title].length>73?[...title].slice(0,72).join('')+'…':title}):'';
        if(name)await store.setName(cut.sessionId,name).catch((error:unknown)=>developmentLogError('ui.session.fork_name',error,{},'tui'));
        if(cut.message)restoreDraft({text:cut.message,collapsedPastes:[]});
        const message=[...(cut.message||label)].length>50?[...(cut.message||label)].slice(0,49).join('')+'…':(cut.message||label);
        addLocal(why==='undo'?t('panel.undo.wentBack',{message}):why==='retry'?t('panel.retry.branched',{name:name||cut.sessionId}):t('panel.fork.cutDone',{message,name:name||cut.sessionId}));
        if(cut.attachments?.length)addLocal(t('panel.fork.imagesNotBack'));
        return true;
      }catch(error){addLocal(screenErrorText(error,act('screen.action.sessionAction')));return false;}
      finally{sessionConfirmingRef.current=false;}
    };
    /* stage 7.11 (mockup PANELS.settings; owner 03/10): /status /usage /context /config open the Settings sheet on their tab. Each
       tab fills in as its facts arrive («Reading…» until then); what was changed in Config stays while the others fill in. */
    const updateSettings=(change:(state:SettingsState)=>SettingsState)=>{
      const current=sheetRef.current;const settings=current?.name==='settings'?current.context?.settings:undefined;if(!current||!settings)return;
      setSheet(settingsSheet(change(settings),{tab:current.panel.tab,prev:current.panel}));
    };
    const settingsUiRef:{current:Record<string,unknown>|undefined}=React.useRef(undefined);
    /* the files changed in the project, as git counts them; nothing when it is not a repository or git does not answer */
    const changedFiles=():Promise<number|null>=>safeGitArgs(projectRoot).catch(()=>null).then(safe=>new Promise<number|null>(resolve=>{if(safe===null){resolve(null);return;}try{execFile('git',[...safe,'status','--porcelain'],{cwd:projectRoot,timeout:2000,windowsHide:true},(error,stdout)=>resolve(error?null:String(stdout).split('\n').filter(line=>line.trim()).length));}catch{resolve(null);}}));
    /* the Config tab from the effective settings; a file that cannot be read is said (as /config did), never shown as the defaults */
    const loadSettingsConfig=async()=>{
      let ui:Record<string,unknown>|undefined;
      try{ui=(await loadEffectiveConfig({paths,projectRoot})).value.ui as Record<string,unknown>|undefined;}
      catch{settingsUiRef.current=undefined;updateSettings(current=>({...current,config:null,configError:t('screen.config.loadFailed')}));return;}
      settingsUiRef.current=ui;updateSettings(current=>({...current,config:settingFields(ui,process.env),configError:null}));
    };
    /* C4: read once on opening and once after an action. The revision comes from the snapshot and goes back with the change; the key is new for each action (the PC's context-client.js) */
    const contextRevisionRef:{current:number|null}=React.useRef(null);
    const openContextPage=async(tab=0)=>{
      const session=state.sessionId??controller.current()??null;
      const status=session?await refreshContextStatus():null;
      /* null is «no engine for this conversation», which the page explains; a failed read is said, never passed off as that */
      let failure:unknown=null;
      const read=async(path:string)=>session&&typeof runtime.contextManager==='function'?runtime.contextManager(session,{method:'GET',path}).catch((error:unknown)=>{failure=error;return null;}):null;
      const [snapshot,versions,record,sent]=await Promise.all([read('/'),read('/versions'),readUsageRecord(usageRecordFile(paths.dataRoot,projectRoot),{session,turns:28}).catch(()=>null),
        session?Promise.resolve(runtime.requestSent?.(session)).catch(()=>null):Promise.resolve(null)]);
      if(failure)addLocal(screenErrorText(failure,act('screen.action.context')));
      contextRevisionRef.current=typeof (snapshot as any)?.revision==='number'?(snapshot as any).revision:null;
      setSheet(contextSheet({status:status??unavailableContextStatus(session??'','no-session'),snapshot:snapshot as any,versions:(versions as any)?.versions??[],overTime:record?.perTurn??[],now:Date.now(),sent:sent??null},{mode:{color:capabilities.color&&terminalTrueColor(process.env),unicode:capabilities.unicode},tab}));
    };
    /* C6b: one read on opening, and one at the end of a turn while it is open; the row of the first page only, as the bar's */
    const boardRowsOf=(rows:readonly any[]):BoardRow[]=>rows.filter(row=>!row.parentId).slice(0,SESSIONS_READ).map(row=>({id:row.id,title:row.title||row.id.slice(0,8),state:sessionState(row),model:row.model??null,tokens:row.usage&&(row.usage.promptTokens!==null||row.usage.completionTokens!==null)?(row.usage.promptTokens??0)+(row.usage.completionTokens??0):null,when:row.startedAt?panelWhen(row.startedAt,{ago:true}):''}));
    const boardReadAtRef:{current:number}=React.useRef(0);
    const openBoard=async()=>{const rows=await controller.listSessions({scope:'all'});boardReadAtRef.current=Date.now();setSheet(boardSheet(boardRowsOf(rows),{glyph:theme.glyphs.spinner[0]!,unicode:capabilities.unicode}));};
    /* C11b: Projects reads what the Board and New session read (the session list, the trusted folders); nothing of its own */
    const openProjects=async()=>{
      const [rows,folders]=await Promise.all([controller.listSessions({scope:'all'}),listTrustedFolders(paths.trust.projects).then(found=>found.map(row=>row.path)).catch(()=>[] as string[])]);
      const sessions:ProjectSession[]=rows.map((row:any)=>({id:row.id,title:row.title||row.id.slice(0,8),project:row.project??null,path:row.path??null,parent:row.parentId??null,state:sessionState(row),at:row.updatedAt??row.startedAt??null,
        requests:row.usage?.turns??null,tokens:row.usage&&(row.usage.promptTokens!==null||row.usage.completionTokens!==null)?(row.usage.promptTokens??0)+(row.usage.completionTokens??0):null}));
      const current=basename(projectRoot);
      setSheet(projectsSheet(projectsOf(sessions,{current,here:projectRoot,folders}),{current,unicode:capabilities.unicode}));
    };
    const changeContext=async(action:Extract<SheetAction,{kind:'contextChange'}>)=>{
      const session=state.sessionId??controller.current()??null;if(!session||typeof runtime.contextManager!=='function')return;
      const body={...action.body,expectedRevision:contextRevisionRef.current,idempotencyKey:randomUUID()};
      try{await runtime.contextManager(session,{method:action.method,path:action.path,body});setToast(t(action.done));}
      catch(error){if((error as {code?:string})?.code==='CTX_STALE_REVISION')setToast(t('panel.context.stale'));else addLocal(screenErrorText(error,act('screen.action.context')));}
      await openContextPage(action.tab);
    };
    const openSettings=(tab:SettingsTab)=>{
      setSheet(settingsSheet({status:null,usage:null,context:null,config:null},{tab}));
      const session=state.sessionId??controller.current()??null;const model=state.status.model;
      void loadSettingsConfig();
      void (async()=>{
        let status:CliContextStatus|null=null;
        if(session&&typeof runtime.contextStatus==='function'){try{status=await runtime.contextStatus(session);setContextStatus(status);}catch{status=null;}}
        const providers=await catalog.listProviders().catch(()=>[] as TuiProvider[]);
        const priceSource=providers.find((row:TuiProvider)=>row.id===providerOfModel(model))?.label??null;
        const facts=usageFacts({model,usage:state.usage,contextStatus:status??contextStatus,compactions:state.compactions});
        const record=await readUsageRecord(usageRecordFile(paths.dataRoot,projectRoot),{session});
        updateSettings(current=>({...current,context:contextOf(status),contextNote:t('panel.settings.noContext'),
          usage:usageLines(facts.snapshot,{priceSource,compactAt:status?.autoCompaction.enabled?compactAtShare(status):null,record,reasoning:currentModelMeta?.reasoning===true||reasoningEffort!==null?{effort:reasoningEffort??t('screen.effort.modelDefault'),usage:reasoningUsageLabel(state.usage)}:null})}));
      })();
      void (async()=>{
        const work=async()=>{try{const [tasks,notes]=await Promise.all([tasksFacade().list(),notesFacade().list()]);if(tasks.state!=='ready'||notes.state!=='ready')return null;return{open:tasks.rows.filter(row=>row.status!=='done').length,notes:notes.rows.length};}catch{return null;}};
        const [meta,events,mcp,memory,rules,counts,changed,providers]=await Promise.all([
          session?createSessionMetadataStore({rootDir:sessionMetadataRoot(paths.dataRoot)}).get(session).catch(()=>null):Promise.resolve(null),
          Promise.resolve().then(()=>session?((runtime.export(session) as any)?.eventi??[]):[]).catch(()=>[]),
          mcpFacade().list().catch(()=>null),memoryFacade().list().catch(()=>null),permissionRuleCounts({paths,projectRoot}),work(),changedFiles(),
          catalog.listProviders().catch(()=>[] as TuiProvider[]),
        ]);
        const digest=sessionDigest(events as any[]);
        const provider=providerOfModel(model);const providerLabel=providers.find((row:TuiProvider)=>row.id===provider)?.label??null;
        const mcpRows:McpRow[]|null=mcp?mcp.map(row=>({name:row.server?.name??row.id,state:row.health.state==='healthy'?'ok':row.health.state==='degraded'?'signin':row.health.state==='failed'?'failed':'unchecked'})):null;
        const ruleTotal=rules?['user','project','projectUser'].reduce((sum,scope)=>{const row=(rules as any)[scope];return sum+row.allow+row.ask+row.deny;},0):null;
        const extra=[
          {label:t('panel.settings.row.sandbox'),value:t(sandboxVerified===true?'panel.settings.sandbox.yes':sandboxVerified===false?'panel.settings.sandbox.no':'panel.settings.sandbox.unknown')},
          {label:t('panel.settings.row.rules'),value:ruleTotal===null?t('panel.settings.notRead'):ruleTotal===0?t('panel.settings.rules.none'):t('panel.settings.rules.some',{count:ruleTotal})},
          {label:t('panel.settings.row.work'),value:counts?t('panel.settings.work',counts):t('panel.settings.notRead')},
        ];
        updateSettings(current=>({...current,status:statusLines({
          version:CLI_VERSION,node:process.versions.node.split('.').slice(0,2).join('.'),os:osName(process.platform,osRelease()),terminal:terminalName(process.env),
          conversation:session?{name:meta?.name??meta?.firstMessage??null,messages:digest.messages,id:session}:null,
          project:{path:homePath(projectRoot,homedir()),branch:digest.branch??null,changed},
          model:provider?{name:model.slice(provider.length+1),provider:providerLabel,effort:reasoningEffort??null}:null,
          mode:controller.mode(),agents:state.agents.length,mcp:mcpRows,
          memory:{files:(props.loadedFiles??[]).map(file=>file.split(/[\\/]/u).pop()!),entries:memory&&memory.state==='ready'?memory.rows.length:null},extra,
        })}));
      })();
    };
    /* Enter on Config: only what changed, for this project (as /config did); applied at once where it can be, the rest says
       it waits for the next launch */
    const saveSettings=async(values:Record<string,string|boolean>)=>{
      const ui=settingsUiRef.current;const changes=settingChanges(values,ui);
      if(!changes.length){addLocal(t('panel.settings.nothingChanged'));return;}
      try{
        for(const change of changes){
          if(change.unset)await configUnset({paths,projectRoot,scope:'project-user',path:`ui.${change.key}`});
          else await configSet({paths,projectRoot,scope:'project-user',path:`ui.${change.key}`,value:change.value});
        }
      }catch(error){addLocal(t('panel.settings.saveFailed',{detail:screenErrorText(codeOnly(error),act('screen.action.saveSetting'))}));return;}
      for(const change of changes){
        if(change.key==='reasoning')applyReasoningMode(change.value as UiReasoning);
        if(change.key==='toolRows')setToolRows(change.value as UiToolRows);
        if(change.key==='editor')editorCommandRef.current=change.unset?null:String(change.value);
        if(change.key==='maxProseWidth'){proseTouched.current=true;setMaxProseWidth(change.value as number|null);}
        if(change.key==='questionTimeout'){questionTimeoutTouched.current=true;questionTimeoutRef.current=change.value as UiQuestionTimeout;}
      }
      settingsUiRef.current={...(ui??{}),...Object.fromEntries(changes.map(change=>[change.key,change.unset?undefined:change.value]))};
      const later=changes.filter(change=>!change.live).map(change=>settingDefs().find(def=>def.key===change.key)!.label);
      addLocal(later.length?t('panel.settings.savedNext',{fields:later.join(', ')}):t('panel.settings.saved'));
    };
    /* stage 7.6: /fork is the mockup's sheet on the conversation in use — your messages, newest first. Only «latest» (the whole
       conversation) until the kernel can start one before an earlier message (desktop patch forka primaDelGiro, owner 03/10). */
    const loadForkSheet=async()=>{
      const current=state.sessionId??controller.current()??null;
      let turns:ReturnType<typeof sessionTurns>=[];try{if(current)turns=sessionTurns((runtime.export(current) as any)?.eventi);}catch{/* nothing to fork from */}
      setSheet(forkSheet(turns,{canCut:runtime.capabilities?.().forkBeforeRun===true}));
    };
    const loadSessions=async(action:'resume'|'fork')=>{
      if(action==='resume'){await loadResumeSheet();return;}
      if(action==='fork'){await loadForkSheet();return;}
      const model=createSessionPickerModel({...controller,resumeSession:(id:string)=>changeSession('resume',id),forkSession:(id:string)=>changeSession('fork',id)},action,{metadataRoot:sessionMetadataRoot(paths.dataRoot)});sessionPickerRef.current=model;
      try{await model.open();}catch(error){addLocal(screenErrorText(error,act('screen.action.sessionPicker')));return;}
      if(sessionPickerRef.current!==model)return;
      setSessionRows([...model.rows()]);setPickerQuery('');setPickerSelection({query:'',selected:0,pageSize:10});applyOverlay({kind:'session',action});
    };
    /* stage 7.21 (mockup permissions; owner 03/10): the modes, the rules read again from the settings, the last decisions of
       this project, and whether the project is trusted; the rows of the Rules tab are kept to act on by index */
    const openPermissions=async({tab=0,sel=0}:{tab?:number;sel?:number}={})=>{
      try{
        const {rows}=await readRuleRows({paths,projectRoot});ruleRowsRef.current=rows;
        let recent:Awaited<ReturnType<typeof controller.decisions>>=[];try{recent=await controller.decisions();}catch(error){addLocal(screenErrorText(error,act('screen.action.permissionRules')));}
        let trusted:boolean|null=null;try{trusted=(await createTrustAuthority({projectRoot,trustRoot:paths.trust.projects}).inspect()).trusted;}catch{/* said as unknown: no row */}
        setSheet(permissionsSheet({mode:controller.mode(),trusted,rules:ruleViews(rows),recent:recentViews(recent,{projectRoot}),tab,sel}));
      }catch(error){addLocal(screenErrorText(error,act('screen.action.trustCenter')));}
    };
    /* a change goes to the settings files, then the engine of this session takes the rules read back (owner 03/10: at once) */
    const afterRuleChange=async(toast:string,pick:(rows:readonly RuleRow[])=>number)=>{
      const {rows,rules}=await readRuleRows({paths,projectRoot});controller.setRules(rules);
      setToast(toast);await openPermissions({tab:1,sel:Math.max(0,pick(rows))});
    };
    const loadTrustCenter=async()=>{
      try{
        const snapshot=await createTrustAuthority({projectRoot,trustRoot:paths.trust.projects}).inspect();
        setTrustCenter(trustCenterModel(snapshot,{permissionMode:controller.mode()}));
      }catch(error){addLocal(screenErrorText(error,act('screen.action.trustCenter')));}
    };
    /* C8: one read of every tab; a probe's measurement stays on its row, which a fresh list does not have */
    const probedRef:{current:Map<string,McpServerView>|null}=React.useRef(null);
    const openCapability=async(tab:number,selectedId:string|null=null)=>{
      const session=state.sessionId??controller.current()??null;
      /* review 01/11 (ALTO 3): the project's skills as the kernel loads them (skill-registry.mjs, `.talos/skills` then the older name); a
         malformed one stops the load with a declared error, said here, never shown as «no skills» */
      const skillsRead=importTalosModule(findTalosRepoRoot(projectRoot),'skill-registry.mjs').then((m:any)=>m.caricaSkill({cartella:projectRoot})).then((r:any)=>(Array.isArray(r?.skills)?r.skills:[]).map((s:any)=>({id:String(s.id),name:String(s.name??s.id),description:typeof s.description==='string'?s.description:null,where:t('panel.capability.skillWhere')})))
        .catch((error:unknown)=>{addLocal(screenErrorText(error,act('screen.action.commandOperation',{command:'capability',operation:'skills'})));return[] as any[];});
      const [tools,connectors,plugins,hooks,skills]=await Promise.all([session?Promise.resolve(runtime.requestTools?.(session)).catch(()=>null):Promise.resolve(null),mcpFacade().list().catch(()=>[] as McpServerView[]),pluginFacade().list().catch(()=>[] as PluginView[]),hookFacade().list().catch(()=>[] as HookView[]),skillsRead]);
      const measured=probedRef.current;
      setSheet(capabilitySheet({tools:tools?capabilityTools(tools):null,skills,connectors:connectors.map((row:McpServerView)=>measured?.get(row.id)??row),plugins,hooks},{tab,selectedId}));
    };
    const actOnCapability=async(action:Extract<SheetAction,{kind:'capability'}>)=>{
      try{
        if(action.tab===2&&action.verb==='probe'){const row=await mcpFacade().probe(action.id);(probedRef.current??=new Map()).set(action.id,row);}
        else if(action.tab===2){if(action.verb==='trust')await mcpFacade().trust(action.id);else await mcpFacade().untrust(action.id);probedRef.current?.delete(action.id);}
        else if(action.tab===3){const row=(await pluginFacade().list()).find((value:PluginView)=>value.id===action.id);if(action.verb==='trust')await pluginFacade().trust(action.id);else if(action.verb==='untrust')await pluginFacade().untrust(action.id);else if(row?.quarantine.active)await pluginFacade().releaseQuarantine(action.id);else await pluginFacade().quarantine(action.id,t('screen.plugins.manualQuarantine'));}
        else if(action.tab===4){
          const row=(await hookFacade().list()).find((value:HookView)=>value.id===action.id);
          if(action.verb==='dry-run'){if(state.running){addLocal(t('screen.hooks.dryRunBusy'));return;}const eventType=row?.events[0];if(!eventType){addLocal(t('screen.hooks.noEvent'));return;}const result=await hookFacade().dryRun(action.id,{eventType});setToast(t('panel.capability.dryRunDone',{outcome:String((result as any)?.decision??(result as any)?.outcome??'')}));}
          else if(action.verb==='trust')await hookFacade().trust(action.id);else if(action.verb==='untrust')await hookFacade().untrust(action.id);else if(row?.quarantine.active)await hookFacade().releaseQuarantine(action.id);else await hookFacade().quarantine(action.id,t('screen.hooks.manualQuarantine'));
        }
      }catch(error){addLocal(screenErrorText(error,act('screen.action.commandOperation',{command:'capability',operation:action.verb})));}
      await openCapability(action.tab,action.id);
    };
    /* C12d: the Processes page reads the kernel's ledger of every chat this window has; nothing refreshes it on a timer (it says when it was read) */
    const processesLiveRef:{current:{rows:any[];readAt:number;error:string|null;stopping:Record<string,number>}}=React.useRef({rows:[],readAt:0,error:null,stopping:{}});
    /* draws the Processes page from what was last read, keeping the row, the filter and a search under way */
    const drawProcesses=(selectedId?:string|null)=>{
      const live=processesLiveRef.current;
      setSheet(processesRedraw(sheetRef.current,{rows:live.rows,readAt:live.readAt,error:live.error,stopping:live.stopping,now:Date.now(),motion:capabilities.motion},selectedId));
    };
    const readProcesses=async()=>{
      const live=processesLiveRef.current;let rows:any[]=live.rows;let error:string|null=null;
      try{rows=[...(await runtime.processes?.()??[])];}catch(caught){error=screenErrorText(caught,act('screen.action.command',{command:'processes'}));}
      const runningNow=new Set(rows.filter((r:any)=>r.outcome==='in-corso'||r.outcome==='in-sfondo').map((r:any)=>`${r.sessionId}:${r.toolCallId}`));
      const stopping:Record<string,number>={};for(const [key,since] of Object.entries(live.stopping)){if(runningNow.has(key))stopping[key]=since;else{const row=rows.find((r:any)=>`${r.sessionId}:${r.toolCallId}`===key);setToast(t('panel.processes.stopped',{command:String(row?.command??'')}));}}
      processesLiveRef.current={rows,readAt:Date.now(),error,stopping};
    };
    const openProcesses=async(selectedId:string|null=null)=>{
      if(sheetRef.current?.name!=='processes')processesLiveRef.current={rows:[],readAt:0,error:null,stopping:{}};
      await readProcesses();drawProcesses(selectedId);
    };
    const processesOpen=sheet?.name==='processes';const processesTicking=processesOpen&&Boolean(sheet?.context?.ticking);
    React.useEffect(()=>{
      if(!processesTicking)return;let beats=0;let reading=false;
      const timer=setInterval(()=>{beats+=1;if(sheetRef.current?.name!=='processes')return;
        if(beats%4===0&&!reading){reading=true;void readProcesses().then(()=>{reading=false;if(sheetRef.current?.name==='processes'&&!sheetRef.current.panel.edit)drawProcesses();});return;}
        if(!sheetRef.current.panel.edit)drawProcesses();},500);
      return()=>clearInterval(timer);
    },[processesTicking]);
    const actOnProcesses=async(action:Extract<SheetAction,{kind:'processes'}>)=>{
      if(action.verb==='reread'){await openProcesses();return;}
      const rows=[...(await runtime.processes?.()??[])];const label=(row:any)=>String(row?.command??'');const live=processesLiveRef.current;
      if(action.verb==='stop'&&action.sessionId&&action.toolCallId){
        const row=rows.find((r:any)=>r.sessionId===action.sessionId&&r.toolCallId===action.toolCallId);const key=`${action.sessionId}:${action.toolCallId}`;
        const answer=await runtime.stopProcess?.(action.sessionId,action.toolCallId);
        /* asked: the row says «stopping…» at once and counts; the page says «Stopped» when the ledger has it ended (a second s asks again) */
        if(answer==='stopped'){processesLiveRef.current={...live,rows,stopping:{...live.stopping,[key]:live.stopping[key]??Date.now()}};drawProcesses(key);return;}
        setToast(t(answer==='not-running'?'panel.processes.alreadyFinished':'panel.processes.couldNotStop',{command:label(row)}));await openProcesses(key);return;
      }
      const stopping={...live.stopping};let stopped=0;
      for(const row of rows.filter((r:any)=>r.outcome==='in-corso'||r.outcome==='in-sfondo')){if(await runtime.stopProcess?.(row.sessionId,row.toolCallId)==='stopped'){stopped+=1;stopping[`${row.sessionId}:${row.toolCallId}`]??=Date.now();}}
      processesLiveRef.current={...live,rows,stopping};setToast(t('panel.processes.stoppedAll',{count:stopped}));drawProcesses();
    };
    /* C10: the Devices page reads the remote coordinator as `talos remote list` and `folders` do; pairing stays the card of /remote */
    const openDevices=async(selectedId:string|null=null)=>{
      if(!remote){setSheet(devicesSheet({available:false,error:t('remote.card.unavailable'),pc:null,devices:[]}));return;}
      try{const coordinator=remote.toolCoordinator();const stato:any=await coordinator.stato();const telefoni=Array.isArray(stato?.telefoni)?stato.telefoni:[];
        const folders=new Map(await Promise.all(telefoni.filter((p:any)=>typeof p?.id==='string'&&!p.revocatoAlle).map(async(p:any)=>{
          const given=await coordinator.cartelle.consensiDi(p.id).then(rows=>Array.isArray(rows)?rows:null,()=>null);
          return[p.id,given?given.map((c:any)=>({name:String(c?.nome??basename(String(c?.percorso??''))),path:String(c?.percorso??''),blocked:c?.bloccata===true})):null] as const;})));
        setSheet(devicesSheet({available:true,error:null,pc:typeof stato?.nomePc==='string'?stato.nomePc:null,devices:deviceRows(telefoni,new Map([...folders].filter(([,rows])=>rows!==null)) as any),off:stato?.acceso!==true},{selectedId}));}
      catch(error){setSheet(devicesSheet({available:false,error:screenErrorText(error,act('screen.action.remote')),pc:null,devices:[]}));}
    };
    const revokeDevice=async(id:string)=>{
      if(!remote||!id)return;
      try{const coordinator=remote.toolCoordinator();const stato:any=await coordinator.stato();const phone=(stato?.telefoni??[]).find((p:any)=>p?.id===id);
        await coordinator.revoca(id);setToast(t('panel.devices.revoked',{name:cleanDeviceName(String(phone?.nome??id))}));}
      catch(error){addLocal(screenErrorText(error,act('screen.action.remote')));}
      await openDevices();
    };
    /* C9: the Doctor page reads `talos doctor --json` from a child, as /doctor always ran it; a report that is not ready exits 1 or 70 and still prints */
    const doctorReportRef:{current:any}=React.useRef(null);
    /* review 01/11 (MEDIO 9): one check at a time, a page that says it is checking, and a limit: a stuck child is said, never waited on for ever */
    const doctorRunningRef:{current:boolean}=React.useRef(false);
    const DOCTOR_LIMIT_MS=90_000;
    const openDoctor=async(selectedId:string|null=null)=>{
      if(doctorRunningRef.current){setToast(t('panel.doctor.already'));return;}
      doctorRunningRef.current=true;
      try{await readDoctor(selectedId);}finally{doctorRunningRef.current=false;}
    };
    const readDoctor=async(selectedId:string|null)=>{
      let report:any=null;
      try{const entry=process.argv[1];if(!entry)throw new Error('CLI_ENTRY_UNAVAILABLE');
        const out=await execFileAsync(process.execPath,[entry,'--project',projectRoot,'--no-color','doctor','--json'],{windowsHide:true,maxBuffer:2*1024*1024,timeout:DOCTOR_LIMIT_MS,env:screenChildEnvironment(process.env)}).then(result=>String(result.stdout),(error:any)=>{if(typeof error?.stdout==='string'&&error.stdout.trim())return error.stdout;throw error;});
        const parsed=JSON.parse(out.trim().split(/\r?\n/u).pop()??'');
        if(!parsed||typeof parsed!=='object'||!Array.isArray(parsed.checks))throw Object.assign(new Error(t('error.code.DOCTOR_REPORT_INVALID.what')),{code:'DOCTOR_REPORT_INVALID'});
        report=parsed;}
      catch(error){addLocal(screenErrorText(error,act('screen.action.command',{command:'doctor'})));}
      doctorReportRef.current=report;setSheet(doctorSheet(report,{selectedId}));
    };
    const exportDoctor=async()=>{
      const report=doctorReportRef.current;if(!report){addLocal(t('panel.doctor.noReport'));return;}
      try{const dir=join(paths.dataRoot,'doctor');await mkdir(dir,{recursive:true});const file=join(dir,`doctor-${new Date().toISOString().replace(/[:.]/gu,'-')}.json`);
        await writeFile(file,JSON.stringify(report,null,2)+'\n','utf8');setToast(t('panel.doctor.exported',{path:file}));}
      catch(error){addLocal(screenErrorText(error,act('screen.action.command',{command:'doctor'})));}
    };
    /* C9: the Research page reads the runs and the detail of the chosen one and of the 20 most recent; another is read when chosen with Enter */
    const openResearch=async({tab=0,selectedId=null,filterAt}:{tab?:number;selectedId?:string|null;filterAt?:number}={})=>{
      const open=sheetRef.current?.name==='research'?sheetRef.current.panel.tabs[0]!.body:null;const snapshot=await researchFacade().list();
      const recent=[...snapshot.rows].sort((a,b)=>String(b.startedAt??'').localeCompare(String(a.startedAt??''))).slice(0,20).map(row=>row.id);
      const wanted=[...new Set([...(selectedId?[selectedId]:[]),...recent])].filter(id=>snapshot.rows.some(row=>row.id===id));
      const details=new Map((await Promise.all(wanted.map(async id=>[id,await researchFacade().read(id).catch(()=>null)] as const))).filter(([,detail])=>detail!==null) as [string,any][]);
      setSheet(researchSheet({...snapshot,details},{tab,selectedId,filterAt:filterAt??(open?.kind==='list'?open.filterAt??0:0)}));
    };
    const actOnResearch=async(action:Extract<SheetAction,{kind:'research'}>)=>{
      if(action.verb==='open'){await openResearch({selectedId:action.id,tab:1});return;}
      const name=(await researchFacade().list()).rows.find(row=>row.id===action.id);const label=name?.question??name?.name??action.id;const owner=state.sessionId??action.id;
      try{
        if(action.verb==='export'){const result=await researchFacade().exportFile(action.id,'md');setToast(t('panel.research.exported',{path:result.path}));}
        else if(action.verb==='pause'){await researchFacade().pause(owner,action.id);setToast(t('panel.research.paused',{name:label}));}
        else if(action.verb==='resume'){await researchFacade().resume(owner,action.id);setToast(t('panel.research.resumed',{name:label}));}
        else{await researchFacade().cancel(owner,action.id);setToast(t('panel.research.cancelled',{name:label}));}
      }catch(error){addLocal(screenErrorText(error,act('screen.action.commandOperation',{command:'research',operation:action.verb})));}
      await openResearch({selectedId:action.id});
    };
    /* C9: the Forge page reads the list and each tool's detail once (the forge holds few tools), and again after each change */
    const openForge=async(selectedId:string|null=null)=>{
      const open=sheetRef.current?.name==='forge'?sheetRef.current.panel.tabs[0]!.body:null;const snapshot=await forgeFacade().list();
      const details=new Map(await Promise.all(snapshot.rows.map(async row=>[row.id,await forgeFacade().read(row.id).catch(()=>null)] as const)));
      setSheet(forgeSheet({...snapshot,details:new Map([...details].filter(([,detail])=>detail!==null)) as any},{selectedId,filterAt:open?.kind==='list'?open.filterAt??0:0}));
    };
    const actOnForge=async(action:Extract<SheetAction,{kind:'forge'}>)=>{
      const owner=state.sessionId;if(!owner){addLocal(t('panel.forge.needsSession'));return;}
      const name=(await forgeFacade().list()).rows.find(row=>row.id===action.id)?.title??action.id;
      try{
        if(action.verb==='back'&&action.revision!==undefined){await forgeFacade().rollback(owner,action.id,action.revision);setToast(t('panel.forge.wentBack',{name,revision:action.revision}));}
        else{await forgeFacade().setEnabled(owner,action.id,action.verb==='enable');setToast(t(action.verb==='enable'?'panel.forge.enabled':'panel.forge.disabled',{name}));}
      }catch(error){addLocal(screenErrorText(error,act('screen.action.commandOperation',{command:'forge',operation:action.verb})));}
      await openForge(action.id);
    };
    /* C9: the Automations page reads everything once (rows, runs to review, last runs, the week ahead) and again after each change */
    const openAutomations=async({tab=0,selectedId=null,filterAt}:{tab?:number;selectedId?:string|null;filterAt?:number}={})=>{
      const open=sheetRef.current?.name==='automations'?sheetRef.current.panel.tabs[0]!.body:null;
      /* the model the host would run one with no model of its own: as `talos automation run` picks it (advanced-cli.ts) */
      const [data,effective]=await Promise.all([automationFacade().page(),loadEffectiveConfig({paths,projectRoot}).catch(()=>null)]);
      const defaultModel=(effective as {value?:{model?:string}}|null)?.value?.model??'openai:gpt-5-mini';
      setSheet(automationsSheet({...data,defaultModel},{tab,selectedId,filterAt:filterAt??(open?.kind==='list'?open.filterAt??0:0)}));
    };
    const actOnAutomation=async(action:Extract<SheetAction,{kind:'automation'}>)=>{
      const facade=automationFacade();const row=(await facade.list()).rows.find(value=>value.id===action.id);const name=row?.name??action.id;
      try{
        if(action.verb==='add'){const made=await facade.add({instructions:action.instructions??'',when:action.when??'',folder:projectRoot});setToast(t('panel.automations.added',{name:made.name}));await openAutomations({selectedId:made.id});return;}
        if(action.verb==='edit'){await facade.edit(action.id,{...(action.instructions?{instructions:action.instructions}:{}),...(action.when?{when:action.when}:{})});setToast(t('panel.automations.edited',{name}));}
        else if(action.verb==='pause'||action.verb==='resume'){await facade.setEnabled(action.id,action.verb==='resume');setToast(t(action.verb==='resume'?'panel.automations.turnedOn':'panel.automations.turnedOff',{name}));}
        else if(action.verb==='delete'){await facade.remove(action.id);setToast(t('panel.automations.deleted',{name}));await openAutomations();return;}
        else if(action.verb==='seen'){const result=await facade.markSeen(action.id,action.runIds??[]);setToast(tn('panel.automations.seen',result.count));}
        else if(action.verb==='run'){
          /* the process that runs the automations is asked, as `talos automation run` asks it; with none, the page says how to start one */
          await facade.requireRunnable(action.id);const lease=createHostLease({dir:join(paths.dataRoot,'automation-host'),role:'run'});const holder=lease.holder();
          if(holder){lease.send('run',action.id);setToast(t('panel.automations.asked',{pid:holder.pid,name}));}else addLocal(t('panel.automations.noHost'));
        }
      }catch(error){addLocal(screenErrorText(error,act('screen.action.commandOperation',{command:'automations',operation:action.verb})));}
      await openAutomations({selectedId:action.id});
    };
    const mcpFacade=():ReturnType<typeof createMcpFacade>=>mcpFacadeRef.current??=(createMcpFacade({projectRoot,paths}));
    const loadMcpCenter=async(selectedId?:string)=>{
      return openCapability(2,selectedId??null);
      try{
        const rows=await mcpFacade().list();
        const selected=selectedId?Math.max(0,rows.findIndex(row=>row.id===selectedId)):mcpCenter?.selected??0;
        setMcpCenter(createMcpCenterModel(rows,selected));
      }catch(error){addLocal(screenErrorText(error,act('screen.action.mcpCenter')));}
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
      }catch(error){addLocal(screenErrorText(error,act('screen.action.mcp',{action})));}
    };
    const hookFacade=():ReturnType<typeof createHookFacade>=>hookFacadeRef.current??=(createHookFacade({projectRoot,paths}));
    const loadHookCenter=async(selectedId?:string)=>{
      return openCapability(4,selectedId??null);
      try{
        const rows=await hookFacade().list();
        const found=selectedId?rows.findIndex(row=>row.id===selectedId):-1;
        const selected=found>=0?found:hookCenter?.selected??0;
        setHookCenter(createHookCenterModel(rows,selected));
      }catch(error){addLocal(screenErrorText(error,act('screen.action.hookCenter')));}
    };
    const actOnHookCenter=async(action:'dry-run'|'trust'|'untrust'|'toggle-quarantine')=>{
      const row=hookCenter?selectedHook(hookCenter):null;if(!row)return;
      try{
        if(action==='dry-run'){
          if(state.running){addLocal(t('screen.hooks.dryRunBusy'));return;}
          const eventType=row.events[0];if(!eventType){addLocal(t('screen.hooks.noEvent'));return;}
          const result=await hookFacade().dryRun(row.id,{eventType});
          setHookCenter((current:HookCenterModel|null)=>current?replaceHookCenterRow(current,{...row,lastDryRun:result}):current);
          return;
        }
        if(action==='trust')await hookFacade().trust(row.id);
        else if(action==='untrust')await hookFacade().untrust(row.id);
        else if(row.quarantine.active)await hookFacade().releaseQuarantine(row.id);
        else await hookFacade().quarantine(row.id,t('screen.hooks.manualQuarantine'));
        await loadHookCenter(row.id);
      }catch(error){addLocal(screenErrorText(error,act('screen.action.hook',{action})));}
    };
    const pluginFacade=():ReturnType<typeof createPluginFacade>=>pluginFacadeRef.current??=(createPluginFacade({projectRoot,paths}));
    const loadPluginCenter=async(selectedId?:string)=>{
      return openCapability(3,selectedId??null);
      try{
        const rows=await pluginFacade().list();
        const found=selectedId?rows.findIndex(row=>row.id===selectedId):-1;
        const selected=found>=0?found:pluginCenter?.selected??0;
        setPluginCenter(createPluginCenterModel(rows,selected));
      }catch(error){addLocal(screenErrorText(error,act('screen.action.pluginCenter')));}
    };
    const actOnPluginCenter=async(action:'trust'|'untrust'|'toggle-quarantine')=>{
      const row=pluginCenter?selectedPlugin(pluginCenter):null;if(!row)return;
      try{
        if(action==='trust')await pluginFacade().trust(row.id);
        else if(action==='untrust')await pluginFacade().untrust(row.id);
        else if(row.quarantine.active)await pluginFacade().releaseQuarantine(row.id);
        else await pluginFacade().quarantine(row.id,t('screen.plugins.manualQuarantine'));
        await loadPluginCenter(row.id);
      }catch(error){addLocal(screenErrorText(error,act('screen.action.plugin',{action})));}
    };
    const memoryFacade=():ReturnType<typeof createMemoryFacade>=>memoryFacadeRef.current??=(createMemoryFacade({projectRoot,paths}));
    /* stage 7.22 (mockup memory; owner 03/10): Project = the lines of the instruction files TALOS loaded (props.loadedFiles,
       read again so a change shows) and the memories of kind fact, procedure or rule; You = the preferences */
    const openMemory=async({tab=0,id,filter}:{tab?:number;id?:string;filter?:string}={})=>{
      try{
        const snapshot=await memoryFacade().list();
        if(snapshot.state!=='ready'){addLocal(screenErrorText({code:'MEMORY_STORE_INVALID'},act('screen.action.memoryCenter')));return;}
        const loaded=new Set(props.loadedFiles??[]);let files:ReturnType<typeof fileRows>=[];
        if(loaded.size){try{const m=await importTalosModule(findTalosRepoRoot(process.cwd()),'istruzioni-di-progetto.mjs');const found=await m.trovaIstruzioniDiProgetto(projectRoot);
          files=fileRows((Array.isArray(found)?found:[]).filter((row:any)=>loaded.has(String(row?.etichetta))).map((row:any)=>({label:String(row.etichetta),path:String(row.percorso),content:String(row.contenuto??'')})));}catch{/* the memories alone */}}
        const {project,you}=memoryRows(snapshot.rows);const tabs=[[...files,...project],you];
        const sel=id?Math.max(0,tabs[tab]!.findIndex(row=>row.id===id)):0;
        setSheet(asPage(memorySheet({project:tabs[0]!,you:tabs[1]!,tab,sel,...(filter?{filter}:{})})));
      }catch(error){addLocal(screenErrorText(error,act('screen.action.memoryCenter')));}
    };
    const loadMemoryCenter=async(query?:string,selectedId?:string)=>{
      try{
        const snapshot=query===undefined?await memoryFacade().list():await memoryFacade().search(query);
        const found=selectedId?snapshot.rows.findIndex(row=>row.id===selectedId):-1;
        const selected=found>=0?found:memoryCenter?.selected??0;
        setMemoryCenter(createMemoryCenterModel(snapshot,selected));
      }catch(error){addLocal(screenErrorText(error,act('screen.action.memoryCenter')));}
    };
    const notesFacade=():ReturnType<typeof createNotesFacade>=>notesFacadeRef.current??=(createNotesFacade({projectRoot,paths}));
    /* stage 7.20 (owner 03/10): /notes is the mockup's sheet, the note drawn as Markdown beside the list; a reload keeps the row in view */
    const loadNotesCenter=async(selectedId?:string)=>{
      try{
        const snapshot=await notesFacade().list();
        if(snapshot.state!=='ready'){addLocal(screenErrorText({code:'NOTES_STORE_INVALID'},act('screen.action.notesCenter')));return;}
        const open=sheetRef.current?.name==='notes'?sheetRef.current.panel.tabs[0]!.body:null;
        const found=selectedId?snapshot.rows.findIndex(row=>row.id===selectedId):-1;
        const sel=found>=0?found:open?.kind==='list'?open.sel:0;
        setSheet(asPage(notesSheet(noteViews(snapshot.rows),{sel})));
      }catch(error){addLocal(screenErrorText(error,act('screen.action.notesCenter')));}
    };
    const tasksFacade=():ReturnType<typeof createTaskBoardFacade>=>tasksFacadeRef.current??=(createTaskBoardFacade({projectRoot,paths}));
    /* stage 7.19 (owner 03/10): /tasks is the mockup's sheet, the board's detail beside the list; a reload keeps the row in view */
    const loadTasksCenter=async(selectedId?:string)=>{
      try{
        const snapshot=await tasksFacade().list();
        if(snapshot.state!=='ready'){addLocal(screenErrorText({code:'TASK_BOARD_INVALID'},act('screen.action.taskBoard')));return;}
        const open=sheetRef.current?.name==='tasks'?sheetRef.current.panel.tabs[0]!.body:null;
        const found=selectedId?snapshot.rows.findIndex(row=>row.id===selectedId):-1;
        const sel=found>=0?found:open?.kind==='list'?open.sel:0;
        const filterAt=open?.kind==='list'?open.filterAt??0:0;
        setSheet(asPage(tasksSheet(taskViews(snapshot.rows),{sel:filterAt&&found>=0?open?.kind==='list'?open.sel:0:sel,filterAt})));
      }catch(error){addLocal(screenErrorText(error,act('screen.action.taskBoard')));}
    };
    const libraryFacade=():ReturnType<typeof createLibraryFacade>=>libraryFacadeRef.current??=(createLibraryFacade({projectRoot,paths}));
    /* stage 7.23 (mockup library; owner 03/10): the library's files with their size, kind and first lines; a reload keeps the row */
    const libraryRowsRef=React.useRef([] as Awaited<ReturnType<ReturnType<typeof libraryFacade>['list']>>['rows']);
    const libraryPreviewsRef=React.useRef(new Map<string,Awaited<ReturnType<ReturnType<typeof libraryFacade>['preview']>>|null>());
    const readChosenPreview=()=>{
      const open=sheetRef.current,body=open?.panel.tabs[0]?.body;if(open?.name!=='library'||body?.kind!=='list')return;
      const id=listItems(body)[body.sel]?.id;if(!id||libraryPreviewsRef.current.has(id))return;
      void libraryFacade().preview(id).catch(()=>null).then(preview=>{
        libraryPreviewsRef.current.set(id,preview);
        const now=sheetRef.current,list=now?.panel.tabs[0]?.body;if(now?.name!=='library'||list?.kind!=='list')return;
        const fresh=librarySheet(libraryRows(libraryRowsRef.current,libraryPreviewsRef.current),{sel:list.sel}),body=fresh.panel.tabs[0]!.body;
        setSheet({...now,panel:{...now.panel,tabs:[{...now.panel.tabs[0]!,body:{...body,sel:list.sel,...(list.filter!==undefined?{filter:list.filter}:{}),...(list.filtering?{filtering:true}:{})} as typeof list}]}});
      });
    };
    const openLibrary=async(id?:string)=>{
      try{
        const snapshot=await libraryFacade().list();
        if(snapshot.state!=='ready'){addLocal(screenErrorText({code:'LIBRARY_STORE_INVALID'},act('screen.action.libraryCenter')));return;}
        /* owner 01/11: the list opens at once; a file is read when its row is chosen, and kept */
        libraryRowsRef.current=snapshot.rows;
        const open=sheetRef.current?.name==='library'?sheetRef.current.panel.tabs[0]!.body:null;
        const found=id?snapshot.rows.findIndex(row=>row.id===id):-1;
        setSheet(asPage(librarySheet(libraryRows(snapshot.rows,libraryPreviewsRef.current),{sel:found>=0?found:open?.kind==='list'?open.sel:0})));
        readChosenPreview();
      }catch(error){addLocal(screenErrorText(error,act('screen.action.libraryCenter')));}
    };
    const loadLibraryCenter=async(selectedId?:string)=>{
      try{
        const snapshot=await libraryFacade().list();
        const found=selectedId?snapshot.rows.findIndex(row=>row.id===selectedId):-1;
        const selected=found>=0?found:libraryCenter?.selected??0;
        setLibraryCenter(createLibraryCenterModel(snapshot,selected));
      }catch(error){addLocal(screenErrorText(error,act('screen.action.libraryCenter')));}
    };
    const forgeFacade=():ReturnType<typeof createForgeFacade>=>forgeFacadeRef.current??=createForgeFacade({forgeRoot:join(paths.dataRoot,'forge')},{registry});
    const loadForgeCenter=async(selectedId?:string)=>{
      try{const snapshot=await forgeFacade().list();const found=selectedId?snapshot.rows.findIndex(row=>row.id===selectedId):-1;const selected=found>=0?found:forgeCenter?.selected??0;const base=createForgeCenterModel(snapshot,selected);setForgeCenter(base);const row=snapshot.rows[selected];if(row){const detail=await forgeFacade().read(row.id);setForgeCenter((current:ForgeCenterModel|null)=>current?setForgeCenterDetail(current,detail):current);}}
      catch(error){addLocal(screenErrorText(error,act('screen.action.forgeCenter')));}
    };
    const automationFacade=():ReturnType<typeof createAutomationFacade>=>automationFacadeRef.current??=createAutomationFacade({projectRoot,dataRoot:paths.dataRoot});
    const loadAutomationCenter=async(selectedId?:string)=>{
      try{const snapshot=await automationFacade().list();const found=selectedId?snapshot.rows.findIndex(row=>row.id===selectedId):-1;const selected=found>=0?found:automationCenter?.selected??0;const base=createAutomationCenterModel(snapshot,selected);setAutomationCenter(base);const row=snapshot.rows[selected];if(row){const detail=await automationFacade().read(row.id);setAutomationCenter((current:AutomationCenterModel|null)=>current?setAutomationCenterDetail(current,detail):current);}}
      catch(error){addLocal(screenErrorText(error,act('screen.action.automationCenter')));}
    };
    const researchFacade=():ReturnType<typeof createResearchFacade>=>researchFacadeRef.current??=createResearchFacade({projectRoot},{registry});
    const loadResearchCenter=async(selectedId?:string)=>{
      try{
        const snapshot=await researchFacade().list();const found=selectedId?snapshot.rows.findIndex(row=>row.id===selectedId):-1;const selected=found>=0?found:researchCenter?.selected??0;const base=createResearchCenterModel(snapshot,selected);setResearchCenter(base);
        const row=snapshot.rows[selected];if(row){const detail=await researchFacade().read(row.id);setResearchCenter((current:ResearchCenterModel|null)=>current?setResearchCenterDetail(current,detail):current);}
      }catch(error){addLocal(screenErrorText(error,act('screen.action.researchCenter')));}
    };

    /* Owner 2026-09-25 ("after a restart /effort says the model declares no levels, though I set one with the same model"):
       the rows TALOS already knows (catalog.listModels, read at startup and by `/model <id>`) may lack a model's levels that
       the provider's live list (catalog.providerModels, what the /model picker reads) has. Asked only when levels are missing. */
    const modelMetaWithLevels=async(id:string,known:TuiModel|null):Promise<TuiModel|null>=>{
      if(known&&reasoningEffortChoices(known).length)return known;
      const provider=providerOfModel(id);
      if(!provider||typeof catalog?.providerModels!=='function')return known;
      try{return (await catalog.providerModels(provider)).rows.find((candidate:TuiModel)=>candidate.id===id)??known;}catch{return known;}
    };
    const applyConfiguredReasoningDefault=(row:TuiModel|null)=>{
      const supported=Boolean(reasoningEffort&&row?.reasoning===true&&row.reasoningEfforts?.includes(reasoningEffort));
      if(typeof runtime.setDefaultReasoningEffort==='function')runtime.setDefaultReasoningEffort(supported?reasoningEffort:null);
      if(reasoningEffort&&!supported){setReasoningEffort(null);addLocal(t('screen.effort.notAffirmed',{effort:reasoningEffort,model:row?.id??controller.model()}));}
    };

    /* RICERCA 5×5×5×5 cambio-modello (dossier §5.3): /model on a LIVE session persists the choice on the kernel's
       sanctioned channel (`aggiornaImpostazioni{modello}`, durable record) — before, the choice died in the
       controller's local variable and the next resumed run went back to the saved model. Between turns only: a run
       in flight already chose its model (Codex `backend_banner_fallback.rs:22`). No session open = nothing to
       persist; the choice still governs the next /start (existing behavior, unchanged). */
    const persistLiveSessionModel=async(modelId:string,prima:string)=>{
      const sessionId=state.sessionId;if(!sessionId)return;
      if(typeof runtime.setSessionModel!=='function')return;
      try{await runtime.setSessionModel(sessionId,modelId);}
      catch(error){
        /* review B #6 (2026-10-06): commitModelSelection ha già applicato il modello sul controller; se la persistenza
           durevole fallisce, il controller torna al modello SALVATO — picker, status e prossimo /start restano su una
           verità sola, invece di mostrare un cambio che non è avvenuto. Desktop review block 11 (REV-B11-E10b): `prima` is
           read by the caller BEFORE commitModelSelection (read here it was already the refused model, and the rollback never
           ran); and a newer snapshot that came in meanwhile (a device's change) already set the controller: it stays. */
        if(prima&&prima!==modelId&&controller.model()===modelId)controller.setModel(prima);
        throw error;
      }
    };
    /* Desktop review block 11 E-R1 (contract §F.3 point 5): after this window's own model request, the status row shows the
       model the controller holds, which a newer snapshot from a device may have set while the request was in flight */
    const modelAfterOwnRequest=(asked:string)=>controller.model()||asked;
    /* The effort chosen on the line of nodes, from /model's second step or from /effort (R5a, owner 2026-09-24). */
    /* a model without reasoning levels: used as it is, no effort kept (the picker and the /model sheet share it) */
    const useModelWithoutEffort=async(row:TuiModel):Promise<boolean>=>{
      try{
        const prima=controller.model();
        await commitModelSelection({id:row.id,catalog,setControllerModel:(id:string)=>controller.setModel(id)});
        await persistLiveSessionModel(row.id,prima);
        if(typeof runtime.setDefaultReasoningEffort==='function')runtime.setDefaultReasoningEffort(null);
        const shown=modelAfterOwnRequest(row.id);
        if(shown===row.id){setReasoningEffort(null);setCurrentModelMeta(row);}
        setState((current:TuiState)=>localMessage({...current,status:{...current.status,model:shown}},t('screen.model.changedNoEffort',{model:row.id})));
        return true;
      }catch(error){addLocal(screenErrorText(error,act('screen.action.modelChange')));return false;}
    };
    const applyEffortChoice=async(row:TuiModel,choice:ReasoningEffortChoice)=>{effortChosenRef.current=true;const sameLiveModel=Boolean(state.sessionId&&state.status.model===row.id);
          try{
            const prima=controller.model();
            await commitModelSelection({id:row.id,catalog,setControllerModel:(id:string)=>controller.setModel(id)});
            await persistLiveSessionModel(row.id,prima);
            /* E-R1: a device's newer model that came in meanwhile stays on the status row and in the model's levels */
            const shown=modelAfterOwnRequest(row.id),mine=shown===row.id;
            if(choice==='default'){
              await configUnset({paths,projectRoot,scope:'project-user',path:'reasoningEffort'});
              if(typeof runtime.setDefaultReasoningEffort==='function')runtime.setDefaultReasoningEffort(null);
              const retainedLiveEffort=sameLiveModel?reasoningEffort:null;
              if(mine){setReasoningEffort(retainedLiveEffort);setCurrentModelMeta(row);}
              setState((current:TuiState)=>localMessage({...current,status:{...current.status,model:shown}},retainedLiveEffort
                ?t('screen.model.changedEffortClearedKept',{model:row.id,effort:retainedLiveEffort})
                :t('screen.model.changedEffortCleared',{model:row.id})));
            }else{
              await configSet({paths,projectRoot,scope:'project-user',path:'reasoningEffort',value:choice});
              if(typeof runtime.setDefaultReasoningEffort==='function')runtime.setDefaultReasoningEffort(choice);
              if(sameLiveModel&&typeof runtime.setReasoningEffort==='function')await runtime.setReasoningEffort(state.sessionId!,choice);
              if(mine){setReasoningEffort(choice);setCurrentModelMeta(row);}
              setState((current:TuiState)=>localMessage({...current,status:{...current.status,model:shown}},t(sameLiveModel?'screen.model.changedEffortSession':'screen.model.changedEffort',{model:row.id,effort:choice})));
            }
            closeCurrentOverlay();
          }catch(error){addLocal(screenErrorText(error,act('screen.action.effortChange')));}
    };
    /* R5b D2 (owner decision Q-R5-12, R5 gate §5.1): /clear, and every resume or fork, start from an empty view; the session
       attached then redraws its own history once (a fork drew the earlier conversation twice: the old view, then the replay). */
    const freshView=()=>{setClearedIds(null);setState(freshConversationView);setDiff('');setTranscriptRevealId(null);setViewport((view:TranscriptViewport)=>({...view,offset:0,unseen:0,followingTail:true}));};
    freshViewRef.current=freshView;
    const openShelf=async(tab:number)=>{
      const folders=(await listTrustedFolders(paths.trust.projects).catch(()=>[])).map(row=>row.path);
      /* C11c (A2): the other three filters of «Where we work»; the module is loaded with the page, never at the start (MAPPA-RIDISEGNO §4) */
      const picks=await import('../workspace/places.ts').then(places=>places.newSessionPlaces({sessions:barSessions,known:[projectRoot,...folders]})).catch((error:unknown)=>{developmentLogError('tui.shelf.places',error,{},'tui-app');return null;});
      void automationFacade().list().then(snapshot=>setShelfAutomations(snapshot.rows)).catch((error:unknown)=>developmentLogError('tui.shelf.automations',error,{},'tui-app'));
      const mode=controller.mode(),efforts=currentModelMeta?reasoningEffortChoices(currentModelMeta):[];
      const named=state.status.model||'',colon=named.indexOf(':');
      const how={model:!named?t('screen.welcome.noModel'):colon>0?`${named.slice(colon+1)} · ${named.slice(0,colon)}`:named,efforts,effort:efforts.includes(reasoningEffort as any)?String(reasoningEffort):efforts[0]??'',mode:mode==='plan'?baseMode:mode,plan:mode==='plan'};
      /* FE-052: in the session's plain mode (run.ts plans it the same way) the shelf is the list in words, for a screen reader */
      setSheet(shelfSheet({data:()=>shelfDataRef.current,mode:{color:capabilities.color&&terminalTrueColor(process.env),unicode:capabilities.unicode,plain:createTerminalSessionPlan({capabilities,env:process.env}).mode==='plain'},colors:()=>shelfColorsRef.current},undefined,{tab,current:basename(projectRoot),here:projectRoot,folders,how,picks}));
    };
    const runSlash=async(text:string)=>{
      /* Startup stage 1 (owner 02/10): a command typed before the catalog's first answer waits for it, so it never acts on
         «not loaded yet» as on «nothing configured» (s38: /model opened the provider setup). */
      const shown=selectionShownRef.current;
      if(shown&&!shown.done){await shown.promise;return executeSlashRef.current(text);}
      const parsed=parseSlashCommand(text);setAuxCompletions([]);
      if(!SLASH_COMMANDS.some(command=>command.name===parsed.name)){addLocal(parsed.suggestions.length?t('screen.slash.unknownSuggest',{name:parsed.name,suggestions:parsed.suggestions.map(value=>`/${value}`).join(', ')}):t('screen.slash.unknown',{name:parsed.name}));return;}
      /* P17 (owner decision 4): /setup runs the guided setup again, from the provider. */
      if(parsed.name==='setup'){await startSetup('provider');return;}
      const intent=slashCommandIntent(text);
      if(intent?.kind==='open-overlay'){
        /* stage 7.10: /model opens the mockup's sheet; the setup keeps its own steps */
        if(intent.overlay.kind==='model'){await loadModelSheet(intent.overlay.provider);return;}
        /* stage 7.10b: /provider opens the mockup's sheet */
        if(intent.overlay.kind==='provider'){await loadProviderSheet();return;}
        if(intent.overlay.kind==='session'){await loadSessions(intent.overlay.action);return;}
        /* stage 7.17: /help is the mockup's sheet (the ? key keeps its card of keys, as the mockup) */
        if(intent.overlay.kind==='help'){setSheet(asPage(helpSheet(helpCommands(),{version:CLI_VERSION.split('.').slice(0,2).join('.'),keymap:effectiveKeymap})));return;}
        applyOverlay(intent.overlay);return;
      }
      if(intent?.kind==='key-action'){runKeyAction(intent.action);return;}
      if(intent?.kind==='select-model'){
        if(!MODEL_ID.test(intent.id)){addLocal(t('screen.usage.model'));return;}
        const providerId=providerOfModel(intent.id);
        try{
          const row=(await catalog.listProviders()).find((entry:TuiProvider)=>entry.id===providerId);
          if(!row){addLocal(t('screen.model.unknownProvider',{provider:String(providerId)}));return;}
          if(!row.configured){
            if(row.requiresKey){const refusal=unusableKeyRefusal(row.id,row.benched);addLocal(refusal.message);}
            else addLocal(t('screen.model.configureFirst',{provider:row.label}));
            return;
          }
          const probe=await catalog.probeProvider(row.id);
          if(probe.readinessCode){addLocal(probe.remediation?.message||probe.detail||t('screen.provider.notReady',{provider:row.label}));return;}
          if(probe.remediation&&probe.remediation.code!=='none')addLocal(probe.remediation.message);
          if(chosenProvider!==row.id){await catalog.chooseProvider(row.id);setChosenProvider(row.id);}
        }catch(error){addLocal(screenErrorText(codeOnly(error),act('screen.action.modelChange')));return;}
        try{const prima=controller.model();await selectExplicitModel(intent.id,catalog,(id:string)=>controller.setModel(id));await persistLiveSessionModel(intent.id,prima);const shown=modelAfterOwnRequest(intent.id);setState((current:TuiState)=>localMessage({...current,status:{...current.status,model:shown}},t('screen.model.changed',{model:intent.id})));if(shown!==intent.id)return;const rows=await catalog.listModels({provider:providerId??undefined});const meta=await modelMetaWithLevels(intent.id,rows.find(row=>row.id===intent.id)??null);setCurrentModelMeta(meta);applyConfiguredReasoningDefault(meta);}catch(error){addLocal(screenErrorText(error,act('screen.action.modelChange')));}return;
      }
      if(intent?.kind==='session-id'){
        try{freshView();const id=await changeSession(intent.action,intent.id);addLocal(intent.action==='resume'?t('screen.session.attached',{id}):t('screen.session.forked',{from:intent.id,id}));}catch(error){addLocal(screenErrorText(error,act(intent.action==='resume'?'screen.action.resume':'screen.action.fork')));}return;
      }
      if(parsed.name==='forge'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'||operation==='inspect'){const id=operation==='inspect'?parsed.args[1]:undefined;if(operation==='inspect'&&!id){addLocal(t('screen.usage.forgeInspect'));return;}await openForge(id??null);return;}
        if(operation==='enable'||operation==='disable'){const id=parsed.args[1],ownerSessionId=state.sessionId;if(!id||!ownerSessionId){addLocal(t('screen.forge.needsSessionAndTool'));return;}try{await forgeFacade().setEnabled(ownerSessionId,id,operation==='enable');await openForge(id);}catch(error){addLocal(screenErrorText(error,act('screen.action.commandOperation',{command:'forge',operation})));}return;}
        if(operation==='rollback'){const id=parsed.args[1],revision=Number(parsed.args[2]),ownerSessionId=state.sessionId;if(!id||!Number.isSafeInteger(revision)||revision<1||!ownerSessionId){addLocal(t('screen.usage.forgeRollback'));return;}try{await forgeFacade().rollback(ownerSessionId,id,revision);await openForge(id);}catch(error){addLocal(screenErrorText(error,act('screen.action.commandOperation',{command:'forge',operation})));}return;}
        if(!['validate','scan','simulate','install','versions'].includes(operation)){addLocal(t('screen.usage.forge'));return;}
      }
      if(parsed.name==='automations'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'||operation==='read'||operation==='show'||operation==='history'){
          const id=operation==='list'?undefined:parsed.args[1];if(operation!=='list'&&!id){addLocal(t('screen.usage.automationsOperation',{operation}));return;}await openAutomations({selectedId:id??null});return;
        }
        if(operation==='calendar'){await openAutomations({tab:1});return;}
        if(operation==='health'){try{const health=await automationFacade().health();addLocal(t('screen.automation.runner',{state:String(health.state)}));}catch(error){addLocal(screenErrorText(error,act('screen.action.commandOperation',{command:'automations',operation})));}return;}
        /* 0.6.6 (owner 14/10, «Comandi ora, schermata dopo»): made and changed with `talos automation` in a terminal; the screen of the automations phase will do it here */
        addLocal(t('screen.usage.automations'));return;
      }
      if(parsed.name==='research'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'||operation==='read'){
          const id=operation==='read'?parsed.args[1]:undefined;if(operation==='list'&&parsed.args.length>1){addLocal(t('screen.usage.research'));return;}if(operation==='read'&&(!id||parsed.args.length!==2)){addLocal(t('screen.usage.researchRead'));return;}await openResearch({selectedId:id??null,tab:id?1:0});return;
        }
        if(operation==='pause'||operation==='resume'||operation==='cancel'){
          const id=parsed.args[1];if(!id||parsed.args.length!==2){addLocal(t('screen.usage.researchOperation',{operation}));return;}const ownerSessionId=state.sessionId??id;
          try{if(operation==='pause')await researchFacade().pause(ownerSessionId,id);else if(operation==='resume')await researchFacade().resume(ownerSessionId,id);else await researchFacade().cancel(ownerSessionId,id);await openResearch({selectedId:id});}catch(error){addLocal(screenErrorText(error,act('screen.action.commandOperation',{command:'research',operation})));}return;
        }
        if(operation==='export'){
          const id=parsed.args[1],format=(parsed.args[2]??'md') as ResearchExportFormat,out=parsed.args[3];if(!id||parsed.args.length>4){addLocal(t('screen.usage.researchExport'));return;}
          try{const result=await researchFacade().exportFile(id,format,out);addLocal(t('screen.research.exported',{path:result.path}));}catch(error){addLocal(screenErrorText(error,act('screen.action.commandOperation',{command:'research',operation})));}return;
        }
        if(!['start','rename','delete'].includes(operation)){addLocal(t('screen.usage.research'));return;}
        /* start/rename/delete keep the existing child-CLI behavior; live controls above never cross the process boundary. */
      }
      if(parsed.name==='library'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'){
          if(parsed.args.length>1){addLocal(t('screen.usage.library'));return;}
          await openLibrary();return;
        }
        if(!['search','read','preview','duplicates','context-ref','import','export','rename','delete','versions','restore'].includes(operation)){addLocal(t('screen.usage.library'));return;}
        /* non-list operations continue through the child CLI; runLibraryCommand uses this same facade. */
      }
      if(parsed.name==='tasks'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'){
          if(parsed.args.length>1){addLocal(t('screen.usage.tasks'));return;}
          await loadTasksCenter();return;
        }
        if(['depend','undepend','evidence','unevidence','assign','unassign','schedule','unschedule'].includes(operation)){
          const taskId=parsed.args[1],targetId=parsed.args[2];
          if(parsed.args.length!==3||!taskId||!targetId){addLocal(t('screen.usage.tasksOperation',{operation}));return;}
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
          }catch(error){addLocal(screenErrorText(error,act('screen.action.commandOperation',{command:'tasks',operation})));}
          return;
        }
        if(!['add','update','complete','delete'].includes(operation)){addLocal(t('screen.usage.tasks'));return;}
        /* add/update/complete/delete deliberately continue through the child CLI; runTasksCommand uses this same facade. */
      }
      if(parsed.name==='notes'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'){
          if(parsed.args.length>1){addLocal(t('screen.usage.notes'));return;}
          await loadNotesCenter();return;
        }
        if(operation==='link'||operation==='unlink'){
          const noteId=parsed.args[1],targetKind=parsed.args[2],targetId=parsed.args[3];
          if(parsed.args.length!==4||!noteId||!targetKind||!targetId||!['session','task','research'].includes(targetKind)){addLocal(t('screen.usage.notesOperation',{operation}));return;}
          try{
            if(operation==='link')await notesFacade().link(noteId,targetKind as NoteTargetKind,targetId);else await notesFacade().unlink(noteId,targetKind as NoteTargetKind,targetId);
            await loadNotesCenter(noteId);
          }catch(error){addLocal(screenErrorText(error,act('screen.action.commandOperation',{command:'notes',operation})));}
          return;
        }
        if(!['add','update','delete'].includes(operation)){addLocal(t('screen.usage.notes'));return;}
        /* add/update/delete deliberately continue through the existing child CLI path; runNotesCommand uses this same facade. */
      }
      if(parsed.name==='memory'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'){
          if(parsed.args.length>1){addLocal(t('screen.usage.memory'));return;}
          await openMemory();return;
        }
        if(operation==='search'){
          const query=parsed.args.slice(1).join(' ').trim();
          if(!query){addLocal(t('screen.usage.memorySearch'));return;}
          await openMemory({filter:query});return;
        }
        /* add/update/delete deliberately continue through the existing child CLI path; that command now uses this same facade. */
      }
      if(parsed.name==='mcp'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'){
          if(parsed.args.length>1){addLocal(t('screen.usage.mcp'));return;}
          await loadMcpCenter();return;
        }
        if(!['test','trust','untrust'].includes(operation)||parsed.args.length!==2){addLocal(t('screen.usage.mcp'));return;}
        const serverId=parsed.args[1]!;
        try{
          if(operation==='test'){
            const measured=await mcpFacade().probe(serverId);
            (probedRef.current??=new Map()).set(serverId,measured);
            await openCapability(2,serverId);
          }else{
            if(operation==='trust')await mcpFacade().trust(serverId);else await mcpFacade().untrust(serverId);
            await loadMcpCenter(serverId);
          }
        }catch(error){addLocal(screenErrorText(error,act('screen.action.commandOperation',{command:'mcp',operation})));}
        return;
      }
      if(parsed.name==='hooks'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'){
          if(parsed.args.length>1){addLocal(t('screen.usage.hooks'));return;}
          await loadHookCenter();return;
        }
        const hookId=parsed.args[1];
        if(!hookId){addLocal(t('screen.usage.hooks'));return;}
        try{
          if(operation==='history'){
            if(parsed.args.length>3){addLocal(t('screen.usage.hooksHistory'));return;}
            const rawLimit=parsed.args[2];let limit=8;
            if(rawLimit!==undefined){limit=Number(rawLimit);if(!Number.isSafeInteger(limit)||limit<1||limit>50){addLocal(t('screen.hooks.historyLimit'));return;}}
            const [history,rows]=await Promise.all([hookFacade().history(hookId,{limit}),hookFacade().list()]);
            const selected=Math.max(0,rows.findIndex(row=>row.id===hookId));const base=createHookCenterModel(rows,selected);const row=selectedHook(base);
            setHookCenter(row?replaceHookCenterRow(base,{...row,lastExecutions:history}):base);return;
          }
          if(operation==='dry-run'){
            const eventType=parsed.args[2];if(!eventType){addLocal(t('screen.usage.hooksDryRun'));return;}
            const action=parsed.args.length>3?parsed.args.slice(3).join(' '):null;
            const result=await hookFacade().dryRun(hookId,{eventType,action});
            const rows=await hookFacade().list();const selected=Math.max(0,rows.findIndex(row=>row.id===hookId));
            const base=createHookCenterModel(rows,selected);const row=selectedHook(base);
            setHookCenter(row?replaceHookCenterRow(base,{...row,lastDryRun:result}):base);return;
          }
          if(operation==='trust'){if(parsed.args.length!==2){addLocal(t('screen.usage.hooksTrust'));return;}await hookFacade().trust(hookId);}
          else if(operation==='untrust'){if(parsed.args.length!==2){addLocal(t('screen.usage.hooksUntrust'));return;}await hookFacade().untrust(hookId);}
          else if(operation==='quarantine'){await hookFacade().quarantine(hookId,parsed.args.length>2?parsed.args.slice(2).join(' '):null);}
          else if(operation==='release'||operation==='release-quarantine'){if(parsed.args.length!==2){addLocal(t('screen.usage.hooksRelease'));return;}await hookFacade().releaseQuarantine(hookId);}
          else{addLocal(t('screen.usage.hooks'));return;}
          await loadHookCenter(hookId);
        }catch(error){addLocal(screenErrorText(error,act('screen.action.commandOperation',{command:'hooks',operation})));}
        return;
      }
      if(parsed.name==='plugins'){
        const operation=parsed.args[0]??'list';
        if(operation==='list'){
          if(parsed.args.length>1){addLocal(t('screen.usage.plugins'));return;}
          await loadPluginCenter();return;
        }
        if(['trust','untrust','quarantine','release','release-quarantine'].includes(operation)){
          const pluginId=parsed.args[1];
          if(!pluginId){addLocal(t('screen.usage.pluginsOperation',{operation}));return;}
          try{
            if(operation==='trust'){if(parsed.args.length!==2){addLocal(t('screen.usage.pluginsTrust'));return;}await pluginFacade().trust(pluginId);}
            else if(operation==='untrust'){if(parsed.args.length!==2){addLocal(t('screen.usage.pluginsUntrust'));return;}await pluginFacade().untrust(pluginId);}
            else if(operation==='quarantine')await pluginFacade().quarantine(pluginId,parsed.args.length>2?parsed.args.slice(2).join(' '):null);
            else{if(parsed.args.length!==2){addLocal(t('screen.usage.pluginsRelease'));return;}await pluginFacade().releaseQuarantine(pluginId);}
            await loadPluginCenter(pluginId);
          }catch(error){addLocal(screenErrorText(error,act('screen.action.commandOperation',{command:'plugins',operation})));}
          return;
        }
        if(operation!=='install'&&operation!=='remove'){addLocal(t('screen.usage.plugins'));return;}
        /* install/remove deliberately continue into the existing child CLI installer path below. */
      }
      /* ASYNC step 4 (owner 01/10): leaving stops the delegated agents, so with any working /exit asks first. */
      if(parsed.name==='exit'){if(workingAgents(state.agents).length)showExitPrompt(0);else inkApp.exit();return;}
      /* stage 7.13: the mockup's sheet; «Start a new conversation» names this one as /resume will */
      if(parsed.name==='zen'||parsed.name==='essential'||parsed.name==='full'){showFrameView(parsed.name);return;}
      if(parsed.name==='sidebar'){toggleBar();return;}
      if(parsed.name==='home'){setSheet(homeSheet(shelfHomeRef.current,{unicode:capabilities.unicode}));return;}
      if(parsed.name==='new'){await openShelf(0);return;}
      if(parsed.name==='shelf'){await openShelf(2);return;}
      if(parsed.name==='panel'){
        const card=String(parsed.args[0]??'').trim().toLowerCase();
        if(!card)togglePanel();else if(card==='context'||card==='agents')openPanelCard(card);else addLocal(t('screen.slash.panelUsage'));
        return;
      }
      if(parsed.name==='clear'){
        const id=state.sessionId??controller.current()??null;let name:string|null=null;
        if(id){try{const meta=await createSessionMetadataStore({rootDir:sessionMetadataRoot(paths.dataRoot)}).get(id);name=meta?.name??meta?.firstMessage??null;}catch{/* the sheet still opens */}
          if(!name){const first=(state.transcript.items as TranscriptItem[]).find(item=>item.kind==='message'&&item.role==='user');if(first?.kind==='message')name=first.text.replace(/\s+/gu,' ').trim().slice(0,60)||null;}}
        setSheet(clearSheet(name));return;
      }
      /* R5b D7 (Q-R5-17): the R4 block, then the sandbox, the rules by scope, tasks and notes, and the usage. */
      if(parsed.name==='status'){openSettings('status');return;}
      /* ASYNC step 3 (owner 01/10): /agents opens the live list (as Alt+A); stop and show name agents by number, id or all. */
      if(parsed.name==='agents'){
        const [operation,target,...rest]=parsed.args;
        if(!operation){showAgents();return;}
        if((operation!=='stop'&&operation!=='show')||rest.length||(operation==='show'&&target?.toLowerCase()==='all')){addLocal(t('screen.usage.agents'));return;}
        try{
          const rows=agentRosterRows(await controller.agentTree());setAgentRows(rows);
          const found=resolveAgentTargets(rows,target);
          if('error' in found){addLocal(found.error==='missing'?t('screen.usage.agents'):t(found.error==='ambiguous'?'screen.agents.ambiguous':'screen.agents.unknown',{target:String(target)}));return;}
          if(operation==='stop'){await stopAgents(found.rows,{explicit:target?.toLowerCase()!=='all'});return;}
          const row=found.rows[0]!;if(row.id!==agentView?.sessionId)openAgentView(row);
        }catch(error){addLocal(screenErrorText(error,act('screen.action.agentTree')));}
        return;
      }
      if(parsed.name==='usage'){setSheet(usageSheet(await readUsageHistory(usageRecordFile(paths.dataRoot,projectRoot)),{mode:{color:capabilities.color&&terminalTrueColor(process.env),unicode:capabilities.unicode}}));return;}
      /* R5a (owner 2026-09-24): /effort opens the current model's levels as a line of nodes; /effort <level> sets one. */
      if(parsed.name==='effort'){
        let row=await modelMetaWithLevels(state.status.model,currentModelMeta);if(row!==currentModelMeta)setCurrentModelMeta(row);
        const choices=row?reasoningEffortChoices(row):[];
        if(!row||!choices.length){addLocal(t('screen.effort.none',{model:state.status.model}));return;}
        const wanted=parsed.args[0]?.toLowerCase();
        if(wanted){const choice=choices.find(level=>level===wanted);if(!choice){addLocal(t('screen.effort.invalid',{level:wanted,model:row.id,choices:choices.join(', ')}));return;}await applyEffortChoice(row,choice);return;}
        /* stage 7.3: the mockup's sheet — a slider over the levels the model offers */
        effortRowRef.current=row;setSheet(effortSheet(row.id.startsWith(`${row.provider}:`)?row.id.slice(row.provider.length+1):row.id,choices,reasoningEffort??'default'));return;
      }
      /* R5b D1 (Q-R5-12): the conversation to a file, Markdown by default, the person's messages kept. */
      /* R5b D2 (Q-R5-12): a name for this conversation, kept in the CLI's session metadata (the /resume picker shows it). */
      if(parsed.name==='rename'){
        const name=parsed.args.join(' ').trim();
        if(!state.sessionId){addLocal(t('screen.rename.noSession'));return;}
        if(!name){const saved=await createSessionMetadataStore({rootDir:sessionMetadataRoot(paths.dataRoot)}).get(state.sessionId).catch(()=>null);setSheet(renameSheet(saved?.name??''));return;}
        try{const store=createSessionMetadataStore({rootDir:sessionMetadataRoot(paths.dataRoot)});if(name==='--clear'){await store.setName(state.sessionId,null);addLocal(t('screen.rename.cleared'));}else{const saved=await store.setName(state.sessionId,name);addLocal(t('screen.rename.done',{name:saved.name??name}));}}
        catch(error:any){addLocal(error?.code==='SESSION_METADATA_INVALID'?t('screen.usage.rename'):screenErrorText(error,act('screen.action.command',{command:'rename'})));}
        return;
      }
      /* R5b D4 (Q-R5-14): /theme opens the picker (the arrows preview); /theme <name> sets one at once. */
      /* R5b (owner 2026-09-25): the messages sent in this project, newest first; choosing one fills the composer. */
      /* stage 7.4: /history opens the mockup's sheet; Ctrl+R keeps the quick search */
      if(parsed.name==='history'){setSheet(historySheet(history));return;}
      /* R5b (Q-R5-19): the person's last message, sent again through the same path as Enter (queue, steer, readiness). */
      if(parsed.name==='retry'){
        const last=[...state.transcript.items].reverse().find((item:TranscriptItem)=>item.kind==='message'&&item.role==='user') as {text:string}|undefined;
        if(!last?.text.trim()){addLocal(t('screen.retry.none'));return;}
        setSheet(retrySheet(last.text));return;
      }
      /* R5b (Q-R5-19): an answer to the clipboard through the terminal (OSC 52, as Alt+C); the notice says what that means. */
      if(parsed.name==='copy'){
        /* stage 7.15: the command alone is the mockup's sheet; /copy N still copies the Nth answer back at once */
        if(parsed.args[0]===undefined){
          const answers=(state.transcript.items as TranscriptItem[]).filter(item=>item.kind==='message'&&item.role==='assistant'&&item.text.trim()).map(item=>(item as {text:string}).text).reverse();
          if(!answers.length){addLocal(t('screen.copy.noAnswer'));return;}
          setSheet(copySheet(answers));return;
        }
        const nth=Number(parsed.args[0]);
        if(parsed.args.length>1||!Number.isSafeInteger(nth)||nth<1){addLocal(t('screen.usage.copy'));return;}
        const answers=state.transcript.items.filter((item:TranscriptItem)=>item.kind==='message'&&item.role==='assistant'&&item.text.trim()) as Array<{text:string}>;
        if(!answers.length){addLocal(t('screen.copy.noAnswer'));return;}
        const answer=answers[answers.length-nth];if(!answer){addLocal(tn('screen.copy.noSuchAnswer',answers.length));return;}
        try{stdout.write(osc52CopySequence(answer.text));addLocal(t('screen.copy.answer',{n:nth,chars:answer.text.length.toLocaleString('en-US')}));}
        catch(error){addLocal(screenErrorText(error,act('screen.action.copy')));}
        return;
      }
      /* R5b D3 (Q-R5-13): this conversation's checkpoints with their files; never while a turn runs. */
      if(parsed.name==='undo'){
        if(state.running){addLocal(t('screen.undo.busy'));return;}
        const store=checkpointStoreFor();if(!store){addLocal(t('screen.undo.unavailable'));return;}
        /* A resumed conversation is known to the controller before its first event reaches the state. */
        const undoSession=state.sessionId??controller.current()??null;
        if(!undoSession){addLocal(t('screen.undo.none'));return;}
        try{
          /* stage 7.8: the mockup's sheet — every point of the conversation, with the files that go back */
          let turns:ReturnType<typeof sessionTurns>=[];try{turns=sessionTurns((runtime.export(undoSession) as any)?.eventi);}catch{/* points named by time only */}
          const points=await undoPoints(store,await sessionCheckpoints(store,undoSession),turns);sheetPointsRef.current=points;
          setSheet(undoSheet(points,{canCut:runtime.capabilities?.().forkBeforeRun===true}));
        }catch(error){addLocal(screenErrorText(error,act('screen.action.command',{command:'undo'})));}
        return;
      }
      if(parsed.name==='config'){openSettings('config');return;}
      /* Form B: the folder enters trust, instructions, hooks and connections once, at the start (relaunch.ts): /trust starts TALOS again here, and the card is the first thing it asks */
      if(parsed.name==='trust'){
        if(!projectUntrusted){addLocal(t('screen.trust.alreadyOpen'));return;}
        if(state.running){addLocal(t('screen.trust.waitTurn'));return;}
        requestRelaunch(projectRoot);inkApp.exit();return;
      }
      /* T4: pair a device with this computer, in a card over the conversation (remote-card.ts) */
      if(parsed.name==='remote'){startRemotePairing();return;}
      if(parsed.name==='devices'){await openDevices();return;}
      if(parsed.name==='processes'){await openProcesses();return;}
      if(parsed.name==='theme'){
        const wanted=parsed.args.join(' ').trim();
        if(!wanted){setThemePicker({selected:Math.max(0,PAGE_THEMES.indexOf(themeStore.getSnapshot().id)),original:themeStore.getSnapshot().id});return;}
        const id=parseThemeChoice(wanted);
        if(!id){addLocal(t('screen.theme.invalid',{name:wanted,choices:THEME_CHOICES.join(', ')}));return;}
        keepTheme(id);return;
      }
      /* stage 7.7: /export alone opens the mockup's sheet; with a format or a file it acts at once, as before */
      if(parsed.name==='export'&&!parsed.args.length){
        const id=state.sessionId??controller.current()??null;const payload=id?runtime.export(id) as any:null;
        if(!id||!payload){addLocal(t('screen.export.nothing'));return;}
        const meta=await createSessionMetadataStore({rootDir:sessionMetadataRoot(paths.dataRoot)}).get(id).catch(()=>null);
        setSheet(exportSheet({messages:sessionDigest(payload.eventi).messages,file:exportFileName(meta?.name??meta?.firstMessage??'',id,'md')}));return;
      }
      if(parsed.name==='export'){
        try{const done=await exportSession({runtime,sessionId:state.sessionId,projectRoot,args:parsed.args,secrets:secretValuesFromEnvironment(process.env)});addLocal(t('screen.export.saved',{format:done.format,path:done.path}));}
        catch(error:any){addLocal(error?.code==='EXPORT_USAGE'?t('screen.usage.export'):error?.code==='SESSION_NOT_FOUND'?t('screen.export.nothing'):screenErrorText(error,act('screen.action.command',{command:'export'})));}
        return;
      }
      if(parsed.name==='busy'){if(!parsed.args.length){setSheet(busySheet(prefs.currentBusyInput()));return;}const out=busyCommand(parsed.args,prefs.currentBusyInput());if(out.mode)prefs.setBusyInput(out.mode);addLocal(out.text);return;}
      if(parsed.name==='queue'){
        const operation=parsed.args[0]??'show';
        if(operation==='clear'){try{const dropped=await controller.clearQueue();setQueueEditor(null);addLocal(dropped.length?tn('screen.queue.cleared',dropped.length):t('screen.queue.empty'));}catch(error){addLocal(screenErrorText(error,act('screen.action.queueClear')));}return;}
        if(operation==='run'){
          if(state.running){addLocal(t('screen.queue.busy'));return;}
          try{if(!controller.queue().length){addLocal(t('screen.queue.empty'));return;}await controller.dispatchQueue();addLocal(t('screen.queue.resumed'));}catch(error){addLocal(screenErrorText(error,act('screen.action.queueDispatch')));}return;
        }
        if(operation!=='show'){addLocal(t('screen.usage.queue'));return;}
        /* stage 7.14: the mockup's sheet, its empty state included */
        setSheet(queueSheet(queueSheetEntries()));return;
      }
      if(parsed.name==='context'){await openContextPage();return;}
      if(parsed.name==='board'){await openBoard();return;}
      if(parsed.name==='projects'){await openProjects();return;}
      if(parsed.name==='capability'){await openCapability(0);return;}
      if(parsed.name==='models'){await loadProviderSheet();return;}
      if(parsed.name==='transcript'){openTranscript();return;}
      if(parsed.name==='permissions'){
        /* stage 7.21 (owner 03/10): the project's trust is /permissions trust; /permissions alone is the mockup's sheet */
        if(parsed.args.length===1&&parsed.args[0]==='trust'){await loadTrustCenter();return;}
        try{const dry=permissionDryRunSlash(parsed.args,permissionRules??{allow:[],ask:[],deny:[]},projectRoot,{mode:controller.mode(),classifySecret:kernelSecretClassifier(findTalosRepoRoot(process.cwd()),projectRoot),...(autoClassifier?{classifier:autoClassifier}:{})});if(dry!==null){addLocal(await dry);return;}}
        catch(error){addLocal(screenErrorText(error,act('screen.action.permissionDryRun')));return;}
        await openPermissions();return;
      }
      if(parsed.name==='plan'){
        /* stage 7.3: /plan opens its sheet (mockup); Shift+Tab still cycles the modes */
        if(!parsed.args.length){setSheet(planSheet(controller.mode()==='plan'));return;}
        const next=togglePlanMode(controller.mode(),baseMode);
        try{await controller.setMode(next);const held=controller.mode();setState((current:TuiState)=>{const shown={...current,status:{...current.status,permissionMode:held}};return held===next?localMessage(shown,t(next==='plan'?'screen.plan.enabled':'screen.plan.disabled')):shown;});}
        catch(error){addLocal(screenErrorText(error,act('screen.action.permissionMode')));}
        return;
      }
      /* stage 7.16 (mockup diff; owner 03/10): Now is git diff HEAD with the untracked files («new»), By turn what each of your
         messages changed, from the checkpoints /undo keeps */
      if(parsed.name==='diff'){
        /* Git sicuro: this read runs none of the folder's own commands, and a folder that cannot say which it brings is not read */
        const safe=await safeGitArgs(projectRoot).catch(()=>null);if(safe===null){addLocal(t('panel.diff.notGit'));return;}
        const diffArgs=await safeGitDiffArgs();
        const git=(args:string[])=>execFileAsync('git',[...safe,...args],{cwd:projectRoot,windowsHide:true,maxBuffer:8*1024*1024}).then((result:any)=>String(result.stdout??''));
        try{await git(['rev-parse','--is-inside-work-tree']);}catch{addLocal(t('panel.diff.notGit'));return;}
        let branch:string|null=null;try{const name=(await git(['rev-parse','--abbrev-ref','HEAD'])).trim();branch=name&&name!=='HEAD'?name:null;}catch{/* no commit yet */}
        /* a repository with no commit has no HEAD: what is staged is the change */
        let text='';try{text=await git(['diff','HEAD',...diffArgs,'--no-color','--unified=3']);}catch{try{text=await git(['diff','--cached',...diffArgs,'--no-color','--unified=3']);}catch{/* nothing readable */}}
        const files=gitDiffFiles(text);
        let untracked:string[]=[];try{untracked=(await git(['ls-files','--others','--exclude-standard','-z'])).split('\0').filter(Boolean);}catch{/* none listed */}
        for(const rel of untracked.slice(0,200)){
          let content:string|null=null;
          try{const data=await readFile(join(projectRoot,rel));content=data.length>512*1024||data.includes(0)?null:data.toString('utf8');}catch{content=null;}
          files.push(untrackedDiffFile(rel.replace(/\\/gu,'/'),content));
        }
        let turns:Awaited<ReturnType<typeof turnDiffs>>=[];
        const id=state.sessionId??controller.current()??null;const store=checkpointStoreFor();
        if(id&&store){try{let said:ReturnType<typeof sessionTurns>=[];try{said=sessionTurns((runtime.export(id) as any)?.eventi);}catch{/* turns named by kind only */}turns=await turnDiffs(store,await sessionCheckpoints(store,id),said);}catch{/* By turn says none */}}
        /* B2: Review is a page of the centre, under the header */
        setSheet(asPage(diffSheet({sub:diffSubtitle(branch,files),files,turns})));return;
      }
      /* stage 7.9: /compact runs in the mockup's sheet — the real steps, the summary's time, then before → after. Esc closes
         the sheet and the compaction goes on; its notice comes all the same. */
      if(parsed.name==='compact'){
        const id=state.sessionId??controller.current()??null;
        let messages=0;try{messages=id?sessionDigest((runtime.export(id) as any)?.eventi).messages:0;}catch{/* counted as none */}
        const base={messages,tokensBefore:contextStatus?.measurement?.inputTokens??null,tokensAfter:null};
        const started=Date.now();const showing=()=>sheetRef.current?.name==='compact';
        setSheet(compactSheet({...base,phase:'summary',elapsedMs:0}));
        const clock=setInterval(()=>{if(showing())setSheet(compactSheet({...base,phase:'summary',elapsedMs:Date.now()-started}));},1000);
        try{
          const result:any=await controller.compact();clearInterval(clock);
          /* 0.6.13 D5: «already» only for nothing to compact; any other `false` is the failed sheet with its reason and code */
          const outcome=compactResultView(result);
          if(outcome.kind==='already'){if(showing())setSheet(compactSheet({...base,phase:'already',elapsedMs:Date.now()-started}));addLocal(withWindowNote(compactAlreadyText(outcome),result));return;}
          if(outcome.kind==='failed'){if(showing())setSheet(compactSheet({...base,phase:'failed',elapsedMs:Date.now()-started,error:{headline:outcome.headline,...(outcome.todo?{todo:outcome.todo}:{})}}));addLocal(withWindowNote(outcome.text,result));return;}
          const before=typeof result?.tokenPrima==='number'?result.tokenPrima:base.tokensBefore,after=typeof result?.tokenDopo==='number'?result.tokenDopo:null;
          if(showing())setSheet(compactSheet({...base,tokensBefore:before,tokensAfter:after,phase:'done',elapsedMs:Date.now()-started}));
          addLocal(withWindowNote(before!==null&&after!==null?t('panel.compact.notice',{before:compactTokens(before),after:compactTokens(after)}):t('screen.compact.done'),result));
        }catch(error){
          clearInterval(clock);
          if(compactNothingToDo(error)){if(showing())setSheet(compactSheet({...base,phase:'already',elapsedMs:Date.now()-started}));addLocal(t('screen.compact.already'));return;}
          const view=describeError(error);
          if(showing())setSheet(compactSheet({...base,phase:'failed',elapsedMs:Date.now()-started,error:{headline:view.what,...(view.todo?{todo:view.todo}:{})}}));
          addLocal(screenErrorText(error,act('screen.action.command',{command:'compact'})));
        }
        return;
      }
      try{const local=await runControllerSlashAction(parsed.name,controller);if(local!==null){addLocal(local);return;}}catch(error){addLocal(screenErrorText(error,act('screen.action.command',{command:parsed.name})));return;}
      /* C9: /doctor alone is a page; with its options it stays the command it was */
      if(parsed.name==='doctor'&&!parsed.args.length){await openDoctor();return;}
      const cliArgs=slashCommandToCliArgs(parsed.name,parsed.args);
      /* ⛔ B1 slice 18: the child runs with TALOS_ENVIRONMENT_KEYS=consent, so a command started from this screen never uses an
         environment key the person has not approved here, whatever this process's own environment says. */
      if(cliArgs){try{const entry=process.argv[1];if(!entry)throw new Error('CLI_ENTRY_UNAVAILABLE');const result=await execFileAsync(process.execPath,[entry,'--project',projectRoot,'--no-color',...cliArgs],{windowsHide:true,maxBuffer:512*1024,env:screenChildEnvironment(process.env)});addLocal(String(result.stdout||result.stderr||t('screen.word.ok')).trim());}catch(error:any){
        /* The child CLI already printed its failure in the error anatomy (errors.ts): it is shown under one headline; a
           child that could not start at all is described like any other error. */
        const printed=String(error?.stderr??'').trim();addLocal(printed?`${t('screen.slash.childFailed',{name:parsed.name})}\n${printed}`:screenErrorText(error,act('screen.action.command',{command:parsed.name})));}return;}
      addLocal(t('screen.slash.notAvailable',{name:parsed.name}));
    };

    /* a command that opens a page and reads: the page's own title, and what it is loading */
    const executeSlash=(text:string)=>{
      const words=LOADING_WORDS[text.trim().slice(1)];
      const said=(error:unknown)=>{addLocal(screenErrorText(error,act('screen.action.command',{command:text.trim().slice(1).split(/\s/u)[0]??''})));};
      return(words?withLoadingPage(t(words[0]),t(words[1]),()=>runSlash(text)):runSlash(text)).catch(said);
    };
    executeSlashRef.current=executeSlash;
    /* R5a Q-R5-8: a command that changes the session waits for the turn, in the same queue as the prompts. */
    const deferSlashCommand=async(text:string)=>{const name=parseSlashCommand(text).name;try{await controller.deferSlash(text,{running:state.running});addLocal(t('screen.busyInput.queuedSlash',{name}));}catch(error){addLocal(screenErrorText(error,act('screen.action.command',{command:name})));}};

    /* Alt+S, and Enter in the `steer` busy mode (Q-R5-7): the draft steers the running turn; it leaves the composer only once
       the runtime took it. */
    const steerDraft=()=>{
      const draft=draftOf(currentEditor()),text=draft.text;
      return controller.steer(text,{running:state.running}).then((outcome:any)=>{
        if(outcome.status!=='requested')return;
        const clearedEditor=createEditorState('');composerStore.replace(clearedEditor);setAppState((current:TuiAppState)=>({...current,editor:clearedEditor}));
        rememberSent(draft);historyIndexRef.current=-1;reverseIndexRef.current=0;setAuxCompletions([]);
      }).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.steering'),{rejected:true})));
    };
    const submit=async()=>{
      const draft=draftOf(currentEditor());
      const text=currentEditor().text;if(!text.trim())return;developmentLog('ui.submit.begin',{text:developmentTextEvidence(text),model:controller.model(),running:state.running,mode:controller.mode()},'info','tui');
      /* R5a S5 (Q-R5-7, Q-R5-8; E8): what Enter does now (busy-input.ts); the first time while TALOS works, a one-time tip. */
      const busyAction=busyEnterAction({text,running:state.running,mode:prefs.currentBusyInput()});if(tipsOnEnter(busyAction)&&prefs.firstBusyEnter())addLocal(busyTip(prefs.currentBusyInput()));
      if(busyAction==='steer'){await steerDraft();return;}
      const clearedEditor=createEditorState('');composerStore.replace(clearedEditor);setAppState((current:TuiAppState)=>({...current,editor:clearedEditor,focus:current.focus.current==='composer'?current.focus:createFocusState('composer'),overlay:null}));
      setVim((current:VimState)=>current.enabled?{...current,mode:'insert'}:current);
      rememberSent(draft);historyIndexRef.current=-1;reverseIndexRef.current=0;setTranscriptRevealId(null);setViewport((view:TranscriptViewport)=>({...view,offset:0,unseen:0,followingTail:true}));
      if(text.trim().startsWith('/')){if(busyAction==='slash-after-turn')await deferSlashCommand(text.trim());else await executeSlash(text.trim());return;}
      if(!text.trim().startsWith('!')){const readiness=await readinessFor(controller.model());developmentLog('ui.readiness',{model:controller.model(),readiness},readiness.ready?'debug':'warning','tui');if(!readiness.ready){restoreDraft(draft);addLocal(readiness.message);return;}}
      const willQueue=state.running||controller.queue().length>0;
      /* R3 Q-R3-7 (gate E7): a prompt that goes straight to the model says `starting` until its run starts (measured gate §0.3:
         without it the screen said `idle` and the roster `unknown` after the provider had the request). A `!` command has no run. */
      const sendsToModel=!willQueue&&!text.trim().startsWith('!');
      /* UI Phase 1 D20 (owner 27/09): the transcript shows a long paste as its placeholder; the model gets `text`, whole. */
      if(!willQueue)setState((current:TuiState)=>{const next=userMessage(current,draftDisplayText(draft).trim());return sendsToModel?{...next,sentAt:Date.now(),lastTurn:null}:next;});
      if(sendsToModel)lastSentDraftRef.current=draft;
      try{const outcome=await controller.send(text,{model:controller.model(),running:state.running});developmentLog('ui.submit.accepted',{outcome},'info','tui');if(busyAction==='interrupt-and-send'&&outcome.queued)await controller.interrupt({send:true});}catch(error:any){if(sendsToModel)setState((current:TuiState)=>current.running?current:{...current,sentAt:null});developmentLogError('ui.submit.failure',error,{model:controller.model()},'tui');addLocal(error instanceof TuiNotReadyError?error.message:screenErrorText(error,act('screen.action.run')));}
    };

    /* 0.6.13: the sent text back in the composer (only an empty one) and the dialog open on it */
    requestTooLargeReturnedRef.current=(error:unknown)=>{
      const sent=lastSentDraftRef.current,prompt=lastRunPromptRef.current;
      const draft:EditorDraft|null=sent&&(prompt===null||sent.text.trim()===prompt.trim())?sent:prompt?{text:prompt,collapsedPastes:[]}:sent;
      if(!draft||!draft.text.trim())return;
      const restored=!currentEditor().text.trim();
      if(restored)restoreDraft(draft);
      showTooLargePrompt({selected:0,draft,facts:requestTooLargeOf(error),restored});
    };
    /* «Send as attachment»: the same text again, with the kernel's run option; it leaves the composer as a sent message does when
       the composer still holds it as it was given back */
    const sendAsAttachment=async(prompt:TooLargePrompt)=>{
      const text=prompt.draft.text;if(!text.trim())return;
      if(prompt.restored&&currentEditor().text===text){const cleared=createEditorState('');composerStore.replace(cleared);setAppState((current:TuiAppState)=>({...current,editor:cleared}));setAuxCompletions([]);}
      const willQueue=state.running||controller.queue().length>0;
      if(!willQueue)setState((current:TuiState)=>({...userMessage(current,draftDisplayText(prompt.draft).trim()),sentAt:Date.now(),lastTurn:null}));
      lastSentDraftRef.current=prompt.draft;
      try{await controller.send(text,{model:controller.model(),running:state.running,attachIfTooLarge:true});}
      catch(error){if(!willQueue)setState((current:TuiState)=>current.running?current:{...current,sentAt:null});developmentLogError('ui.submit.failure',error,{model:controller.model(),attachIfTooLarge:true},'tui');addLocal(error instanceof TuiNotReadyError?error.message:screenErrorText(error,act('screen.action.run')));}
    };
    const historyMove=(delta:number)=>{if(!history.length)return;const next=Math.max(-1,Math.min(history.length-1,historyIndexRef.current+delta));historyIndexRef.current=next;reverseIndexRef.current=0;restoreDraft(next>=0?(history[next]??''):'');};
    const reverseSearch=()=>{const found=reverseHistoryMatch(history,currentEditor().text,reverseIndexRef.current);if(!found){reverseIndexRef.current=0;return;}reverseIndexRef.current=found.index+1;historyIndexRef.current=found.index;restoreDraft(history[found.index]??found.value);};
    const applyMode=async(next:PermissionMode,confirmed=false)=>{
      if(modeChangingRef.current)return;
      modeChangingRef.current=true;
      try{
        await controller.setMode(next);
        if(confirmed)fullAccessConsentRef.current={sessionId:controller.current(),confirmed:true};
        const held=controller.mode();
        if(next==='bypassPermissions'&&held!==next&&projectUntrusted)setFullAccessHeldBack(true);
        setState((current:TuiState)=>({...current,status:{...current.status,permissionMode:held}}));
      }catch(error){addLocal(screenErrorText(error,act('screen.action.permissionMode')));}
      finally{modeChangingRef.current=false;}
    };
    const cycleMode=()=>{
      if(modeChangingRef.current||fullAccessPromptRef.current!==null)return;
      const next=cyclePermissionMode(controller.mode()),sessionId=controller.current(),consent=fullAccessConsentRef.current;
      if(consent.sessionId===null)consent.sessionId=sessionId;
      else if(consent.sessionId!==sessionId)fullAccessConsentRef.current={sessionId,confirmed:false};
      if(next==='bypassPermissions'&&!fullAccessConsentRef.current.confirmed){showFullAccessPrompt(0);return;}
      void applyMode(next);
    };
    const cancelActiveRun=()=>{void controller.cancel().then((dropped:TuiQueuedAction[])=>{if(dropped.length)addLocal(tn('screen.queue.cancelledRun',dropped.length));}).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.cancel'))));};

    const filteredModels=modelItems(modelRows,pickerQuery);
    const effortRows=modelEffortStep?reasoningEffortChoices(modelEffortStep):[];
    const filteredProviders=providerPickerItems(providerRows,pickerQuery,{reachable:id=>providerPickerRef.current?.reachable(id)??null});
    const filteredSessions=filterSessions(sessionRows,pickerQuery);
    const activePickerRows=appState.focus.current==='model-picker'?(modelEffortStep?effortRows:filteredModels):appState.focus.current==='provider-picker'?filteredProviders:appState.focus.current==='session-picker'?filteredSessions:[];

    const movePicker=(action:string)=>{
      const movement=pickerMove(action);if(!movement)return;
      if(appState.focus.current==='command-menu'){
        /* R4 Q-R4-5: after a typo nothing is highlighted; the first arrow key lands on the top row. */
        const text=currentEditor().text;
        if(commandMenuHighlight(text,commandMenuSelectionStore.getSnapshot())<0)commandMenuSelectionStore.highlight(0);
        else commandMenuSelectionStore.move(commandMenuItems(text).length,movement);
        return;
      }
      setPickerSelection((current:SelectionState)=>moveSelection({...current,query:pickerQuery},activePickerRows.length,movement));
    };
    const pickerBackspace=()=>{
      if(appState.focus.current==='model-picker'&&modelEffortStep){if(effortOnly)return;setModelEffortStep(null);setPickerSelection({query:'',selected:0,pageSize:10});return;}
      if(appState.focus.current==='command-menu'){
        updateEditor(editor=>{const next=deleteBackward(editor);if(next.text.length===0)setTimeout(()=>setAppState((current:TuiAppState)=>({...current,focus:closeFocus(current.focus)})),0);return next;});
        commandMenuSelectionStore.reset();
        return;
      }
      if(appState.focus.current==='provider-picker'&&(providerStep.kind==='key'||providerStep.kind==='oauth'))setProviderSecret((value:string)=>value.slice(0,-1));
      else if(appState.focus.current==='provider-picker'&&(providerStep.kind==='consent'||providerStep.kind==='address')){/* nothing to erase */}
      else setPickerQuery((value:string)=>value.slice(0,-1));
      setPickerSelection((current:SelectionState)=>({...current,selected:0}));
    };
    /*
     * R4 Q-R4-5 / gate E6: in the command menu Enter RUNS the highlighted command through the one dispatcher — the composer
     * gets `/<name>` and `submit` runs it exactly as if the person had typed the name and pressed Enter (history, slash
     * branch, "Did you mean"). With nothing highlighted (a typo, or arguments typed) Enter sends the text as typed. Tab
     * (`complete`) keeps completing `/<name> ` for arguments (the highlighted row, else the top row).
     */
    const confirmPicker=async(mode:'run'|'complete'='run',clicked?:number)=>{
      if(appState.focus.current==='command-menu'){
        const selected=commandMenuSelectionStore.getSnapshot().selected;
        const rows=commandMenuItems(currentEditor().text);
        const highlighted=commandMenuHighlight(currentEditor().text,commandMenuSelectionStore.getSnapshot());
        const row=highlighted>=0?rows[highlighted]:mode==='complete'?rows[selected]:undefined;
        if(mode==='complete'&&!row)return;
        setAppState((current:TuiAppState)=>({...current,focus:closeFocus(current.focus)}));
        commandMenuSelectionStore.reset();
        setPickerSelection({query:'',selected:0,pageSize:10});
        if(mode==='complete'){setEditorText(completeCommandSelection(row!.command));return;}
        if(row)setEditorText(`/${row.command.name}`);
        await submit();
        return;
      }
      const selected=clicked??pickerSelection.selected;
      if(appState.focus.current==='model-picker'){
        if(modelEffortStep){const choice=effortRows[selected];if(!choice)return;await applyEffortChoice(modelEffortStep,choice);return;}
        const row=filteredModels[selected];if(!row)return;
        const choices=reasoningEffortChoices(row);
        if(choices.length){setModelEffortStep(row);setPickerQuery('');setPickerSelection({query:'',selected:0,pageSize:10});return;}
        if(await useModelWithoutEffort(row))closeCurrentOverlay();
        return;
      }
      if(appState.focus.current==='provider-picker'){
        if(providerStep.kind==='key-actions'){
          const step=providerStep;
          if(step.choice==='use'){await routeProviderSelection(step.provider,{allowEnvironmentConsent:false,keyActionChosen:true});return;}
          if(step.choice==='sign-in'){setProviderSecret('');if(signsIn(step.provider)){await startOAuth(step.provider);return;}setProviderStep(keyStepFor(step.provider));return;}
          await removeProviderKey(step.provider);return;
        }
        if(providerStep.kind==='address'){
          const step=providerStep;const address=ZAI_ADDRESSES[step.choice]??ZAI_ADDRESSES[0]!;
          try{await catalog.chooseProviderAddress(step.provider.id,address.endpoint);}
          catch(error){addLocal(screenErrorText(codeOnly(error),act('screen.action.providerAddress')));return;}
          addLocal(t('screen.provider.addressChosen',{provider:step.provider.label,address:address.label}));
          const fresh:TuiProvider={...step.provider,addressChosen:true,address:address.label};
          setProviderRows((rows:TuiProvider[])=>rows.map(row=>row.id===fresh.id?fresh:row));
          await routeProviderSelection(fresh,step.route);return;
        }
        if(providerStep.kind==='login-choice'){
          const step=providerStep;
          if(step.choice==='browser'){await startOAuth(step.provider);return;}
          setProviderSecret('');setProviderStep({kind:'key',provider:step.provider,testing:false,result:null,...(step.remediation?{remediation:step.remediation}:{})});return;
        }
        if(providerStep.kind==='oauth'){
          const step=providerStep;
          if(step.phase==='failed'){await startOAuth(step.provider);return;}
          const waiting=oauthLoginRef.current;
          if(step.phase!=='paste'||!waiting||!('submit' in waiting))return;
          const pasted=providerSecret;setProviderSecret('');
          if(!pasted.trim())return;
          try{await waiting.submit(pasted);}
          catch(error){if((error as any)?.code==='OAUTH_CODE_MISSING')setProviderStep({...step,message:oauthErrorText(step.provider,error)});}
          return;
        }
        if(providerStep.kind==='consent'){
          const step=providerStep;
          try{await catalog.answerEnvironmentKey(step.provider.id,step.choice);}catch(error){addLocal(screenErrorText(codeOnly(error),act('screen.action.answer')));return;}
          const refreshed=(await catalog.listProviders()).find((entry:TuiProvider)=>entry.id===step.provider.id)??{...step.provider,keySource:step.choice==='yes'?'environment':'environment-declined'};
          if(step.choice==='yes')addLocal(t('screen.provider.envKeyUsed',{variable:step.provider.environmentVariable??t('screen.provider.envKeyFallback'),provider:step.provider.label}));
          /* the person has just answered for this key: no second question about it */
          await routeProviderSelection(step.choice==='yes'?refreshed:{...refreshed,keySource:'environment-declined'},{allowEnvironmentConsent:false,keyActionChosen:true});return;
        }
        if(providerStep.kind==='key'){
          const step=providerStep;if(step.testing)return;
          let secret=providerSecret;setProviderSecret('');
          if(!secret.trim())return;
          setProviderStep({...step,testing:true,result:null});
          let result:TuiKeySave;
          try{result=await catalog.setProviderKey(step.provider.id,secret);}catch(error){setProviderStep({...step,testing:false,result:null});addLocal(screenErrorText(codeOnly(error),act('screen.action.keyTest'),{note:t('screen.provider.keyNotSaved')}));return;}finally{secret='';}
          if(!result.saved){setProviderStep({...step,testing:false,result});return;}
          addLocal(t('screen.provider.keySaved',{message:result.message,saved:keySavedText()})); /* R2 lane K (E13): the memory store must not claim the system keyring */
          const refreshed=(await catalog.listProviders()).find((entry:TuiProvider)=>entry.id===step.provider.id)??{...step.provider,configured:true};
          await chooseProviderAndOpenModels(refreshed);return;
        }
        const row=filteredProviders[selected];if(!row)return;
        await routeProviderSelection(row);return;
      }
      if(appState.focus.current==='session-picker'){
        const model=sessionPickerRef.current;if(!model||sessionConfirmingRef.current)return;model.setQuery(pickerQuery);if(!model.rows()[selected])return;model.select(selected);
        const from=model.rows()[selected]!;
        sessionConfirmingRef.current=true;try{freshView();const id=await model.confirm();closeCurrentOverlay();if(id&&model.action()==='fork')addLocal(t('screen.session.forked',{from:from.title||from.id,id}));}catch(error){addLocal(screenErrorText(error,act('screen.action.sessionAction')));}finally{sessionConfirmingRef.current=false;}return;
      }
    };

    /* R4 Q-R4-7: a picker, dialog or center is open (the approval dialog answers its own keys, R3 E11). */
    const dialogOpen=()=>Boolean(fullAccessPrompt!==null||tooLargePrompt!==null||exitPrompt!==null||(appState.overlay&&appState.overlay.kind!=='approval')||appState.focus.current==='command-menu'||queueEditor||transcriptSearch||contextInspector||themePicker||configPanel||historyPicker||agentsSurface.page||trustCenter||mcpCenter||hookCenter||pluginCenter||memoryCenter||notesCenter||tasksCenter||libraryCenter||researchCenter||automationCenter||forgeCenter);
    interruptContextRef.current=()=>({draft:composerStore.getSnapshot().text.length>0,dialog:dialogOpen(),completion:Boolean(fileCompletionRef.current)});
    const closeAnyDialog=()=>{
      showFullAccessPrompt(null);showTooLargePrompt(null);
      if(appState.focus.current==='provider-picker')providerPickerRef.current?.cancel();if(appState.focus.current==='model-picker')modelPickerRef.current?.cancel();if(appState.focus.current==='session-picker')sessionPickerRef.current?.cancel();
      if(appState.focus.current==='command-menu')commandMenuSelectionStore.reset();
      setQueueEditor(null);setTranscriptSearch(null);setContextInspector(null);setAgentsSurface((current:AgentsSurface)=>current.page?{...current,page:null}:current);setResearchCenter(null);setAutomationCenter(null);setForgeCenter(null);
      closeCurrentOverlay();
    };
    /* R4 Q-R4-7 / E7: a cleared draft goes into history first, so ↑ brings it back (with its paste blocks, Q-R4-9). */
    const clearDraftIntoHistory=()=>{rememberDraft(draftOf(currentEditor()));historyIndexRef.current=-1;reverseIndexRef.current=0;const cleared=createEditorState('');composerStore.replace(cleared);setAppState((current:TuiAppState)=>({...current,editor:cleared}));setAuxCompletions([]);};
    /* R4 Q-R4-8: Esc closes the `@` list until the token changes; ↑/↓ move its highlight; Tab or Enter insert the
       highlighted path (a folder keeps the list open one level down, a file ends with a space and closes it). Enter on a
       file already typed in full is not taken: it sends the prompt. */
    const dismissCompletion=()=>{const watch=completionWatchRef.current;watch.dismissed=fileCompletionRef.current?.token??watch.token;watch.seq++;setFileCompletion(null);};
    const moveCompletion=(delta:number)=>setFileCompletion((current:FileCompletion|null)=>current&&current.rows.length?{...current,selected:Math.max(0,Math.min(current.rows.length-1,current.selected+delta))}:current);
    const acceptCompletion=(how:'tab'|'enter')=>{
      const current=fileCompletionRef.current,row=current?.rows[current.selected];if(!current||!row)return false;
      if(how==='enter'&&row.value===current.token)return false;
      const value=row.directory?row.value:`${row.value} `;
      updateEditor(editor=>lastProjectToken(editor.text)===current.token?replaceLastProjectToken(editor,current.token,value):editor);
      return true;
    };
    /* R4 E7: interrupt.ts decides; app.ts only carries the decision out. */
    const applyInterrupt=(decision:InterruptDecision,key:ExitKey)=>{
      if(decision==='cancel'){cancelActiveRun();return;}
      if(decision==='arm-exit'){showExitHint(key);return;}
      if(decision==='exit'||decision==='force-exit'){inkApp.exit();return;}
      if(decision==='close-dialog'){hideExitHint();closeAnyDialog();return;}
      if(decision==='clear-draft'){hideExitHint();clearDraftIntoHistory();return;}
      if(decision==='delete-forward'){updateEditor(deleteForward);return;}
      if(decision==='close-completion'){dismissCompletion();return;}
      if(decision==='stop-run'){void controller.interrupt().catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.interrupt'))));return;}
      setAuxCompletions([]);setTranscriptRevealId(null);setViewport((view:TranscriptViewport)=>({...view,offset:0,unseen:0,followingTail:true}));
    };

    const handleSemanticAction=(action:string,key:any,inputText?:string)=>{
      /* R3 E11: the approval dialog's keys are handled by handleApprovalKey, from the synchronous refs; a render that still
         shows the dialog after it closed must not answer anything. */
      if(appState.focus.current==='approval'&&(action.startsWith('approval-')||action==='interrupt'))return;
      if(fileCompletionRef.current?.rows.length&&appState.focus.current==='composer'){
        if((action==='history-prev'||action==='history-next')&&!key?.ctrl){moveCompletion(action==='history-prev'?-1:1);return;}
        if(action==='palette'&&acceptCompletion('tab'))return;
        if(action==='submit'&&acceptCompletion('enter'))return;
      }
      if(action==='overlay-close'){closeCurrentOverlay();return;}
      if(action==='picker-cancel'){if(appState.focus.current==='provider-picker')providerPickerRef.current?.cancel();if(appState.focus.current==='model-picker')modelPickerRef.current?.cancel();if(appState.focus.current==='session-picker')sessionPickerRef.current?.cancel();closeCurrentOverlay();return;}
      if(appState.focus.current==='provider-picker'&&providerStep.kind==='key-actions'&&action.startsWith('picker-')&&action!=='picker-confirm'&&action!=='picker-backspace'){
        /* from the CURRENT step: two arrows in one read move twice (a stale closure moved once) */
        setProviderStep((current:ProviderStep)=>{
          if(current.kind!=='key-actions')return current;
          const actions=keyActionsFor(current.planNeeded===true);const index=Math.max(0,actions.indexOf(current.choice));
          const next=action==='picker-home'?0:action==='picker-end'?actions.length-1:action==='picker-up'?Math.max(0,index-1):action==='picker-down'?Math.min(actions.length-1,index+1):index;
          return{...current,choice:actions[next]!};
        });return;
      }
      if(appState.focus.current==='provider-picker'&&providerStep.kind==='address'&&action.startsWith('picker-')&&action!=='picker-confirm'&&action!=='picker-backspace'){
        setProviderStep((current:ProviderStep)=>{
          if(current.kind!=='address')return current;const last=ZAI_ADDRESSES.length-1;
          const next=action==='picker-home'?0:action==='picker-end'?last:action==='picker-up'?Math.max(0,current.choice-1):action==='picker-down'?Math.min(last,current.choice+1):current.choice;
          return{...current,choice:next};
        });return;
      }
      if(appState.focus.current==='provider-picker'&&providerStep.kind==='login-choice'&&(action==='picker-up'||action==='picker-home')){setProviderStep({...providerStep,choice:'browser'});return;}
      if(appState.focus.current==='provider-picker'&&providerStep.kind==='login-choice'&&(action==='picker-down'||action==='picker-end')){setProviderStep({...providerStep,choice:'paste-key'});return;}
      if(appState.focus.current==='provider-picker'&&providerStep.kind==='consent'&&(action==='picker-up'||action==='picker-home')){setProviderStep({...providerStep,choice:'no'});return;}
      if(appState.focus.current==='provider-picker'&&providerStep.kind==='consent'&&(action==='picker-down'||action==='picker-end')){setProviderStep({...providerStep,choice:'yes'});return;}
      if(appState.focus.current==='provider-picker'&&providerStep.kind!=='list'&&action.startsWith('picker-')&&action!=='picker-confirm'&&action!=='picker-backspace')return;
      if(action.startsWith('picker-')&&action!=='picker-confirm'&&action!=='picker-backspace'){movePicker(action);return;}
      if(action==='picker-backspace'){pickerBackspace();return;}
      if(action==='picker-confirm'){void confirmPicker();return;}
      if(action==='command-complete'&&appState.focus.current==='command-menu'){void confirmPicker('complete');return;}
      if(action==='interrupt'){
        if(key?.escape){const decision=interruptRef.current!.esc(state.running);if(decision==='stop-run'){void controller.interrupt().catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.interrupt'))));return;}applyInterrupt(decision,'ctrl-c');return;}
        const result=interruptRef.current!.ctrlC(state.running);if(result==='cancel')cancelActiveRun();else applyInterrupt(result,'ctrl-c');return;
      }
      /* R4 Q-R4-7: Ctrl+D where the composer does not own it (a picker), and a key a person bound to clear-draft. */
      if(action==='exit'){applyInterrupt(interruptRef.current!.ctrlD(state.running),'ctrl-d');return;}
      if(action==='clear-draft'){if(currentEditor().text.length)applyInterrupt('clear-draft','ctrl-c');return;}
      if(action==='vim-toggle'){setVim((current:VimState)=>toggleVim(current));return;}
      if(action==='agent-tree'){cycleAgents();return;}
      /* F-Q1 (owner 03/10, «Ctrl+Enter la manda subito»): during a turn it steers it now; at rest it is a plain send */
      if(action==='steer'){
        /* FE-048: with an empty prompt it takes the first row of the band, as the band says */
        const first=!currentEditor().text.trim()?queueSheetEntries()[0]:undefined;
        if(first?.kind==='prompt'){void applySheetAction({kind:'queueSend',id:first.id});return;}
        if(state.running)void steerDraft();else void submit();return;
      }
      if(action==='command-menu'){const editor=composerStore.update(current=>editInsert(current,inputText??'/'));commandMenuSelectionStore.reset();setAppState((current:TuiAppState)=>({...current,editor,focus:openFocus(current.focus,'command-menu')}));setPickerSelection({query:'',selected:0,pageSize:10});return;}
      if(action==='model-picker'){void loadModels();return;}
      if(action==='provider-picker'){void loadProviders();return;}
      if(action==='help'){setHelpOffset(0);applyOverlay({kind:'help'});return;}
      if(action==='transcript-mode'){openTranscript();return;}
      if(action==='reasoning-toggle'||action==='tool-details'||action==='redraw'){runKeyAction(action);return;}
      if(action==='transcript-search'){openTranscriptSearch();return;}
      if(action==='transcript-raw'){setTranscriptRaw((value:boolean)=>!value);setTranscriptSearch((current:TranscriptSearchState|null)=>current?{...current,raw:!transcriptRaw,notice:null}:current);return;}
      if(action==='transcript-copy'){copyTranscriptItem();return;}
      if(action==='permission-cycle'){cycleMode();return;}
      if(action==='page-up'){scrollTranscript('page-up');return;}
      if(action==='page-down'){scrollTranscript('page-down');return;}
      if(action==='history-search'){reverseSearch();return;}
      if(action==='history-prev'&&key?.ctrl){historyMove(1);return;}
      if(action==='history-next'&&key?.ctrl){historyMove(-1);return;}
      if(action==='external-editor'){void editExternally({text:currentEditor().text,editor:externalEditor(),tmpRoot:paths.cacheRoot}).then(setEditorText).catch(error=>addLocal(screenErrorText(error,act('screen.action.externalEditor'))));return;}
      if(action==='palette'){
        const token=lastProjectToken(currentEditor().text);if(token){checkCompletion(true);return;}
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
      if(action==='delete-forward'){if(key?.ctrl){applyInterrupt(interruptRef.current!.ctrlD(state.running),'ctrl-d');return;}updateEditor(deleteForward);return;}
      if(action==='backspace'){updateEditor(deleteBackward);return;}
      /* F-Q1 (owner 03/10, «Up la riprende»; Claude Code: ↑ edits what is queued; Pi restores the queue to the editor): with an
         empty composer and messages waiting, ↑ takes them all back as one draft instead of walking the history. */
      if(action==='history-prev'&&!currentEditor().text&&(kernelQueue.items.some((item:any)=>item.origin==='person')||queuedActions.some((row:TuiQueuedAction)=>row.kind==='prompt'))){
        void controller.takeBackQueued().then((text:string|null)=>{if(text&&!currentEditor().text)setEditorText(text);else if(text)setEditorText([text,currentEditor().text].join('\n\n'));}).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.queueEdit'))));return;
      }
      if(action==='history-prev'){const editor=currentEditor();const hadSelection=editor.selectionAnchor!==undefined;const moved=moveVertical(editor,-1);if(moved.cursor!==editor.cursor||hadSelection)updateEditor(()=>moved);else historyMove(1);return;}
      if(action==='history-next'){const editor=currentEditor();const hadSelection=editor.selectionAnchor!==undefined;const moved=moveVertical(editor,1);if(moved.cursor!==editor.cursor||hadSelection)updateEditor(()=>moved);else historyMove(-1);return;}
    };

    /* R4 Q-R4-8: an open `@` list counts as completions: the composer's fast paths step aside so its keys reach the list. */
    const auxCount=auxCompletions.length+(fileCompletion?1:0);
    const pasteOwner=composerOwnsPaste({
      bootPhase:boot.phase,
      focus:appState.focus.current,
      /* stage 7.10b: an open sheet stands in the composer's place, so a paste is the sheet's */
      modalOwner:Boolean(sheet!==null||fullAccessPrompt!==null||tooLargePrompt!==null||exitPrompt!==null||appState.overlay||queueEditor||transcriptSearch||contextInspector||themePicker||configPanel||historyPicker||agentsSurface.page||agentView||trustCenter||mcpCenter||hookCenter||pluginCenter||memoryCenter||notesCenter||tasksCenter||libraryCenter||researchCenter||automationCenter||forgeCenter||pending),
      vimMode:vim.enabled?vim.mode:'disabled',
      auxCount,
    });
    Ink.usePaste((pastedText:string)=>{
      /* R3-KEYS: no C0 or DEL character reaches the editor or the model, except a line break. */
      composerStore.update(editor=>applyComposerFastPasteInput(editor,sanitizeInputText(pastedText)));
    },{isActive:pasteOwner});
    /* stage 7.10b: a paste into an open sheet (a filter, a name, a key in its masked row) goes in as typed text on one line */
    Ink.usePaste((pastedText:string)=>{
      const line=sanitizeInputText(pastedText).replace(/[\r\n]+/gu,' ');
      if(line)handleSheetKey(line,{});
    },{isActive:sheet!==null});

    /* R3 gate E11: one key in the approval dialog (Q-R3-5/6/14). Esc from the summary and Ctrl+C deny and stop the turn;
       Enter answers the highlight (Deny by default: deny and continue); a digit answers at once; [5] only in the full review. */
    const answerApproval=(choice:UserApprovalChoice,stop:boolean,extra?:{domandaModificata:string})=>{
      const current=pendingRef.current,shown=approvalShownRef.current;
      if(!current||!shown||shown.answered||shown.requestId!==current.requestId)return;
      shown.answered=true;
      researchEditRef.current=null;setResearchEdit(null);
      void controller.resolveApproval(current.requestId,choice,extra).then(()=>{if(stop)return controller.interrupt();}).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.approval'))));
    };
    const handleApprovalKey=(ch:string,key:any)=>{
      const ui=approvalUiRef.current;
      /* the research card's field owns every key while it is open (the owner, 02/11) */
      const editing=researchEditRef.current;
      if(editing!==null){
        const step=researchEditStep(editing,ch,key);
        if(step.kind==='start'){answerApproval('allow-once',false,step.text===pendingRef.current?.action?.question?undefined:{domandaModificata:step.text});return;}
        const next=step.kind==='text'?step.text:null;researchEditRef.current=next;setResearchEdit(next);return;
      }
      const openField=()=>{const text=pendingRef.current?.action?.question??'';researchEditRef.current=text;setResearchEdit(text);};
      if(ch==='e'&&pendingRef.current?.action?.operation==='research_start'){openField();return;}
      /* row 126: 7 answers «Allow all the same calls of this answer», only where the card offers it */
      if(ch==='7'&&approvalChoicesFor(pendingRef.current?.action).some(row=>row.action==='approval-all-calls')){answerApproval('allow-calls',false);return;}
      if(ui.expanded&&(key.pageUp||key.pageup||key.pageDown||key.pagedown||key.upArrow||key.downArrow)){
        const delta=(key.pageDown||key.pagedown)?4:(key.pageUp||key.pageup)?-4:key.downArrow?1:-1;
        setApprovalScroll((value:number)=>Math.max(0,Math.min(approvalMaxOffsetRef.current,value+delta)));return;
      }
      const action=resolveKeybinding(ch,key,['approval','global'],effectiveKeymap);
      const outcome=approvalKeyOutcome(action,{expanded:ui.expanded,selected:ui.selected,escape:Boolean(key.escape),choices:approvalChoicesFor(pendingRef.current?.action)});
      if(outcome.kind==='edit'){openField();return;}
      if(outcome.kind==='answer'){answerApproval(outcome.choice,outcome.stop);return;}
      if(outcome.kind==='select'){approvalUiRef.current={...ui,selected:outcome.selected};setApprovalSelected(outcome.selected);return;}
      if(outcome.kind==='toggle-review'||outcome.kind==='back'){const expanded=outcome.kind==='toggle-review'?!ui.expanded:false;approvalUiRef.current={...ui,expanded};setApprovalExpanded(expanded);setApprovalScroll(0);return;}
      if(action==='tool-details'||action==='reasoning-toggle'||action==='redraw')runKeyAction(action);
    };

    /* Stage 3: one answer per card — a second Enter or the clock after an answer sends nothing; a refusal lets the person try again. */
    const sendQuestionOutcome=(outcome:CardOutcome)=>{
      if(outcome.kind!=='send')return;
      const card=questionRef.current,shown=questionShownRef.current;
      if(!card||!shown||shown.answered||shown.requestId!==card.requestId)return;
      shown.answered=true;
      void controller.answerQuestion(card.requestId,outcome.response).catch((error:unknown)=>{shown.answered=false;addLocal(screenErrorText(error,act('screen.action.question')));});
    };
    /*
     * Stage 3, the plan card (owner 02/10): one choice per card; «e» opens the plan in the editor and an edited text goes back
     * as a correction («keep planning» with feedback) so the model re-proposes it — the approval stays bound to what the
     * model proposed. An unchanged or empty edit sends nothing; a correction past the kernel's 4,000 characters is said, not sent.
     */
    const sendPlanChoice=(decision:PlanDecisionKind,feedback?:string)=>{
      const card=planRef.current,shown=planShownRef.current;
      if(!card||!shown||shown.answered||shown.requestId!==card.requestId)return;
      shown.answered=true;
      void controller.answerPlan(card.requestId,decision,feedback).catch((error:unknown)=>{shown.answered=false;addLocal(screenErrorText(error,act('screen.action.plan')));});
    };
    const editPlan=()=>{
      const card=planRef.current;if(!card)return;
      void editExternally({text:card.content,editor:externalEditor(),tmpRoot:paths.cacheRoot}).then((edited:string)=>{
        const text=String(edited??'').trim();
        if(!text||text===card.content.trim()||planRef.current?.requestId!==card.requestId)return;
        const feedback=planEditFeedback(text);
        if(!feedback){addLocal(t('screen.plan.editTooLong',{max:PLAN_FEEDBACK_MAX}));return;}
        sendPlanChoice('keep-planning',feedback);
      }).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.plan'))));
    };
    /*
     * Stage 3, MCP elicitation (mockup step-17): one answer per card; a form's values stay in this transcript as «answers»
     * (the kernel never journals them); a url opens only on Enter (Codex: never by itself) and the transcript says so.
     */
    const sendElicitation=(response:ElicitationResponse,receipt?:Array<{title:string;answer:string}>)=>{
      const card=elicitRef.current,shown=elicitShownRef.current;
      if(!card||!shown||shown.answered||shown.requestId!==card.requestId)return;
      shown.answered=true;
      void controller.answerElicitation(card.requestId,response).then(()=>{
        if(receipt?.length)setState((current:TuiState)=>({...current,transcript:appendTranscriptAnswers(current.transcript,'elicit:'+card.requestId,receipt,{valuesOnScreenOnly:true})}));
      }).catch((error:unknown)=>{shown.answered=false;addLocal(screenErrorText(error,act('screen.action.elicit')));});
    };
    /* the card's step, from a key or a click (stage 6c); true once the answer has gone */
    const applyElicit=(card:ElicitCardState,{state:next,outcome}:{state:ElicitCardState;outcome:ElicitOutcome}):boolean=>{
        elicitRef.current=next;setElicitCard(next);
        if(outcome.kind==='open'){
          const opened=openInBrowser(outcome.url);
          /* mockup notice (dim): what was opened, and that the server confirms the rest */
          const notice=opened?t('screen.elicit.opened',{url:outcome.url,server:card.server}):t('screen.elicit.openFailed',{url:outcome.url});
          setState((current:TuiState)=>({...current,transcript:appendTranscriptWarning(current.transcript,notice)}));
          sendElicitation(outcome.response);return true;
        }
        if(outcome.kind==='send'){
          const content=outcome.response.action==='accept'?outcome.response.content??{}:null;
          const receipt=content?next.fields.filter(f=>content[f.name]!==undefined).map(f=>({title:f.title,answer:Array.isArray(content[f.name])?(content[f.name] as string[]).join(', '):typeof content[f.name]==='boolean'?(content[f.name]?t('screen.elicit.answerYes'):t('screen.elicit.answerNo')):String(content[f.name])})):undefined;
          sendElicitation(outcome.response,receipt);return true;
        }
        return false;
    };
    /* the person's answer reaches the kernel; the card leaves when the request does (answered, also on the phone or elsewhere) */
    const applyConsent=({state:next,outcome}:{state:ConsentCardState;outcome:ConsentOutcome}):boolean=>{
      consentRef.current=next;setConsentCard(next);
      const shown=consentShownRef.current;
      if(outcome.kind!=='answer')return false;
      if(!shown||shown.answered||!remote)return true;
      shown.answered=true;
      void remote.decideConsent(next.richiestaId,outcome.allow).catch((error:unknown)=>{
        /* review block 3: expired or answered on the device in the meantime — nothing to try again, and nothing was saved */
        if((error as {code?:unknown})?.code==='CONSENT_NOT_PENDING'){addLocal(t('remote.consent.gone'));return;}
        /* blocked folders step B: a folder above it was blocked for that device after it asked — allowing again would not help */
        if((error as {code?:unknown})?.code==='FOLDER_BLOCKED'){
          addLocal(t('remote.consent.insideBlocked',{folder:cleanDeviceName(String((error as any)?.cartellaBloccata?.nome??''))}));return;
        }
        shown.answered=false;addLocal(screenErrorText(error,act('screen.action.consent')));
      });
      return true;
    };
    /*
     * T4: `/remote`, and T6's `remote_phone_pair` after the person's yes (the kernel turned remote control on and told the model the
     * QR is on the person's screen: here it is). The flow is `talos remote`'s own (pairing-flow.ts) with the card as its screen and
     * the card's keys as its keyboard; one at a time per window, one per host across windows (coordinator-service.ts). The result
     * stays as a line in the conversation; the card closes and the conversation comes back whole.
     */
    const feedRemoteKey=(key:PairingKey|null)=>{const keys=remoteKeysRef.current;const waiter=keys.waiting.shift();if(waiter)waiter(key);else keys.queue.push(key);};
    const startRemotePairing=(open?:{soloSeAcceso:true})=>{
      if(remoteFlowRef.current)return;
      if(!remote){addLocal(t('remote.card.unavailable'));return;}
      remoteFlowRef.current=true;remoteKeysRef.current={queue:[],waiting:[]};
      setRemoteCard({screen:'downloading',size:''});
      setAppState((current:TuiAppState)=>openOverlay(current,{kind:'remote'}));
      const io:PairingIo={
        nextKey:()=>new Promise(resolve=>{const keys=remoteKeysRef.current;if(keys.queue.length)resolve(keys.queue.shift()!);else keys.waiting.push(resolve);}),
        sleep:(ms,signal)=>new Promise<void>(resolve=>{const timer=setTimeout(resolve,ms);signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});}),
        now:()=>Date.now(),
        draw:(state)=>setRemoteCard(state),
        copy:async(text)=>(await copyText(text,{writeTerminal:sequence=>{stdout.write(sequence);}})).ok,
        ensureComponent:async(onDownload)=>{onDownload('6.3 MB');const {ensureIrohComponent}=await import('../remote/iroh-component.ts');await ensureIrohComponent({dataRoot:paths.dataRoot});},
      };
      void (async()=>{
        let outcome:Awaited<ReturnType<typeof runPairingFlow>>|null=null;
        try{
          const target=await remote.pairingTarget();
          remoteAdminRef.current=remote.servesAsAdministrator?.()===true;
          outcome=await runPairingFlow(target,io,open?{open}:{});
        }catch(error){outcome={result:'failed',code:String((error as {code?:unknown})?.code??'REMOTE_ERROR')};}
        finally{
          remoteFlowRef.current=false;setRemoteCard(null);
          setAppState((current:TuiAppState)=>current.overlay?.kind==='remote'?closeOverlay(current):current);
          await remote.pairingEnded().catch(()=>{});
        }
        if(outcome?.result==='paired')addLocal(t('remote.card.paired',{device:outcome.phone}));
        else if(outcome?.result==='paused'){const d=new Date(outcome.until);addLocal(t('remote.card.paused',{until:`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}));}
        else if(outcome?.result==='failed')addLocal(screenErrorText(Object.assign(new Error(outcome.code),{code:outcome.code}),act('screen.action.remote')));
      })();
    };
    startRemotePairingRef.current=startRemotePairing;
    const handleConsentKey=(ch:string,key:any)=>{
      for(const cardKey of cardKeysOf(ch,key??{})){
        const card=consentRef.current;if(!card)return;
        if(applyConsent(consentCardKey(card,cardKey)))return;
      }
    };
    const handleElicitKey=(ch:string,key:any)=>{
      for(const cardKey of cardKeysOf(ch,key??{})){
        const card=elicitRef.current;if(!card)return;
        if(applyElicit(card,elicitCardKey(card,cardKey)))return;
      }
    };
    /* the card's step, from a key or a click (stage 6c); true once the plan is decided or sent to the editor */
    const applyPlan=(outcome:PlanOutcome):boolean=>{
      if(outcome.kind==='decide'){sendPlanChoice(outcome.decision);return true;}
      if(outcome.kind==='edit'){editPlan();return true;}
      return false;
    };
    const handlePlanKey=(ch:string,key:any)=>{
      for(const cardKey of cardKeysOf(ch,key??{})){
        const card=planRef.current;if(!card)return;
        if(applyPlan(planCardKey(card,cardKey)))return;
      }
    };
    /* the card's step, from a key or a click (stage 6c); true once the answers have gone */
    const applyQuestion=({state:next,outcome}:{state:QuestionCardState;outcome:CardOutcome}):boolean=>{
      questionRef.current=next;setQuestionCard(next);setQuestionNow(clockRef.current());
      sendQuestionOutcome(outcome);
      return outcome.kind==='send';
    };
    /* every key of the chunk in order (cardKeysOf): a Tab glued to the letters after it is still a Tab */
    const handleQuestionKey=(ch:string,key:any)=>{
      for(const cardKey of cardKeysOf(ch,key??{})){
        const card=questionRef.current;if(!card)return;
        if(applyQuestion(questionCardKey(card,cardKey)))return;
      }
    };
    /* Stage 7.3: what a sheet's choice does — the same as the command given its argument */
    const applySheetAction=async(action:SheetAction)=>{
      try{await applySheetActionInner(action);}catch(error){addLocal(screenErrorText(error,act('screen.action.command',{command:action.kind})));}
    };
    const applySheetActionInner=async(action:SheetAction)=>{
      if(action.kind.startsWith('setup')){await setupAction(action);return;}
      if(action.kind==='settingsSave'){await saveSettings(action.values);return;}
      if(action.kind==='settingsReload'){await loadSettingsConfig();return;}
      if(action.kind==='busy'){prefs.setBusyInput(action.mode);addLocal(action.notice);return;}
      if(action.kind==='plan'){
        const next:PermissionMode=action.on?'plan':(baseMode==='plan'?'default':baseMode);
        try{await controller.setMode(next);const held=controller.mode();setState((current:TuiState)=>{const shown={...current,status:{...current.status,permissionMode:held}};return held===next?localMessage(shown,action.notice):shown;});}
        catch(error){addLocal(screenErrorText(error,act('screen.action.permissionMode')));}
        return;
      }
      /* Decision 198 (owner 04/11/2026; 213 = D1 a): «Send it again» and «Edit it first» fork just before the turn of that message,
         so the same conversation never holds the question twice with its old answer in between; the first answer stays in /resume.
         Hermes `retry_last` takes the last turn off before re-sending (hermes_cli/cli_session_mixin.py:777-819). Without the cut (an
         older kernel) or without the turn, the old path: the message sent again as a new turn. */
      if(action.kind==='retry'){
        const from=state.sessionId??controller.current()??null;
        if(from&&runtime.forkBeforeRun&&runtime.capabilities?.().forkBeforeRun===true){
          let turns:ReturnType<typeof sessionTurns>=[];try{turns=sessionTurns((runtime.export(from) as any)?.eventi);}catch{/* no turn to cut before */}
          const words=(text:string)=>text.replace(/\s+/gu,' ').trim();
          const runId=turns.find(turn=>words(turn.text)===words(action.text))?.runId;
          if(runId){if(await forkBeforeTurn(from,runId,action.text,action.edit?'fork':'retry')&&!action.edit)await submit();return;}
        }
        const editor=createEditorState(action.text);composerStore.replace(editor);setAppState((current:TuiAppState)=>({...current,editor}));if(!action.edit)await submit();return;}
      if(action.kind==='notice'){addLocal(action.text,action.tone??null);return;}
      /* stage 7.19: /tasks — each change goes through the task board, then the sheet reads it back */
      if(action.kind==='taskDone'||action.kind==='taskAdd'||action.kind==='taskEdit'||action.kind==='taskDelete'){
        try{
          const rows=(await tasksFacade().list()).rows;const title=(id:string)=>rows.find(row=>row.id===id)?.title??id;
          if(action.kind==='taskDone'){await tasksFacade().complete(action.id,action.done?'done':'todo');setToast(t(action.done?'panel.tasks.markedDone':'panel.tasks.reopened',{title:title(action.id)}));await loadTasksCenter(action.id);return;}
          if(action.kind==='taskAdd'){const before=new Set(rows.map(row=>row.id));await tasksFacade().add({title:action.title});setToast(t('panel.tasks.added'));const added=(await tasksFacade().list()).rows.find(row=>!before.has(row.id));await loadTasksCenter(added?.id);return;}
          if(action.kind==='taskEdit'){await tasksFacade().update(action.id,{title:action.title});setToast(t('panel.tasks.saved'));await loadTasksCenter(action.id);return;}
          await tasksFacade().delete(action.id);setToast(t('panel.tasks.deleted',{title:[...title(action.id)].slice(0,30).join('')}));await loadTasksCenter();
        }catch(error){addLocal(screenErrorText(error,act('screen.action.taskBoard')));}
        return;
      }
      /* stage 7.23: /library — Enter puts the library's reference in the message; a file is added from a path, removed after d twice */
      if(action.kind==='libraryMention'||action.kind==='libraryAdd'||action.kind==='libraryDelete'){
        try{
          if(action.kind==='libraryMention'){const reference=await libraryFacade().prepareContextReference(action.id);setEditorText(attachLibraryContextToken(currentEditor().text,reference.token));return;}
          if(action.kind==='libraryAdd'){const added=await libraryFacade().importFile(resolve(projectRoot,action.path));
            setToast(t(added.duplicateDecision==='existing-exact'?'panel.library.already':'panel.library.added',{name:added.nome}));await openLibrary(added.id);return;}
          const name=(await libraryFacade().list()).rows.find(row=>row.id===action.id)?.name??'';
          await libraryFacade().delete(action.id);setToast(t('panel.library.removed',{name}));await openLibrary();
        }catch(error){addLocal(screenErrorText(error,act('screen.action.libraryCenter')));if(action.kind!=='libraryMention')await openLibrary().catch(()=>{});}
        return;
      }
      /* stage 7.22: /memory — each change through the memory store, then the sheet reads it back; a file's line opens in the editor */
      if(action.kind==='memoryAdd'||action.kind==='memoryEdit'||action.kind==='memoryDelete'||action.kind==='memoryOpenFile'){
        const tab=sheetRef.current?.name==='memory'?sheetRef.current.panel.tab:0;
        try{
          if(action.kind==='memoryOpenFile'){openFileInEditor({file:action.path,editor:externalEditor()});setToast(t('panel.memory.opened',{file:action.path.split(/[\\/]/u).pop()!}));return;}
          if(action.kind==='memoryAdd'){const added=await memoryFacade().add({title:action.title,content:action.title,kind:action.you?'preference':'project_fact'});
            setToast(added.duplicateDecision==='created'?t('panel.memory.added'):t('panel.memory.exists',{title:added.memory.title}));await openMemory({tab:added.memory.kind==='preference'?1:0,id:added.memory.id});return;}
          if(action.kind==='memoryEdit'){await memoryFacade().update(action.id,{title:action.title});setToast(t('panel.memory.saved'));await openMemory({tab,id:action.id});return;}
          const title=(await memoryFacade().list()).rows.find(row=>row.id===action.id)?.title??'';
          await memoryFacade().delete(action.id);setToast(t('panel.memory.deleted',{title:[...title].slice(0,30).join('')}));await openMemory({tab});
        }catch(error){addLocal(screenErrorText(error,act('screen.action.memoryCenter')));}
        return;
      }
      /* stage 7.21: /permissions — Mode as Shift+Tab does it (Full access keeps its confirmation), rules through the settings */
      if(action.kind==='permissionMode'){
        const consent=fullAccessConsentRef.current,sessionId=controller.current();
        if(consent.sessionId!==null&&consent.sessionId!==sessionId)fullAccessConsentRef.current={sessionId,confirmed:false};
        if(action.mode==='bypassPermissions'&&!fullAccessConsentRef.current.confirmed){showFullAccessPrompt(0);return;}
        await applyMode(action.mode);setToast(t('panel.permissions.modeSet',{label:action.label}));return;
      }
      if(action.kind==='ruleAdd'||action.kind==='ruleEffect'||action.kind==='ruleEdit'||action.kind==='ruleDelete'){
        try{
          if(action.kind==='ruleAdd'){await addRule({paths,projectRoot},{scope:action.scope,effect:action.effect,rule:action.rule});await afterRuleChange(t('panel.permissions.ruleAdded',{effect:action.effect,rule:action.rule}),rows=>rows.findIndex(row=>row.rule===action.rule.trim()&&row.effect===action.effect));return;}
          const row=ruleRowsRef.current[action.index];if(!row){await openPermissions({tab:1});return;}
          if(action.kind==='ruleEffect'){await changeRule({paths,projectRoot},row,{effect:action.effect});await afterRuleChange(t('panel.permissions.ruleIs',{rule:row.rule,effect:action.effect}),rows=>rows.findIndex(next=>next.rule===row.rule&&next.effect===action.effect));return;}
          if(action.kind==='ruleEdit'){await changeRule({paths,projectRoot},row,{rule:action.rule});await afterRuleChange(t('panel.permissions.ruleSaved'),rows=>rows.findIndex(next=>next.rule===action.rule.trim()&&next.effect===row.effect));return;}
          await changeRule({paths,projectRoot},row,null);await afterRuleChange(t('panel.permissions.ruleDeleted'),()=>action.index);
        }catch(error){addLocal(screenErrorText(error,act('screen.action.permissionRules')));await openPermissions({tab:1,sel:action.kind==='ruleAdd'?0:action.index}).catch(()=>{});}
        return;
      }
      /* stage 7.20: /notes — each change goes through the notes store, then the sheet reads it back; v edits the whole note in the editor */
      if(action.kind==='noteAttach'){
        try{const reference=await notesFacade().composerReference(action.id);const existing=currentEditor().text;setEditorText(existing.trim()?existing+'\n\n'+reference:reference);}
        catch(error){addLocal(screenErrorText(error,act('screen.action.noteAttach')));}
        return;
      }
      if(action.kind==='noteAdd'||action.kind==='noteEdit'||action.kind==='noteOpen'||action.kind==='noteDelete'){
        try{
          const rows=(await notesFacade().list()).rows;const note=rows.find(row=>row.id===(action.kind==='noteAdd'?'':action.id));
          if(action.kind==='noteAdd'){const before=new Set(rows.map(row=>row.id));await notesFacade().add({title:action.title,content:`## ${action.title}\n`});setToast(t('panel.notes.added'));const added=(await notesFacade().list()).rows.find(row=>!before.has(row.id));await loadNotesCenter(added?.id);return;}
          if(!note){await loadNotesCenter();return;}
          if(action.kind==='noteEdit'){await notesFacade().update(note.id,{title:action.title});setToast(t('panel.notes.saved'));await loadNotesCenter(note.id);return;}
          if(action.kind==='noteOpen'){
            const edited=String(await editExternally({text:note.content,editor:externalEditor(),tmpRoot:paths.cacheRoot})??'');
            if(edited===note.content)return;
            await notesFacade().update(note.id,{content:edited});setToast(t('panel.notes.opened'));await loadNotesCenter(note.id);return;
          }
          await notesFacade().delete(note.id);setToast(t('panel.notes.deleted',{title:[...note.title].slice(0,30).join('')}));await loadNotesCenter();
        }catch(error){addLocal(screenErrorText(error,act('screen.action.notesCenter')));}
        return;
      }
      /* stage 7.17: Enter on /help opens the command, as if typed */
      if(action.kind==='runCommand'){await executeSlashRef.current(`/${action.name}`);return;}
      /* stage 7.16: o on /diff opens the file in the editor (the one /config names, or $VISUAL/$EDITOR) */
      if(action.kind==='diffOpen'){try{openFileInEditor({file:join(projectRoot,action.path),editor:externalEditor()});setToast(t('panel.diff.opened',{path:action.path}));}catch(error){addLocal(screenErrorText(error,act('screen.action.externalEditor')));}return;}
      /* stage 7.14 (owner 03/10): during a turn Enter steers it with the message; at rest it is sent now as a new turn. A queued
         command never steers: it runs when the turn ends. */
      /* F-Q1 (owner 03/10): a message in the kernel's queue — Enter steers the turn with it now; at rest it is sent as a turn */
      if(action.kind==='queueSend'&&action.id.startsWith('kernel:')){
        const id=action.id.slice(7),item=controller.kernelQueue().items.find((row:any)=>row.id===id);if(!item?.text)return;
        try{
          if(state.running){const outcome=await controller.steerKernelQueued(id,{running:true});if(outcome.status==='requested')setToast(t('panel.queue.steered'));return;}
          if(!await controller.deleteKernelQueued(id)){setToast(t('panel.queue.delivered'));return;}
          await controller.send(item.text,{model:controller.model(),running:false});setToast(t('panel.queue.sentNow'));
        }catch(error:any){if(error?.code==='QUEUE_ENTRY_DELIVERED')setToast(t('panel.queue.delivered'));else addLocal(screenErrorText(error,act('screen.action.queueDispatch')));}
        return;
      }
      if(action.kind==='queueEdit'&&action.id.startsWith('kernel:')){try{await controller.editKernelQueued(action.id.slice(7),action.text);setToast(t('panel.queue.saved'));refreshQueueSheet();}catch(error:any){if(error?.code==='QUEUE_ENTRY_DELIVERED')setToast(t('panel.queue.delivered'));else addLocal(screenErrorText(error,act('screen.action.queueEdit')));}return;}
      if(action.kind==='queueDelete'&&action.id.startsWith('kernel:')){try{const item=controller.kernelQueue().items.find((row:any)=>row.id===action.id.slice(7));if(await controller.deleteKernelQueued(action.id.slice(7)))setToast(t('panel.queue.deleted',{text:[...(item?.text??'')].slice(0,30).join('')}));else setToast(t('panel.queue.delivered'));refreshQueueSheet();}catch(error){addLocal(screenErrorText(error,act('screen.action.queueDelete')));}return;}
      if(action.kind==='queueSend'){
        const entry=controller.queueEntries().find((row:TuiQueueEntry)=>row.id===action.id);if(!entry)return;
        try{
          if(state.running){
            if(entry.kind!=='prompt'){addLocal(t('panel.queue.commandWaits'));return;}
            const outcome=await controller.steer(entry.text,{running:true});if(outcome.status!=='requested')return;
            await controller.deleteQueue(entry.id);setToast(t('panel.queue.steered'));return;
          }
          await controller.sendQueuedNow(entry.id);setToast(t('panel.queue.sentNow'));
        }catch(error){addLocal(screenErrorText(error,act('screen.action.queueDispatch')));}
        return;
      }
      /* the sheet stays open on u, n, e and d; it follows the queue through refreshQueueSheet */
      if(action.kind==='queueMove'){try{await controller.moveQueue(action.id,-1);const body=sheetRef.current?.panel.tabs[0]?.body;if(body?.kind==='list'&&sheetRef.current)setSheet({...sheetRef.current,panel:{...sheetRef.current.panel,tabs:[{...sheetRef.current.panel.tabs[0]!,body:{...body,sel:Math.max(0,body.sel-1)}}]}});refreshQueueSheet();}catch(error){addLocal(screenErrorText(error,act('screen.action.queueMove')));}return;}
      if(action.kind==='queueAdd'){try{const out=await controller.send(action.text,{model:controller.model(),running:state.running});setToast(out.queued?t('panel.queue.added'):t('panel.queue.sentNow'));refreshQueueSheet();}catch(error){addLocal(screenErrorText(error,act('screen.action.queueEdit')));}return;}
      if(action.kind==='queueEdit'){try{await controller.editQueue(action.id,action.text);setToast(t('panel.queue.saved'));refreshQueueSheet();}catch(error){addLocal(screenErrorText(error,act('screen.action.queueEdit')));}return;}
      if(action.kind==='queueDelete'){try{const removed=await controller.deleteQueue(action.id);if(removed)setToast(t('panel.queue.deleted',{text:[...removed.text].slice(0,30).join('')}));refreshQueueSheet();}catch(error){addLocal(screenErrorText(error,act('screen.action.queueDelete')));}return;}
      /* stage 7.13: the screen is cleared, the conversation stays (Gemini CLI's Ctrl+L; Claude Code #45878) */
      if(action.kind==='usageSession'){openSettings('usage');return;}
      if(action.kind==='capability'){await actOnCapability(action);return;}
      if(action.kind==='automation'){await actOnAutomation(action);return;}
      if(action.kind==='forge'){await actOnForge(action);return;}
      if(action.kind==='research'){await actOnResearch(action);return;}
      if(action.kind==='processes'){await actOnProcesses(action);return;}
      if(action.kind==='devices'){if(action.verb==='pair'){startRemotePairing();return;}await revokeDevice(action.id??'');return;}
      if(action.kind==='doctor'){if(action.verb==='recheck'){/* the page stays open: the toast says it is checking until the new report replaces it */setToast(t('panel.doctor.checking'));await openDoctor(action.id??null);return;}await exportDoctor();return;}
      if(action.kind==='modelFavourite'){try{await runtime.modelPreferences?.({azione:'preferito',modello:action.id,attivo:action.on});}catch(error){addLocal(screenErrorText(error,act('screen.action.modelPicker')));}return;}
      if(action.kind==='contextChange'){await changeContext(action);return;}
      if(action.kind==='deleteSessions'){
        /* one at a time: the kernel can refuse one (still running) and the others stay as they are */
        let deleted=0;const store=createSessionMetadataStore({rootDir:sessionMetadataRoot(paths.dataRoot)});
        for(const id of action.ids){
          try{if(!runtime.deleteSession)throw Object.assign(new Error('SESSION_DELETE_UNAVAILABLE'),{code:'SESSION_DELETE_UNAVAILABLE'});await runtime.deleteSession(id);deleted+=1;await store.remove(id).catch(()=>{});}
          catch(error){addLocal(screenErrorText(error,act('screen.action.sessionAction')));}
        }
        if(deleted)addLocal(tn('panel.resume.deletedMany',deleted));
        await loadResumeSheet();return;
      }
      if(action.kind==='exportSessions'){
        let exported=0;
        for(const {id,title} of action.ids){
          try{await exportChosen({payload:runtime.export(id),projectRoot,choice:{to:'file',format:'md',toolOutput:false,thinking:false,file:exportFileName(title,id,'md')},secrets:secretValuesFromEnvironment(process.env)});exported+=1;}
          catch(error){addLocal(screenErrorText(error,act('screen.action.command',{command:'export'})));}
        }
        if(exported)addLocal(tn('panel.resume.exportedMany',exported,{folder:basename(projectRoot)}));
        return;
      }
      if(action.kind==='openFolder'){
        const background=state.sessionId&&runtime.backgroundCommandCount?await Promise.resolve(runtime.backgroundCommandCount(state.sessionId)).catch(()=>0):0;
        const reasons=[...(state.running?[t('panel.new.busy.turn')]:[]),...(workingAgents(state.agents).length?[t('panel.new.busy.agents')]:[]),...(background?[t('panel.new.busy.background')]:[]),...(currentEditor().text.trim()?[t('panel.new.busy.draft')]:[]),...(queueSheetEntries().length?[t('panel.new.busy.queue')]:[])];
        if(reasons.length&&!action.confirmed){setSheet(leaveSheet(action.path,reasons));return;}
        requestRelaunch(action.path);inkApp.exit();return;
      }
      if(action.kind==='openNew'){await openShelf(action.tab);return;}
      if(action.kind==='newSetup'){
        if(action.effort&&action.effort!==reasoningEffort)await executeSlashRef.current(`/effort ${action.effort}`);
        const now=controller.mode(),target=action.plan?'plan':action.mode;
        if(target===now)return;
        if(target==='bypassPermissions'&&!fullAccessConsentRef.current.confirmed){showFullAccessPrompt(0);return;}
        await applyMode(target as PermissionMode);return;
      }
      if(action.kind==='clearScreen'){setClearedIds(new Set((state.transcript.items as TranscriptItem[]).map(item=>item.id)));setTranscriptSelectedId(null);setTranscriptRevealId(null);setViewport((view:TranscriptViewport)=>({...view,offset:0,unseen:0,followingTail:true}));setToast(t('panel.clear.cleared'));return;}
      /* a new conversation: the next message starts it; this one stays in /resume (Claude Code /clear) */
      if(action.kind==='newConversation'){
        try{controller.startFresh({running:state.running});}catch{addLocal(t('panel.clear.busy'));return;}
        /* riga 224: Full access never passes into a new conversation, as with /resume and /fork (changeSession); confirmed again there */
        if(controller.mode()==='bypassPermissions')void controller.setMode('default');fullAccessConsentRef.current={sessionId:null,confirmed:false};
        freshView();messageStampsRef.current.clear();setState((current:TuiState)=>({...current,sessionId:null,status:{...current.status,permissionMode:controller.mode()}}));addLocal(t('panel.clear.started'));return;
      }
      if(action.kind==='resume'||action.kind==='fork'){
        /* R4-N (review D-08): a second Enter while a session is being attached does nothing */
        if(sessionConfirmingRef.current)return;sessionConfirmingRef.current=true;
        try{freshView();const id=await changeSession(action.kind,action.id);if(id&&action.kind==='fork')addLocal(t('screen.session.forked',{from:action.title,id}));}
        catch(error){addLocal(screenErrorText(error,act('screen.action.sessionAction')));}
        finally{sessionConfirmingRef.current=false;}
        return;
      }
      if(action.kind==='provider'){
        const row=(providerPickerRef.current?.rows()??providerRows).find((candidate:TuiProvider)=>candidate.id===action.id);if(!row)return;
        /* the picker's steps (consent, browser login, key) show in its window; the choice ends in /model */
        providerViaSheetRef.current=true;applyOverlay({kind:'provider'});setProviderStep({kind:'list'});
        await routeProviderSelection(row);return;
      }
      if(action.kind==='providerKey'){
        let key=action.key;const row=(providerPickerRef.current?.rows()??providerRows).find((candidate:TuiProvider)=>candidate.id===action.id);
        try{const result=await catalog.setProviderKey(action.id,key);addLocal(result.saved?t('panel.provider.keySaved',{provider:row?.label??action.id}):result.message);}
        catch(error){addLocal(screenErrorText(codeOnly(error),act('screen.action.keyTest')));}
        finally{key='';}
        await loadProviderSheet();return;
      }
      if(action.kind==='providerTest'){
        const row=(providerPickerRef.current?.rows()??providerRows).find((candidate:TuiProvider)=>candidate.id===action.id);const label=row?.label??action.id;
        try{const probe=await catalog.probeProvider(action.id);
          if(row&&signsIn(row)&&probe.readinessCode==='PROVIDER_SIGN_IN_REQUIRED'){addLocal(t(row.keySource==='saved'?'panel.setup.signInPlanNeeded':'panel.provider.notSignedInTest',{provider:label}));return;}
          addLocal(probe.state==='available'?t('panel.provider.answers',{provider:label,latency:probe.latencyMs!==null?t('panel.provider.latency',{ms:probe.latencyMs}):''}):t('panel.provider.noAnswer',{provider:label,detail:probe.remediation?.message||probe.detail}));}
        catch(error){addLocal(screenErrorText(codeOnly(error),act('screen.action.healthCheck',{provider:label})));}
        return;
      }
      if(action.kind==='model'){
        const row=modelSheetRowsRef.current.find(candidate=>candidate.id===action.id);if(!row)return;
        void runtime.modelPreferences?.({azione:'usato',modello:action.id}).catch(()=>{});
        if(reasoningEffortChoices(row).length){await applyEffortChoice(row,action.effort as ReasoningEffortChoice);return;}
        await useModelWithoutEffort(row);return;
      }
      if(action.kind==='undoFiles'){
        const store=checkpointStoreFor();const session=state.sessionId??controller.current()??null;if(!store||!session)return;
        const rows=(await sessionCheckpoints(store,session).catch(()=>[])).filter(row=>row.state==='complete'||row.state==='undone');
        const selected=rows.findIndex(row=>row.id===action.id);if(selected<0){addLocal(t('panel.undo.none'));return;}
        await runUndo({rows,selected,confirm:1});return;
      }
      if(action.kind==='undoCut'){
        /* owner 03/10: the conversation goes back by a fork just before that turn; the conversation of now stays in /resume.
           «code and conversation» first puts the files back to that point, then forks. */
        const from=state.sessionId??controller.current()??null;const store=checkpointStoreFor();if(!from)return;
        const points=sheetPointsRef.current;const point=points.find(p=>p.id===action.id);
        if(!point?.runId){addLocal(t('panel.undo.noTurn'));return;}
        if(action.files&&store){
          const rows=(await sessionCheckpoints(store,from).catch(()=>[])).filter(row=>row.state==='complete'||row.state==='undone');
          const selected=rows.findIndex(row=>row.id===action.id);
          if(selected>=0&&rows[selected]!.state!=='undone')await runUndo({rows,selected,confirm:1});
        }
        await forkBeforeTurn(from,point.runId,point.label,'undo');return;
      }
      if(action.kind==='export'){
        const id=state.sessionId??controller.current()??null;
        try{
          const done=await exportChosen({payload:id?runtime.export(id):null,projectRoot,choice:action,secrets:secretValuesFromEnvironment(process.env)});
          if(action.to==='file'){addLocal(t('panel.export.saved',{file:action.file,size:sizeText(done.bytes)}));return;}
          const copied=await copyText(done.body,{writeTerminal:sequence=>{stdout.write(sequence);}});
          addLocal(copied.ok?t('panel.export.copied',{size:sizeText(done.bytes)}):t('screen.selection.failed'));
        }catch(error:any){addLocal(error?.code==='SESSION_NOT_FOUND'?t('screen.export.nothing'):screenErrorText(error,act('screen.action.command',{command:'export'})));}
        return;
      }
      if(action.kind==='forkHere'){
        const from=state.sessionId??controller.current()??null;if(!from)return;
        if(action.beforeRun){await forkBeforeTurn(from,action.beforeRun,action.text,'fork');return;}
        if(sessionConfirmingRef.current)return;sessionConfirmingRef.current=true;
        try{
          const store=createSessionMetadataStore({rootDir:sessionMetadataRoot(paths.dataRoot)});
          const meta=await store.get(from).catch(()=>null);const title=meta?.name??meta?.firstMessage??'';
          freshView();const id=await changeSession('fork',from);
          /* the fork is named after the conversation it came from, as the mockup says: «Flaky login test (fork)» */
          const name=title?t('panel.fork.name',{name:[...title].length>73?[...title].slice(0,72).join('')+'…':title}):'';
          if(typeof id==='string'&&id&&name)await store.setName(id,name).catch((error:unknown)=>developmentLogError('ui.session.fork_name',error,{},'tui'));
          const message=[...action.text].length>50?[...action.text].slice(0,49).join('')+'…':action.text;
          addLocal(t('panel.fork.done',{message,name:name||String(id)}));
        }catch(error){addLocal(screenErrorText(error,act('screen.action.sessionAction')));}
        finally{sessionConfirmingRef.current=false;}
        return;
      }
      if(action.kind==='renameSession'){
        try{await createSessionMetadataStore({rootDir:sessionMetadataRoot(paths.dataRoot)}).setName(action.id,action.name);addLocal(action.notice);}
        catch(error:any){addLocal(error?.code==='SESSION_METADATA_INVALID'?t('screen.usage.rename'):screenErrorText(error,act('screen.action.command',{command:'resume'})));}
        return;
      }
      if(action.kind==='deleteSession'){
        /* the kernel deletes it (or refuses, e.g. still running); then what the CLI kept about it goes too. A refusal shows the
           list as it really is again. */
        try{if(!runtime.deleteSession)throw Object.assign(new Error('SESSION_DELETE_UNAVAILABLE'),{code:'SESSION_DELETE_UNAVAILABLE'});await runtime.deleteSession(action.id);}
        catch(error){addLocal(screenErrorText(error,act('screen.action.sessionAction')));await loadResumeSheet();return;}
        await createSessionMetadataStore({rootDir:sessionMetadataRoot(paths.dataRoot)}).remove(action.id).catch((error:unknown)=>developmentLogError('ui.session.metadata_remove',error,{},'tui'));
        addLocal(t('panel.resume.deleted',{name:action.title}));return;
      }
      if(action.kind==='rename'){
        if(!state.sessionId){addLocal(t('screen.rename.noSession'));return;}
        try{await createSessionMetadataStore({rootDir:sessionMetadataRoot(paths.dataRoot)}).setName(state.sessionId,action.name);addLocal(action.notice);}
        catch(error:any){addLocal(error?.code==='SESSION_METADATA_INVALID'?t('screen.usage.rename'):screenErrorText(error,act('screen.action.command',{command:'rename'})));}
        return;
      }
      if(action.kind==='effort'){const row=effortRowRef.current;if(row)await applyEffortChoice(row,action.level as ReasoningEffortChoice);return;}
      if(action.kind==='history'){restoreDraft(action.draft);return;}
      /* stage 7.15: the mockup says a copy with its toast (/copy and /history alike) */
      if(action.kind==='copy'){const result=await copyText(action.text,{writeTerminal:sequence=>{stdout.write(sequence);}});if(result.ok)setToast(action.notice);else addLocal(t('screen.selection.failed'));return;}
    };
    const runSheetStep=(step:PanelStep)=>{const current=sheetRef.current;if(!current)return;const out=sheetStep(current,step);setSheet(out.sheet);if(out.sheet?.name==='library')readChosenPreview();if(out.action)void applySheetAction(out.action);};
    runSheetStepRef.current=runSheetStep;
    /* Ink's key as the sheet names it (the mockup's names); text typed or pasted goes in one character at a time */
    const sheetKeysOf=(ch:string,key:any):SheetKey[]=>{
      if(key.return)return[{name:'Enter'}];if(key.escape)return[{name:'Escape'}];if(key.tab)return[{name:'Tab',shift:Boolean(key.shift)}];
      if(key.backspace||key.delete)return[{name:'Backspace'}];
      if(key.upArrow)return[{name:'ArrowUp'}];if(key.downArrow)return[{name:'ArrowDown'}];if(key.leftArrow)return[{name:'ArrowLeft'}];if(key.rightArrow)return[{name:'ArrowRight'}];
      if(key.pageUp||key.pageup)return[{name:'PageUp'}];if(key.pageDown||key.pagedown)return[{name:'PageDown'}];
      /* two Tabs read in one chunk arrive as text: each is still the Tab key (the setup's tabs). Stage 7.17 (measured): two
         Enters read in one chunk split into a return and a bare line feed, which is still an Enter (/help's search, then open) */
      return ch?[...ch].map(name=>name===String.fromCharCode(9)?{name:'Tab'}:name===String.fromCharCode(10)||name===String.fromCharCode(13)?{name:'Enter'}:{name,ctrl:Boolean(key.ctrl)}):[];
    };
    const handleSheetKey=(ch:string,key:any)=>{
      const current=sheetRef.current;if(!current)return;
      const body=current.panel.tabs[current.panel.tab]!.body;
      /* Ctrl+C is a form's other button (the mockup's export copy); elsewhere it closes the sheet */
      if(key.ctrl&&(ch==='c'||ch==='C')&&!(body.kind==='form'&&body.alt)){setSheet(null);return;}
      /* a page still loading keeps what is typed (Esc still closes it): the page that comes takes it */
      if(current.name==='loading'&&!key.escape){typedWhileLoadingRef.current.push(...sheetKeysOf(ch,key));return;}
      for(const sheetKey of sheetKeysOf(ch,key)){const now=sheetRef.current;if(!now)return;runSheetStep(panelKey(now.panel,sheetKey));}
    };
    /*
     * 0.6.15 remote control: a device's folder request (the window's remote snapshot) takes the card the moment it exists, and
     * leaves when it is answered, expires or is answered elsewhere. Review block 3 of the Desktop (26/10/2026):
     * - R-B, R-C: it opens only when nothing else holds the keys — no overlay, no confirmation (Full access, a request too large,
     *   exit), no sheet, centre, picker, agent view or transcript mode (the owners `handleInput` serves before the cards). If one
     *   opens while the card is up, the card steps aside and comes back after it, with a new grace: a key meant for the card
     *   never lands on «Enable Full access?»;
     * - R-A: a request that leaves while the card is covered leaves the focus stack too, or the composer gets no key once the
     *   approval that covered it closes;
     * - every showing starts the grace again (a key typed for something else never answers it); a snapshot that changes for
     *   another reason (a device going online) does not.
     */
    const overlayKind=appState.overlay?.kind??null;
    /* review 5 (D-1): the agents panel holds ↑/↓ and Enter as `handleInput`'s `dockKeys` does (open as a panel, wide enough, the
       composer empty, an agent on it); the card waits while it is in use, and a tick lets it open once the panel is idle */
    const panelInUse=consentPanelInUse({holdsKeys:panelFocused&&panelColumnsRef.current>0&&!agentsSurface.page,lastKeyAt:panelKeyAt},clockRef.current());
    React.useEffect(()=>{
      if(!panelInUse||!remoteSnapshot.consents.length||panelKeyAt===null)return;
      const timer=setTimeout(()=>setPanelIdleTick((n:number)=>n+1),Math.max(50,CONSENT_PANEL_IDLE_MS-(clockRef.current()-panelKeyAt)));
      return()=>clearTimeout(timer);
    });
    const consentBlocked=consentCardWaits({overlay:overlayKind,panelInUse,fullAccess:fullAccessPrompt!==null,tooLarge:tooLargePrompt!==null,exit:exitPrompt!==null,
      commandMenu:appState.focus.current==='command-menu',nativeScrollback,sheet:Boolean(sheet),transcriptMode:Boolean(transcriptMode),
      panel:Boolean(queueEditor||transcriptSearch||contextInspector||themePicker||configPanel||historyPicker||agentsSurface.page||agentView
        ||trustCenter||mcpCenter||hookCenter||pluginCenter||memoryCenter||notesCenter||tasksCenter||libraryCenter||researchCenter||automationCenter||forgeCenter)});
    React.useEffect(()=>{
      const next=remoteSnapshot.consents[0]??null;
      if(!next){
        if(consentRef.current){consentRef.current=null;consentShownRef.current=null;setConsentCard(null);}
        setAppState((current:TuiAppState)=>{
          if(current.overlay?.kind==='consent')return closeOverlay(current);
          const focus=dropFocus(current.focus,'consent');
          return focus===current.focus?current:{...current,focus};
        });
        return;
      }
      if(consentBlocked){
        if(overlayKind==='consent'){consentShownRef.current=null;setAppState((current:TuiAppState)=>current.overlay?.kind==='consent'?closeOverlay(current):current);}
        return;
      }
      if(overlayKind==='consent'&&consentRef.current?.richiestaId===next.richiestaId)return;
      const now=clockRef.current();
      /* R-D (27/10/2026): shown again after an interruption, the card starts on «Not now» — a choice made before it was hidden is not
         kept, so a key meant for what interrupted never gives the folder away (Mozilla bug 1335985 and CVE-2024-2609, Chromium's input
         protector for keys, Apple HIG: never the default role for the action that grants) */
      consentRef.current=openConsentCard(next);
      consentShownRef.current={requestId:next.richiestaId,shownAt:now,answered:false};
      setConsentCard(consentRef.current);setConsentNow(now);
      setAppState((current:TuiAppState)=>openOverlay(current,{kind:'consent',requestId:next.richiestaId}));
    },[remoteSnapshot.consents,overlayKind,consentBlocked]);
    /* the card's countdown: one tick a second, only while it is on screen (a hidden card does not redraw the window) */
    const consentOnScreen=overlayKind==='consent'&&consentCard!==null;
    React.useEffect(()=>{
      if(!consentOnScreen)return;
      const timer=setInterval(()=>setConsentNow(clockRef.current()),1000);
      return()=>clearInterval(timer);
    },[consentOnScreen,consentCard?.richiestaId]);
    /* The card's clock: one tick a second, only while a card with a deadline is open. */
    React.useEffect(()=>{
      if(!questionCard||questionCard.deadline===null)return;
      const timer=setInterval(()=>{const now=clockRef.current();setQuestionNow(now);const card=questionRef.current;if(card)sendQuestionOutcome(questionCardTick(card,now));},1000);
      return()=>clearInterval(timer);
    },[questionCard?.requestId,questionCard?.deadline]);

    Ink.useInput((rawCh:string,rawKey:any)=>{
      /* R3-KEYS: a mixed chunk is its leading key, then text with no control character. */
      for(const part of splitInputChunk(rawCh,rawKey))handleInput(part.ch,part.key);
    });
    const handleInput=(ch:string,key:any)=>{
      if(nativeScrollbackRef.current){if(key?.escape||ch==='q'||ch==='Q')leaveScrollback();return;}
      /* Stage 6c (the mockup's keydown): Ctrl+C with a selection copies it — the VS Code terminal passes Ctrl+C to TALOS — instead
         of interrupting; any other key takes the selection away. */
      /* the copy reads the text at once; then the selection goes, as in Windows Terminal and VS Code, so the next Ctrl+C
         means what it always means */
      if(key?.ctrl&&!key.meta&&(ch==='c'||ch==='C')&&props.mouseSelection?.active()){void props.mouseSelection.copyAgain();props.mouseSelection.key();return;}
      props.mouseSelection?.key();
      const fullAccessSelection=fullAccessPromptRef.current;
      if(fullAccessSelection!==null){
        if(key.escape||(key.ctrl&&(ch==='c'||ch==='C'))){showFullAccessPrompt(null);return;}
        if(key.upArrow||key.leftArrow){showFullAccessPrompt(0);return;}
        if(key.downArrow||key.rightArrow){showFullAccessPrompt(1);return;}
        if(key.return){showFullAccessPrompt(null);if(fullAccessSelection===1)void applyMode('bypassPermissions',true);return;}
        return;
      }
      /* 0.6.13: the request-too-large dialog, keys as the Full access confirmation; Esc and «Edit the message» leave the text */
      const tooLarge=tooLargePromptRef.current;
      if(tooLarge){
        if(key.escape||(key.ctrl&&(ch==='c'||ch==='C'))){showTooLargePrompt(null);return;}
        /* review 9 F3: not attachable ⇒ «Edit the message» is the only choice; Enter closes and the text stays */
        const attachable=requestTooLargeAttachable(tooLarge.facts);
        if(attachable&&(key.upArrow||key.leftArrow)){showTooLargePrompt({...tooLarge,selected:0});return;}
        if(attachable&&(key.downArrow||key.rightArrow)){showTooLargePrompt({...tooLarge,selected:1});return;}
        if(key.return){showTooLargePrompt(null);if(attachable&&tooLarge.selected===0)void sendAsAttachment(tooLarge);return;}
        return;
      }
      /* ASYNC step 4: the /exit question while delegated agents work — wait for them, stop them, or stay. */
      const exitSelection=exitPromptRef.current;
      if(exitSelection!==null){
        if(key.escape||(key.ctrl&&(ch==='c'||ch==='C'))){showExitPrompt(null);return;}
        if(key.upArrow||key.leftArrow){showExitPrompt((exitSelection+EXIT_CHOICES.length-1)%EXIT_CHOICES.length);return;}
        if(key.downArrow||key.rightArrow||key.tab){showExitPrompt((exitSelection+1)%EXIT_CHOICES.length);return;}
        if(key.return){chooseExit(exitSelection);return;}
        return;
      }
      /* While «wait for them, then exit» runs, Esc stays (the line says so); every other key works as usual. */
      if(exitWaitRef.current&&key.escape&&!dialogOpen()){startExitWait(null);addLocal(t('screen.exitAgents.waitCancelled'));return;}
      const approvalGate=approvalInputGate(approvalShownRef.current,clockRef.current());
      if(approvalGate==='dialog'){coordinator.immediate('approval',()=>handleApprovalKey(ch,key));return;}
      /* Stage 3: the question card takes every key after its grace, like the approval dialog. */
      const questionGate=questionRef.current?approvalInputGate(questionShownRef.current,clockRef.current()):'none';
      if(questionGate==='dialog'){coordinator.immediate('approval',()=>handleQuestionKey(ch,key));return;}
      const planGate=planRef.current?approvalInputGate(planShownRef.current,clockRef.current()):'none';
      if(planGate==='dialog'){coordinator.immediate('approval',()=>handlePlanKey(ch,key));return;}
      const elicitGate=elicitRef.current?approvalInputGate(elicitShownRef.current,clockRef.current()):'none';
      if(elicitGate==='dialog'){coordinator.immediate('approval',()=>handleElicitKey(ch,key));return;}
      const consentGate=consentRef.current&&appState.overlay?.kind==='consent'?approvalInputGate(consentShownRef.current,clockRef.current()):'none';
      if(consentGate==='dialog'){coordinator.immediate('approval',()=>handleConsentKey(ch,key));return;}
      /* T4: `/remote` takes its keys while its card is up (an approval or a question that arrives meanwhile comes first, above);
         Ctrl+C closes it, as Esc does */
      if(appState.overlay?.kind==='remote'){
        if(key?.ctrl&&(ch==='c'||ch==='C')){feedRemoteKey(null);return;}
        const pairingKey=pairingKeyOf(ch,key);if(pairingKey)feedRemoteKey(pairingKey);
        return;
      }
      /* FE-048: the keys of the frame reach it from the composer and from a sheet, never past a card */
      if(approvalGate==='none'&&questionGate==='none'&&planGate==='none'&&elicitGate==='none'&&consentGate==='none'){
        const frameAction=resolveKeybinding(ch,key,['global']);
        if(frameAction==='view-zen'){showFrameView(nextFrameView(frameViewRef.current,beforeZenRef.current));return;}
        if(frameAction==='view-bar'){toggleBar();return;}
        if(frameAction==='view-panel'){togglePanel();return;}
        if(frameAction==='view-home'){void executeSlashRef.current('/home');return;}
        if(frameAction==='view-context'){void executeSlashRef.current('/context');return;}
        if(frameAction==='view-new'){void executeSlashRef.current('/new');return;}
        if(frameAction==='view-centre'){if(sheetRef.current?.panel.page)setSheet(null);else void executeSlashRef.current('/diff');return;}
        if(frameAction==='view-card-1'||frameAction==='view-card-2'){openPanelCard(frameAction==='view-card-1'?'context':'agents');return;}
        if(barFocused&&barOpen&&barColumnsRef.current>0&&handleBarKey(ch,key))return;
        if(panelFocused&&panelColumnsRef.current>0&&!agentsSurface.page&&handlePanelKey(ch,key))return;
      }
      /* Stage 7.3: an open sheet takes every key, as a card does (it stands in the composer's place) */
      if(sheetRef.current&&consentGate==='none'&&elicitGate==='none'&&planGate==='none'&&questionGate==='none'&&approvalGate==='none'){coordinator.immediate('approval',()=>handleSheetKey(ch,key));return;}
      /* stage 7.12: the transcript mode owns every key while it is open */
      if(transcriptModeRef.current&&consentGate==='none'&&elicitGate==='none'&&planGate==='none'&&questionGate==='none'&&approvalGate==='none'){coordinator.immediate('approval',()=>handleTranscriptModeKey(ch,key));return;}
      /* In the grace the key belongs to what is under the dialog, and only the composer takes it. */
      const graceComposer=approvalGate==='grace'||questionGate==='grace'||planGate==='grace'||elicitGate==='grace'||consentGate==='grace';
      const focusNow=graceComposer&&(appState.focus.current==='approval'||appState.focus.current==='question'||appState.focus.current==='plan'||appState.focus.current==='elicit'||appState.focus.current==='consent')?(appState.focus.stack.at(-1)??'composer'):appState.focus.current;
      if(graceComposer&&focusNow!=='composer')return;
      const keysOwner=Boolean(fullAccessPrompt!==null||tooLargePrompt!==null||exitPrompt!==null||(appState.overlay&&!(graceComposer&&(appState.overlay.kind==='approval'||appState.overlay.kind==='question'||appState.overlay.kind==='plan'||appState.overlay.kind==='elicit'||appState.overlay.kind==='consent')))||queueEditor||transcriptSearch||contextInspector||themePicker||configPanel||historyPicker||agentsSurface.page||trustCenter||mcpCenter||hookCenter||pluginCenter||memoryCenter||notesCenter||tasksCenter||libraryCenter||researchCenter||automationCenter||forgeCenter||(pending&&!graceComposer));
      const modalOwner=keysOwner||Boolean(agentView);
      /* Stage 6a (owner 02/10): Ctrl+A cycles the agents (closed → panel → page → closed) only with the composer empty —
         with text it stays readline's line start; Alt+A always, also while an agent's conversation is watched. */
      const agentsKey=(ch==='a'||ch==='A')&&Boolean((key?.meta&&!key.ctrl)||(key?.ctrl&&!key.meta&&(agentsSurface.page!==null||!currentEditor().text)));
      if(agentsKey&&boot.phase==='ready'&&(agentsSurface.page!==null||!keysOwner)){cycleAgents();return;}
      /* R1 E15 / Q-R1-7 (no mouse capture): Ctrl+Home and Ctrl+End move the transcript to its first and newest rows, as in
         Claude Code fullscreen and Qwen Code. The keymap resolver drops Ctrl on Home/End, so they are read here first. */
      if(key?.ctrl&&(key.home||key.end)&&!modalOwner&&boot.phase==='ready'){scrollTranscript(key.home?'top':'jump-tail');return;}
      /* P13: the watched agent's transcript scrolls the same way (the view owns the composer, not the transcript). */
      if(agentView&&!agentsSurface.page&&!appState.overlay&&key?.ctrl&&(key.home||key.end)&&boot.phase==='ready'){scrollTranscript(key.home?'top':'jump-tail');return;}
      /* Lane O: the help overlay scrolls inside its budget; the keymap has no help-context scroll keys, so they are read here. */
      if(appState.overlay?.kind==='help'&&(key.pageUp||key.pageDown||key.upArrow||key.downArrow)){const step=key.pageUp||key.pageDown?helpPageRef.current:1,delta=key.pageUp||key.upArrow?-step:step;setHelpOffset((value:number)=>Math.max(0,Math.min(helpMaxOffsetRef.current,value+delta)));return;}
      const fastDecision=decideShellInput({
        ch,key,focus:focusNow,composerText:currentEditor().text,commandMenuOpen:focusNow==='command-menu',
        trustCenterOpen:Boolean(trustCenter),approvalExpanded,boot,keymap:effectiveKeymap,
      });
      const fastText=composerFastTextInput({bootPhase:boot.phase,focus:focusNow,modalOwner,vimMode:vim.enabled?vim.mode:'disabled',auxCount,key,routed:fastDecision.routed});
      if(fastText!==null){composerStore.update(editor=>editInsert(editor,fastText));return;}
      const fastPaste=composerFastPasteInput({bootPhase:boot.phase,focus:focusNow,modalOwner,vimMode:vim.enabled?vim.mode:'disabled',auxCount,key,routed:fastDecision.routed});
      if(fastPaste!==null){composerStore.update(editor=>applyComposerFastPasteInput(editor,fastPaste));return;}
      const fastEditorAction=composerFastEditorAction({bootPhase:boot.phase,focus:focusNow,modalOwner,vimMode:vim.enabled?vim.mode:'disabled',auxCount,routed:fastDecision.routed,editor:currentEditor()});
      if(fastEditorAction!==null){composerStore.update(editor=>applyComposerFastEditorAction(editor,fastEditorAction));return;}
      const historyPlan=planComposerHistoryAction({
        bootPhase:boot.phase,focus:focusNow,modalOwner,vimMode:vim.enabled?vim.mode:'disabled',auxCount,
        routed:fastDecision.routed,key,editor:currentEditor(),history,historyIndex:historyIndexRef.current,reverseIndex:reverseIndexRef.current,
      });
      if(historyPlan!==null){
        historyIndexRef.current=historyPlan.historyIndex;
        reverseIndexRef.current=historyPlan.reverseIndex;
        composerStore.replace(historyPlan.editor);
        return;
      }
      const commandQuery=commandMenuFastTextInput({bootPhase:boot.phase,focus:focusNow,modalOwner,key,routed:fastDecision.routed});
      if(commandQuery!==null){commandMenuSelectionStore.reset();composerStore.update(editor=>editInsert(editor,commandQuery));return;}
      coordinator.immediate('input',()=>{
      if(configPanel){
        if(key.escape||(key.ctrl&&(ch==='c'||ch==='C'))){configStore.close();return;}
        if(configPanel.busy)return;
        if(!configPanel.values){if(ch==='r'||ch==='R')void configStore.open();return;}
        if(key.upArrow){configStore.move(-1);return;}if(key.downArrow){configStore.move(1);return;}
        if(key.return||key.rightArrow){void configStore.change(1);return;}
        if(key.leftArrow){void configStore.change(-1);return;}
        return;
      }
      if(forgeCenter){
        if(key.ctrl&&(ch==='c'||ch==='C')){setForgeCenter(null);return;}
        if(key.escape||(ch==='q'&&!key.ctrl&&!key.meta)){setForgeCenter(null);return;}
        const loadSelected=(next:ForgeCenterModel)=>{setForgeCenter(next);const row=selectedForgeTool(next);if(row)void forgeFacade().read(row.id).then(detail=>setForgeCenter((current:ForgeCenterModel|null)=>current?setForgeCenterDetail(current,detail):current)).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.forgeDetail'))));};
        if(key.upArrow){loadSelected(moveForgeCenterSelection(forgeCenter,-1));return;}if(key.downArrow){loadSelected(moveForgeCenterSelection(forgeCenter,1));return;}
        const row=selectedForgeTool(forgeCenter);if(ch==='r'){void loadForgeCenter(row?.id);return;}if(!row)return;const ownerSessionId=state.sessionId;
        if(ch==='e'){if(!ownerSessionId){addLocal(t('screen.forge.needsSession'));return;}void forgeFacade().setEnabled(ownerSessionId,row.id,!row.enabled).then(()=>loadForgeCenter(row.id)).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.forgeToggle'))));return;}
        if(ch==='b'){if(!ownerSessionId){addLocal(t('screen.forge.rollbackNeedsSession'));return;}const versions=Array.isArray(forgeCenter.detail?.versions)?forgeCenter.detail.versions:[];const current=row.ownerRevision??Number.MAX_SAFE_INTEGER;const candidates=versions.map((v:any)=>Number(v.revision??v.ownerRevision)).filter((v:number)=>Number.isSafeInteger(v)&&v<current).sort((a:number,b:number)=>b-a);const target=candidates[0];if(!target){addLocal(t('screen.forge.noEarlierRevision'));return;}void forgeFacade().rollback(ownerSessionId,row.id,target).then(()=>loadForgeCenter(row.id)).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.forgeRollback'))));return;}
        return;
      }
      if(automationCenter){
        if(key.ctrl&&(ch==='c'||ch==='C')){setAutomationCenter(null);return;}
        if(key.escape||(ch==='q'&&!key.ctrl&&!key.meta)){setAutomationCenter(null);return;}
        const loadSelected=(next:AutomationCenterModel)=>{setAutomationCenter(next);const row=selectedAutomation(next);if(row)void automationFacade().read(row.id).then(detail=>setAutomationCenter((current:AutomationCenterModel|null)=>current?setAutomationCenterDetail(current,detail):current)).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.automationDetail'))));};
        if(key.upArrow){loadSelected(moveAutomationCenterSelection(automationCenter,-1));return;}
        if(key.downArrow){loadSelected(moveAutomationCenterSelection(automationCenter,1));return;}
        const row=selectedAutomation(automationCenter);if(ch==='u'){void loadAutomationCenter(row?.id);return;}if(ch==='d'&&row){void automationFacade().read(row.id).then(detail=>setAutomationCenter((current:AutomationCenterModel|null)=>current?setAutomationCenterDetail(current,detail):current)).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.automationDryRun'))));return;}return;
      }
      if(researchCenter){
        if(key.ctrl&&(ch==='c'||ch==='C')){setResearchCenter(null);return;}
        if(key.escape||(ch==='q'&&!key.ctrl&&!key.meta)){setResearchCenter(null);return;}
        if(key.upArrow){const next=moveResearchCenterSelection(researchCenter,-1);setResearchCenter(next);const row=selectedResearch(next);if(row)void researchFacade().read(row.id).then(detail=>setResearchCenter((current:ResearchCenterModel|null)=>current?setResearchCenterDetail(current,detail):current)).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.researchDetail'))));return;}
        if(key.downArrow){const next=moveResearchCenterSelection(researchCenter,1);setResearchCenter(next);const row=selectedResearch(next);if(row)void researchFacade().read(row.id).then(detail=>setResearchCenter((current:ResearchCenterModel|null)=>current?setResearchCenterDetail(current,detail):current)).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.researchDetail'))));return;}
        const row=selectedResearch(researchCenter);if(ch==='u'){void loadResearchCenter(row?.id);return;}if(!row)return;const ownerSessionId=state.sessionId??row.id;
        if(ch==='p'){void researchFacade().pause(ownerSessionId,row.id).then(()=>loadResearchCenter(row.id)).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.researchPause'))));return;}
        if(ch==='r'){void researchFacade().resume(ownerSessionId,row.id).then(()=>loadResearchCenter(row.id)).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.researchResume'))));return;}
        if(ch==='c'){void researchFacade().cancel(ownerSessionId,row.id).then(()=>loadResearchCenter(row.id)).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.researchCancel'))));return;}
        if(ch==='e'){void researchFacade().exportFile(row.id,'md').then(result=>addLocal(t('screen.research.exported',{path:result.path}))).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.researchExport'))));return;}
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
          void libraryFacade().preview(row.id).then(preview=>setLibraryCenter((current:LibraryCenterModel|null)=>current?setLibraryCenterPreview(current,preview):current)).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.libraryPreview'))));return;
        }
        if(ch==='u'){
          const row=selectedLibraryEntry(libraryCenter);if(!row)return;
          void libraryFacade().duplicates(row.id).then(scan=>setLibraryCenter((current:LibraryCenterModel|null)=>current?setLibraryCenterDuplicateScan(current,scan):current)).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.libraryDuplicates'))));return;
        }
        if(ch==='a'){
          const row=selectedLibraryEntry(libraryCenter);if(!row)return;
          void libraryFacade().prepareContextReference(row.id).then(reference=>{setEditorText(attachLibraryContextToken(currentEditor().text,reference.token));setLibraryCenter(null);}).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.libraryAttach'))));return;
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
          void notesFacade().composerReference(row.id).then((reference:string)=>{const existing=currentEditor().text;setEditorText(existing.trim()?existing+'\n\n'+reference:reference);setNotesCenter(null);}).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.noteAttach'))));return;
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
      if(historyPicker){
        const shown=filterHistory(history,historyPicker.query);
        if(key.escape||(key.ctrl&&(ch==='c'||ch==='C'))){setHistoryPicker(null);return;}
        if(key.return){const chosen=shown[Math.min(historyPicker.selected,shown.length-1)];setHistoryPicker(null);if(chosen)restoreDraft(chosen);return;}
        if(key.upArrow){setHistoryPicker({...historyPicker,selected:Math.max(0,historyPicker.selected-1)});return;}
        if(key.downArrow){setHistoryPicker({...historyPicker,selected:Math.min(Math.max(0,shown.length-1),historyPicker.selected+1)});return;}
        if(key.backspace||key.delete){setHistoryPicker({query:historyPicker.query.slice(0,previousGraphemeBoundary(historyPicker.query,historyPicker.query.length)),selected:0});return;}
        if(ch&&!key.ctrl&&!key.meta&&!/[\x00-\x1f\x7f]/u.test(ch)){setHistoryPicker({query:historyPicker.query+ch,selected:0});return;}
        return;
      }
      if(themePicker){
        const move=(selected:number)=>{const next=Math.max(0,Math.min(PAGE_THEMES.length-1,selected));setThemePicker({...themePicker,selected:next});themeStore.set(PAGE_THEMES[next]!);};
        if(key.escape||(key.ctrl&&(ch==='c'||ch==='C'))){themeStore.set(themePicker.original);setThemePicker(null);return;}
        if(key.return){setThemePicker(null);keepTheme(PAGE_THEMES[themePicker.selected]!);return;}
        if(key.upArrow){move(themePicker.selected-1);return;}
        if(key.downArrow){move(themePicker.selected+1);return;}
        if(key.home){move(0);return;}
        if(key.end){move(PAGE_THEMES.length-1);return;}
        return;
      }
      if(contextInspector){
        if(key.ctrl&&(ch==='c'||ch==='C')){applyInterrupt(interruptRef.current!.ctrlC(state.running),'ctrl-c');return;}
        if(key.escape||key.return||(ch==='q'&&!key.ctrl&&!key.meta)){setContextInspector(null);return;}
        return;
      }
      if(agentsSurface.page){handleAgentsPageKey(ch,key);return;}
      if(queueEditor){
        const entries:TuiQueueEntry[]=controller.queueEntries(),selected=queueEditorSelected(entries,queueEditor.selected);
        if(queueEditor.editing){
          if(key.escape){setQueueEditor({...queueEditor,editing:false,draft:''});return;}
          if(key.return){if(selected)void controller.editQueue(selected.id,queueEditor.draft).then(()=>setQueueEditor((current:any)=>current?{...current,editing:false,draft:''}:current)).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.queueEdit'))));return;}
          if(key.backspace){setQueueEditor({...queueEditor,draft:queueEditor.draft.slice(0,previousGraphemeBoundary(queueEditor.draft,queueEditor.draft.length))});return;}
          if(ch&&!key.ctrl&&!key.meta){setQueueEditor({...queueEditor,draft:queueEditor.draft+ch});return;}
        }else{
          if(key.escape||(ch==='q'&&!key.ctrl&&!key.meta)){setQueueEditor(null);return;}
          if(key.shift&&key.upArrow&&selected){void controller.moveQueue(selected.id,-1).then(()=>setQueueEditor((current:any)=>current?{...current,selected:Math.max(0,current.selected-1)}:current)).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.queueMove'))));return;}
          if(key.shift&&key.downArrow&&selected){void controller.moveQueue(selected.id,1).then(()=>setQueueEditor((current:any)=>current?{...current,selected:Math.min(Math.max(0,controller.queueEntries().length-1),current.selected+1)}:current)).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.queueMove'))));return;}
          if(key.upArrow){setQueueEditor({...queueEditor,selected:Math.max(0,queueEditor.selected-1)});return;}
          if(key.downArrow){setQueueEditor({...queueEditor,selected:Math.min(Math.max(0,entries.length-1),queueEditor.selected+1)});return;}
          if(ch==='e'&&selected){setQueueEditor({...queueEditor,editing:true,draft:selected.text});return;}
          if(ch==='d'&&selected){void controller.deleteQueue(selected.id).then(()=>setQueueEditor((current:any)=>{const count=controller.queueEntries().length;if(!count)return null;return current?{...current,selected:Math.min(current.selected,count-1)}:current;})).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.queueDelete'))));return;}
          if(ch==='c'){void controller.clearQueue().then(()=>setQueueEditor(null)).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.queueClear'))));return;}
          if(ch==='r'){if(state.running){addLocal(t('screen.queue.resumeBusy'));return;}void controller.dispatchQueue().then(()=>{if(!controller.queue().length)setQueueEditor(null);}).catch((error:unknown)=>addLocal(screenErrorText(error,act('screen.action.queueResume'))));return;}
        }
      }
      if(transcriptSearch){
        const items=transcriptItemsForCurrentView();
        const matches=transcriptSearchMatches(items,transcriptSearch.query,transcriptSearch.mode);
        const selected=selectedTranscriptMatch(matches,transcriptSearch.selectedId??transcriptSelectedId);
        const applySelection=(itemId:string|null)=>{setTranscriptSelectedId(itemId);setTranscriptSearch((current:TranscriptSearchState|null)=>current?{...current,selectedId:itemId,notice:null}:current);if(itemId)jumpTranscriptItem(itemId);};
        if(key.escape){setTranscriptSearch(null);return;}
        /* R4 Q-R4-7: Ctrl+C closes the search like any dialog, before any exit is armed. */
        if(key.ctrl&&(ch==='c'||ch==='C')){applyInterrupt(interruptRef.current!.ctrlC(state.running),'ctrl-c');return;}
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
      /* P13 (owner decisions 2 and 7): watching an agent is read-only. Esc goes back to the main session and does NOT
         interrupt the turn (Claude Code fixed exactly that); Ctrl+C still stops the whole turn; the agent tree, scrolling,
         redraw, reasoning and tool details still work; typing does nothing. */
      if(agentView){
        if(key.escape){closeAgentView();return;}
        const viewAction=resolveKeybinding(ch,key,['global','transcript','composer'],effectiveKeymap);
        if(viewAction&&AGENT_VIEW_ACTIONS.has(viewAction)){handleSemanticAction(viewAction,key);return;}
        return;
      }
      const vimOwnsInput=boot.phase==='ready'&&!trustCenter&&!mcpCenter&&!hookCenter&&!pluginCenter&&!memoryCenter&&!notesCenter&&!tasksCenter&&!libraryCenter&&!researchCenter&&!automationCenter&&!forgeCenter&&focusNow==='composer'&&vim.enabled&&(vim.mode==='normal'||Boolean(key.escape));
      if(vimOwnsInput){
        const vimResult=handleVimInput({state:vim,editor:currentEditor(),ch,key});
        if(vimResult.handled){setVim(vimResult.state);if(vimResult.editor!==currentEditor())updateEditor(()=>vimResult.editor);setAuxCompletions([]);return;}
      }
      const decision=decideShellInput({
        ch,key,focus:focusNow,composerText:currentEditor().text,commandMenuOpen:focusNow==='command-menu',
        trustCenterOpen:Boolean(trustCenter),approvalExpanded,boot,keymap:effectiveKeymap,
      });
      if(decision.closeTrustCenter){setTrustCenter(null);return;}
      if(decision.approvalScrollDelta!==null){const delta=decision.approvalScrollDelta;setApprovalScroll((value:number)=>Math.max(0,Math.min(approvalMaxOffsetRef.current,value+delta)));return;}
      if(decision.skipBoot)setBoot((current:BootState)=>skipBoot(current));
      const routed=decision.routed;if(!routed)return;
      if(routed.kind==='action'){handleSemanticAction(routed.action,key,routed.action==='command-menu'&&ch.startsWith('/')?ch:undefined);return;}
      if(routed.kind==='text'){
        if(focusNow==='provider-picker'&&providerStep.kind==='key'){if(!providerStep.testing){if(providerStep.result)setProviderStep({...providerStep,result:null});setProviderSecret((value:string)=>value+routed.text);}return;}
        if(focusNow==='provider-picker'&&(providerStep.kind==='login-choice'||providerStep.kind==='key-actions'||providerStep.kind==='address'))return;
        if(focusNow==='provider-picker'&&providerStep.kind==='oauth'){
          if(providerStep.phase==='waiting'){if(providerStep.pasteable!==false&&routed.text.trim().toLowerCase()==='c')setProviderStep({...providerStep,phase:'paste',message:null});return;}
          if(providerStep.phase==='paste'){setProviderSecret((value:string)=>value+routed.text);return;}
          return;
        }
        if(focusNow==='provider-picker'&&providerStep.kind==='consent'){const letter=routed.text.trim().toLowerCase();if(letter==='y'||letter==='n')setProviderStep({...providerStep,choice:letter==='y'?'yes':'no'});return;}
        if(focusNow==='model-picker'&&modelEffortStep)return;
        if(focusNow==='model-picker'||focusNow==='provider-picker'||focusNow==='session-picker'){setPickerQuery((value:string)=>value+routed.text);setPickerSelection((current:SelectionState)=>({...current,selected:0}));return;}
        if(focusNow==='command-menu'){updateEditor(editor=>editInsert(editor,routed.text));commandMenuSelectionStore.reset();setPickerSelection((current:SelectionState)=>({...current,selected:0}));return;}
        setAuxCompletions([]);updateEditor(editor=>routed.text.length>1||routed.text.includes('\n')?insertPaste(editor,routed.text):editInsert(editor,routed.text));
      }
      });
    };

    const terminalRows=terminalSize?.rows??Number(stdout?.rows??process.stdout.rows??30),terminalColumns=terminalSize?.columns??Number(stdout?.columns??process.stdout.columns??100);
    const shape=frameShape({columns:terminalColumns,rows:terminalRows},{view:frameView,bar:barOpen,panel:panelOpen,side:frameSide,focus:barFocused?'bar':panelFocused?'panel':null});
    barColumnsRef.current=shape.bar;
    panelColumnsRef.current=shape.panel;
    panelFromRef.current=shape.panel?terminalColumns-shape.panel:0;
    const screenColumns=shape.centre;
    /* the sessions, only while the bar or the shelf is there, and again at the end of a turn */
    const sessionsShown=shape.bar>0||sheet?.name==='shelf'||sheet?.name==='home'||sheet?.name==='board'||(boot.phase==='ready'&&state.transcript.items.length===0);
    React.useEffect(()=>{
      if(!sessionsShown)return;let gone=false;
      /* the Board has just read them: this one read serves the bar too */
      if(sheetRef.current?.name==='board'&&shape.bar===0&&Date.now()-boardReadAtRef.current<1_000)return;
      void controller.listSessions({scope:'all'}).then((rows:readonly any[])=>{
        if(gone)return;
        const open=sheetRef.current;
        if(open?.name==='board'&&open.context?.board){const board=open.context.board;const fresh=boardRowsOf(rows);setSheet(boardSheet(fresh,{...board,...boardKeep(board.rows,fresh,board),tab:open.panel.tab}));}
        setBarSessions(rows.slice(0,SESSIONS_READ).map(row=>{const state=sessionState(row),[mark,role]=sessionMark(state);const startedAtMs=row.outcome==='running'&&row.startedAt?Date.parse(row.startedAt):Number.NaN;return{id:row.id,title:row.title||row.id.slice(0,8),mark,role,state,when:'',current:row.id===controller.current?.(),project:row.project??null,path:row.path??null,at:row.updatedAt??row.startedAt??null,parent:row.parentId??null,...(Number.isFinite(startedAtMs)?{startedAtMs}:{})};}));setSessionsRead(true);
      }).catch((error:unknown)=>{setSessionsRead(true);developmentLogError('tui.bar.sessions',error,{},'tui-app');});
      return()=>{gone=true;};
    },[sessionsShown,state.running,workingAgents(state.agents).length]);
    /* R5a S1 (gate finding 1): the turn's usage AND the context status go to lane R's snapshot; neither hides the other. */
    const facts=React.useMemo(()=>usageFacts({model:state.status.model,usage:state.usage,contextStatus,compactions:state.compactions}),[state.status.model,state.usage,contextStatus,state.compactions]);
    /* R5a (owner 2026-09-24): a window below 64k keeps the simple mode; said once per model. */
    const smallWindowSaidRef:{current:string|null}=React.useRef(null);
    React.useEffect(()=>{const text=smallWindowNotice(facts.profile,state.status.model);if(text&&smallWindowSaidRef.current!==state.status.model){smallWindowSaidRef.current=state.status.model;addLocal(text);}},[facts.profile,state.status.model]);
    /* C1R (cure C1R, RED R1 + declared-risk badge): the provider's readiness is read from the LOCAL snapshot —
       synchronous, no network, never awaited; the revalidation is kicked once, after the session is on screen, and
       the row re-declares when it lands. A provider the snapshot cannot vouch for reads «not verified». */
    const statusProvider=providerOfModel(state.status.model);
    /* the ONE background check that is under way (cleared when it lands, fails, or takes longer than PROVIDER_CHECKING_SHOWN_MS).
       Review of 0.6.2 (13/10/2026): it is the check, not the provider's name — after A → B → A the first check of A and the
       later one had the same name, so the first one's give-up timer (and its late answer) took the later one's «checking…» away. */
    type ProviderCheck={provider:string;giveUp:ReturnType<typeof setTimeout>|null};
    const providerCheckingRef:{current:ProviderCheck|null}=React.useRef(null);
    const readProviderVerification=()=>{
      if(!statusProvider||typeof catalog.providerState!=='function')return null;
      try{
        const report=catalog.providerState(statusProvider);
        const checking=providerCheckingRef.current?.provider===statusProvider;
        /* nothing to read yet (the kernel is still loading) while the check waits: «checking…», as the mockup draws it */
        /* third review of 0.6.2 (nit): not for a provider no check is ever made for (the external agent) — the row said
           «<agent>: checking…» until the kernel was loaded and then nothing, for a check that was never going to be sent */
        if(!report)return checking&&!PROVIDERS_NEVER_CHECKED.has(statusProvider)?{id:statusProvider,state:'unverified' as const,fresh:false,verified:null,checking:true}:null;
        /* review of 0.6.2 (B1): the check's verdict on the key travels with the state — a public catalogue is reached with any key */
        return{id:report.id,state:report.state,fresh:report.fresh===true,verified:report.verified??null,...(checking?{checking:true}:{})};
      }catch{return null;}
    };
    const [providerVerificationTick,setProviderVerificationTick]=React.useState(0);
    /* Review V9: the ref records the provider whose revalidation was actually kicked — a boot without a
       model does NOT consume the kick (it fires when the model arrives), and a provider change re-kicks
       for the new provider. */
    const providerVerificationKickedRef:{current:string|null}=React.useRef(null);
    const providerCheckingShownMs=typeof props.providerCheckingShownMs==='number'&&props.providerCheckingShownMs>0?props.providerCheckingShownMs:PROVIDER_CHECKING_SHOWN_MS;
    React.useEffect(()=>{
      if(providerVerificationKickedRef.current===statusProvider)return;
      if(!statusProvider||typeof catalog.refreshProviderState!=='function')return;
      providerVerificationKickedRef.current=statusProvider;
      /* a check that starts takes the place of the one before it: that one's timer is stopped, and its answer no longer speaks for the row */
      const earlier=providerCheckingRef.current;if(earlier?.giveUp)clearTimeout(earlier.giveUp);
      const check:ProviderCheck={provider:statusProvider,giveUp:null};
      providerCheckingRef.current=check;setProviderVerificationTick((current:number)=>current+1);
      const settled=()=>{if(check.giveUp)clearTimeout(check.giveUp);check.giveUp=null;if(providerCheckingRef.current===check)providerCheckingRef.current=null;};
      /* «checking…» is never left on screen by a check that does not land (C1R: the badge cannot lie in optimism): past the time
         a check may take (the catalog's own budget is 2 s, after the kernel is loaded) the row reads what is known, «not verified». */
      const arm=()=>{
        if(check.giveUp)clearTimeout(check.giveUp);
        check.giveUp=setTimeout(()=>{check.giveUp=null;if(providerCheckingRef.current!==check)return;settled();setProviderVerificationTick((current:number)=>current+1);},providerCheckingShownMs);
        (check.giveUp as {unref?:()=>void}).unref?.();
      };
      arm();
      /* The bound starts again when the check is actually sent: until the kernel is loaded (`startup`) the check waits behind it,
         and a start slower than the catalog's own 2 s left less than the check's budget on the first timer — «checking…» went away
         and the answer flipped the row a moment later. If the kernel never loads, the first timer stands. */
      if(startup)void Promise.resolve(startup).then(()=>{if(providerCheckingRef.current===check)arm();},()=>{});
      /* Fire-and-forget: a provider that never answers must not hold the session (R1). A rejection is
         logged, never silent (review V7): the only visible sign stays an honest stale badge. */
      void Promise.resolve(catalog.refreshProviderState(statusProvider)).then(
        ()=>{settled();setProviderVerificationTick((current:number)=>current+1);},
        (error:unknown)=>{settled();setProviderVerificationTick((current:number)=>current+1);developmentLogError('ui.provider_state.refresh.rejected',error,{provider:statusProvider},'tui');});
    },[providerVerificationTick,catalog,state.status.model]);
    /* Review of 0.6.2 (13/10/2026, B2): a key set or removed, an environment key answered, a sign-in or a sign-out — by any door of
       this screen, by the model's own disconnect — resets what the check knew (catalog-service.ts `credentialChanged`). The row is
       read again at once and, for the provider on the row, the check is made again: the kicked-ref is per provider and had no
       reason to fire a second time, so «verified» stayed for a key that was gone and «not verified» for one just accepted. */
    /* Gate red of 13/10/2026 (s52): the check is fire-and-forget for the SCREEN, and was for the process too — after Ctrl+C Ctrl+C
       the screen was gone and the process waited on the check's request (31 s measured with a provider that never answers). The
       screen that leaves ends the checks it started; nothing of them is written. */
    React.useEffect(()=>()=>{
      const check=providerCheckingRef.current;if(check?.giveUp)clearTimeout(check.giveUp);providerCheckingRef.current=null;
      try{catalog.stopProviderChecks?.();}catch{/* a catalog that is already closed */}
    },[catalog]);
    React.useEffect(()=>{
      if(typeof catalog.onProviderStateChanged!=='function')return;
      return catalog.onProviderStateChanged((id:string,cause?:'file')=>{
        /* owner 14/10/2026: what another process wrote in the snapshot (a key removed in a second terminal) is READ, not checked
           again — a check from here would ask with the key this process loaded at its start, and the file already says what is known */
        if(cause!=='file'&&providerVerificationKickedRef.current===id)providerVerificationKickedRef.current=null;
        setProviderVerificationTick((current:number)=>current+1);
      });
    },[catalog]);
    const providerVerification=React.useMemo(()=>readProviderVerification(),[providerVerificationTick,statusProvider,catalog]);
    /* Third review of 0.6.2 (13/10/2026, nit): the row is read when something happens, and nothing happens at the hour — a screen
       left open kept «verified» past the hour its answer is good for. ONE timer, for the moment the answer on the row stops
       vouching (`vouchesUntil`): then the row is read again and the one check is made again, exactly as after a key change. Not a
       polling loop: the next timer exists only if that check brings a new «verified». Unref'd (it never holds the exit), cleared
       when the screen leaves, the provider changes or the answer does; and it draws nothing until it fires, an hour away. */
    const providerVouchesUntil=React.useMemo(()=>{
      if(!statusProvider||typeof catalog.providerState!=='function')return null;
      try{const until=catalog.providerState(statusProvider)?.vouchesUntil;return typeof until==='number'&&Number.isFinite(until)?until:null;}catch{return null;}
    },[providerVerificationTick,statusProvider,catalog]);
    React.useEffect(()=>{
      if(!statusProvider||providerVouchesUntil===null)return;
      /* a little past the moment, so the reading that follows finds the answer no longer fresh; Node's longest timer is 2^31-1 ms */
      const timer=setTimeout(()=>{
        if(providerVerificationKickedRef.current===statusProvider)providerVerificationKickedRef.current=null;
        setProviderVerificationTick((current:number)=>current+1);
      },Math.min(Math.max(0,providerVouchesUntil-Date.now())+PROVIDER_HOUR_PAD_MS,2_147_483_647));
      (timer as {unref?:()=>void}).unref?.();
      return()=>clearTimeout(timer);
    },[providerVouchesUntil,statusProvider,catalog]);
    /* R3 Q-R3-13 (R0 decisions 1 and 4): `Full access` and `No sandbox` lead the status row and no width drops them. */
    const layout=deriveShellLayout({
      state,appState,viewport,terminalRows,terminalColumns:screenColumns,projectRoot,queuedActions:[...kernelQueue.items.filter((item:any)=>item.origin==='person').map((item:any)=>({kind:'prompt' as const,text:String(item.text??'')})),...queuedActions],busySince,bullet:theme.glyphs.bullet,branch:theme.glyphs.branch,
      snapshot:facts.snapshot,safety:{fullAccess:state.status.permissionMode==='bypassPermissions',noSandbox:sandboxVerified===false},busyInput:prefs.busyInput,exitHint,
      consoleWarnings:consoleWarningCount,providerVerification,
    });
    const {columns,activity,shortcutLine,queueLine,footerLine,statusBar:statusRow}=layout;
    /* the branch the header and the footer name (mockup ` · main`), read from .git again when a turn starts or ends */
    const projectBranch=React.useMemo(()=>branchFrom(projectRoot),[projectRoot,state.running]);
    /* Stage 4 (registro 12): the phase keeps its own start, adjusted while rendering when its key changes (React «adjust
       state while rendering», never a ref written in render), as Gemini CLI's useTimer restarts on its key. */
    const currentPhaseKey=phaseKey(state,activity);
    const [phaseMark,setPhaseMark]=React.useState(():PhaseMark=>({key:currentPhaseKey,start:Date.now()}));
    if(phaseMark.key!==currentPhaseKey)setPhaseMark(trackPhase(phaseMark,currentPhaseKey,Date.now()));
    /* R3 Q-R3-9: no `Run · …` rows; R5a S8: a collapsed reasoning block is drawn once it has ended (thinking-row.ts). */
    /* P13: the watched agent's transcript takes the main view; the main session's is kept as it was. */
    const shownTranscriptItems=(agentView?agentView.transcript.items:state.transcript.items) as TranscriptItem[];
    /* In an agent's transcript its prompt is the task the main session gave it, not the person's words, and the answers are
       the agent's: "You" and "TALOS" would say otherwise. */
    const watchingAgent=Boolean(agentView);
    const visibleTranscriptItems:TranscriptItem[]=React.useMemo(()=>visibleItemsOf(shownTranscriptItems,appState.reasoningVisible,{/* the mockup: `▸ Thinking…` is a still row, so reduced motion keeps it */livePreview:true,hidden:reasoningHidden}),[shownTranscriptItems,appState.reasoningVisible,capabilities.motion]);
    /* UI Phase 1 (owner 27/09): consecutive reads, searches and lists as one line while the outputs are closed (Ctrl+O). */
    const drawnTranscriptItems:TranscriptDisplayItem[]=React.useMemo(()=>appState.expandedTools||transcriptRaw||toolRows==='each'?visibleTranscriptItems:groupExploration(visibleTranscriptItems),[visibleTranscriptItems,appState.expandedTools,transcriptRaw]);
    /* stage 7.13: the main view leaves out what /clear cleared (never an agent's view); the transcript mode keeps it all */
    const keptTranscriptItems:TranscriptDisplayItem[]=React.useMemo(()=>clearedIds&&!agentView?drawnTranscriptItems.filter((item:TranscriptDisplayItem)=>!clearedIds.has(item.id)&&!(item.kind==='toolGroup'&&item.tools.every(tool=>clearedIds.has(tool.id)))):drawnTranscriptItems,[drawnTranscriptItems,clearedIds,agentView]);
    /* F-Q1 (owner 03/10, «metterla inline»): what waits in the queues follows the conversation, gray, until it goes in */
    const earlierWaiting=state.transcript.earlier;
    const mainTranscriptItems:TranscriptDisplayItem[]=React.useMemo(()=>{if(agentView)return keptTranscriptItems;const queued=queuedTranscriptItems(kernelQueue,controllerRef.current?.queueEntries()??[]);const summary=earlierWaiting?.length&&!clearedIds?summarizeEarlier(earlierWaiting):null;const head:TranscriptDisplayItem[]=summary?[{kind:'earlier',id:EARLIER_ROW_ID,items:summary.items,messages:summary.messages}]:[];return head.length||queued.length?[...head,...keptTranscriptItems,...queued]:keptTranscriptItems;},[keptTranscriptItems,agentView,kernelQueue,queuedActions,earlierWaiting,clearedIds]);
    /* stage 7.12 «+1 completa»: in the full transcript every item is open but the ones closed with o (Claude Code «transcript
       mode … shows the full output of every tool call»); the compact one is the main view with the ones opened with o */
    const pageItems:TranscriptDisplayItem[]=React.useMemo(()=>transcriptMode?.full?visibleItemsOf(shownTranscriptItems,true):drawnTranscriptItems,[transcriptMode?.full,shownTranscriptItems,drawnTranscriptItems]);
    const pageOpen:ReadonlySet<string>=React.useMemo(()=>transcriptMode?transcriptModeOpen(transcriptMode,pageItems.flatMap((item:TranscriptDisplayItem)=>item.kind==='toolGroup'?[item.id,...item.tools.map(tool=>tool.id)]:[item.id])):openItems,[transcriptMode?.full,transcriptMode?.flipped,pageItems,openItems]);
    const viewOpen=pageOpen,viewExpanded=transcriptMode?.full?false:appState.expandedTools,viewReasoning=transcriptMode?.full?false:appState.reasoningVisible;
    const viewFull=Boolean(transcriptMode?.full),viewMark=transcriptMode&&!transcriptMode.editing?transcriptMode.query:'';
    /* Stage 6c: a transcript title a click toggles — the row says where it was laid out, seen through the transcript region */
    const toggleTitle=(id:string,prefix:string,title:string,child:any,key?:string)=>h(Ink.Box,{...(key?{key}:{}),ref:(node:unknown)=>registerHit(`toggle:${id}`,node,[[{text:prefix,roles:[]},{text:title,roles:[],action:`toggle:${id}`}]],'transcript')},child);
    const renderTranscriptItem=React.useCallback((item:TranscriptDisplayItem)=>{
      if(item.kind==='toolGroup'){
        /* The approved mockup (07/10): `  ● Read 2 files, searched 1 pattern · ctrl+o` — the bullet in the success colour (the
           spinner in the accent while a call works), the summary in the text colour, the key faint; open, no key */
        const selected=item.id===transcriptSelectedId||item.tools.some(tool=>tool.id===transcriptSelectedId),prefix=selected?'› ':'  ';
        const working=toolGroupWorking(item),spinner=theme.glyphs.spinner;
        const glyph=(working?(capabilities.motion?spinner[frameIndex(toolNow,1_000,spinner.length)]!:spinner[0]!):'●')+' ';
        const open=viewOpen.has(item.id),title=toolGroupLine(item);
        const row=h(Ink.Text,{inverse:selected,wrap:'truncate'},prefix,h(Ink.Text,{color:theme.colors[working?'accent':'success']},glyph),title,open?'':h(Ink.Text,{color:theme.colors.faint},' · '+toolGroupHint()));
        /* stage 6c (mockup open tools item): a click on the line shows the calls under it, `├`/`└`, and hides them again */
        if(open)return h(Ink.Box,{key:item.id,flexDirection:'column'},toggleTitle(item.id,prefix+glyph,title,row),
          ...toolGroupOpenRows(item,columns,toolNow).map((line,index)=>h(Ink.Text,{key:index,color:theme.colors.faint,wrap:'truncate'},marked(line,viewMark))));
        return toggleTitle(item.id,prefix+glyph,title,row,item.id);
      }
      const selected=item.id===transcriptSelectedId,prefix=selected?'› ':'';
      if(transcriptRaw)return h(Ink.Text,{key:item.id,inverse:selected,dimColor:!selected},prefix+transcriptItemRaw(item));
      /* Long chats, tappa D: the row that offers the beginning of the conversation; a click loads a page of it */
      if(item.kind==='earlier'){const text=earlierRowText(item,columns);return h(Ink.Box,{key:item.id,ref:(node:unknown)=>registerHit('earlier:page',node,[[{text,roles:[],action:'earlier:page'}]],'transcript')},h(Ink.Text,{dimColor:true,wrap:'truncate'},text));}
      if(item.kind==='message'&&item.queued)return h(Ink.Box,{key:item.id,flexDirection:'column'},h(Ink.Text,{dimColor:true,inverse:selected},prefix+item.queued),item.text?h(Ink.Text,{dimColor:true},item.text):null);
      /* The approved mockup (07/10, components/conversation-rows.ts): a blank row, then the person's words on the band — ` › `
         accent bold, the text bold — or the answer indented two cells; no «You»/«TALOS» label */
      if(item.kind==='message'&&item.role==='user')return h(Ink.Box,{key:item.id,flexDirection:'column'},h(Ink.Text,null,' '),
        ...promptRows(item.text,columns).map((line,index)=>h(Ink.Text,{key:index,bold:true,inverse:selected,backgroundColor:theme.colors.band,wrap:'truncate'},
          h(Ink.Text,{color:theme.colors.accent},line.slice(0,PROMPT_LEAD.length)),marked(line.slice(PROMPT_LEAD.length),viewMark))),
        /* 0.6.15 T5 (mockup v3): a message sent from a device through remote control names it under the prompt, faint */
        ...(item.device!==undefined?[h(Ink.Text,{key:'from-device',color:theme.colors.faint,wrap:'truncate'},' '.repeat(PROMPT_LEAD.length)+(item.device?t('screen.message.fromDevice',{name:item.device}):t('screen.message.fromUnnamedDevice')))]:[]),
        /* 0.6.13: a request the kernel kept as not sent (too large for the model) says so under it, faint, live and replayed */
        ...(item.notSent?[h(Ink.Text,{key:'not-sent',color:theme.colors.faint,wrap:'truncate'},' '.repeat(PROMPT_LEAD.length)+t('screen.requestTooLarge.notSent'))]:[]));
      /* stage 7.12 «+1 completa»: in the full transcript the answer's blank row carries its time and model, faint */
      if(item.kind==='message')return h(Ink.Box,{key:item.id,flexDirection:'column'},h(Ink.Text,{inverse:selected},
        viewFull&&messageStampsRef.current.has(item.id)?h(Ink.Text,{color:theme.colors.faint},' '.repeat(ANSWER_INDENT)+transcriptModeStamp(messageStampsRef.current.get(item.id)).replace(/^ · /u,'')):' '),
        h(Ink.Box,{paddingLeft:ANSWER_INDENT,flexDirection:'column'},h(MarkdownView,{text:item.text,width:Math.max(1,columns-ANSWER_INDENT),maxProseWidth,...(viewMark?{mark:viewMark}:{})})));
      /* The approved mockup (07/10, kind 'thought'): `  ▸ Thought for 4s  click to read` — the glyph and the hint faint, the
         words dim italic — and `  ▸ Thinking…` while it streams. A click opens one block (`▾`, the text under `    │ `) and its
         title closes it again; with Ctrl+T every block is open and none is a target (stage 6c). */
      if(item.kind==='reasoning'){
        const lead=selected?'› ':'  ',open=viewReasoning||viewOpen.has(item.id),words=thoughtLine(item);
        const header=h(Ink.Text,{inverse:selected,wrap:'truncate-end'},lead,h(Ink.Text,{color:theme.colors.faint},thoughtGlyph(open)),h(Ink.Text,{color:theme.colors.muted,italic:true},words),h(Ink.Text,{color:theme.colors.faint},thoughtHint(item,open)));
        const title=viewReasoning?header:toggleTitle(item.id,lead+thoughtGlyph(open),words,header,open?undefined:item.id);
        if(!open)return title;
        return h(Ink.Box,{key:item.id,flexDirection:'column'},title,
          h(Ink.Box,{marginLeft:4,paddingLeft:1,borderStyle:'single',borderTop:false,borderRight:false,borderBottom:false,borderColor:theme.colors.faint},h(Ink.Text,{color:theme.colors.muted,italic:true},marked(item.text||' ',viewMark))));
      }
      /* The selected row carries a two-cell prefix: its header is drawn two cells narrower so it never wraps (lane RD). */
      /* The approved mockup (07/10): every row of a turn stands two cells in, like its groups and notices (`  ` + text); a call
         that keeps its own row (failed, denied, waiting, the full transcript) too. The selected row shows by inverse. */
      if(item.kind==='tool'){
        const width=Math.max(1,columns-TURN_INDENT),open=viewExpanded||viewOpen.has(item.id);
        const rendered=toolRowWithClock(item,width,open,toolNow);
        /* stage 6c: the row is a target only when a click changes it (Claude Code: «Only messages that have more to show are clickable») */
        const changes=!viewExpanded&&(viewOpen.has(item.id)||toolRowWithClock(item,width,true,toolNow).detailLines.length>rendered.detailLines.length);
        const title=h(Ink.Text,{color:toolColor,inverse:selected},rendered.title+' · '+rendered.statusLabel);
        return h(Ink.Box,{key:item.id,flexDirection:'column',paddingLeft:TURN_INDENT},changes?toggleTitle(item.id,'',rendered.title+' · '+rendered.statusLabel,title):title,...rendered.detailLines.flatMap(line=>wrapReadable(line,width)).map((line,index)=>h(Ink.Text,{key:index,dimColor:true},marked(line||' ',viewMark))));
      }
      /* the mockup's notice: `  ` + text, dim */
      /* 0.6.6 (owner 14/10: the plan's limit «è in grigio, non è segnato bene»): an alert's headline is bold in the warning colour,
         what to do in the normal colour, only the details dim */
      /* R13: the rows are laid out here (text-width.ts wrapReadable) and the estimate counts the same ones; Ink's own wrap
         cuts a command mid-word («s/etTimeout»). Every row fits, so Ink never wraps it again; an empty row is drawn as a space (Ink gives an empty Text no row). */
      if(item.kind==='warning'&&item.alert){const room=Math.max(1,columns-TURN_INDENT),[head='',...rest]=item.text.split('\n');return h(Ink.Box,{key:item.id,flexDirection:'column',paddingLeft:TURN_INDENT},...wrapReadable(head,room).map((row,index)=>h(Ink.Text,{key:'head-'+index,bold:true,color:theme.colors.warning,inverse:selected},row||' ')),...rest.flatMap((line,index)=>wrapReadable(line,room).map((row,part)=>h(Ink.Text,{key:index+'-'+part,dimColor:line.startsWith(t('common.details')+':'),inverse:selected},row||' '))));}
      if(item.kind==='warning')return h(Ink.Box,{key:item.id,flexDirection:'column',paddingLeft:TURN_INDENT},...wrapReadable(item.text,Math.max(1,columns-TURN_INDENT)).map((row,index)=>h(Ink.Text,{key:index,dimColor:true,inverse:selected},row||' ')));
      /* ASYNC step 2: a delegated agent's result — the header in the outcome's colour, the child's summary dim below it */
      if(item.kind==='agent'){
        const [header,...rest]=agentResultLines(item,selected?Math.max(1,columns-2):columns,{unicode:capabilities.unicode,expanded:viewExpanded||viewFull});
        /* the full transcript wraps long lines instead of cutting them */
        return h(Ink.Box,{key:item.id,flexDirection:'column'},h(Ink.Text,{color:theme.colors[item.status==='completed'?'success':'danger'],inverse:selected,wrap:viewFull?'wrap':'truncate'},prefix+header),...rest.map((line,index)=>h(Ink.Text,{key:index,dimColor:true,wrap:viewFull?'wrap':'truncate'},marked(line,viewMark))));
      }
      /* Stage 3 (mockup «answers»): «◆ Your answers» — the glyph in the accent, the title bold — then each question's title dim and the answer */
      /* Stage 3 (mockup «plan»): a blank row, «▣ Plan proposed · N steps», then each step with its number in the accent */
      /* Stage 3 (owner 02/10): the agents' exchange, dim — their words are data, never the person's */
      if(item.kind==='dialogue'){
        const rows=dialogueRows(item,selected?Math.max(1,columns-2):columns);
        return h(Ink.Box,{key:item.id,flexDirection:'column'},...rows.map((row,index)=>h(Ink.Text,{key:index,dimColor:true,inverse:selected&&index===0,wrap:'truncate'},(index===0?prefix:'')+row.lead+row.who+row.text)));
      }
      if(item.kind==='plan'){
        const rows=planReceiptRows(item,selected?Math.max(1,columns-2):columns,{unicode:capabilities.unicode});
        return h(Ink.Box,{key:item.id,flexDirection:'column'},...rows.map((row,index)=>row.kind==='blank'?h(Ink.Text,{key:index},' ')
          :row.kind==='header'?h(Ink.Text,{key:index,inverse:selected,wrap:'truncate'},prefix+'  ',h(Ink.Text,{color:theme.colors.accent},row.glyph+' '),h(Ink.Text,{bold:true},row.title),h(Ink.Text,{color:theme.colors.muted},row.count))
          :h(Ink.Text,{key:index,wrap:'truncate'},h(Ink.Text,{color:theme.colors.accent},row.number),row.text)));
      }
      if(item.kind==='answers'){
        const rows=answersRows(item,selected?Math.max(1,columns-2):columns,{unicode:capabilities.unicode});
        return h(Ink.Box,{key:item.id,flexDirection:'column'},...rows.map((row,index)=>row.kind==='header'
          ?h(Ink.Text,{key:index,inverse:selected,wrap:'truncate'},prefix+'  ',h(Ink.Text,{color:theme.colors.accent},row.glyph+' '),h(Ink.Text,{bold:true},row.title))
          :h(Ink.Text,{key:index,wrap:'truncate'},h(Ink.Text,{dimColor:true},row.lead),row.text)));
      }
      return null;
    },[transcriptSelectedId,transcriptRaw,columns,maxProseWidth,viewExpanded,viewReasoning,viewFull,viewMark,toolNow,watchingAgent,viewOpen,registerHit]);
    const diffView=diff?renderDiffModel(parseUnifiedDiff(diff),columns):null;
    const vimHint=vimModeHint(vim);
    React.useEffect(()=>{
      if(!capabilities.motion||boot.phase!=='ready'||!isAnimatedActivity(activity.kind))return;
      return coordinator.startMotion(()=>setMotionNow(Date.now()));
    },[coordinator,capabilities.motion,boot.phase,activity.kind]);
    /* Lane RD contract: running rows show their elapsed seconds; a clock, not an animation, so it ticks with motion off.
       R5a S4: the same clock counts a known retry wait down, and stops when the wait is over (nothing ticks for nothing). */
    React.useEffect(()=>{
      const until=activity.kind==='tool'?Infinity:activity.kind==='retrying'?retryCountdownEnd(state.retry):null;
      if(boot.phase!=='ready'||until===null)return;
      setToolNow(Date.now());
      const timer=setInterval(()=>{const now=Date.now();coordinator.enqueueEvent(`tool-clock-${++eventSequenceRef.current}`,()=>setToolNow(now));if(now>=until)clearInterval(timer);},1_000);
      return()=>clearInterval(timer);
    },[coordinator,boot.phase,activity.kind,state.retry]);
    /*
     * R3 Q-R3-13 (R0 decision 4, owner 2026-09-24): the check starts at STARTUP, in the background, after the first frame,
     * so neither the first frame nor a key waits for it; the label appears when the verdict arrives (a cached verdict:
     * at once). Quitting aborts a check still running (main.ts, abortIsolationChecks): it ends what it started and
     * answers nothing. Asked once.
     */
    React.useEffect(()=>{const timer=setTimeout(()=>askSandboxRef.current(),0);return()=>clearTimeout(timer);},[]);
    /* Stage 4: the activity line's one-second clock, independent of the animation (Codex #45564/#46111, Gemini CLI useTimer):
       it runs while a turn is open and the motion clock is not already redrawing; after the turn nothing ticks (#98720). */
    const activityTicks=boot.phase==='ready'&&(state.running||typeof state.sentAt==='number')&&!(capabilities.motion&&isAnimatedActivity(activity.kind));
    React.useEffect(()=>{
      if(!activityTicks)return;
      setActivityClockNow(Date.now());
      const timer=setInterval(()=>{const now=Date.now();coordinator.enqueueEvent(`activity-clock-${++eventSequenceRef.current}`,()=>setActivityClockNow(now));},1_000);
      return()=>clearInterval(timer);
    },[coordinator,activityTicks]);
    /* Stage 6a: while the agents are on screen and one is not done, their times count and the spinner turns (the motion
       clock when motion is on, else one tick a second); nothing ticks otherwise. */
    const barAlive=new Set(workingAgents(state.agents).map(agent=>agent.childId));
    const agentsTicking=boot.phase==='ready'&&(Boolean(sheet?.context?.loading)||Boolean(sheet?.context?.ticking)||(!sessionsRead&&state.transcript.items.length===0)||(agentsShown&&agentCardsNow.some((card:AgentCard)=>card.state!=='done'))||(shape.panel>0&&agentCardsNow.some((card:AgentCard)=>card.state==='working'))||((shape.bar>0||sheet?.name==='shelf')&&barSessions.some((session:BarSession)=>session.startedAtMs!==undefined&&barAlive.has(session.id))));
    React.useEffect(()=>{
      if(!agentsTicking)return;
      if(capabilities.motion)return coordinator.startMotion(()=>setMotionNow(Date.now()));
      setMotionNow(Date.now());
      const timer=setInterval(()=>{const now=Date.now();coordinator.enqueueEvent(`agents-clock-${++eventSequenceRef.current}`,()=>setMotionNow(now));},1_000);
      return()=>clearInterval(timer);
    },[coordinator,agentsTicking,capabilities.motion]);
    const agentsNow=Math.max(motionNow,activityClockNow,toolNow);
    const agentsGlyph=capabilities.motion?theme.glyphs.spinner[frameIndex(motionNow,MOTION_FRAME_MS,theme.glyphs.spinner.length)]!:theme.glyphs.spinner[0]!;
    const pill=agentsPill(agentCardsNow,terminalColumns);
    /* Stage 6b: a new question from an agent shows the mockup's toast and notifies as an approval does (when not in front). */
    const seenAgentQuestionsRef:{current:Set<string>}=React.useRef(new Set<string>());
    React.useEffect(()=>{
      for(const ask of agentQuestions){
        if(seenAgentQuestionsRef.current.has(ask.requestId))continue;
        seenAgentQuestionsRef.current.add(ask.requestId);setToast(t('screen.agentsPanel.toastNeeds'));props.terminalNotifications?.agentQuestion(ask.requestId);
      }
    },[agentQuestions]);
    /* Stage 6c: a click on a target (press and release on it, owner 02/10) runs its verb; a drag selects. */
    React.useEffect(()=>{
      props.mouseSelection?.onClick?.({target:cell=>hitAt(currentHitTargets(),cell),element:cell=>hitElementAt(frameTargetsRef.current.get(),cell),frame:()=>frameTargetsRef.current.clear(),column:cell=>{const left=barColumnsRef.current,right=panelFromRef.current||Number.MAX_SAFE_INTEGER;if(!left&&!panelFromRef.current)return null;if(cell.col<left)return{from:0,to:left-1};return cell.col>=right?{from:right,to:Number.MAX_SAFE_INTEGER}:{from:left,to:right-1};},run:action=>runClickRef.current(action)});
      return()=>props.mouseSelection?.onClick?.(null);
    },[props.mouseSelection]);
    /* Stage 6c: a copy says so in the mockup's toast. */
    React.useEffect(()=>props.mouseSelection?props.mouseSelection.subscribe(info=>setToast(info.kind==='failed'?t('screen.selection.failed')
      :info.kind==='word'?t('screen.selection.copiedWord',{word:info.word.length>30?`${info.word.slice(0,29)}…`:info.word})
      :tn('screen.selection.copiedLines',info.count,{where:t(`screen.selection.where.${info.where??'linux'}` as const)}))):undefined,[props.mouseSelection]);
    React.useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(null),AGENTS_TOAST_MS);return()=>clearTimeout(timer);},[toast]);
    React.useEffect(()=>{if(!pageNote)return;const timer=setTimeout(()=>setPageNote(null),PAGE_NOTE_MS);return()=>clearTimeout(timer);},[pageNote]);
    const aside=toast&&!sheet?.panel.page?[{text:` ${toast} `,roles:['acc','b']}]:pill;
    const statusStartedAt=activity.startedAt??busySince;
    /* ASYNC step 4: the exit hint names the agents an exit stops; while «wait, then exit» runs the line says what it waits for. */
    const agentsWorkingCount=workingAgents(state.agents).length;
    const exitWaitLeft=exitWait?state.agents.filter((agent:LiveAgent)=>exitWait.includes(agent.childId)&&!agent.ended).length:0;
    const statusText=exitHint?exitHintText(exitHintKey,agentsWorkingCount):exitWait?tn('screen.exitAgents.waiting',Math.max(1,exitWaitLeft)):null;
    /* Stage 4: the activity line of the approved mockup (activity-line.ts). Its clock is the later of the motion clock and
       the one-second clock, so the time moves with animations off (Codex #45564/#46111); the glyph is fixed then. */
    const activityNow=Math.max(motionNow,activityClockNow,toolNow);
    const shownActivity=activityView(state,activity,phaseMark,agentsWorkingCount,(remoteSnapshot as {notified?:readonly string[]}).notified??[]);
    const spinnerGlyph=capabilities.motion?theme.glyphs.spinner[frameIndex(activityNow-phaseMark.start,MOTION_FRAME_MS,theme.glyphs.spinner.length)]!:theme.glyphs.spinner[0]!;
    const activitySegments=shownActivity?activityRow(shownActivity,{now:activityNow,cols:columns,glyph:spinnerGlyph,unicode:capabilities.unicode}):null;
    /* R3 gate E7: the main roster row says what the CLI knows while a turn is open (the kernel list says `unknown` or `running`),
       and after the turn done / interrupted / failed like the status row (owner decision, R3 follow-up: one vocabulary). */
    /*
     * R1 gate E1: one height budget per frame. The composer's row count comes from its store as a primitive, so the
     * fast input path still re-renders only the composer on a key and the whole screen only when the composer gains or
     * loses a row. `frameRowsFor` is the same switch run.ts uses for the root frame (Q-R1-6).
     */
    const composerSize:string=React.useSyncExternalStore(composerStore.subscribe,()=>{const measured=composerMeasure(composerStore.getSnapshot(),columns,vimHint);return`${measured.lines}:${measured.hints}`;},()=>'1:0');
    const [composerLines,composerHints]=composerSize.split(':').map(Number) as [number,number];
    const zen=frameView==='zen'&&!agentView;
    /* FE-048: what the person queued, in the band above the prompt */
    /* the fixed line: a state of the session, not a notice, so no key clears it; only /trust, which starts TALOS again */
    const bandRows=[...(projectUntrusted?[[{text:truncateDisplay(t(fullAccessHeldBack?'screen.trust.fixedLine.fullAccess':'screen.trust.fixedLine'),screenColumns),roles:['warn']}]]:[]),...queueBandRows(queueSheetEntries().map((entry:BandEntry)=>({...entry,text:queuedActionPreview(entry.text)})),{width:screenColumns,paused:kernelQueue.paused})];
    const budgetInput={band:bandRows.length,rows:terminalRows,columns:screenColumns,frameRows:frameRowsFor(terminalRows),composerLines,composerHints,composerFrame:zen?1:2,header:zen?0:1,shortcut:!zen&&(agentView||terminalColumns>=FOOTER_TWO_ROWS_FROM)?1:0,roster:0,extras:queueLine?1:0,footer:1,status:layout.showActivity?1:0};
    /* The most rows an overlay, menu or diff may take (contract with lane O: `maxRows`), known before any is built. */
    const maxRows=layoutBudget(budgetInput).overlayMaxRows;
    const pickerRowsLimit=Math.max(1,Math.min(12,maxRows-5));
    /* The command menu's height follows its query, which the fast input path writes to the stores without a root render:
       the root reads the fitted height as a primitive, so it re-renders only when the menu gains or loses a row. */
    const menuOpen=appState.focus.current==='command-menu';
    const menuRows:number=React.useSyncExternalStore(composerStore.subscribe,()=>{if(!menuOpen)return 0;const text=composerStore.getSnapshot().text;const fitted=fitOverlay(commandMenuOverlay({text,selected:commandMenuHighlight(text,commandMenuSelectionStore.getSnapshot())}),{maxRows,columns});return fitted.rows.length+(fitted.border?2:0);},()=>0);
    if(terminalColumns<MIN_COLUMNS||terminalRows<MIN_ROWS)return h(Regions.TooSmall,{key:'too-small',columns:terminalColumns});
    if(boot.phase!=='ready'&&boot.phase!=='error')return h(Regions.Region,{key:`boot-${appState.redrawNonce}`,rows:frameRowsFor(terminalRows),paddingTop:1},h(BootSequence,{state:boot,mode:bootPlanRef.current!.mode,hint:t('firstrun.boot.skipHint'),logo:shouldRenderBootLogo(capabilities),motion:capabilities.motion,unicode:capabilities.unicode,width:columns,rows:frameRowsFor(terminalRows)-3/* owner 14/10: the picture gets what the top padding, the hint line and the folder line leave */,accentColor:bootColor,mutedColor:footerColor,...(paintedBackground&&theme.colors.background?{glowBase:theme.colors.background}:{}),onComplete:()=>setBoot((current:BootState)=>completeBoot(current,Date.now()))}),h(ResumeIndicator,{phase:boot.phase,startedAt:boot.startedAt,motion:capabilities.motion,glyphs:theme.glyphs,color:footerColor}),h(Ink.Text,{dimColor:true,color:footerColor,wrap:'truncate-end'},projectRoot));
    /* stage 7.18 (mockup themesFrame): /theme is a page of its own; the whole screen is in the theme under the cursor */
    if(themePicker){
      const pageRows=frameRowsFor(terminalRows);
      return h(Ink.Box,{key:`theme-page-${live.id}`,flexDirection:'column',height:pageRows,flexShrink:0,overflowY:'hidden'},
        renderStyledRows(h,Ink,themePageRows({selected:themePicker.selected,current:themePicker.original,width:columns,height:pageRows,colors:live.capabilities.color}),theme.colors,'theme-page',registerHit));
    }
    /* stage 7.12: while the conversation sits in the terminal's own scrollback, one blank frame that never changes, so nothing
       is written over it */
    if(nativeScrollback)return h(Ink.Box,{key:'native-scrollback',height:1},h(Ink.Text,{},' '));
    /* stage 7.12: the transcript mode takes the whole screen: the mockup's top row, the conversation around the item it is on,
       the search row */
    if(transcriptMode){
      const pageRows=frameRowsFor(terminalRows);
      const messages=visibleTranscriptItems.filter((item:TranscriptItem)=>item.kind==='message').length;
      /* «+1 completa»: under the title, the prompt the item in view answers (Codex sticky header #34150); ? lists the keys */
      const promptRow=transcriptModePromptRow(transcriptModePromptOf(transcriptModeItems(transcriptMode),transcriptMode.at),columns);
      const help=transcriptMode.help?transcriptModeHelp(transcriptMode):[];
      return h(Ink.Box,{key:`transcript-mode-${appState.redrawNonce}-${live.id}`,flexDirection:'column',height:pageRows,flexShrink:0,overflowY:'hidden'},
        renderStyledRows(h,Ink,[transcriptModeHeader(messages),promptRow],theme.colors,'transcript-head'),
        h(TranscriptView,{key:'transcript-mode-view',variantTag:transcriptMode.full?'-transcript-full':'',hit:registerHit,clipRef:registerClip,openItems:viewOpen,items:pageItems,scrollRows:0,rowBudget:Math.max(1,pageRows-3-help.length),width:columns,maxProseWidth,raw:transcriptRaw,expandedTools:viewExpanded,reasoningVisible:viewReasoning,now:toolNow,revealId:transcriptMode.at,measurementStore:transcriptMeasurementStore,renderItem:renderTranscriptItem,onPlan:onTranscriptPlan,dimColor:footerColor}),
        ...(help.length?[renderStyledRows(h,Ink,help,theme.colors,'transcript-help')]:[]),
        renderStyledRows(h,Ink,[transcriptModeStatus(transcriptMode)],theme.colors,'transcript-status'));
    }
    /* Stage 6a: the agents page takes the whole screen (mockup buildFrame) and owns the keys while it is open. */
    if(agentsSurface.page){
      const pageRows=frameRowsFor(terminalRows),tab=agentsSurface.page.tab;
      return h(Ink.Box,{key:`agents-${appState.redrawNonce}-${live.id}`,flexDirection:'column',height:pageRows,flexShrink:0,overflowY:'hidden'},
        renderStyledRows(h,Ink,withToast(agentsPageRows(agentCardsNow,{width:terminalColumns,height:pageRows,now:agentsNow,view:agentsSurface.page.view??0,tab,selectedId:agentsSurface.page.selectedId??agentsOrder(agentCardsNow,tab)[0]?.id??null,glyph:agentsGlyph,reply:agentsSurface.page.reply??null}),toast,terminalColumns),theme.colors,'agents-page',registerHit));
    }

    const renderPickerRows=(rowsToRender:any[],selected:number,label:(row:any)=>string)=>{const view=pickerWindow(rowsToRender,selected,pickerRowsLimit);return view.rows.map((row,index)=>{const absolute=view.start+index;return h(Ink.Text,{key:`${absolute}-${label(row)}`,inverse:absolute===selected,color:pickerColor},`${absolute===selected?'›':' '} ${label(row)}`);});};
    /*
     * Q-R1-3 / E3: every overlay gets `maxRows` (contract with lane O) and is fitted by overlays/scroll-window.ts, which
     * wraps each line itself and returns one Ink row per row: the rows it returns are the rows it draws, so the budget
     * receives the overlay's exact height and no overlay can push the composer off the screen.
     */
    /* `hitKey`: one per place a panel is drawn, so two panels on screen together never take each other's targets */
    const fittedPanel=(fitted:FittedOverlay,hitKey='overlay'):OverlayPanel=>({element:renderFittedOverlay(h,Ink,fitted,{accentColor:pickerColor,hit:registerHit,hitKey}),rows:fitted.rows.length+(fitted.border?2:0)});
    /* stage 6c: a picker's rows are its choices (Claude Code: «Click an option in a select menu to choose it») */
    const pickable=(content:OverlayContent):OverlayContent=>({...content,sections:content.sections.map(section=>section.selected===undefined?section:{...section,lines:section.lines.map((line,index)=>({...line,action:`pick:${index}`}))})});
    const overlayOf=(content:OverlayContent):OverlayPanel=>fittedPanel(fitOverlay(content,{maxRows,columns}));

    let overlayNode:OverlayPanel|null=null;
    let approvalRows:StyledRow[]|null=null;
    /* the most a card may take: the footer stays under it at every size; only the QR code may take its rows */
    const cardLimit=Math.max(4,budgetInput.frameRows-(budgetInput.status??1)-1-budgetInput.footer-budgetInput.shortcut);
    if(fullAccessPrompt!==null)overlayNode=overlayOf(fullAccessConfirmationOverlay(fullAccessPrompt));
    else if(tooLargePrompt)overlayNode=overlayOf(requestTooLargeOverlay(tooLargePrompt.selected,tooLargePrompt.facts));
    else if(exitPrompt!==null)overlayNode=overlayOf(exitWithAgentsOverlay(exitPrompt,Math.max(1,workingAgents(state.agents).length)));
    else if(historyPicker)overlayNode=overlayOf(historyPickerOverlay({rows:history,picker:historyPicker,width:columns}));
    else if(configPanel)overlayNode=overlayOf(configPanelOverlay(configPanel));
    else if(contextInspector)overlayNode=overlayOf(contextInspectorOverlay(contextInspector));
    else if(trustCenter)overlayNode=overlayOf(trustCenterOverlay(trustCenter));
    else if(mcpCenter)overlayNode=overlayOf(mcpCenterOverlay(mcpCenter));
    else if(hookCenter)overlayNode=overlayOf(hookCenterOverlay(hookCenter));
    else if(pluginCenter)overlayNode=overlayOf(pluginCenterOverlay(pluginCenter));
    else if(memoryCenter)overlayNode=overlayOf(memoryCenterOverlay(memoryCenter));
    else if(notesCenter)overlayNode=overlayOf(notesCenterOverlay(notesCenter));
    else if(tasksCenter)overlayNode=overlayOf(tasksCenterOverlay(tasksCenter));
    else if(forgeCenter)overlayNode=overlayOf(forgeCenterOverlay(forgeCenter));
    else if(automationCenter)overlayNode=overlayOf(automationCenterOverlay(automationCenter));
    else if(researchCenter)overlayNode=overlayOf(researchCenterOverlay(researchCenter));
    else if(libraryCenter)overlayNode=overlayOf(libraryCenterOverlay(libraryCenter));
    else if(queueEditor)overlayNode=overlayOf(queueEditorOverlay({entries:controller.queueEntries(),selected:queueEditor.selected,paused:controller.queuePaused(),editing:queueEditor.editing,draft:queueEditor.draft}));
    else if(appState.overlay?.kind==='help'){const fitted=fitOverlay(helpDialogOverlay(effectiveKeymap,{offset:helpOffset}),{maxRows,columns});helpMaxOffsetRef.current=fitted.sections[0]?.maxOffset??0;helpPageRef.current=Math.max(1,maxRows-4);overlayNode=fittedPanel(fitted);}
    else if(appState.overlay?.kind==='approval'&&pending){
      const model=approvalDialogModel(pending,{expanded:approvalExpanded,selected:approvalSelected,unsandboxed:sandboxVerified===false});
      /* the research card's field stands under it and takes its rows from the card, so nothing goes past the frame */
      const field=researchEdit===null?[]:researchEditRows(researchEdit,columns);
      const cardMax=Math.max(4,cardLimit-field.length);
      const first=approvalCardRows(model,{columns,maxRows:cardMax,scrollOffset:approvalScroll});approvalMaxOffsetRef.current=first.fit.maxOffset;
      approvalRows=approvalScroll>first.fit.maxOffset?approvalCardRows(model,{columns,maxRows:cardMax,scrollOffset:first.fit.maxOffset}).rows:first.rows;
      approvalRows=[...approvalRows,...field];
    }
    else if(transcriptSearch)overlayNode=overlayOf(transcriptSearchOverlay({items:visibleTranscriptItems,state:{...transcriptSearch,selectedId:transcriptSelectedId,raw:transcriptRaw},raw:transcriptRaw}));
    else if(appState.overlay?.kind==='model')overlayNode=modelEffortStep
      ?overlayOf(effortLineOverlay({name:modelEffortStep.name,choices:effortRows,selected:pickerSelection.selected,current:state.status.model===modelEffortStep.id?(reasoningEffort??'default'):null,width:Math.max(20,columns-6),unicode:capabilities.unicode}))
      :overlayOf(pickable(modelPickerOverlay({label:modelList.label,provider:appState.overlay.provider,loading:modelList.loading,verified:modelList.verified,notice:modelList.notice??'',query:pickerQuery,rows:filteredModels,selected:pickerSelection.selected})));
    /* stage 7.10c: a choice started on the /provider sheet shows its steps as the sheet; the setup keeps its window */
    let stepPanel:Panel|null=null;
    const asSheet=appState.overlay?.kind==='provider'&&providerViaSheetRef.current;
    const providerStepNode=(content:OverlayContent,provider:TuiProvider)=>{if(asSheet){stepPanel=overlayAsPanel(t('panel.provider.title'),provider.label,content);return null;}return overlayOf(content);};
    if(asSheet&&providerStep.kind==='list')overlayNode=null;/* the provider is being checked: nothing to show for that moment */
    else if(appState.overlay?.kind==='provider'&&providerStep.kind==='key-actions')overlayNode=providerStepNode(providerKeyActionsOverlay({label:providerStep.provider.label,source:providerKeySourceLabel(providerStep.provider),choice:providerStep.choice,browserSignIn:providerStep.provider.id==='openrouter'&&typeof catalog?.startOpenRouterLogin==='function',signInOnly:signsIn(providerStep.provider),planNeeded:providerStep.planNeeded===true}),providerStep.provider);
    else if(appState.overlay?.kind==='provider'&&providerStep.kind==='login-choice')overlayNode=providerStepNode(providerLoginChoiceOverlay({label:providerStep.provider.label,choice:providerStep.choice,notice:providerStep.remediation?.message??(providerStep.provider.benched?t('screen.provider.benchedRetry',{benched:benchedKeyText(providerStep.provider.label,providerStep.provider.benched)}):null)}),providerStep.provider);
    else if(appState.overlay?.kind==='provider'&&providerStep.kind==='oauth')overlayNode=providerStepNode(providerOAuthOverlay({label:providerStep.provider.label,url:providerStep.url,mode:providerStep.mode,opened:providerStep.opened,phase:providerStep.phase,masked:maskedSecret(providerSecret),message:providerStep.message,intro:providerStep.intro,pasteable:providerStep.pasteable}),providerStep.provider);
    else if(appState.overlay?.kind==='provider'&&providerStep.kind==='address')overlayNode=providerStepNode(providerAddressOverlay({label:providerStep.provider.label,choice:providerStep.choice}),providerStep.provider);
    else if(appState.overlay?.kind==='provider'&&providerStep.kind==='consent')overlayNode=providerStepNode(providerConsentOverlay({provider:providerStep.provider,choice:providerStep.choice}),providerStep.provider);
    else if(appState.overlay?.kind==='provider'&&providerStep.kind==='key'){
      const label=providerStep.provider.label;
      /* B1 slice 18: a one-token key test is stated on this step, before Enter sends it; no further question is asked. */
      const keyTestNotice=typeof catalog?.keyTestNotice==='function'?catalog.keyTestNotice(providerStep.provider.id):null;
      /* B1 slice 25: a provider whose saved key is benched says so here, with the cause and until when, before another key is typed. */
      const remediation=providerStep.remediation?.message??null;
      const benched=!remediation&&providerStep.provider.benched?t('screen.provider.benchedRetry',{benched:benchedKeyText(label,providerStep.provider.benched)}):null;
      overlayNode=providerStepNode(providerKeyOverlay({label,remediation,benched,masked:maskedSecret(providerSecret),keyTestNotice,testing:providerStep.testing,result:providerStep.result?.message??null}),providerStep.provider);
    }
    else if(appState.overlay?.kind==='provider')overlayNode=overlayOf(pickable(providerPickerOverlay({query:pickerQuery,rows:filteredProviders,selected:pickerSelection.selected,chosen:chosenProvider,reachable:id=>providerPickerRef.current?.reachable(id)??null})));
    else if(appState.overlay?.kind==='session')overlayNode=overlayOf(pickable(sessionPickerOverlay({action:appState.overlay.action,query:pickerQuery,rows:filteredSessions,selected:pickerSelection.selected})));

    const diffPanel:OverlayPanel|null=diffView?overlayOf({head:[{text:t('screen.diff.title',{mode:diffView.mode}),tone:'title'}],sections:[{lines:diffView.lines.map(line=>({text:line.text,tone:line.kind==='file'||line.kind==='hunk'||line.kind==='add'||line.kind==='remove'?'strong' as const:'dim' as const})),offset:0}]}):null;
    const auxLines=auxCompletions.length&&fullAccessPrompt===null&&tooLargePrompt===null&&!appState.overlay&&!queueEditor&&!transcriptSearch&&!contextInspector&&!themePicker&&!configPanel&&!historyPicker&&!mcpCenter&&!hookCenter&&!pluginCenter&&!memoryCenter&&!notesCenter&&!tasksCenter&&!libraryCenter&&!researchCenter&&!automationCenter&&!forgeCenter?auxCompletions.map((value:string)=>h(Ink.Text,{key:value,dimColor:true,wrap:'truncate-end'},`  ${value}`)):[];
    /* R4 Q-R4-8 / E13: the live `@` list in the completions region, fitted to its own cap and to the R1 budget. */
    const completionPanel:OverlayPanel|null=fileCompletion&&fullAccessPrompt===null&&tooLargePrompt===null&&appState.focus.current==='composer'&&!appState.overlay&&!queueEditor&&!transcriptSearch&&!contextInspector&&!themePicker&&!configPanel&&!historyPicker&&!agentsSurface.page&&!trustCenter&&!mcpCenter&&!hookCenter&&!pluginCenter&&!memoryCenter&&!notesCenter&&!tasksCenter&&!libraryCenter&&!researchCenter&&!automationCenter&&!forgeCenter
      ?fittedPanel(fitOverlay(fileCompletionOverlay(fileCompletion),{maxRows:Math.min(maxRows,FILE_COMPLETION_MAX_ROWS),columns}),'completion')
      :null;
    const auxNodes:any[]=completionPanel?[completionPanel.element]:auxLines;
    /* Stage 3 (mockup t12s): the question card takes the composer's place, under the activity row; a card taller than its
       rows keeps its top and its closing border. */
    const questionRows=appState.overlay?.kind==='question'&&questionCard?questionCardRows(questionCard,columns,questionNow)
      /* the plan card in the same place (mockup step-04 t12s); its steps take what the frame leaves after the activity row */
      :appState.overlay?.kind==='plan'&&planCard?planCardRows(planCard,columns,Math.max(6,budgetInput.frameRows-3))
      /* the MCP card in the same place (mockup step-17) */
      :appState.overlay?.kind==='elicit'&&elicitCard?elicitCardRows(elicitCard,columns)
      /* a phone's folder request in the same place (consent-card.ts) */
      :appState.overlay?.kind==='consent'&&consentCard?consentCardRows(consentCard,columns,consentNow)
      /* T4: `/remote`'s card in the same place; it may take the whole frame while the QR is up (the conversation comes back after) */
      /* its height: the QR may take the whole frame while it is up (regions/budget.ts then sets the header and the footer rows
         aside, and they come back when the card closes), so a 22-row QR fits the 120×30 default window; every other screen of the
         card is small and leaves them be. Less the activity row and one transcript row, the budget's own floor. */
      :appState.overlay?.kind==='remote'&&remoteCard?remoteCardRows(remoteCard,columns,Math.max(8,budgetInput.frameRows-1-budgetInput.status),terminalRows,remoteAdminRef.current):null;
    /* Stage 7.3: the sheet stands where the composer stands (the mockup's panel), its height the mockup's panelHeight */
    const shownPanel=sheet?.panel??stepPanel;
    const centrePage=Boolean(shownPanel?.page&&!questionRows&&!approvalRows);
    const pageHeight=Math.max(4,budgetInput.frameRows-budgetInput.header-budgetInput.footer-budgetInput.shortcut);
    const sheetRows=!questionRows&&shownPanel?(centrePage?pageRows(shownPanel!,columns,pageHeight,{now:agentsNow,toast,note:pageNote&&(pageNoteOwnerRef.current===null||pageNoteOwnerRef.current===sheet?.name)?pageNote:null,noteTone:pageNoteToneRef.current,terminalColumns}):panelRows(shownPanel,columns,panelHeight(shownPanel,columns,terminalRows,2,1))):null;
    const remoteOpen=appState.overlay?.kind==='remote';
    cardOpenRef.current=Boolean(questionRows||approvalRows);
    const cardRows=questionRows?(remoteOpen?questionRows:fitCardRows(questionRows,cardLimit)):approvalRows??sheetRows;
    const b:Budget=layoutBudget({...budgetInput,...(cardRows?{composerRows:cardRows.length,cardKeepsFooter:centrePage||Boolean(approvalRows)||Boolean(questionRows&&!remoteOpen),page:centrePage}:{}),overlay:overlayNode?.rows??null,menu:menuRows||null,diff:diffPanel?.rows??null,aux:completionPanel?.rows??(auxLines.length||null)});
    /* R5a S9 (review D-14): the header names the folder once; `interactive` said nothing, `degraded` still does. */
    const agentViewTask=agentView?(agentView.task??t('screen.agentView.unnamed')):'';
    const headerStatus=agentView?t(agentView.done?'screen.agentView.done':'screen.agentView.watching',{task:agentViewTask}):boot.phase==='error'?t('screen.header.degraded'):'';
    /* The approved mockup (07/10 header; components/chrome-rows.ts): ` TALOS  ~/folder · branch`, or in an agent's view
       ` ◂ Watching agent: task  ← back` with the way back a target */
    const shownPlace=shellSafeText(homePath(projectRoot,homedir()));
    /* FE-048: what waits for the person in this window (SCHEDA: the shared register needs the kernel) */
    const toDo=(appState.overlay?.kind==='approval'?1:0)+(questionRef.current?1:0)+(planRef.current?1:0)+(elicitRef.current?1:0)+agentQuestions.length;
    const headerSegments=headerRow({workspace:shownPlace,branch:projectBranch,width:columns,status:agentView?'':headerStatus,watching:agentView?{task:agentViewTask,done:Boolean(agentView.done)}:null,tabs:true,review:Boolean(sheet?.panel.page&&sheet.name==='diff')});
    /* the mockup's footer (07/10 footerRows): the mode row, and from 100 columns the model row under it */
    const footerInput={cardOpen:cardOpenRef.current,mode:state.status.permissionMode,noSandbox:sandboxVerified===false,queueCount:kernelQueue.items.filter((item:any)=>item.origin==='person').length+queuedActions.length,width:terminalColumns,
      model:state.status.model,provider:providerVerification,snapshot:facts.snapshot,workspace:shownPlace,branch:projectBranch,consoleWarnings:consoleWarningCount,
      remote:{phones:remoteSnapshot.phones.map((phone:{name:string})=>phone.name),elsewhere:remoteSnapshot.state==='elsewhere'?remoteSnapshot.elsewhere:null,byCommand:remoteSnapshot.state==='elsewhere'&&remoteSnapshot.elsewhereKind==='command',
        administrator:remoteSnapshot.state!=='off'&&remoteSnapshot.elevated===true,elsewhereAdministrator:remoteSnapshot.elsewhereElevated===true}};
    const modeRow=zen?footerZenRow({...footerInput,zenRight:terminalColumns>=56?agentsCount(agentCardsNow):[]}):footerModeRow(footerInput),modelRow=zen?null:footerModelRow(footerInput);
    const composerPlaceholder=t(state.running?(prefs.busyInput==='steer'?'screen.chrome.placeholder.steer':prefs.busyInput==='interrupt'?'screen.chrome.placeholder.interrupt':'screen.chrome.placeholder.queue'):'screen.chrome.placeholder.idle');

    /* E1/E2: the root is exactly the frame; every region below is a box of the height the budget gave it, in this order,
       so the composer, the status row and the chrome sit at the bottom of the screen (D-03) and nothing overwrites
       anything (D-02). FE-048: the footer runs under the whole width, whatever columns stand above it. */
    const footerRows=b.shortcut+b.roster+b.extras+b.footer,centreRows=b.frameRows-footerRows;
    /* the session at work says how long, in seconds (owner 27/10); one that waits says so */
    const shownSessions=barSessions.map((session:BarSession)=>{
      const since=session.current&&state.running?statusStartedAt:barAlive.has(session.id)?session.startedAtMs??null:null;
      if(since!==null)return{...session,state:'progress',mark:agentsGlyph,role:'acc',when:t('screen.bar.since',{time:activityClock(agentsNow-since)})};
      if(session.current&&toDo)return{...session,state:'waiting',mark:'?',role:'warn',when:t('screen.bar.waiting')};
      /* the list says «running» and nothing here proves it: a closed window, a row that lags */
      return session.mark==='⠿'?{...session,state:'unknown',mark:'·',role:'faint'}:session;
    });
    /* FE-048: the Home's list, and what the model row says */
    const homeSessions:HomeSession[]=shownSessions.filter((session:BarSession)=>!session.parent).map((session:BarSession)=>({id:session.id,title:session.title,state:session.state??'unknown',when:session.at?panelWhen(session.at,{ago:true}):''}));
    shelfHomeRef.current=homeSessions;
    const homeModelId=state.status.model||null,homeColon=homeModelId?homeModelId.indexOf(':'):-1;
    const homeModel=homeModelId&&homeColon>0?homeModelId.slice(homeColon+1):homeModelId,homeProvider=homeModelId&&homeColon>0?homeModelId.slice(0,homeColon):null;
    const homeMedal=()=>restingMedal(theme.colors.background??'#000000').map(row=>row.map(cell=>({text:cell.text,roles:[...(cell.color?[`f:${cell.color}`]:[]),...(cell.background?[`g:${cell.background}`]:[])]})));
    /* FE-052: only the conversation in use knows its context: the others say so */
    shelfDataRef.current={now:agentsNow,glyph:agentsGlyph,automation:shelfAutomation(shelfAutomations,agentsNow),projects:shelfProjects(shownSessions.map((session:BarSession)=>({id:session.id,title:session.title,project:session.project??null,path:session.path??null,parent:session.parent??null,state:SHELF_STATE[session.state??'unknown'],context:session.current&&typeof facts.snapshot?.percent==='number'?facts.snapshot.percent:null,startedAtMs:session.current&&state.running?statusStartedAt:session.startedAtMs??null})),basename(projectRoot))};
    shelfColorsRef.current={accent:theme.colors.accent,background:theme.colors.background,foreground:theme.colors.foreground,warning:theme.colors.warning,success:theme.colors.success};
    const barState={width:shape.bar,height:centreRows,open:barGroups,selected:barSelected,focused:barFocused,sessions:shownSessions.slice(0,BAR_SESSIONS)};
    barEntriesRef.current=shape.bar?barEntries(barState):[];
    const mainFrame=h(Ink.Box,{key:'main',display:shape.whole?'none':'flex',flexDirection:'column',height:centreRows,flexShrink:0,overflowY:'hidden',width:screenColumns},
      /* stage 6c (mockup `unwatch`, its `◂` and `← back`): in the agent view, the part that says the way back is a target */
      b.header?h(Ink.Box,{key:'header',height:b.header,flexShrink:0,overflowY:'hidden'},renderStyledRows(h,Ink,[headerSegments],theme.colors,'header',registerHit)):null,
      /* FE-048: until the first row the Home takes the transcript's rows, and the prompt stays under it (components/home.ts). */
      visibleTranscriptItems.length===0&&!agentView
        ?h(Ink.Box,{key:'home',flexDirection:'column',height:b.transcript,flexShrink:0,overflowY:'hidden'},renderStyledRows(h,Ink,homeRows({width:columns,height:b.transcript,workspace:shownPlace,model:homeModel,provider:homeProvider,sessions:sessionsRead?homeSessions:null,loadingMs:Math.max(0,agentsNow-sessionsAskedAt.current),now:agentsNow,glyph:agentsGlyph,motion:capabilities.motion,unicode:capabilities.unicode,medal:capabilities.unicode&&capabilities.color&&terminalTrueColor(process.env)?homeMedal:null}).slice(0,b.transcript),theme.colors,'home',registerHit))
        :h(TranscriptView,{key:'transcript',hit:registerHit,clipRef:registerClip,openItems,items:mainTranscriptItems,scrollRows:viewport.offset,rowBudget:b.transcript,width:columns,maxProseWidth,raw:transcriptRaw,expandedTools:appState.expandedTools,reasoningVisible:appState.reasoningVisible,now:toolNow,revealId:transcriptRevealId,measurementStore:transcriptMeasurementStore,renderItem:renderTranscriptItem,onPlan:onTranscriptPlan,dimColor:footerColor,pill:transcriptJumpPillRow({columns,unseen:viewport.unseen,visible:viewport.offset>0})}),
      h(Regions.Panels,{key:'panels',budget:b,diff:diffPanel?.element??null,overlay:overlayNode?.element??null,aux:auxNodes,menu:menuOpen?h(CommandMenuView,{composerStore,selectionStore:commandMenuSelectionStore,maxRows:b.menu,columns,hit:registerHit}):null}),
      b.status?(statusText===null&&activitySegments?renderStyledRows(h,Ink,[activitySegments],theme.colors,'status'):h(Ink.Text,{key:'status',color:footerColor,dimColor:exitHint,wrap:'truncate-end'},statusText??'')):null,
      b.band?renderStyledRows(h,Ink,bandRows.slice(0,b.band),theme.colors,'queue-band',registerHit):null,
      b.composer?(cardRows?renderStyledRows(h,Ink,cardRows.length<=b.composer?cardRows:[...cardRows.slice(0,Math.max(0,b.composer-1)),cardRows.at(-1)!],theme.colors,'composer',registerHit):agentView
        ?h(Ink.Box,{key:'composer',borderStyle:'single',flexDirection:'column',flexShrink:0,height:2+b.composerContent+b.composerHints,overflowY:'hidden'},h(Ink.Text,{dimColor:true,wrap:'truncate-end'},t('screen.agentView.readOnly')))
        :h(ComposerView,{key:'composer',store:composerStore,vimHint,contentRows:b.composerContent,hintRows:b.composerHints,columns,placeholder:composerPlaceholder,accent:theme.colors.accent,faint:theme.colors.faint,frameless:zen})):null,
    );
    const statusBar=h(Regions.StatusBar,{key:'status-bar',budget:b,shortcutAside:aside.length?renderStyledRows(h,Ink,[aside],theme.colors,'agents-pill',registerHit):null,shortcutLine:agentView?truncateDisplay(t('screen.agentView.shortcuts'),Math.max(1,terminalColumns)):shortcutLine,
        shortcutNode:agentView||!modelRow?null:renderStyledRows(h,Ink,[modeRow],theme.colors,'mode-row',registerHit),
        footerNode:modelRow?renderStyledRows(h,Ink,[modelRow],theme.colors,'model-row',registerHit):renderStyledRows(h,Ink,[modeRow],theme.colors,'mode-row',registerHit),
        rosterLines:[],queueLine,reasoningLine:null,footerLine,statusSegments:statusRow.segments,toneColors:{warn:theme.colors.warning,high:theme.colors.danger,critical:theme.colors.danger},color:footerColor});
    /* One tree, whatever is open: opening a column changes no shape, so the chat is never mounted again. Stage 6a (mockup buildFrame): the
       panel, a rule, then the rest of the screen, over the footer. */
    return h(Ink.Box,{key:`frame-${appState.redrawNonce}-${live.id}`,flexDirection:'column',height:b.frameRows,flexShrink:0,overflowY:'hidden'},
      h(Ink.Box,{key:'columns',flexDirection:'row',height:centreRows,flexShrink:0,overflowY:'hidden'},
        shape.bar?h(Ink.Box,{key:'bar',flexDirection:'column',width:shape.bar,flexShrink:0,overflowY:'hidden'},renderStyledRows(h,Ink,sideBarRows(barState),theme.colors,'bar-rows',registerHit)):null,
        mainFrame,
        shape.panel?h(Ink.Box,{key:'panel',flexDirection:'column',width:shape.panel,flexShrink:0,overflowY:'hidden'},renderStyledRows(h,Ink,sidePanelRows({width:shape.panel,height:centreRows,title:t('screen.panel.title'),cards:[contextCard(facts.snapshot,shape.panel-4),agentsCard(agentCardsNow,shape.panel-4,{now:agentsNow,glyph:agentsGlyph})],open:panelCards,selected:panelSelected,focused:panelFocused}),theme.colors,'panel-rows',registerHit)):null),
      statusBar);
  };
}
