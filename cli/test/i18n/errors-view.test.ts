import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {TalosError,renderTalosFailureLine,safeTalosFailure} from '../../src/errors.ts';
import {describeError,describeKernelNotice,describeRefusal,errorViewLines,type ErrorView} from '../../src/i18n/error-view.ts';
import {KERNEL_NOTICES,KERNEL_PROVIDER_MESSAGES,KERNEL_RUN_TEXT,looksItalian} from '../../src/i18n/kernel-map.ts';

/* R2 lane E (gate E4-E7, Q-R2-2, Q-R2-4). The screen maps kernel failures by CODE to three English parts; the raw kernel
   text (Italian) never reaches the default lines and survives only in `raw` (expanded detail, log). */
const ITALIAN=/interrott|richiesta|fornitore|traffico|\bgiro\b|\bgiri\b|credenziale|\bchiave\b|\bnon\b|owner/iu;
const lines=(view:ErrorView)=>errorViewLines(view).join('\n');
function occurrences(text:string,word:string){return text.split(word).length-1;}
function assertAnatomy(view:ErrorView,label:string){
  const text=lines(view);
  assert.ok(view.what.length>0,`${label}: no headline`);
  assert.ok(view.todo,`${label}: no "what to do"`);
  assert.ok(view.where,`${label}: no "where to look"`);
  assert.doesNotMatch(text,ITALIAN,`${label}: Italian on the default lines:\n${text}`);
  if(view.code)assert.equal(occurrences(text,view.code),1,`${label}: the code is not printed exactly once:\n${text}`);
}
const kernel=(message:string,code='PROVIDER_REQUEST_ERROR',extra:Record<string,unknown>={})=>Object.assign(new Error(message),{code,...extra});

/* 09/10/2026, the owner's stress run: Z.AI answers an empty balance with HTTP 429, the kernel read the body and said
   «credito», and the screen said "limiting requests … TALOS retried, wait a moment" — false twice: nothing was retried
   and waiting does not help. As Codex (api_bridge.rs: a 429 with insufficient_quota is QuotaExceeded) and Hermes
   (error_classifier.py: Z.AI/Zhipu reuse 429, the body is checked first), the kernel's credit class wins over the status. */
test('a 429 the kernel recognised as an empty balance says credit, not rate limiting',()=>{
  for(const error of [
    kernel('Credit not available at the provider.','PROVIDER_REQUEST_ERROR',{classe:'credito',stato:429}),
    kernel('Credit not available at the provider.','PROVIDER_REQUEST_ERROR',{status:429}),
  ]){
    const view=describeError(error);
    assertAnatomy(view,'credit 429');
    assert.match(view.what,/credit/iu,view.what);
    assert.doesNotMatch(lines(view),/limiting|retried|wait a moment/iu,lines(view));
  }
  const traffic=describeError(kernel('Too much traffic at the provider.','PROVIDER_REQUEST_ERROR',{classe:'traffico',stato:429}));
  assert.match(traffic.what,/limiting requests/u,'a real 429 stays rate limiting');
});

/* 0.6.7 (stress test of 0.6.6, S-OBS-4, reproduced on the published 0.6.6): with TALOS_MAX_RETRIES=0 the kernel sends a 429 once,
   and the screen said "TALOS retried and then stopped". */
test('a 429 with retries turned off does not say TALOS retried',t=>{
  const before=process.env.TALOS_MAX_RETRIES;
  t.after(()=>{if(before===undefined)delete process.env.TALOS_MAX_RETRIES;else process.env.TALOS_MAX_RETRIES=before;});
  const view=()=>describeError(kernel('Too much traffic at the provider.','PROVIDER_REQUEST_ERROR',{classe:'traffico',stato:429}));
  process.env.TALOS_MAX_RETRIES='0';
  assert.doesNotMatch(view().what,/retried/u);
  assert.match(view().what,/did not retry, because TALOS_MAX_RETRIES is 0/u);
  for(const value of [undefined,'','3','abc','-1']){
    if(value===undefined)delete process.env.TALOS_MAX_RETRIES;else process.env.TALOS_MAX_RETRIES=value;
    assert.match(view().what,/TALOS retried and then stopped/u,`TALOS_MAX_RETRIES=${String(value)}: the kernel retried`);
  }
});

test('E7: a kernel 429 (classe lost at the RunError boundary) says the provider is rate-limiting and what to do',()=>{
  const view=describeError(kernel('Troppo traffico presso il fornitore.'));
  assertAnatomy(view,'429');
  assert.match(view.what,/rate|429|too many/iu);
  assert.match(view.todo!,/wait|try again/iu);
  assert.equal(view.raw,'Troppo traffico presso il fornitore.');
});

test('E7: 401, 403 and 404 get distinct causes; 403 never says the key is wrong',()=>{
  const e401=describeError(kernel('Credenziale rifiutata dal fornitore.','PROVIDER_REQUEST_ERROR',{stato:401,provider:'openai'}));
  const e403=describeError(kernel('Credenziale rifiutata dal fornitore.','PROVIDER_REQUEST_ERROR',{stato:403,provider:'openai'}));
  const e404=describeError(kernel('Il fornitore non ha accettato la richiesta.','PROVIDER_REQUEST_ERROR',{stato:404,provider:'openai'}));
  for(const [view,label] of [[e401,'401'],[e403,'403'],[e404,'404']] as const)assertAnatomy(view,label);
  assert.match(e401.what,/key/iu);
  assert.doesNotMatch(lines(e403),/key is (wrong|invalid)|invalid key|replace the key|set-key/iu);
  assert.match(e403.what,/access|denied|403/iu);
  assert.match(e404.what,/model|found|404/iu);
  assert.match(e404.todo!,/\/model|talos model list/u);
  assert.equal(new Set([e401.what,e403.what,e404.what]).size,3);
  assert.match(e401.where!,/talos provider test openai/u);
});

test('E7: without a status the kernel credential class stays neutral (the kernel lumps 401 with 403)',()=>{
  const view=describeError(kernel('Credenziale rifiutata dal fornitore.'));
  assertAnatomy(view,'credential');
  assert.doesNotMatch(lines(view),/key is (wrong|invalid)|invalid key/iu);
});

test('E7/E15: 500, timeout and network have their own words; a keyless 429 invents no seconds',()=>{
  for(const [message,code,pattern] of [
    ['Il fornitore non risponde.','PROVIDER_REQUEST_ERROR',/provider.*(error|problem|down)|500/iu],
    ['Il fornitore ha superato il tempo massimo.','PROVIDER_REQUEST_ERROR',/in time|timed out|too long/iu],
    ['Non è stato possibile raggiungere il fornitore.','PROVIDER_NETWORK_ERROR',/reach|connection|network/iu],
    ['Il fornitore non ha risposto entro 30 secondi.','PROVIDER_FIRST_RESPONSE_TIMEOUT',/in time|did not answer|timed out/iu],
  ] as const){const view=describeError(kernel(message,code));assertAnatomy(view,code+' '+message);assert.match(view.what,pattern,message);}
  assert.doesNotMatch(lines(describeError(kernel('Troppo traffico presso il fornitore.'))),/\d+ ?s\b|seconds/iu);
  const known=describeError(kernel('Troppo traffico presso il fornitore.','PROVIDER_REQUEST_ERROR',{retryAfterMs:7000}));
  assert.match(known.todo!,/7 ?s|7 seconds/iu,'a known wait is given');
});

test('Q-R2-2: an unmapped kernel code with Italian text shows a family sentence and the code, never the text',()=>{
  const view=describeError(kernel('Il runtime agente non espone la lettura di una pagina.','PAGE_READ_UNAVAILABLE_TEST'));
  assert.doesNotMatch(lines(view),ITALIAN);
  assert.equal(view.code,'PAGE_READ_UNAVAILABLE_TEST');
  assert.equal(occurrences(lines(view),'PAGE_READ_UNAVAILABLE_TEST'),1);
  assert.equal(view.raw,'Il runtime agente non espone la lettura di una pagina.');
  assert.ok(view.todo&&view.where);
});

test('E6: a CODE: prose message prints its code once and keeps the English prose as the detail',()=>{
  const view=describeError(Object.assign(new Error('PROJECT_TRUST_REQUIRED: TALOS did not load project instructions because this folder is not trusted.'),{code:'PROJECT_TRUST_REQUIRED'}));
  assertAnatomy(view,'trust');
  assert.match(lines(view),/talos project trust/u);
  const unmapped=describeError(new Error('SOME_UNMAPPED_CLI_CODE: the widget is missing'));
  assert.equal(unmapped.code,'SOME_UNMAPPED_CLI_CODE');
  assert.equal(occurrences(lines(unmapped),'SOME_UNMAPPED_CLI_CODE'),1);
  assert.match(lines(unmapped),/the widget is missing/u);
});

test('E4: run outcomes map by the kernel outcome code, with no kernel text on screen',()=>{
  const stopped=describeError(kernel('⛔ interrotto su richiesta: mentre il modello stava rispondendo, al giro 1.','fermato'));
  assert.match(stopped.what,/interrupted/iu);
  // The kernel's outcome codes are Italian words themselves: the screen shows an English code for them.
  for(const view of [describeError(kernel('x','giri-esauriti')),describeError(kernel('x','ripetizione')),describeError(kernel('x','internal-error'))])assert.match(String(view.code),/^[A-Z][A-Z0-9_]+$/u);
  assert.equal(stopped.code,null,'the person\'s own stop is not an error: no code, no Details line');
  assert.deepEqual(errorViewLines(stopped),[stopped.what]);
  assert.match(describeError(kernel('⛔ interrotto su richiesta.','fermato'),{stopPoint:{kind:'answering'}}).what,/while the model was answering/u);
  assert.match(describeError(kernel('x','fermato'),{stopPoint:{kind:'approval',tool:'Shell'}}).what,/waiting for your approval for Shell/u);
  assert.doesNotMatch(lines(stopped),ITALIAN);
  const exhausted=describeError(kernel('⛔ giri esauriti: 24 su 24 usati senza chiudere il task.','giri-esauriti'));
  assert.match(exhausted.what,/turn/iu);assert.doesNotMatch(lines(exhausted),ITALIAN);
  const repeated=describeError(kernel('⛔ il modello ha chiesto 5 volte la stessa identica cosa','ripetizione'));
  assert.match(repeated.what,/repeat|same/iu);
  const noAnswer=describeError(kernel(KERNEL_RUN_TEXT.stoppedWithoutAnswer,'fermato'));
  assert.doesNotMatch(noAnswer.what,/at your request/iu,'a generation that stopped by itself is not an interrupt by the person');
});

test('F-ENG-4: an answer that kept hitting the output limit says so, with its own code, not "stopped without an answer"',()=>{
  const view=describeError(kernel('⛔ the answer hit the output limit 4 times in a row, and was continued 3 of them','tetto-uscita'));
  assert.equal(view.code,'OUTPUT_LIMIT');
  assert.match(view.what,/output limit/u);
  assert.match(String(view.todo),/maxOutputTokens/u);
  assert.doesNotMatch(view.what,/without an answer|interrupted/iu);
});

test('E8: a missing key uses the one missing-key sentence when the provider is known',()=>{
  const view=describeError(Object.assign(new Error('Manca la chiave del fornitore scelto.'),{code:'PROVIDER_KEY_MISSING',provider:'openai'}));
  assert.match(view.what,/No API key for/u);
  assert.doesNotMatch(lines(view),ITALIAN);
});

test('sandbox and CLI failures keep English, and describeError never throws',()=>{
  const sandbox=describeError(new TalosError({code:'SANDBOX_REQUIRED_UNAVAILABLE',component:'execution-broker',retryable:false,traceId:'t'},new Error('processmodel.dll export missing')));
  assertAnatomy(sandbox,'sandbox');assert.match(sandbox.where!,/talos doctor/u);
  const hostile={get code():string{throw new Error('boom');},get message():string{throw new Error('boom');}};
  assert.doesNotThrow(()=>describeError(hostile));
  assert.ok(describeError(hostile).what.length>0);
});

test('E4: a refused tool is worded from the permission `via`, never from the Italian motivo',()=>{
  assert.match(describeRefusal({via:'permesso-per-attrezzo-chiedi',allowed:false}),/did not approve/iu);
  assert.match(describeRefusal({via:'livello-lettura',allowed:false}),/read-only/iu);
  assert.match(describeRefusal({via:'floor-comando-senza-recupero',allowed:false}),/cannot be undone/iu);
  assert.match(describeRefusal({via:'something-new',allowed:false}),/refused/iu);
  for(const via of ['segreto-forza-conferma','attrezzo-sempre-da-confermare','trifecta-forza-conferma','livello-su-richiesta','permesso-per-attrezzo-nega','livello-ricerca','livello-scrittura-area','fermato-su-richiesta','pre-mutation-guard'])
    assert.doesNotMatch(describeRefusal({via,allowed:false}),ITALIAN,via);
});

test('Q-R2-4: the text failure is three lines (headline, what to do, dim details with the code once) and no trace unless verbose',()=>{
  const failure=safeTalosFailure(Object.assign(new Error('PROJECT_TRUST_REQUIRED: TALOS did not load project instructions because this folder is not trusted.'),{code:'PROJECT_TRUST_REQUIRED'}),{traceId:'trace-e-1'},[]);
  const text=renderTalosFailureLine(failure);
  const rows=text.trimEnd().split('\n');
  assert.equal(rows.length,3,text);
  assert.match(rows[0]!,/^Error: /u);
  assert.equal(occurrences(text,'PROJECT_TRUST_REQUIRED'),1,text);
  assert.equal(text.includes('trace-e-1'),false,'the trace id is JSON and verbose only (gate E6)');
  assert.ok(renderTalosFailureLine(failure,{verbose:true}).includes('trace-e-1'));
  assert.equal(text.endsWith('\n'),true);
});

test('E4 pin: the kernel constants mapped by exact text are still the kernel\'s own, byte for byte',()=>{
  const adapter=readFileSync(new URL('../../../harness-ui/src/runtime-owner-adapter.mjs',import.meta.url),'utf8');
  /* K3 (03/10): the CLI reads each sentence in Italian and in English; the kernel writes one of the two. Each class must still
     have a sentence the kernel writes, byte for byte. */
  const byClass=new Map<string,string[]>();for(const [message,cls] of Object.entries(KERNEL_PROVIDER_MESSAGES))byClass.set(cls,[...(byClass.get(cls)??[]),message]);
  for(const [cls,messages] of byClass)assert.ok(messages.some(message=>adapter.includes(`'${message}'`)),`the kernel says none of the ${cls} sentences: ${messages.join(' | ')}`);
  const harness=readFileSync(new URL('../../../harness-ui/src/kernel/talosHarness.mjs',import.meta.url),'utf8');
  assert.ok(harness.includes(`'${KERNEL_RUN_TEXT.stoppedWithoutAnswer}'`)||harness.includes(`'${KERNEL_RUN_TEXT.stoppedWithoutAnswerEn}'`));
  /* K3 (realigned 08/10/2026): the kernel writes the three notices in English; the Italian rows are only for sessions saved before and are not pinned. */
  const pinnedNotices=KERNEL_NOTICES.filter(notice=>!notice.legacy);
  assert.equal(pinnedNotices.length,4,'one pinned row per notice');
  /* 14/10/2026: the Z.AI «no credit» notice is written by zai-indirizzo.mjs, not by the adapter */
  const zai=readFileSync(new URL('../../../harness-ui/src/zai-indirizzo.mjs',import.meta.url),'utf8');
  for(const notice of pinnedNotices)assert.ok(adapter.includes(notice.fragment!)||zai.includes(notice.fragment!),`the kernel notice template changed: ${notice.fragment}`);
  for(const notice of KERNEL_NOTICES.filter(notice=>notice.legacy))assert.equal(notice.fragment,undefined,'a legacy row is not pinned');
});

test("K3 notices: the kernel's English provider notices become the CLI's words, the Italian ones of older sessions still do, a model's own sentence never does",()=>{
  const keyRefused=describeKernelNotice('A OpenAI key was rejected: check Providers and access.');
  assert.ok(keyRefused&&keyRefused.includes('OpenAI')&&keyRefused.includes('talos provider list'),String(keyRefused));
  assert.doesNotMatch(String(keyRefused),/Providers and access/u,'the desktop screen name never reaches the CLI');
  assert.equal(describeKernelNotice('Provider OpenRouter is limiting traffic: continuing with Z.AI · model glm-5'),'OpenRouter is limiting requests: continuing with Z.AI · model glm-5');
  assert.equal(describeKernelNotice('Provider OpenRouter is not responding: continuing with Z.AI · model glm-5'),'OpenRouter is not answering: continuing with Z.AI · model glm-5');
  assert.equal(describeKernelNotice('Il fornitore OpenRouter limita il traffico: continuo con Z.AI · modello glm-5'),'OpenRouter is limiting requests: continuing with Z.AI · model glm-5','an Italian notice saved before K3');
  assert.ok(describeKernelNotice('Una chiave di OpenAI è stata rifiutata: controlla Fornitori e accessi.')?.includes('OpenAI'));
  /* 14/10/2026 (owner: the Z.AI key only to the chosen address): the kernel says «no credit» and does not switch; the CLI says how to choose */
  const zaiNoCredit=describeKernelNotice('Z.AI said there is no credit on the pay-as-you-go balance. TALOS did not try another address with your key: choose the address you want for it.');
  assert.ok(zaiNoCredit&&zaiNoCredit.includes('the pay-as-you-go balance')&&zaiNoCredit.includes('talos provider configure zai --endpoint'),String(zaiNoCredit));
  /* only the WHOLE message is a notice: a model quoting one inside its own sentence is never rewritten */
  assert.equal(describeKernelNotice('I read that A OpenAI key was rejected: check Providers and access.'),null);
  assert.equal(describeKernelNotice('A OpenAI key was rejected: check Providers and access. More text of the model.'),null);
  assert.equal(describeKernelNotice('Note: Provider OpenRouter is limiting traffic: continuing with Z.AI · model glm-5'),null);
  for(const own of ['Provider status is fine, so I am continuing with the plan','A key was rejected: check the settings of your app','Provider X is limiting traffic: continuing with Y · model Z and more text?'.replace(' · model Z and more text?','')])assert.equal(describeKernelNotice(own),null,own);
});

test('the Italian guard: kernel prose is caught, CLI English is not',()=>{
  for(const text of ['Troppo traffico presso il fornitore.','la sessione è in sola lettura','Manca la chiave per OpenAI','Agente esterno'])assert.equal(looksItalian(text),true,text);
  for(const text of ['the widget is missing','non-interactive run failed','a command of 3 segments is not remembered','processmodel.dll export missing','Per request limit reached'])assert.equal(looksItalian(text),false,text);
});

/* Coordinator (R2 integration): removing `fermato:'INTERRUPTED'` from DISPLAY_CODES left every lane-E test green — the
   code shown in "Details: … (CODE)" was never asserted. A code on screen is a word on screen (D-05): every kernel code
   spelled in Italian must reach the default lines as its English display code, never as itself. */
test('R2 E5: every Italian-spelled kernel code is shown as its English display code on the default lines',async()=>{
  const {DISPLAY_CODES}=await import('../../src/i18n/kernel-map.ts');
  const shown=(code:string,text:string)=>lines(describeError(kernel(text,code)));
  const noAnswer=shown('fermato',KERNEL_RUN_TEXT.stoppedWithoutAnswer);
  assert.ok(!noAnswer.includes('(fermato)')&&/\([A-Z_]+\)/u.test(noAnswer),`the stopped-without-answer failure shows an English code (NO_ANSWER), never fermato:\n${noAnswer}`);
  for(const [italian,english] of Object.entries(DISPLAY_CODES)){
    if(italian===english)continue;
    const out=shown(italian,'kernel text');
    assert.ok(!out.includes(`(${italian})`),`${italian} reached the screen as itself:\n${out}`);
    if(out.includes('('))assert.ok(out.includes(`(${english})`),`${italian} is shown as ${english}:\n${out}`);
  }
});

/* OWN-01 (owner 09/10/2026, stress test of 0.5.1): the provider never started answering, even after the automatic resends.
   The exhausted uncertain-outcome words ("stopped before TALOS could tell whether the request finished") were false there. */
test('a provider that never started answering is said as such, with the resends counted and what to do',()=>{
  const view=describeError({code:'PROVIDER_OUTCOME_UNKNOWN_ESAURITO',message:'The provider did not start answering within the time limit, even after 3 automatic resends. The request may still have been produced and paid for: resume explicitly when you want to continue.'});
  assert.match(view.what,/did not start answering in time, even after TALOS resent the request 3 times/u);
  assert.match(view.todo??'',/--timeout <seconds> \(up to 1800\)/u);
  assert.doesNotMatch(view.what,/stopped before/u);
  const other=describeError({code:'PROVIDER_OUTCOME_UNKNOWN_ESAURITO',message:'The provider response was interrupted and its outcome remained uncertain even after 10 automatic resends with no intermediate effects.'});
  assert.match(other.what,/stopped before TALOS could tell/u,'the interrupted case keeps its own words');
});
