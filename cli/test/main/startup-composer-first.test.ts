/*
 * Startup stage 1 (owner 02/10, «Entrambe, a tappe»): the TUI starts before the kernel is loaded. Measured on 01/10: the
 * kernel and its packages took ~0.25 s of the 0.60 s to the composer, and main waited for them before starting the TUI.
 */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {main} from '../../src/main.ts';
import {writeConfigScope} from '../../src/config/load.ts';
import {resolveCliPaths} from '../../src/paths.ts';
import {homedir} from 'node:os';

async function workspace(t:any,config?:Record<string,unknown>){
  const root=await mkdtemp(join(tmpdir(),'talos-main-composer-first-'));
  /* A profile of its own for every test (Windows: APPDATA/LOCALAPPDATA; elsewhere XDG): a configured effort must not reach
     the other tests of the same run, which share the runner's profile (02/10: it reached M7-B). */
  const previous={XDG_CONFIG_HOME:process.env.XDG_CONFIG_HOME,XDG_STATE_HOME:process.env.XDG_STATE_HOME,XDG_CACHE_HOME:process.env.XDG_CACHE_HOME,APPDATA:process.env.APPDATA,LOCALAPPDATA:process.env.LOCALAPPDATA};
  process.env.XDG_CONFIG_HOME=join(root,'config');process.env.XDG_STATE_HOME=join(root,'state');process.env.XDG_CACHE_HOME=join(root,'cache');
  process.env.APPDATA=join(root,'appdata');process.env.LOCALAPPDATA=join(root,'localappdata');
  t.after(()=>{for(const [name,value] of Object.entries(previous)){if(value===undefined)delete process.env[name];else process.env[name]=value;}});
  if(config){await mkdir(join(root,'.talos'),{recursive:true});await writeFile(join(root,'.talos','config.json'),JSON.stringify(config));}
  const io:any={stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''};
  return{root,io};
}
function gate<T>(){let open!:(value:T)=>void,fail!:(error:unknown)=>void;const promise=new Promise<T>((resolve,reject)=>{open=resolve;fail=reject;});return{promise,open,fail};}

test('the TUI starts before the runtime context has loaded, and acts on the live registry through the stand-ins',async t=>{
  const {root,io}=await workspace(t);
  const g=gate<any>();let contextLoaded=false;let startedBeforeLoad:boolean|null=null;
  const sessions=[{id:'s-1'}];
  const runtime:any={close:async()=>{},listSessions:async()=>sessions};const registry:any={marker:'same-live-registry'};const catalog:any={};
  /* if main waits for the kernel before the TUI (the old order), the kernel still arrives, and the test fails, not hangs */
  const safety=setTimeout(()=>g.open({runtime,registry,tuiCatalog:catalog}),1500);t.after(()=>clearTimeout(safety));
  const code=await main(['--project',root],{io,
    createRuntimeContext:()=>g.promise.then(context=>{contextLoaded=true;return context;}),
    runTui:async(props:any)=>{
      startedBeforeLoad=!contextLoaded;
      g.open({runtime,registry,tuiCatalog:catalog});
      await props.startup;
      assert.deepEqual(await props.runtime.listSessions(),sessions,'the runtime stand-in reaches the live runtime');
      assert.equal(props.registry.marker,'same-live-registry','TUI controls act on the same registry that owns live research (M10-A)');
    }} as any);
  assert.equal(code,0,io.stderr);
  assert.equal(startedBeforeLoad,true,'the TUI started while the kernel was still loading');
});

test('a configured reasoning effort is applied before the first turn, and its notice goes to the TUI, not to stderr',async t=>{
  const {root,io}=await workspace(t);
  await writeConfigScope({paths:resolveCliPaths(process.env,process.platform,homedir()),projectRoot:root,scope:'user',patch:{reasoningEffort:'high'} as any});
  const applied:unknown[]=[];
  const runtime:any={close:async()=>{},setDefaultReasoningEffort:(value:unknown)=>applied.push(value)};
  const catalog:any={listModels:async()=>[{id:'ollama:demo',reasoning:false}]};
  let startup:any=null;
  const code=await main(['--project',root,'--model','ollama:demo'],{io,
    createRuntimeContext:async()=>({runtime,tuiCatalog:catalog}),
    runTui:async(props:any)=>{assert.equal(props.configuredModel,'ollama:demo','the configured model, shown before the catalog answers');startup=await props.startup;},
  } as any);
  assert.equal(code,0,io.stderr);
  assert.ok(startup,'the TUI receives what the startup decided');
  assert.equal(startup.reasoningEffort,null,'high is not affirmed for a model without reasoning');
  assert.deepEqual(startup.notices.map((n:any)=>n.code),['REASONING_EFFORT_UNSUPPORTED']);
  assert.deepEqual(applied,[null],'the model default is applied, before any turn');
  assert.doesNotMatch(io.stderr,/reasoning effort/iu,'nothing is written on stderr under a running TUI');
});

test('a kernel that fails to load ends the TUI and main reports the same error as before',async t=>{
  const {root,io}=await workspace(t);
  let tuiSawFailure=false;
  const failure=Object.assign(new Error('The TALOS runtime could not be found'),{code:'TALOS_RUNTIME_UNAVAILABLE'});
  const code=await main(['--project',root],{io,
    createRuntimeContext:async()=>{throw failure;},
    runTui:async(props:any)=>{try{await props.startup;}catch(error){tuiSawFailure=error===failure;throw error;}},
  } as any);
  assert.notEqual(code,0);
  assert.equal(tuiSawFailure,true);
  assert.match(io.stderr,/TALOS_RUNTIME_UNAVAILABLE|runtime could not be found/u);
});
