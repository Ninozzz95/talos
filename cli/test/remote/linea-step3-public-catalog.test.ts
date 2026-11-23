/*
 * «One line», step 3, round after the report (judge v1546, 11/11/2026): the network switch. `src/remote/http-deps.ts:41` built the
 * public model catalog with no check at all, so the terminal's remote host read OpenRouter's public list (`GET
 * https://openrouter.ai/api/v1/models`) even when the person had it off on the PC. The PC's cure (branch `prova/unione-rete-2026-11-11`,
 * `b95c81e7d`: `harness-ui/src/catalogo-pubblico.mjs`, `server.mjs:354-356`) has one rule, and the terminal follows the same one:
 *   · off by default (owner 09/11/2026 23:41, `CATALOGO_PUBBLICO_DI_SERIE = false`);
 *   · `TALOS_HARNESS_UI_CATALOGO_PUBBLICO=off` keeps it off whatever the saved preference says;
 *   · the saved preference `models.publicCatalog` (`.catalogo-pubblico.json`, `{acceso, openrouterScelto}`) turns it on;
 *   · an OpenRouter key, or a model of OpenRouter chosen, opens it (the request then serves a choice of the person).
 * Off means zero requests: the host answers with the built-in list.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {fileURLToPath} from 'node:url';
import {cliHttpDeps} from '../../src/remote/http-deps.ts';

const REPO=fileURLToPath(new URL('../../../',import.meta.url));
const VARIABLE='TALOS_HARNESS_UI_CATALOGO_PUBBLICO';
const roots:string[]=[];
after(()=>{for(const root of roots)rmSync(root,{recursive:true,force:true});});

async function ask({file,key=false,env}:{file?:Record<string,unknown>|string;key?:boolean;env?:string}){
  const dataRoot=mkdtempSync(join(tmpdir(),'talos-public-catalog-'));roots.push(dataRoot);
  if(typeof file==='string')writeFileSync(join(dataRoot,'.catalogo-pubblico.json'),file);
  else if(file)writeFileSync(join(dataRoot,'.catalogo-pubblico.json'),JSON.stringify({schema:'talos.public-model-catalog-settings.v1',...file}));
  const calls:string[]=[];
  const spy=(async(url:any)=>{calls.push(String(url));return new Response(JSON.stringify({data:[]}),{status:200,headers:{'content-type':'application/json'}});}) as typeof fetch;
  const saved=process.env[VARIABLE];
  if(env===undefined)delete process.env[VARIABLE];else process.env[VARIABLE]=env;
  try{
    const deps:any=await cliHttpDeps({repoRoot:REPO,context:{registry:{},providerStore:{hasKey:(id:string)=>key&&id==='openrouter'}} as any,fetch:spy,dataRoot});
    const answer=await deps.catalogoModelliFn();
    return{calls,answer};
  }finally{if(saved===undefined)delete process.env[VARIABLE];else process.env[VARIABLE]=saved;}
}

test('LINEA-3 v1546: off by default, the remote host sends nothing to openrouter.ai and still answers with the built-in list',async()=>{
  const {calls,answer}=await ask({});
  assert.deepEqual(calls,[],'the public catalog was read with the switch off by default');
  assert.ok(Array.isArray(answer?.modelli),'the host still answers a list');
});

test('LINEA-3 v1546: TALOS_HARNESS_UI_CATALOGO_PUBBLICO=off keeps it off even when the saved preference is on',async()=>{
  assert.deepEqual((await ask({file:{acceso:true},env:'off'})).calls,[]);
  assert.deepEqual((await ask({file:{acceso:true},env:'maybe'})).calls,[],'a value nobody understands does not open the network');
});

test('LINEA-3 v1546 AL CONTRARIO: the preference turned on, an OpenRouter key, or an OpenRouter model chosen, read the list',async()=>{
  assert.equal((await ask({file:{acceso:true}})).calls.length,1,'models.publicCatalog on');
  /* judge v1584: the key opens it without the variable; with the variable off it does not (the v1584 test below) */
  assert.equal((await ask({key:true})).calls.length,1,'the person gave OpenRouter a key: the request serves her choice (as the PC)');
  assert.equal((await ask({file:{openrouterScelto:true}})).calls.length,1,'the person chose a model of OpenRouter');
  assert.deepEqual((await ask({file:{acceso:false}})).calls,[],'turned off by the person');
});

/* Judge v1579 point 5 (reviewer's live mutant R2): a preferences file nobody can read never opens the network. */
test('LINEA-3 v1579: a preferences file that is not JSON, or that cannot be read as a file, keeps the public list off',async()=>{
  const spy=(calls:string[])=>(async(url:any)=>{calls.push(String(url));return new Response(JSON.stringify({data:[]}),{status:200,headers:{'content-type':'application/json'}});}) as typeof fetch;
  const saved=process.env[VARIABLE];delete process.env[VARIABLE];
  try{
    for(const write of [(file:string)=>writeFileSync(file,'{"acceso":true'),(file:string)=>mkdirSync(file)]){
      const dataRoot=mkdtempSync(join(tmpdir(),'talos-public-catalog-'));roots.push(dataRoot);
      write(join(dataRoot,'.catalogo-pubblico.json'));
      const calls:string[]=[];
      const deps:any=await cliHttpDeps({repoRoot:REPO,context:{registry:{},providerStore:{hasKey:()=>false}} as any,fetch:spy(calls),dataRoot});
      await deps.catalogoModelliFn();
      assert.deepEqual(calls,[],'an unreadable preferences file opened the network');
    }
  }finally{if(saved===undefined)delete process.env[VARIABLE];else process.env[VARIABLE]=saved;}
});

/* Judge v1579 point 4: the advice of PUBLIC_CATALOG_OFF named `models.publicCatalog`, a switch the terminal has no command for. It
   now says only what the terminal can do: a key for OpenRouter (`talos provider set-key openrouter`, provider-cli.ts), and says
   plainly that the terminal has no switch of its own. */
test('LINEA-3 v1579: the advice of PUBLIC_CATALOG_OFF can be followed in the terminal',async()=>{
  const {t}=await import('../../src/i18n/index.ts');
  const todo=t('error.code.PUBLIC_CATALOG_OFF.todo');
  assert.doesNotMatch(todo,/models\.publicCatalog|Turn the public model list on/u,'a switch the terminal cannot turn');
  assert.match(todo,/talos provider set-key openrouter/u);
  const {readFileSync}=await import('node:fs');
  assert.match(readFileSync(new URL('../../src/commands/provider-cli.ts',import.meta.url),'utf8'),/op==='set-key'/u,'the command it names exists');
});


/* Judge v1584 (network reviewer, point 4): the PC's new order. TALOS_HARNESS_UI_CATALOGO_PUBBLICO=off means ZERO requests, even with an
   OpenRouter key and an OpenRouter model chosen (harness-ui/src/catalogo-pubblico.mjs on a13649aa6, `consentito`: `if (bloccato) return
   false` first; as CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC also skips the startup warm-up, claude-code CHANGELOG.md:1548). The person's own «off» opens again
   with her key or her OpenRouter model. With no data folder (http-deps.ts `dataRoot` is optional) the rule falls back to the variable
   and the default, and never joins an undefined path. */
test('LINEA-3 v1584: the variable off beats the OpenRouter key and the OpenRouter model chosen: 0 requests',async()=>{
  assert.deepEqual((await ask({key:true,env:'off'})).calls,[],'the key opened the network against the variable');
  assert.deepEqual((await ask({file:{openrouterScelto:true},env:'off'})).calls,[],'the chosen model opened the network against the variable');
  assert.deepEqual((await ask({file:{acceso:false,openrouterScelto:true},key:true,env:'off'})).calls,[]);
});
test('LINEA-3 v1584 AL CONTRARIO: the person\'s own off opens again with her key or her OpenRouter model',async()=>{
  assert.equal((await ask({file:{acceso:false},key:true})).calls.length,1);
  assert.equal((await ask({file:{acceso:false,openrouterScelto:true}})).calls.length,1);
  assert.equal((await ask({file:'not json',key:true})).calls.length,1,'an unreadable file holds the default; the key still opens it, as on the PC');
});
test('LINEA-3 v1584: with no data folder the rule is the variable and the default, and nothing throws',async()=>{
  const saved=process.env[VARIABLE];
  try{
    for(const [env,key,expected] of [[undefined,false,0],['off',true,0],[undefined,true,1]] as const){
      if(env===undefined)delete process.env[VARIABLE];else process.env[VARIABLE]=env;
      const calls:string[]=[];
      const spy=(async(url:any)=>{calls.push(String(url));return new Response(JSON.stringify({data:[]}),{status:200,headers:{'content-type':'application/json'}});}) as typeof fetch;
      const deps:any=await cliHttpDeps({repoRoot:REPO,context:{registry:{},providerStore:{hasKey:(id:string)=>key&&id==='openrouter'}} as any,fetch:spy});
      await deps.catalogoModelliFn();
      assert.equal(calls.length,expected,`variable ${env}, key ${key}`);
    }
  }finally{if(saved===undefined)delete process.env[VARIABLE];else process.env[VARIABLE]=saved;}
});

/* Judge v1584, the case that counts: the CLI hosts the phone, the variable is off, the key is FAKE and an OpenRouter model is chosen;
   the phone's GET /api/v1/models must make 0 connections (the catalog's network is a counting fake, and so is the global fetch). */
test('LINEA-3 v1584: hosting the phone, variable off, fake OpenRouter key, OpenRouter model chosen: GET /api/v1/models answers with 0 requests',{timeout:120_000},async t=>{
  const base=mkdtempSync(join(tmpdir(),'talos-public-catalog-host-'));roots.push(base);
  for(const d of ['r','l','u','t','proj'])mkdirSync(join(base,d),{recursive:true});
  const saved={...process.env};
  Object.assign(process.env,{APPDATA:join(base,'r'),LOCALAPPDATA:join(base,'l'),USERPROFILE:join(base,'u'),HOME:join(base,'u'),TEMP:join(base,'t'),TMP:join(base,'t'),TALOS_CREDENTIAL_STORE:'memory',TALOS_TEST_PROFILE:'1',[VARIABLE]:'off'});
  const realFetch=globalThis.fetch;const calls:string[]=[];
  const counting=(async(url:any)=>{calls.push(String(url));return new Response(JSON.stringify({data:[{id:'vendor/model',context_length:1000}]}),{status:200,headers:{'content-type':'application/json'}});}) as typeof fetch;
  globalThis.fetch=counting;
  t.after(()=>{globalThis.fetch=realFetch;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);});
  const VENDOR=fileURLToPath(new URL('../../vendor/',import.meta.url));
  const {resolveCliPaths,ensureCliPaths}=await import('../../src/paths.ts');
  const {createCliRuntimeContext}=await import('../../src/runtime/create-runtime.ts');
  const {createRemoteHost}=await import('../../src/remote/host.ts');
  const {createMemoryKeyring}=await import('../../src/provider/store.ts');
  const paths=resolveCliPaths(process.env as any,process.platform,join(base,'u'));
  await ensureCliPaths(paths);
  writeFileSync(join(paths.dataRoot,'.catalogo-pubblico.json'),JSON.stringify({schema:'talos.public-model-catalog-settings.v1',openrouterScelto:true}));
  const context:any=await createCliRuntimeContext({projectRoot:join(base,'proj'),paths,repoRoot:VENDOR,model:'openrouter:vendor/model',trustVerified:true});
  t.after(()=>context.runtime?.close?.().catch(()=>{}));
  const store=context.providerStore;
  const withFakeKey=new Proxy(store,{get:(target,name)=>name==='hasKey'?((id:string)=>id==='openrouter'||target.hasKey(id)):Reflect.get(target,name)});
  const httpDeps=await cliHttpDeps({repoRoot:VENDOR,context:{...context,providerStore:withFakeKey},fetch:counting,dataRoot:paths.dataRoot});
  const host=await createRemoteHost({repoRoot:VENDOR,dataRoot:paths.dataRoot,registry:context.registry,keyring:createMemoryKeyring(`public-catalog-host-${process.pid}`),chatImageStore:context.chatImageStore,httpDeps,pcName:'probe',loadBinding:()=>null});
  t.after(()=>host.stop());
  const models=await host.call({metodo:'GET',percorso:'/api/v1/models',origine:'telefono:probe'});
  assert.equal(models.stato,200);
  assert.deepEqual(calls.filter(url=>/openrouter\.ai/u.test(url)),[],'the phone\'s model list reached openrouter.ai with the variable off');
});

/* ⚠ Judge v1584: the settings route (`GET /api/v1/public-catalog/settings`, 200 with `{acceso, spentoDallAmbiente}`) needs the kernel's
   own store (`creaImpostazioneCatalogoPubblico`), linked in the kernel block at the merge, not now; the line's kernel has no such route. */
test('LINEA-3 v1584: hosting the phone, the settings route of the public list answers 200',{todo:'the kernel link (creaImpostazioneCatalogoPubblico) comes with the kernel block at the merge'},async t=>{
  const VENDOR=fileURLToPath(new URL('../../vendor/',import.meta.url));
  const {createRemoteHost}=await import('../../src/remote/host.ts');
  const {createMemoryKeyring}=await import('../../src/provider/store.ts');
  const dataRoot=mkdtempSync(join(tmpdir(),'talos-public-catalog-route-'));roots.push(dataRoot);
  const httpDeps=await cliHttpDeps({repoRoot:VENDOR,context:{registry:{elenca:()=>[]},providerStore:{hasKey:()=>false}} as any,fetch:(async()=>new Response('{}')) as typeof fetch,dataRoot});
  const host=await createRemoteHost({repoRoot:VENDOR,dataRoot,registry:{elenca:()=>[]},keyring:createMemoryKeyring(`public-catalog-route-${process.pid}`),httpDeps,pcName:'probe',loadBinding:()=>null});
  t.after(()=>host.stop());
  const settings=await host.call({metodo:'GET',percorso:'/api/v1/public-catalog/settings',origine:'telefono:probe'});
  assert.equal(settings.stato,200);
});
