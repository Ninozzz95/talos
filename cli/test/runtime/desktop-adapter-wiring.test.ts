/*
 * 0.6.13 (owner 21/10/2026, «la 0.6.13 è la compattazione»; «il kernel e i motori devono essere NON NEGOZIABILMENTE centralizzati»):
 * the CLI loads the desktop's kernel adapter (talosHarness.desktop-hotfix.mjs) instead of the bare kernel, so a turn compacts as
 * the desktop's does. What the adapter needs from its host, and the CLI now gives it:
 *  - the window and output limit of the model a turn sends to (registry `finestraTokenFn`/`limiteUscitaFn`), from the same
 *    profile the Context Engine uses (model-profile.ts); unknown ⇒ nothing, and the adapter's 200,000 cap applies, as OpenCode
 *    falls back to 200,000 for an unknown window (packages/core/src/session/compaction.ts:99);
 *  - the person's `context.compactAtTokens` as `tettoCompattazioneToken`, as Hermes hands its configured cap to the compressor
 *    (agent/context_compressor.py threshold_tokens_cap) and Codex reads `auto_compact_token_limit` from configuration;
 *  - `onStallo`, so the adapter's inactivity record goes to the development log and never to stderr in `-p`;
 *  - the registry's end-of-turn summary back on: the adapter reads it (`recordCompattazioneIniziale`).
 */
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {fileURLToPath} from 'node:url';
import {closedTrustAuthority,composeTalosRuntime,summaryChoiceFrom} from '../../src/runtime/talos-composition.ts';

const REPO_ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const roots:string[]=[];
after(async()=>{for(const directory of roots)await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
function pathsUnder(root:string){return{configRoot:join(root,'config'),dataRoot:join(root,'data'),cacheRoot:join(root,'cache'),sessionsRoot:join(root,'data','sessions'),logsRoot:join(root,'data','logs'),projectOverridesRoot:join(root,'data','projects'),queueRoot:join(root,'data','queues'),trust:{hooks:join(root,'trust','hooks'),mcp:join(root,'trust','mcp'),plugins:join(root,'trust','plugins'),projects:join(root,'trust','projects')}};}

async function compose(config:Record<string,unknown>|null,extraModules:Record<string,unknown>={},{askPerson=false,statoCompattazione,registryExtras={},projectUntrusted=false}:{projectUntrusted?:boolean;askPerson?:boolean;statoCompattazione?:(id:string)=>unknown;registryExtras?:Record<string,unknown>}={}){
  const root=await mkdtemp(join(tmpdir(),'talos-adapter-wiring-'));roots.push(root);
  const paths=pathsUnder(root);
  if(config){mkdirSync(paths.configRoot,{recursive:true});writeFileSync(join(paths.configRoot,'config.json'),JSON.stringify({version:1,...config}));}
  const seen:{registry:any;owner:any;launch:any;turns:any[]}={registry:null,owner:null,launch:null,turns:[]};
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'k',getRuntime:()=>({}),hasKey:()=>true}),
    createOwnerRuntimeAdapter:(o:any)=>{seen.owner=o;return{talosLavora:async(input:any)=>{seen.turns.push(input);return{};},attrezziKernel:async()=>({base:[],estesi:[]})};},
    avviaSessione:async(input:any)=>{seen.launch=input;return{};},
    eseguiComandoDiretto:async()=>({ok:true}),
    separaFonteModello:(modello:string)=>{const at=modello.indexOf(':');if(at<=0)throw new Error('no provider');return{fonte:modello.slice(0,at),modelloRemoto:modello.slice(at+1)};},
    STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),
    createSessionRegistry:(o:any)=>{seen.registry=o;return{ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true}),...(statoCompattazione?{statoCompattazione}:{}),...registryExtras};},
    ...extraModules,
  };
  const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:REPO_ROOT,paths:paths as any,model:'m',env:{},modules,keyring:null,askPerson,...(projectUntrusted?{projectUntrusted:true}:{})});
  await seen.registry.avviaSessioneFn({x:1});
  /* the turn as the agent service hands it on: the registry's own window (null when it did not know it) and the network model */
  const turn=async(input:Record<string,unknown>)=>{await seen.launch.talosLavoraFn(input);return seen.turns.at(-1);};
  return{seen,turn,context};
}

const KNOWN={'openrouter:test/small':{contextWindow:50_000,maxOutputTokens:4_000}};

test('the CLI loads the desktop\'s kernel adapter, the module the desktop runs',async()=>{
  const {seen}=await compose(null);
  assert.equal(seen.owner.modulePath,join(REPO_ROOT,'harness-ui','src','kernel','talosHarness.desktop-hotfix.mjs'));
  assert.ok(existsSync(seen.owner.modulePath),'the adapter is in the kernel tree');
});

/* review 1 of 0.6.13 (S2-1), owner 22/10/2026 «Spento solo in -p»: on the screen it is on (the adapter reads it); with nobody at
   the screen it is never started, because it held `talos -p` after its answer (up to 5.5 min against a provider answering 503) */
test('the registry\'s end-of-turn summary is on for the screen and off with nobody at it',async()=>{
  assert.equal((await compose(null,{},{askPerson:true})).seen.registry.riassuntoDiFineGiro,true);
  assert.equal((await compose(null)).seen.registry.riassuntoDiFineGiro,false,'talos -p and the one-shot commands');
});

/* review 1 of 0.6.13 (S2-4): the owner runtime keys OpenRouter's session_id on the conversation (runtime-owner-adapter.mjs) */
test('a turn hands the owner runtime its conversation, for the provider\'s session key',async()=>{
  const {turn}=await compose(null);
  assert.equal((await turn({modello:'openrouter:test/small',checkpointSessionId:'conv-1'})).checkpointSessionId,'conv-1');
  assert.equal('checkpointSessionId' in (await turn({modello:'openrouter:test/small'})),false,'no conversation, none sent');
});

test('No (a): a resource trusted by itself in the past does not pass, and the rest of the authority stays',async()=>{
  const closed=closedTrustAuthority({verifyScope:async()=>true,inspect:async()=>'snapshot'});
  assert.equal(await closed.verifyScope({kind:'hook',id:'h'}),false);
  assert.equal(await closed.inspect(),'snapshot');
});

/* Contract «mai aspettare»: the owner's «Ovunque», C1 and C6-bis */
test('a turn never waits for a summary, and the person\'s choices reach the kernel in its shape',async()=>{
  const {seen}=await compose({context:{summaryModel:'openrouter:vendor/m',summaryBackup:'conversation'}});
  assert.equal(seen.registry.compattazioneIstantanea,true);
  assert.deepEqual(seen.registry.sceltaDelRiassuntoFn(),{modelloDelRiassunto:'openrouter:vendor/m',riservaDelRiassunto:'conversazione'});
  assert.deepEqual(summaryChoiceFrom({summaryBackup:'ollama:qwen'}).riservaDelRiassunto,{provider:'ollama',model:'qwen'});
  assert.deepEqual(summaryChoiceFrom({summaryBackup:'vendor/m'}).riservaDelRiassunto,{provider:'openrouter',model:'vendor/m'});
  assert.deepEqual(summaryChoiceFrom(undefined),{modelloDelRiassunto:null,riservaDelRiassunto:null},'nothing chosen: no backup, never the conversation by itself');
});

/* talos_help and view_image (form A, owner's answer 2): offered by the kernel only when the host hands them over */
test('the guide goes to the kernel for the CLI\'s product, and view_image with who says if the model sees',async()=>{
  const help:any[]=[];const look:any[]=[];
  const {seen}=await compose(null,{creaAiutoTalos:(o:any)=>{help.push(o);return{rispondi:async()=>({testo:''})};},creaGuardaImmagine:(o:any)=>{look.push(o);return async()=>({ok:true});},createChatImageStore:()=>({upload:async()=>({})})});
  assert.equal(help[0].prodotto,'cli');assert.match(String(help[0].versione),/^\d+\.\d+\.\d+/u);
  assert.ok(String(help[0].cartella).endsWith(join('harness-ui','aiuto')));
  assert.ok(seen.registry.aiutoTalos,'handed to the registry');
  assert.equal(look.length,1);assert.equal(typeof seen.registry.guardaImmagineFn,'function');assert.equal(typeof seen.registry.vedeImmaginiFn,'function');
  assert.equal((await compose(null)).seen.registry.guardaImmagineFn,undefined,'no image store, no view_image');
});

/* A5 of the alignment (kernel block 26): the root, the kernel adds `background/`; a model's command never leaves a log in the project */
test('the background logs of the model and of the person\'s ! go to the data of TALOS, not to the project',async()=>{
  const {seen,turn}=await compose(null);
  const root=String(seen.registry.cartellaSfondoProgettoFn('C:/any/project'));
  assert.ok(root.endsWith(join('','data')),root);
  assert.ok(!root.startsWith(REPO_ROOT),'never under the project');
  assert.equal('cartellaSfondo' in (await turn({modello:'openrouter:test/small'})),false,'one road only: the registry, for the model and for !');
});

/* Form B, No (a): the kernel hears it once per session; no hook, connection or plugin passes, even one trusted by itself in the past */
test('a folder the person said No to reaches the kernel closed; otherwise nothing changes',async()=>{
  const closed=await compose(null,{},{projectUntrusted:true});
  assert.equal(closed.seen.registry.senzaIstruzioniDelProgettoFn('any'),true);
  assert.equal(await closed.seen.registry.verificaTrustFn({hookId:'h'}),false);
  assert.equal(await closed.seen.registry.verificaTrustMcpFn({serverId:'m'}),false);
  assert.equal('senzaIstruzioniDelProgettoFn' in (await compose(null)).seen.registry,false,'golden: off, the registry input is yesterday\'s');
});

/* R2-F1 (cure 208 bis): the registry asks the folder's trust at every turn, synchronously; the No answers false, a folder not yet
   asked answers null (the session's own sign decides, as before), another folder is not the CLI's to say */
test('the registry gets the folder\'s trust at every turn: false after the No, null before anything is asked',async()=>{
  const closed=await compose(null,{},{projectUntrusted:true});
  assert.equal(closed.seen.registry.fiduciaDellaCartellaFn(REPO_ROOT),false);
  assert.equal(closed.context.runtime.folderTrust(),false,'the CLI\'s engine reads the same answer');
  assert.equal(closed.seen.registry.fiduciaDellaCartellaFn(join(REPO_ROOT,'..','elsewhere')),null);
  const open=await compose(null);
  assert.equal(open.seen.registry.fiduciaDellaCartellaFn(REPO_ROOT),null,'synchronous, and not asked before the first send');
  assert.equal(open.context.runtime.folderTrust(),null);
});

/* review 1 of 0.6.13 (S2-1): the screen's exit waits for a summary still on its way, bounded; `-p` has none to wait for */
for(const [name,askPerson,runningMs,least,most] of [
  ['the screen waits until the summary on its way is done',true,600,500,3_000],
  ['the screen waits at most five seconds',true,60_000,4_900,7_000],
  ['with nobody at the screen nothing is waited',false,60_000,0,1_000],
] as Array<[string,boolean,number,number,number]>)
test(`exit: ${name}`,async()=>{
  let until=0;const asked:string[]=[];
  const statoCompattazione=(id:string)=>{asked.push(id);return{record:null,inCorso:Date.now()<until};};
  const {turn,context}=await compose(null,{},{askPerson,statoCompattazione});
  await turn({modello:'openrouter:test/small',checkpointSessionId:'conv-1'});
  until=Date.now()+runningMs;const started=Date.now();
  await context.runtime.close();
  const took=Date.now()-started;
  assert.ok(took>=least&&took<=most,`closed after ${took} ms, expected ${least}–${most}`);
  if(askPerson)assert.ok(asked.includes('conv-1'),'the registry was asked about the conversation of this process');
});

test('the registry gets the window and output limit of the model a turn sends to, from the CLI\'s model profile',async()=>{
  const {seen}=await compose({models:KNOWN});
  assert.equal(seen.registry.finestraTokenFn('openrouter:test/small'),50_000);
  assert.equal(seen.registry.limiteUscitaFn('openrouter:test/small'),4_000);
  /* unknown model, or a name without its provider: nothing, never a guess */
  assert.equal(seen.registry.finestraTokenFn('openrouter:test/none'),null);
  assert.equal(seen.registry.limiteUscitaFn('openrouter:test/none'),null);
  assert.equal(seen.registry.finestraTokenFn('no-provider'),null);
});

test('a turn carries the window, the output limit and the default cap of 200,000',async()=>{
  const {turn}=await compose({models:KNOWN});
  const sent=await turn({modello:'openrouter:test/small',finestraToken:null});
  assert.equal(sent.finestraToken,50_000,'read again when the registry did not know it at the start of the turn');
  assert.equal(sent.limiteUscitaToken,4_000);
  assert.equal(sent.tettoCompattazioneToken,200_000);
});

test('a window the registry already gave is kept',async()=>{
  const {turn}=await compose({models:KNOWN});
  const sent=await turn({modello:'openrouter:test/small',finestraToken:64_000,limiteUscitaToken:8_000});
  assert.equal(sent.finestraToken,64_000);
  assert.equal(sent.limiteUscitaToken,8_000);
});

test('context.compactAtTokens reaches the adapter as its cap',async()=>{
  const {turn}=await compose({models:KNOWN,context:{compactAtTokens:30_000}});
  assert.equal((await turn({modello:'openrouter:test/small'})).tettoCompattazioneToken,30_000);
});

test('no cap (null): the window decides when it is known; when it is not, the adapter keeps its own 200,000',async()=>{
  const {turn}=await compose({models:KNOWN,context:{compactAtTokens:null}});
  assert.equal((await turn({modello:'openrouter:test/small'})).tettoCompattazioneToken,10_000_000);
  const unknown=await turn({modello:'openrouter:test/none'});
  assert.equal('tettoCompattazioneToken' in unknown,false);
  assert.equal('finestraToken' in unknown&&unknown.finestraToken!=null,false);
});

test('the adapter\'s inactivity record never reaches stderr, and a bad record does not throw',async()=>{
  const {turn}=await compose(null);
  const sent=await turn({modello:'openrouter:test/small'});
  assert.equal(typeof sent.onStallo,'function');
  const written:string[]=[];const original=process.stderr.write.bind(process.stderr);const warn=console.warn;
  (process.stderr as any).write=(chunk:any)=>{written.push(String(chunk));return true;};console.warn=(...args:any[])=>{written.push(args.join(' '));};
  try{
    sent.onStallo({event:'desktop.blackbox.stall',stage:'model',stalledMs:45_000});
    sent.onStallo(null);sent.onStallo(undefined);
  }finally{(process.stderr as any).write=original;console.warn=warn;}
  assert.deepEqual(written,[]);
});

test('input cannot take the inactivity sink away',async()=>{
  const {turn}=await compose(null);
  const mine=()=>{throw new Error('not the CLI\'s');};
  const sent=await turn({modello:'openrouter:test/small',onStallo:mine});
  assert.notEqual(sent.onStallo,mine);
});

/* D5 (0.6.13): /compact of a session without the Context Engine. The kernel answers «not compacted» without a word for a summary
   cut short or empty (talosHarness.mjs compattaConversazione); its usage says the call was paid, so the CLI says it failed. */
async function composeCompact(kernelAnswer:any){
  const root=await mkdtemp(join(tmpdir(),'talos-adapter-compact-'));roots.push(root);
  let registryOpts:any=null;
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'k',getRuntime:()=>({}),hasKey:()=>true,listPublic:()=>[]}),
    createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
    creaFetchMultiProvider:()=>Object.assign(async()=>new Response('{}'),{eseguiConFallback:async(chiama:any)=>chiama({})}),
    avviaSessione:async()=>({}),
    eseguiComandoDiretto:async()=>({ok:true}),
    compattaSessione:async()=>kernelAnswer,
    STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),
    separaFonteModello:(model:string)=>({fonte:model.split(':')[0],modelloRemoto:model.split(':').slice(1).join(':')}),
    creaProntoFn:()=>()=>({pronto:true}),
    createSessionRegistry:(o:any)=>{registryOpts=o;return{
      ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true}),
      elenca:()=>[{sessionId:'s-1',provider:'cloud',modello:'openai:gpt-test'}],
      compatta:async()=>registryOpts.compattaSessioneFn({messaggiFinali:[{role:'system',content:'s'},{role:'user',content:'u'},{role:'assistant',content:'a'}]}),
    };},
  };
  const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:REPO_ROOT,paths:pathsUnder(root) as any,model:'openai:gpt-test',env:{},modules,keyring:null});
  return context;
}

test('/compact: a paid summary that came back cut short or empty is a failure, never «already compact»',async()=>{
  const context=await composeCompact({messaggi:[],compattato:false,usage:{prompt_tokens:900,completion_tokens:12}});
  await assert.rejects(context.registry.compatta('s-1'),(error:any)=>error?.code==='COMPACTION_NO_SUMMARY');
});

test('/compact: nothing sent and nothing compacted (too short to summarise) stays a plain «not compacted»',async()=>{
  const context=await composeCompact({messaggi:[],compattato:false,usage:null});
  const answer=await context.registry.compatta('s-1');
  assert.equal(answer?.compattato,false);
});

/* r4 ac98c6588: the registry's own threshold (the end-of-turn summary) takes the same cap as the turn */
test('the registry gets the same cap as the turn, read synchronously',async()=>{
  assert.equal((await compose({models:KNOWN})).seen.registry.tettoCompattazioneFn('openrouter:test/small'),200_000);
  assert.equal((await compose({models:KNOWN,context:{compactAtTokens:30_000}})).seen.registry.tettoCompattazioneFn('openrouter:test/small'),30_000);
  const none=(await compose({models:KNOWN,context:{compactAtTokens:null}})).seen.registry;
  assert.equal(none.tettoCompattazioneFn('openrouter:test/small'),10_000_000,'no cap, window known: the window decides');
  assert.equal(none.tettoCompattazioneFn('openrouter:test/none'),null,'no cap, window unknown: the kernel keeps its own 200,000');
});

test('a cap changed in the configuration reaches the registry after the next turn reads it',async()=>{
  const {seen,turn}=await compose({models:KNOWN,context:{compactAtTokens:30_000}});
  writeFileSync(join(seen.registry.cartellaStore,'..','..','config','config.json'),JSON.stringify({version:1,models:KNOWN,context:{compactAtTokens:40_000}}));
  assert.equal(seen.registry.tettoCompattazioneFn('openrouter:test/small'),30_000,'not read yet');
  await turn({modello:'openrouter:test/small'});
  assert.equal(seen.registry.tettoCompattazioneFn('openrouter:test/small'),40_000);
});

/* r4 2439d0dae (D5 a): the registry hands the kernel's `motivo` on; the composition keeps it, and the screen says «already compact» */
test('/compact: the kernel\'s «nothing to compact» reaches the screen as such, not as a failure',async()=>{
  const context=await composeCompact({messaggi:[],compattato:false,usage:null,motivo:'niente-da-compattare'});
  assert.equal((await context.registry.compatta('s-1'))?.motivo,'niente-da-compattare');
  const {runControllerSlashAction}=await import('../../src/tui/app.ts');
  const {t}=await import('../../src/i18n/index.ts');
  assert.equal(await runControllerSlashAction('compact',{compact:()=>context.registry.compatta('s-1')}),t('screen.compact.already'));
});

/* r4 06b9ed101 (desktop fix/riassunto-ausiliario-cli): the end-of-turn summary and the adapter's own summaries run on the provider's
   light model, as the Context Engine's do since 14/10 (owner, «Il più economico dello stesso fornitore»; runtime/auxiliary-model.ts) */
test('the registry gets the provider\'s light model for its summaries, and nothing when there is none',async()=>{
  const providers={REGISTRO_FORNITORI:{deepseek:{id:'deepseek',modelloAusiliario:'deepseek-flash'},openrouter:{id:'openrouter',modelloAusiliario:null}}};
  const {seen}=await compose({models:{'deepseek:deepseek-flash':{contextWindow:1_000_000,maxOutputTokens:8_000}}},providers);
  const pick=seen.registry.modelloRiassuntoFn;
  assert.equal(typeof pick,'function');
  assert.equal(pick('deepseek:deepseek-pro'),'deepseek:deepseek-flash');
  assert.equal(pick('deepseek:deepseek-flash'),null,'already the light model: the conversation\'s own');
  assert.equal(pick('openrouter:vendor/model'),null,'a provider that declares none keeps the conversation\'s model');
  assert.equal(pick('vendor/model-without-provider'),null);
  assert.equal(pick(''),null);
  /* r4 4e4004950 (review 2 of 0.6.13, S4-1): the exit asks the registry's own wait, which also covers a turn still settling */
test('exit: the registry\'s own end-of-turn wait is used, bounded, for each conversation of this process',async()=>{
  const asked:Array<[string,number]>=[];
  const attendiRiassuntoDiFineGiro=async(id:string,{attesaMassimaMs}:{attesaMassimaMs:number})=>{asked.push([id,attesaMassimaMs]);await new Promise(resolve=>setTimeout(resolve,400));return{atteso:true,scaduta:false};};
  const {turn,context}=await compose(null,{},{askPerson:true,registryExtras:{attendiRiassuntoDiFineGiro}});
  await turn({modello:'openrouter:test/small',checkpointSessionId:'conv-1'});
  const started=Date.now();await context.runtime.close();const took=Date.now()-started;
  assert.deepEqual(asked.map(([id])=>id),['conv-1']);
  assert.ok(asked[0]![1]>0&&asked[0]![1]<=5_000,`bounded by the exit's five seconds (asked ${asked[0]![1]} ms)`);
  assert.ok(took>=350&&took<3_000,`the close waited for it (${took} ms)`);
});

/* r4 4e4004950 (S2-A): /compact no longer passes through the CLI's compattaSessioneFn, so the CLI refuses and names it itself */
test('/compact: a session the CLI cannot compact is refused before the registry is asked; a compaction is named as manual',async()=>{
  let compacted=0;
  const registryExtras={compatta:async()=>{compacted++;return{ok:true,compattato:true,at:'2026-10-22T10:00:00.000Z',annullabile:true,tokenPrima:15_000,tokenDopo:900};},
    elenca:()=>[{sessionId:'s-cloud',provider:'cloud',modello:'openrouter:test/small'},{sessionId:'s-local',provider:'local',modello:'gguf'}],iscriviti:()=>()=>{}};
  const {context}=await compose(null,{},{registryExtras});
  const named:any[]=[];const off=context.registry.iscriviti('s-cloud',(event:any)=>{if(event?.name==='talos.cli.context.compacted')named.push(event.value);},0);
  await assert.rejects(context.registry.compatta('s-local'),(error:any)=>error?.code==='LOCAL_SESSION_COMPACTION_UNAVAILABLE');
  assert.equal(compacted,0,'nothing reached the registry for the local session');
  assert.equal((await context.registry.compatta('s-cloud'))?.compattato,true);
  assert.equal(compacted,1);
  assert.deepEqual(named,[{engine:'kernel',messagesSummarized:null,tokensBefore:15_000,tokensAfter:900,trigger:'manual'}]);
  off?.();
});

/* review 1 of 0.6.13 (S3-1): the light model only when its window is known, as the Context Engine's choice. Composed last: the
     model profile's configured windows are the process's (model-profile.ts `state`), and this composition has none */
  assert.equal((await compose(null,providers)).seen.registry.modelloRiassuntoFn('deepseek:deepseek-pro'),null,'light window unknown: the conversation\'s model');
});
