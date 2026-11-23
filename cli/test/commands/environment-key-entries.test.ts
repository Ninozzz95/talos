/*
 * B1 slice 18, fix round — condition 3: every ENTRY decides, explicitly, whether an environment key is used without asking.
 *
 * Measured by the coordinator before this round: `talos research start` with `OPENROUTER_API_KEY` in the environment and no TTY
 * exited 2 with zero requests, because every subcommand went through the consent default. The owner's rule: non-interactively an
 * environment key is used without asking and the output states where it came from. The screen stays consent, `talos provider`
 * stays consent, and every child the screen spawns carries `TALOS_ENVIRONMENT_KEYS=consent`, which an entry honours ONLY to close.
 *
 * Real subcommand dispatch, real `main`, real entries (`createCliRuntimeContext`, `createCliRuntime`) and the kernel's own store and
 * chat path, to a provider on 127.0.0.1. Only the keyring is replaced, and every key is a dummy.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {main} from '../../src/main.ts';
import {runSubcommand} from '../../src/subcommands.ts';
import {createCliRuntime,createCliRuntimeContext} from '../../src/runtime/create-runtime.ts';
import {dummyKey,fakeKeyring,filesContaining,hermetic,REPO_ROOT,settle,startFakeProvider,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';

const REGISTRY=(await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','provider-registry.mjs')).href)).REGISTRO_FORNITORI as Record<string,any>;
const label=(id:string)=>String(REGISTRY[id].etichetta);
const MODEL='openrouter:vendor/live-model-a';
const ORIGIN=`Key for ${label('openrouter')}: environment variable OPENROUTER_API_KEY, used without asking because this run is non-interactive.`;
/* R2 (gate E8 / Q-R2-7): the one missing-key sentence, the same on every path (`provider/missing-key.ts`). */
const MISSING=`No API key for ${label('openrouter')}. Set OPENROUTER_API_KEY or run \`talos provider set-key openrouter\`.`;

function subcommand(h:Hermetic,positionals:string[],{json=false,keyring=fakeKeyring(),model=MODEL,createRuntimeContext}:{json?:boolean;keyring?:ReturnType<typeof fakeKeyring>;model?:string;createRuntimeContext?:(input:any)=>Promise<any>}={}){
  const out:string[]=[];const err:string[]=[];
  // No TTY: this is what CI and the Windows scheduled task look like.
  const io:any={writeOut:(s:string)=>{out.push(s);},writeErr:(s:string)=>{err.push(s);},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''};
  const inv:any={command:'subcommand',interactive:false,outputFormat:json?'json':'text',verbose:false,color:false,project:h.project,model,positionals};
  return runSubcommand(inv,{io,repoRoot:REPO_ROOT,paths:h.paths,createRuntimeContext:createRuntimeContext??((input:any)=>createCliRuntimeContext({...input,trustVerified:true,keyring}))}).then(code=>({code,out:out.join(''),err:err.join('')}));
}
async function until(check:()=>boolean,label:string,timeoutMs=30000){const deadline=Date.now()+timeoutMs;while(!check()){if(Date.now()>deadline)throw new Error(`timed out waiting for ${label}`);await new Promise(resolve=>setTimeout(resolve,20));}}

test('talos research start with no TTY and an environment key reaches the provider and states the key\'s origin',async()=>{
  const key=dummyKey('research-env');
  await hermetic(async h=>{
    const provider=await startFakeProvider({goodKey:key,models:[{id:'vendor/live-model-a',name:'Live Model A'}]});
    try{
      writeProviderRuntime(h.paths,{openrouter:`${provider.url}/api/v1`});
      const text=await subcommand(h,['research','start','What','changed?']);
      assert.equal(text.code,0,text.err);
      assert.equal(text.err,`${ORIGIN}\n`,'text mode: exactly one stderr line, the origin');
      assert.match(text.out,/^\S+\n$/u,'stdout is the session id');
      await until(()=>provider.requests.some(r=>r.method==='POST'&&r.authorizedAs==='good'),'the research request carrying the environment key');

      const json=await subcommand(h,['research','start','Again?'],{json:true});
      assert.equal(json.code,0,json.out);
      assert.equal(json.err,'','JSON mode: nothing on stderr');
      const parsed=JSON.parse(json.out);
      assert.equal(parsed.started,true);
      assert.deepEqual(parsed.warnings,[ORIGIN],'JSON mode: a warnings entry');
      await until(()=>provider.requests.filter(r=>r.method==='POST'&&r.authorizedAs==='good').length>=2,'the second research request');
      assert.deepEqual(h.network.blocked,[]);
      for(const output of [text.out,text.err,json.out])assert.equal(output.includes(key),false,'the key is not in the output');
      await settle(h.root);
      assert.deepEqual(filesContaining(h.root,key),[],'nor in any file');
    }finally{await provider.close();}
  },{processEnv:{OPENROUTER_API_KEY:key}});
});

test('with TALOS_ENVIRONMENT_KEYS=consent the same command sends nothing and names the missing key; so does talos -p',async()=>{
  const key=dummyKey('research-closed');
  await hermetic(async h=>{
    const provider=await startFakeProvider({goodKey:key,models:[]});
    try{
      writeProviderRuntime(h.paths,{openrouter:`${provider.url}/api/v1`});
      const closed=await subcommand(h,['research','start','What','changed?']);
      /* R2: the line SHAPE is lane E's (Q-R2-4: headline / what to do / details with the code; E6: the trace id only in verbose
         output), the sentence is lane K's (Q-R2-7). Asserted here: the sentence and the code, whatever the layout. */
      assert.ok(closed.err.includes(MISSING),`the missing key is named with the one sentence: ${closed.err}`);
      assert.ok(closed.err.includes('PROVIDER_KEY_MISSING'),`the refusal carries its code: ${closed.err}`);
      assert.equal(closed.code,11);
      assert.equal(closed.out,'');

      const out:string[]=[];const err:string[]=[];
      const code=await main(['--project',h.project,'--model',MODEL,'-p','hello','--json'],{io:{writeOut:(s:string)=>{out.push(s);},writeErr:(s:string)=>{err.push(s);},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''} as any,createRuntime:(input:any)=>createCliRuntime({...input,repoRoot:REPO_ROOT,keyring:fakeKeyring()})});
      const parsed=JSON.parse(out.join(''));
      assert.equal(parsed.error?.code,'PROVIDER_KEY_MISSING',JSON.stringify(parsed));
      assert.equal(parsed.error.message,MISSING);
      assert.equal(code,11);
      assert.equal(provider.requests.length,0,'nothing was sent');
      assert.deepEqual(h.network.blocked,[]);
    }finally{await provider.close();}
  },{processEnv:{OPENROUTER_API_KEY:key,TALOS_ENVIRONMENT_KEYS:'consent'}});
});

test('TALOS_ENVIRONMENT_KEYS never opens: with use, a consent entry and the screen\'s factory still withhold the key',async()=>{
  const key=dummyKey('marker-use');
  await hermetic(async h=>{
    const keyring=fakeKeyring();
    const envKey=await subcommand(h,['provider','env-key','openrouter'],{keyring});
    assert.equal(envKey.out,'OPENROUTER_API_KEY: not used until approved (talos provider env-key openrouter --use)\n');
    const listed=JSON.parse((await subcommand(h,['provider','list'],{json:true,keyring})).out).find((row:any)=>row.id==='openrouter');
    // R0: since `1fce022b1` (M5-A) `provider list` prints the typed control-plane profile; the auth block carries the key state.
    assert.equal(listed.auth.configured,false,'talos provider is not opened by a use value');
    assert.equal(listed.auth.usable,false,'nor made usable by it');
    assert.equal(listed.auth.source,'environment-unanswered');
    const screen=await createCliRuntimeContext({projectRoot:h.project,paths:h.paths,repoRoot:REPO_ROOT,trustVerified:true,model:MODEL,keyring:fakeKeyring(),environmentKeys:'consent'});
    assert.equal(screen.providerStore.getKey('openrouter'),null,'the screen\'s entry is not opened by a use value');
    const forgot=await createCliRuntimeContext({projectRoot:h.project,paths:h.paths,repoRoot:REPO_ROOT,trustVerified:true,model:MODEL,keyring:fakeKeyring()});
    assert.equal(forgot.providerStore.getKey('openrouter'),null,'a caller that forgets to choose gets consent, whatever the variable says');
  },{processEnv:{OPENROUTER_API_KEY:key,TALOS_ENVIRONMENT_KEYS:'use'}});
});

test('each entry states its mode explicitly: screen consent, -p use, one-shot model commands use, talos provider and session reads consent',async()=>hermetic(async h=>{
  const seen:Array<[string,unknown]>=[];let current='';
  const fakeContext={registry:{ripristina:async()=>({}),elenca:()=>[{sessionId:'s1',modello:MODEL}],avvia:()=>({sessionId:'auto-1'}),iscriviti:()=>()=>{}},runtime:{start:async()=>'sess-1',resume:async(id:string)=>id,subscribe:()=>()=>{},close:async()=>{}},providerStore:{listPublic:()=>[]},tuiCatalog:{listProviders:async()=>[]}};
  const capture=async(input:any)=>{seen.push([current,input?.environmentKeys]);return fakeContext;};
  const io=(tty:boolean)=>({writeOut:()=>{},writeErr:()=>{},stdinIsTTY:tty,stdoutIsTTY:tty,readStdin:async()=>''} as any);

  current='screen';
  assert.equal(await main(['--project',h.project],{io:io(true),createRuntimeContext:capture,runTui:async()=>{}}),0);
  current='-p';
  await main(['--project',h.project,'-p','hello','--json','--timeout','1'],{io:io(false),createRuntime:async(input:any)=>{seen.push([current,input?.environmentKeys]);return{...fakeContext.runtime,listSessions:async()=>[],answerApproval:async()=>{},cancel:async()=>{},start:async()=>{throw Object.assign(new Error('stop here'),{code:'TEST_STOP'});}};}});

  const run=(name:string,positionals:string[])=>{current=name;return subcommand(h,positionals,{createRuntimeContext:capture});};
  await run('research start',['research','start','q']);
  const add=await subcommand(h,['automation','add','check the build','--when','every 30m'],{json:true,createRuntimeContext:capture});
  const automationId=JSON.parse(add.out).id;
  await run('automation run',['automation','run',automationId]);
  /* 0.6.6: `serve` takes no automation id (the placeholder 0.6.5 needed is gone with the old runner) */
  await run('automation serve',['automation','serve','--once']);
  await run('session resume',['session','resume','s1','continue']);
  await run('session list',['session','list']);
  await run('provider list',['provider','list']);
  assert.deepEqual(seen,[['screen','consent'],['-p','use'],['research start','use'],['automation run','use'],['automation serve','use'],['session resume','use'],['session list','consent'],['provider list','consent']]);
}));
