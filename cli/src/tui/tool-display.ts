/*
 * R2 CONTRACT (owner: lane T). The ONE table that turns a kernel tool name into what the screen shows (Q-R2-3, gate
 * E3), zipped once on the kernel name as Qwen zips `ToolNames` with `ToolDisplayNames` (`cli/src/ui/utils/
 * tool-display-map.ts:12-24`, 2026-09-06). Every surface reads it: transcript rows and renderer lookup (tools/registry.ts),
 * approval title and summary (overlays/approval-dialog.ts), permission mapping (security/from-approval.ts). The model
 * keeps the kernel names and argument keys (gate E2): this file maps for display and never renames what it receives.
 *
 * The 64 rows are the kernel's own tools, measured, not remembered: `ATTREZZI` (talosHarness.mjs:1743, 7 tools),
 * `ATTREZZI_ESTESI` (:2096, 56 tools) and `carica_skill` (:9254), 75 distinct argument keys (F001b: continua) — G02 remeasured the gate's
 * §1.3 count (46 tools, 53 keys) on the unified desktop kernel, 2026-10-01. test/i18n/tools-labels.test.ts imports those schemas and fails on a tool or key without a row here.
 */
import {en} from '../i18n/en.ts';
import {t,type MessageId} from '../i18n/index.ts';
import type {PermissionAction} from '../security/types.ts';

export type ToolDisplay={label:string;verb:string;primaryArg:string|null;/** the argument the primary value was read from */primaryKey?:string;permissionTool:string;raw:string};
export type ToolRendererKind='read'|'write'|'edit'|'bash'|'search'|'list'|'generic';
type PermissionTool=PermissionAction['tool'];
type Row={readonly permission:PermissionTool;readonly renderer:ToolRendererKind;readonly primary:readonly string[]};

const row=(permission:PermissionTool,renderer:ToolRendererKind,...primary:string[]):Row=>({permission,renderer,primary});
/*
 * `permission` is the tool the permission engine judges the call as (security/types.ts). The kernel asks for approval on
 * 30 of them (`verificaPermessoConBarriera`, talosHarness.mjs:8166-9714): reads are Read, the two file writers Write (a
 * write judged as Read was ALLOWED inside the project without asking, evaluate.ts:130 — review E-07), the targeted edit
 * Edit, the two command runners Bash, the web tools WebFetch; TALOS's own services are TalosService with the kernel
 * name as operation. `primary` lists the argument keys whose value stands beside the label, first present wins.
 */
const TABLE={
  elenca:row('Read','list','percorso'),
  cerca:row('Read','search','testo','nome'),
  leggi:row('Read','read','percorso'),
  scrivi:row('Write','write','percorso'),
  prova:row('Bash','bash'),
  shell:row('Bash','bash','comando'),
  naviga:row('WebFetch','generic','url'),
  web_search:row('WebFetch','generic','query'),
  artifact_create:row('TalosService','generic','titolo'),
  artifact_update:row('TalosService','generic','id'),
  document_create:row('TalosService','generic','title'),
  time_now:row('TalosService','generic'),
  delega_sottotask:row('TalosService','generic','task'),
  generate_image:row('TalosService','generic','prompt'),
  library_read:row('TalosService','generic','id'),
  library_file_origin:row('TalosService','generic','id'),
  library_rename:row('TalosService','generic','name','id'),
  library_delete:row('TalosService','generic','id'),
  library_export:row('TalosService','generic','reference'),
  library_context_policy_update:row('TalosService','generic','action'),
  notes_create:row('TalosService','generic','title'),
  notes_update:row('TalosService','generic','title','id'),
  notes_delete:row('TalosService','generic','id'),
  tasks_create:row('TalosService','generic','title'),
  tasks_complete:row('TalosService','generic','id'),
  tasks_update:row('TalosService','generic','title','id'),
  tasks_delete:row('TalosService','generic','id'),
  memory_write:row('TalosService','generic','title'),
  memory_update:row('TalosService','generic','title','id'),
  memory_delete:row('TalosService','generic','id'),
  research_start:row('TalosService','generic','question'),
  research_read:row('TalosService','generic','id'),
  research_rename:row('TalosService','generic','title','id'),
  research_delete:row('TalosService','generic','id'),
  research_deposit:row('Write','generic'),
  tool_create:row('TalosService','generic','title'),
  file_edit:row('Edit','edit','percorso'),
  carica_skill:row('TalosService','generic','nome'),
  /* G02 (2026-10-01): the unified desktop kernel's additions. */
  notes_read:row('TalosService','generic','id'),
  conversation_search:row('TalosService','generic','query','conversation_id'),
  workflow_plan_propose:row('TalosService','generic'),
  ask_user_question:row('TalosService','generic'),
  present_plan:row('TalosService','generic'),
  ask_parent:row('TalosService','generic','question'),
  answer_child_question:row('TalosService','generic','childId'),
  ask_child:row('TalosService','generic','childId'),
  answer_parent_question:row('TalosService','generic','requestId'),
  /* F-020 (kernel fc1398bff, owner 03/10 «Come Claude Code, completo»): the parent lists and stops its own children */
  list_children:row('TalosService','generic'),
  process_output:row('TalosService','generic','outputId'),
  workflow_status:row('TalosService','generic','runId'),
  workflow_output:row('TalosService','generic','nodeId','runId'),
  workflow_control:row('TalosService','generic','azione','runId'),
  request_plan_mode:row('TalosService','generic'),
  /* C5 (desktop, realigned 13/10/2026 to r4 de8f33317): the list and search tools of each store are ONE `*_find` tool, and the commands on a
     research, a child and an automation are ONE `*_control` tool with `action`. The names of before are in LEGACY_TABLE below. */
  library_find:row('TalosService','generic','query','file_type'),
  notes_find:row('TalosService','generic','query'),
  tasks_find:row('TalosService','generic','query','status'),
  memory_find:row('TalosService','generic','query','kind'),
  research_find:row('TalosService','generic','query','status'),
  research_control:row('TalosService','generic','action','id'),
  child_control:row('TalosService','generic','action','childId'),
  /* r4 (desktop 795df29f7…5b7a65f76, ported 09/10/2026): OpenRouter's excluded providers, offered to the CLI's model
     («Sì, con la carta»), and the scheduled automations, declared by the kernel but offered only to a host that runs them
     (talosHarness.mjs:11520, `onAutomazioneFn`; the CLI passes none). Each keeps a row so it never reaches a screen raw. */
  provider_exclusions_list:row('TalosService','generic'),
  provider_exclude:row('TalosService','generic','provider'),
  provider_allow:row('TalosService','generic','provider'),
  automation_list:row('TalosService','generic'),
  automation_runs:row('TalosService','generic','id'),
  automation_create:row('TalosService','generic','nome'),
  automation_update:row('TalosService','generic','nome','id'),
  automation_control:row('TalosService','generic','action','id'),
  /* r4 (ChatGPT plan, desktop 0.1.29): the model can read the state of the ChatGPT account; offered only where the host has that sign-in */
  chatgpt_account:row('TalosService','generic','action'),
  /* r4 c5ce4e453: declared by the kernel, not offered by the CLI (talos-composition.ts NOT_IN_THE_CLI) */
  local_model_window:row('TalosService','generic','action'),
  /* r4 blocks 13-18: declared by the kernel, offered only where the host can answer them (the CLI wires none of the three today) */
  view_image:row('Read','generic','path','url'),
  talos_help:row('TalosService','generic','query','page'),
  /* r4 blocks 25-26 and phase 8: declared by the kernel; app_settings needs a host the CLI is not, local_model is the desktop's engine */
  app_settings:row('TalosService','generic','action'),
  local_model:row('TalosService','generic','action'),
  local_page:row('TalosService','generic','port','path'),
  /* candidate 04/11/2026 (FE-008, talosHarness.mjs ATTREZZI_ESTESI): the Steps list, offered only with `listaPassi` (the CLI passes none) */
  steps_update:row('TalosService','generic'),
  /* candidate f304d1c9a (computer use, decision 129): the always-allowed places, offered only with `onLuoghiFn` (talosHarness.mjs ATTREZZI_LUOGHI,
     the PC host); the CLI passes none, so they never reach the CLI's model. Each keeps a row so it never reaches a screen raw. */
  computer_use_places_list:row('TalosService','generic'),
  computer_use_places_remove:row('TalosService','generic','name','type'),
  /* candidate bb3c61b4d (realigned 06/11/2026): computer_use (decision 129) is offered only with `onComputerUseFn` and an image reader, and
     browser_page (decision 201) only with `leggiPaginaBrowserFn` (talosHarness.mjs, the PC host); the CLI passes neither, so neither reaches the
     CLI's model. Each keeps a row so a saved conversation of the PC never shows them raw. */
  computer_use:row('TalosService','generic','task'),
  browser_page:row('TalosService','generic'),
  /* «One line», step 3 (11/11/2026): kernel 90050ecf1 (FE-081 scene 1+4) declares blocco_aggiorna, offered only when the host keeps the
     block versions (talosHarness.mjs:13727, blocchi/versioni.mjs: the PC); the CLI keeps none, so its model never gets it. It keeps a
     row so a saved conversation of the PC never shows it raw. */
  blocco_aggiorna:row('TalosService','generic','blocco'),
  report_problem:row('TalosService','generic','title'),
  /* r4 2bd1b3e27 (G6, the goal's second door): the model reads and sets the conversation's goal. The kernel's registry gives every
     root conversation the goal's channel; the CLI keeps the three out of `strumentiEstesi` (talos-composition.ts NOT_IN_THE_CLI)
     until it has a goal surface. Each keeps a row so it never reaches a screen raw (a saved conversation of another host). */
  goal_status:row('TalosService','generic'),
  goal_create:row('TalosService','generic','objective'),
  goal_update:row('TalosService','generic','status'),
  /* r4 feat/remoto-modulo (fused 19/10/2026): the model proposes undoing file changes (owner 18/10, R5.11) and lists, pairs and revokes
     phones (owner 18/10). Each is offered only to a host that passes its channel (onAnnullaFileFn, onTelefoniFn); the CLI passes none
     (owner 20/10: «Non ancora» for the undo) and also keeps them out of strumentiEstesi. A row each, so none reaches a screen raw. */
  file_changes_undo:row('TalosService','generic','from_turn'),
  remote_phones:row('TalosService','generic'),
  remote_phone_pair:row('TalosService','generic'),
  remote_phone_revoke:row('TalosService','generic','phone'),
  /* 0.6.14 (r4 integra/2026-10-25): remote control, the device folders and sending a file to a device, left out like the three above */
  remote_control:row('TalosService','generic'),
  remote_phone_folders:row('TalosService','generic','phone'),
  remote_phone_folder_allow:row('TalosService','generic','path'),
  remote_phone_folder_revoke:row('TalosService','generic','folder'),
  remote_phone_folder_unblock:row('TalosService','generic','folder'),
  remote_device_send_file:row('TalosService','generic','path'),
} as const satisfies Record<string,Row>;
/*
 * The names of before C5. They are NOT kernel tools any more (the kernel answers a call to one with the new name and an example,
 * `fraseAttrezzoRinominato`), but they still reach the screen: an approval card for a command keeps the type of before (`stop_child`,
 * `research_pause`… — talosHarness.mjs, `child_control`: «la carta tiene il tipo di sempre»), a permission rule written on one still
 * holds (the kernel takes the stricter of the two keys), and the conversations saved before show them. test/i18n/tools-labels.test.ts
 * pins this table to the kernel's own map, `ATTREZZI_RINOMINATI`.
 */
const LEGACY_TABLE={
  library_list:row('TalosService','generic'),
  library_search:row('TalosService','generic','query'),
  notes_list:row('TalosService','generic'),
  notes_search:row('TalosService','generic','query'),
  tasks_list:row('TalosService','generic','status'),
  tasks_search:row('TalosService','generic','query'),
  memory_list:row('TalosService','generic'),
  memory_search:row('TalosService','generic','query'),
  research_list:row('TalosService','generic','status'),
  research_search:row('TalosService','generic','query'),
  research_pause:row('TalosService','generic','id'),
  research_resume:row('TalosService','generic','id'),
  research_cancel:row('TalosService','generic','id'),
  stop_child:row('TalosService','generic','childId'),
  automation_pause:row('TalosService','generic','id'),
  automation_resume:row('TalosService','generic','id'),
  automation_run:row('TalosService','generic','id'),
  automation_stop:row('TalosService','generic','id'),
  pause_child:row('TalosService','generic','childId'),
  resume_child:row('TalosService','generic','childId'),
} as const satisfies Record<string,Row>;
/*
 * 0.6.11 (owner 20/10/2026: deferred tools on by default): the kernel's three fixed tools of the bridge (ponte-attrezzi.mjs,
 * NOMI_DEL_PONTE). They are not in the kernel's tool lists: the bridge adds them to a turn when it is on. A `tool_call` reaches
 * the screen as the tool it runs (agui-events.mjs, `chiamataPerChiGuarda`); the row is for a call the kernel refused. Pinned to
 * the kernel's names by test/i18n/tools-labels.test.ts.
 */
const BRIDGE_TABLE={
  tool_search:row('TalosService','generic'),
  tool_describe:row('TalosService','generic'),
  tool_call:row('TalosService','generic','name'),
} as const satisfies Record<string,Row>;
export type KernelToolName=keyof typeof TABLE;
export type LegacyToolName=keyof typeof LEGACY_TABLE;
export type BridgeToolName=keyof typeof BRIDGE_TABLE;
export type KnownToolName=KernelToolName|LegacyToolName|BridgeToolName;
export const LEGACY_TOOL_NAMES=Object.freeze(Object.keys(LEGACY_TABLE) as LegacyToolName[]);
export const BRIDGE_TOOL_NAMES=Object.freeze(Object.keys(BRIDGE_TABLE) as BridgeToolName[]);
const ROWS:Readonly<Record<string,Row>>={...LEGACY_TABLE,...BRIDGE_TABLE,...TABLE};
export const KERNEL_TOOL_NAMES=Object.freeze(Object.keys(TABLE) as KernelToolName[]);
/* Compile-time zip check: a row without its label and verb in i18n/en/tools.ts does not type-check. */
type MissingWords=Exclude<`tool.${KnownToolName}.${'label'|'verb'}`,MessageId>;
const WORDS_COMPLETE:[MissingWords] extends [never]?true:MissingWords=true;void WORDS_COMPLETE;

export function isKernelTool(name:unknown):name is KernelToolName{return typeof name==='string'&&Object.hasOwn(TABLE,name);}
/** A kernel tool of today, or a name of before C5 (an approval type, a saved conversation). */
export function isKnownTool(name:unknown):name is KnownToolName{return typeof name==='string'&&Object.hasOwn(ROWS,name);}
export function rendererKindFor(name:string):ToolRendererKind{return isKnownTool(name)?ROWS[name]!.renderer:'generic';}

/* A tool the kernel did not declare is named by whoever wrote it: an MCP server (`mcp__<server>__<tool>`,
   harness-ui/src/mcp-session.mjs:47), a plugin (`plugin__<plugin>__<tool>`, plugin-session.mjs:52), the Tool Forge
   (`forge_<id>`, forge-contract.mjs:127), or anything else. Their parts are split by these exact prefixes. */
export function externalToolParts(name:string):{kind:'mcp'|'plugin';owner:string;tool:string}|{kind:'forge';owner:null;tool:string}|null{
  for(const kind of ['mcp','plugin'] as const){
    const prefix=`${kind}__`;if(!name.startsWith(prefix))continue;
    const rest=name.slice(prefix.length),split=rest.indexOf('__');
    if(split>0&&split<rest.length-2)return{kind,owner:rest.slice(0,split),tool:rest.slice(split+2)};
  }
  if(name.startsWith('forge_')&&name.length>6)return{kind:'forge',owner:null,tool:name.slice(6)};
  return null;
}
/** snake_case, kebab-case and camelCase → lower-case words. */
function words(name:string):string{return name.replace(/([a-z0-9])([A-Z])/gu,'$1 $2').replace(/[_\-.\s]+/gu,' ').trim().toLowerCase();}
function capitalised(text:string){return text?text[0]!.toUpperCase()+text.slice(1):text;}

function permissionOfExternal(name:string):PermissionTool{const parts=externalToolParts(name);return parts?.kind==='mcp'?'Mcp':parts?.kind==='plugin'?'Plugin':'TalosService';}
/** The permission tool the engine judges this tool as: from the table, or from the external prefix. */
export function permissionToolFor(name:string):PermissionTool{return isKnownTool(name)?ROWS[name]!.permission:permissionOfExternal(name);}

/** The English label of an argument key: the dictionary's when it has one, otherwise the key in words. */
export function argumentLabel(key:string):string{const id=`tool.arg.${key}`;return Object.hasOwn(en,id)?t(id as MessageId):words(key);}

/* Keys an unknown tool's primary argument is looked for under (Hermes `_PRIMARY_ARGS`, agent/display.py:353-361, 2026-09-22). */
const EXTERNAL_PRIMARY=['path','file_path','file','url','query','command','pattern','name','title','id'];
/* 0.7.0 block 1, item 6: the argument keys a row shows as an address, host and path only (view_image reads an image from the web) */
const SHOWN_AS_ADDRESS:Readonly<Record<string,ReadonlySet<string>>>=Object.freeze({view_image:new Set(['url'])});
/** An address as a row shows it: host (with its port) and path; never `user:password@`, what follows `?` or `#`, nor an address
 *  that cannot be read (null). Hermes tools/delegate_tool_results.py:100-105 rebuilds the authority from host and port likewise. */
/** The argument keys of a tool shown as an address (empty for every other tool). */
export function addressArgumentKeys(kernelName:string):ReadonlySet<string>{return SHOWN_AS_ADDRESS[kernelName]??new Set<string>();}
export function addressShown(value:string):string|null{
  try{const url=new URL(value);if(!url.hostname)return null;return `${url.host}${url.pathname==='/'?'':url.pathname}`;}catch{return null;}
}
function primaryValue(keys:readonly string[],args:Readonly<Record<string,unknown>>|undefined,address?:ReadonlySet<string>):{value:string|null;key:string}|null{
  if(!args)return null;
  for(const key of keys){
    const value=args[key];
    /* an address key, once present, is the primary one even when it cannot be read: its raw text is never shown, here or below */
    if(address?.has(key)&&typeof value==='string'&&value.trim()!=='')return{value:addressShown(value),key};
    if((typeof value==='string'&&value.trim()!=='')||typeof value==='number'||typeof value==='boolean')return{value:String(value),key};
  }
  return null;
}

function externalLabel(name:string):string{
  const parts=externalToolParts(name);
  if(parts?.kind==='mcp')return t('tool.mcp.label',{tool:capitalised(words(parts.tool)),server:parts.owner});
  if(parts?.kind==='plugin')return t('tool.plugin.label',{tool:capitalised(words(parts.tool)),plugin:parts.owner});
  if(parts?.kind==='forge')return t('tool.forge.label',{tool:capitalised(words(parts.tool))});
  return capitalised(words(name))||t('tool.unknown.label');
}

/**
 * What the screen shows for a tool call: the English label and verb, the VALUE of its primary argument when `args` is
 * given (null when absent or not a plain value), the permission tool it is judged as, and the raw kernel name, which
 * only an expanded detail shows (Q-R2-3).
 */
export function toolDisplay(kernelName:string,args?:Readonly<Record<string,unknown>>):ToolDisplay{
  if(isKnownTool(kernelName)){
    const entry=ROWS[kernelName]!;const primary=primaryValue(entry.primary,args,SHOWN_AS_ADDRESS[kernelName]);
    return{label:t(`tool.${kernelName}.label`),verb:t(`tool.${kernelName}.verb`),primaryArg:primary?.value??null,...(primary?{primaryKey:primary.key}:{}),permissionTool:entry.permission,raw:kernelName};
  }
  const label=externalLabel(kernelName);const primary=primaryValue(EXTERNAL_PRIMARY,args);
  return{label,verb:t('tool.unknown.verb',{tool:label}),primaryArg:primary?.value??null,...(primary?{primaryKey:primary.key}:{}),permissionTool:permissionOfExternal(kernelName),raw:kernelName};
}
/** The argument keys a tool's primary value is read from, in order (the table's `primary`; R3 renderers read it too). */
export function primaryArgumentKeys(kernelName:string):readonly string[]{return isKnownTool(kernelName)?ROWS[kernelName]!.primary:EXTERNAL_PRIMARY;}
