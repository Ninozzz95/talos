import {mkdir,open,readFile,rename,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import type {CliPaths} from '../paths.ts';
import {projectId} from '../paths.ts';
import {CURRENT_UI_THEMES,DEFAULT_CONFIG,REASONING_EFFORTS,type ConfigEntryOrigin,type ConfigOrigin,type EffectiveConfig,type EffectiveOrigins,type IgnoredConfigValue,type ReasoningEffort,type TalosCliConfig} from './types.ts';
import {CURRENT_CONFIG_VERSION,migrateConfigValue} from './migrations.ts';

const ALLOWED=new Set(['version','model','reasoningEffort','permissionMode','outputFormat','updateChannel','providerRuntime','permissions','ui','extensions']);
const SECRET_KEY=/^(?:api[-_]?key|token|secret|password|authorization)$/iu;
function isObj(x:unknown):x is Record<string,unknown>{return !!x&&typeof x==='object'&&!Array.isArray(x);}
export function assertNoSecrets(value:unknown,path='config'):void{
  if(Array.isArray(value)){value.forEach((v,i)=>assertNoSecrets(v,`${path}[${i}]`));return;}
  if(!isObj(value))return;
  for(const [k,v] of Object.entries(value)){if(SECRET_KEY.test(k))throw new Error(`SECRET_FIELD_FORBIDDEN:${path}.${k}`);assertNoSecrets(v,`${path}.${k}`);}
}
function validate(obj:unknown):TalosCliConfig{
  if(!isObj(obj))throw new Error('CONFIG_INVALID'); assertNoSecrets(obj);
  for(const k of Object.keys(obj)) if(!ALLOWED.has(k)) throw new Error(`CONFIG_UNKNOWN_KEY:${k}`);
  const out=structuredClone(obj) as TalosCliConfig;
  if(out.version!==undefined&&out.version!==CURRENT_CONFIG_VERSION)throw new Error('CONFIG_VERSION_INVALID');
  if(out.permissionMode&&!['default','acceptEdits','plan','auto','dontAsk','bypassPermissions'].includes(out.permissionMode))throw new Error('CONFIG_INVALID_PERMISSION_MODE');
  if(out.outputFormat&&!['text','json','stream-json'].includes(out.outputFormat))throw new Error('CONFIG_INVALID_OUTPUT_FORMAT');
  if(out.reasoningEffort!==undefined&&!REASONING_EFFORTS.includes(out.reasoningEffort))throw new Error('CONFIG_INVALID_REASONING_EFFORT');
  const ui=(out as Record<string,unknown>).ui;
  if(ui!==undefined){
    if(!isObj(ui))throw new Error('CONFIG_INVALID_UI');
    if(ui.theme!==undefined&&(!CURRENT_UI_THEMES.includes(ui.theme as any)))throw new Error('CONFIG_INVALID_THEME');
    const keymap=ui.keymap;
    if(keymap!==undefined){
      if(!isObj(keymap))throw new Error('CONFIG_INVALID_KEYMAP');
      for(const [id,value] of Object.entries(keymap)){
        if(!id||!Array.isArray(value)||!value.every(chord=>typeof chord==='string'))throw new Error('CONFIG_INVALID_KEYMAP');
      }
    }
  }
  return out;
}
async function readJson(file:string):Promise<TalosCliConfig>{try{const parsed=JSON.parse(await readFile(file,'utf8'));return validate(migrateConfigValue(parsed).value);}catch(e:unknown){if((e as NodeJS.ErrnoException)?.code==='ENOENT')return{};throw e;}}
function deepMerge(base:Record<string,unknown>,overlay:Record<string,unknown>,origin:ConfigOrigin,origins:EffectiveOrigins,prefix=''):Record<string,unknown>{
  const out={...base}; for(const [k,v] of Object.entries(overlay)){const key=prefix?`${prefix}.${k}`:k;if(isObj(v)&&isObj(out[k]))out[k]=deepMerge(out[k] as Record<string,unknown>,v,origin,origins,key);else{out[k]=structuredClone(v);origins.set(key,origin);}}return out;
}
function files(paths:CliPaths,projectRoot:string){return{user:join(paths.configRoot,'config.json'),project:join(projectRoot,'.talos-cli','config.json'),projectUser:join(paths.projectOverridesRoot,projectId(projectRoot),'config.json')};}

type Layer={origin:ConfigOrigin;file:string|null;value:TalosCliConfig};
const PERMISSION_LISTS=['allow','ask','deny'] as const;
type PermissionList=typeof PERMISSION_LISTS[number];
/*
 * B1 slice 23 — EVERY SCOPE ADDS PERMISSION RULES; NO SCOPE REMOVES ONE.
 *
 * Measured at 5e05de8e: a list or a `null` in a later file replaced the earlier value, so a project's
 * `.talos-cli/config.json` setting `permissions.deny` (even to `[]`) switched off the person's own deny rules, a
 * project-user file written before slice 21 (`deny: []`) switched off the project's, and `permissions: null` became
 * three empty lists in main.ts. `cat secrets.txt`, denied in the user file, ran.
 *
 * Primary source, Claude Code documentation read through Context7 (`/websites/code_claude`) on 2026-09-17: "Arrays
 * merge across layers; scalars at a higher layer override lower ones" (glossary, Settings layers); "If a tool is
 * denied at any level, no other level can allow it" (permissions, Settings precedence).
 *
 * So `allow`, `ask` and `deny` are each the union of every scope's list, an entry listed twice is kept once, and
 * each entry keeps every scope that lists it, for `talos config origins`. An absent or `null` value holds no rule and
 * contributes nothing.
 * ⛔ A MALFORMED value is not dropped: slice 21 refuses to build the engine on it, by name, because a skipped deny
 * rule allows what it denied. It is handed on unchanged — a whole `permissions` that is not an object, or one list
 * that is not a list, the highest-precedence one first — and the engine stops the start. No valid rule is allowed
 * in its place.
 * Entries are ordered highest precedence first (project-user, project, user): `locate` in security/persist.ts names
 * the file of an unreadable entry by its index in the highest-precedence file that defines the list.
 * Writing a scope (`writeConfigScope`, `replaceConfigScope`, the slice 21 writer) keeps its per-file semantics:
 * only the reading side merges.
 */
function mergePermissions(layers:readonly Layer[],origins:EffectiveOrigins):unknown{
  const byPrecedence=[...layers].reverse();
  const entries:Record<PermissionList,Map<string,ConfigEntryOrigin>>={allow:new Map(),ask:new Map(),deny:new Map()};
  const badList:Partial<Record<PermissionList,{value:unknown;origin:ConfigOrigin}>>={};let badListRank=Infinity;
  let whole:{value:unknown;origin:ConfigOrigin;rank:number}|null=null;
  for(const [rank,layer] of byPrecedence.entries()){
    const permissions=(layer.value as Record<string,unknown>).permissions;
    if(permissions===undefined||permissions===null)continue;
    if(!isObj(permissions)){whole??={value:permissions,origin:layer.origin,rank};continue;}
    for(const list of PERMISSION_LISTS){
      const values=permissions[list];
      if(values===undefined||values===null)continue;
      if(!Array.isArray(values)){if(!badList[list]){badList[list]={value:values,origin:layer.origin};badListRank=Math.min(badListRank,rank);}continue;}
      for(const value of values){
        const key=typeof value==='string'?`rule:${value}`:`json:${JSON.stringify(value)}`;const known=entries[list].get(key);
        if(!known)entries[list].set(key,{value:structuredClone(value),origin:layer.origin,scopes:[layer.origin]});
        else if(!known.scopes.includes(layer.origin))known.scopes.push(layer.origin);
      }
    }
  }
  if(whole&&whole.rank<badListRank){origins.set('permissions',whole.origin);return structuredClone(whole.value);}
  // Keys other than the three lists are not rules; they keep the scalar precedence of every other key.
  let merged:Record<string,unknown>={};
  for(const layer of layers){const permissions=(layer.value as Record<string,unknown>).permissions;if(!isObj(permissions))continue;merged=deepMerge(merged,Object.fromEntries(Object.entries(permissions).filter(([key])=>!(PERMISSION_LISTS as readonly string[]).includes(key))),layer.origin,origins,'permissions');}
  for(const list of PERMISSION_LISTS){
    const bad=badList[list];
    if(bad){merged[list]=structuredClone(bad.value);origins.set(`permissions.${list}`,bad.origin);continue;}
    const kept=[...entries[list].values()];merged[list]=kept.map(entry=>structuredClone(entry.value));origins.set(`permissions.${list}`,kept);
  }
  return merged;
}

/*
 * B1 slice 23 — A REPOSITORY CANNOT SWITCH THE PERMISSION BOUNDARY OFF.
 *
 * Measured at 5e05de8e: `permissionMode: "bypassPermissions"` in a project's `.talos-cli/config.json` was the mode
 * of every run started in it. That file is part of the repository; the project-user file lives in the person's
 * profile and keeps its effect, as do the user file and `--permission-mode`.
 *
 * Primary source, Claude Code documentation via Context7 (`/websites/code_claude`), 2026-09-17, settings reference,
 * `permissions.defaultMode`: "`auto` and `bypassPermissions` don't take effect from project or local settings … Before
 * v2.1.257, `bypassPermissions` took effect from any file." Measured in the Claude Code 2.1.274 binary on this host on
 * the same day: it writes `settings defaultMode "bypassPermissions" ignored — only policy/user/flag settings may grant
 * bypass mode (projectSettings and localSettings are repo-controllable)` to its debug log only. TALOS says it where
 * the person looks (contract of slice 23): main.ts prints it before the screen starts and puts it in a
 * non-interactive result. The wording follows Claude Code's own "Ignoring 2 permissions.allow entries from
 * .claude/settings.local.json: …" (errors reference, same Context7 read).
 *
 * The value is dropped from the project layer, so the run uses the next scope's value. It is reported only when it
 * would otherwise have been the effective one: a project-user value or the command line decides regardless.
 */
const REPOSITORY_CANNOT_SELECT=new Set<string>(['bypassPermissions','auto']);
function describeOrigin(origin:ConfigOrigin,userFile:string){return origin==='user'?`the user configuration ${userFile}`:'the built-in default';}

export async function loadEffectiveConfig({paths,projectRoot,cli={}}:{paths:CliPaths;projectRoot:string;cli?:TalosCliConfig}):Promise<EffectiveConfig>{
  const f=files(paths,projectRoot); const origins:EffectiveOrigins=new Map();
  const layers:Layer[]=[
    {origin:'default',file:null,value:structuredClone(DEFAULT_CONFIG)},
    {origin:'user',file:f.user,value:await readJson(f.user)},
    {origin:'project',file:f.project,value:await readJson(f.project)},
    {origin:'project-user',file:f.projectUser,value:await readJson(f.projectUser)},
    {origin:'cli',file:null,value:validate(cli)},
  ];
  let held:{value:string;file:string}|null=null;
  let projectReasoning:{value:ReasoningEffort;file:string}|null=null;
  let projectKeymap:{value:unknown;file:string}|null=null;
  let value:Record<string,unknown>={};
  for(const layer of layers){
    const rest={...(layer.value as Record<string,unknown>)};
    // The defaults keep `permissions` so the key keeps its place; its value is replaced by the union below.
    if(layer.origin!=='default')delete rest.permissions;
    if(layer.origin==='project'&&typeof rest.permissionMode==='string'&&REPOSITORY_CANNOT_SELECT.has(rest.permissionMode)){held={value:rest.permissionMode,file:layer.file!};delete rest.permissionMode;}
    if(layer.origin==='project'&&typeof rest.reasoningEffort==='string'){projectReasoning={value:rest.reasoningEffort as ReasoningEffort,file:layer.file!};delete rest.reasoningEffort;}
    if(layer.origin==='project'&&isObj(rest.ui)&&Object.hasOwn(rest.ui,'keymap')){
      const ui={...(rest.ui as Record<string,unknown>)};
      projectKeymap={value:structuredClone(ui.keymap),file:layer.file!};
      delete ui.keymap;
      if(Object.keys(ui).length)rest.ui=ui;else delete rest.ui;
    }
    value=deepMerge(value,rest,layer.origin,origins);
  }
  value.permissions=mergePermissions(layers,origins);
  const ignored:IgnoredConfigValue[]=[];
  if(projectKeymap)ignored.push({
    code:'PROJECT_KEYMAP_IGNORED',path:'ui.keymap',value:projectKeymap.value,origin:'project',file:projectKeymap.file,
    message:`Ignoring ui.keymap from ${projectKeymap.file}: repository configuration cannot remap keyboard controls; use user or project-user configuration.`,
  });
  if(projectReasoning)ignored.push({
    code:'PROJECT_REASONING_EFFORT_IGNORED',path:'reasoningEffort',value:projectReasoning.value,origin:'project',file:projectReasoning.file,
    message:`Ignoring reasoningEffort "${projectReasoning.value}" from ${projectReasoning.file}: repository configuration cannot force reasoning spend; use user, project-user, or an explicit session choice.`,
  });
  const modeOrigin=origins.get('permissionMode');
  if(held&&(modeOrigin==='default'||modeOrigin==='user')){
    const used=typeof value.permissionMode==='string'?value.permissionMode:'default';
    ignored.push({code:'PERMISSION_MODE_IGNORED',path:'permissionMode',value:held.value,origin:'project',file:held.file,
      message:`Ignoring permissionMode "${held.value}" from ${held.file}: a project file is part of the repository, so it cannot select "bypassPermissions" or "auto" (the user configuration, the project-user configuration or --permission-mode can). This run uses "${used}" from ${describeOrigin(modeOrigin,f.user)}.`});
  }
  return{value:value as TalosCliConfig,origins,ignored};
}
async function atomicWriteText(file:string,text:string){await mkdir(dirname(file),{recursive:true,mode:0o700});const tmp=`${file}.tmp-${process.pid}-${Date.now()}`;await writeFile(tmp,text,{encoding:'utf8',mode:0o600});const h=await open(tmp,'r+');try{await h.sync();}finally{await h.close();}await rename(tmp,file);}
async function atomicWrite(file:string,value:TalosCliConfig){const current=validate(migrateConfigValue(value).value);await atomicWriteText(file,`${JSON.stringify(current,null,2)}\n`);}
export async function writeConfigScope({paths,projectRoot,scope,patch}:{paths:CliPaths;projectRoot:string;scope:'user'|'project'|'project-user';patch:TalosCliConfig}):Promise<void>{assertNoSecrets(patch);const f=files(paths,projectRoot);const file=scope==='user'?f.user:scope==='project'?f.project:f.projectUser;const current=await readJson(file);const origins:EffectiveOrigins=new Map();const merged=deepMerge(current as Record<string,unknown>,validate(patch) as Record<string,unknown>,scope==='project-user'?'project-user':scope,origins);await atomicWrite(file,merged as TalosCliConfig);}
export async function readConfigScope({paths,projectRoot,scope}:{paths:CliPaths;projectRoot:string;scope:'user'|'project'|'project-user'}):Promise<TalosCliConfig>{const f=files(paths,projectRoot);return readJson(scope==='user'?f.user:scope==='project'?f.project:f.projectUser);}

export async function replaceConfigScope({paths,projectRoot,scope,value}:{paths:CliPaths;projectRoot:string;scope:'user'|'project'|'project-user';value:TalosCliConfig}):Promise<void>{const f=files(paths,projectRoot);const file=scope==='user'?f.user:scope==='project'?f.project:f.projectUser;await atomicWrite(file,value);}

function scopeFile(paths:CliPaths,projectRoot:string,scope:'user'|'project'|'project-user'){const f=files(paths,projectRoot);return scope==='user'?f.user:scope==='project'?f.project:f.projectUser;}
export async function migrateConfigScope({paths,projectRoot,scope}:{paths:CliPaths;projectRoot:string;scope:'user'|'project'|'project-user'}){
  const file=scopeFile(paths,projectRoot,scope);
  let raw:string;try{raw=await readFile(file,'utf8');}catch(error:unknown){if((error as NodeJS.ErrnoException)?.code==='ENOENT')raw='{}\n';else throw error;}
  const result=migrateConfigValue(JSON.parse(raw));
  const backupFile=`${file}.migration-backup`;
  if(result.changed){await atomicWriteText(backupFile,raw);await atomicWrite(file,result.value);}
  return{...result,file,backupFile:result.changed?backupFile:null};
}
export async function rollbackConfigMigration({paths,projectRoot,scope}:{paths:CliPaths;projectRoot:string;scope:'user'|'project'|'project-user'}){
  const file=scopeFile(paths,projectRoot,scope);const backupFile=`${file}.migration-backup`;
  let raw:string;try{raw=await readFile(backupFile,'utf8');}catch(error:unknown){if((error as NodeJS.ErrnoException)?.code==='ENOENT')throw Object.assign(new Error('CONFIG_MIGRATION_BACKUP_NOT_FOUND'),{code:'CONFIG_MIGRATION_BACKUP_NOT_FOUND'});throw error;}
  JSON.parse(raw);
  await atomicWriteText(file,raw);
  return{restored:true,file,backupFile};
}
