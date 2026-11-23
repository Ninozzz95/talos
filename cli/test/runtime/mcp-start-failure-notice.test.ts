/*
 * 0.6.9 (stress test of 0.6.8; owner 17/10/2026 «un avviso chiaro»): a trusted MCP server that did not start was silent on the
 * screen and in `-p`; the model only met «unknown tool». The kernel's preparation names the failed servers (`falliti`) and drops
 * them; the CLI keeps them from its own wrapper and says them on the run that follows, in that session's events. A start with no
 * failure says nothing, and a failure is said once.
 */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createTrustAuthority} from '../../src/security/trust-authority.ts';
import {composeTalosRuntime} from '../../src/runtime/talos-composition.ts';

async function fixture(){
  const parent=await mkdtemp(join(tmpdir(),'talos-mcp-start-'));
  const projectRoot=join(parent,'project');const trustRoot=join(parent,'trust');
  await mkdir(join(projectRoot,'.git'),{recursive:true});
  await writeFile(join(projectRoot,'.harness-ui-mcp.json'),JSON.stringify({server:[{id:'docs',comando:'node',argomenti:['server.js'],allowlist:['read']}]})+'\n');
  return{parent,projectRoot,trustRoot};
}
function paths(f:{parent:string;trustRoot:string}){
  return{configRoot:join(f.parent,'config'),dataRoot:join(f.parent,'data'),cacheRoot:join(f.parent,'cache'),sessionsRoot:join(f.parent,'sessions'),logsRoot:join(f.parent,'logs'),projectOverridesRoot:join(f.parent,'project-overrides'),trust:{hooks:join(f.parent,'legacy-hooks'),mcp:join(f.parent,'legacy-mcp'),plugins:join(f.parent,'legacy-plugins'),projects:f.trustRoot}} as any;
}
async function runOnce(failures:Array<{serverId:string;errore:unknown}>){
  const f=await fixture();const trust=createTrustAuthority({projectRoot:f.projectRoot,trustRoot:f.trustRoot});await trust.trustProject({expected:await trust.inspect()});
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>null,getRuntime:()=>({}),listPublic:()=>[]}),
    createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
    creaFetchMultiProvider:()=>Object.assign(async()=>{throw new Error('unused');},{eseguiConFallback:async()=>{throw new Error('unused');}}),
    STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),
    createSessionRegistry:(options:any)=>({ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true}),_options:options}),
    caricaServerMcp:async()=>({server:[{id:'docs',hash:'mcp-hash',comando:'node',argomenti:['server.js'],allowlist:['read']}]}),
    fidaServerMcp:async({cartellaTrust,serverId,hash}:any)=>{await mkdir(cartellaTrust,{recursive:true});await writeFile(join(cartellaTrust,`${serverId}.json`),JSON.stringify({hash})+'\n');return{fidato:true};},
    preparaToolMcpPerSessione:async()=>({toolMcp:[],chiamaToolMcpFn:null,falliti:failures,chiudiTutti:async()=>{}}),
    avviaSessione:async(input:any)=>{
      await input.preparaToolMcpPerSessioneFn({cartella:f.projectRoot,cartellaTrust:input.cartellaTrustMcp});
      await input.talosLavoraFn({cartella:f.projectRoot,checkpointSessionId:'s-1'});
      await input.talosLavoraFn({cartella:f.projectRoot,checkpointSessionId:'s-1'});
      return{};
    }
  };
  const composed=await composeTalosRuntime({repoRoot:f.parent,projectRoot:f.projectRoot,paths:paths(f),model:'openai:test',env:{},modules,keyring:null});
  const seen:any[]=[];
  const off=(composed.registry as any).iscriviti('s-1',(event:any)=>seen.push(event));
  await (composed.registry as any)._options.avviaSessioneFn({});
  if(typeof off==='function')off();
  return seen.filter(event=>event?.type==='CUSTOM'&&event?.name==='talos.cli.notice').map(event=>String(event.value?.message));
}

test('a trusted MCP server that did not start is said once, with its reason and how to check it',async()=>{
  const notices=await runOnce([{serverId:'docs',errore:new Error('spawn node-missing ENOENT')}]);
  assert.deepEqual(notices,['MCP server "docs" did not start: spawn node-missing ENOENT. Its tools are not available in this turn. Check it with: talos mcp test docs']);
});

/* the bugfixer's review of 0.6.9 (N1): a reason that ends with its own full stop made «…mean.. Its tools» */
test('a reason that ends with its own full stop is said with one',async()=>{
  const notices=await runOnce([{serverId:'docs',errore:'"node-missing" was not found on PATH. Write its path if that is the one you mean.'}]);
  assert.deepEqual(notices,['MCP server "docs" did not start: "node-missing" was not found on PATH. Write its path if that is the one you mean. Its tools are not available in this turn. Check it with: talos mcp test docs']);
});

test('a start where every server came up says nothing',async()=>{
  assert.deepEqual(await runOnce([]),[]);
});

/* the desktop's review of 0.6.9: delegations run in their parent's folder, up to ten at once; a child's preparation between the
   parent's preparation and the parent's run must neither take nor erase the parent's failures, nor move them to the child */
test('two starts in the same folder at once each say only their own failures',async()=>{
  const f=await fixture();const trust=createTrustAuthority({projectRoot:f.projectRoot,trustRoot:f.trustRoot});await trust.trustProject({expected:await trust.inspect()});
  let preparations=0;
  let parentPrepared!:()=>void;const parentPreparedP=new Promise<void>(resolve=>{parentPrepared=resolve;});
  let childDone!:()=>void;const childDoneP=new Promise<void>(resolve=>{childDone=resolve;});
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>null,getRuntime:()=>({}),listPublic:()=>[]}),
    createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
    creaFetchMultiProvider:()=>Object.assign(async()=>{throw new Error('unused');},{eseguiConFallback:async()=>{throw new Error('unused');}}),
    STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),
    createSessionRegistry:(options:any)=>({ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true}),_options:options}),
    caricaServerMcp:async()=>({server:[{id:'docs',hash:'mcp-hash',comando:'node',argomenti:['server.js'],allowlist:['read']}]}),
    fidaServerMcp:async({cartellaTrust,serverId,hash}:any)=>{await mkdir(cartellaTrust,{recursive:true});await writeFile(join(cartellaTrust,`${serverId}.json`),JSON.stringify({hash})+'\n');return{fidato:true};},
    preparaToolMcpPerSessione:async()=>{preparations++;return{toolMcp:[],chiamaToolMcpFn:null,falliti:preparations===1?[{serverId:'docs',errore:'spawn node-missing ENOENT'}]:[],chiudiTutti:async()=>{}};},
    avviaSessione:async(input:any)=>{
      await input.preparaToolMcpPerSessioneFn({cartella:f.projectRoot,cartellaTrust:input.cartellaTrustMcp});
      if(input.tag==='parent'){parentPrepared();await childDoneP;}
      await input.talosLavoraFn({cartella:f.projectRoot,checkpointSessionId:input.tag==='parent'?'s-parent':'s-child'});
      if(input.tag==='child')childDone();
      return{};
    }
  };
  const composed=await composeTalosRuntime({repoRoot:f.parent,projectRoot:f.projectRoot,paths:paths(f),model:'openai:test',env:{},modules,keyring:null});
  const said:Record<string,string[]>={'s-parent':[],'s-child':[]};
  const offs=Object.keys(said).map(id=>(composed.registry as any).iscriviti(id,(event:any)=>{if(event?.type==='CUSTOM'&&event?.name==='talos.cli.notice')said[id]!.push(String(event.value?.message));}));
  const launch=(composed.registry as any)._options.avviaSessioneFn;
  const parent=launch({tag:'parent'});
  await parentPreparedP;
  await launch({tag:'child'});
  await parent;
  for(const off of offs)if(typeof off==='function')off();
  assert.equal(said['s-parent']!.length,1,'the parent says its own failure, once');
  assert.match(said['s-parent']![0]!,/^MCP server "docs" did not start: spawn node-missing ENOENT\./u);
  assert.deepEqual(said['s-child'],[],'the child, whose servers came up, says nothing');
});
