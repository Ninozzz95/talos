import type {OutputFormat, PermissionMode} from '../args.ts';
export type PermissionRules={allow:string[];ask:string[];deny:string[]};
export type KeymapConfig=Record<string,string[]>;
export type UiTheme='calm'|'ember'|'coral'|'rose'|'violet'|'indigo'|'azure'|'cyan'|'teal'|'jade'|'mono';
export const CURRENT_UI_THEMES:readonly UiTheme[]=Object.freeze(['calm','ember','coral','rose','violet','indigo','azure','cyan','teal','jade','mono']);
export type ReasoningEffort='low'|'medium'|'high'|'xhigh'|'max';
export const REASONING_EFFORTS:readonly ReasoningEffort[]=Object.freeze(['low','medium','high','xhigh','max']);
export type TalosCliConfig={
  version?:1;
  model?:string; reasoningEffort?:ReasoningEffort; permissionMode?:PermissionMode; outputFormat?:OutputFormat; updateChannel?:'stable'|'preview';
  providerRuntime?:Record<string,{endpoint?:string;timeoutSeconds?:number}>;
  permissions?:PermissionRules;
  ui?:{theme?:UiTheme;markdown?:boolean;keymap?:KeymapConfig};
  extensions?:{enabled?:string[]};
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
 | {code:'PROJECT_REASONING_EFFORT_IGNORED';path:'reasoningEffort';value:ReasoningEffort;origin:'project';file:string;message:string};
export type EffectiveConfig={value:TalosCliConfig;origins:EffectiveOrigins;ignored:IgnoredConfigValue[]};
export const DEFAULT_CONFIG:TalosCliConfig={version:1,permissionMode:'default',outputFormat:'text',updateChannel:'stable',permissions:{allow:[],ask:[],deny:[]},ui:{theme:'calm',markdown:true},extensions:{enabled:[]}};
