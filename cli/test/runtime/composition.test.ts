import assert from 'node:assert/strict';import test from 'node:test';import {join} from 'node:path';
import {composeTalosRuntime} from '../../src/runtime/talos-composition.ts';import {fileURLToPath} from 'node:url';
/* ⛔ La radice VERA del repo: il caricatore pigro del kernel dentro la composizione importa
   `harness-ui/src/kernel/talosHarness.mjs` davvero, quindi una radice finta proverebbe solo che
   il percorso non esiste. Si legge, non si scrive. */
const REPO_ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const paths={configRoot:'/cli/config',dataRoot:'/cli/data',cacheRoot:'/cli/cache',sessionsRoot:'/cli/data/sessions',logsRoot:'/cli/data/logs',projectOverridesRoot:'/cli/config/projects',trust:{hooks:'/cli/data/trust/hooks',mcp:'/cli/data/trust/mcp',plugins:'/cli/data/trust/plugins',projects:'/cli/data/trust/projects'}};
test('composition uses CLI roots and owner runtime adapter',async()=>{let registryOpts:any,ownerOpts:any,launchInput:any;const providerStore={loadFromKeyring(){},getKey:(p:string)=>p==='openrouter'?'or-key':'direct-key',getRuntime:()=>({endpoint:'https://provider.invalid',timeoutSeconds:60}),hasKey:()=>true};const modules:any={createProviderCredentialStore:(o:any)=>{assert.equal(o.runtimeFile,join(paths.dataRoot,'provider-runtime.json'));return providerStore;},createOwnerRuntimeAdapter:(o:any)=>{ownerOpts=o;return{talosLavora:async(i:any)=>({i}),attrezziKernel:async()=>({base:[],estesi:[]})};},avviaSessione:async(i:any)=>{launchInput=i;return{comeFinita:'concluso'};},verificaTrustPlugin:async()=>true,/* stage 3: the kernel's own tool list, as session-registry.mjs exports it */STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),createSessionRegistry:(o:any)=>{registryOpts=o;return{ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true})};}};const c=await composeTalosRuntime({repoRoot:'/repo',projectRoot:'/repo/p',paths:paths as any,model:'openai:gpt',env:{},modules});assert.equal(registryOpts.cartellaStore,paths.sessionsRoot);assert.equal(registryOpts.cartellaNote,join(paths.dataRoot,'notes'));assert.equal(registryOpts.cartellaTrustMcp,paths.trust.mcp);assert.equal(typeof registryOpts.verificaTrustPluginFn,'function');assert.equal(ownerOpts.modulePath,join('/repo','harness-ui','src','kernel','talosHarness.desktop-hotfix.mjs'));await registryOpts.avviaSessioneFn({x:1});assert.equal(typeof launchInput.talosLavoraFn,'function');assert.equal(c.providerStore.getKey('openrouter'),'or-key');assert.equal(ownerOpts.providerStore.getKey('anthropic'),'direct-key');assert.ok(c.tuiCatalog);});
test('keyring services are remapped away from desktop namespace',async()=>{const calls:string[][]=[];const raw={get:(s:string,a:string)=>{calls.push(['get',s,a]);return null;},set:(s:string,a:string,v:string)=>{calls.push(['set',s,a,v]);},remove:(s:string,a:string)=>{calls.push(['remove',s,a]);}};let scoped:any;const modules:any={createProviderCredentialStore:(o:any)=>{scoped=o.keyring;return{loadFromKeyring(){scoped.get('talos-harness-provider','openai');},getKey:()=>null,getRuntime:()=>({endpoint:'x'}),hasKey:()=>false};},createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),avviaSessione:async()=>({}),/* stage 3: the kernel's own tool list, as session-registry.mjs exports it */STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),createSessionRegistry:()=>({ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true})})};await composeTalosRuntime({repoRoot:'/r',projectRoot:'/p',paths:paths as any,model:'m',env:{},modules,keyring:raw});assert.equal(calls[0]?.[1],'talos-cli-provider');});

/* ⛔ B1 slice 12, round 4: the composition does not pass `platform` to the brokered executor, which then
   consults the broker only on win32. Measured under WSL (Linux, Node 24.18.0): this test failed there with
   actual 0, expected 1, so ubuntu cli-unit was red regardless of any change. What it asserts on win32 is unchanged. */
test('composition injects the brokered executor into the user-typed command path',{skip:process.platform==='win32'?false:`the composed brokered executor only consults the broker on win32, and this host is ${process.platform}`},async()=>{
  let registryOpts:any;let direct:any=null;let brokerFactoryArgs:any=null;const brokerSeen:any[]=[];
  const broker={async execute(request:any){brokerSeen.push(request);return{exitCode:0,stdout:'ok',stderr:'',evidence:{requestedEnforcement:'restricted-process',appliedEnforcement:'windows-sandbox',backend:'fake-backend',appContainer:true,filesystem:'bfs',network:'deny',processTree:'job-object-kill-on-close',sandboxSpecVersion:'0.1.0'}};}};
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'k',getRuntime:()=>({}),hasKey:()=>true}),
    createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
    avviaSessione:async()=>({}),
    eseguiComandoDiretto:async(input:any)=>{direct=input;return{ok:true};},
    /* stage 3: the kernel's own tool list, as session-registry.mjs exports it */STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),createSessionRegistry:(o:any)=>{registryOpts=o;return{ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true})};},
  };
  await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:'/repo/p',paths:paths as any,model:'m',env:{},modules,brokerFactory:(o:any)=>{brokerFactoryArgs=o;return broker as any;}});
  assert.equal(typeof registryOpts.eseguiComandoDirettoFn,'function');
  assert.equal(brokerFactoryArgs.paths.cacheRoot,paths.cacheRoot);
  await registryOpts.eseguiComandoDirettoFn({cartella:process.cwd(),comando:'git status',onEvento:()=>{},mobile:false,dove:'windows'});
  assert.equal(typeof direct.eseguiComandoSandboxatoFn,'function');
  const esito=await direct.eseguiComandoSandboxatoFn('git status',process.cwd(),{dove:'windows'});
  assert.equal(brokerSeen.length,1);
  assert.ok(esito.enforcement.includes('fake-backend'));
});

test('composition without a broker factory keeps the pure fallback behaviour',async()=>{
  let registryOpts:any;let direct:any=null;
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'k',getRuntime:()=>({}),hasKey:()=>true}),
    createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
    avviaSessione:async()=>({}),
    eseguiComandoDiretto:async(input:any)=>{direct=input;return{ok:true};},
    /* stage 3: the kernel's own tool list, as session-registry.mjs exports it */STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),createSessionRegistry:(o:any)=>{registryOpts=o;return{ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true})};},
  };
  await composeTalosRuntime({repoRoot:'/repo',projectRoot:'/repo/p',paths:paths as any,model:'m',env:{},modules});
  await registryOpts.eseguiComandoDirettoFn({cartella:process.cwd(),comando:'x',onEvento:()=>{}});
  assert.equal(typeof direct.eseguiComandoSandboxatoFn,'function');
});

/* P-D (owner 07/10 night): the journal keeps every streamed delta, so a long session replays tens of thousands of tiny events; the composed
   registry folds adjacent deltas of one message into one event on a FULL replay (from 0) and only there. The folding itself is proven in
   test/runtime/replay-coalescer.test.ts; this proves it is wired where every consumer subscribes. */
test('the composed registry folds the deltas of a full replay, and only of a full replay; live events are not delayed',async()=>{
  const history=[{type:'TextMessageStart',messageId:'m1',role:'assistant',_sequenza:1},{type:'TextMessageContent',messageId:'m1',delta:'He',_sequenza:2},{type:'TextMessageContent',messageId:'m1',delta:'llo',_sequenza:3},{type:'TextMessageEnd',messageId:'m1',_sequenza:4}];
  const live:Array<(event:unknown)=>void>=[];
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'k',getRuntime:()=>({}),hasKey:()=>true}),
    createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
    avviaSessione:async()=>({}),
    eseguiComandoDiretto:async()=>({ok:true}),
    STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),
    createSessionRegistry:()=>({ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:(_id:string,listener:(event:unknown)=>void,from=0)=>{for(const event of history)if(!((event._sequenza as number)<=from))listener(event);live.push(listener);return()=>{};},ferma:()=>true,rispondiApprovazione:()=>({ok:true})}),
  };
  const composed:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:'/repo/p',paths:paths as any,model:'m',env:{},modules});
  const shape=(events:any[])=>events.map(event=>event.type==='TextMessageContent'?`content:${event.delta}@${event._sequenza}`:event.type);
  const full:any[]=[];composed.registry.iscriviti('s',(event:any)=>full.push(event),0);
  assert.deepEqual(shape(full),['TextMessageStart','content:Hello@3','TextMessageEnd']);
  const partial:any[]=[];composed.registry.iscriviti('s',(event:any)=>partial.push(event),1);
  assert.deepEqual(shape(partial),['content:He@2','content:llo@3','TextMessageEnd'],'a replay from a cursor is not folded');
  live[0]!({type:'TextMessageContent',messageId:'m1',delta:'!',_sequenza:5});
  assert.deepEqual(shape(full),['TextMessageStart','content:Hello@3','TextMessageEnd','content:!@5'],'a live event reaches the listener at once');
});

test('B2 the composed runtime lists through the C4R index: the second list, in a new composition, restores nothing',async()=>{
  const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');
  const root=await mkdtemp(join(tmpdir(),'talos-comp-idx-'));
  try{
    const sessionsRoot=join(root,'sessions');await mkdir(sessionsRoot,{recursive:true});await mkdir(join(root,'data'),{recursive:true});
    const ID='55555555-eeee-4eee-8eee-555555555555';
    await writeFile(join(sessionsRoot,`${ID}.jsonl`),`${JSON.stringify({tipo:'intestazione',schema:1,sessionId:ID,avviataAlle:'2026-10-01T10:00:00.000Z'})}\n`);
    const calls:string[]=[];
    const make=()=>composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:'/repo/p',paths:{...paths,dataRoot:join(root,'data'),sessionsRoot} as any,model:'m',env:{},modules:{
      createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'k',getRuntime:()=>({}),hasKey:()=>true}),
      createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
      avviaSessione:async()=>({}),eseguiComandoDiretto:async()=>({ok:true}),STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),
      createSessionRegistry:()=>({ripristina:async(options?:unknown)=>{calls.push(options===undefined?'all':JSON.stringify(options));return{ripristinate:1,totali:1};},
        elenca:()=>[{sessionId:ID,avviataAlle:'2026-10-01T10:00:00.000Z',nome:'from the registry'}],
        avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({})}),
    } as any}) as Promise<any>;
    const first=await make();
    assert.deepEqual((await first.runtime.listSessions()).map((row:any)=>row.name),['from the registry']);
    const second=await make();
    assert.deepEqual((await second.runtime.listSessions()).map((row:any)=>row.name),['from the registry'],'the row now comes from the index');
    assert.deepEqual(calls,[JSON.stringify({soloSessioni:[]}),JSON.stringify({soloSessioni:[ID]})],'the first list prepared the kernel and restored the stale journal; the second restored nothing');
  }finally{await rm(root,{recursive:true,force:true});}
});

/* C2 (08/10): a giant tool result of a FULL replay is cut to its head and its tail for the subscriber that asks for the screen (`resultsForScreen`), and for nobody else. */
test('the composed registry cuts a giant tool result only for a screen subscriber on a full replay',async()=>{
  const giant='first line\n'+'y'.repeat(300_000)+'\nlast line\n';
  const history=[{type:'ToolCallResult',toolCallId:'t1',messageId:'m1',role:'tool',content:giant,_sequenza:1},{type:'ToolCallResult',toolCallId:'t2',messageId:'m2',role:'tool',content:'small',_sequenza:2}];
  const live:Array<(event:unknown)=>void>=[];
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'k',getRuntime:()=>({}),hasKey:()=>true}),
    createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
    avviaSessione:async()=>({}),
    eseguiComandoDiretto:async()=>({ok:true}),
    STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),
    createSessionRegistry:()=>({ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:(_id:string,listener:(event:unknown)=>void,from=0)=>{for(const event of history)if(!((event._sequenza as number)<=from))listener(event);live.push(listener);return()=>{};},ferma:()=>true,rispondiApprovazione:()=>({})}),
  };
  const composed:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:'/repo/p',paths:paths as any,model:'m',env:{},modules});
  const screen:any[]=[],plain:any[]=[],fromCursor:any[]=[];
  composed.registry.iscriviti('s',(event:any)=>screen.push(event),0,{resultsForScreen:true});
  composed.registry.iscriviti('s',(event:any)=>plain.push(event),0);
  composed.registry.iscriviti('s',(event:any)=>fromCursor.push(event),0.5,{resultsForScreen:true});
  assert.ok(String(screen[0].content).length<40*1024,'cut for the screen');
  assert.ok(String(screen[0].content).startsWith('first line\n')&&String(screen[0].content).endsWith('\nlast line\n'),'its first line and its last line are there');
  assert.equal(screen[1].content,'small','a small result is as it was');
  assert.equal(plain[0].content,giant,'a subscriber that does not ask gets the whole event');
  assert.equal(fromCursor[0].content,giant,'a replay from a cursor is not cut');
  live[0]!({type:'ToolCallResult',toolCallId:'t3',messageId:'m3',role:'tool',content:giant,_sequenza:3});
  assert.equal(screen.at(-1).content,giant,'a live event is never cut');
});
