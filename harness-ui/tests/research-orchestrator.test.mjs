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

/*
 * ⭐⭐⭐ L2 (11/09/2026) — LA FIXTURE DEL RAPPORTO VERO, quella che oggi manca a una scusa.
 * Un rapporto minimo valido: intestazione + almeno un'affermazione + almeno una fonte con URL.
 * È esattamente ciò che `rileggiRapportoMinimo` (research-store.mjs) chiede, e ciò che la
 * consegna promette al modello — un cancello che chiede una forma mai dichiarata è una
 * trappola, non una difesa.
 */
const RAPPORTO_VERO = [
  '# Come stanno evolvendo gli harness agentici desktop',
  '',
  'Gli harness desktop nel 2026 convergono su tre capacità: controllo del computer, permessi per attrezzo e memoria persistente.',
  '',
  '## Fonti',
  '- https://arxiv.org/abs/2606.20023',
  '- https://www.anthropic.com/engineering/multi-agent-research-system',
].join('\n');

/*
 * ⛔⛔⛔ LA SCUSA VERBATIM della sessione `d2a453a8-67e3-4c7a-85a0-c3e1dbe10b35`, 11/09/2026,
 * ore 19:00: 290 byte, salvati in Libreria come «Research - …md» e timbrati `terminata:'done'`
 * dopo 9 `web_search`, 14 `naviga` e 484.171 token di ingresso pagati. Sta qui parola per
 * parola perché è il caso che il cancello di consegna deve respingere — e perché un giorno in
 * cui lo respingesse per un motivo DIVERSO da quello per cui fallì allora, il test lo direbbe.
 */
const SCUSA_DEL_11_SETTEMBRE = 'La sessione è in sola lettura, quindi non posso creare documenti direttamente. '
  + 'Tuttavia, posso darti il contenuto completo in un formato pronto per essere salvato, o posso provare a '
  + 'scriverlo in un file del workspace. Vuoi che cerchi il modo per salvarlo in un file markdown nel workspace?';

/** Il REFUSED verbatim che il kernel ha scritto quel giorno, come risultato di `document_create`. */
const REFUSED_VERBATIM = 'REFUSED. la sessione è in sola lettura: nessuna scrittura, comando o documento è permesso in questo momento. Nothing was created.';

function storeFinto() {
  const record = new Map(); // chiave: `${cartella}::${id}`
  const libreria = new Map(); // chiave: `${cartella}::${id}` -> {testo}
  const rapporti = new Map(); // chiave: `${cartella}::${id}` -> testo del rapporto DEPOSITATO
  let prossimoIdLibreria = 1;
  return {
    record, libreria, rapporti,
    /* ⛔ Il lettore del rapporto è iniettato: nessun test di questo file tocca un filesystem vero. */
    leggiRapportoFn: async ({ cartella, id }) => rapporti.get(`${cartella}::${id}`) ?? null,
    creaRicercaFn: async ({ cartella, id, domanda, profondita, padreId = null, nome = null }) => {
      const voce = {
        id, domanda, profondita, titolo: null, terminata: null, reportLibraryId: null,
        avviataAlle: '2026-08-30T10:00:00.000Z', conclusaAlle: null,
        padreId, nome, ultimoMessaggio: null, motivoDettaglio: null,
      };
      record.set(`${cartella}::${id}`, voce);
      return voce;
    },
    leggiRicercaFn: async ({ cartella, id }) => record.get(`${cartella}::${id}`) ?? null,
    aggiornaRicercaFn: async ({ cartella, id, titolo, terminata, reportLibraryId, conclusaAlle, ultimoMessaggio, motivoDettaglio }) => {
      const voce = record.get(`${cartella}::${id}`);
      if (!voce) return null;
      if (titolo !== undefined) voce.titolo = titolo;
      if (terminata !== undefined) voce.terminata = terminata;
      if (reportLibraryId !== undefined) voce.reportLibraryId = reportLibraryId;
      if (conclusaAlle !== undefined) voce.conclusaAlle = conclusaAlle;
      if (ultimoMessaggio !== undefined) voce.ultimoMessaggio = ultimoMessaggio;
      if (motivoDettaglio !== undefined) voce.motivoDettaglio = motivoDettaglio;
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

test('⛔⛔⛔ L1 — avvia: permessiRichiesti "Research" (MAI più "Read only"), ricercaId nel task, padreId agganciato, nome troncato', async () => {
  const sessioni = new Map();
  let ricevuto = null;
  const { orch, store } = orchestratoreDiProva(sessioni, {
    avviaESeguiFn: (spec) => { ricevuto = spec; return { sessionId: spec.sessionId }; },
  });
  const { id } = await orch.avvia({ cartella: '/progetto', question: 'Quanto costa il caching OpenRouter?', depth: 'quick', padreId: 'madre-1' });
  assert.equal(ricevuto.cartella, '/progetto');
  /*
   * ⛔ La riga per cui esiste tutto L1: con 'Read only' la ricerca non poteva consegnare, e
   * l'11/09 ha salvato come rapporto la scusa con cui si giustificava di non poterlo fare.
   */
  assert.equal(ricevuto.permessiRichiesti, 'Research');
  assert.notEqual(ricevuto.permessiRichiesti, 'Read only');
  // ⛔ Il percorso del deposito si costruisce da QUI, non da un argomento del modello.
  assert.equal(ricevuto.task.ricercaId, id, 'l\'id della ricerca viaggia dentro il task, che è persistito e sopravvive a un resume');
  assert.equal(ricevuto.padreId, 'madre-1', '§6.6: la ricerca è figlia della chat che l\'ha ordinata, non una sessione orfana');
  assert.match(ricevuto.task.consegna, /Quanto costa il caching OpenRouter\?/);
  assert.match(ricevuto.task.consegna, /couple of searches/, 'depth:quick porta la guida "breve"');
  assert.match(ricevuto.task.consegna, /research_deposit/, 'la consegna dice COME si consegna');
  assert.match(ricevuto.task.consegna, /is not the report/, 'e dice che l\'ultimo messaggio NON è il rapporto');
  assert.equal(typeof ricevuto.onConclusioneFn, 'function');
  const salvata = store.record.get(`/progetto::${id}`);
  assert.equal(salvata.padreId, 'madre-1', 'il legame è anche sulla metadata: sopravvive al riavvio, quando la voce di sessione non c\'è più');
  assert.equal(salvata.nome, 'Quanto costa il caching OpenRouter?');
});

test('§6.6 — nome: una domanda lunga è troncata a 80 caratteri, sull\'ultimo spazio', async () => {
  const sessioni = new Map();
  const lunga = 'Come stanno evolvendo gli harness agentici desktop nel 2026 e quali capacità di controllo computer offrono';
  const { orch, store } = orchestratoreDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: lunga, depth: 'deep' });
  const nome = store.record.get(`/p::${id}`).nome;
  assert.ok(nome.length <= 81, `il nome sta nel tetto di 80+ellissi imposto da registro.rinomina(), è ${nome.length}`);
  assert.ok(nome.endsWith('…'), 'un nome troncato lo dichiara');
  assert.ok(!nome.includes('capacit…'), 'taglia su uno spazio, non a metà parola');
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

test('leggi: ricerca "done" con un rapporto DEPOSITATO e valido — contenutoRapporto è il testo vero', async () => {
  const sessioni = new Map([['sess-1', vocePadre({ cartella: '/p', conclusa: true })]]);
  const { orch, store } = orchestratoreDiProva(sessioni);
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-1', domanda: 'x' });
  store.rapporti.set('/p::sess-1', RAPPORTO_VERO);
  const libId = await store.salvaVoceLibreriaFn({ cartella: '/p', testo: RAPPORTO_VERO });
  await store.aggiornaRicercaFn({ cartella: '/p', id: 'sess-1', terminata: 'done', reportLibraryId: libId, titolo: 'Titolo scelto' });
  const esito = await orch.leggi({ cartella: '/p', id: 'sess-1' });
  assert.equal(esito.trovata, true);
  assert.equal(esito.stato, 'done');
  assert.equal(esito.titolo, 'Titolo scelto');
  assert.equal(esito.contenutoRapporto, RAPPORTO_VERO);
  assert.equal(esito.motivo, null, 'un «motivo» su una cosa riuscita sarebbe rumore');
});

test('⛔⛔⛔ §6.5 COMPATIBILITÀ ALL\'INDIETRO — una ricerca già su disco con terminata:"done" e in Libreria la SCUSA del 11/09 si mostra "senza-rapporto", e il file NON viene riscritto', async () => {
  const sessioni = new Map([['d2a453a8', vocePadre({ cartella: '/p', conclusa: true })]]);
  const { orch, store } = orchestratoreDiProva(sessioni);
  await store.creaRicercaFn({ cartella: '/p', id: 'd2a453a8', domanda: 'Come stanno evolvendo gli harness agentici desktop nel 2026' });
  const libId = await store.salvaVoceLibreriaFn({ cartella: '/p', testo: SCUSA_DEL_11_SETTEMBRE });
  await store.aggiornaRicercaFn({ cartella: '/p', id: 'd2a453a8', terminata: 'done', reportLibraryId: libId });
  // ⛔ nessun rapporto depositato: è una ricerca nata prima che `research_deposit` esistesse.

  const esito = await orch.leggi({ cartella: '/p', id: 'd2a453a8' });
  assert.equal(esito.stato, 'senza-rapporto', 'il timbro verde non regge alla rilettura del contenuto');
  assert.equal(esito.contenutoRapporto, null, 'una scusa non si serve come rapporto');
  assert.match(esito.motivo, /non ha un'intestazione|non elenca nessuna fonte/, 'il motivo dice PERCHÉ, in italiano');
  // ⛔ Ciò che è costato denaro non si sovrascrive: la correzione vive nella LETTURA.
  assert.equal(store.record.get('/p::d2a453a8').terminata, 'done', 'il record su disco resta com\'era: nessuna riscrittura in silenzio');
  assert.equal(store.record.get('/p::d2a453a8').reportLibraryId, libId, 'e il puntatore al lavoro già pagato non si perde');
});

test('leggi: ricerca ancora "running" — contenutoRapporto è null, mai un tentativo di leggerlo', async () => {
  const sessioni = new Map([['sess-1', vocePadre({ cartella: '/p', conclusa: false })]]);
  const { orch, store } = orchestratoreDiProva(sessioni);
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-1', domanda: 'x' });
  const esito = await orch.leggi({ cartella: '/p', id: 'sess-1' });
  assert.equal(esito.stato, 'running');
  assert.equal(esito.contenutoRapporto, null);
});

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * L2 — IL CANCELLO DI CONSEGNA. I cinque esiti, uno per test, più i due versi contrari.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function conclusioneDiProva(sessioni, extra = {}) {
  let onConclusioneCatturata = null;
  const { orch, store } = orchestratoreDiProva(sessioni, {
    avviaESeguiFn: (spec) => {
      onConclusioneCatturata = spec.onConclusioneFn;
      if (!sessioni.has(spec.sessionId)) sessioni.set(spec.sessionId, vocePadre({ cartella: spec.cartella, conclusa: false }));
      return { sessionId: spec.sessionId };
    },
    ...extra,
  });
  return { orch, store, conclusione: (risultato) => onConclusioneCatturata(risultato) };
}

test('L2 — rapporto DEPOSITATO e valido: terminata:"done", la Libreria porta il rapporto VERO (non l\'ultimo messaggio)', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  store.rapporti.set(`/p::${id}`, RAPPORTO_VERO);
  await conclusione({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: 'Fatto, il rapporto è pronto.' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'done');
  assert.ok(record.reportLibraryId);
  assert.equal(store.libreria.get(`/p::${record.reportLibraryId}`).testo, RAPPORTO_VERO, 'in Libreria finisce il DEPOSITO, non la chiacchiera finale');
  assert.equal(record.ultimoMessaggio, 'Fatto, il rapporto è pronto.', 'l\'ultimo messaggio si conserva come ALLEGATO');
  assert.ok(record.conclusaAlle, 'conclusaAlle è scritto una volta sola, alla conclusione vera');
});

test('⛔⛔⛔ L2, LA FIXTURE DEL GUASTO — la scusa verbatim del 11/09 + un REFUSED di permesso ⇒ "bloccata-dal-permesso", MAI "done"', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'Come stanno evolvendo gli harness agentici desktop nel 2026', depth: 'deep' });
  // ⛔ Nessun rapporto depositato: è esattamente lo stato in cui la corsa vera si è trovata.
  await conclusione({
    ok: true,
    esito: {
      comeFinita: 'concluso', // ⛔ il kernel diceva `outcome: success`: per lui la corsa ERA riuscita
      messaggiFinali: [
        { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'document_create' } }] },
        { role: 'tool', tool_call_id: 'c1', content: REFUSED_VERBATIM },
        { role: 'assistant', content: SCUSA_DEL_11_SETTEMBRE },
      ],
    },
  });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'bloccata-dal-permesso');
  assert.notEqual(record.terminata, 'done', 'una scusa non è più una consegna');
  assert.equal(record.reportLibraryId, null, 'e non finisce in Libreria spacciata per un rapporto');
  assert.equal(store.libreria.size, 0);
  assert.equal(record.ultimoMessaggio, SCUSA_DEL_11_SETTEMBRE, 'la scusa si conserva: è la diagnosi, non il prodotto');
  const esito = await orch.leggi({ cartella: '/p', id });
  assert.match(esito.motivo, /sola lettura/, 'il prodotto nomina il proprio errore, in italiano');
});

test('⛔ L2 AL CONTRARIO — la scusa DA SOLA, senza nessun REFUSED nei risultati degli attrezzi, non basta a dire "bloccata dal permesso"', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  await conclusione({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: SCUSA_DEL_11_SETTEMBRE }] } });
  /*
   * ⛔ È la lezione «un filtro che riconosce la MENZIONE invece della cosa»: il testo PARLA di
   * sola lettura, ma nel registro non c'è nessun rifiuto. Diagnosi sbagliata ⇒ cura sbagliata.
   */
  assert.equal(store.record.get(`/p::${id}`).terminata, 'failed');
});

test('⛔ L2 AL CONTRARIO — un REFUSED citato DAL MODELLO (role:"assistant") non conta: conta il registro degli attrezzi, non il racconto', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  await conclusione({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: `Mi ha risposto: «${REFUSED_VERBATIM}»` }] } });
  assert.equal(store.record.get(`/p::${id}`).terminata, 'failed');
});

test('L2 — nessun rapporto e giri finiti: "giri-esauriti" (non "failed": è un guasto noto e si cura in un altro modo)', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  await conclusione({ ok: true, esito: { comeFinita: 'giri-esauriti', messaggiFinali: [{ role: 'assistant', content: 'Trovato parziale.' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'giri-esauriti');
  assert.equal(record.reportLibraryId, null, 'un parziale non depositato non diventa un rapporto');
  assert.equal(record.ultimoMessaggio, 'Trovato parziale.');
});

test('⭐ L2 — un rapporto VALIDO depositato E i giri esauriti: vince il PRODOTTO, "done". L\'errore opposto va evitato con la stessa cura', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  store.rapporti.set(`/p::${id}`, RAPPORTO_VERO);
  await conclusione({ ok: true, esito: { comeFinita: 'giri-esauriti', messaggiFinali: [{ role: 'assistant', content: 'ho finito i giri' }] } });
  assert.equal(store.record.get(`/p::${id}`).terminata, 'done', 'chi ha consegnato ha consegnato: i giri finiti dopo non annullano la consegna');
});

test('L2 — rapporto depositato ma SENZA FONTI: "senza-rapporto", e il motivo lo dice', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  store.rapporti.set(`/p::${id}`, '# Un titolo\n\nUna affermazione senza nessuna prova dietro.\n');
  await conclusione({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: 'fatto' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'senza-rapporto');
  assert.equal(record.motivoDettaglio, 'il rapporto non elenca nessuna fonte');
  assert.equal(store.libreria.size, 0, 'un rapporto che non passa il cancello non entra in Libreria');
});

test('⭐ L2 — il rapporto è su disco ma la Libreria lancia: resta "done" con reportLibraryId null — il posto vero del rapporto è la sua cartella', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni, {
    salvaVoceLibreriaFn: async () => { throw new Error('disco pieno'); },
  });
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  store.rapporti.set(`/p::${id}`, RAPPORTO_VERO);
  await conclusione({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: 'fatto' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'done', 'ciò che è costato denaro non si dichiara perso perché una COPIA non è riuscita');
  assert.equal(record.reportLibraryId, null, 'e non si inventa un id di Libreria che non esiste');
});

test('AL CONTRARIO — conclusione senza NESSUN testo assistente e senza rapporto: "failed", zero voci in Libreria', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  await conclusione({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'failed');
  assert.equal(record.reportLibraryId, null);
  assert.equal(record.ultimoMessaggio, null);
  assert.equal(store.libreria.size, 0);
});

test('⭐⭐⭐ CONTRATTO §6.4 — ogni voce di elenca() porta i dodici campi che la sezione legge', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'Quanto costa il caching?', depth: 'deep', padreId: 'madre-1' });
  store.rapporti.set(`/p::${id}`, RAPPORTO_VERO);
  await conclusione({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: 'pronto' }] } });

  const { ricerche } = await orch.elenca({ cartella: '/p' });
  assert.equal(ricerche.length, 1);
  const v = ricerche[0];
  assert.deepEqual(Object.keys(v).sort(), [
    'avviataAlle', 'conclusaAlle', 'domanda', 'id', 'motivo', 'nome',
    'padreId', 'question', 'reportLibraryId', 'stato', 'titolo', 'ultimoMessaggio',
  ], 'il contratto è esattamente questo: il frontend ci sta scrivendo sopra');
  assert.equal(v.id, id);
  assert.equal(v.question, 'Quanto costa il caching?');
  assert.equal(v.question, v.domanda, 'due nomi, lo stesso valore: mai una traduzione muta a metà strada');
  assert.equal(v.stato, 'done');
  assert.equal(v.motivo, null, 'motivo solo quando NON è done');
  assert.equal(v.padreId, 'madre-1');
  assert.equal(v.nome, 'Quanto costa il caching?');
  assert.ok(v.conclusaAlle);
  assert.ok(v.reportLibraryId);
  assert.equal(v.ultimoMessaggio, 'pronto');
});

test('CONTRATTO — una voce vecchia (nata senza padreId/nome/conclusaAlle) non rompe il contratto: null onesti, nome ricavato dalla domanda', async () => {
  const sessioni = new Map();
  const { orch, store } = orchestratoreDiProva(sessioni);
  // Una riga come quelle già su disco prima dell'11/09: quattro campi e basta.
  store.record.set('/p::vecchia', { id: 'vecchia', domanda: 'Una domanda di ieri', avviataAlle: '2026-09-01T10:00:00.000Z', terminata: 'cancelled' });
  const { ricerche } = await orch.elenca({ cartella: '/p' });
  const v = ricerche[0];
  assert.equal(v.padreId, null);
  assert.equal(v.conclusaAlle, null, 'mai una data inventata per un campo che non esisteva');
  assert.equal(v.ultimoMessaggio, null);
  assert.equal(v.nome, 'Una domanda di ieri');
  assert.equal(v.stato, 'cancelled');
  assert.match(v.motivo, /fermata per sempre/);
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
  // ⭐ L2: la ripresa consegna DAVVERO, cioè deposita. Prima d'oggi «consegnare» voleva dire «dire qualcosa».
  store.rapporti.set(`/p::${id}`, RAPPORTO_VERO);
  await onConclusioneCatturata({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: 'Depositato.' }] } });

  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'done', 'la conclusione naturale del SECONDO giro non è scambiata per un\'altra pausa');
  assert.ok(record.reportLibraryId);
  assert.equal(store.libreria.get(`/p::${record.reportLibraryId}`).testo, RAPPORTO_VERO);
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
