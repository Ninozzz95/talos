import assert from 'node:assert/strict';
import test from 'node:test';

import { creaResearchOrchestrator } from '../src/research-orchestrator.mjs';

/*
 * ⭐⭐⭐ FASE N, ottavo sistema (30/8) — Deep Research, piano
 * elegant-spinning-dongarra.md. `sessioni` è una Map finta, stesso
 * schema minimo di quella vera (session-registry.mjs) — questo modulo
 * opera SOLO su ciò che gli viene iniettato, mai un registro nascosto
 * (stesso principio di subagent-orchestrator.test.mjs).
 */
function vocePadre({ cartella = '/progetto', conclusa = false, controller = { abort() { this.abortato = true; } } } = {}) {
  return { cartella, conclusa, controller, messaggiFinali: null };
}

function storeFinto() {
  const record = new Map(); // chiave: `${cartella}::${id}`
  const libreria = new Map(); // chiave: `${cartella}::${id}` -> {testo}
  let prossimoIdLibreria = 1;
  return {
    record, libreria,
    creaRicercaFn: async ({ cartella, id, domanda, profondita }) => {
      const voce = { id, domanda, profondita, titolo: null, terminata: null, reportLibraryId: null, avviataAlle: '2026-08-30T10:00:00.000Z' };
      record.set(`${cartella}::${id}`, voce);
      return voce;
    },
    leggiRicercaFn: async ({ cartella, id }) => record.get(`${cartella}::${id}`) ?? null,
    aggiornaRicercaFn: async ({ cartella, id, titolo, terminata, reportLibraryId }) => {
      const voce = record.get(`${cartella}::${id}`);
      if (!voce) return null;
      if (titolo !== undefined) voce.titolo = titolo;
      if (terminata !== undefined) voce.terminata = terminata;
      if (reportLibraryId !== undefined) voce.reportLibraryId = reportLibraryId;
      return voce;
    },
    eliminaRicercaFn: async ({ cartella, id }) => {
      const chiave = `${cartella}::${id}`;
      if (!record.has(chiave)) return null;
      record.delete(chiave);
      return { id };
    },
    elencaRicercheFn: async ({ cartella }) => [...record.values()].filter((_v, i) => [...record.keys()][i].startsWith(`${cartella}::`)),
    salvaVoceLibreriaFn: async ({ cartella, testo }) => {
      const id = `lib-${prossimoIdLibreria}`;
      prossimoIdLibreria += 1;
      libreria.set(`${cartella}::${id}`, { testo });
      return id;
    },
    leggiVoceLibreriaFn: async ({ cartella, id }) => libreria.get(`${cartella}::${id}`) ?? null,
    eliminaVoceLibreriaFn: async ({ cartella, id }) => { libreria.delete(`${cartella}::${id}`); },
  };
}

function orchestratoreDiProva(sessioni, extra = {}) {
  const store = storeFinto();
  let contatoreId = 0;
  const orch = creaResearchOrchestrator({
    sessioni,
    avviaESeguiFn: () => ({ sessionId: 'mai-usato' }),
    randomUUIDFn: () => `sess-${(contatoreId += 1)}`,
    ...store,
    ...extra,
  });
  return { orch, store };
}

test('avvia: crea la metadata PRIMA di chiamare avviaESeguiFn (ordine verificato, non presunto)', async () => {
  const sessioni = new Map();
  const ordine = [];
  const store = storeFinto();
  const orch = creaResearchOrchestrator({
    sessioni,
    ...store,
    randomUUIDFn: () => 'sess-x',
    creaRicercaFn: async (spec) => { ordine.push('crea'); return store.creaRicercaFn(spec); },
    avviaESeguiFn: (spec) => { ordine.push('avvia'); return { sessionId: spec.sessionId }; },
  });
  const { id } = await orch.avvia({ cartella: '/p', question: 'Come funziona X?', depth: 'deep' });
  assert.equal(id, 'sess-x');
  assert.deepEqual(ordine, ['crea', 'avvia'], 'la metadata esiste PRIMA che la sessione parta — elimina la race con una conclusione fulminea');
});

test('⛔⛔⛔ AL CONTRARIO — avvia: torna {ok,esito,id}, MAI solo {id} — trovato dal vivo 30/8: il dispatch del kernel per research_start si aspetta lo STESSO contratto {ok,esito} degli altri 5 mutanti, e senza questo la ricerca partiva DAVVERO ma il modello leggeva "failed"', async () => {
  const { orch } = orchestratoreDiProva(new Map());
  const esito = await orch.avvia({ cartella: '/p', question: 'Qual è la capitale della Francia?', depth: 'deep' });
  assert.equal(esito.ok, true);
  assert.match(esito.esito, /Started the research «Qual è la capitale della Francia\?» \(id sess-1\)\./);
  assert.equal(esito.id, 'sess-1');
});

test('avvia: passa cartella/permessi Read only/onConclusioneFn a avviaESeguiFn, il prompt nomina la domanda', async () => {
  const sessioni = new Map();
  let ricevuto = null;
  const { orch } = orchestratoreDiProva(sessioni, {
    avviaESeguiFn: (spec) => { ricevuto = spec; return { sessionId: spec.sessionId }; },
  });
  await orch.avvia({ cartella: '/progetto', question: 'Quanto costa il caching OpenRouter?', depth: 'quick' });
  assert.equal(ricevuto.cartella, '/progetto');
  assert.equal(ricevuto.permessiRichiesti, 'Read only');
  assert.match(ricevuto.task.consegna, /Quanto costa il caching OpenRouter\?/);
  assert.match(ricevuto.task.consegna, /couple of searches/, 'depth:quick porta la guida "breve"');
  assert.equal(typeof ricevuto.onConclusioneFn, 'function');
});

test('mettiInPausa: id inesistente — rifiutato onestamente', () => {
  const { orch } = orchestratoreDiProva(new Map());
  const esito = orch.mettiInPausa({ id: 'fantasma' });
  assert.equal(esito.ok, false);
  assert.match(esito.esito, /no research with that id/);
});

test('mettiInPausa: sessione VIVA — abort chiamato, flag scritto, esito onesto', () => {
  const voce = vocePadre({ conclusa: false });
  const sessioni = new Map([['sess-1', voce]]);
  const { orch } = orchestratoreDiProva(sessioni);
  const esito = orch.mettiInPausa({ id: 'sess-1' });
  assert.equal(esito.ok, true);
  assert.equal(voce.controller.abortato, true);
  assert.equal(voce._ricercaTerminataRichiesta, 'paused');
});

test('AL CONTRARIO — mettiInPausa: sessione già conclusa — rifiutato, NESSUN abort chiamato', () => {
  const voce = vocePadre({ conclusa: true });
  const sessioni = new Map([['sess-1', voce]]);
  const { orch } = orchestratoreDiProva(sessioni);
  const esito = orch.mettiInPausa({ id: 'sess-1' });
  assert.equal(esito.ok, false);
  assert.equal(voce.controller.abortato, undefined, 'una sessione già ferma non va abortita una seconda volta');
});

test('annulla: sessione VIVA — abort chiamato, flag "cancelled"', () => {
  const voce = vocePadre({ conclusa: false });
  const sessioni = new Map([['sess-1', voce]]);
  const { orch } = orchestratoreDiProva(sessioni);
  const esito = orch.annulla({ id: 'sess-1' });
  assert.equal(esito.ok, true);
  assert.equal(voce.controller.abortato, true);
  assert.equal(voce._ricercaTerminataRichiesta, 'cancelled');
});

test('⭐ annulla: sessione GIÀ ferma (in pausa) — nessun abort, solo la metadata passa a cancelled', async () => {
  const voce = vocePadre({ cartella: '/p', conclusa: true });
  const sessioni = new Map([['sess-1', voce]]);
  const { orch, store } = orchestratoreDiProva(sessioni);
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-1', domanda: 'x' });
  const esito = await orch.annulla({ id: 'sess-1' });
  assert.equal(esito.ok, true);
  assert.equal(voce.controller.abortato, undefined);
  assert.equal(store.record.get('/p::sess-1').terminata, 'cancelled');
});

test('riprendi: id inesistente — rifiutato onestamente', async () => {
  const { orch } = orchestratoreDiProva(new Map());
  const esito = await orch.riprendi({ id: 'fantasma' });
  assert.equal(esito.ok, false);
  assert.match(esito.esito, /no research with that id/);
});

test('riprendi: senza messaggiFinali e NON interrotta — "still running", nessun avviaESegui chiamato', async () => {
  const voce = { ...vocePadre(), messaggiFinali: null, interrotta: false };
  const sessioni = new Map([['sess-1', voce]]);
  let chiamata = false;
  const { orch } = orchestratoreDiProva(sessioni, { avviaESeguiFn: () => { chiamata = true; return { sessionId: 'mai' }; } });
  const esito = await orch.riprendi({ id: 'sess-1' });
  assert.equal(esito.ok, false);
  assert.match(esito.esito, /still running/);
  assert.equal(chiamata, false);
});

test('riprendi: senza messaggiFinali e INTERROTTA (riavvio server) — messaggio dedicato, nessun avviaESegui chiamato', async () => {
  const voce = { ...vocePadre(), messaggiFinali: null, interrotta: true };
  const sessioni = new Map([['sess-1', voce]]);
  let chiamata = false;
  const { orch } = orchestratoreDiProva(sessioni, { avviaESeguiFn: () => { chiamata = true; return { sessionId: 'mai' }; } });
  const esito = await orch.riprendi({ id: 'sess-1' });
  assert.equal(esito.ok, false);
  assert.match(esito.esito, /interrupted by a server restart/);
  assert.equal(chiamata, false);
});

test('riprendi: CON messaggiFinali — avviaESeguiFn riceve voceEsistente + un messaggio di continuazione in coda', async () => {
  const voce = {
    ...vocePadre({ cartella: '/p' }), messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'trovato A' }],
    taskId: 'ricerca', task: { consegna: 'x' }, forkDa: null, interrotta: false,
  };
  const sessioni = new Map([['sess-1', voce]]);
  let ricevuto = null;
  const { orch } = orchestratoreDiProva(sessioni, { avviaESeguiFn: (spec) => { ricevuto = spec; return { sessionId: spec.sessionId }; } });
  const esito = await orch.riprendi({ id: 'sess-1' });
  assert.equal(esito.ok, true);
  assert.equal(ricevuto.sessionId, 'sess-1');
  assert.equal(ricevuto.voceEsistente, voce);
  assert.equal(ricevuto.messaggiIniziali.length, 3, 'i 2 messaggi finali + 1 di continuazione');
  assert.equal(ricevuto.messaggiIniziali.at(-1).role, 'user');
  assert.match(ricevuto.messaggiIniziali.at(-1).content, /Continue the research/);
});

test('rinomina: id inesistente — rifiutato onestamente', async () => {
  const { orch } = orchestratoreDiProva(new Map());
  const esito = await orch.rinomina({ cartella: '/p', id: 'fantasma', title: 'x' });
  assert.equal(esito.ok, false);
});

test('rinomina: title esplicito — messaggio con il nuovo titolo, la metadata è aggiornata davvero', async () => {
  const { orch, store } = orchestratoreDiProva(new Map());
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-1', domanda: 'x' });
  const esito = await orch.rinomina({ cartella: '/p', id: 'sess-1', title: 'Il mio titolo' });
  assert.equal(esito.ok, true);
  assert.match(esito.esito, /Renamed that research to «Il mio titolo»/);
  assert.equal(store.record.get('/p::sess-1').titolo, 'Il mio titolo');
});

test('AL CONTRARIO — rinomina: title:null resetta a "mostra di nuovo la domanda", messaggio diverso', async () => {
  const { orch, store } = orchestratoreDiProva(new Map());
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-1', domanda: 'x' });
  const esito = await orch.rinomina({ cartella: '/p', id: 'sess-1', title: null });
  assert.equal(esito.ok, true);
  assert.match(esito.esito, /shows its question again/);
  assert.equal(store.record.get('/p::sess-1').titolo, null);
});

test('elimina: id inesistente — idempotente, ok:true, "nothing to delete"', async () => {
  const { orch } = orchestratoreDiProva(new Map());
  const esito = await orch.elimina({ cartella: '/p', id: 'fantasma' });
  assert.equal(esito.ok, true);
  assert.match(esito.esito, /nothing to delete/);
});

test('elimina: con reportLibraryId — cancella ANCHE la voce di Libreria, non solo la metadata', async () => {
  const { orch, store } = orchestratoreDiProva(new Map());
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-1', domanda: 'x' });
  const libId = await store.salvaVoceLibreriaFn({ cartella: '/p', testo: 'rapporto' });
  await store.aggiornaRicercaFn({ cartella: '/p', id: 'sess-1', terminata: 'done', reportLibraryId: libId });
  const esito = await orch.elimina({ cartella: '/p', id: 'sess-1' });
  assert.equal(esito.ok, true);
  assert.equal(store.record.has('/p::sess-1'), false);
  assert.equal(store.libreria.has(`/p::${libId}`), false, 'il rapporto in Libreria è sparito anche lui');
});

test('elenca: filtra per status, deriva il bucket dal vivo (non dalla sola metadata)', async () => {
  const sessioni = new Map([
    ['sess-running', vocePadre({ cartella: '/p', conclusa: false })],
    ['sess-paused', vocePadre({ cartella: '/p', conclusa: true })],
  ]);
  const { orch, store } = orchestratoreDiProva(sessioni);
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-running', domanda: 'A' });
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-paused', domanda: 'B' });
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-done', domanda: 'C' });
  await store.aggiornaRicercaFn({ cartella: '/p', id: 'sess-done', terminata: 'done' });

  const tutte = await orch.elenca({ cartella: '/p' });
  assert.equal(tutte.totale, 3);
  const bucketDi = (id) => tutte.ricerche.find((r) => r.id === id).stato;
  assert.equal(bucketDi('sess-running'), 'running');
  assert.equal(bucketDi('sess-paused'), 'paused');
  assert.equal(bucketDi('sess-done'), 'done');

  const soloRunning = await orch.elenca({ cartella: '/p', status: 'running' });
  assert.equal(soloRunning.totale, 1);
  assert.equal(soloRunning.ricerche[0].id, 'sess-running');
});

test('AL CONTRARIO — elenca: una sessione MAI tracciata (server riavviato, nessun voce in sessioni) è "failed", mai "running" per sempre', async () => {
  const { orch, store } = orchestratoreDiProva(new Map());
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-fantasma', domanda: 'x' });
  const esito = await orch.elenca({ cartella: '/p' });
  assert.equal(esito.ricerche[0].stato, 'failed');
});

test('AL CONTRARIO — elenca: una sessione INTERROTTA da un riavvio (interrotta:true) è "failed", mai "running"', async () => {
  const sessioni = new Map([['sess-1', { ...vocePadre({ cartella: '/p', conclusa: false }), interrotta: true }]]);
  const { orch, store } = orchestratoreDiProva(sessioni);
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-1', domanda: 'x' });
  const esito = await orch.elenca({ cartella: '/p' });
  assert.equal(esito.ricerche[0].stato, 'failed');
});

test('⛔⛔ elenca: page_size/offset NON numerici (o 0) sono clampati, mai trattati come "assenti" (stesso bug già trovato in Notes)', async () => {
  const { orch, store } = orchestratoreDiProva(new Map());
  for (let i = 1; i <= 3; i += 1) await store.creaRicercaFn({ cartella: '/p', id: `sess-${i}`, domanda: `q${i}` });
  const conZero = await orch.elenca({ cartella: '/p', page_size: 0 });
  assert.equal(conZero.ricerche.length, 1, 'page_size:0 si riporta al minimo 1, non al default 10');
});

test('leggi: id inesistente — trovata:false', async () => {
  const { orch } = orchestratoreDiProva(new Map());
  const esito = await orch.leggi({ cartella: '/p', id: 'fantasma' });
  assert.deepEqual(esito, { trovata: false });
});

test('leggi: ricerca "done" con rapporto leggibile — contenutoRapporto è il testo VERO della Libreria', async () => {
  const sessioni = new Map([['sess-1', vocePadre({ cartella: '/p', conclusa: true })]]);
  const { orch, store } = orchestratoreDiProva(sessioni);
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-1', domanda: 'x' });
  const libId = await store.salvaVoceLibreriaFn({ cartella: '/p', testo: 'Il rapporto vero.' });
  await store.aggiornaRicercaFn({ cartella: '/p', id: 'sess-1', terminata: 'done', reportLibraryId: libId, titolo: 'Titolo scelto' });
  const esito = await orch.leggi({ cartella: '/p', id: 'sess-1' });
  assert.equal(esito.trovata, true);
  assert.equal(esito.stato, 'done');
  assert.equal(esito.titolo, 'Titolo scelto');
  assert.equal(esito.contenutoRapporto, 'Il rapporto vero.');
});

test('leggi: ricerca ancora "running" — contenutoRapporto è null, mai un tentativo di leggerlo', async () => {
  const sessioni = new Map([['sess-1', vocePadre({ cartella: '/p', conclusa: false })]]);
  const { orch, store } = orchestratoreDiProva(sessioni);
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-1', domanda: 'x' });
  const esito = await orch.leggi({ cartella: '/p', id: 'sess-1' });
  assert.equal(esito.stato, 'running');
  assert.equal(esito.contenutoRapporto, null);
});

test('la conclusione naturale (via onConclusioneFn passato ad avvia): report salvato in Libreria, terminata:"done"', async () => {
  const sessioni = new Map();
  let onConclusioneCatturata = null;
  const { orch, store } = orchestratoreDiProva(sessioni, {
    avviaESeguiFn: (spec) => { onConclusioneCatturata = spec.onConclusioneFn; sessioni.set(spec.sessionId, vocePadre({ cartella: spec.cartella, conclusa: false })); return { sessionId: spec.sessionId }; },
  });
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  await onConclusioneCatturata({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: 'Il rapporto finale.' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'done');
  assert.ok(record.reportLibraryId);
  assert.equal(store.libreria.get(`/p::${record.reportLibraryId}`).testo, 'Il rapporto finale.');
});

test('AL CONTRARIO — conclusione con giri esauriti ma un testo parziale: "failed", il testo parziale è comunque salvato', async () => {
  const sessioni = new Map();
  let onConclusioneCatturata = null;
  const { orch, store } = orchestratoreDiProva(sessioni, {
    avviaESeguiFn: (spec) => { onConclusioneCatturata = spec.onConclusioneFn; return { sessionId: spec.sessionId }; },
  });
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  await onConclusioneCatturata({ ok: true, esito: { comeFinita: 'giri-esauriti', messaggiFinali: [{ role: 'assistant', content: 'Trovato parziale.' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'failed');
  assert.ok(record.reportLibraryId, 'il testo parziale è comunque salvabile, non buttato');
});

test('AL CONTRARIO — conclusione senza NESSUN testo assistente: "failed", zero voci in Libreria', async () => {
  const sessioni = new Map();
  let onConclusioneCatturata = null;
  const { orch, store } = orchestratoreDiProva(sessioni, {
    avviaESeguiFn: (spec) => { onConclusioneCatturata = spec.onConclusioneFn; return { sessionId: spec.sessionId }; },
  });
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  await onConclusioneCatturata({ ok: true, esito: { comeFinita: 'giri-esauriti', messaggiFinali: [{ role: 'user', content: 'x' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'failed');
  assert.equal(record.reportLibraryId, null);
  assert.equal(store.libreria.size, 0);
});

test('AL CONTRARIO — salvaVoceLibreriaFn che lancia: "failed", mai un successo inventato', async () => {
  const sessioni = new Map();
  let onConclusioneCatturata = null;
  const { orch, store } = orchestratoreDiProva(sessioni, {
    avviaESeguiFn: (spec) => { onConclusioneCatturata = spec.onConclusioneFn; return { sessionId: spec.sessionId }; },
    salvaVoceLibreriaFn: async () => { throw new Error('disco pieno'); },
  });
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  await onConclusioneCatturata({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: 'testo' }] } });
  assert.equal(store.record.get(`/p::${id}`).terminata, 'failed');
});

test('la pausa (via onConclusioneFn): terminata resta null, ZERO scritture in Libreria', async () => {
  const sessioni = new Map();
  let onConclusioneCatturata = null;
  const { orch, store } = orchestratoreDiProva(sessioni, {
    avviaESeguiFn: (spec) => { onConclusioneCatturata = spec.onConclusioneFn; sessioni.set(spec.sessionId, vocePadre({ cartella: spec.cartella, conclusa: false })); return { sessionId: spec.sessionId }; },
  });
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  orch.mettiInPausa({ id }); // scrive il flag SUL voce, non abortisce per davvero nel test (il controller.abort finto lo marca soltanto)
  await onConclusioneCatturata({ ok: true, esito: { comeFinita: 'fermato', messaggiFinali: [{ role: 'assistant', content: 'testo parziale mai finito' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, null, 'una pausa non finalizza mai la ricerca');
  assert.equal(record.reportLibraryId, null);
  assert.equal(store.libreria.size, 0);
});

test('⭐⭐⭐ AL CONTRARIO — il flag si azzera: pausa → ripresa → conclusione NATURALE non viene scambiata per una seconda pausa', async () => {
  const sessioni = new Map();
  let onConclusioneCatturata = null;
  const { orch, store } = orchestratoreDiProva(sessioni, {
    avviaESeguiFn: (spec) => {
      onConclusioneCatturata = spec.onConclusioneFn;
      if (!sessioni.has(spec.sessionId)) sessioni.set(spec.sessionId, vocePadre({ cartella: spec.cartella, conclusa: false }));
      return { sessionId: spec.sessionId };
    },
  });
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });

  // Primo giro: pausa.
  orch.mettiInPausa({ id });
  await onConclusioneCatturata({ ok: true, esito: { comeFinita: 'fermato', messaggiFinali: [{ role: 'assistant', content: 'parziale' }] } });
  assert.equal(store.record.get(`/p::${id}`).terminata, null, 'dopo la pausa, ancora resumable');
  assert.equal(sessioni.get(id)._ricercaTerminataRichiesta, null, 'il flag è stato azzerato subito dopo averlo letto');

  // Secondo giro: ripresa che stavolta conclude DAVVERO da sola (nessuna pausa chiesta).
  const voce = sessioni.get(id);
  voce.messaggiFinali = [{ role: 'assistant', content: 'parziale' }];
  voce.taskId = 'ricerca'; voce.task = { consegna: 'x' }; voce.interrotta = false;
  await orch.riprendi({ id });
  await onConclusioneCatturata({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: 'Il rapporto finale, stavolta vero.' }] } });

  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'done', 'la conclusione naturale del SECONDO giro non è scambiata per un\'altra pausa');
  assert.ok(record.reportLibraryId);
  assert.equal(store.libreria.get(`/p::${record.reportLibraryId}`).testo, 'Il rapporto finale, stavolta vero.');
});

test('la cancellazione (via onConclusioneFn): terminata:"cancelled", ZERO scritture in Libreria', async () => {
  const sessioni = new Map();
  let onConclusioneCatturata = null;
  const { orch, store } = orchestratoreDiProva(sessioni, {
    avviaESeguiFn: (spec) => { onConclusioneCatturata = spec.onConclusioneFn; sessioni.set(spec.sessionId, vocePadre({ cartella: spec.cartella, conclusa: false })); return { sessionId: spec.sessionId }; },
  });
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  orch.annulla({ id });
  await onConclusioneCatturata({ ok: true, esito: { comeFinita: 'fermato', messaggiFinali: [{ role: 'assistant', content: 'x' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'cancelled');
  assert.equal(store.libreria.size, 0);
});
