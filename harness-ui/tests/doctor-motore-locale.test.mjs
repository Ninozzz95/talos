/*
 * 023 cura piccola, punto 5 (owner 11/11/2026 13:50, decisione 9: «Sì, prova vera»; giudice v1477, correzioni 3 e 4) — «Prova il motore
 * locale» del Doctor. Il motore è quello VERO del server (`createLlamaServerRuntime`, lo stesso che `server.mjs` mette in
 * `localRuntimes['llama.cpp']`); sotto, un router finto che segue la regola di caricamento di llama.cpp copiata dal sorgente
 * (`llama.cpp-2026-11-01/tools/server/server-models.cpp:1961` «model is not loaded» senza autoload, `:1968-1975` `?autoload=`, `:2088-2101`
 * il POST che carica il modello se l'autoload è acceso) e CONTA i caricamenti. Le risposte in SSE sono quelle di
 * `tests/local-runtime-llama-server.test.mjs` (`sseResponse`).
 * ⛔ Il Doctor non carica e non scarica mai un modello: 0 caricamenti in ogni caso.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createLlamaServerRuntime } from '../src/local-runtime-llama-server.mjs';
import { provaIlMotoreLocale, statoDalSupervisore } from '../src/doctor-motore-locale.mjs';
import { readFileSync } from 'node:fs';
import { createHttpApp } from '../src/http-app.mjs';
import { ORIGINE_REMOTA } from '../src/origine-remota.mjs';

function sseResponse(events, { status = 200, ok = true } = {}) {
  const encoder = new TextEncoder();
  const payload = events.map((event) => `data: ${event}\n\n`).join('') + 'data: [DONE]\n\n';
  return { ok, status, text: async () => 'upstream error', body: new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(payload)); controller.close(); } }) };
}

/** Il router finto: un modello residente o nessuno; un POST su un modello non residente lo CARICA se l'autoload è acceso (llama.cpp). */
function motoreFinto({ residente = null, autoload = true, rispondi = () => sseResponse([JSON.stringify({ choices: [{ delta: { content: 'OK' }, finish_reason: 'length' }] })]) } = {}) {
  const conti = { caricamenti: 0, richieste: [], avvii: 0 };
  const supervisor = {
    status: () => (residente ? { state: 'ready', runtimeId: 'llama.cpp', modelId: residente, baseUrl: 'http://127.0.0.1:18080' } : { state: 'unavailable', runtimeId: 'llama.cpp' }),
    health: async () => ({ ok: true, status: 200 }),
    start: async (opzioni) => { conti.avvii += 1; conti.caricamenti += 1; residente = opzioni.modelId; return supervisor.status(); },
    stop: async () => { residente = null; return supervisor.status(); },
  };
  const fetchImpl = async (url, opzioni = {}) => {
    const corpo = opzioni.body ? JSON.parse(opzioni.body) : null;
    conti.richieste.push({ url, corpo });
    const conAutoload = new URL(url).searchParams.get('autoload');
    const carica = conAutoload === null ? autoload : conAutoload === 'true' || conAutoload === '1';
    if (corpo?.model && corpo.model !== residente) {
      if (!carica) return { ok: false, status: 400, text: async () => 'model is not loaded' };
      conti.caricamenti += 1; residente = corpo.model;
    }
    return rispondi(corpo);
  };
  const llama = createLlamaServerRuntime({ supervisor, fetchImpl });
  /* la stessa forma di `localRuntimes['llama.cpp']` in `server.mjs` (detect, generateStream) */
  const motore = {
    detect: async () => { const s = supervisor.status(); return { state: 'observed', runtimeId: 'llama.cpp', runtimeState: s.state, modelId: s.modelId ?? null }; },
    load: async (modelId) => llama.load({ modelId }),
    /* la lettura dello stato (giro dopo il revisore): il router dice «loaded» per il modello residente (`server-models.cpp:2149-2151`) */
    statoDelMotore: async () => new Response(JSON.stringify({ object: 'list', data: residente ? [{ id: residente, status: { value: 'loaded' } }] : [] }), { status: 200 }),
    generateStream: (opzioni) => llama.generateStream(opzioni),
  };
  return { motore, conti };
}
const installati = (...ids) => async () => ids.map((id) => ({ id, repo: `org/${id}`, state: 'ready' }));
let orologio = 0;
const adessoMs = () => (orologio += 400);

test('DOCTOR-MOTORE-01 nessun modello locale installato: lo dice, nessuna richiesta, nessun caricamento né scaricamento', async () => {
  const { motore, conti } = motoreFinto();
  assert.deepEqual(await provaIlMotoreLocale({ modelli: installati(), motore }), { esito: 'nessunModello' });
  assert.deepEqual(await provaIlMotoreLocale({ modelli: async () => [{ id: 'a', state: 'downloading' }], motore }), { esito: 'nessunModello' }, 'uno scaricamento a metà non è un modello');
  assert.equal(conti.richieste.length, 0);
  assert.equal(conti.caricamenti, 0);
});

test('DOCTOR-MOTORE-02 modelli installati ma nessuno caricato: «nessun modello caricato», e il Doctor NON ne carica uno (0 caricamenti, anche con l’autoload acceso)', async () => {
  const { motore, conti } = motoreFinto({ residente: null, autoload: true });
  assert.deepEqual(await provaIlMotoreLocale({ modelli: installati('qwen3-4b', 'gemma-3'), motore }), { esito: 'nessunCaricato' });
  assert.equal(conti.richieste.length, 0, 'nessuna richiesta al motore');
  assert.equal(conti.caricamenti, 0, 'nessun caricamento');
  assert.equal(conti.avvii, 0);
});

test('DOCTOR-MOTORE-03 un modello caricato: una richiesta minima A QUEL modello (1 token), esito e tempo; 0 caricamenti', async () => {
  const { motore, conti } = motoreFinto({ residente: 'qwen3-4b' });
  orologio = 0;
  const esito = await provaIlMotoreLocale({ modelli: installati('gemma-3', 'qwen3-4b'), motore, adessoMs });
  assert.deepEqual(esito, { esito: 'risponde', modelId: 'qwen3-4b', nome: 'org/qwen3-4b', ms: 400 });
  assert.equal(conti.richieste.length, 1);
  assert.equal(conti.richieste[0].corpo.model, 'qwen3-4b', 'la richiesta va al modello già caricato');
  assert.equal(conti.richieste[0].corpo.max_tokens, 1, 'una richiesta minima');
  assert.equal(conti.richieste[0].corpo.messages.length, 1);
  assert.equal(conti.caricamenti, 0, 'nessun caricamento');
});

test('DOCTOR-MOTORE-04 errore del motore e attesa finita: «errore» col tempo e il codice, mai un’eccezione; 0 caricamenti', async () => {
  const rotto = motoreFinto({ residente: 'qwen3-4b', rispondi: () => ({ ok: false, status: 503, text: async () => 'loading' }) });
  const esito = await provaIlMotoreLocale({ modelli: installati('qwen3-4b'), motore: rotto.motore, adessoMs });
  assert.equal(esito.esito, 'errore');
  assert.equal(esito.codice, 'RUNTIME_HTTP_ERROR');
  assert.ok(Number.isInteger(esito.ms) && esito.ms >= 0);
  const fermo = motoreFinto({ residente: 'qwen3-4b', rispondi: () => ({ ok: true, status: 200, body: new ReadableStream({ start() { /* non risponde mai */ } }) }) });
  const scaduto = await provaIlMotoreLocale({ modelli: installati('qwen3-4b'), motore: fermo.motore, attesaMs: 50 });
  assert.deepEqual([scaduto.esito, scaduto.codice], ['errore', 'TIMEOUT']);
  assert.equal(rotto.conti.caricamenti + fermo.conti.caricamenti, 0);
  assert.deepEqual(await provaIlMotoreLocale({ modelli: installati('qwen3-4b'), motore: null }), { esito: 'nessunMotore' }, 'senza motore sul computer');
});

async function banco(t, deps) {
  const app = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, ...deps });
  const server = createServer((req, res) => { if (req.headers['x-prova-dal-dispositivo']) req[ORIGINE_REMOTA] = { dispositivoId: 'pad' }; return app(req, res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => { server.closeAllConnections(); server.close(r); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const finestra = { origin: base, 'sec-fetch-site': 'same-origin' };
  const chiedi = async (metodo, intestazioni = finestra, corpo = {}) => {
    const r = await fetch(`${base}/api/v1/doctor/local-engine`, { method: metodo, headers: { 'content-type': 'application/json', ...intestazioni }, ...(metodo === 'POST' ? { body: JSON.stringify(corpo) } : {}) });
    return { stato: r.status, json: await r.json().catch(() => null) };
  };
  return { chiedi };
}

test('DOCTOR-MOTORE-05 la rotta: POST dalla finestra risponde; dal telefono, da un altro sito o senza la finestra 403 come le altre POST di sola origine locale; GET 405', async (t) => {
  const { motore, conti } = motoreFinto({ residente: 'qwen3-4b' });
  const b = await banco(t, { localModelStore: { list: installati('qwen3-4b') }, localRuntimes: { 'llama.cpp': motore } });
  const ok = await b.chiedi('POST');
  assert.equal(ok.stato, 200);
  assert.equal(ok.json.data.esito, 'risponde');
  assert.equal(ok.json.data.modelId, 'qwen3-4b');
  assert.equal(conti.richieste.length, 1);
  for (const [nome, intestazioni] of [['telefono', { 'x-prova-dal-dispositivo': '1' }], ['altro sito', { origin: 'https://cattivo.example', 'sec-fetch-site': 'cross-site' }], ['senza finestra né gettone', {}]]) {
    const no = await b.chiedi('POST', intestazioni);
    assert.equal(no.stato, 403, nome);
  }
  assert.equal(conti.richieste.length, 1, 'una richiesta rifiutata non tocca il motore');
  assert.equal((await b.chiedi('POST', undefined, { modelId: 'altro' })).stato, 400, 'il corpo è vuoto: chi chiama non sceglie il modello');
  assert.equal((await b.chiedi('GET')).stato, 405);
  assert.equal(conti.caricamenti, 0);
});

test('DOCTOR-MOTORE-06 la rotta senza motore né modelli: «nessun modello», mai un errore del server', async (t) => {
  const b = await banco(t, {});
  const r = await b.chiedi('POST');
  assert.equal(r.stato, 200);
  assert.deepEqual(r.json.data, { esito: 'nessunModello' });
});

/*
 * Giro dopo il revisore (giudice v1503, opzione A). Col motore a router ogni modello DORME dopo 15 minuti fermo
 * (`llama-router-supervisor.mjs:77` `DORMI_DOPO_SECONDI`, `:137-139` `sleep-idle-seconds`), il router parte con `--models-autoload` (`:281`),
 * `status()` resta «ready» col modello addormentato (`:443-447`) e la POST di `request()` non mette `autoload=false` (`:1208-1218`): llama.cpp
 * all'uscita dal sonno ricarica il modello (`server-context.cpp:1160-1163`). Il router dice lo stato di ogni modello in `GET /models`,
 * `status.value` = «loaded», «sleeping», «unloaded»… (`server-models.cpp:2149-2151`, `:1889-1891`, `server-models.h:52-61`) e quella rotta
 * non carica niente (`:2133-2185`). Il supervisore finto è quello della sonda del revisore (`C:/T/rev-023-lavoro/sonda-rotta.mjs:20-27`): ha
 * `request` come i due veri, e un figlio che dorme si ricarica alla prima POST. Il Doctor chiede lo stato come Hermes, con `autoload=false`
 * (`hermes_cli/local_runtime/endpoint.py:20-29`) e 3 s (`hermes_cli/web_routers/local_models.py:495`).
 */
function routerFinto({ residente = 'qwen3-4b', stato = 'loaded', conStato = true, guastoStato = null } = {}) {
  const conti = { caricamenti: 0, post: 0, letture: [] };
  let dorme = stato === 'sleeping';
  const supervisor = {
    status: () => ({ state: 'ready', runtimeId: 'llama.cpp', modelId: residente, baseUrl: 'http://127.0.0.1:1' }), // come `:443-447`: ready anche se dorme
    start: async () => { conti.caricamenti += 1; return supervisor.status(); },
    stop: async () => ({}), health: async () => ({ ok: true }),
    request: async (percorso, opzioni = {}) => {
      if (String(opzioni.method ?? 'GET').toUpperCase() === 'GET' && percorso.split('?')[0] === '/models') {
        conti.letture.push({ percorso, conSegnale: opzioni.signal instanceof AbortSignal });
        if (guastoStato === 'lancia') throw Object.assign(new Error('runtime is not ready'), { code: 'RUNTIME_NOT_READY' });
        if (guastoStato === 'http') return new Response('boom', { status: 500 });
        if (guastoStato === 'muto') return new Promise((_, rifiuta) => opzioni.signal?.addEventListener('abort', () => rifiuta(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
        const modello = conStato ? { id: residente, status: { value: dorme ? 'sleeping' : stato } } : { id: residente }; // senza `status`: il motore singolo
        return new Response(JSON.stringify({ object: 'list', data: [modello] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      conti.post += 1;
      if (dorme) { conti.caricamenti += 1; dorme = false; } // il figlio addormentato si ricarica alla prima richiesta (PR #18228)
      return sseResponse([JSON.stringify({ choices: [{ delta: { content: 'OK' }, finish_reason: 'length' }] })]);
    },
  };
  const llama = createLlamaServerRuntime({ supervisor });
  /* la forma di `localRuntimes['llama.cpp']` in `server.mjs`, con la lettura dello stato che passa dal supervisore */
  const motore = {
    detect: async () => { const s = supervisor.status(); return { state: 'observed', runtimeId: 'llama.cpp', runtimeState: s.state, modelId: s.modelId ?? null }; },
    statoDelMotore: (percorso, opzioni) => supervisor.request(percorso, opzioni),
    generateStream: (opzioni) => llama.generateStream(opzioni),
  };
  return { motore, conti };
}

test('DOCTOR-MOTORE-07 modello addormentato (motore a router, 15 minuti fermo): lo dice e NON manda niente, 0 caricamenti (oggi 1)', async () => {
  const { motore, conti } = routerFinto({ stato: 'sleeping' });
  const esito = await provaIlMotoreLocale({ modelli: installati('qwen3-4b'), motore });
  assert.deepEqual(esito, { esito: 'dorme', modelId: 'qwen3-4b', nome: 'org/qwen3-4b' });
  assert.equal(conti.post, 0, 'nessuna richiesta di generazione');
  assert.equal(conti.caricamenti, 0, 'il modello addormentato non si risveglia');
  assert.equal(conti.letture.length, 1, 'una lettura dello stato');
  assert.match(conti.letture[0].percorso, /^\/models\?(.*&)?autoload=false(&|$)/u, 'lo stato si chiede con autoload=false, come Hermes endpoint.py:20-29');
  assert.equal(conti.letture[0].conSegnale, true, 'con un tempo massimo');
});

test('DOCTOR-MOTORE-08 lo stato prima della prova: sveglio ⇒ una richiesta; senza stato (motore singolo) ⇒ una richiesta; scaricato ⇒ niente; illeggibile o muto oltre il tempo ⇒ niente', async () => {
  const sveglio = routerFinto({ stato: 'loaded' });
  assert.equal((await provaIlMotoreLocale({ modelli: installati('qwen3-4b'), motore: sveglio.motore })).esito, 'risponde');
  assert.deepEqual([sveglio.conti.post, sveglio.conti.caricamenti], [1, 0]);
  const singolo = routerFinto({ conStato: false });
  assert.equal((await provaIlMotoreLocale({ modelli: installati('qwen3-4b'), motore: singolo.motore })).esito, 'risponde', 'il motore singolo non dorme e non dice lo stato');
  const scaricato = routerFinto({ stato: 'unloaded' });
  assert.deepEqual(await provaIlMotoreLocale({ modelli: installati('qwen3-4b'), motore: scaricato.motore }), { esito: 'nessunCaricato' });
  for (const guastoStato of ['lancia', 'http', 'muto']) {
    const g = routerFinto({ guastoStato });
    const esito = await provaIlMotoreLocale({ modelli: installati('qwen3-4b'), motore: g.motore, attesaStatoMs: 50 });
    assert.deepEqual(esito, { esito: 'statoIgnoto', modelId: 'qwen3-4b', nome: 'org/qwen3-4b' }, guastoStato);
    assert.deepEqual([g.conti.post, g.conti.caricamenti], [0, 0], `${guastoStato}: senza lo stato non si manda niente`);
  }
  const senza = routerFinto({ stato: 'loaded' });
  delete senza.motore.statoDelMotore;
  assert.equal((await provaIlMotoreLocale({ modelli: installati('qwen3-4b'), motore: senza.motore })).esito, 'statoIgnoto', 'un motore che non sa dire lo stato non riceve la prova');
  assert.equal(senza.conti.post, 0);
});

/* Giro dopo il revisore, mutante D10 sopravvissuto: la lettura dello stato nel server vero non era provata da nessuno. Ora è una funzione del
   modulo, provata qui col supervisore finto, e il server la usa: lo si legge nel sorgente del blocco `localRuntimes['llama.cpp']`. */
test('DOCTOR-MOTORE-09 la lettura dello stato del server: solo la lista dei modelli, col segnale di chi chiede; il server la usa', async () => {
  const chiamate = [];
  const supervisor = { request: async (percorso, opzioni) => { chiamate.push({ percorso, opzioni }); return new Response('{"data":[]}', { status: 200 }); } };
  const leggi = statoDalSupervisore(supervisor);
  const segnale = new AbortController().signal;
  assert.equal((await leggi('/models?autoload=false', { signal: segnale, method: 'POST', body: 'x' })).status, 200);
  assert.deepEqual(chiamate, [{ percorso: '/models?autoload=false', opzioni: { signal: segnale } }], 'solo il segnale passa: mai un metodo o un corpo di chi chiede');
  await assert.rejects(leggi('/v1/chat/completions', {}), { code: 'QUERY_INVALID' });
  await assert.rejects(leggi('/models/load', {}), { code: 'QUERY_INVALID' });
  assert.equal(chiamate.length, 1, 'nessun altro percorso arriva al motore');
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  const blocco = server.slice(server.indexOf("localRuntimes['llama.cpp'] = {"), server.indexOf("localRuntimes['llama.cpp'] = {") + 4000);
  assert.match(blocco, /\n\s+statoDelMotore: statoDalSupervisore\(supervisor\),\n/u, 'il motore del server dice lo stato al Doctor');
});
