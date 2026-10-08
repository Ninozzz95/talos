import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { creaFetchMultiProvider, createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { validaFallbackProviders } from '../src/model-destination.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';

async function banco(t, rispondi, env = { DEEPSEEK_API_KEY: 'finta-deepseek', ZAI_API_KEY: 'finta-zai' }) {
  const richieste = [], eventi = [], consumi = [], valori = new Map();
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks));
    richieste.push({ url: req.url, body, chiave: req.headers.authorization });
    rispondi(req, res, body, richieste.length);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  assert.notEqual(server.address().port, 4174);
  const store = createProviderCredentialStore({ env, keyring: {
    get: (s,p) => valori.get(s+p) ?? null, set: (s,p,v) => valori.set(s+p,v), remove: (s,p) => valori.delete(s+p),
  } });
  for (const p of ['deepseek', 'zai', 'openai', 'openrouter']) store.setRuntime(p, { endpoint: `http://127.0.0.1:${server.address().port}/${p}` });
  const opzioni = { providerStore: store, dipendenze: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) }, fallbackProviders: [{ provider: 'zai', model: 'glm-4.7-flash' }], onCambioFornitore: e => eventi.push(e), onConsumoFornitore: e => consumi.push(e), onAvviso: e => eventi.push(e) };
  return { store, opzioni, eventi, consumi, richieste };
}
const rispondiBene = res => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Continuo.' } }], usage: { prompt_tokens: 17, completion_tokens: 3, cost: 0.002 } })); };
const messaggi = [{ role: 'system', content: 'Conserva i risultati.' }, { role: 'user', content: 'Leggi la nota' }, { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'leggi', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 't1', content: 'Nota già letta' }, { role: 'user', content: 'contnua da lì' }];
const chiamata = { modello: 'deepseek:deepseek-chat', chiave: 'finta-iniziale', messaggi, attrezzi: [], dormi: async () => {}, caso: () => 0 };
const esegui = (f, extra = {}) => f.eseguiConFallback(aggiunte => chiamaConRitenta({ ...chiamata, ...extra, ...aggiunte }), { ...chiamata, ...extra });

test('PH-FALLBACK-01 kernel reale: esaurisce quattro tentativi, storia intatta, avviso e consumo effettivo', async t => {
  const b = await banco(t, (req,res) => { if(req.url.startsWith('/deepseek')) { res.writeHead(503); res.end('Service unavailable'); } else rispondiBene(res); });
  const f = creaFetchMultiProvider(fetch, b.opzioni);
  const risultato = await esegui(f);
  assert.equal(risultato.scelta.content, 'Continuo.');
  assert.equal(b.eventi.filter(e => e.tipo === 'cambio-fornitore').length, 1);
  assert.match(b.eventi.find(e => e.tipo === 'cambio-fornitore').messaggio, /DeepSeek.*Z\.AI.*glm-4.7-flash/);
  assert.equal(risultato.fornitoreEffettivo, 'zai');
  assert.equal(b.consumi.at(-1).provider, 'zai');
  assert.equal(b.consumi.at(-1).costoDichiarato, 0.002);
  const ultimo = b.richieste.at(-1); assert.equal(ultimo.body.model, 'glm-4.7-flash');
  assert.deepEqual(ultimo.body.messages, b.richieste[0].body.messages);
  assert.equal(JSON.stringify([b.eventi,b.consumi]).includes('finta-'), false);
  assert.equal(b.richieste.length, 5, 'quattro richieste reali al primario prima della riserva');
});

test('PH-FALLBACK-02 classe permanente: niente fallback, credenziale segnalata una volta', async t => {
  const b = await banco(t, (_req,res) => { res.writeHead(401); res.end('invalid api key'); });
  await assert.rejects(esegui(creaFetchMultiProvider(fetch,b.opzioni)), { code: 'PROVIDER_REQUEST_ERROR', message: /Credential rejected/u });
  assert.equal(b.richieste.length, 1);
  assert.equal(b.eventi.filter(e=>e.tipo==='cambio-fornitore').length, 0);
});

for (const stato of [401, 403]) test(`P2-KEYLESS-${stato} endpoint locale senza chiave: stato preservato, nessuna chiave inventata o retry`, async t => {
  const b = await banco(t, (_req, res) => { res.writeHead(stato); res.end('invalid api key'); }, {});
  const endpoint = b.opzioni.dipendenze.leggiRuntime('deepseek').endpoint.replace(/\/deepseek$/u, '/ollama');
  b.store.setRuntime('ollama', { endpoint });
  const f = creaFetchMultiProvider(fetch, b.opzioni);
  await assert.rejects(esegui(f, { modello: 'ollama:qwen3' }), error => {
    assert.equal(error.stato, stato);
    assert.doesNotMatch(error.message, /Credenziale rifiutata|chiave.*rifiutata|Credential rejected|key.*rejected/iu);
    assert.match(error.message, stato === 401 ? /sign in|address|endpoint/iu : /access|permission/iu);
    return true;
  });
  assert.equal(b.richieste.length, 1);
  assert.equal(b.richieste[0].chiave, undefined);
  assert.equal(b.eventi.some(e => typeof e === 'string' && /chiave.*rifiutata/iu.test(e)), false);
  assert.equal(b.eventi.some(e => e.tipo === 'cambio-fornitore'), false);
  assert.equal(b.store.elencaPool('ollama').length, 0);
});

test('P2-OPTIONAL-KEY-403 un divieto di accesso non mette in panchina la chiave facoltativa', async t => {
  const b = await banco(t, (_req, res) => { res.writeHead(403); res.end('permission denied'); }, {});
  const endpoint = b.opzioni.dipendenze.leggiRuntime('deepseek').endpoint.replace(/\/deepseek$/u, '/ollama');
  b.store.setRuntime('ollama', { endpoint });
  b.store.setKey('ollama', 'finta-ollama');
  const f = creaFetchMultiProvider(fetch, b.opzioni);
  await assert.rejects(esegui(f, { modello: 'ollama:qwen3' }), error => {
    assert.equal(error.stato, 403);
    assert.match(error.message, /access|permission/iu);
    return true;
  });
  assert.equal(b.richieste.length, 1);
  assert.equal(b.richieste[0].chiave, 'Bearer finta-ollama');
  assert.equal(b.store.scegliChiave('ollama')?.chiave, 'finta-ollama');
  assert.equal(b.eventi.some(e => typeof e === 'string' && /chiave.*rifiutata/iu.test(e)), false);
});

test('PH-FALLBACK-03 esclusione senza chiave e modello senza attrezzi', async t => {
  const b = await banco(t, (_req,res) => { res.writeHead(429); res.end('rate limit'); }, { DEEPSEEK_API_KEY: 'finta-deepseek' });
  await assert.rejects(esegui(creaFetchMultiProvider(fetch,b.opzioni)), { code: 'PROVIDER_REQUEST_ERROR', message: /Too much traffic/u });
  assert.equal(b.richieste.some(r=>r.url.startsWith('/zai')), false);
  b.store.setKey('zai','finta-zai');
  const f = creaFetchMultiProvider(fetch, { ...b.opzioni, fallbackProviders: [{provider:'zai',model:'modello-ignoto'}] });
  await assert.rejects(esegui(f, { attrezzi: [{type:'function',function:{name:'leggi',parameters:{type:'object'}}}] }), { code: 'PROVIDER_REQUEST_ERROR', message: /Too much traffic/u });
  assert.equal(b.richieste.some(r=>r.url.startsWith('/zai')), false);
});

test('PH-FALLBACK-04 due chiavi: il 429 mette in panchina solo la prima e la seconda serve il kernel', async t=>{
  const b=await banco(t,(req,res)=>{if(req.headers.authorization==='Bearer finta-deepseek'){res.writeHead(429,{'Retry-After':'120'});res.end('rate limit');}else rispondiBene(res);});
  b.store.aggiungiChiave('deepseek','finta-seconda');
  const r=await esegui(creaFetchMultiProvider(fetch,b.opzioni));
  assert.equal(r.tentativi,2);assert.equal(r.fornitoreEffettivo,'deepseek');
  assert.equal(b.eventi.filter(e=>e.tipo==='cambio-fornitore').length,0);
  assert.equal(b.store.elencaPool('deepseek')[0].causa,'traffico');
});
test('PH-FALLBACK-05 stop esplicito: nessuna richiesta o cambio',async t=>{
  const b=await banco(t,(_req,res)=>rispondiBene(res));const stop=new AbortController();stop.abort();
  await assert.rejects(esegui(creaFetchMultiProvider(fetch,b.opzioni),{segnaleStop:stop.signal}), { name: 'AbortError' });
  assert.equal(b.richieste.length,0);assert.equal(b.eventi.length,0);
  assert.equal(b.consumi.length,0,'⛔ 14/09 AL CONTRARIO: uno stop prima della rete non è un giro, e non lascia un consumo');
});
test('PH-FALLBACK-20 stop DOPO che la richiesta è partita: un consumo «fermato» senza numeri, e lo stop resta uno stop',async t=>{
  /* ⛔ 14/09, giro vero della coda: 7 invii, 6 fermati, «1 giro». La chiamata partita e fermata non lasciava traccia. */
  const b=await banco(t,(_req,res)=>{
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    res.write('data: '+JSON.stringify({choices:[{delta:{content:'Sto ragionando'}}]})+'\n\n');
    setTimeout(()=>{try{res.end();}catch{}},3000);
  });
  const stop=new AbortController();
  await assert.rejects(esegui(creaFetchMultiProvider(fetch,b.opzioni),{segnaleStop:stop.signal,onDelta:()=>stop.abort()}), /stopped on request while the model was answering/u);
  assert.equal(b.richieste.length,1,'la richiesta è partita una volta sola, e nessun cambio di fornitore dopo lo stop');
  assert.equal(b.eventi.filter(e=>e.tipo==='cambio-fornitore').length,0);
  const fermati=b.consumi.filter(c=>c.esito==='fermato');
  assert.equal(fermati.length,1,`consumi visti: ${JSON.stringify(b.consumi)}`);
  assert.equal(fermati[0].usage,null,'nessun numero inventato: i token di uno stream interrotto non arrivano');
  assert.equal(fermati[0].costoDichiarato,null);
  assert.equal(fermati[0].provider,'deepseek');
});
test('PH-FALLBACK-06 errore di rete incerto: nessun reinvio o cambio',async t=>{
  const b=await banco(t,(_req,res)=>rispondiBene(res));let chiamateKernel=0;
  const f=creaFetchMultiProvider(async(url,init)=>{if(String(url).includes('/deepseek'))throw new TypeError('fetch failed');return fetch(url,init);},b.opzioni);
  await assert.rejects(f.eseguiConFallback(aggiunte=>chiamaConRitenta({...chiamata,...aggiunte,fetchDiRete:(...args)=>{chiamateKernel++;return aggiunte.fetchDiRete(...args);}}),chiamata), {code:'PROVIDER_OUTCOME_UNKNOWN'});
  assert.equal(chiamateKernel,1);assert.equal(b.eventi.length,0);
});
test('PH-FALLBACK-07 errore dopo il 200: separa la risposta parziale e conserva la storia',async t=>{
  const b=await banco(t,(req,res)=>{
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    if(req.url.startsWith('/deepseek')){
      res.write('data: '+JSON.stringify({choices:[{delta:{content:'Testo parziale.'}}]})+'\n\n');
      setTimeout(()=>res.destroy(),20);
    }else{
      res.end('data: '+JSON.stringify({choices:[{delta:{content:'Continuo.'},finish_reason:'stop'}],usage:{prompt_tokens:17,completion_tokens:3,cost:0.002}})+'\n\ndata: [DONE]\n\n');
    }
  });
  const delte=[];
  await assert.rejects(esegui(creaFetchMultiProvider(fetch,b.opzioni),{onDelta:d=>delte.push(d)}),e=>e.code==='PROVIDER_OUTCOME_UNKNOWN'&&e.parziale?.content==='Testo parziale.');
  assert.equal(b.richieste.length,1);
  assert.equal(b.eventi.filter(e=>e.tipo==='cambio-fornitore').length,0);
  assert.equal(delte.filter(e=>e.tipo==='testo').map(e=>e.delta).join(''),'Testo parziale.');
  assert.equal(b.consumi[0].usage,null);assert.equal(b.consumi[0].costoDichiarato,null);
});
test('PH-FALLBACK-08 credito e contesto non diventano transitori per un 429 o 503',async t=>{
  for(const [status,testo]of [[429,'insufficient_quota'],[503,'context_length exceeded']]){
    const b=await banco(t,(_req,res)=>{res.writeHead(status);res.end(testo);});
    await assert.rejects(esegui(creaFetchMultiProvider(fetch,b.opzioni)),e=>e.transitorio===false);
    assert.equal(b.eventi.filter(e=>e.tipo==='cambio-fornitore').length,0);
  }
});
test('PH-FALLBACK-09 senza canale onesto e kernel privo di contratto: rifiuto esplicito',async t=>{
  const b=await banco(t,(_req,res)=>rispondiBene(res));
  assert.throws(()=>creaFetchMultiProvider(fetch,{...b.opzioni,onCambioFornitore:null}),{code:'PROVIDER_FALLBACK_NOT_CONNECTED'});
  // 12/09, review: il kernel del repo dichiara SUPPORTA_FALLBACK_FORNITORI da quando la patch di integrazione è applicata;
  // il rifiuto esplicito arriva quindi dal canale mancante (avvisi/consumi), non più dal contratto del motore.
  const adapter=createOwnerRuntimeAdapter();
  await assert.rejects(adapter.talosLavora({fallbackProviders:b.opzioni.fallbackProviders}),{code:'PROVIDER_FALLBACK_NOT_CONNECTED'});
  const senzaContratto=createOwnerRuntimeAdapter({modulePath:fileURLToPath(new URL('./fixtures/kernel-senza-contratto-fallback.mjs',import.meta.url))});
  await assert.rejects(senzaContratto.talosLavora({fallbackProviders:b.opzioni.fallbackProviders}),{code:'PROVIDER_FALLBACK_CONTRACT_REQUIRED'});
});
test('PH-FALLBACK-10 avviso non depositato: nessuna chiamata alla riserva',async t=>{
  const b=await banco(t,(_req,res)=>{res.writeHead(503);res.end('upstream error');});
  await assert.rejects(esegui(creaFetchMultiProvider(fetch,{...b.opzioni,onCambioFornitore:()=>{throw new Error('deposito non disponibile');}})), /deposito non disponibile/u);
  assert.equal(b.richieste.some(r=>r.url.startsWith('/zai')),false);
});
test('PH-FALLBACK-11 whitelist usage: nessun campo estraneo nei consumi pubblici',async t=>{
  const b=await banco(t,(_req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'Ciao'}}],usage:{prompt_tokens:1,completion_tokens:2,debug:'finta-segreta',cost:0.1}}));});
  await esegui(creaFetchMultiProvider(fetch,b.opzioni));
  assert.equal(JSON.stringify(b.consumi).includes('finta-segreta'),false);
});
test('PH-FALLBACK-12 coppie malformate e capacità autoproclamate respinte',()=>{
  for(const v of [null,{},[{provider:'no',model:'x'}],[{provider:'zai',model:'x',key:'finta'}],[{provider:'zai',model:'x',toolCalling:true}],[{provider:'zai',model:'https://altro.test'}]])assert.throws(()=>validaFallbackProviders(v), { name: 'ModelDestinationError', code: 'PROVIDER_FALLBACK_INVALID' });
  assert.throws(()=>validaFallbackProviders([{provider:'zai',model:'ignoto'}],{usaAttrezzi:true}),{code:'PROVIDER_FALLBACK_TOOLS_UNSUPPORTED'});
});
test('PH-FALLBACK-13 SDK nativo: il 503 esaurisce il budget del kernel prima del cambio',async t=>{
  const b=await banco(t,(req,res)=>{if(req.url.startsWith('/openai')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'upstream error'}}));}else rispondiBene(res);},{OPENAI_API_KEY:'finta-openai',ZAI_API_KEY:'finta-zai'});
  const f=creaFetchMultiProvider(fetch,b.opzioni);let tentativi=0;
  const opzioni={...chiamata,modello:'openai:gpt-5-nano'};
  await f.eseguiConFallback(aggiunte=>chiamaConRitenta({...opzioni,...aggiunte,fetchDiRete:(...args)=>{tentativi++;return aggiunte.fetchDiRete(...args);}}),opzioni);
  assert.equal(tentativi,5);assert.equal(b.richieste[0].url,'/openai/responses');
  assert.equal(b.richieste.length,5,'SDK maxRetries:0: budget kernel senza tentativi locali fantasma');
});
test('PH-FALLBACK-14 OpenRouter: indirizzo configurato e chiave selezionata, mai Authorization precedente',async t=>{
  const b=await banco(t,(req,res)=>{if(req.headers.authorization==='Bearer finta-router'){res.writeHead(429);res.end('rate limit');}else rispondiBene(res);},{OPENROUTER_API_KEY:'finta-router',ZAI_API_KEY:'finta-zai'});
  b.store.aggiungiChiave('openrouter','finta-router-seconda');
  const r=await esegui(creaFetchMultiProvider(fetch,b.opzioni),{modello:'openai/gpt-5-nano'});
  assert.equal(r.fornitoreEffettivo,'openrouter');assert.equal(r.tentativi,2);
  assert.equal(b.richieste[0].url,'/openrouter/chat/completions');assert.equal(b.richieste[1].chiave,'Bearer finta-router-seconda');
});
test('PH-FALLBACK-15 motore locale: il pool non cerca una credenziale inesistente',async()=>{
  const store=createProviderCredentialStore({env:{}});let chiamate=0;
  const f=creaFetchMultiProvider(()=>{throw new Error('rete non consentita');},{providerStore:store,dipendenze:{leggiChiave:p=>store.getKey(p),leggiRuntime:p=>store.getRuntime(p),localePronto:()=>true,chiamaLocale:async()=>{chiamate++;return Response.json({choices:[{message:{content:'Locale'}}]});}}});
  const r=await f('https://openrouter.ai/api/v1/chat/completions',{body:JSON.stringify({model:'local:prova',messages:[]})});
  assert.equal(r.status,200);assert.equal(chiamate,1);
});
test('PH-FALLBACK-16 errore nel deposito del consumo riuscito non chiama un altro fornitore',async t=>{
  const b=await banco(t,(_req,res)=>rispondiBene(res));
  await assert.rejects(esegui(creaFetchMultiProvider(fetch,{...b.opzioni,onConsumoFornitore:()=>{throw new Error('network del deposito');}})), /network del deposito/u);
  assert.equal(b.richieste.length,1);assert.equal(b.eventi.length,0);
});
test('PH-FALLBACK-17 il planner non eredita il cambio del modello principale',async t=>{
  const b=await banco(t,(req,res)=>{if(req.url.startsWith('/deepseek')){res.writeHead(503);res.end('upstream error');}else rispondiBene(res);});
  const f=creaFetchMultiProvider(fetch,{...b.opzioni,modelloSessione:chiamata.modello});
  await esegui(f);
  await esegui(f,{modello:'zai:glm-4.7'});
  assert.equal(b.richieste.at(-1).body.model,'glm-4.7');
});
test('PH-FALLBACK-18 due turni: nessun ritorno silenzioso, URL e refuso restano nella conversazione',async t=>{
  const b=await banco(t,(req,res)=>{if(req.url.startsWith('/deepseek')){res.writeHead(503);res.end('upstream error');}else rispondiBene(res);});
  const f=creaFetchMultiProvider(fetch,b.opzioni);const primo=await esegui(f);
  await esegui(f,{messaggi:[...messaggi,primo.scelta,{role:'user',content:'contnua dalla nota https://example.test/nota'}]});
  assert.equal(b.eventi.filter(e=>e.tipo==='cambio-fornitore').length,1);
  assert.equal(b.richieste.at(-1).body.messages.at(-1).content,'contnua dalla nota https://example.test/nota');
  assert.equal(b.richieste.at(-1).body.model,'glm-4.7-flash');
});
test('PH-FALLBACK-19 timeout del trasporto classificato da BC-44',async t=>{
  const b=await banco(t,(_req,res)=>rispondiBene(res));
  const f=creaFetchMultiProvider(async(url,init)=>{if(String(url).includes('/deepseek'))throw new DOMException('Tempo massimo','TimeoutError');return fetch(url,init);},b.opzioni);
  await assert.rejects(esegui(f),e=>e.code==='PROVIDER_OUTCOME_UNKNOWN'&&e.classe==='timeout-fornitore');
  assert.equal(b.eventi.length,0);
});

/*
 * ⛔⛔⛔ CLI-REQ-03 (17/09/2026) — LA CHIAVE CHE MANCA NON È UN RIFIUTO DEL FORNITORE.
 *
 * La prova si scrive sulla strada VERA del runtime, `eseguiConFallback`, e non sulla fetch nuda:
 * lì l'errore usciva già giusto (`PROVIDER_KEY_MISSING`, zero consumi), e una prova scritta su
 * quella strada sarebbe passata PER COSTRUZIONE senza toccare il difetto.
 * Misurato prima della cura, su questa stessa prova: `PROVIDER_REQUEST_ERROR` «Il fornitore non ha
 * accettato la richiesta.» (classe `ignoto`) con **0 chiamate di rete** e **1 consumo scritto**
 * (`esito: 'interrotto'`) — cioè una ricevuta per una chiamata mai partita, e una diagnosi che
 * accusa il fornitore di una cosa che l'utente può risolvere in dieci secondi.
 *
 * ⛔ I due numeri della prova non sono decorazione: senza `richieste.length === 0` un domani
 *   basterebbe partire davvero in rete per farla passare, e senza `consumi` vuoto la ricevuta
 *   fantasma tornerebbe senza che nessuno se ne accorga.
 */
test('PH-FALLBACK-21 chiave mancante: errore PROVIDER_KEY_MISSING col nome umano, nessun consumo, nessuna chiamata (CLI-REQ-03)',async t=>{
  const b=await banco(t,(_req,res)=>rispondiBene(res),{}); // ⛔ ambiente SENZA chiavi: è la condizione del difetto
  const f=creaFetchMultiProvider(fetch,b.opzioni);
  await assert.rejects(()=>esegui(f),(errore)=>{
    assert.equal(errore.code,'PROVIDER_KEY_MISSING','la chiave che manca non si travveste da rifiuto del fornitore');
    assert.match(errore.message,/The key for DeepSeek is missing\./,'a schermo va il nome umano del fornitore, non il suo id');
    return true;
  });
  assert.deepEqual(b.consumi,[],'nessuna ricevuta per una chiamata mai partita');
  assert.equal(b.richieste.length,0,'e nessuna chiamata di rete, davvero');
});

/*
 * ⛔⛔ 24/09/2026 sera (bug dell'owner, decisione «continuare, come Hermes») — il flusso che si rompe a metà sulla strada
 *   VERA del runtime (`eseguiConFallback`, nessuna riserva): l'errore pubblico in italiano deve portare con sé il testo già
 *   arrivato, perché è il kernel a decidere di continuare da lì. Prima della cura arrivava la frase, e il testo no.
 */
test('PH-FALLBACK-STREAM-BREAK: senza riserva, testo conservato ed esito incerto non ritentabile', async t => {
  const b = await banco(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Ecco il riepilogo' } }] })}\n\n`);
    setTimeout(() => res.socket.destroy(), 30);
  });
  const f = creaFetchMultiProvider(fetch, { ...b.opzioni, fallbackProviders: [] });
  await assert.rejects(() => esegui(f, { onDelta: () => {} }), (errore) => {
    assert.equal(errore.code, 'PROVIDER_OUTCOME_UNKNOWN');
    assert.equal(errore.transitorio, false, 'il guasto di rete non prova che la generazione non sia avvenuta');
    assert.equal(errore.parziale?.content, 'Ecco il riepilogo', 'il testo arrivato viaggia con l\'errore');
    return true;
  });
});

/*
 * ⛔⛔⛔ 25/09/2026 sera — sessione VERA dell'owner (65d5683b, MiniCPM5-2B F16, «ciao» sul 4174): due volte
 *   «Il fornitore non ha accettato la richiesta.» (`PROVIDER_REQUEST_ERROR`, classe `ignoto`). Nessun fornitore era
 *   stato chiamato: il 4174 serviva una cartella senza il motore llama.cpp (`/api/v1/setup/stato` →
 *   `localeConfigurato: false`), l'avvio automatico lanciava `LOCAL_RUNTIME_NOT_CONFIGURED`, e il catch del ripiego
 *   lo classificava come un rifiuto del fornitore. È la STESSA forma della chiave mancante (PH-FALLBACK-21), su
 *   un'altra condizione nata prima della rete; Hermes ha avuto lo stesso difetto (NousResearch/hermes-agent #7512:
 *   il ripiego copre l'errore originale del modello locale) e il suo classificatore tiene sempre il messaggio
 *   originale (`agent/error_classifier.py:1442-1445`, `_extract_message`, clone 65ad529 del 23/09).
 * Misurato prima della cura, con una riproduzione che rifà il 4174 (archivio con tre chiavi, nessuna rete):
 *   `PROVIDER_REQUEST_ERROR` «Il fornitore non ha accettato la richiesta.»; senza l'archivio, la stessa sessione
 *   diceva già il vero (`LOCAL_RUNTIME_NOT_CONFIGURED`) — il difetto sta SOLO nel catch del ripiego.
 * ⛔ Anche qui i due numeri contano: nessuna ricevuta, nessuna chiamata — e nessun cambio di fornitore, perché un
 *   GGUF che sta in casa non si «ripiega» su un cloud (è già la regola di BC-79.2).
 */
const localeCon = (b, dipendenzeLocali) => ({ ...b.opzioni, dipendenze: { ...b.opzioni.dipendenze, ...dipendenzeLocali } });
const erroreCon = (messaggio, code) => Object.assign(new Error(messaggio), { code });
test('PH-FALLBACK-22 motore locale non configurato: il suo errore, nessun consumo, nessuna chiamata, nessun ripiego', async t => {
  const b = await banco(t, (_req, res) => rispondiBene(res));
  const f = creaFetchMultiProvider(fetch, localeCon(b, {
    localePronto: () => false,
    avviaLocale: () => { throw erroreCon('Il motore locale non è configurato su questo server.', 'LOCAL_RUNTIME_NOT_CONFIGURED'); },
  }));
  await assert.rejects(() => esegui(f, { modello: 'local:un-gguf' }), (errore) => {
    assert.equal(errore.code, 'LOCAL_RUNTIME_NOT_CONFIGURED', 'un motore che manca non è un fornitore che rifiuta');
    assert.match(errore.message, /motore locale non è configurato/u);
    return true;
  });
  assert.deepEqual(b.consumi, [], 'nessuna ricevuta per una chiamata mai partita');
  assert.equal(b.richieste.length, 0, 'nessuna chiamata di rete, nemmeno verso il fornitore di riserva');
  assert.equal(b.eventi.filter((e) => e.tipo === 'cambio-fornitore').length, 0, 'e nessun cambio di fornitore');
});
test('PH-FALLBACK-23 motore locale morto all\'avvio: arriva la sua frase con le righe del motore', async t => {
  const b = await banco(t, (_req, res) => rispondiBene(res));
  const f = creaFetchMultiProvider(fetch, localeCon(b, {
    localePronto: () => false,
    avviaLocale: () => { throw erroreCon('llama-server si è chiuso dopo 3 s senza mai diventare pronto: unknown model architecture', 'RUNTIME_PROCESS_FAILED'); },
  }));
  await assert.rejects(() => esegui(f, { modello: 'local:un-gguf' }), (errore) => {
    assert.equal(errore.code, 'RUNTIME_PROCESS_FAILED');
    assert.match(errore.message, /unknown model architecture/u, 'la causa vera resta leggibile');
    return true;
  });
  assert.deepEqual(b.consumi, []);
  assert.equal(b.richieste.length, 0);
  // 25/09 sera, Qwen3.8-27B dell'owner: un modello che non entra nella scheda ha il suo codice, e passa com'è anche lui
  const g = creaFetchMultiProvider(fetch, localeCon(b, {
    localePronto: () => false,
    avviaLocale: () => { throw erroreCon('Il modello (16,7 GB) non entra nella memoria della scheda grafica (AMD Radeon RX 9070 XT: 15,9 GB, liberi 15,1 GB).', 'RUNTIME_OUT_OF_MEMORY'); },
  }));
  await assert.rejects(() => esegui(g, { modello: 'local:un-gguf' }), (errore) => {
    assert.equal(errore.code, 'RUNTIME_OUT_OF_MEMORY');
    assert.match(errore.message, /non entra nella memoria della scheda grafica/u);
    return true;
  });
  // 27/09, Spark-X2.5-4B dell'owner (sessione ec3bc6c0): un'architettura che il motore non sa leggere passa com'è, con la sua frase
  const h = creaFetchMultiProvider(fetch, localeCon(b, {
    localePronto: () => false,
    avviaLocale: () => { throw erroreCon('Il modello usa l’architettura «spark2_5», che il motore installato (llama.cpp b10517) non sa leggere: serve una versione più recente del motore, e riprovare non cambia niente.', 'RUNTIME_ARCH_UNSUPPORTED'); },
  }));
  await assert.rejects(() => esegui(h, { modello: 'local:un-gguf' }), (errore) => {
    assert.equal(errore.code, 'RUNTIME_ARCH_UNSUPPORTED');
    assert.match(errore.message, /«spark2_5».*llama\.cpp b10517/u);
    return true;
  });
  assert.deepEqual(b.consumi, [], 'nessuna ricevuta per un motore che non è partito');
  assert.equal(b.richieste.length, 0, 'e nessuna chiamata di rete');
});
test('PH-FALLBACK-24 indirizzo del motore mancante: errore di configurazione, non un rifiuto', async t => {
  const b = await banco(t, (_req, res) => rispondiBene(res));
  const f = creaFetchMultiProvider(fetch, localeCon(b, { leggiRuntime: () => ({}) }));
  await assert.rejects(() => esegui(f, { modello: 'ollama:qwen3' }), (errore) => {
    assert.equal(errore.code, 'PROVIDER_RUNTIME_INVALID');
    assert.match(errore.message, /The address for .* is missing/u);
    return true;
  });
  assert.deepEqual(b.consumi, []);
  assert.equal(b.richieste.length, 0);
});
/*
 * ⛔⛔ 25/09/2026 sera, MiniCPM5 (sessione 5233facd): il 400 `exceed_context_size_error` di llama-server, sulla strada VERA del
 *   4174 (archivio con chiavi, `eseguiConFallback`), deve arrivare al kernel col suo codice e i suoi numeri — mascherato da
 *   «richiesta non valida» il kernel non potrebbe comprimere. Con e senza attrezzi nel corpo, e mai una riprova senza.
 */
test('PH-FALLBACK-25 contesto pieno del motore locale: il suo codice e i suoi numeri, con e senza attrezzi, nessuna riprova', async t => {
  const pieno = JSON.stringify({ error: { code: 400, message: 'request (17230 tokens) exceeds the available context size (16384 tokens), try increasing it', type: 'exceed_context_size_error', n_prompt_tokens: 17230, n_ctx: 16384 } });
  for (const attrezzi of [[], [{ type: 'function', function: { name: 'leggi', description: 'legge', parameters: { type: 'object', properties: {} } } }]]) {
    const b = await banco(t, (_req, res) => rispondiBene(res));
    const locali = [];
    const f = creaFetchMultiProvider(fetch, localeCon(b, {
      localePronto: () => true,
      chiamaLocale: async (_percorso, opzioni) => { locali.push(JSON.parse(opzioni.body)); return new Response(pieno, { status: 400, headers: { 'Content-Type': 'application/json' } }); },
    }));
    await assert.rejects(() => esegui(f, { modello: 'local:un-gguf', attrezzi }), (errore) => {
      assert.equal(errore.code, 'LOCAL_CONTEXT_EXCEEDED', `con ${attrezzi.length} attrezzi: il suo codice, non un guasto del fornitore`);
      assert.match(errore.message, /\(17230 tokens\).*\(16384 tokens\)/u);
      return true;
    });
    assert.equal(locali.length, 1, `con ${attrezzi.length} attrezzi: nessuna riprova senza attrezzi`);
    assert.deepEqual(b.consumi, []);
    assert.equal(b.richieste.length, 0, 'e nessun fornitore di riserva');
  }
});

/*
 * ⛔⛔ 25/09/2026 notte (sessione vera `c15ba17c…`, Gemini 3.8, decisione owner «come Hermes, in piccolo») — la risposta VUOTA
 *   sulla strada vera del runtime. Prima: il kernel lanciava «flusso SSE senza contenuto», questo catch la chiamava
 *   `flusso-interrotto`, metteva IN PANCHINA il fornitore, scriveva una ricevuta senza token e cercava una riserva.
 *   Ora torna come risposta marcata `vuota` (decide il ciclo di `talosLavora`): ricevuta «completato» coi token veri,
 *   nessun cambio di fornitore, nessuna panchina (la chiamata dopo va di nuovo allo stesso fornitore).
 */
test('PH-FALLBACK-EMPTY: una risposta vuota non è un guasto del fornitore, e la ricevuta conta i suoi token', async t => {
  const b = await banco(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning: 'penso al file intero' } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '' }, finish_reason: 'stop' }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 50, completion_tokens: 6, cost: 0.001 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  const f = creaFetchMultiProvider(fetch, b.opzioni);
  const risultato = await esegui(f, { onDelta: () => {}, accettaVuota: true });
  assert.equal(risultato.vuota?.finishReason, 'stop');
  assert.equal(b.consumi.length, 1);
  assert.equal(b.consumi[0].esito, 'completato');
  assert.equal(b.consumi[0].costoDichiarato, 0.001, 'il costo della chiamata vuota è nella ricevuta');
  assert.equal(b.eventi.filter((e) => e.tipo === 'cambio-fornitore').length, 0, 'nessuna riserva');
  await esegui(f, { onDelta: () => {}, accettaVuota: true });
  assert.deepEqual(b.richieste.map((r) => r.url.split('/')[1]), ['deepseek', 'deepseek'], 'il fornitore non è finito in panchina');
});
