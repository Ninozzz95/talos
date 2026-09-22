import {loadEffectiveConfig,migrateConfigScope,readConfigScope,rollbackConfigMigration} from '../config/load.ts';import {configGet,configOrigins,configSet,configUnset,type ConfigScope} from '../config/commands.ts';import {formatPermissionSimulation,simulatePermission} from '../security/permission-explanation.ts';import type {PermissionAction,RuleSetInput} from '../security/types.ts';import type {CommandContext} from './context.ts';import {assertNoUnknownOptions,parseJsonValue,takeOption,writeValue} from './context.ts';
function scope(args:string[]):ConfigScope{const s=takeOption(args,'--scope')??'user';if(!['user','project','project-user'].includes(s))throw new Error('CONFIG_SCOPE_INVALID');return s as ConfigScope;}
function keymapPath(path:string){return path==='ui.keymap'||path.startsWith('ui.keymap.');}
function valueContainsKeymap(path:string,value:unknown){return keymapPath(path)||(path==='ui'&&!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.hasOwn(value as object,'keymap'));}
const PERMISSION_TOOLS=new Set<PermissionAction['tool']>(['Read','Write','Edit','Bash','WebFetch','Mcp','Hook','Plugin','TalosService']);
function permissionDryRunAction(args:string[]):PermissionAction{
  const toolRaw=takeOption(args,'--tool');if(!toolRaw||!PERMISSION_TOOLS.has(toolRaw as PermissionAction['tool']))throw new Error('PERMISSION_DRY_RUN_TOOL_INVALID');
  const tool=toolRaw as PermissionAction['tool'];
  const command=takeOption(args,'--command'),resource=takeOption(args,'--resource'),serverId=takeOption(args,'--server-id'),operation=takeOption(args,'--operation');
  assertNoUnknownOptions(args);if(args.length)throw new Error(`Unexpected argument: ${args[0]}`);
  if(tool==='Bash'&&!command)throw new Error('PERMISSION_DRY_RUN_COMMAND_REQUIRED');
  if(['Read','Write','Edit'].includes(tool)&&!resource)throw new Error('PERMISSION_DRY_RUN_RESOURCE_REQUIRED');
  if(tool==='Mcp'&&!serverId)throw new Error('PERMISSION_DRY_RUN_SERVER_REQUIRED');
  if(tool!=='Bash'&&!resource&&!serverId&&!operation)throw new Error('PERMISSION_DRY_RUN_TARGET_REQUIRED');
  return{tool,...(command?{command}:{}),...(resource?{resource}:{}),...(serverId?{serverId}:{}),...(operation?{operation}:{})};
}
export async function runConfigCommand(ctx:CommandContext,args0:string[]){
  const args=[...args0];const op=args.shift()??'list';
  if(op==='permissions'){
    const sub=args.shift();if(sub!=='dry-run')throw new Error('CONFIG_PERMISSIONS_OPERATION_INVALID');
    const action=permissionDryRunAction(args);const effective=await loadEffectiveConfig({paths:ctx.paths,projectRoot:ctx.projectRoot});
    const rules=(effective.value.permissions??{allow:[],ask:[],deny:[]}) as RuleSetInput;
    const result=simulatePermission({rules,action,projectRoot:ctx.projectRoot});
    writeValue(ctx,result,formatPermissionSimulation(result));return 0;
  }
  if(op==='list'){const e=await loadEffectiveConfig({paths:ctx.paths,projectRoot:ctx.projectRoot});writeValue(ctx,e.value);return 0;}
  if(op==='origins'){const e=await loadEffectiveConfig({paths:ctx.paths,projectRoot:ctx.projectRoot});writeValue(ctx,configOrigins(e));return 0;}
  if(op==='get'){const path=args.shift();if(!path)throw new Error('CONFIG_PATH_REQUIRED');assertNoUnknownOptions(args);const e=await loadEffectiveConfig({paths:ctx.paths,projectRoot:ctx.projectRoot});writeValue(ctx,configGet(e.value,path));return 0;}
  if(op==='set'){const path=args.shift(),raw=args.shift();if(!path||raw===undefined)throw new Error('CONFIG_SET_REQUIRES_PATH_VALUE');const sc=scope(args);assertNoUnknownOptions(args);const value=parseJsonValue(raw);if(sc==='project'&&valueContainsKeymap(path,value))throw new Error('CONFIG_KEYMAP_SCOPE_INVALID');await configSet({paths:ctx.paths,projectRoot:ctx.projectRoot,scope:sc,path,value});writeValue(ctx,{ok:true,scope:sc,path},`Set ${path} (${sc})\n`);return 0;}
  if(op==='unset'){const path=args.shift();if(!path)throw new Error('CONFIG_PATH_REQUIRED');const sc=scope(args);assertNoUnknownOptions(args);if(sc==='project'&&keymapPath(path))throw new Error('CONFIG_KEYMAP_SCOPE_INVALID');await configUnset({paths:ctx.paths,projectRoot:ctx.projectRoot,scope:sc,path});writeValue(ctx,{ok:true,scope:sc,path},`Unset ${path} (${sc})\n`);return 0;}
  if(op==='show'){const user=await readConfigScope({paths:ctx.paths,projectRoot:ctx.projectRoot,scope:'user'});writeValue(ctx,user);return 0;}
  if(op==='migrate'){const sc=scope(args);assertNoUnknownOptions(args);const result=await migrateConfigScope({paths:ctx.paths,projectRoot:ctx.projectRoot,scope:sc});writeValue(ctx,result,`Migrated config ${sc}: ${result.fromVersion} -> ${result.toVersion}${result.changed?'':' (already current)'}\n`);return 0;}
  if(op==='rollback'){const sc=scope(args);assertNoUnknownOptions(args);const result=await rollbackConfigMigration({paths:ctx.paths,projectRoot:ctx.projectRoot,scope:sc});writeValue(ctx,result,`Rolled back config ${sc}\n`);return 0;}
  throw new Error(`Unsupported config operation: ${op}`);
}
