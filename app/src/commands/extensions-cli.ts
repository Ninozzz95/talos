import {rm} from 'node:fs/promises';import {join} from 'node:path';import type {CommandContext} from './context.ts';import {assertNoUnknownOptions,writeValue} from './context.ts';import {installExtension,removeInstalledExtension} from '../extensions/installer.ts';import {createTrustAuthority,type TrustExecutableScope} from '../security/trust-authority.ts';import {createMcpFacade} from '../services/mcp-facade.ts';
import {createHookFacade} from '../services/hook-facade.ts';
import {createPluginFacade} from '../services/plugin-facade.ts';
import {createWorkflowCatalog} from '../services/workflow-catalog.ts';
import {createWorkflowCenterModel,renderWorkflowCenterLines} from '../tui/overlays/workflow-center.ts';

function id(v:string|undefined){if(!v||! /^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/u.test(v)||v.includes('..'))throw new Error('EXTENSION_ID_INVALID');return v;}
function authority(ctx:CommandContext){return createTrustAuthority({projectRoot:ctx.projectRoot,trustRoot:ctx.paths.trust.projects});}
async function removeMirror(root:string,value:string){const clean=id(value);await rm(join(root,`${clean}.json`),{force:true});}
async function mirrorRoot(ctx:CommandContext,kind:TrustExecutableScope['kind']){const roots=await authority(ctx).compatibilityRoots();return kind==='hook'?roots.hooks:kind==='mcp'?roots.mcp:roots.plugins;}

export async function runMcpCommand(ctx:CommandContext,args0:string[],facade:ReturnType<typeof createMcpFacade>=createMcpFacade({projectRoot:ctx.projectRoot,repoRoot:ctx.repoRoot,paths:ctx.paths})){
  const a=[...args0],op=a.shift()??'list';
  if(op==='list'){
    assertNoUnknownOptions(a);writeValue(ctx,await facade.list());return 0;
  }
  const sid=id(a.shift());assertNoUnknownOptions(a);
  if(op==='trust'){
    const result=await facade.trust(sid);
    writeValue(ctx,{ok:true,id:sid,changed:result.changed},result.changed?'Trusted MCP '+sid+'\n':'MCP '+sid+' already trusted by the project authority\n');
    return 0;
  }
  if(op==='untrust'){
    const result=await facade.untrust(sid);
    writeValue(ctx,{ok:true,id:sid,changed:result.changed},'Untrusted MCP '+sid+'\n');
    return 0;
  }
  if(op==='test'){
    const result=await facade.probe(sid);
    const ok=result.health.state==='healthy'||result.health.state==='degraded';
    const output={
      ok,id:sid,health:result.health,server:result.server,protocol:result.protocol,capabilities:result.capabilities,
      tools:result.permission.effectiveTools,missingAllowlistedTools:result.permission.missingAllowlistedTools,
      trust:result.trust,permission:result.permission,logs:result.logs,error:ok?null:result.health.message
    };
    writeValue(ctx,output);
    return ok?0:15;
  }
  throw new Error('Unsupported mcp operation: '+op);
}

export async function runHookCommand(ctx:CommandContext,args0:string[],facade:ReturnType<typeof createHookFacade>=createHookFacade({projectRoot:ctx.projectRoot,repoRoot:ctx.repoRoot,paths:ctx.paths})){
  const a=[...args0],op=a.shift()??'list';
  if(op==='list'){
    assertNoUnknownOptions(a);if(a.length)throw new Error('HOOK_LIST_TAKES_NO_ARGUMENTS');
    writeValue(ctx,await facade.list());return 0;
  }
  const hid=id(a.shift());
  if(op==='trust'){
    assertNoUnknownOptions(a);if(a.length)throw new Error('HOOK_TRUST_TAKES_ONE_ID');
    const result=await facade.trust(hid);
    writeValue(ctx,{ok:true,id:hid,changed:result.changed},result.changed?'Trusted hook '+hid+'\n':'Hook '+hid+' already trusted by the project authority\n');
    return 0;
  }
  if(op==='untrust'){
    assertNoUnknownOptions(a);if(a.length)throw new Error('HOOK_UNTRUST_TAKES_ONE_ID');
    const result=await facade.untrust(hid);
    writeValue(ctx,{ok:true,id:hid,changed:result.changed},'Untrusted hook '+hid+'\n');
    return 0;
  }
  if(op==='dry-run'){
    const eventType=a.shift();if(!eventType)throw new Error('HOOK_EVENT_REQUIRED');
    const action=a.length?a.join(' '):null;
    const result=await facade.dryRun(hid,{eventType,action});
    writeValue(ctx,{ok:true,id:hid,...result},'Executed hook '+hid+' with a synthetic '+eventType+' event through the real hook process path.\n');
    return 0;
  }
  if(op==='history'){
    const rawLimit=a.shift();assertNoUnknownOptions(a);if(a.length)throw new Error('HOOK_HISTORY_ARGUMENTS_INVALID');
    let limit:number|undefined;
    if(rawLimit!==undefined){
      limit=Number(rawLimit);if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw new Error('HOOK_HISTORY_LIMIT_INVALID');
    }
    const rows=await facade.history(hid,limit===undefined?{}:{limit});
    writeValue(ctx,rows);return 0;
  }
  if(op==='quarantine'){
    const reason=a.length?a.join(' '):null;
    const result=await facade.quarantine(hid,reason);
    writeValue(ctx,{ok:true,id:hid,changed:result.changed,quarantine:result.record},'Quarantined hook '+hid+'. It remains denied until quarantine is explicitly released, and release does not restore trust.\n');
    return 0;
  }
  if(op==='release'||op==='release-quarantine'){
    assertNoUnknownOptions(a);if(a.length)throw new Error('HOOK_RELEASE_TAKES_ONE_ID');
    const result=await facade.releaseQuarantine(hid);
    writeValue(ctx,{ok:true,id:hid,changed:result.changed},'Released hook quarantine for '+hid+'. The hook remains untrusted until explicitly trusted again.\n');
    return 0;
  }
  throw new Error('Unsupported hook operation: '+op);
}

export async function runPluginCommand(ctx:CommandContext,args0:string[],facade:ReturnType<typeof createPluginFacade>=createPluginFacade({projectRoot:ctx.projectRoot,repoRoot:ctx.repoRoot,paths:ctx.paths})){
  const a=[...args0],op=a.shift()??'list';
  if(op==='install'){
    const source=a.shift();if(!source)throw new Error('PLUGIN_SOURCE_REQUIRED');assertNoUnknownOptions(a);
    const result=await installExtension({source,projectRoot:ctx.projectRoot});
    writeValue(ctx,result,'Installed '+result.id+' '+result.version+'; project trust must cover the new package before it can run\n');
    return 0;
  }
  if(op==='remove'){
    const pid=id(a.shift());assertNoUnknownOptions(a);
    const result=await removeInstalledExtension({projectRoot:ctx.projectRoot,id:pid});
    const trust=authority(ctx);await trust.untrustScope({kind:'plugin',id:pid});await removeMirror(await mirrorRoot(ctx,'plugin'),pid);
    writeValue(ctx,result,'Removed '+pid+'\n');return 0;
  }
  if(op==='list'){
    assertNoUnknownOptions(a);if(a.length)throw new Error('PLUGIN_LIST_TAKES_NO_ARGUMENTS');
    writeValue(ctx,await facade.list());return 0;
  }
  const pid=id(a.shift());
  if(op==='trust'){
    assertNoUnknownOptions(a);if(a.length)throw new Error('PLUGIN_TRUST_TAKES_ONE_ID');
    const result=await facade.trust(pid);
    writeValue(ctx,{ok:true,id:pid,guard:result.guard,changed:result.changed},result.changed?'Trusted plugin '+pid+'\n':'Plugin '+pid+' already trusted by the project authority\n');
    return 0;
  }
  if(op==='untrust'){
    assertNoUnknownOptions(a);if(a.length)throw new Error('PLUGIN_UNTRUST_TAKES_ONE_ID');
    const result=await facade.untrust(pid);
    writeValue(ctx,{ok:true,id:pid,changed:result.changed},'Untrusted plugin '+pid+'\n');return 0;
  }
  if(op==='quarantine'){
    const reason=a.length?a.join(' '):null;
    const result=await facade.quarantine(pid,reason);
    writeValue(ctx,{ok:true,id:pid,changed:result.changed,quarantine:result.record},'Quarantined plugin '+pid+'. It cannot regain trust until quarantine is explicitly released.\n');
    return 0;
  }
  if(op==='release'||op==='release-quarantine'){
    assertNoUnknownOptions(a);if(a.length)throw new Error('PLUGIN_RELEASE_TAKES_ONE_ID');
    const result=await facade.releaseQuarantine(pid);
    writeValue(ctx,{ok:true,id:pid,changed:result.changed},'Released plugin quarantine for '+pid+'. The plugin remains untrusted until explicitly trusted again.\n');
    return 0;
  }
  throw new Error('Unsupported plugin operation: '+op);
}

export async function runCustomCommand(ctx:CommandContext,args0:string[],catalog:ReturnType<typeof createWorkflowCatalog>=createWorkflowCatalog({projectRoot:ctx.projectRoot,repoRoot:ctx.repoRoot,paths:ctx.paths})){
  const a=[...args0],op=a.shift()??'list';
  if(op==='list'){
    assertNoUnknownOptions(a);if(a.length)throw new Error('COMMAND_LIST_TAKES_NO_ARGUMENTS');
    const rows=await catalog.list();
    const human=renderWorkflowCenterLines(createWorkflowCenterModel(rows,0)).join('\n')+'\n';
    writeValue(ctx,rows,human);return 0;
  }
  if(op==='show'){
    const selector=a.shift();if(!selector)throw new Error('COMMAND_NAME_REQUIRED');assertNoUnknownOptions(a);if(a.length)throw new Error('COMMAND_SHOW_TAKES_ONE_NAME');
    const row=await catalog.show(selector);
    const human=renderWorkflowCenterLines(createWorkflowCenterModel([row],0)).join('\n')+'\n';
    writeValue(ctx,row,human);return 0;
  }
  if(op==='run'){
    const selector=a.shift();if(!selector)throw new Error('COMMAND_NAME_REQUIRED');
    const result=await catalog.run(selector,a);
    writeValue(ctx,result,result.prompt.endsWith('\n')?result.prompt:result.prompt+'\n');return 0;
  }
  throw new Error('Unsupported command operation: '+op);
}
