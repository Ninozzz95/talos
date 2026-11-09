/*
 * 13/10/2026, review avversaria di `ac8f5a362` — la riparazione dell'archivio vive in `prepare`, ma il kernel chiama PRIMA
 * `capture` (`reason: 'start'`, poi `before-request`, `response`, `tool-result`, `finished`), che sincronizza gli originali in
 * modo severo. Una storia davvero riscritta (il caso per cui la riparazione è nata) lancia `CTX_HISTORY_DIVERGED` già in
 * `capture('start')`, fuori da ogni `try` del kernel: il giro MORIVA prima di arrivare a `prepare`, e la riparazione non era
 * raggiungibile. Regola dell'owner (12/10/2026): un servizio di supporto del giro che fallisce non ferma mai la chat.
 *
 * Guscio vero + servizio vero + archivio vero + motore vero, fornitore finto. Nessuna rete.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const MODELLO = { provider: 'local', model: 'test', windowTokens: 200_000, responseReserve: 2048 };

function scena(t, { putBlob = null, profilo = async () => MODELLO } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-capture-non-ferma-'));
  writeFileSync(join(cartella, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const daParte = [];
  const spia = { ...store, ...(putBlob ? { putBlob } : {}), setAsideSession: async (argomenti) => { daParte.push(argomenti.asideId); return store.setAsideSession(argomenti); } };
  const engine = createContextEngine({ store: spia, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('non serve'); } }, tokenCounter: contatore, clock: () => '2026-10-13T08:00:00.000Z' });
  const service = createDesktopContextService({ store: spia, engine, readSession: id => id === 'chat' ? { sessionId: id, modello: 'local:test' } : null, isSessionEnabled: id => id === 'chat', resolveSessionModel: profilo, clock: () => '2026-10-13T08:00:00.000Z' });
  t.after(() => service.close());
  return { cartella, store, service, daParte };
}

function fintoFornitore({ chiamateTool = 1 } = {}) {
  const corpi = [];
  let lavoro = 0;
  const fetchDiRete = async (_url, init) => {
    const body = JSON.parse(init.body);
    corpi.push(body);
    lavoro += 1;
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (lavoro <= chiamateTool) {
      return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${corpi.length}_${lavoro}`, type: 'function', function: { name: 'elenca', arguments: '{"percorso":"."}' } }] }, finish_reason: 'tool_calls' }], usage });
    }
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
  return { fetchDiRete, corpi };
}

async function giro({ cartella }, contextHooks, resto = {}) {
  const eventi = [];
  const fornitore = fintoFornitore();
  const esito = await talosLavora({
    cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: fornitore.fetchDiRete, contestoDelProgetto: 'PREAMBOLO', comandoProva: 'node -e 0',
    contextHooks, onGiro: (e) => eventi.push(e),
    ...resto,
  });
  return { esito, eventi, fornitore };
}

const righe = (eventi, motivo) => eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === motivo);

test('ARCHIVIO-CAPTURE-NON-FERMA-01 — una storia riscritta fra due giri: il giro NON muore in capture, l’archivio si riallinea in prepare e lo dice una volta', async (t) => {
  const s = scena(t);
  const primo = await giro(s, await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' }));
  assert.equal(primo.esito.comeFinita, 'concluso');
  /* la storia torna riscritta in mezzo (una riparazione della ripresa, un altro processo, un giornale ricostruito) */
  const riscritta = primo.esito.messaggiFinali.map((m, i) => (i === primo.esito.messaggiFinali.length - 1 ? { ...m, content: `${m.content} (riscritto)` } : m));
  const secondo = await giro(s, await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-2' }), { messaggiIniziali: [...riscritta, { role: 'user', content: 'continua' }] });
  assert.equal(secondo.esito.comeFinita, 'concluso', 'il giro arriva in fondo');
  assert.equal(secondo.fornitore.corpi.length, 2, 'tutte le richieste partono');
  assert.equal(righe(secondo.eventi, 'archivio-riallineato').length, 1, 'riallineato, una volta');
  assert.equal(righe(secondo.eventi, 'ripiego').length, 0, 'il motore ha lavorato: non è un ripiego');
  assert.equal(s.daParte.length, 1);
  assert.deepEqual((await s.store.readOriginals({ sessionId: 'chat', limit: 1000 })).map((r) => r.message), secondo.esito.messaggiFinali, 'l archivio vivo è la storia del giro');
});

test('ARCHIVIO-CAPTURE-NON-FERMA-02 — capture che fallisce A METÀ giro (dopo un attrezzo) non ferma il giro; uno Stop resta uno Stop', async (t) => {
  const s = scena(t);
  const veri = await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  const motivi = [];
  const hooks = { ...veri, capture: async (payload) => { motivi.push(payload.reason); if (payload.reason === 'tool-result') throw Object.assign(new Error('archivio occupato'), { code: 'CTX_PERSISTENCE_FAILED' }); return veri.capture(payload); } };
  const { esito, fornitore } = await giro(s, hooks);
  assert.equal(esito.comeFinita, 'concluso', 'il giro arriva in fondo');
  assert.equal(fornitore.corpi.length, 2);
  assert.ok(motivi.includes('tool-result') && motivi.includes('finished'));
  /* ciò che capture non ha scritto lo recupera la sincronizzazione dopo: l'archivio non ha buchi */
  assert.deepEqual((await s.store.readOriginals({ sessionId: 'chat', limit: 1000 })).map((r) => r.message), esito.messaggiFinali);

  const stop = new AbortController();
  const fermati = { ...veri, capture: async (payload) => { if (payload.reason === 'before-request') { stop.abort(); throw Object.assign(new Error('aborted'), { name: 'AbortError' }); } return veri.capture(payload); } };
  let errore = null; let finito = null;
  const s2 = scena(t);
  try { finito = await giro(s2, { ...fermati, capture: fermati.capture, prepare: (await s2.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' })).prepare }, { segnaleStop: stop.signal }); } catch (e) { errore = e; }
  assert.equal(finito?.fornitore.corpi.length ?? 0, 0, 'dopo uno Stop non parte nessuna richiesta');
  assert.ok(errore || finito?.esito?.comeFinita !== 'concluso', 'uno Stop resta uno Stop');
});

/* Revisione di fine fase della compattazione (01/11/2026, D1): il kernel chiama `captureProviderResponse` fuori da ogni `try`, dopo una risposta
   già pagata. Un archivio che non scrive faceva morire il giro e buttava la risposta. */
test('ARCHIVIO-RISPOSTA-NON-FERMA-01 — l archivio non scrive la risposta del fornitore: il giro arriva in fondo', async (t) => {
  const s = scena(t, { putBlob: async () => { throw Object.assign(new Error('SQLITE_FULL: database or disk is full'), { code: 'SQLITE_FULL' }); } });
  const { esito, fornitore } = await giro(s, await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' }));
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(fornitore.corpi.length, 2, 'la risposta pagata è stata usata: il giro ha chiesto il passo dopo');
});

test('ARCHIVIO-RISPOSTA-NON-FERMA-02 — AL CONTRARIO: uno Stop durante la cattura resta uno Stop, con un errore qualunque o con un AbortError', async (t) => {
  const interrotta = Object.assign(new Error('aborted'), { name: 'AbortError' });
  for (const [nome, errore, conStop] of [['errore dell archivio dopo lo Stop', new Error('archivio occupato'), true], ['AbortError senza segnale', interrotta, false]]) {
    const s = scena(t);
    const veri = await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
    const stop = new AbortController();
    const hooks = { ...veri, captureProviderResponse: async () => { if (conStop) stop.abort(); throw errore; } };
    await assert.rejects(giro(s, hooks, { segnaleStop: stop.signal }), (lanciato) => {
      if (conStop) { // REV-B8-A4: l'errore dell'archivio non diventa l'esito del giro
        assert.equal(lanciato.name, 'AbortError', nome);
        assert.equal(lanciato.fermatoSuRichiesta, true, nome);
        assert.doesNotMatch(lanciato.message, /archivio/u, nome);
      } else assert.equal(lanciato, errore, nome);
      return true;
    });
  }
});

/* COD-220 (Mobile 30/10/2026): il registro del motore del telefono diceva solo «CTX_HISTORY_DIVERGED», senza di CHI. L'errore della
   divergenza porta ora l'id della sessione accanto al dettaglio di R-05 (il nucleo lo stampa nel registro del processo). */
test('ARCHIVIO-CAPTURE-NON-FERMA-04 — la divergenza dice di quale sessione, accanto al dettaglio', async (t) => {
  const s = scena(t);
  const primo = await giro(s, await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' }));
  const riscritta = primo.esito.messaggiFinali.map((m, i) => (i === 1 ? { ...m, content: `${m.content} (riscritto)` } : m));
  const hooks = await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-2' });
  await assert.rejects(hooks.capture({ messages: riscritta, reason: 'start' }), (errore) => {
    assert.equal(errore.code, 'CTX_HISTORY_DIVERGED');
    assert.equal(errore.sessionId, 'chat');
    assert.equal(errore.dettaglio?.primoDiverso, 1);
    return true;
  });
});

/* COD-220 (Mobile 30/10/2026, sul Pad): dopo uno Stop la cattura FINALE di un agente falliva con CTX_HISTORY_DIVERGED. Qui: motore del
   contesto vero, giro fermato mentre la PRIMA richiesta al modello è appesa. La cattura 'finished' deve passare (nessuna divergenza). */
test('ARCHIVIO-CAPTURE-NON-FERMA-05 — Stop prima della prima risposta: la cattura finale non diverge dall\'archivio', { timeout: 10_000 }, async (t) => {
  const s = scena(t);
  const veri = await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  const errori = [];
  /* la spia sta DENTRO il guscio (che avvolge questi ganci): vede ciò che arriva davvero all'archivio */
  const hooks = { ...veri, capture: async (payload) => {
    try { return await veri.capture(payload); }
    catch (e) { errori.push({ reason: payload.reason, code: e?.code, dettaglio: e?.dettaglio }); throw e; }
  } };
  const stop = new AbortController();
  const appesa = (url, init) => new Promise((_, ko) => {
    setTimeout(() => stop.abort(), 30);
    init?.signal?.addEventListener('abort', () => ko(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  });
  const fermato = await talosLavora({ cartella: s.cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: appesa, contestoDelProgetto: 'PREAMBOLO', contextHooks: hooks, segnaleStop: stop.signal }).catch((e) => ({ errore: e }));
  assert.deepEqual(errori, [], `catture fallite: ${JSON.stringify(errori)}`);
  /* Mobile: e il giro DOPO lo Stop riprende dall'archivio così com'è — nessun riallineamento, nessun riassunto ripagato */
  const storia = fermato?.messaggiFinali ?? fermato?.errore?.messaggiDelGiro ?? null;
  assert.ok(Array.isArray(storia) && storia.some((m) => m.role === 'user'), `premessa: la storia del giro fermato porta la richiesta (${JSON.stringify(Object.keys(fermato ?? {}))})`);
  const dopo = await giro(s, await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-2' }), { messaggiIniziali: [...storia, { role: 'user', content: 'continua' }] });
  assert.equal(righe(dopo.eventi, 'archivio-riallineato').length, 0, 'il giro dopo lo Stop non riallinea l\'archivio');
  assert.equal(s.daParte.length, 0, 'nessun archivio messo da parte');
});

/* Blocco 21 (reperto del Motore locale, 01/11/2026): col motore locale che apre, `prepare` archivia la richiesta e POI il profilo fallisce
   (CTX_RUNTIME_PROFILE_MISMATCH, `context-desktop-service.mjs:470` poi `:504`). Il giro va in ripiego, ma il guscio non sapeva che la richiesta
   era già nell'archivio: la toglieva da `capture('finished')` e la storia risultava più corta. La cura di COD-220 copriva solo il `prepare` riuscito. */
test('ARCHIVIO-CAPTURE-NON-FERMA-07 — Stop col profilo in errore: la richiesta già archiviata non fa divergere la cattura finale', { timeout: 10_000 }, async (t) => {
  const s = scena(t, { profilo: async () => { throw Object.assign(new Error('The model is not ready.'), { code: 'CTX_RUNTIME_PROFILE_MISMATCH' }); } });
  const veri = await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  const errori = [];
  const hooks = { ...veri, capture: async (payload) => {
    try { return await veri.capture(payload); }
    catch (e) { errori.push({ reason: payload.reason, code: e?.code, dettaglio: e?.dettaglio }); throw e; }
  } };
  const stop = new AbortController();
  const appesa = (url, init) => new Promise((_, ko) => {
    setTimeout(() => stop.abort(), 30);
    init?.signal?.addEventListener('abort', () => ko(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  });
  await talosLavora({ cartella: s.cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: appesa, contestoDelProgetto: 'PREAMBOLO', contextHooks: hooks, segnaleStop: stop.signal }).catch((e) => ({ errore: e }));
  assert.equal(stop.signal.aborted, true, 'premessa: lo Stop è arrivato, quindi il giro ha chiamato il fornitore dopo il ripiego');
  assert.deepEqual(errori, [], `catture fallite: ${JSON.stringify(errori)}`);
});

/* Il contrario della -07: se `prepare` cade PRIMA di archiviare, senza il segno, la richiesta resta fuori dall'archivio come vuole R13-2. Un mutante che
   ricordava sempre la richiesta sopravviveva a tutte le altre prove. */
test('ARCHIVIO-CAPTURE-NON-FERMA-08 — prepare caduto prima di archiviare: la cattura finale non porta la richiesta', { timeout: 10_000 }, async (t) => {
  const s = scena(t);
  const veri = await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  const catture = [];
  const hooks = { ...veri,
    prepare: async () => { throw Object.assign(new Error('Could not read the archive.'), { code: 'CTX_ARCHIVE_UNAVAILABLE' }); },
    capture: async (payload) => { catture.push({ reason: payload.reason, richiesta: payload.messages.some((m) => m.role === 'user' && String(m.content).includes('Elenca la cartella.')) }); return veri.capture(payload); } };
  const stop = new AbortController();
  const appesa = (url, init) => new Promise((_, ko) => {
    setTimeout(() => stop.abort(), 30);
    init?.signal?.addEventListener('abort', () => ko(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  });
  await talosLavora({ cartella: s.cartella, task: { consegna: 'Elenca la cartella.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: appesa, contestoDelProgetto: 'PREAMBOLO', contextHooks: hooks, segnaleStop: stop.signal }).catch((e) => ({ errore: e }));
  const finale = catture.find((c) => c.reason === 'finished');
  assert.ok(finale, `premessa: la cattura finale c'è (${JSON.stringify(catture)})`);
  assert.equal(finale.richiesta, false, 'la richiesta non è stata archiviata: resta fuori');
});

/* COD-220, al contrario (Mobile 30/10/2026): l'eccezione vale SOLO per la richiesta che `prepare` ha archiviato. Un messaggio della
   persona accodato a metà giro è un'altra richiesta: alla cattura 'before-request' che lo precede resta fuori dall'archivio (R13-2),
   perché la regola N non l'ha ancora visto. Con un segno valido per tutto il giro, entrava. */
test('ARCHIVIO-CAPTURE-NON-FERMA-06 — un messaggio accodato a metà giro non entra nell\'archivio prima della sua richiesta', { timeout: 10_000 }, async (t) => {
  const s = scena(t);
  const veri = await s.service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  const ACCODATO = 'MESSAGGIO-ACCODATO-A-META-GIRO';
  const archiviatiPrima = [];
  const hooks = { ...veri, capture: async (payload) => {
    if (payload.reason === 'before-request') archiviatiPrima.push(payload.messages.some((m) => String(m.content).includes(ACCODATO)));
    return veri.capture(payload);
  } };
  let consegnato = false;
  await giro(s, hooks, { codaMessaggiFn: () => (consegnato ? null : (consegnato = true, { testo: ACCODATO })) });
  assert.ok(consegnato, 'premessa: la coda è stata letta dopo l\'attrezzo');
  assert.ok(archiviatiPrima.length >= 2, `premessa: due richieste nel giro (${archiviatiPrima.length})`);
  assert.equal(archiviatiPrima.some(Boolean), false, 'il messaggio accodato non è archiviato prima della sua richiesta');
});
