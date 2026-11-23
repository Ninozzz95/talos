import assert from 'node:assert/strict';import test from 'node:test';import {runMcpCommand,runHookCommand,runPluginCommand,runCustomCommand} from '../../src/commands/extensions-cli.ts';
test('extension command families expose callable routers',()=>{for(const fn of [runMcpCommand,runHookCommand,runPluginCommand,runCustomCommand])assert.equal(typeof fn,'function');});


test('mcp test reports typed probe failure without throwing',async()=>{
  const out:string[]=[];const ctx={invocation:{outputFormat:'json'},io:{writeOut:(s:string)=>out.push(s)}} as any;
  const facade:any={
    list:async()=>[],trust:async()=>({changed:false}),untrust:async()=>({changed:false}),
    probe:async()=>({
      id:'broken',health:{state:'failed',checkedAt:'2026-09-21T10:00:00.000Z',latencyMs:null,phase:'connect',message:'connect failed'},
      server:null,protocol:null,capabilities:null,logs:[],trust:{projectTrusted:true,state:'trusted',trusted:true,currentFingerprint:'f',trustedFingerprint:'f',changed:false},
      permission:{configuredAllowlist:['ping'],effectiveTools:[],missingAllowlistedTools:[],perCallApproval:'not-applied'}
    })
  };
  const code=await runMcpCommand(ctx,['test','broken'],facade);
  assert.equal(code,15);const result=JSON.parse(out.at(-1)!);assert.equal(result.ok,false);assert.match(result.error,/connect failed/u);
});

test('mcp test propagates trust refusal before any probe result is emitted',async()=>{
  const out:string[]=[];const ctx={invocation:{outputFormat:'json'},io:{writeOut:(s:string)=>out.push(s)}} as any;
  const facade:any={list:async()=>[],trust:async()=>({changed:false}),untrust:async()=>({changed:false}),probe:async()=>{throw Object.assign(new Error('PROJECT_TRUST_REQUIRED'),{code:'PROJECT_TRUST_REQUIRED'});}};
  await assert.rejects(()=>runMcpCommand(ctx,['test','broken'],facade),(error:any)=>error?.code==='PROJECT_TRUST_REQUIRED');
  assert.deepEqual(out,[]);
});

test('M8-A RED — MCP CLI command family delegates to the typed facade instead of session-wide MCP orchestration',async()=>{
  const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../../src/commands/extensions-cli.ts',import.meta.url),'utf8'));
  assert.match(source,/createMcpFacade/u);
  assert.match(source,/facade\.(list|inspect)\(/u);
  assert.match(source,/facade\.probe\(/u);
  assert.match(source,/facade\.trust\(/u);
  assert.match(source,/facade\.untrust\(/u);
  assert.doesNotMatch(source,/mcp-session\.mjs|preparaToolMcpPerSessione/u);
});

test('M8-B RED — hook CLI delegates to one typed facade instead of direct hook-registry orchestration',async()=>{
  const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../../src/commands/extensions-cli.ts',import.meta.url),'utf8'));
  assert.match(source,/createHookFacade/u);
  assert.match(source,/facade\.list\(/u);
  assert.match(source,/facade\.dryRun\(/u);
  assert.match(source,/facade\.history\(/u);
  assert.match(source,/facade\.trust\(/u);
  assert.match(source,/facade\.untrust\(/u);
  assert.match(source,/facade\.quarantine\(/u);
  assert.match(source,/facade\.releaseQuarantine\(/u);
  const hookStart=source.indexOf('export async function runHookCommand');
  const pluginStart=source.indexOf('export async function runPluginCommand',hookStart);
  const hookSource=source.slice(hookStart,pluginStart);
  assert.doesNotMatch(hookSource,/importTalosModule|caricaHooks|fidaHook/u);
});

test('M8-C RED — plugin owner actions delegate to one typed facade while install/remove remain installer operations',async()=>{
  const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../../src/commands/extensions-cli.ts',import.meta.url),'utf8'));
  assert.match(source,/createPluginFacade/u);
  assert.match(source,/facade\.list\(/u);
  assert.match(source,/facade\.trust\(/u);
  assert.match(source,/facade\.untrust\(/u);
  assert.match(source,/facade\.quarantine\(/u);
  assert.match(source,/facade\.releaseQuarantine\(/u);
  const pluginStart=source.indexOf('export async function runPluginCommand');
  const pluginEnd=source.indexOf('async function walkCommands',pluginStart);
  const block=source.slice(pluginStart,pluginEnd);
  assert.doesNotMatch(block,/scanPluginPackage\(/u,'plugin command router must not duplicate Plugin Guard orchestration');
  assert.match(block,/installExtension\(/u);
  assert.match(block,/removeInstalledExtension\(/u);
});

test('M8-D RED — custom command CLI consumes one workflow catalog instead of independently walking command roots',async()=>{
  const source=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../../src/commands/extensions-cli.ts',import.meta.url),'utf8'));
  assert.match(source,/createWorkflowCatalog/u);
  const start=source.indexOf('export async function runCustomCommand');
  assert.ok(start>=0);
  const block=source.slice(start);
  assert.match(block,/catalog\.list\(/u);
  assert.match(block,/catalog\.show\(/u);
  assert.match(block,/catalog\.run\(/u);
  assert.doesNotMatch(block,/walkCommands|loadCommandFile|renderProjectCommand/u);
});
