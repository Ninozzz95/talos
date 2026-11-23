/*
 * Owner 27/10/2026, settings snapshot against the REAL kernel (Desktop f573cdc93 in the block 11 candidate): a change saved through
 * the registry's `aggiornaImpostazioni(id, patch, {origine})` reaches the CLI's v2 bridge as `session.settings.changed`, with the
 * model, the reasoning, the device it came from and a version that grows; a rename is `reason:'name'`.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {createV2EventBridge} from '../../../src/protocol/v2/events.ts';
import {REPO_ROOT} from '../../provider/first-run-fixture.ts';

const kernel=(file:string)=>import(pathToFileURL(join(REPO_ROOT,'harness-ui','src',file)).href);
const settle=()=>new Promise(r=>setTimeout(r,30));

test('the real registry\'s settings change becomes session.settings.changed in the CLI, from the device, version growing',async t=>{
  const {createSessionRegistry}=await kernel('session-registry.mjs');
  const dir=mkdtempSync(join(tmpdir(),'talos-snapshot-'));
  const runs:any[]=[];
  const registry:any=createSessionRegistry({
    avviaSessioneFn:async(input:any)=>{let done:any;const end=new Promise(ok=>{done=ok;});runs.push({input,done});input.onEvento({type:'RunStarted',threadId:'t1',runId:`r${runs.length}`});return end;},
    modello:'openai:gpt-5-mini',chiave:'k',preparaEsecuzioneFn:(taskId:string)=>({cartella:dir,comandoProva:'npm test',task:{id:taskId,consegna:'c'}}),
  });
  if(typeof registry.impostazioniCorrenti!=='function'){t.skip('kernel without the settings snapshot');rmSync(dir,{recursive:true,force:true});return;}
  registry.avvia('task-snapshot',{});
  try{
    const sessionId=(registry.elenca?.()??[])[0]?.sessionId;
    assert.ok(sessionId,'a session');
    runs[0].input.onEvento({type:'RunFinished',threadId:'t1',runId:'r1'});runs[0].done({ok:true});await settle();
    const seen:any[]=[];
    const off=registry.iscriviti(sessionId,(e:any)=>{if(e?.type==='CUSTOM'&&e?.name==='talos.impostazioni-sessione')seen.push(e);},0);
    const answer=await registry.aggiornaImpostazioni(sessionId,{modello:'openai:gpt-5',reasoning:{effort:'high'}},{origine:{tipo:'dispositivo',dispositivoId:'p1'}});
    assert.equal(answer?.ok,true,JSON.stringify(answer));
    await settle();
    const bridge=createV2EventBridge(sessionId,()=>'2026-10-27T15:00:00.000Z');
    const live=seen.map(e=>bridge.translate(e)).filter(Boolean) as any[];
    const changed=live.filter(e=>e.type==='session.settings.changed');
    assert.equal(changed.length,1,JSON.stringify(seen.map(e=>e.value?.motivo)));
    const first=changed[0].data;
    assert.equal(first.model,'openai:gpt-5');
    assert.equal(first.reasoningEffort,'high');
    assert.deepEqual(first.origin,{kind:'device',deviceId:'p1'});
    assert.equal(first.reason,'settings');
    assert.equal(first.version,registry.impostazioniCorrenti(sessionId).versione,'the event carries the snapshot the registry holds');
    assert.equal(typeof registry.rinomina,'function','the registry renames');
    {
      await registry.rinomina(sessionId,'Renamed from the PC');await settle();
      const renamed=seen.map(e=>bridge.translate(e)).filter((e:any)=>e?.type==='session.settings.changed').at(-1) as any;
      assert.equal(renamed.data.reason,'name');
      assert.equal(renamed.data.name,'Renamed from the PC');
      assert.ok(renamed.data.version>first.version,'the version grows');
    }
    off?.();
  }finally{runs.forEach((r,k)=>{try{r.done({ok:true});}catch{}void k;});await settle();rmSync(dir,{recursive:true,force:true});}
});

/* Desktop block 11 in r4 6a4fc5e2b: every snapshot carries `origine` (pc | dispositivo | modello). A change the model asked for is
   its own kind in v2 and on the screen's events, never «this computer»; today the kernel sends it only with the plan the model
   asked for, which stays session.mode.changed with reason model-requested and the snapshot's version. */
const custom=(motivo:string,origine:Record<string,unknown>,over:Record<string,unknown>={})=>({type:'CUSTOM',name:'talos.impostazioni-sessione',_sequenza:1,
  value:{motivo,origine,modalitaOperativa:'normale',permessi:'On request',istantanea:{modello:'openai:gpt-5',reasoning:{effort:'low'},nome:'Fix',versione:7},...over}});

test('origine «modello» is the model in v2, never this computer; pc and device keep their kinds',async()=>{
  const {createTuiEventAdapter}=await import('../../../src/tui/event-adapter.ts');
  const kinds=(origine:Record<string,unknown>)=>{
    const v2=createV2EventBridge('s-1',()=>'2026-10-27T18:00:00.000Z').translate(custom('impostazioni',origine)) as any;
    const tui=createTuiEventAdapter();tui.bindSession('s-1');
    const screen=tui.translateAll(custom('impostazioni',origine)).find((e:any)=>e.type==='session.settings.changed') as any;
    return[v2.type,v2.data.origin,screen?.origin];
  };
  assert.deepEqual(kinds({tipo:'modello'}),['session.settings.changed',{kind:'model'},{kind:'model'}]);
  assert.deepEqual(kinds({tipo:'pc'}),['session.settings.changed',{kind:'computer'},{kind:'computer'}]);
  assert.deepEqual(kinds({tipo:'dispositivo',dispositivoId:'pad'}),['session.settings.changed',{kind:'device',deviceId:'pad'},{kind:'device',deviceId:'pad'}]);
});

test('the plan the model asks for (the kernel\'s only «modello» origin today) is session.mode.changed, model-requested, with the version',async()=>{
  const source=(await import('node:fs')).readFileSync(join(REPO_ROOT,'harness-ui','src','session-registry.mjs'),'utf8');
  assert.match(source,/motivo: 'piano-richiesto-dal-modello', origine: \{ tipo: 'modello' \}/u,'the kernel still pairs them');
  const event=createV2EventBridge('s-1',()=>'2026-10-27T18:00:00.000Z').translate(custom('piano-richiesto-dal-modello',{tipo:'modello'},{modalitaOperativa:'piano'})) as any;
  assert.equal(event.type,'session.mode.changed');
  assert.deepEqual(event.data,{mode:'plan',reason:'model-requested',version:7});
});
