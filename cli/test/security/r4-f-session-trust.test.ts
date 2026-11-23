/*
 * R4 lane F — the home folder and a drive root are trusted for THIS SESSION ONLY (owner decision Q-R4-17, 2026-09-24).
 * "Trust this folder for this session" leaves nothing on disk: no folder decision and no per-file fingerprint. The grant lives
 * in memory for this TALOS process; every authority the process creates (the runtime composition makes its own) honours it,
 * so the project's hooks, MCP servers and plugins work for the session. The snapshot rule still applies to it (a file changed
 * during the session is not trusted), changes made during the session stay in memory, and revoking forgets it. A new process
 * has no grant: it asks again, and `-p` refuses (test/main/r4-f-main-session.test.ts).
 */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {assessProjectTrust,trustProjectAssessment} from '../../src/security/project-trust-gate.ts';
import {createTrustAuthority} from '../../src/security/trust-authority.ts';

const roots:string[]=[];after(async()=>{for(const root of roots)await rm(root,{recursive:true,force:true});});
/* A home folder holding project files of every kind: instructions, a hook, an MCP server and a plugin. */
async function homeWithFiles(){
  const parent=await mkdtemp(join(tmpdir(),'r4-f-session-'));roots.push(parent);
  const home=join(parent,'home');const trustRoot=join(parent,'trust');
  await mkdir(join(home,'.harness-ui-plugins','demo'),{recursive:true});
  await writeFile(join(home,'AGENTS.md'),'rules\n');
  await writeFile(join(home,'.harness-ui-hooks.json'),JSON.stringify({hooks:[{id:'lint',eventi:['pre_tool_call'],comando:'npm test'}]})+'\n');
  await writeFile(join(home,'.harness-ui-mcp.json'),JSON.stringify({server:[{id:'docs',comando:'node',argomenti:['server.js'],allowlist:['read']}]})+'\n');
  await writeFile(join(home,'.harness-ui-plugins','demo','plugin.json'),JSON.stringify({id:'demo',tools:[],hooks:[]})+'\n');
  return{home,trustRoot};
}
/* Every file under the trust root, relative; [] when the root was never created. */
async function stored(root:string):Promise<string[]>{
  try{await stat(root);}catch{return[];}
  const out:string[]=[];
  for(const entry of await readdir(root,{withFileTypes:true,recursive:true}))if(entry.isFile())out.push(join(entry.parentPath,entry.name).slice(root.length+1));
  return out.sort();
}
async function grantForSession(f:{home:string;trustRoot:string}){
  const before=await assessProjectTrust({projectRoot:f.home,trustRoot:f.trustRoot,homeDir:f.home});
  assert.equal(before.trusted,false);assert.equal(before.folder?.sessionOnly,true);
  return trustProjectAssessment({assessment:before,trustRoot:f.trustRoot,nestedRepositories:[],homeDir:f.home,sessionOnly:true});
}

test('Q-R4-17: a session grant in the home folder writes nothing, and this process honours hooks, MCP and plugins',async()=>{
  const f=await homeWithFiles();
  const granted=await grantForSession(f);
  assert.equal(granted.trusted,true);
  assert.deepEqual(await stored(f.trustRoot),[],'no fingerprint and no folder decision on disk');
  /* The composition builds its own authority, with the default home: it sees the same grant. */
  const composition=createTrustAuthority({projectRoot:f.home,trustRoot:f.trustRoot});
  for(const scope of [{kind:'hook',id:'lint'},{kind:'mcp',id:'docs'},{kind:'plugin',id:'demo'}] as const)assert.equal(await composition.verifyScope(scope),true,`${scope.kind} ${scope.id} is honoured in this session`);
  const again=await assessProjectTrust({projectRoot:f.home,trustRoot:f.trustRoot,homeDir:f.home});
  assert.equal(again.trusted,true);assert.equal(again.folder?.decided,false,'the folder itself is still undecided: the next start asks');
  assert.deepEqual(await stored(f.trustRoot),[]);
});

test('Q-R4-17: the session grant keeps the snapshot rule — a file changed during the session is not trusted',async()=>{
  const f=await homeWithFiles();await grantForSession(f);
  await writeFile(join(f.home,'.harness-ui-hooks.json'),JSON.stringify({hooks:[{id:'lint',eventi:['pre_tool_call'],comando:'rm -rf .'}]})+'\n');
  const authority=createTrustAuthority({projectRoot:f.home,trustRoot:f.trustRoot});
  assert.equal(await authority.verifyScope({kind:'hook',id:'lint'}),false);
  const changed=await assessProjectTrust({projectRoot:f.home,trustRoot:f.trustRoot,homeDir:f.home});
  assert.equal(changed.trusted,false);assert.equal(changed.reason,'RESOURCE_FINGERPRINT_CHANGED');
});

test('Q-R4-17: trusting or untrusting one resource during the session stays in memory',async()=>{
  const f=await homeWithFiles();await grantForSession(f);
  const authority=createTrustAuthority({projectRoot:f.home,trustRoot:f.trustRoot});
  assert.equal((await authority.untrustScope({kind:'mcp',id:'docs'})).changed,true);
  assert.equal(await authority.verifyScope({kind:'mcp',id:'docs'}),false);
  assert.equal((await authority.trustScope({kind:'mcp',id:'docs'})).changed,true);
  assert.equal(await authority.verifyScope({kind:'mcp',id:'docs'}),true);
  assert.deepEqual(await stored(f.trustRoot),[],'still nothing on disk');
});

test('Q-R4-17: revoking forgets the session grant; any trust asked of the home folder is a session grant',async()=>{
  const f=await homeWithFiles();await grantForSession(f);
  const authority=createTrustAuthority({projectRoot:f.home,trustRoot:f.trustRoot,homeDir:f.home});
  await authority.revokeProject();
  assert.equal((await assessProjectTrust({projectRoot:f.home,trustRoot:f.trustRoot,homeDir:f.home})).trusted,false);
  /* Without the explicit flag, the home folder still never gets fingerprints on disk. */
  await authority.trustProject({expected:await authority.inspect()});
  assert.equal((await authority.inspect()).trusted,true);
  assert.deepEqual(await stored(f.trustRoot),[]);
});

test('Q-R4-17: `talos project trust` in the home folder saves nothing, files or not, and says why',async()=>{
  const f=await homeWithFiles();const out:string[]=[];
  const {runProjectCommand}=await import('../../src/commands/project-cli.ts');
  const ctx:any={invocation:{outputFormat:'text'},io:{writeOut:(s:string)=>out.push(s),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:f.home,repoRoot:f.home,paths:{trust:{projects:f.trustRoot}},createRuntimeContext:async()=>{throw new Error('runtime must not start');}};
  assert.equal(await runProjectCommand(ctx,['trust'],{homeDir:f.home}),0);
  assert.match(out.join(''),/every start/u);assert.doesNotMatch(out.join(''),/Trusted project/u);
  assert.deepEqual(await stored(f.trustRoot),[]);
  assert.equal((await assessProjectTrust({projectRoot:f.home,trustRoot:f.trustRoot,homeDir:f.home})).trusted,false,'nothing was trusted');
});

/* Every entry (file or folder) under the trust root, relative. */
async function entries(root:string):Promise<string[]>{
  try{await stat(root);}catch{return[];}
  return (await readdir(root,{withFileTypes:true,recursive:true})).map(entry=>join(entry.parentPath,entry.name).slice(root.length+1)).sort();
}
test('Q-R4-17: the runtime composition honours the session grant and leaves the trust store empty, also after trusting an MCP server during the session',async()=>{
  const f=await homeWithFiles();await grantForSession(f);
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  const parent=join(f.home,'..');
  const paths:any={configRoot:join(parent,'config'),dataRoot:join(parent,'data'),cacheRoot:join(parent,'cache'),sessionsRoot:join(parent,'sessions'),logsRoot:join(parent,'logs'),projectOverridesRoot:join(parent,'project-overrides'),trust:{hooks:join(parent,'legacy-hooks'),mcp:join(parent,'legacy-mcp'),plugins:join(parent,'legacy-plugins'),projects:f.trustRoot}};
  let registryOpts:any=null;let launched:any=null;
  /* The kernel's mirrors are written as the kernel writes them: a file per trusted server or plugin in the folder it is given. */
  const mirror=async({cartellaTrust,serverId,pluginId,hash}:any)=>{await mkdir(cartellaTrust,{recursive:true});await writeFile(join(cartellaTrust,`${serverId??pluginId}.json`),JSON.stringify({hash})+'\n');return{fidato:true};};
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>null,getRuntime:()=>({}),listPublic:()=>[]}),
    createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
    creaFetchMultiProvider:()=>Object.assign(async()=>{throw new Error('unused');},{eseguiConFallback:async()=>{throw new Error('unused');}}),
    avviaSessione:async(input:any)=>{launched={mcp:await entries(input.cartellaTrustMcp),plugins:await entries(input.cartellaTrustPlugin)};return{};},
    /* stage 3: the kernel's own tool list, as session-registry.mjs exports it */STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),createSessionRegistry:(options:any)=>{registryOpts=options;return{ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true})};},
    caricaServerMcp:async()=>({server:[{id:'docs',hash:'mcp-hash'}]}),fidaServerMcp:mirror,
    preparaToolMcpPerSessione:async()=>({toolMcp:[],chiudiTutti:async()=>{}}),
    caricaPlugin:async()=>({plugin:[{id:'demo',hash:'plugin-hash',tools:[],hooks:[]}]}),fidaPlugin:mirror,
    preparaToolPluginPerSessione:async()=>({toolPlugin:[],hookPlugin:[]}),
  };
  await composeTalosRuntime({repoRoot:parent,projectRoot:f.home,paths,model:'openai:test',env:{},modules,keyring:null});
  assert.equal(await registryOpts.verificaTrustFn({hookId:'lint'}),true,'the hook runs in this session');
  assert.equal(await registryOpts.verificaTrustMcpFn({serverId:'docs'}),true,'the MCP server runs in this session');
  assert.equal(await registryOpts.verificaTrustPluginFn({pluginId:'demo',hash:'ignored',cartellaTrust:paths.trust.plugins}),true,'the plugin runs in this session');
  await registryOpts.avviaSessioneFn({});
  assert.deepEqual(launched,{mcp:['docs.json'],plugins:['demo.json']},'the session was given its mirrors');
  assert.deepEqual(await entries(f.trustRoot),[],'after the session start nothing is left in the trust store');
  await registryOpts.fidaServerMcpFn({serverId:'docs',hash:'mcp-hash'});
  assert.deepEqual(await entries(f.trustRoot),[],'trusting a server during the session writes nothing either');
});

test('Q-R4-17: a folder that is not session-only is saved as before (control)',async()=>{
  const f=await homeWithFiles();
  const before=await assessProjectTrust({projectRoot:f.home,trustRoot:f.trustRoot,homeDir:join(f.home,'..','elsewhere')});
  await trustProjectAssessment({assessment:before,trustRoot:f.trustRoot,nestedRepositories:[],homeDir:join(f.home,'..','elsewhere')});
  const files=await stored(f.trustRoot);
  assert.ok(files.some(file=>file===`${before.workspace.identityHash}.json`),`fingerprints saved: ${files.join(', ')}`);
  assert.ok(files.some(file=>file.startsWith('folders')),'and the folder decision');
});
