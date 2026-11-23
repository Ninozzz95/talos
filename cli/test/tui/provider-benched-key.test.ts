/*
 * B1 slice 25 — a benched key is not a usable key, on the screen.
 *
 * Measured live by the owner on 2026-09-17: `/provider` showed OpenRouter ready while its only key was benched by the kernel,
 * and the session runtime then refused the session. The kernel's `keyConfigured` counts every stored key, benched ones included
 * (`provider-credential-store.mjs`, `hasKey`); the key the runtime can use now is `getKey`, which skips a benched key.
 *
 * Real TuiApp through Ink into a fake 80-column TTY, over the REAL composition in consent mode; in-memory keyring, temporary
 * profile, dummy keys, a provider on 127.0.0.1. Labels are read from the kernel's registry.
 */
import {providerLabelText} from '../../src/provider/provider-text.ts';
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {dummyKey,ESC,fakeKeyring,hermetic,KEYS,mountTui,REPO_ROOT,startFakeProvider,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';

const REGISTRY=(await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','provider-registry.mjs')).href)).REGISTRO_FORNITORI as Record<string,any>;
/* R2 (D-05): the screen shows the English provider label, mapped by id (provider-text.ts). */
const label=(id:string)=>providerLabelText(id,String(REGISTRY[id].etichetta));
const LIVE=[{id:'vendor/live-model-a',name:'Live Model A'}];
/** The time a person reads for "until when": local HH:MM, with the local date in front when it is not today. Written here, not imported. */
function clock(ms:number){
  const at=new Date(ms);const now=new Date();const two=(n:number)=>String(n).padStart(2,'0');
  const time=`${two(at.getHours())}:${two(at.getMinutes())}`;
  return at.toDateString()===now.toDateString()?time:`${at.getFullYear()}-${two(at.getMonth()+1)}-${two(at.getDate())} ${time}`;
}

async function compose(h:Hermetic,endpoints:Record<string,string>){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  const {createEnvironmentKeyConsent}=await import('../../src/provider/environment-keys.ts');
  writeProviderRuntime(h.paths,endpoints);
  createEnvironmentKeyConsent({dataRoot:h.paths.dataRoot,registry:REGISTRY,env:{}}).chooseProvider('openrouter');
  return await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:'openrouter:vendor/live-model-a',env:{...process.env},environmentKeys:'consent',keyring:fakeKeyring()} as any) as any;
}

test('RED 2: /provider shows a provider whose only key is benched as benched, with cause and until when, and a send is refused naming it with no request',async()=>hermetic(async h=>{
  const key=dummyKey('openrouter-benched');
  const provider=await startFakeProvider({goodKey:key,models:LIVE});
  try{
    const context=await compose(h,{openrouter:`${provider.url}/api/v1`});
    context.providerStore.setKey('openrouter',key);
    const [entry]=context.providerStore.elencaPool('openrouter');const until=Date.now()+45*60_000;
    context.providerStore.mettiInPanchina('openrouter',entry.impronta,{classe:'traffico',resetAt:until});
    const tui=await mountTui({context,projectRoot:h.project,paths:h.paths,model:'openrouter:vendor/live-model-a'});
    try{
      await tui.typeAndEnter('/provider');
      /* stage 7.10b: /provider is the mockup's sheet; / filters, Enter ends the filter, the next Enter chooses */
      await tui.until(f=>/── (?:Models|AI provider) /u.test(f),'the provider sheet');
      tui.write('/');tui.write('openrouter');
      await tui.until(f=>f.includes('/ openrouter'),'the sheet filtered to openrouter');
      tui.write(KEYS.enter);await tui.until(f=>f.includes('enter use'),'the filter ended');
      /* the provider in use is marked ● and its row says the key is benched, why, and until when */
      await tui.until(f=>f.includes(`● ${label('openrouter')}`)&&f.replace(/\s+/gu,' ').includes(`key benched (rate limit) until ${clock(until)}`),'the row that says the key is benched, why, and until when');
      tui.write(KEYS.enter);
      /* P21: the sign-in choice says the saved key is benched too, before the pasted-key way is taken. */
      const choice=await tui.until(f=>f.includes('Sign in with OpenRouter (browser)'),'the sign-in choice');
      assert.ok(choice.includes(`The ${label('openrouter')} key is benched until ${clock(until)} (rate limit).`),`the choice does not say the key is benched: ${choice.slice(-600)}`);
      tui.write(KEYS.down);await tui.until(f=>f.includes('› Paste an API key'),'the pasted key chosen');tui.write(KEYS.enter);
      const step=await tui.until(f=>f.includes(`API key for ${label('openrouter')}:`),'the key step for a provider with no usable key');
      // R0: since `10e25dbb1` (M5-C "surface canonical provider remediation in TUI") the key step shows the control plane's remediation,
      // which now carries the cause, the local time and the remedy (`provider/health.ts`), not the screen's own line.
      assert.ok(step.includes(`The ${label('openrouter')} key is benched until ${clock(until)} (rate limit). Wait until then, or add another key with /provider.`),`the key step says the saved key is benched: ${step.slice(-600)}`);
      tui.write(ESC);
      await tui.until(f=>!f.includes(`API key for ${label('openrouter')}:`),'the provider step closed');

      await tui.typeAndEnter('hello');
      await tui.until(f=>f.includes(`The ${label('openrouter')} key is benched until ${clock(until)} (rate limit), so nothing was sent to ${label('openrouter')}.`),'the refusal naming the benched key');
      assert.equal(tui.starts.length,0,'no run started');
      assert.equal(tui.resumes.length,0,'no run resumed');
      assert.equal(provider.requests.filter(r=>r.method==='POST').length,0,'no request was generated at the provider');
      assert.deepEqual(h.network.blocked,[],'nothing tried to leave the machine');
      assert.equal(context.providerStore.hasKey('openrouter'),true,'the benched key is still stored: nothing was removed');
    }finally{tui.unmount();}
  }finally{await provider.close();}
}));
