/*
 * B1 slice 18 — the small pieces of the provider-first flow, each checked on its own.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {slashCommandIntent} from '../../src/tui/app.ts';
import {completeSlashCommand,parseSlashCommand,SLASH_COMMANDS} from '../../src/tui/slash-commands.ts';
import {consentQuestion,providerKeySourceLabel,providerPickerEnter} from '../../src/tui/overlays/provider-picker.ts';
import {createTuiSessionController,TuiNotReadyError} from '../../src/tui/session-controller.ts';

test('/provider is a registered slash command that opens the provider overlay',()=>{
  assert.ok(SLASH_COMMANDS.some(row=>row.name==='provider'));
  assert.deepEqual(parseSlashCommand('/provider'),{name:'provider',args:[],suggestions:[]});
  assert.deepEqual(slashCommandIntent('/provider'),{kind:'open-overlay',overlay:{kind:'provider'}});
  assert.ok(completeSlashCommand('/pro').includes('/provider'));
});

test('choosing a provider: usable key goes to models, an unanswered environment key asks, anything else asks for a key',()=>{
  assert.deepEqual(providerPickerEnter({selectedProvider:'openai',configured:true,keySource:'saved'}),{kind:'open-model-picker',provider:'openai'});
  assert.deepEqual(providerPickerEnter({selectedProvider:'openai',configured:false,keySource:'environment-unanswered'}),{kind:'environment-consent',provider:'openai'});
  assert.deepEqual(providerPickerEnter({selectedProvider:'openai',configured:false,keySource:'environment-declined'}),{kind:'provider-setup',provider:'openai'});
  assert.deepEqual(providerPickerEnter({selectedProvider:'openai',configured:false,keySource:'missing'}),{kind:'provider-setup',provider:'openai'});
  const asked=consentQuestion({label:'OpenAI',environmentVariable:'OPENAI_API_KEY'});
  assert.equal(asked.options[0]?.choice,'no','No comes first');
  assert.equal(asked.options[0]?.label,'No (recommended)');
  assert.equal(providerKeySourceLabel({keySource:'environment-unanswered',environmentVariable:'OPENAI_API_KEY'}),'key in environment, not used');
});

test('a send that is not ready never starts or resumes a run, and says why',async()=>{
  const calls:string[]=[];
  const runtime:any={start:async()=>{calls.push('start');return's1';},resume:async()=>{calls.push('resume');return's1';},subscribe:()=>()=>{},restore:async()=>({}),answerApproval:async()=>{},cancel:async()=>{},close:async()=>{}};
  const message='The Anthropic key is missing, so nothing was sent to Anthropic. Add it with /provider.';
  const controller=createTuiSessionController({runtime,projectRoot:process.cwd(),model:'anthropic:x',mode:'default',rules:{allow:[],ask:[],deny:[]},readiness:async()=>({ready:false,code:'PROVIDER_KEY_MISSING',provider:'anthropic',message}),onEvent:()=>{}});
  await assert.rejects(controller.send('hello',{model:'anthropic:x',running:false}),(error:any)=>error instanceof TuiNotReadyError&&error.code==='PROVIDER_KEY_MISSING'&&error.provider==='anthropic'&&error.message===message);
  await assert.rejects(controller.initialize({initialPrompt:'hello'}),{code:'PROVIDER_KEY_MISSING'});
  assert.deepEqual(calls,[]);
  // A `!` command is not a message to a provider: it is not held back by the provider check.
  await assert.rejects(controller.send('!git status',{model:'anthropic:x',running:false}),/session/iu);
});

/*
 * B1 slice 18, fix round — condition 4. `resumeSession`/`forkSession` with a prompt are a send: they ask readiness first, and a
 * not-ready answer reaches no runtime method at all (not even the session list or a subscription).
 */
test('resume and fork with a prompt ask readiness like a send, and a not-ready answer never reaches the runtime',async()=>{
  const calls:string[]=[];
  const record=(name:string,value:unknown)=>async(..._args:unknown[])=>{calls.push(name);return value;};
  const runtime:any={start:record('start','s9'),resume:record('resume','s1'),fork:record('fork','s2'),restore:record('restore',{}),listSessions:record('listSessions',[{sessionId:'s1'}]),subscribe:(..._args:unknown[])=>{calls.push('subscribe');return()=>{};},answerApproval:record('answerApproval',undefined),cancel:record('cancel',undefined),close:record('close',undefined),shell:record('shell',undefined),compact:record('compact',{})};
  const message='The Anthropic key is missing, so nothing was sent to Anthropic. Add it with /provider.';
  const controller=createTuiSessionController({runtime,projectRoot:process.cwd(),model:'anthropic:x',mode:'default',rules:{allow:[],ask:[],deny:[]},readiness:async()=>({ready:false,code:'PROVIDER_KEY_MISSING',provider:'anthropic',message}),onEvent:()=>{}});
  for(const id of ['s1','last']){
    await assert.rejects(controller.resumeSession(id,'hello'),(error:any)=>error instanceof TuiNotReadyError&&error.code==='PROVIDER_KEY_MISSING'&&error.provider==='anthropic'&&error.message===message,`resume ${id}`);
    await assert.rejects(controller.forkSession(id,'hello'),(error:any)=>error instanceof TuiNotReadyError&&error.code==='PROVIDER_KEY_MISSING'&&error.message===message,`fork ${id}`);
  }
  assert.deepEqual(calls,[],'no runtime method was called');
  // Without a prompt nothing is sent, so attaching and forking stay available to a person who has no key yet.
  assert.equal(await controller.resumeSession('s1'),'s1');
  assert.equal(await controller.forkSession('s1'),'s2');
  /* riga 224 (T4, return): each attach reads the session list once, to count the conversation's agents still at work: a read, never a send */
  assert.deepEqual(calls.filter(name=>name!=='listSessions'),['subscribe','fork','subscribe']);
  assert.deepEqual(calls,['subscribe','listSessions','fork','subscribe','listSessions']);
});
