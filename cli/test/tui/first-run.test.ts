/*
 * B1 slice 18 — provider first, then model, and a clean first run.
 *
 * Every scenario mounts the REAL TuiApp through Ink into a fake 80-column TTY, over the REAL composition
 * (`composeTalosRuntime` with the kernel's own credential store, registry and probe), in consent mode — the mode
 * `createCliRuntimeContext` gives the interactive screen. What differs from production is only what must: an
 * in-memory keyring, a temporary profile, dummy keys, and a provider on 127.0.0.1.
 * Expected labels and model names are read from the kernel's registry, never typed here.
 */
import {providerLabelText} from '../../src/provider/provider-text.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {closedPort,compact,dummyKey,flat,fakeKeyring,filesContaining,hermetic,KEYS,listFiles,mountTui,REPO_ROOT,settle,startFakeProvider,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';

const registryModule:any=await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','provider-registry.mjs')).href);
const REGISTRY=registryModule.REGISTRO_FORNITORI as Record<string,any>;
/* R2 (D-05): the screen shows the English provider label, mapped by id (provider-text.ts). */
const label=(id:string)=>providerLabelText(id,String(REGISTRY[id].etichetta));
const LIVE=[{id:'vendor/live-model-a',name:'Live Model A',context_length:4096},{id:'vendor/live-model-b:free',name:'Live Model B'}];
/*
 * R0: since `4d053a504` (M5-B "preserve model source and capability provenance") a provider's model list merges the live rows with
 * the registry's known rows, and a list holding any row that is not live is headed NOT VERIFIED (closure `b637d9dc1`: "Configured-only
 * or documented-only extras may remain visible beside live rows, but they make the provider list globally not verified"). What these
 * tests protect is unchanged: the live rows come from the chosen provider, and no known-only row is passed off as live. The screen
 * shows the list with its live count; which rows are live is read from each row's `availabilityVerified`.
 */
/**
 * The end of a finished run on screen: prompt, the answer, and the footer of a finished run. Since `81f639d22` (M6-C) the footer
 * names the run's agent and outcome (`› main · completed · model …`) where it used to say `ready`. R3 (Q-R3-9): the
 * `Run · <outcome>` row that M4-A (`65f10b4e2`) put between prompt and answer is gone; a turn that did not end normally leaves
 * one notice line instead, which this pattern also accepts before the footer. R3 owner decision (one vocabulary after a
 * turn): the footer says `done` / `interrupted` / `failed` like the status row, not the kernel's `completed` / `cancelled`.
 */
/* R5a Q-R5-2 / review D-14: the model is no longer repeated on the roster row; it is named on the status row below it. */
/* UI Phase 0 (owner 27/09): the end of the run is the status row (`✓ done`), the main roster row is gone at idle. */
/* Stage 4: the status row is the mockup's activity line («✓ Done in 2s», «✗ Failed after …», «■ Stopped after …»). */
const END_OF_RUN=(model:string)=>new RegExp(`› hello \\S[\\s\\S]*?[✓■✗] (?:Done|Failed|Stopped)\\b[\\s\\S]*?shift\\+tab[\\s\\S]*?${model}`,'u');
/* stage 7.10: /model is the mockup's sheet («── Model …», the provider's notice above the list); choosing a provider still opens
   the picker of its models until /provider is ported (stage 7.10, next piece) */
const liveCatalog=(provider:string)=>(f:string)=>(f.includes('── Model ')||f.includes(`Model · ${label(provider)} · `))&&flat(f).includes(`Catalog from ${label(provider)}: ${LIVE.length} live-verified;`);
async function assertOnlyLiveRowsVerified(context:any,provider:string){
  const list=await context.tuiCatalog.providerModels(provider);
  assert.deepEqual([...new Set(list.rows.map((row:any)=>row.provider))],[provider],'rows of the chosen provider only');
  assert.deepEqual(list.rows.filter((row:any)=>row.availabilityVerified).map((row:any)=>row.id).sort(),LIVE.map(row=>`${provider}:${row.id}`).sort(),'exactly the live rows are live-verified, each under its own provider');
  return list;
}

async function compose(h:Hermetic,{env,endpoints,keyring=fakeKeyring()}:{env:Record<string,string|undefined>;endpoints:Record<string,string>;keyring?:ReturnType<typeof fakeKeyring>}){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  writeProviderRuntime(h.paths,endpoints);
  const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:'openai:gpt-5-mini',env,environmentKeys:'consent',keyring} as any);
  return{context,keyring};
}
async function chooseRecorded(h:Hermetic,provider:string){
  const {createEnvironmentKeyConsent}=await import('../../src/provider/environment-keys.ts');
  createEnvironmentKeyConsent({dataRoot:h.paths.dataRoot,registry:REGISTRY,env:{}}).chooseProvider(provider);
}

/* P21 (owner decisions 2026-09-26): OpenRouter's key step offers the browser sign-in first; these tests paste a key. */
async function pasteKeyWay(tui:any,id:string){
  if(id!=='openrouter')return;
  await tui.until((f:string)=>f.includes('Sign in with OpenRouter (browser)'),'the sign-in choice');
  tui.write(KEYS.down);
  await tui.until((f:string)=>f.includes('› Paste an API key'),'the pasted key chosen');
  tui.write(KEYS.enter);
}
/* stage 7.10b: /provider is the mockup's sheet; / filters, Enter ends the filter, the next Enter chooses */
async function openProvider(tui:any,id:string){
  await tui.typeAndEnter('/provider');
  await tui.until((f:string)=>/── (?:Models|AI provider) /u.test(f),'the provider sheet');
  tui.write('/');tui.write(id);
  await tui.until((f:string)=>f.includes(`/ ${id}`)&&f.includes(' of '),`the sheet filtered to ${id}`);
  tui.write(KEYS.enter);await tui.until((f:string)=>f.includes('enter use'),'the filter ended');
}

test('first run with provider keys in the environment offers no model and uses no key',async()=>hermetic(async h=>{
  const provider=await startFakeProvider({goodKey:dummyKey('never-used'),models:LIVE});
  const envKeys={OPENROUTER_API_KEY:dummyKey('env-openrouter'),ANTHROPIC_API_KEY:dummyKey('env-anthropic'),OPENAI_API_KEY:dummyKey('env-openai')};
  try{
    const {context}=await compose(h,{env:{...process.env,...envKeys},endpoints:{openrouter:`${provider.url}/api/v1`,openai:`${provider.url}/v1`}});
    for(const id of ['openrouter','anthropic','openai'])assert.equal(context.providerStore.getKey(id),null,`the ${id} environment key must not be usable before it is approved`);
    const tui=await mountTui({context,projectRoot:h.project,paths:h.paths,columns:100/* the mockup draws the model row from 100 columns */});
    try{
      const frame=await tui.until(f=>f.includes(' none · /provider · ctx'),'a footer that offers no model');
      assert.doesNotMatch(frame,/model openai:gpt-5-mini/u,'the built-in default model is not offered on a first run');
      await tui.typeAndEnter('hello');
      await tui.until(f=>f.includes('No provider has been chosen yet, so nothing was sent.'),'the refusal to send');
      assert.equal(tui.starts.length,0,'no run started');
      assert.equal(provider.requests.length,0,'no request reached any provider');
      assert.deepEqual(h.network.blocked,[],'nothing tried to leave the machine');
      assert.deepEqual(h.network.allowedPaths,[],'nothing was fetched from the local provider either');
      for(const value of Object.values(envKeys))assert.equal(compact(tui.frames.join('')).includes(value),false,'no environment key reached the screen');
    }finally{tui.unmount();}
  }finally{await provider.close();}
}));

test('/provider offers the environment key with No preselected, and a No is remembered by keyed hash',async()=>hermetic(async h=>{
  const provider=await startFakeProvider({goodKey:dummyKey('never-used'),models:LIVE});
  const envKey=dummyKey('env-openrouter');
  try{
    const first=await compose(h,{env:{...process.env,OPENROUTER_API_KEY:envKey},endpoints:{openrouter:`${provider.url}/api/v1`}});
    const tui=await mountTui({context:first.context,projectRoot:h.project,paths:h.paths});
    try{
      await openProvider(tui,'openrouter');
      await tui.until(f=>f.includes(label('openrouter'))&&flat(f).includes('key in environment, not used'),'the row that knows the environment key');
      tui.write(KEYS.enter);
      const question=await tui.until(f=>f.includes(`OPENROUTER_API_KEY was found in the environment. Use it for ${label('openrouter')}?`),'the consent question');
      assert.match(question,/› No \(recommended\)/u,'No is preselected');
      /* stage 7.10c: the step is the sheet (its title row), not a boxed window */
      assert.ok(question.includes(`── AI provider ${label('openrouter')}`),`the consent step is not drawn as the sheet: ${question.slice(-800)}`);
      assert.doesNotMatch(question,/› Yes/u,'Yes is not preselected');
      tui.write(KEYS.enter);
      await pasteKeyWay(tui,'openrouter');
      await tui.until(f=>f.includes(`API key for ${label('openrouter')}:`),'the masked key entry after No');
    }finally{tui.unmount();}
    assert.equal(first.context.providerStore.getKey('openrouter'),null,'a No leaves the key unused');
    const recordText=fs.readFileSync(path.join(h.paths.dataRoot,'provider-consent.json'),'utf8');const record=JSON.parse(recordText);
    assert.equal(record.environmentKeys.OPENROUTER_API_KEY.answer,'no');
    // Oracle: the fingerprint is HMAC-SHA256 of the key under the local hash key, recomputed here independently.
    const {createHmac}=await import('node:crypto');
    const hashKey=Buffer.from(fs.readFileSync(path.join(h.paths.dataRoot,'provider-consent.key'),'utf8').trim(),'hex');
    assert.equal(record.environmentKeys.OPENROUTER_API_KEY.fingerprint,`hmac-sha256:${createHmac('sha256',hashKey).update(envKey).digest('hex')}`);
    for(let size=4;size<=envKey.length;size++)assert.equal(recordText.includes(envKey.slice(-size)),false,`the record holds no ${size}-character suffix of the key`);
    assert.deepEqual(filesContaining(h.root,envKey),[],'no file holds the environment key');

    // A new session with the same profile and the same environment: the No is remembered, the question is not asked again.
    const second=await compose(h,{env:{...process.env,OPENROUTER_API_KEY:envKey},endpoints:{openrouter:`${provider.url}/api/v1`}});
    const again=await mountTui({context:second.context,projectRoot:h.project,paths:h.paths});
    try{
      await openProvider(again,'openrouter');
      await again.until(f=>f.includes(label('openrouter'))&&flat(f).includes('environment key declined'),'the row that remembers the No');
      again.write(KEYS.enter);
      await pasteKeyWay(again,'openrouter');
      const entry=await again.until(f=>f.includes(`API key for ${label('openrouter')}:`),'straight to key entry');
      assert.equal(again.frames.some(f=>(f.includes('was found in the environment')&&f.includes('Use it for'))),false,'the question is not asked twice');
      assert.ok(entry);
    }finally{again.unmount();}
    assert.equal(second.context.providerStore.getKey('openrouter'),null);
    assert.equal(provider.requests.length,0);
  }finally{await provider.close();}
}));

test('a wrong key is refused by the test and never saved; a right one is saved and opens the live list',async()=>hermetic(async h=>{
  const goodKey=dummyKey('good');const wrongKey=dummyKey('wrong');
  const provider=await startFakeProvider({goodKey,models:LIVE});
  try{
    const {context,keyring}=await compose(h,{env:{...process.env},endpoints:{openrouter:`${provider.url}/api/v1`}});
    const tui=await mountTui({context,projectRoot:h.project,paths:h.paths});
    try{
      await openProvider(tui,'openrouter');
      tui.write(KEYS.enter);
      await pasteKeyWay(tui,'openrouter');
      await tui.until(f=>f.includes(`API key for ${label('openrouter')}:`),'the masked key entry');
      tui.write(wrongKey);
      await tui.until(f=>f.includes(`API key for ${label('openrouter')}: ${'•'.repeat(wrongKey.length)}`),'the masked wrong key');
      tui.write(KEYS.enter);
      await tui.until(f=>f.includes(`${label('openrouter')} refused the key (HTTP 401). The key was not saved.`),'the refusal');
      assert.equal(keyring.entries.size,0,'nothing reached the keyring');
      assert.equal(context.providerStore.getKey('openrouter'),null,'the store holds no key');
      assert.deepEqual(provider.requests.map(r=>[r.method,r.path,r.authorizedAs]),[['GET','/api/v1/models/user','other']],'one authenticated request, to the provider the key belongs to');

      tui.write(goodKey);
      const retyped=await tui.until(f=>f.includes(`API key for ${label('openrouter')}: ${'•'.repeat(goodKey.length)}`),'the masked good key');
      assert.equal(retyped.includes('The key was not saved.'),false,'the refusal of the previous key does not stay on screen over a new one');
      tui.write(KEYS.enter);
      const live=await tui.until(liveCatalog('openrouter'),'the model list with its live rows');
      assert.ok(tui.frames.some(f=>flat(f).includes(`${label('openrouter')} accepted the key (HTTP 200). Saved to the system keyring.`)),'the acceptance is stated');
      assert.ok([...keyring.entries.values()].includes(goodKey),'the passed key is in the keyring');
      assert.equal(context.providerStore.getKey('openrouter'),goodKey);
      for(const row of LIVE)assert.ok(live.includes(row.name),`live model ${row.name} is listed`);
      await assertOnlyLiveRowsVerified(context,'openrouter');// the known-only models are not passed off as live
      for(const value of [goodKey,wrongKey])assert.equal(compact(tui.frames.join('')).includes(value),false,'no key reaches the screen');
    }finally{tui.unmount();}
  }finally{await provider.close();}
}));

test('/model lists only the chosen provider live, and an unreachable provider shows the known list marked not verified',async()=>hermetic(async h=>{
  const provider=await startFakeProvider({goodKey:dummyKey('unused'),models:LIVE});
  try{
    await chooseRecorded(h,'openrouter');
    const {context}=await compose(h,{env:{...process.env},endpoints:{openrouter:`${provider.url}/api/v1`,openai:`${provider.url}/v1`}});
    await assertOnlyLiveRowsVerified(context,'openrouter');
    const tui=await mountTui({context,projectRoot:h.project,paths:h.paths});
    try{
      await tui.typeAndEnter('/model');
      await tui.until(liveCatalog('openrouter'),'the list with its live rows');
      assert.deepEqual(provider.requests.map(r=>[r.method,r.path,r.hadAuthorization]),[['GET','/api/v1/models',false],['GET','/api/v1/models',false]],'the public list is fetched without sending any key');
    }finally{tui.unmount();}
  }finally{await provider.close();}

  const port=await closedPort();
  const offline=await compose(h,{env:{...process.env},endpoints:{openrouter:`http://127.0.0.1:${port}/api/v1`}});
  const known=REGISTRY.openrouter.modelliDiRiserva.map((row:any)=>`openrouter:${row.id}`).sort();
  const list=await offline.context.tuiCatalog.providerModels('openrouter');
  assert.equal(list.verified,false);
  assert.deepEqual(list.rows.map((row:any)=>row.id).sort(),known,'the known list, from the registry');
  const tui=await mountTui({context:offline.context,projectRoot:h.project,paths:h.paths});
  try{
    await tui.typeAndEnter('/model');
    const frame=await tui.until(f=>f.includes('── Model ')&&flat(f).includes('could not be reached'),'the not-verified list');
    assert.ok(flat(frame).includes(`${label('openrouter')} could not be reached (CATALOG_UNREACHABLE); these are the models TALOS already knows. Not verified.`));
    for(const row of REGISTRY.openrouter.modelliDiRiserva)assert.ok(frame.includes(row.nome),`known model ${row.nome} is shown`);
    assert.ok(frame.includes('not verified'),'rows carry the mark');
  }finally{tui.unmount();}
}));

test('/model with nothing chosen opens /provider first, then that provider\'s models',async()=>hermetic(async h=>{
  const provider=await startFakeProvider({goodKey:dummyKey('unused'),models:LIVE});
  const envKey=dummyKey('env-openrouter');
  try{
    const {context}=await compose(h,{env:{...process.env,OPENROUTER_API_KEY:envKey},endpoints:{openrouter:`${provider.url}/api/v1`}});
    const tui=await mountTui({context,projectRoot:h.project,paths:h.paths});
    try{
      await tui.typeAndEnter('/model');
      const frame=await tui.until(f=>/── (?:Models|AI provider) /u.test(f),'the provider sheet opened by /model');
      assert.equal(/── Model(?!s)/u.test(frame),false,'no model list before a provider is chosen');
      tui.write('/');tui.write('openrouter');await tui.until(f=>f.includes('/ openrouter'),'filtered');
      tui.write(KEYS.enter);await tui.until(f=>f.includes('enter use'),'the filter ended');
      tui.write(KEYS.enter);
      await tui.until(f=>f.includes('› No (recommended)'),'the consent question');
      tui.write(KEYS.down);
      await tui.until(f=>f.includes('› Yes, use it'),'Yes selected');
      tui.write(KEYS.enter);
      await tui.until(liveCatalog('openrouter'),'back to the models of the chosen provider');
      assert.equal(await context.tuiCatalog.chosenProvider(),'openrouter');
      assert.equal(context.providerStore.getKey('openrouter'),envKey,'the approved environment key is now usable');
      assert.equal(JSON.parse(fs.readFileSync(path.join(h.paths.dataRoot,'provider-consent.json'),'utf8')).environmentKeys.OPENROUTER_API_KEY.answer,'yes');
    }finally{tui.unmount();}
  }finally{await provider.close();}
}));

test('sending with a key-less provider names the provider and never makes a request',async()=>hermetic(async h=>{
  const provider=await startFakeProvider({goodKey:dummyKey('unused'),models:LIVE});
  try{
    await chooseRecorded(h,'anthropic');
    // An Anthropic key IS in the environment, but nobody approved it: interactively it does not count.
    const {context}=await compose(h,{env:{...process.env,ANTHROPIC_API_KEY:dummyKey('env-anthropic')},endpoints:{openai:`${provider.url}/v1`}});
    const tui=await mountTui({context,projectRoot:h.project,paths:h.paths,columns:100/* the mockup draws the model row from 100 columns */,model:'anthropic:claude-test-model'});
    try{
      await tui.until(f=>(f.includes(' anthropic:claude-test-model · ')||f.includes(' claude-test-model · anthropic: ')),'the chosen provider\'s model in the footer');
      await tui.typeAndEnter('hello');
      // R0: since `4ba3024a8` (M5-A/M5-C, one provider decision model: "failed auth/health names exact remedy") the send refusal is the
      // control plane's remediation (`provider/health.ts`); R0 fixed its article ("a Anthropic").
      await tui.until(f=>flat(f).includes(`No API key for ${label('anthropic')}. Set ANTHROPIC_API_KEY or run \`talos provider set-key anthropic\`.`) /* R2 (gate E8 / Q-R2-7) */,'the message naming the provider');
      assert.equal(tui.starts.length,0,'no run started');
      assert.equal(tui.resumes.length,0,'no run resumed');
      assert.equal(provider.requests.length,0);
      assert.deepEqual(h.network.blocked,[],'nothing tried to reach a real provider');
      assert.deepEqual(h.network.allowedPaths,[],'nothing was fetched at all');
    }finally{tui.unmount();}
  }finally{await provider.close();}
}));

/*
 * B1 slice 25 — this test used to name slice 18's `RUNTIME_OPENROUTER_KEY_REQUIRED` gate: the session registry refused any session
 * without an OpenRouter key. The kernel now asks the composition whether the session's own model is usable (`prontoFn`, CLI-REQ-05),
 * so a DeepSeek key alone is enough, and OpenRouter receives nothing at all.
 */
test('a provider other than OpenRouter: its key goes only to it, and a DeepSeek key alone is enough to send',async()=>hermetic(async h=>{
  const deepseekKey=dummyKey('deepseek');
  const deepseek=await startFakeProvider({goodKey:deepseekKey,models:LIVE});const openrouter=await startFakeProvider({goodKey:dummyKey('openrouter-unused'),models:LIVE});
  try{
    const {context,keyring}=await compose(h,{env:{...process.env},endpoints:{deepseek:deepseek.url,openrouter:`${openrouter.url}/api/v1`}});
    const tui=await mountTui({context,projectRoot:h.project,paths:h.paths,columns:100/* the mockup draws the model row from 100 columns */});
    try{
      await openProvider(tui,'deepseek');tui.write(KEYS.enter);
      await tui.until(f=>f.includes(`API key for ${label('deepseek')}:`),'deepseek key entry');tui.write(deepseekKey);await tui.until(f=>f.includes('•'.repeat(deepseekKey.length)),'deepseek masked key');tui.write(KEYS.enter);
      await tui.until(liveCatalog('deepseek'),'deepseek list with its live rows');
      tui.write(KEYS.enter);await tui.until(f=>f.includes('Model changed to deepseek:'),'a deepseek model chosen');
      assert.equal(context.providerStore.getKey('openrouter'),null,'there is no OpenRouter key at all');
      await tui.typeAndEnter('hello');
      await tui.until(()=>deepseek.requests.some(r=>r.method==='POST'),'the DeepSeek request',30000);
      await tui.until(f=>END_OF_RUN('deepseek:').test(flat(f)),'the end of the run',30000);
      assert.equal(tui.starts.length,1,'the run started');
      assert.equal(tui.frames.some(f=>flat(f).includes('refuses to start any session without')),false,'no OpenRouter gate was named');
    }finally{tui.unmount();}
    assert.deepEqual(deepseek.requests.filter(r=>r.method==='POST').map(r=>r.authorizedAs),['good'],'the DeepSeek key went to DeepSeek');
    assert.equal(openrouter.requests.length,0,'OpenRouter received nothing at all');
    assert.equal(deepseek.requests.some(r=>r.authorizedAs==='other'),false,'no foreign key reached DeepSeek');
    assert.deepEqual([...keyring.entries.values()].filter(v=>v===deepseekKey),[deepseekKey],'the DeepSeek key was saved');
    assert.deepEqual(h.network.blocked,[]);
  }finally{await deepseek.close();await openrouter.close();}
}));

async function plantedKeyRun({revokedForChat,echoAuthorizationOnFailure}:{revokedForChat:boolean;echoAuthorizationOnFailure:boolean}){return hermetic(async h=>{
  const planted=dummyKey('planted');
  const provider=await startFakeProvider({goodKey:planted,models:LIVE,revokedForChat,echoAuthorizationOnFailure});
  try{
    const {context,keyring}=await compose(h,{env:{...process.env},endpoints:{openrouter:`${provider.url}/api/v1`}});
    const tui=await mountTui({context,projectRoot:h.project,paths:h.paths,columns:100/* the mockup draws the model row from 100 columns */});
    let sessionId:string|null=null;
    try{
      await openProvider(tui,'openrouter');
      tui.write(KEYS.enter);
      await pasteKeyWay(tui,'openrouter');
      await tui.until(f=>f.includes(`API key for ${label('openrouter')}:`),'key entry');
      tui.write(planted);
      await tui.until(f=>f.includes('•'.repeat(planted.length)),'the masked planted key');
      tui.write(KEYS.enter);
      await tui.until(liveCatalog('openrouter'),'the list with its live rows after saving');
      tui.write(KEYS.enter);
      await tui.until(f=>f.includes(`Model changed to openrouter:`),'a model chosen from the live list');
      await tui.typeAndEnter('hello');
      await tui.until(()=>tui.starts.length===1,'the run to start');
      await tui.until(()=>provider.requests.some(r=>r.method==='POST'),'the request to the provider',30000);
      // The run has ended when the footer is ready again and something was written after the prompt.
      await tui.until(f=>END_OF_RUN('').test(flat(f)),'the end of the run',30000);
      /* 0.6.13 (review 7 F6): the fake model's 4.1k window is smaller than TALOS's tools, so the warning that it does not fit sits
         between the prompt and the answer */
      if(!revokedForChat)assert.match(flat(tui.last()),/› hello (?:This model’s window .*? \(\/model\)\. )?OK ✓ Done/u,'the answer arrived');
      await new Promise(resolve=>setTimeout(resolve,500));
      sessionId=(await context.runtime.listSessions()).at(-1)?.sessionId??null;
    }finally{tui.unmount();}
    await settle(h.root);// the session's tail is written after the answer is on screen
    assert.deepEqual(h.network.blocked,[],'nothing tried to reach a real provider');
    assert.ok(provider.requests.some(r=>r.method==='POST'&&r.path.endsWith('/chat/completions')&&r.authorizedAs==='good'),'the planted key really travelled to the provider it belongs to');
    assert.ok([...keyring.entries.values()].includes(planted),'the key was stored where it belongs: the keyring');
    const transcript=compact(tui.frames.join(''));
    assert.equal(transcript.includes(planted),false,'transcript');
    if(sessionId){const exported=JSON.stringify(context.runtime.export(sessionId));assert.equal(exported.includes(planted),false,'session export');}
    const files=listFiles(h.root);
    assert.ok(files.some(file=>file.includes('sessions')),`a session file was written (files: ${files.join(', ')})`);
    const sessionText=files.filter(file=>file.includes('sessions')).map(file=>fs.readFileSync(path.join(h.root,file),'utf8')).join('');
    assert.ok(/"type":"(RunFinished|RunError)"/u.test(sessionText),'the scanned session file is complete: it holds the end of the run');
    assert.deepEqual(filesContaining(h.root,planted),[],'no file under the profile or the project holds the key');
    return{files,transcript:tui.frames.at(-1)??''};
  }finally{await provider.close();}
});}

test('a planted key is absent from the transcript, the session file, the logs and the error text',async()=>{
  await plantedKeyRun({revokedForChat:false,echoAuthorizationOnFailure:false});
  // The error text: the provider refuses the saved key when the run starts, as a revoked key would be refused.
  await plantedKeyRun({revokedForChat:true,echoAuthorizationOnFailure:false});
  // And a provider that echoes the Authorization header back in its error body.
  await plantedKeyRun({revokedForChat:true,echoAuthorizationOnFailure:true});
});

test('stage 7.10b /provider: k takes a pasted key into the masked row; the provider accepts it, it is saved and never shown',async()=>hermetic(async h=>{
  const goodKey=dummyKey('pasted-good');
  const provider=await startFakeProvider({goodKey,models:LIVE});
  try{
    const {context,keyring}=await compose(h,{env:{...process.env},endpoints:{openrouter:`${provider.url}/api/v1`}});
    const tui=await mountTui({context,projectRoot:h.project,paths:h.paths});
    try{
      await openProvider(tui,'openrouter');
      tui.write('k');
      await tui.until(f=>f.includes(`API key for ${label('openrouter')}:`),'the masked key row');
      tui.write(`\x1b[200~${goodKey}\x1b[201~`);
      await tui.until(f=>f.includes('•'.repeat(goodKey.length)),'the pasted key as dots');
      assert.equal(tui.frames.some(f=>f.includes(goodKey)),false,'the key is never on screen');
      tui.write(KEYS.enter);
      await tui.until(f=>f.includes(`Key stored for ${label('openrouter')}`),'the key saved');
      assert.ok([...keyring.entries.values()].includes(goodKey),'in the keyring');
      assert.equal(tui.frames.some(f=>f.includes(goodKey)),false,'never on screen, not even after');
      await tui.until(f=>/── (?:Models|AI provider) /u.test(f)&&f.includes('key set'),'the sheet again, the key set');
    }finally{tui.unmount();}
  }finally{await provider.close();}
}));

/* Owner 11/10/2026: «dalla cli non si può rifare login se c'è una chiave e non si può cancellare». A provider with a key in use went
   straight to its models; now Enter offers: use it (preselected), sign in again, remove it. */
async function savedKeyActions(h:Hermetic,run:(tui:any,context:any,goodKey:string)=>Promise<void>){
  const goodKey=dummyKey('saved-openrouter');
  const provider=await startFakeProvider({goodKey,models:LIVE});
  try{
    const {context}=await compose(h,{env:{...process.env},endpoints:{openrouter:`${provider.url}/api/v1`}});
    assert.equal((await context.tuiCatalog.setProviderKey('openrouter',goodKey)).saved,true,'a key is saved before the screen opens');
    const tui=await mountTui({context,projectRoot:h.project,paths:h.paths});
    try{
      await openProvider(tui,'openrouter');
      tui.write(KEYS.enter);
      const frame=await tui.until(f=>f.includes('› Use it')&&f.includes('Remove it'),'the saved-key choices');
      assert.ok(frame.includes('Sign in again with OpenRouter (browser or a new key)'));
      await run(tui,context,goodKey);
    }finally{tui.unmount();}
  }finally{await provider.close();}
}
test('a saved key: Enter twice uses it, as before',async()=>hermetic(async h=>savedKeyActions(h,async(tui,context)=>{
  tui.write(KEYS.enter);
  await tui.until(liveCatalog('openrouter'),'the models of the provider');
  assert.equal(await context.tuiCatalog.chosenProvider(),'openrouter');
})));
test('a saved key: "sign in again" opens the sign-in choice (browser or a new key)',async()=>hermetic(async h=>savedKeyActions(h,async(tui,context,goodKey)=>{
  tui.write(KEYS.down);
  await tui.until(f=>f.includes('› Sign in again with OpenRouter'),'sign in again selected');
  tui.write(KEYS.enter);
  await tui.until(f=>f.includes('Sign in with OpenRouter (browser)')&&f.includes('Paste an API key'),'the sign-in choice');
  assert.equal(context.providerStore.getKey('openrouter'),goodKey,'nothing is removed by asking to sign in again');
})));
test('a saved key: "remove it" removes it and says so',async()=>hermetic(async h=>savedKeyActions(h,async(tui,context)=>{
  tui.write(KEYS.down);tui.write(KEYS.down);
  await tui.until(f=>f.includes('› Remove it'),'remove selected');
  tui.write(KEYS.enter);
  await tui.until(f=>f.includes('The key for OpenRouter was removed.'),'the removal is stated');
  assert.equal(context.providerStore.getKey('openrouter'),null,'the store holds no key');
})));
