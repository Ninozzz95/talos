import {t} from '../i18n/index.ts';import {loadEffectiveConfig,migrateConfigScope,readConfigScope,rollbackConfigMigration} from '../config/load.ts';import {configGet,configOrigins,configSet,configUnset,type ConfigScope} from '../config/commands.ts';import {formatModeAwareSimulation,kernelSecretClassifier,simulatePermissionInMode} from '../security/permission-dry-run.ts';import {createLocalAutoClassifier} from '../security/auto-classifier.ts';import {cliShellIsolation} from '../security/execution-backends.ts';import type {PermissionAction,PermissionMode,RuleSetInput} from '../security/types.ts';import {createTrustAuthority} from '../security/trust-authority.ts';import type {CommandContext} from './context.ts';import {assertNoUnknownOptions,parseJsonValue,takeOption,writeValue} from './context.ts';
function scope(args:string[]):ConfigScope{const s=takeOption(args,'--scope')??'user';if(!['user','project','project-user'].includes(s))throw new Error('CONFIG_SCOPE_INVALID');return s as ConfigScope;}
function keymapPath(path:string){return path==='ui.keymap'||path.startsWith('ui.keymap.');}
function valueContainsKeymap(path:string,value:unknown){return keymapPath(path)||(path==='ui'&&!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.hasOwn(value as object,'keymap'));}
const PERMISSION_TOOLS=new Set<PermissionAction['tool']>(['Read','Write','Edit','Bash','WebFetch','Mcp','Hook','Plugin','TalosService']);
function permissionDryRunAction(args:string[]):PermissionAction{
  const toolRaw=takeOption(args,'--tool');if(!toolRaw||!PERMISSION_TOOLS.has(toolRaw as PermissionAction['tool']))throw new Error('PERMISSION_DRY_RUN_TOOL_INVALID');
  const tool=toolRaw as PermissionAction['tool'];
  const command=takeOption(args,'--command'),resource=takeOption(args,'--resource'),serverId=takeOption(args,'--server-id'),operation=takeOption(args,'--operation');
  assertNoUnknownOptions(args);if(args.length)throw new Error(t('common.args.unexpected',{arg:args[0]!}));
  if(tool==='Bash'&&!command)throw new Error('PERMISSION_DRY_RUN_COMMAND_REQUIRED');
  if(['Read','Write','Edit'].includes(tool)&&!resource)throw new Error('PERMISSION_DRY_RUN_RESOURCE_REQUIRED');
  if(tool==='Mcp'&&!serverId)throw new Error('PERMISSION_DRY_RUN_SERVER_REQUIRED');
  if(tool!=='Bash'&&!resource&&!serverId&&!operation)throw new Error('PERMISSION_DRY_RUN_TARGET_REQUIRED');
  return{tool,...(command?{command}:{}),...(resource?{resource}:{}),...(serverId?{serverId}:{}),...(operation?{operation}:{})};
}
/*
 * F-P-004 (stress test of 0.5.0; owner 09/10/2026 «Escluse e dette a parte»): what the read-only commands call "effective"
 * is what a session would apply, and a session applies a project's file only once the project is trusted. A trust store
 * that cannot be read counts as not trusted: the dry-run must never show a rule as applied that no turn would apply.
 */
async function effectiveForThisProject(ctx:CommandContext){
  let trusted=false;
  try{trusted=(await createTrustAuthority({projectRoot:ctx.projectRoot,trustRoot:ctx.paths.trust.projects}).inspect()).trusted;}catch{trusted=false;}
  const effective=await loadEffectiveConfig({paths:ctx.paths,projectRoot:ctx.projectRoot,projectTrusted:trusted});
  const untrusted=effective.ignored.find(row=>row.code==='PROJECT_UNTRUSTED_IGNORED');
  return{effective,untrusted:untrusted?{note:untrusted.message,rules:untrusted.value.rules}:null};
}
export async function runConfigCommand(ctx:CommandContext,args0:string[]){
  const args=[...args0];const op=args.shift()??'list';
  if(op==='permissions'){
    const sub=args.shift();if(sub!=='dry-run')throw new Error('CONFIG_PERMISSIONS_OPERATION_INVALID');
    const action=permissionDryRunAction(args);const {effective,untrusted}=await effectiveForThisProject(ctx);
    const rules=(effective.value.permissions??{allow:[],ask:[],deny:[]}) as RuleSetInput;
    /* F-P-001: what a session would do, in the mode it would run in (the same choice as main.ts `selectedMode`). */
    const mode=(ctx.invocation.permissionMode??effective.value.permissionMode??'default') as PermissionMode;
    /* F-P-001 second pass: `auto` gets the classifier a session gets (main.ts), built only in that mode. */
    const classifier=mode==='auto'?createLocalAutoClassifier({shellIsolation:cliShellIsolation({paths:{cacheRoot:ctx.paths.cacheRoot}})}):undefined;
    const result=await simulatePermissionInMode({rules,action,projectRoot:ctx.projectRoot,mode,classifySecret:kernelSecretClassifier(ctx.repoRoot,ctx.projectRoot),...(classifier?{classifier}:{})});
    if(!untrusted){writeValue(ctx,result,formatModeAwareSimulation(result));return 0;}
    writeValue(ctx,{...result,untrustedProject:{rulesNotApplied:untrusted.rules,trustWith:t('common.project.trustCommand')}},`${formatModeAwareSimulation(result).replace(/\n?$/u,'\n')}${untrusted.note}\n`);return 0;
  }
  if(op==='list'||op==='origins'||op==='get'){
    const path=op==='get'?args.shift():undefined;if(op==='get'&&!path)throw new Error('CONFIG_PATH_REQUIRED');if(op==='get')assertNoUnknownOptions(args);
    const {effective,untrusted}=await effectiveForThisProject(ctx);
    if(untrusted)ctx.io.writeErr(`${untrusted.note}\n`);
    writeValue(ctx,op==='list'?effective.value:op==='origins'?configOrigins(effective):configGet(effective.value,path!));return 0;
  }
  if(op==='set'){const path=args.shift(),raw=args.shift();if(!path||raw===undefined)throw new Error('CONFIG_SET_REQUIRES_PATH_VALUE');const sc=scope(args);assertNoUnknownOptions(args);const value=parseJsonValue(raw);if(sc==='project'&&valueContainsKeymap(path,value))throw new Error('CONFIG_KEYMAP_SCOPE_INVALID');await configSet({paths:ctx.paths,projectRoot:ctx.projectRoot,scope:sc,path,value});writeValue(ctx,{ok:true,scope:sc,path},`Set ${path} (${sc})\n`);return 0;}
  if(op==='unset'){const path=args.shift();if(!path)throw new Error('CONFIG_PATH_REQUIRED');const sc=scope(args);assertNoUnknownOptions(args);if(sc==='project'&&keymapPath(path))throw new Error('CONFIG_KEYMAP_SCOPE_INVALID');await configUnset({paths:ctx.paths,projectRoot:ctx.projectRoot,scope:sc,path});writeValue(ctx,{ok:true,scope:sc,path},`Unset ${path} (${sc})\n`);return 0;}
  if(op==='show'){const user=await readConfigScope({paths:ctx.paths,projectRoot:ctx.projectRoot,scope:'user'});writeValue(ctx,user);return 0;}
  if(op==='migrate'){const sc=scope(args);assertNoUnknownOptions(args);const result=await migrateConfigScope({paths:ctx.paths,projectRoot:ctx.projectRoot,scope:sc});writeValue(ctx,result,`Migrated config ${sc}: ${result.fromVersion} -> ${result.toVersion}${result.changed?'':' (already current)'}\n`);return 0;}
  if(op==='rollback'){const sc=scope(args);assertNoUnknownOptions(args);const result=await rollbackConfigMigration({paths:ctx.paths,projectRoot:ctx.projectRoot,scope:sc});writeValue(ctx,result,`Rolled back config ${sc}\n`);return 0;}
  throw new Error(`Unsupported config operation: ${op}`);
}
