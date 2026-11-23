/*
 * 0.6.6 — owner 14/10/2026, the stress test stopped on the ChatGPT plan's usage limit: «qui mi dice failed, sembra un errore. Se
 * spuntasse l'alert di fine piano, allora l'avrei capito» … «si vede subito sotto il testo… però è in grigio, non è molto evidente».
 * What the plan's limit promises now:
 * - while the kernel waits on it (`provider-retry`, `motivo:'limite-del-piano'`, `retryAt`), the live line says the plan's limit
 *   and the clock time TALOS tries again (Codex `error.rs` «Try again at 3:05 PM»; desktop «Continuing automatically at HH:MM
 *   (attempt n of m)»), and that /model goes on now — never a countdown of thousands of seconds;
 * - when it ends the run, the failure says when the limit comes back (from the service's own `x-codex-*` headers, read by the
 *   kernel's reader) and is an ALERT: headline bold in the warning colour, what to do in the normal colour, details dim;
 * - every other failure stays as it was (dim, no alert), and a wait on any other 429 keeps its countdown.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as planLimits from '../../../harness-ui/src/chatgpt-limiti.mjs';
import {clockTime} from '../../src/i18n/clock-time.ts';
import {describeError} from '../../src/i18n/error-view.ts';
import {createCliEventHub,createRunObserver} from '../../src/runtime/provider-attempts.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {retryLine} from '../../src/tui/live-activity.ts';
import {initialTuiState,reduceTuiEvent} from '../../src/tui/state.ts';
import {createTranscriptModel,reduceTranscriptEvent} from '../../src/tui/transcript-model.ts';

let seq=0;const durable=(row:Record<string,unknown>)=>({...row,_sequenza:++seq});
const NOW=new Date(2026,9,14,13,0,0).getTime();
const at=(h:number,m:number,day=14)=>new Date(2026,9,day,h,m,0).getTime();
const readPlanReset=(headers:unknown)=>(planLimits as any).limiteFinito((planLimits as any).leggiLimitiDelPiano(headers))?.tornaAlle??null;

test('a clock time: the time alone today, the date too on another day (24-hour, local)',()=>{
  assert.equal(clockTime(at(15,5),NOW),'15:05');
  assert.equal(clockTime(at(9,0,16),NOW),'Oct 16 09:00');
  assert.equal(clockTime(at(0,7,15),NOW),'Oct 15 00:07');
});

test('the observer marks the wait on the plan\'s limit, with the time the kernel tries again; another 429 is not marked',()=>{
  const hub=createCliEventHub();const seen:any[]=[];hub.subscribe('s1',event=>seen.push(event));
  const observer=createRunObserver({sessionId:'s1',hub,readRequestedWait:null});
  observer.onProviderRetry({tipo:'provider-retry',fase:'attesa',tentativo:2,tentativiMassimi:3,httpStatus:429,attesaMs:7_500_000,retryAt:at(15,5),motivo:'limite-del-piano'});
  observer.onProviderRetry({tipo:'provider-retry',fase:'attesa',tentativo:2,tentativiMassimi:4,httpStatus:429,attesaMs:7000,retryAt:NOW+7000});
  assert.deepEqual(seen.map(e=>e.value),[
    {attempt:2,maxAttempts:3,status:429,retryAfterMs:null,waitMs:7_500_000,planLimit:true,resumesAt:at(15,5)},
    {attempt:2,maxAttempts:4,status:429,retryAfterMs:null,waitMs:7000},
  ]);
});

test('the run that ends on the plan\'s limit carries when it comes back, read from the service\'s headers by the kernel\'s reader',()=>{
  const hub=createCliEventHub();const seen:any[]=[];hub.subscribe('s1',event=>seen.push(event));
  const observer=createRunObserver({sessionId:'s1',hub,readRequestedWait:null,readPlanReset});
  const headers=new Headers({'x-codex-primary-used-percent':'100','x-codex-primary-window-minutes':'300','x-codex-primary-reset-at':String(at(15,5)/1000),'x-codex-secondary-used-percent':'40'});
  observer.announceFailure(Object.assign(new Error('The ChatGPT plan usage limit was reached.'),{code:'CHATGPT_LIMITE_DEL_PIANO',stato:429,intestazioni:headers}));
  assert.deepEqual(seen.at(-1).value,{status:429,retryAfterMs:null,resetsAt:at(15,5)});
  /* AL CONTRARIO: headers that do not say when, or another code with the same headers, carry no time */
  observer.announceFailure(Object.assign(new Error('x'),{code:'CHATGPT_LIMITE_DEL_PIANO',stato:429,intestazioni:new Headers()}));
  assert.deepEqual(seen.at(-1).value,{status:429,retryAfterMs:null});
  observer.announceFailure(Object.assign(new Error('x'),{code:'PROVIDER_REQUEST_ERROR',stato:429,intestazioni:headers}));
  assert.deepEqual(seen.at(-1).value,{status:429,retryAfterMs:null});
});

/* the 0.6.6 review: when the kernel has waited and asked again, its error carries the headers of ITS OWN 429 (Retry-After only);
   the time the window comes back is the service's last real refusal, seen by the observer on the wire */
test('the kernel\'s retries used up: the time comes from the service\'s last real refusal, never a time already past',async()=>{
  const hub=createCliEventHub();const seen:any[]=[];hub.subscribe('s1',event=>seen.push(event));
  let reset=at(15,5);
  const refusal=()=>new Response('{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}',{status:429,headers:{'x-codex-primary-used-percent':'100','x-codex-primary-reset-at':String(reset/1000)}});
  const observer=createRunObserver({sessionId:'s1',hub,readRequestedWait:null,readPlanReset,baseFetch:async()=>refusal(),now:()=>NOW});
  await observer.fetchDiRete('https://chatgpt.com/backend-api/codex/responses',{method:'POST',body:'{"input":[]}'});
  const own={'retry-after-ms':'7500000','retry-after':'7500'};
  observer.announceFailure(Object.assign(new Error('The ChatGPT plan usage limit was reached.'),{code:'CHATGPT_LIMITE_DEL_PIANO',stato:429,intestazioni:own}));
  assert.equal(seen.at(-1).value.resetsAt,at(15,5));
  observer.announceFailure(Object.assign(new Error('x'),{code:'PROVIDER_REQUEST_ERROR',stato:429,intestazioni:own}));
  assert.equal(seen.at(-1).value.resetsAt,undefined,'another code carries no time');
  reset=at(12,0);await observer.fetchDiRete('https://chatgpt.com/backend-api/codex/responses',{method:'POST',body:'{"input":[]}'});
  observer.announceFailure(Object.assign(new Error('x'),{code:'CHATGPT_LIMITE_DEL_PIANO',stato:429,intestazioni:own}));
  assert.equal(seen.at(-1).value.resetsAt,undefined,'a time already past is not said');
});

test('the live line on the plan\'s limit: what it is, when TALOS tries again, the attempt, and /model; no countdown',()=>{
  let state=initialTuiState({model:'openai:gpt-5.5',permissionMode:'default'});
  state=reduceTuiEvent(state,{type:'provider.attempt',attempt:2,maxAttempts:3,status:429,retryAfterMs:null,waitMs:7_500_000,planLimit:true,resumesAt:at(15,5),eventId:'a1'} as any);
  const line=retryLine(state.retry!,NOW);
  assert.equal(line,'ChatGPT plan usage limit reached · TALOS tries again at 15:05 · attempt 2 of 3 · /model to go on with another model');
  assert.doesNotMatch(line,/\d{3,}s/u,'never a countdown of thousands of seconds');
  /* with no time from the kernel, the wait it took gives it; with neither, «later» */
  assert.match(retryLine({...state.retry!,resumesAt:null,waitMs:3_600_000,at:NOW},NOW),/tries again at 14:00/u);
  assert.match(retryLine({...state.retry!,resumesAt:null,waitMs:null},NOW),/tries again later/u);
  /* AL CONTRARIO: an ordinary 429 keeps its countdown */
  assert.equal(retryLine({attempt:2,maxAttempts:4,status:429,retryAfterMs:7000,waitMs:7000,at:NOW},NOW),'Retrying · attempt 2 of 4 · HTTP 429 · in 7s');
});

test('through the adapter, the failure on the plan\'s limit says when it comes back and is an alert; any other failure is not',()=>{
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  const rows=[durable({type:'RunStarted',runId:'r1'}),{type:'CUSTOM',name:'talos.cli.provider.failure',value:{status:429,retryAfterMs:null,resetsAt:at(15,5)}},durable({type:'RunError',runId:'r1',message:'The ChatGPT plan usage limit was reached. Check ChatGPT Settings → Usage.',code:'CHATGPT_LIMITE_DEL_PIANO'})];
  const events=rows.flatMap(row=>adapter.translateAll(row));
  /* the wait reaches the screen marked too */
  const waiting=adapter.translateAll({type:'CUSTOM',name:'talos.cli.provider.attempt',value:{attempt:2,maxAttempts:3,status:429,retryAfterMs:null,waitMs:600_000,planLimit:true,resumesAt:at(15,5)}}).find(e=>e.type==='provider.attempt') as any;
  assert.deepEqual([waiting?.planLimit,waiting?.resumesAt],[true,at(15,5)]);
  const failed=events.find(e=>e.type==='run.failed') as any;
  assert.equal(failed.error.resetsAt,at(15,5));
  let model=createTranscriptModel();for(const event of events)model=reduceTranscriptEvent(model,event);
  const item=model.items.find(i=>i.kind==='warning') as any;
  assert.equal(item.alert,true);
  const [head,todo]=item.text.split('\n');
  assert.equal(head,`The ChatGPT plan usage limit was reached. It comes back at ${clockTime(at(15,5))}.`);
  assert.equal(todo,'Go on now with another model: /model. Or wait for the limit to come back (ChatGPT Settings → Usage).');
  /* with no time from the service: the headline without one, still an alert */
  const view=describeError({message:'x',code:'CHATGPT_LIMITE_DEL_PIANO'});
  assert.equal(view.what,'The ChatGPT plan usage limit was reached.');
  /* AL CONTRARIO: a key the provider refused is a failure, not an alert */
  const other=createTuiEventAdapter();other.bindSession('s2');
  let plain=createTranscriptModel();for(const event of [durable({type:'RunStarted',runId:'r2'}),durable({type:'RunError',runId:'r2',message:'Credenziale rifiutata dal fornitore.',code:'PROVIDER_REQUEST_ERROR'})].flatMap(row=>other.translateAll(row)))plain=reduceTranscriptEvent(plain,event);
  assert.equal((plain.items.find(i=>i.kind==='warning') as any).alert,undefined);
});

test('the screen draws an alert\'s headline bold in the warning colour, the rest not dim except the details',()=>{
  const app=readFileSync(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  /* R13 (007c7c02f, 03/11/2026): the headline and the rest wrap by words in the turn's room; the promises are the same */
  assert.match(app,/item\.kind==='warning'&&item\.alert\)\{const room=Math\.max\(1,columns-TURN_INDENT\),\[head='',\.\.\.rest\]=item\.text\.split\('\\n'\);/u);
  assert.match(app,/wrapReadable\(head,room\)\.map\(\(row,index\)=>h\(Ink\.Text,\{key:'head-'\+index,bold:true,color:theme\.colors\.warning,inverse:selected\},row\|\|' '\)\)/u);
  assert.match(app,/dimColor:line\.startsWith\(t\('common\.details'\)\+':'\)/u);
});
