/*
 * Stage 3 (owner decision 01/10, «-p senza l'attrezzo, come Claude Code»; registro 12): only a screen with a person offers
 * the model `ask_user_question`. Before, `talos -p` offered it and the kernel waited for an answer nobody could give (the CLI
 * had no reference to the question at all) — the run hung. The ENTRY decides, as for environment keys (B1 slice 18): the
 * composition gets `askPerson`, and a caller that forgets gets the closed behaviour. The list comes from the kernel
 * (`STRUMENTI_ESTESI_PREDEFINITI`), never copied by hand; every other tool stays offered.
 * Real composition, real kernel registry, hermetic profile (first-run-fixture.ts).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {fakeKeyring,hermetic,REPO_ROOT,settle,writeProviderRuntime} from '../provider/first-run-fixture.ts';

async function offeredTools(_t:any,askPerson:boolean|undefined){
  return await hermetic(async h=>{
    writeProviderRuntime(h.paths,{});
    const {composeTalosRuntime,loadModules}=await import('../../src/runtime/talos-composition.ts');
    const real:any=await loadModules(REPO_ROOT);
    let seen:any=null;
    const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:'openai:gpt-5-mini',env:{...process.env},environmentKeys:'consent',keyring:fakeKeyring(),
      ...(askPerson===undefined?{}:{askPerson}),modules:{...real,createSessionRegistry:(options:any)=>{seen=options;return real.createSessionRegistry(options);}}} as any);
    try{return{offered:(seen?.strumentiEstesi??real.STRUMENTI_ESTESI_PREDEFINITI) as readonly string[],all:real.STRUMENTI_ESTESI_PREDEFINITI as readonly string[],childQuestions:seen?.domandeDeiFigli===true};}
    finally{await context.runtime?.close?.();await settle(h.root);}
  });
}

test('without a person (talos -p, one-shot commands) the model is never offered ask_user_question; everything else stays',async t=>{
  const {offered,all}=await offeredTools(t,false);
  assert.equal(offered.includes('ask_user_question'),false);
  assert.equal((await offeredTools(t,false)).childQuestions,false,'stage 6b: no person, no sub-agent questions either');
  /* Owner 09/10/2026 («Sì, con la carta»): changing the excluded providers waits for a card, so without a person they are left out too; the list stays. */
  /* 0.6.6 (seventh review, S2): the goal tools are never offered by the CLI (no goal surface yet), with or without a person */
  /* 0.6.11: undoing file changes and the phone tools are not offered either (owner 20/10 «Non ancora»; no phone host in the CLI) */
  /* 0.6.14 (r4 integra/2026-10-25): remote control, the device folders and sending a file to a device are not offered either (no device host in the CLI) */
  /* 0.6.15 T6: offered with a person now, never without one (their cards need someone in front) */
  const leftOut=new Set(['ask_user_question','provider_exclude','provider_allow','goal_status','goal_create','goal_update','file_changes_undo','remote_phones','remote_phone_pair','remote_phone_revoke',
    'remote_control','remote_phone_folders','remote_phone_folder_allow','remote_phone_folder_revoke','remote_phone_folder_unblock','remote_device_send_file','local_model_window',
    /* 03/11/2026: the research card is the person's in every mode (4a174fd62), so without a person research_start is left out; local_model is
       the desktop's engine, not the CLI's (10b0d05d6, talos-composition.ts NOT_IN_THE_CLI) */
    'research_start','local_model']);
  assert.deepEqual([...offered],all.filter(name=>!leftOut.has(name)),'only the tools that need a person are left out');
  assert.ok(offered.includes('present_plan'));
  if(all.includes('provider_exclusions_list'))assert.ok(offered.includes('provider_exclusions_list'),'the list of excluded providers stays');
});

test('a caller that forgets to say gets the closed behaviour',async t=>{
  const {offered,childQuestions}=await offeredTools(t,undefined);
  assert.equal(offered.includes('ask_user_question'),false);
  assert.equal(childQuestions,false);
});

test('with a person on the screen the kernel\'s own list, question tool included',async t=>{
  const {offered,all,childQuestions}=await offeredTools(t,true);
  assert.ok(offered.includes('ask_user_question'));
  assert.equal(childQuestions,true,'stage 6b: with a person on the screen the sub-agents may ask too (the host shows them)');
  /* 0.6.15 T6 (owner «come nel desktop»): with a person, the devices' tools are offered (the window gives the registry its remote
     coordinator), `remote_phone_pair` included now that the window opens the QR in its `/remote` card (T4) */
  /* r4 c5ce4e453: local_model_window is not offered by the CLI either (talos-composition.ts NOT_IN_THE_CLI) */
  const goals=new Set(['goal_status','goal_create','goal_update','file_changes_undo','local_model_window','local_model']);/* local_model: 10b0d05d6 (03/11/2026) */
  for(const tool of ['remote_phones','remote_phone_pair','remote_phone_revoke','remote_control','remote_phone_folders','remote_phone_folder_allow','remote_phone_folder_revoke','remote_phone_folder_unblock','remote_device_send_file'])
    if(all.includes(tool))assert.ok(offered.includes(tool),`${tool} is offered with a person`);
  /* 0.6.14: artifact_update IS offered (owner 24/10/2026: the model updates an artifact as a new version of the same Library entry) */
  assert.ok(offered.includes('artifact_update'),'the CLI offers artifact_update');
  assert.ok(all.some(name=>goals.has(name)),'the kernel declares the goal tools (r4 2bd1b3e27)');
  assert.deepEqual([...offered],all.filter(name=>!goals.has(name)),'the kernel’s own list, less the goal tools the CLI has no surface for');
});

/* The entry's word reaches the composition: `person:'present'` from create-runtime turns into `askPerson`, observed on the
 * registry's own list of offered tools (`elencaAttrezziPredefiniti`, what the «+» sheet reads), not on a spy. */
async function offeredByEntry(person:'present'|'absent'|undefined){
  return await hermetic(async h=>{
    writeProviderRuntime(h.paths,{});
    const {createCliRuntimeContext}=await import('../../src/runtime/create-runtime.ts');
    const context:any=await createCliRuntimeContext({projectRoot:h.project,paths:h.paths,repoRoot:REPO_ROOT,model:'openai:gpt-5-mini',trustVerified:true,environmentKeys:'consent',keyring:fakeKeyring(),...(person===undefined?{}:{person})} as any);
    try{const list=await context.registry.elencaAttrezziPredefiniti();return (list.attrezzi??[]).map((a:any)=>a.nome) as string[];}
    finally{await context.runtime?.close?.();await settle(h.root);}
  });
}

test('create-runtime: person present offers the question tool, absent or unsaid does not',async()=>{
  const present=await offeredByEntry('present');
  assert.ok(present.includes('present_plan'),'the list is observed (kernel attached)');
  assert.ok(present.includes('ask_user_question'));
  assert.equal((await offeredByEntry('absent')).includes('ask_user_question'),false);
  assert.equal((await offeredByEntry(undefined)).includes('ask_user_question'),false);
});

test('a kernel without its tool list refuses to start without a person, never offers the question to nobody',async()=>hermetic(async h=>{
  writeProviderRuntime(h.paths,{});
  const {composeTalosRuntime,loadModules}=await import('../../src/runtime/talos-composition.ts');
  const real:any=await loadModules(REPO_ROOT);
  let created=false;
  const modules={...real,STRUMENTI_ESTESI_PREDEFINITI:undefined,createSessionRegistry:(options:any)=>{created=true;return real.createSessionRegistry(options);}};
  await assert.rejects(composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:'openai:gpt-5-mini',env:{...process.env},environmentKeys:'consent',keyring:fakeKeyring(),askPerson:false,modules} as any),
    (error:any)=>error?.code==='KERNEL_TOOL_LIST_UNAVAILABLE');
  assert.equal(created,false,'no registry is created with the question tool offered');
  await settle(h.root);
}));
