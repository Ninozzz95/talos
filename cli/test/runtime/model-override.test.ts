import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';
import {createRuntimeSupervisor} from '../../src/runtime/supervisor.ts';
import {createDeferredRuntimeContext} from '../../src/runtime/deferred-context.ts';

/*
 * RICERCA 5×5×5×5 cambio-modello (2026-10-05, dossier §5) — il difetto #2:
 * `resume`/`fork` del facade usano SOLO il modello salvato della sessione
 * (`sessionModel(sessionId)` = `row?.modello`); il `--model` dato a riga di
 * comando non viaggia e muore in main.ts. Contratto §5.1-5.3: options-bag
 * `{model}` su resume/fork; l'override SI PERSISTE sul canale già sanzionato
 * `registry.aggiornaImpostazioni(id,{modello})` (chiave ammessa a
 * session-registry.mjs:7882, record durevole `impostazioni-sessione`
 * :7936-7938); il resume usa `voceEsistente.modello` (session-registry.mjs:7853),
 * quindi persistere PRIMA basta a far partire il giro col modello nuovo.
 * Precedenza (§5.2, come Codex `ResumeModelSettings` e Claude Code doc :141):
 * `--model` esplicito > modello salvato della sessione > default del facade.
 */

type Registrato={id:string;prompt:string|null|undefined;images:unknown[]};
const image={kind:'image',path:'image.png',mimeType:'image/png',bytes:8,dataBase64:'iVBORw0KGgo='} as const;
function fixture(opzioni:{rowModel?:string;updatesEsito?:(id:string,patch:any)=>any;capability?:(model:string)=>boolean|null}|{}={}){
  const opz=opzioni as {rowModel?:string;updatesEsito?:(id:string,patch:any)=>any;capability?:(model:string)=>boolean|null};
  const resumes:Registrato[]=[];const forkCalls:any[][]=[];const updates:any[]=[];
  const capabilityCalls:string[]=[];const queued:any[]=[];
  const registry:any={
    ripristina:async()=>({ripristinate:0,totali:0}),
    avviaLibero:(input:any)=>({sessionId:'s-nuova',modello:input?.modello}),
    resume:(id:string,prompt:string|null|undefined,images:unknown[])=>{resumes.push({id,prompt,images});return{sessionId:id};},
    forka:(...args:any[])=>{forkCalls.push(args);return{sessionId:'s-fork'};},
    accodaMessaggio:(id:string,prompt:string,images:unknown[])=>{queued.push({id,prompt,images});return{ok:true,coda:{items:[]}};},
    aggiornaImpostazioni:(id:string,patch:any)=>{updates.push({id,patch});return opz.updatesEsito?opz.updatesEsito(id,patch):{ok:true};},
    iscriviti:()=>()=>{},rispondiApprovazione:()=>({ok:true}),ferma:()=>true,
    esporta:(id:string)=>({sessionId:id,eventi:[]}),
    elenca:()=>[{sessionId:'s1',...(opz.rowModel===undefined?{}:{modello:opz.rowModel})}],
  };
  const runtime=createSessionFacade(registry,{
    model:'facade:default',
    modelImageCapability:async(model:string)=>{capabilityCalls.push(model);return opz.capability?opz.capability(model):true;},
    materializeImage:async()=>({}),
  });
  return{runtime,resumes,forkCalls,updates,capabilityCalls,queued,registry};
}

test('override su resume: il modello esplicito si persiste via aggiornaImpostazioni e governa il giro',async()=>{
  const f=fixture({rowModel:'vecchio:m'});
  await f.runtime.resume('s1','vai',[image],{model:'nuovo:m'});
  assert.deepEqual(f.updates,[{id:'s1',patch:{modello:'nuovo:m'}}],'l\u2019override si persiste sul canale sanzionato (dossier §5.3)');
  assert.deepEqual(f.resumes.map((r)=>({id:r.id,prompt:r.prompt})),[{id:'s1',prompt:'vai'}],'il resume parte comunque, stessa sessione');
  assert.deepEqual(f.capabilityCalls,['nuovo:m'],'prepare valuta la capability col modello NUOVO, non con quello salvato');
});

/* 0.6.7 (sixth review of 0.6.6, N1): taking the lease can reload the session from disk; a model another TALOS saved meanwhile is
   the one --model is compared with, or `--model <the old one>` saved nothing and the turn ran on the other TALOS's model */
test('override su resume: il confronto col modello salvato avviene DOPO aver preso l’affitto (che può ricaricare dal disco)',async()=>{
  const f=fixture({rowModel:'vecchio:m'});
  let row:any={sessionId:'s1',modello:'vecchio:m'};
  f.registry.elenca=()=>[row];
  f.registry.allineaSessione=async()=>{row={...row,modello:'altro:m'};return{stato:'mio'};};
  await f.runtime.resume('s1','vai',undefined,{model:'vecchio:m'});
  assert.deepEqual(f.updates,[{id:'s1',patch:{modello:'vecchio:m'}}],'il modello chiesto vince su quello appena scritto da un altro TALOS');
});

test('senza override: nessuna persistenza, il modello salvato della sessione resta la precedenza',async()=>{
  const f=fixture({rowModel:'vecchio:m'});
  await f.runtime.resume('s1','vai',[image]);
  assert.deepEqual(f.updates,[],'nessun tocco alle impostazioni quando il flag non c\u2019è');
  assert.deepEqual(f.capabilityCalls,['vecchio:m'],'senza flag vale il modello salvato della sessione');
  assert.equal(f.resumes.length,1);
});

test('persistenza rifiutata: il codice del kernel passa intatto (erroreAvvio), un no secco è SESSION_SETTINGS_FAILED',async()=>{
  const rif=fixture({rowModel:'vecchio:m',updatesEsito:()=>({erroreAvvio:'il kernel lo rifiuta',code:'KERNEL_NO'})});
  await assert.rejects(rif.runtime.resume('s1','vai',undefined,{model:'nuovo:m'}),{code:'KERNEL_NO'});
  await assert.rejects(rif.runtime.resume('s1','vai',undefined,{model:'nuovo:m'}),{message:'il kernel lo rifiuta'});
  const no=fixture({rowModel:'vecchio:m',updatesEsito:()=>({ok:false})});
  await assert.rejects(no.runtime.resume('s1','vai',undefined,{model:'nuovo:m'}),{code:'SESSION_SETTINGS_FAILED'});
  const senza=fixture({rowModel:'vecchio:m'});
  delete senza.registry.aggiornaImpostazioni;
  await assert.rejects(senza.runtime.resume('s1','vai',undefined,{model:'nuovo:m'}),{code:'SESSION_SETTINGS_UNAVAILABLE'});
});

test('override su fork: il modello esplicito viaggia nelle opzioni di forka',async()=>{
  const f=fixture({rowModel:'vecchio:m'});
  await f.runtime.fork('s1','ramo',[image],{model:'nuovo:m'});
  assert.deepEqual(f.forkCalls,[['s1',{modelloRichiesta:'nuovo:m',senzaInterfacciaNelGiro:false}]],'forka riceve l\u2019override sulla chiave del kernel `modelloRichiesta` (session-registry.mjs:7576): la revisione fase B ha bocciato `{modello}`, che moriva alla cucitura');
  assert.deepEqual(f.capabilityCalls,['nuovo:m']);
  await f.runtime.fork('s1','ramo',[image]);
  /* 0.6.8 (seconda revisione, R2): il segno «nessuno davanti» del giro viaggia sempre; con una persona è false detto apertamente,
     così il fork di una sessione nata da un'automazione non eredita il suo «nessuno davanti». Nessun modello inventato. */
  assert.deepEqual(f.forkCalls[1],['s1',{senzaInterfacciaNelGiro:false}],'senza flag: forka com\u2019era, una sola opzione di più non se ne inventa');
});

test('setSessionModel: la scelta viva della TUI si persiste sul canale sanzionato, con gli errori mappati',async()=>{
  const f=fixture({rowModel:'vecchio:m'});
  await f.runtime.setSessionModel!('s1','nuovo:m');
  assert.deepEqual(f.updates,[{id:'s1',patch:{modello:'nuovo:m'}}]);
  const rif=fixture({rowModel:'vecchio:m',updatesEsito:()=>({erroreAvvio:'no',code:'NOPE'})});
  await assert.rejects(rif.runtime.setSessionModel!('s1','nuovo:m'),{code:'NOPE'});
  const no=fixture({rowModel:'vecchio:m',updatesEsito:()=>({ok:false})});
  await assert.rejects(no.runtime.setSessionModel!('s1','nuovo:m'),{code:'SESSION_SETTINGS_FAILED'});
  const senza=fixture({rowModel:'vecchio:m'});
  delete senza.registry.aggiornaImpostazioni;
  await assert.rejects(senza.runtime.setSessionModel!('s1','nuovo:m'),{code:'SESSION_SETTINGS_UNAVAILABLE'});
  const f2=fixture({});
  await assert.rejects(f2.runtime.setSessionModel!('s1','   '),{code:'MODEL_REQUIRED'});
});

test('il supervisor e il contesto differito inoltrano l\u2019opzione model al runtime sotto',async()=>{
  const f=fixture({rowModel:'vecchio:m'});
  const supervisor=createRuntimeSupervisor({initialRuntime:f.runtime,runtimeFactory:()=>({}) as any});
  await supervisor.resume('s1','vai',undefined,{model:'nuovo:m'});
  assert.deepEqual(f.updates,[{id:'s1',patch:{modello:'nuovo:m'}}],'il supervisor non mangia il quarto argomento');
  const differito=createDeferredRuntimeContext(Promise.resolve({runtime:f.runtime,catalog:{},registry:{}}) as any,{});
  await differito.runtime.fork('s1','ramo',undefined,{model:'nuovo:m'});
  assert.deepEqual(f.forkCalls[0],['s1',{modelloRichiesta:'nuovo:m',senzaInterfacciaNelGiro:false}],'nemmeno il contesto differito lo mangia');
});

/* review B #4 (2026-10-06): garbage come "x y" non si persiste — il CLI raggiunge il registro in-process, oltre la
   validazione di http-app; il facade rifiuta prima con MODEL_INVALID, senza toccare il canale sanzionato. */
test('modello non valido (spazi/caratteri di controllo): MODEL_INVALID prima di ogni persistenza',async()=>{
  /* il facade TRIMMA prima del controllo: "   x" persiste come "x", non è garbage — lo sporcabile è lo spazio INTERNO. */
  for(const sporco of['x y','a\tb','a\nb']){
    const r=fixture({rowModel:'vecchio:m'});
    await assert.rejects(r.runtime.resume('s1','vai',undefined,{model:sporco}),{code:'MODEL_INVALID'},`resume rifiuta "${sporco}"`);
    assert.deepEqual(r.updates,[],'nessuna persistenza del garbage');
    assert.deepEqual(r.capabilityCalls,[],'nemmeno la capability valuta un modello non valido');
    const fk=fixture({rowModel:'vecchio:m'});
    await assert.rejects(fk.runtime.fork('s1','ramo',undefined,{model:sporco}),{code:'MODEL_INVALID'});
    assert.deepEqual(fk.forkCalls,[],'forka non parte col garbage');
    const sm=fixture({rowModel:'vecchio:m'});
    await assert.rejects(sm.runtime.setSessionModel!('s1',sporco),{code:'MODEL_INVALID'});
    assert.deepEqual(sm.updates,[],'setSessionModel non persiste il garbage');
  }
});

/* review B #3 (2026-10-06): la preparazione (attachment + capability immagini) gira PRIMA della persistenza —
   un modello che non conferma le immagini fallisce lì e il modello salvato della sessione resta intatto. */
test('capability immagini negativa sul modello nuovo: fallisce PRIMA della persistenza',async()=>{
  const f=fixture({rowModel:'vecchio:m',capability:(model:string)=>model!=='nuovo:m'});
  await assert.rejects(f.runtime.resume('s1','vai',[image],{model:'nuovo:m'}),{code:'MODEL_IMAGE_UNSUPPORTED'});
  assert.deepEqual(f.updates,[],'il modello salvato non è stato toccato');
  assert.deepEqual(f.capabilityCalls,['nuovo:m'],'la capability è stata valutata col modello nuovo, poi rifiuto');
});

/* review B #4, proseguo: l'entry inglese del codice esiste (gate E5 senza toccare la baseline del ratchet). */
test('MODEL_INVALID ha parole inglesi proprie nel dizionario',async()=>{
  const {hasEnglishFor}=await import('../../src/i18n/error-view.ts');
  assert.equal(hasEnglishFor('MODEL_INVALID'),true,'il codice nuovo è mappato, non in UNMAPPED');
});

/* 0.6.6 (live trial of the ChatGPT plan's cache, 15/10/2026): writing the SAME model again rebuilt the conversation's head, and
   every resume with --model paid the whole prefix (0 cached tokens; 9.728 without --model) */
test('override su resume uguale al modello salvato: nessuna scrittura, il giro parte com’è',async()=>{
  const f=fixture({rowModel:'chatgpt:gpt-5.6-luna'});
  await f.runtime.resume('s1','vai',undefined,{model:'chatgpt:gpt-5.6-luna'});
  assert.deepEqual(f.updates,[],'lo stesso modello non si riscrive');
  assert.equal(f.resumes.length,1);
  await f.runtime.resume('s1','vai',undefined,{model:'chatgpt:gpt-6-sol'});
  assert.deepEqual(f.updates,[{id:'s1',patch:{modello:'chatgpt:gpt-6-sol'}}],'un modello diverso sì');
});
