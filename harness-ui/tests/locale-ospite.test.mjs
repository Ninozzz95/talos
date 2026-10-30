/*
 * 18/10/2026 — la fonte `locale-ospite`: il motore locale DELL'APP che ospita r4 (contratto con la sessione mobile, ledger mobile
 * `LEDGER-CODICE-MOTORE-LOCALE-2026-10-18.md`). L'app spinge socket, chiave, modello e finestra; r4 parla al motore su quel socket.
 *
 * Il motore è un server HTTP VERO su un socket: una pipe con nome su Windows, un socket Unix altrove (`net` accetta tutti e due come
 * `path`). La regola «dentro la cartella, ed è un socket» si prova con un fs finto, perché su Windows una pipe non vive in una
 * cartella. Registro, kernel e adattatore sono quelli veri; la spia sulla rete fa passare solo il socket.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaAccessoLocaleOspite, finestraDelModelloOspite, rifiutoDelMotoreOspite } from '../src/accesso-locale-ospite.mjs';
import { risolviDestinazioneModello } from '../src/model-destination.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const fuori = [];
const fetchVera = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  fuori.push(String(typeof url === 'string' ? url : url?.url));
  return new Response('{"error":{"message":"intercettato dalla prova"}}', { status: 401, headers: { 'Content-Type': 'application/json' } });
};
test.after(() => { globalThis.fetch = fetchVera; });

const CARTELLA = process.platform === 'win32' ? 'C:\\dati-app' : '/dati-app';
const FS_SOCKET = { realpath: async (p) => p, lstat: async () => ({ isSocket: () => true }) };
const CHIAVE = 'k'.repeat(43);
const valido = (socketPath, extra = {}) => ({ socketPath, chiave: CHIAVE, modello: 'lfm2.5-2.6b-q4_0.gguf', nCtx: 32768, capacita: { tools: true, reasoning: false }, ...extra });

/** Il socket e la cartella che lo contiene davvero: su Windows le pipe vivono tutte sotto `\\.\pipe`. */
function percorsoSocket(t) {
  if (process.platform === 'win32') return { cartella: '\\\\.\\pipe', socketPath: `\\\\.\\pipe\\talos-ospite-${process.pid}-${randomBytes(4).toString('hex')}` };
  const c = mkdtempSync(join(tmpdir(), 'talos-ospite-'));
  t.after(() => rimuoviCartellaDiProva(c));
  return { cartella: c, socketPath: join(c, 'motore.sock') };
}

/** Il motore dell'app, finto ma HTTP vero su un socket. `rispondi(richiesta)` → `{ stato, json }` o `{ testi }` (SSE). */
async function accendiMotore(t, rispondi) {
  const richieste = [];
  const { cartella, socketPath } = percorsoSocket(t);
  const server = createServer((req, res) => {
    let grezzo = '';
    req.on('data', (c) => { grezzo += c; });
    req.on('end', () => {
      const r = { url: req.url, metodo: req.method, autorizzazione: req.headers.authorization ?? null, host: req.headers.host, corpo: grezzo ? JSON.parse(grezzo) : null };
      richieste.push(r);
      const esito = rispondi(r, richieste.length - 1);
      /* un flusso SSE già scritto, così com'è (il pacchetto d'errore dopo la coda, contratto del Mobile del 21/10) */
      if (typeof esito.grezzo === 'string') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(esito.grezzo); return; }
      if (esito.testi) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        for (const testo of esito.testi) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: testo } }] })}\n\n`);
        res.end(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 2 } })}\n\ndata: [DONE]\n\n`);
        return;
      }
      res.writeHead(esito.stato, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(esito.json));
    });
  });
  await new Promise((r) => server.listen(socketPath, r));
  t.after(() => new Promise((r) => server.close(r)));
  return { cartella, socketPath, richieste };
}

test('LOS-01 il contratto dell\'accesso: campi chiusi, finestra ≥ 4096, socket dentro la cartella e davvero un socket; lo stato non porta mai chiave né socket', async () => {
  const a = creaAccessoLocaleOspite({ cartella: CARTELLA, fs: FS_SOCKET });
  const dentro = join(CARTELLA, 'locale-ospite', 'motore.sock');
  assert.equal(await a.ricevi(valido(dentro)), null);
  assert.deepEqual(a.stato(), { pronto: true, modello: 'lfm2.5-2.6b-q4_0.gguf', nCtx: 32768, capacita: { tools: true, reasoning: false } });
  assert.doesNotMatch(JSON.stringify(a.stato()), new RegExp(`${CHIAVE}|motore\\.sock`));
  assert.equal(a.pronto('lfm2.5-2.6b-q4_0.gguf'), true);
  assert.equal(a.pronto('un-altro.gguf'), false, 'un altro modello non è aperto');
  assert.equal(a.finestra('lfm2.5-2.6b-q4_0.gguf'), 32768);
  assert.equal(a.finestra('un-altro.gguf'), null);
  const rifiuti = [
    [valido(dentro, { porta: 1 }), 'QUERY_INVALID'],
    [valido(dentro, { nCtx: 4095 }), 'QUERY_INVALID'],
    [valido(dentro, { nCtx: 32768.5 }), 'QUERY_INVALID'],
    [valido(dentro, { modello: 'con spazio' }), 'QUERY_INVALID'],
    [valido(dentro, { chiave: 'corta' }), 'QUERY_INVALID'],
    [valido(dentro, { capacita: { tools: 'si' } }), 'QUERY_INVALID'],
    [valido(dentro, { capacita: { visione: true } }), 'QUERY_INVALID'],
    [valido('relativo/motore.sock'), 'QUERY_INVALID'],
    [valido(join(CARTELLA, '..', 'altrove', 'motore.sock')), 'LOCAL_GUEST_SOCKET_INVALID'],
    [valido(`${CARTELLA}-gemella${process.platform === 'win32' ? '\\' : '/'}motore.sock`), 'LOCAL_GUEST_SOCKET_INVALID'],
  ];
  for (const [corpo, code] of rifiuti) assert.equal((await a.ricevi(corpo))?.code, code, JSON.stringify(corpo));
  /* al contrario: realpath che porta fuori (un collegamento) e un file che non è un socket */
  const conLink = creaAccessoLocaleOspite({ cartella: CARTELLA, fs: { ...FS_SOCKET, realpath: async (p) => (p === CARTELLA ? p : join(CARTELLA, '..', 'fuori.sock')) } });
  assert.equal((await conLink.ricevi(valido(dentro)))?.code, 'LOCAL_GUEST_SOCKET_INVALID');
  const nonSocket = creaAccessoLocaleOspite({ cartella: CARTELLA, fs: { ...FS_SOCKET, lstat: async () => ({ isSocket: () => false }) } });
  assert.equal((await nonSocket.ricevi(valido(dentro)))?.code, 'LOCAL_GUEST_SOCKET_INVALID');
  const spento = creaAccessoLocaleOspite({ cartella: null, fs: FS_SOCKET });
  assert.equal(spento.attivo, false);
  assert.equal((await spento.ricevi(valido(dentro)))?.code, 'LOCAL_GUEST_DISABLED');
  /* la finestra per la compattazione: quella dell'apertura per il modello aperto, null per un altro, undefined fuori dalla fonte */
  assert.equal(finestraDelModelloOspite(a, 'locale-ospite:lfm2.5-2.6b-q4_0.gguf'), 32768);
  assert.equal(finestraDelModelloOspite(a, 'locale-ospite:un-altro.gguf'), null);
  assert.equal(finestraDelModelloOspite(a, 'openrouter:vendor/modello'), undefined);
  a.dimentica();
  assert.deepEqual(a.stato(), { pronto: false });
  assert.equal(finestraDelModelloOspite(a, 'locale-ospite:lfm2.5-2.6b-q4_0.gguf'), null, 'chiuso nell\'app: nessuna finestra, mai quella di un catalogo');
});

test('LOS-02 la spedizione sul socket: la chiave la mette l\'accesso (sopra ogni Authorization da fuori), la risposta è una Response web; il 503 del motore ha il suo codice', async (t) => {
  let stato = 'sse';
  const m = await accendiMotore(t, () => (stato === 'sse' ? { testi: ['ciao'] }
    : stato === 'busy' ? { stato: 503, json: { error: { code: 'LOCAL_ENGINE_BUSY' } } }
      : stato === 'vuoto' ? { stato: 503, json: { error: { code: 'LOCAL_RUNTIME_NOT_READY' } } }
        : stato === 'cambiato' ? { stato: 409, json: { error: { code: 'LOCAL_MODEL_CHANGED' } } }
          : stato === 'conflitto' ? { stato: 409, json: { error: { code: 'ALTRO' } } } : { stato: 503, json: { error: { code: 'ALTRO' } } }));
  const a = creaAccessoLocaleOspite({ cartella: m.cartella, fs: FS_SOCKET });
  assert.equal(await a.ricevi(valido(m.socketPath)), null);
  const r = await a.chiama('/v1/chat/completions', { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer altrui' }, body: '{"model":"x","stream":true}' });
  assert.equal(r.status, 200);
  assert.match(await r.text(), /"content":"ciao"[\s\S]*\[DONE\]/);
  assert.deepEqual([m.richieste[0].autorizzazione, m.richieste[0].host, m.richieste[0].metodo, m.richieste[0].corpo.model], [`Bearer ${CHIAVE}`, 'localhost', 'POST', 'x']);
  assert.equal(await rifiutoDelMotoreOspite(r), null, 'un 200 non è un rifiuto');
  stato = 'busy';
  const occupato = await rifiutoDelMotoreOspite(await a.chiama('/v1/chat/completions', { body: '{}' }));
  assert.deepEqual([occupato?.code, occupato?.transitorio], ['LOCAL_ENGINE_BUSY', false]);
  stato = 'vuoto';
  assert.equal((await rifiutoDelMotoreOspite(await a.chiama('/v1/chat/completions', { body: '{}' })))?.code, 'LOCAL_RUNTIME_NOT_READY');
  stato = 'altro';
  assert.equal(await rifiutoDelMotoreOspite(await a.chiama('/v1/chat/completions', { body: '{}' })), null, 'un 503 senza codice nostro resta al ponte');
  stato = 'cambiato';
  const cambiato = await rifiutoDelMotoreOspite(await a.chiama('/v1/chat/completions', { body: '{}' }));
  assert.deepEqual([cambiato?.code, cambiato?.transitorio, cambiato?.message], ['LOCAL_MODEL_CHANGED', false, 'Another on-device model is open now; choose it again in Code.']);
  stato = 'conflitto';
  assert.equal(await rifiutoDelMotoreOspite(await a.chiama('/v1/chat/completions', { body: '{}' })), null, 'un 409 senza il codice del modello cambiato resta al ponte');
  /* senza accesso, e con un socket che non risponde: il codice, mai la chiave nel messaggio */
  a.dimentica();
  await assert.rejects(a.chiama('/v1/chat/completions', { body: '{}' }), { code: 'LOCAL_RUNTIME_NOT_READY' });
  const morto = creaAccessoLocaleOspite({ cartella: m.cartella, fs: FS_SOCKET });
  await morto.ricevi(valido(`${m.socketPath}-spento`));
  /* 26/10/2026 (D-0146-1): un socket che non risponde ha il suo codice, non «nessun modello aperto» (che era falso col modello aperto) */
  await assert.rejects(morto.chiama('/v1/chat/completions', { body: '{}' }), (e) => e.code === 'LOCAL_GUEST_UNREACHABLE' && !e.message.includes(CHIAVE)
    && /did not answer: send the message again/u.test(e.message));
  assert.deepEqual(fuori, [], 'nessuna uscita in rete');
});

test('LOS-03 il risolutore: modello aperto ⇒ destinazione dell\'ospite; non aperto ⇒ LOCAL_RUNTIME_NOT_READY marcato `ospite` (il ponte non accende il llama-server del PC)', () => {
  const deps = { leggiChiave: () => null, leggiRuntime: () => ({}) };
  assert.deepEqual(risolviDestinazioneModello('locale-ospite:mod.gguf', { ...deps, ospitePronto: (m) => m === 'mod.gguf' }),
    { fonte: 'locale-ospite', modelloRemoto: 'mod.gguf', locale: true, ospite: true, percorso: '/v1/chat/completions' });
  assert.throws(() => risolviDestinazioneModello('locale-ospite:altro.gguf', { ...deps, ospitePronto: (m) => m === 'mod.gguf' }),
    (e) => e.code === 'LOCAL_RUNTIME_NOT_READY' && e.ospite === true);
  assert.throws(() => risolviDestinazioneModello('locale-ospite:mod.gguf', deps), { code: 'LOCAL_RUNTIME_NOT_READY' });
});

test('LOS-04 le rotte: POST access tiene e risponde lo stato senza chiave; remove dimentica; corpo con un campo in più 400; spenta 404; GET 405', async () => {
  const accessoLocaleOspite = creaAccessoLocaleOspite({ cartella: CARTELLA, fs: FS_SOCKET });
  const chiama = creaChiamataInterna({ httpApp: createHttpApp({ staticHandler: async () => null, accessoLocaleOspite }), porta: 4999 });
  const dentro = join(CARTELLA, 'motore.sock');
  /* `chiama` rifiuta ogni stato non 2xx con `{ stato, code }`: qui serve solo lo stato e il codice */
  const esito = (p) => p.then((x) => ({ stato: x.stato, dati: x.dati }), (e) => ({ stato: e.stato, code: e.code }));
  const ok = await esito(chiama({ metodo: 'POST', percorso: '/api/v1/providers/locale-ospite/access', corpo: valido(dentro) }));
  assert.equal(ok.stato, 200);
  assert.deepEqual(ok.dati, { pronto: true, modello: 'lfm2.5-2.6b-q4_0.gguf', nCtx: 32768, capacita: { tools: true, reasoning: false } });
  assert.doesNotMatch(JSON.stringify(ok), new RegExp(CHIAVE));
  assert.deepEqual(await esito(chiama({ metodo: 'POST', percorso: '/api/v1/providers/locale-ospite/access', corpo: valido(dentro, { porta: 1 }) })), { stato: 400, code: 'QUERY_INVALID' });
  assert.equal((await esito(chiama({ metodo: 'GET', percorso: '/api/v1/providers/locale-ospite/access' }))).stato, 405);
  assert.equal((await esito(chiama({ metodo: 'POST', percorso: '/api/v1/providers/locale-ospite/access/remove', corpo: { tutto: true } }))).stato, 400, 'remove non prende campi');
  assert.equal(accessoLocaleOspite.stato().pronto, true, 'e un remove rifiutato non dimentica');
  const via = await esito(chiama({ metodo: 'POST', percorso: '/api/v1/providers/locale-ospite/access/remove', corpo: {} }));
  assert.deepEqual(via, { stato: 200, dati: { pronto: false } });
  assert.equal(accessoLocaleOspite.stato().pronto, false);
  const spenta = creaChiamataInterna({ httpApp: createHttpApp({ staticHandler: async () => null, accessoLocaleOspite: creaAccessoLocaleOspite({ cartella: null }) }), porta: 4999 });
  assert.deepEqual(await esito(spenta({ metodo: 'POST', percorso: '/api/v1/providers/locale-ospite/access', corpo: valido(dentro) })), { stato: 404, code: 'LOCAL_GUEST_DISABLED' });
  assert.deepEqual(await esito(spenta({ metodo: 'POST', percorso: '/api/v1/providers/locale-ospite/access/remove', corpo: {} })), { stato: 404, code: 'LOCAL_GUEST_DISABLED' },
    'spenta vuol dire spenta anche per remove: un 200 direbbe all\'app che la fonte esiste');
});

function registroCol(accesso, cartella, { avviaLocale } = {}) {
  const destinazioneModelloDeps = {
    leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: () => false,
    ospitePronto: (m) => accesso.pronto(m),
    chiamaLocaleOspite: (p, o) => accesso.chiama(p, o),
    ...(avviaLocale ? { avviaLocale } : {}),
  };
  const ownerRuntime = createOwnerRuntimeAdapter({ destinazioneModelloDeps });
  return createSessionRegistry({
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (ri) => ownerRuntime.talosLavora(ri) }),
    modello: 'vendor/modello', chiave: 'k', chiaveFn: () => 'k',
    cartelleProgetto: [{ id: '0', percorso: cartella, nome: 'prova' }],
    preparaEsecuzioneFn: (taskId) => ({ taskId, cartella, task: { consegna: 'rispondi' }, comandoProva: null }),
    fetchModelloFn: () => fetch,
  });
}
const attendiFine = async (registro, sessionId, ms = 20_000) => {
  const fine = Date.now() + ms;
  while (Date.now() < fine) {
    const eventi = registro.esporta(sessionId)?.eventi ?? [];
    if (eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError')) return eventi;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('il giro non è finito');
};
function cartellaDiProva(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-ospite-giro-'));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}

test('LOS-05 un giro vero col modello dell\'app: kernel e adattatore veri, la risposta arriva a schermo, nessuna uscita in rete', async (t) => {
  const m = await accendiMotore(t, () => ({ testi: ['ciao ', 'dal telefono'] }));
  const accesso = creaAccessoLocaleOspite({ cartella: m.cartella, fs: FS_SOCKET });
  await accesso.ricevi(valido(m.socketPath));
  const registro = registroCol(accesso, cartellaDiProva(t));
  t.after(() => { for (const s of registro.elenca()) registro.ferma(s.sessionId); });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: 'locale-ospite:lfm2.5-2.6b-q4_0.gguf' });
  const eventi = await attendiFine(registro, sessionId);
  assert.equal(eventi.at(-1).type, 'RunFinished', JSON.stringify(eventi.at(-1)));
  assert.match(eventi.filter((e) => e.type === 'TextMessageContent').map((e) => e.delta).join(''), /ciao dal telefono/);
  assert.equal(m.richieste[0].url, '/v1/chat/completions');
  assert.equal(m.richieste[0].autorizzazione, `Bearer ${CHIAVE}`);
  assert.equal(m.richieste[0].corpo.model, 'lfm2.5-2.6b-q4_0.gguf', 'al motore va il nome del modello, senza la fonte');
  assert.deepEqual(fuori, []);
});

test('LOS-06 al contrario: motore occupato dalla chat ⇒ UNA richiesta, il giro si ferma con la frase del motore occupato; nessun modello ⇒ la sua frase e il llama-server del PC non si accende', async (t) => {
  const m = await accendiMotore(t, () => ({ stato: 503, json: { error: { code: 'LOCAL_ENGINE_BUSY' } } }));
  const accesso = creaAccessoLocaleOspite({ cartella: m.cartella, fs: FS_SOCKET });
  await accesso.ricevi(valido(m.socketPath));
  const registro = registroCol(accesso, cartellaDiProva(t));
  t.after(() => { for (const s of registro.elenca()) registro.ferma(s.sessionId); });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: 'locale-ospite:lfm2.5-2.6b-q4_0.gguf' });
  const eventi = await attendiFine(registro, sessionId);
  const ultimo = eventi.at(-1);
  assert.equal(ultimo.type, 'RunError');
  /* 21/10/2026 sera: la frase è neutra, a tenere il motore può essere anche un riassunto del contesto */
  assert.match(String(ultimo.message), /^The on-device model is busy with another job \(a chat reply or a context summary\); try again when it has finished\.$/u);
  assert.equal(m.richieste.length, 1, 'occupato non si ritenta quattro volte');

  let accensioni = 0;
  const vuoto = creaAccessoLocaleOspite({ cartella: CARTELLA, fs: FS_SOCKET });
  const registro2 = registroCol(vuoto, cartellaDiProva(t), { avviaLocale: async () => { accensioni += 1; } });
  t.after(() => { for (const s of registro2.elenca()) registro2.ferma(s.sessionId); });
  const { sessionId: s2 } = registro2.avvia('task-vero', { modelloScelto: 'locale-ospite:lfm2.5-2.6b-q4_0.gguf' });
  const eventi2 = await attendiFine(registro2, s2);
  assert.equal(eventi2.at(-1).type, 'RunError');
  assert.match(String(eventi2.at(-1).message), /No local model is open in the app/);
  assert.equal(accensioni, 0, 'il llama-server del PC non si accende per un modello del telefono');
  assert.deepEqual(fuori, []);
});

test('LOS-07 il modello del telefono vede davanti SOLO gli undici essenziali e il ponte (owner 19/10); un modello a chiave resta come prima', async (t) => {
  const m = await accendiMotore(t, () => ({ testi: ['ok'] }));
  const accesso = creaAccessoLocaleOspite({ cartella: m.cartella, fs: FS_SOCKET });
  await accesso.ricevi(valido(m.socketPath));
  const registro = registroCol(accesso, cartellaDiProva(t));
  t.after(() => { for (const s of registro.elenca()) registro.ferma(s.sessionId); });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: 'locale-ospite:lfm2.5-2.6b-q4_0.gguf' });
  await attendiFine(registro, sessionId);
  const nomi = (m.richieste[0].corpo.tools ?? []).map((a) => a.function?.name);
  const ESSENZIALI = new Set(['elenca', 'cerca', 'leggi', 'scrivi', 'file_edit', 'shell', 'prova', 'naviga', 'web_search', 'ask_user_question', 'time_now']);
  const PONTE = ['tool_search', 'tool_describe', 'tool_call'];
  assert.deepEqual(nomi.filter((n) => !ESSENZIALI.has(n) && !PONTE.includes(n)), [], `davanti solo essenziali e ponte: ${nomi.join(', ')}`);
  for (const n of PONTE) assert.ok(nomi.includes(n), `manca ${n}`);
  for (const n of ['elenca', 'leggi', 'scrivi', 'shell']) assert.ok(nomi.includes(n), `manca l'essenziale ${n}`);
  /* il resto non è sparito: è dietro il ponte, nell'elenco dei nomi che porta tool_search */
  const ricerca = m.richieste[0].corpo.tools.find((a) => a.function?.name === 'tool_search');
  assert.match(ricerca.function.description, /notes_create/u);
  /* owner 19/10, poi 28/10 («tutti i profili»): la riga della lingua c'è col profilo del telefono, nella forma del 28/10 */
  assert.match(JSON.stringify(m.richieste[0].corpo.messages[0]), /Always reply in the same language the person writes or speaks in/u);
  assert.ok(JSON.stringify(m.richieste[0].corpo.tools).length < 20_000, `schemi troppo pesanti: ${JSON.stringify(m.richieste[0].corpo.tools).length} caratteri`);

  /* al contrario: col modello a chiave il registro passa il ponte di serie (spento sul PC), non gli essenziali */
  const ingressi = [];
  const r2 = createSessionRegistry({
    avviaSessioneFn: async (input) => { ingressi.push(input); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' }); return { ok: true }; },
    modello: 'vendor/modello', chiave: 'k', chiaveFn: () => 'k',
    cartelleProgetto: [{ id: '0', percorso: cartellaDiProva(t), nome: 'prova' }],
    preparaEsecuzioneFn: (taskId) => ({ taskId, cartella: cartellaDiProva(t), task: { consegna: 'rispondi' }, comandoProva: null }),
  });
  r2.avvia('task-vero', { modelloScelto: 'openrouter:vendor/modello' });
  r2.avvia('task-vero', { modelloScelto: 'locale-ospite:lfm2.5-2.6b-q4_0.gguf' });
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(ingressi.map((i) => i.attrezziDifferiti), [false, 'essenziali']);
});

test('C5-GEMINI-01 (owner 21/10, banco C5 sotto soglia) col ponte acceso di serie: Gemini diretto lo spegne, gli altri lo tengono', async (t) => {
  const ingressi = [];
  const r = createSessionRegistry({
    avviaSessioneFn: async (input) => { ingressi.push(input); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' }); return { ok: true }; },
    modello: 'vendor/modello', chiave: 'k', chiaveFn: () => 'k', attrezziDifferiti: true,
    cartelleProgetto: [{ id: '0', percorso: cartellaDiProva(t), nome: 'prova' }],
    preparaEsecuzioneFn: (taskId) => ({ taskId, cartella: cartellaDiProva(t), task: { consegna: 'rispondi' }, comandoProva: null }),
  });
  r.avvia('task-vero', { modelloScelto: 'openrouter:vendor/modello' });
  r.avvia('task-vero', { modelloScelto: 'gemini:gemini-3.5-flash-lite' });
  r.avvia('task-vero', { modelloScelto: 'locale-ospite:lfm2.5-2.6b-q4_0.gguf' });
  // AL CONTRARIO: un Gemini via OpenRouter non è il fornitore misurato, e tiene il ponte
  r.avvia('task-vero', { modelloScelto: 'openrouter:google/gemini-3.5-flash-lite' });
  await new Promise((x) => setTimeout(x, 50));
  assert.deepEqual(ingressi.map((i) => i.attrezziDifferiti), [true, false, 'essenziali', true]);
});

test('SVE-REG-01 l’elenco porta inizio e fine dell’ULTIMO giro (la sveglia li usa); prima del primo giro null', async (t) => {
  const r = createSessionRegistry({
    avviaSessioneFn: async (input) => { input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); await new Promise((x) => setTimeout(x, 20)); input.onEvento({ type: 'RunError', threadId: 't', runId: 'r', code: 'X', message: 'no' }); return { ok: false }; },
    modello: 'vendor/modello', chiave: 'k', chiaveFn: () => 'k',
    cartelleProgetto: [{ id: '0', percorso: cartellaDiProva(t), nome: 'prova' }],
    preparaEsecuzioneFn: (taskId) => ({ taskId, cartella: cartellaDiProva(t), task: { consegna: 'rispondi' }, comandoProva: null }),
  });
  const { sessionId } = r.avvia('task-vero', { modelloScelto: 'openrouter:vendor/modello' });
  await new Promise((x) => setTimeout(x, 80));
  const voce = r.elenca().find((v) => v.sessionId === sessionId);
  assert.ok(Date.parse(voce.inizioGiroAlle) <= Date.parse(voce.fineGiroAlle), JSON.stringify([voce.inizioGiroAlle, voce.fineGiroAlle]));
  assert.ok(Date.parse(voce.fineGiroAlle) - Date.parse(voce.inizioGiroAlle) >= 10, 'la durata del giro, non zero');
});

/*
 * 21/10/2026 sera, dal vivo sul Pad (sessione lunga del Mobile, LFM2.5): il motore dell'app dice «contesto pieno» col suo CODICE
 *   (`error.code: CONTEXT_LENGTH_EXCEEDED`, `type: server_error`) prima di generare. Letto come rifiuto degli attrezzi, la riprova senza
 *   attrezzi «riusciva» e la persona leggeva «This model does not use tools» dopo otto passi con gli attrezzi. Col corpo VERO del motore.
 */
const CONTESTO_PIENO_OSPITE = { error: { code: 'CONTEXT_LENGTH_EXCEEDED', message: 'The conversation does not fit in the on-device model\x27s context window.', type: 'server_error' } };

test('LOS-08 il contesto pieno del motore dell’app sale col suo codice: UNA richiesta, nessuna riprova senza attrezzi, nessun avviso falso', async (t) => {
  const { classificaErroreFornitore } = await import('../src/kernel/compattazione-desktop.mjs');
  const m = await accendiMotore(t, (r) => (Array.isArray(r.corpo?.tools) && r.corpo.tools.length ? { stato: 400, json: CONTESTO_PIENO_OSPITE } : { testi: ['senza attrezzi entrerebbe'] }));
  const accesso = creaAccessoLocaleOspite({ cartella: m.cartella, fs: FS_SOCKET });
  await accesso.ricevi(valido(m.socketPath));
  const registro = registroCol(accesso, cartellaDiProva(t));
  t.after(() => { for (const s of registro.elenca()) registro.ferma(s.sessionId); });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: 'locale-ospite:lfm2.5-2.6b-q4_0.gguf' });
  const eventi = await attendiFine(registro, sessionId);
  const ultimo = eventi.at(-1);
  assert.equal(m.richieste.length, 1, `nessuna riprova senza attrezzi: ${m.richieste.length} richieste`);
  assert.equal(ultimo.type, 'RunError', JSON.stringify(ultimo));
  assert.equal(ultimo.code, 'LOCAL_CONTEXT_EXCEEDED', JSON.stringify(ultimo));
  assert.equal(ultimo.classe, 'contesto', 'la classe del guasto, come il contesto pieno dei compatibili');
  assert.equal(ultimo.message, 'The conversation does not fit in the local model’s window.', 'la frase che la carta traduce, senza numeri inventati');
  assert.equal(classificaErroreFornitore({ message: ultimo.message, code: ultimo.code }), 'contesto-pieno', 'chi ritenta lo riconosce come contesto pieno');
  assert.equal(JSON.stringify(eventi).includes('This model does not use tools'), false, 'nessun avviso falso sugli attrezzi');
  assert.deepEqual(fuori, []);
});

test('LOS-09 al contrario: un 400 vero del motore dell’app sugli attrezzi (altro codice) fa la riprova senza attrezzi come prima, con l’avviso', async (t) => {
  const m = await accendiMotore(t, (r) => (Array.isArray(r.corpo?.tools) && r.corpo.tools.length
    ? { stato: 400, json: { error: { code: 'INVALID_REQUEST', message: 'The conversation does not fit in the on-device model\x27s context window.', type: 'server_error' } } }
    : { testi: ['risposta senza attrezzi'] }));
  const accesso = creaAccessoLocaleOspite({ cartella: m.cartella, fs: FS_SOCKET });
  await accesso.ricevi(valido(m.socketPath));
  const registro = registroCol(accesso, cartellaDiProva(t));
  t.after(() => { for (const s of registro.elenca()) registro.ferma(s.sessionId); });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: 'locale-ospite:lfm2.5-2.6b-q4_0.gguf' });
  const eventi = await attendiFine(registro, sessionId);
  assert.equal(m.richieste.length, 2, 'la riprova senza attrezzi parte: il codice decide, non la frase (che qui dice «does not fit»)');
  assert.equal(eventi.at(-1).type, 'RunFinished', JSON.stringify(eventi.at(-1)));
  assert.equal(JSON.stringify(eventi).includes('This model does not use tools'), true, 'l’avviso di sempre');
  assert.deepEqual(fuori, []);
});


/*
 * 21/10/2026 sera, contratto del Mobile: con la CODA del motore dell'app l'intestazione SSE parte subito, poi `: ping` ogni 15 s; un
 *   rifiuto che arriva DOPO la coda non è più un HTTP 400/409/503 ma un pacchetto SSE alla OpenRouter (`error` in cima + `finish_reason:
 *   "error"`), seguito da [DONE] (openrouter.ai/docs/api/reference/errors-and-debugging, letta il 21/10/2026: a intestazioni già
 *   partite l'errore viaggia nel flusso, con lo stato 200). Lo stesso contesto pieno, nelle due forme, deve dire la stessa cosa.
 */
const pacchettoDiErrore = (codice, messaggio) => `data: ${JSON.stringify({ error: { code: codice, message: messaggio, type: 'server_error' }, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'error' }] })}\n\n`;
const flussoConRifiuto = (codice, messaggio) => `: ping\n\n${pacchettoDiErrore(codice, messaggio)}data: [DONE]\n\n`;

async function giroOspite(t, rispondi) {
  const m = await accendiMotore(t, rispondi);
  const accesso = creaAccessoLocaleOspite({ cartella: m.cartella, fs: FS_SOCKET });
  await accesso.ricevi(valido(m.socketPath));
  const registro = registroCol(accesso, cartellaDiProva(t));
  t.after(() => { for (const s of registro.elenca()) registro.ferma(s.sessionId); });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: 'locale-ospite:lfm2.5-2.6b-q4_0.gguf' });
  return { m, eventi: await attendiFine(registro, sessionId) };
}

test('LOS-10 il contesto pieno DOPO la coda (pacchetto SSE): UNA richiesta, classe «contesto», nessun reinvio né avviso sugli attrezzi', async (t) => {
  const { classificaErroreFornitore } = await import('../src/kernel/compattazione-desktop.mjs');
  const { m, eventi } = await giroOspite(t, () => ({ grezzo: flussoConRifiuto('CONTEXT_LENGTH_EXCEEDED', CONTESTO_PIENO_OSPITE.error.message) }));
  const ultimo = eventi.at(-1);
  assert.equal(m.richieste.length, 1, `nessun reinvio a contesto pieno: ${m.richieste.length} richieste`);
  assert.equal(ultimo.type, 'RunError', JSON.stringify(ultimo));
  assert.equal(ultimo.classe, 'contesto', JSON.stringify(ultimo));
  assert.equal(classificaErroreFornitore({ message: ultimo.message, code: ultimo.code }), 'contesto-pieno', 'chi ritenta lo riconosce come contesto pieno');
  assert.equal(JSON.stringify(eventi).includes('This model does not use tools'), false);
  assert.deepEqual(fuori, []);
});

/* 26/10/2026 (D-0146-1 del Mobile): il socket del motore dell'app morto (R8 nelle 0.1.44/0.1.45) diceva «nessun modello aperto» */
test('LOS-14 il socket del motore dell\'app non risponde: il giro finisce col SUO codice e la sua frase, nessun reinvio, nessuna uscita in rete', async (t) => {
  const m = await accendiMotore(t, () => ({ json: { choices: [{ message: { role: 'assistant', content: 'mai' } }] } }));
  const accesso = creaAccessoLocaleOspite({ cartella: m.cartella, fs: FS_SOCKET });
  await accesso.ricevi(valido(`${m.socketPath}-morto`));
  const registro = registroCol(accesso, cartellaDiProva(t));
  t.after(() => { for (const s of registro.elenca()) registro.ferma(s.sessionId); });
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: 'locale-ospite:lfm2.5-2.6b-q4_0.gguf' });
  const eventi = await attendiFine(registro, sessionId);
  const ultimo = eventi.at(-1);
  assert.equal(ultimo.type, 'RunError', JSON.stringify(ultimo));
  assert.equal(ultimo.code, 'LOCAL_GUEST_UNREACHABLE', JSON.stringify(ultimo));
  assert.match(ultimo.message, /^The on-device engine in the app did not answer: send the message again, the app reopens it\.$/u);
  assert.equal(m.richieste.length, 0, 'il motore vero non ha ricevuto niente');
  assert.deepEqual(fuori, [], 'nessun fornitore di riserva');
});

test('LOS-11 al contrario: un pacchetto d’errore con un altro codice NON diventa contesto pieno', async (t) => {
  const { classificaErroreFornitore } = await import('../src/kernel/compattazione-desktop.mjs');
  const { eventi } = await giroOspite(t, () => ({ grezzo: flussoConRifiuto('SOMETHING_ELSE', 'The conversation does not fit in the on-device model\x27s context window.') }));
  const ultimo = eventi.at(-1);
  assert.equal(ultimo.type, 'RunError', JSON.stringify(ultimo));
  assert.notEqual(ultimo.classe, 'contesto', JSON.stringify(ultimo));
  assert.notEqual(classificaErroreFornitore({ message: ultimo.message, code: ultimo.code }), 'contesto-pieno', 'il codice decide, non la frase');
});

for (const [codice, frase] of [
  ['LOCAL_MODEL_CHANGED', 'Another on-device model is open now; choose it again in Code.'],
  ['LOCAL_RUNTIME_NOT_READY', 'No local model is open in the app: open one from the model picker.'],
  ['LOCAL_ENGINE_BUSY', 'The on-device model is busy with another job (a chat reply or a context summary); try again when it has finished.'],
]) {
  test(`LOS-12 ${codice} dopo la coda (pacchetto SSE) dice la stessa cosa del suo HTTP: UNA richiesta, la sua frase, nessun reinvio`, async (t) => {
    const { m, eventi } = await giroOspite(t, () => ({ grezzo: flussoConRifiuto(codice, 'from the app engine') }));
    const ultimo = eventi.at(-1);
    assert.equal(m.richieste.length, 1, `nessun reinvio: ${m.richieste.length} richieste`);
    assert.equal(ultimo.type, 'RunError', JSON.stringify(ultimo));
    assert.equal(ultimo.code, codice, JSON.stringify(ultimo));
    assert.equal(ultimo.message, frase);
    assert.deepEqual(fuori, []);
  });
}

test('LOS-13 il conteggio esatto passa dall\'accesso: POST /tokenize sul socket, con la chiave, col corpo della chat (la stessa riga di server.mjs)', async (t) => {
  const { createContextTokenCounter, credenzialeDelContatore } = await import('../src/context-token-counters.mjs');
  const m = await accendiMotore(t, (r) => (r.url === '/tokenize' ? { stato: 200, json: { count: 4_321, max_model_len: 32_768 } } : { stato: 404, json: {} }));
  const accesso = creaAccessoLocaleOspite({ cartella: m.cartella, fs: FS_SOCKET });
  await accesso.ricevi(valido(m.socketPath));
  const contatore = createContextTokenCounter({
    resolveProfile: async (mod) => credenzialeDelContatore(mod.provider, { leggiRuntime: () => ({}), leggiChiave: () => null, baseLocale: null,
      contaOspite: (corpo, segnale) => accesso.chiama('/tokenize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: segnale }) }),
    fetchFn: async () => { throw new Error('nessuna rete'); },
  });
  const conto = await contatore.countPreparedContext({ messages: [{ role: 'user', content: 'ciao' }], tools: [], model: { provider: 'locale-ospite', model: 'lfm2.5-2.6b-q4_0.gguf', windowTokens: 32_768, responseReserve: 4_096 } });
  assert.equal(conto.inputTokens, 4_321);
  assert.equal(conto.exact, true);
  const richiesta = m.richieste.at(-1);
  assert.equal(richiesta.url, '/tokenize');
  assert.equal(richiesta.metodo, 'POST');
  assert.equal(richiesta.autorizzazione, `Bearer ${CHIAVE}`);
  assert.deepEqual(richiesta.corpo.messages, [{ role: 'user', content: 'ciao' }]);
  assert.deepEqual(fuori, []);
});
