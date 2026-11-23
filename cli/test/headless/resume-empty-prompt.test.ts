import test from 'node:test';import assert from 'node:assert/strict';import {collectHeadlessResume} from '../../src/headless/run.ts';

/*
 * ⛔ N1 (owner 05/10) — IL RESUME HEADLESS SENZA PROMPT NON FA RIPARTIRE IL GIRO PENDENTE.
 *
 * Misurato dal vivo (traccia fetch+loader, registro 05/10 pomeriggio): `talos --resume <id> < NUL` chiamava
 * `runtime.resume(id, '')` (catena main.ts → collectHeadlessResume → facade → kernel) e il kernel, con prompt
 * vuoto, CONTINUAVA il giro pendente: una chiamata vera al modello con 283.386 token di prompt e TTFT 59,7 s,
 * ripetuta a ogni avvio (RunStarted 56→58). Codex rifiuta («Provide a prompt to continue»), claude rifiuta
 * («stdin is not a terminal»): nessuno dei due paga una chiamata di modello per un resume senza input.
 *
 * Contratto: prompt assente/vuoto ⇒ NESSUNA chiamata a runtime.resume, la sessione si RIPRODUCE (replay) e un
 * evento `warning` con codice HEADLESS_RESUME_NO_PROMPT lo dice. Prompt presente ⇒ il comportamento di prima.
 */

function runtimeFinto({fromSeen,sessioni=[{sessionId:'s'}]}:{fromSeen?:{value:number};sessioni?:Array<{sessionId?:string;id?:string}>}={}) {
  const chiamate:{prompt:string|null|undefined}[]=[];
  return{
    chiamate,
    listSessions:async()=>sessioni,
    resume:async(_id:string,prompt?:string)=>{chiamate.push({prompt});return 's';},
    subscribe(_id:string,sink:(e:any)=>void,from?:number){if(fromSeen)fromSeen.value=from??0;queueMicrotask(()=>[{type:'TextMessageContent',messageId:'n',delta:'FINE'},{type:'RunFinished'}].forEach(sink));return()=>{};},
    answerApproval:async()=>{},cancel:async()=>{},
  };
}

const BASE={projectRoot:process.cwd(),model:'m',permissionMode:'dontAsk',permissionRules:{allow:[],ask:[],deny:[]}} as any;

test('N1 ⛔ resume headless senza prompt: nessun giro, replay della sessione, warning HEADLESS_RESUME_NO_PROMPT (v1)',async()=>{
  const runtime=runtimeFinto();
  const x=await collectHeadlessResume(runtime,'s','',BASE as any);
  assert.equal(runtime.chiamate.length,0,'⛔ il resume senza prompt non deve chiamare runtime.resume: la chiamata misurata costava 283k token e 59,7 s di TTFT a ogni boot');
  assert.equal(x.result.ok,true,'la sessione si riproduce: il risultato resta ok');
  const avviso=x.events.find((e:any)=>e.type==='warning'&&e.data?.code==='HEADLESS_RESUME_NO_PROMPT');
  assert.ok(avviso,'un evento warning con codice HEADLESS_RESUME_NO_PROMPT deve dire che il giro pendente non è ripartito');
  /* Review C (06/10): the i18n entry and this emitted message must say the same thing — pin the exact words here so
     neither can drift without the other noticing. */
  assert.equal(avviso.data.message,'No prompt given: the pending turn was not restarted; the session was replayed as-is. Pass a prompt or pipe one to continue the turn.');
});

test('N1 ⛔ stesso contratto su protocollo v2',async()=>{
  const runtime=runtimeFinto();
  const avvisi:any[]=[];
  const x=await collectHeadlessResume(runtime,'s',undefined,{...BASE,protocolVersion:'v2'} as any,(e:any)=>avvisi.push(e));
  assert.equal(runtime.chiamate.length,0,'⛔ v2: nessuna chiamata a runtime.resume senza prompt');
  assert.equal(x.result.ok,true);
  assert.ok(avvisi.some((e)=>e.type==='warning'&&String(e.data?.code??'').includes('HEADLESS_RESUME_NO_PROMPT')),'v2: il warning arriva anche al sink');
});

test('N1 ✓ con un prompt il resume parte come prima (nessuna regressione)',async()=>{
  const runtime=runtimeFinto();
  await collectHeadlessResume(runtime,'s','continua il lavoro',BASE as any);
  assert.deepEqual(runtime.chiamate.map((c)=>c.prompt),['continua il lavoro'],'con un prompt esplicito il resume è invariato');
});

/*
 * Revisione critica 07/10: un id che nessuno conosce NON è un replay. Provato dal vivo con `talos --resume does-not-exist --json`:
 * rispondeva ok:true, exit 0, «Replayed 0 historical events; the session is readable». Prima di N1 lo stesso comando falliva con
 * SESSION_NOT_FOUND (exit 15). Codex: «Session not found: {id}» (exec/src/lib.rs:1037); OpenCode: «Session not found» (run.ts:465).
 */
test('N1 ⛔ un id inesistente senza prompt fallisce con SESSION_NOT_FOUND, come con un prompt: niente replay finto, niente chiamata',async()=>{
  for(const protocolVersion of [undefined,'v2'] as const){
    const runtime=runtimeFinto({sessioni:[{sessionId:'altra'}]});
    await assert.rejects(()=>collectHeadlessResume(runtime,'non-esiste','',{...BASE,...(protocolVersion?{protocolVersion}:{})} as any),(error:any)=>error?.code==='SESSION_NOT_FOUND',`protocollo ${protocolVersion??'v1'}`);
    assert.equal(runtime.chiamate.length,0,'nessuna chiamata a runtime.resume');
  }
});

test('N1 ✓ una sessione che esiste si riproduce anche se è l\'ultima della lista',async()=>{
  const runtime=runtimeFinto({sessioni:[{sessionId:'prima'},{sessionId:'s'}]});
  const x=await collectHeadlessResume(runtime,'s','',BASE as any);
  assert.equal(x.result.ok,true);
});

test('N1 ✓ una riga della lista che porta solo `id` (non `sessionId`) vale come la sessione',async()=>{
  const runtime=runtimeFinto({sessioni:[{id:'s'}]});
  const x=await collectHeadlessResume(runtime,'s','',BASE as any);
  assert.equal(x.result.ok,true);
});
