import type {OutputFormat, PermissionMode} from '../args.ts';
export type PermissionRules={allow:string[];ask:string[];deny:string[]};
export type KeymapConfig=Record<string,string[]>;
/* R5b D4 (Q-R5-14): the product's ten dark themes, plus mono (no colour). Config v2; older ids move in config/migrations.ts. */
export type UiTheme='calm'|'forge'|'terminal'|'aurora'|'ember'|'atlas'|'noir'|'signal'|'violet'|'telemetry'|'mono';
export const CURRENT_UI_THEMES:readonly UiTheme[]=Object.freeze(['calm','forge','terminal','aurora','ember','atlas','noir','signal','violet','telemetry','mono']);
/** R1 (Q-R1-4, E10): what leaving the full-screen TUI prints: the transcript then the resume line, or only the resume line. */
export type UiExitOutput='transcript'|'resume';
export const UI_EXIT_OUTPUTS:readonly UiExitOutput[]=Object.freeze(['transcript','resume']);
export type UiNotifications='auto'|'bell'|'off';
export const UI_NOTIFICATIONS:readonly UiNotifications[]=Object.freeze(['auto','bell','off']);
/* `file` (owner 27/10/2026, development mode): only in a test profile and only through TALOS_CREDENTIAL_STORE (provider/store.ts) */
export type CredentialStoreKind='system'|'memory'|'file';
export const CREDENTIAL_STORES:readonly CredentialStoreKind[]=Object.freeze(['system','memory','file']);
/** What `credentials.store` in a configuration file may say: never `file` (a test-profile choice, made by the variable only). */
export const CONFIG_CREDENTIAL_STORES:readonly CredentialStoreKind[]=Object.freeze(['system','memory']);
export type ReasoningEffort='low'|'medium'|'high'|'xhigh'|'max';
/* R5 CONTRACT: Q-R5-7 / Q-R5-9. */
export type UiBusyInput='queue'|'steer'|'interrupt';
/* stage 7.11 (mockup Settings «Thinking collapsed · expanded · hidden»): hidden draws no reasoning at all */
export type UiReasoning='collapsed'|'visible'|'hidden';
/* stage 7.11 (mockup «Tool rows grouped · one per call»): reads and searches grouped, or every call on its own row */
export type UiToolRows='grouped'|'each';
export const UI_TOOL_ROWS:readonly UiToolRows[]=Object.freeze(['grouped','each']);
/* FE-048: the view the app opens in (D2 of the redesign) */
export type UiStartView='essential'|'zen'|'full';
export const UI_START_VIEWS:readonly UiStartView[]=Object.freeze(['essential','zen','full']);
/* R5a lane R: the values config/load.ts accepts, and the owner's defaults (Q-R5-7 queue, Q-R5-9 collapsed). */
export const UI_BUSY_INPUTS:readonly UiBusyInput[]=Object.freeze(['queue','steer','interrupt']);
export const UI_REASONING_MODES:readonly UiReasoning[]=Object.freeze(['collapsed','visible','hidden']);
/* Stage 3 (owner 02/10: 5 minutes + a row in /config; WCAG 2.2 SC 2.2.1): how long a question of the model waits on screen
   before it closes as expired. Like Claude Code askUserQuestionTimeout and the desktop's askTimeout. */
export type UiQuestionTimeout='never'|'1m'|'5m'|'10m';
export const UI_QUESTION_TIMEOUTS:readonly UiQuestionTimeout[]=Object.freeze(['never','1m','5m','10m']);
export function questionTimeoutMs(value:UiQuestionTimeout|undefined):number|null{
  return({never:null,'1m':60_000,'5m':300_000,'10m':600_000} as const)[value??'5m'];
}
/** R5a lane R (Q-R5-3): the bounds of a person's model override; outside them the value is refused by name, never clamped. */
export const MODEL_WINDOW_MIN=1_024;
export const MODEL_WINDOW_MAX=10_000_000;
export const REASONING_EFFORTS:readonly ReasoningEffort[]=Object.freeze(['low','medium','high','xhigh','max']);
/* ASYNC step 7 (owner 01/10): the ranges of the delegated agents' limits; the defaults are the kernel's (10 and 2). */
export const AGENTS_MAX_CONCURRENT_RANGE:readonly [number,number]=Object.freeze([1,32]) as readonly [number,number];
export const AGENTS_MAX_DEPTH_RANGE:readonly [number,number]=Object.freeze([1,4]) as readonly [number,number];
export type AgentsConfig={maxConcurrent?:number;maxDepth?:number;model?:string;reasoningEffort?:ReasoningEffort};
export type TalosCliConfig={
  version?:2;/* R5b D4: v2 = the product themes (config/migrations.ts). */
  model?:string; reasoningEffort?:ReasoningEffort; permissionMode?:PermissionMode; outputFormat?:OutputFormat; updateChannel?:'stable'|'preview';
  providerRuntime?:Record<string,{endpoint?:string;timeoutSeconds?:number}>;
  permissions?:PermissionRules;
  /* R5 CONTRACT (lane R adds defaults and validation in load.ts; lane S reads and writes them): Q-R5-7 busy input mode,
     Q-R5-9 reasoning shown collapsed or visible. */
  ui?:{theme?:UiTheme;markdown?:boolean;/** REV-NATIVE-SELECTION: opt in to mouse reports; absent/false preserves terminal text selection. */mouse?:boolean;notifications?:UiNotifications;maxProseWidth?:number|null;keymap?:KeymapConfig;exitOutput?:UiExitOutput;busyInput?:UiBusyInput;reasoning?:UiReasoning;/** stage 3: how long a question of the model waits before it closes */questionTimeout?:UiQuestionTimeout;/** R5a (owner 2026-09-24): the busy-input tip was shown once, for good. */busyTipSeen?:boolean;/** R5b D5 (Q-R5-15): prompt history kept across sessions, per project; false turns it off. */history?:{persist?:boolean};/** stage 7.11: tool rows grouped or one per call; motion reduced as TALOS_REDUCED_MOTION does; the editor for Ctrl+G (else $VISUAL, $EDITOR) */toolRows?:UiToolRows;startView?:UiStartView;reduceMotion?:boolean;editor?:string};
  /** R5 Q-R5-3: a person's override of a model's context window, keyed `provider:model`. R5a lane R adds the optional
   *  `maxOutputTokens` (the reserve the kernel sends as `max_tokens` once the Context Engine is on; Pi's per-model override
   *  `maxTokens`, pi-mono provider-composer.ts:184, 2026-09-24). */
  models?:Record<string,{contextWindow?:number;maxOutputTokens?:number;providerRouting?:import('../provider/openrouter-routing.ts').ProviderRouting}>;
  extensions?:{enabled?:string[]};
  /** ASYNC step 7: delegated agents' limits and defaults (Codex `agents.*`); set by the person only, never a repository. */
  agents?:AgentsConfig;
  /** R2 (gate E13, Q-R2-5): where provider keys are kept; TALOS_CREDENTIAL_STORE wins over it (`provider/store.ts`). */
  credentials?:{store?:CredentialStoreKind};
  /** R5b (owner 2026-09-24): `modelsDev: false` turns off the models.dev catalogue request (TALOS_MODELS_DEV=off also does). */
  catalog?:{modelsDev?:boolean};
  /** 14/10/2026 (owner): the Context Engine summarises at the lower of half the input limit and this many tokens (200,000 when absent); null = no cap. */
  context?:{compactAtTokens?:number|null;/** C6: who writes the summaries, `provider:model`; null = what TALOS chooses. */summaryModel?:string|null;/** C6-bis: who writes when that one is blocked: `provider:model`, `conversation`, or null for nobody. */summaryBackup?:string|null};
};
export type ConfigOrigin='default'|'user'|'project'|'project-user'|'cli';
/** B1 slice 23. One entry of an effective permission list: the scope it takes effect from (the highest-precedence
 *  one) and every scope that lists it, highest precedence first. `talos config origins` shows these, entry by entry. */
export type ConfigEntryOrigin={value:unknown;origin:ConfigOrigin;scopes:ConfigOrigin[]};
/** A key path's origin; `permissions.allow`, `permissions.ask` and `permissions.deny` carry one origin per entry. */
export type EffectiveOrigins=Map<string,ConfigOrigin|ConfigEntryOrigin[]>;
/** B1 slice 23. A value read from a file that does not take effect, and the sentence that says so. */
export type IgnoredConfigValue=
 | {code:'PERMISSION_MODE_IGNORED';path:'permissionMode';value:string;origin:'project';file:string;message:string}
 | {code:'PROJECT_KEYMAP_IGNORED';path:'ui.keymap';value:unknown;origin:'project';file:string;message:string}
 | {code:'PROJECT_REASONING_EFFORT_IGNORED';path:'reasoningEffort';value:ReasoningEffort;origin:'project';file:string;message:string}
 | {code:'PROJECT_AGENTS_IGNORED';path:'agents';value:unknown;origin:'project';file:string;message:string}
 | {code:'PROJECT_CREDENTIAL_STORE_IGNORED';path:'credentials.store';value:unknown;origin:'project';file:string;message:string}
 | {code:'PROJECT_MODELS_IGNORED';path:'models';value:unknown;origin:'project';file:string;message:string}
 /* F-P-004: the whole repository file of a project that is not trusted (read-only commands only). */
 | {code:'PROJECT_UNTRUSTED_IGNORED';path:'';value:{rules:number};origin:'project';file:string;message:string};
export type EffectiveConfig={value:TalosCliConfig;origins:EffectiveOrigins;ignored:IgnoredConfigValue[]};
export const DEFAULT_CONFIG:TalosCliConfig={version:2,permissionMode:'default',outputFormat:'text',updateChannel:'stable',permissions:{allow:[],ask:[],deny:[]},ui:{theme:'forge',markdown:true,notifications:'auto',maxProseWidth:null,exitOutput:'transcript',busyInput:'queue',reasoning:'collapsed',questionTimeout:'5m'},extensions:{enabled:[]}};
