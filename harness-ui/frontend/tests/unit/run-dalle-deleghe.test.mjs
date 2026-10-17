/*
 * UI deleghe (owner 12/10/2026, approvata la sera stessa): l'adattatore che fa passare l'albero dei sotto-agenti dal diagramma del
 * Workflow. La conversazione è la scheda IN CIMA (owner: «Deleghe di questa conversazione» e «Questa conversazione» erano doppioni),
 * i gruppi sono soltanto i lotti di delega. Provato contro il consumatore VERO (`creaFonte`, la sorgente del diagramma).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { creaFonte } from '../../src/components/grafo/fonte.js';
import { STATI_PASSO } from '../../src/components/grafo/comuni.js';
import { disponi } from '../../src/components/grafo/disposizione.js';
import { creaClientDeleghe, FINESTRA_LOTTO_MS, idDelNodo, NOME_IN_UNA_FRASE, NOME_MASSIMO, nomeBreve, runDalleDeleghe, statoDelPasso, storiaDallaCronologia } from '../../src/components/grafo/run-dalle-deleghe.js';

const T0 = Date.parse('2026-10-12T09:00:00.000Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const figlia = (id, nascita, extra = {}) => ({ sessionId: id, padreId: 'madre', avviataAlle: at(nascita), conclusa: false, modello: 'ollama:mock-model', taskCorto: `Compito ${id}`, ...extra });
const finita = (id, nascita, fine, extra = {}) => figlia(id, nascita, { conclusa: true, conclusaAlle: at(fine), esitoDelega: 'concluso', ...extra });
const madre = { sessionId: 'madre', avviataAlle: at(0), conclusa: false, taskCorto: 'Conversazione' };

test('DELEGHE-RUN-01 — i figli dello stesso padre nati insieme sono UN lotto; nati più tardi, un altro; la conversazione non è un gruppo', () => {
  const r = runDalleDeleghe({ corrente: madre, figli: [
    finita('a', 10, 70), finita('b', 12, 90), figlia('c', 10 + FINESTRA_LOTTO_MS / 1000), // ognuno entro la finestra dal precedente
    figlia('d', 400), figlia('e', 405),                                                    // un secondo lotto, minuti dopo
  ] });
  assert.deepEqual(r.panoramica.groups.map((g) => [g.phaseId, g.total, g.daConversazione]), [['lotto-1', 3, true], ['lotto-2', 2, true]]);
  assert.deepEqual(r.righe.get('lotto-1').map((x) => x.sessionId), ['a', 'b', 'c']);
  assert.equal(r.panoramica.total, 5, 'cinque agenti delegati: la conversazione non è una riga');
  assert.equal(r.panoramica.terminated, 2);
  assert.equal(r.panoramica.status, 'running');
  assert.equal(r.panoramica.conversazione.sessionId, 'madre');
  assert.equal(r.nodoDi.has('madre'), false);
  // AL CONTRARIO: un solo secondo oltre la finestra apre un lotto nuovo
  const stretto = runDalleDeleghe({ corrente: madre, figli: [figlia('a', 10), figlia('b', 10 + FINESTRA_LOTTO_MS / 1000 + 1)] });
  assert.deepEqual(stretto.panoramica.groups.map((g) => g.total), [1, 1]);
});

test('DELEGHE-RUN-02 — i nipoti fanno un lotto loro, legato all’agente che li ha avviati (non alla conversazione); archi solo agente→agente', () => {
  const r = runDalleDeleghe({ corrente: madre, sessioni: [
    { sessionId: 'n1', padreId: 'b', avviataAlle: at(100), conclusa: false }, { sessionId: 'n2', padreId: 'b', avviataAlle: at(101), conclusa: false },
    { sessionId: 'estranea', padreId: 'altra-conversazione', avviataAlle: at(5), conclusa: false }, // non è della famiglia: fuori
  ], figli: [figlia('a', 10), figlia('b', 11)] });
  assert.deepEqual(r.panoramica.groups.map((g) => [g.total, g.daConversazione]), [[2, true], [2, false]]);
  const id = (s) => r.nodoDi.get(s);
  assert.deepEqual(r.archi.map((a) => `${a.fromNodeId}>${a.toNodeId}`).sort(), [`${id('b')}>${id('n1')}`, `${id('b')}>${id('n2')}`].sort(),
    'dalla conversazione partono le frecce della scheda in cima, non archi di passo');
  assert.equal(r.nodoDi.has('estranea'), false);
  assert.deepEqual(r.panoramica.groupConnections.map((c) => [c.fromPhaseId, c.toPhaseId, c.total]), [['lotto-1', 'lotto-2', 2]]);
  assert.equal(r.righe.get('lotto-1').find((x) => x.sessionId === 'b').childCount, 2);
});

test('DELEGHE-RUN-03 — lo stato di un agente nelle parole dei passi, nei due versi, e solo stati che il diagramma conosce', () => {
  const casi = [
    [{ conclusa: false, avviataAlle: at(1) }, 'running'], [{ conclusa: false }, 'pending'],
    [{ conclusa: true, esitoDelega: 'concluso' }, 'succeeded'], [{ conclusa: true, esitoDelega: 'fallito' }, 'failed'],
    [{ conclusa: true, esitoDelega: 'fallito', motivoChiusura: 'fermata' }, 'cancelled'], [{ interrotta: true }, 'cancelled'],
    [{ conclusa: false, avviataAlle: at(1), approvalPendingCount: 1 }, 'waiting_human'], [{ conclusa: false, avviataAlle: at(1), questionPendingCount: 2 }, 'waiting_human'],
    [{ conclusa: false, avviataAlle: at(1), approvalPendingCount: 0 }, 'running'], [{ conclusa: false, esitoDelega: 'in-pausa' }, 'waiting_human'],
  ];
  for (const [agente, atteso] of casi) {
    assert.equal(statoDelPasso(agente), atteso, JSON.stringify(agente));
    assert.ok(STATI_PASSO[atteso], `il diagramma non conosce ${atteso}`);
  }
  for (const attesa of ['inAttesaDomanda', 'inAttesaPiano', 'inAttesaApprovazione']) assert.equal(statoDelPasso({ conclusa: false, avviataAlle: at(1), [attesa]: true }), 'waiting_human', attesa);
});

test('DELEGHE-RUN-04 — solo fatti dichiarati: senza fine niente durata, senza nascita niente inizio; un ciclo nei dati non gira all’infinito', () => {
  const r = runDalleDeleghe({ corrente: madre, figli: [figlia('a', 10), { sessionId: 'b', padreId: 'madre', conclusa: false }, finita('c', 10, 40)] });
  const riga = (s) => r.tutte.find((x) => x.sessionId === s);
  assert.deepEqual([riga('a').startedAt, riga('a').finishedAt, riga('a').durationMs], [at(10), null, null]);
  assert.deepEqual([riga('b').startedAt, riga('b').state], [null, 'pending']);
  assert.equal(riga('c').durationMs, 30_000);
  const ciclo = runDalleDeleghe({ corrente: madre, sessioni: [{ sessionId: 'x', padreId: 'y', avviataAlle: at(1) }, { sessionId: 'y', padreId: 'x', avviataAlle: at(2) }, { sessionId: 'z', padreId: 'madre', avviataAlle: at(3) }, { sessionId: 'madre', padreId: 'z' }] });
  assert.deepEqual(ciclo.tutte.map((x) => x.sessionId), ['z']);
  assert.equal(runDalleDeleghe({ corrente: {} }).panoramica.total, 0, 'senza conversazione non c’è niente da disegnare');
});

test('DELEGHE-RUN-11 — l’ora del lotto viaggia a parte dal nome (nel titolo andava a capo col punto appeso); senza nascita, nessuna ora', () => {
  const orarioLotto = ({ quando }) => new Date(quando).toISOString().slice(11, 16);
  const r = runDalleDeleghe({ corrente: madre, figli: [figlia('a', 10), figlia('b', 400)] }, { etichettaLotto: (n) => `Delega ${n}`, orarioLotto });
  assert.deepEqual(r.panoramica.groups.map((g) => [g.label, g.ora]), [['Delega 1', '09:00'], ['Delega 2', '09:06']]);
  // AL CONTRARIO: agenti senza orario di nascita fanno un lotto senza ora, e l’orario non viene nemmeno chiesto
  let chiesto = 0;
  const senza = runDalleDeleghe({ corrente: madre, figli: [{ sessionId: 'x', padreId: 'madre', conclusa: false }] }, { orarioLotto: () => { chiesto += 1; return 'mai'; } });
  assert.deepEqual(senza.panoramica.groups.map((g) => g.ora), [null]);
  assert.equal(chiesto, 0);
  assert.deepEqual(runDalleDeleghe({ corrente: madre, figli: [figlia('a', 10)] }).panoramica.groups.map((g) => g.ora), [null], 'senza orarioLotto, nessuna ora');
});

test('DELEGHE-RUN-05 — attraverso la SORGENTE vera del diagramma: panoramica, righe, archi, storia e la riproduzione a un istante', async () => {
  let fatti = { corrente: madre, figli: [finita('a', 10, 70), finita('b', 12, 90, { esitoDelega: 'fallito' }), figlia('c', 400), figlia('d', 401, { approvalPendingCount: 1 })] };
  const client = creaClientDeleghe({ leggi: async () => fatti, opzioni: { etichettaLotto: (n, l) => `Delega ${n} · ${l.agenti}` } });
  const sorgente = await client.sorgente();
  assert.equal(sorgente.tipo, 'run');
  const fonte = creaFonte({ client, sorgente });
  const pan = await fonte.caricaPanoramica();
  assert.deepEqual(pan.groups.map((g) => g.label), ['Delega 1 · 2', 'Delega 2 · 2']);
  assert.deepEqual((await fonte.righeFase('lotto-1')).map((x) => [x.label, x.state]), [['Compito a', 'succeeded'], ['Compito b', 'failed']]);
  assert.equal((await fonte.archiPer(['lotto-1', 'lotto-2'])).length, 0, 'figli della stessa conversazione: nessun arco di passo fra loro');
  assert.equal(await fonte.aggiornaStoria(), true);
  const idA = fonte.righeCaricate().find((x) => x.sessionId === 'a').nodeId;
  const idB = fonte.righeCaricate().find((x) => x.sessionId === 'b').nodeId;
  assert.deepEqual([fonte.statoDi(idA, T0 + 30_000), fonte.statoDi(idB, T0 + 30_000)], ['running', 'running']);
  assert.deepEqual([fonte.statoDi(idA, T0 + 80_000), fonte.statoDi(idB, T0 + 80_000)], ['succeeded', 'running']);
  assert.equal(fonte.statoDi(idB, T0 + 95_000), 'failed');
  assert.equal(fonte.conteggi('lotto-2').counts.waiting_human, 1);
  assert.equal(client.sessioneDelNodo(idB), 'b', 'dal passo alla sua sessione: il pannello Agenti segue la selezione');
  assert.equal(await client.nodoDellaSessione('b'), idB);
  assert.equal(client.conversazione().sessionId, 'madre');
  const prima = pan.graphVersion;
  fatti = { ...fatti, figli: [...fatti.figli, figlia('e', 402)] };
  assert.notEqual((await client.panoramica()).data.graphVersion, prima, 'un agente in più cambia la struttura: il diagramma rilegge');
  assert.equal(await creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [] }) }).sorgente(), null, 'senza agenti, niente diagramma delle deleghe');
});

test('DELEGHE-RUN-06 — le pagine hanno la forma delle rotte: 120 agenti in un lotto, a pagine da 50, senza buchi né doppioni', async () => {
  const figli = Array.from({ length: 120 }, (_, i) => figlia(`f${String(i).padStart(3, '0')}`, 10 + (i % 5)));
  const client = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli }) });
  await client.panoramica();
  const visti = [];
  for (let offset = 0; offset !== null;) { const p = await client.gruppo(null, 'lotto-1', { offset, limit: 50 }); visti.push(...p.items.map((x) => x.sessionId)); assert.equal(p.total, 120); offset = p.nextOffset; }
  assert.equal(visti.length, 120);
  assert.equal(new Set(visti).size, 120);
});

test('DELEGHE-RUN-07 — la conversazione in cima: il suo stato, la sua richiesta come compito; e i conti sono degli agenti', () => {
  const r = runDalleDeleghe({ corrente: { ...madre, conclusa: true, conclusaAlle: at(900), consegna: 'Sistema il parser delle date.' }, figli: [finita('a', 10, 70), figlia('b', 12)] });
  assert.equal(r.panoramica.total, 2);
  assert.deepEqual(r.panoramica.delegated, { total: 2, terminated: 1 });
  assert.equal(r.conversazione.taskPreview, 'Sistema il parser delle date.');
  assert.equal(r.panoramica.status, 'running', 'conclusa la conversazione, ma un suo agente lavora ancora');
  assert.equal(r.tutte.find((x) => x.sessionId === 'a').taskPreview, null, 'di un agente senza compito dichiarato non se ne inventa uno');
  assert.equal(runDalleDeleghe({ corrente: { ...madre, conclusa: true, conclusaAlle: at(900) }, figli: [finita('a', 10, 70)] }).panoramica.status, 'succeeded');
  assert.equal(runDalleDeleghe({ corrente: { ...madre, conclusa: true, esitoDelega: 'fallito' }, figli: [finita('a', 10, 70)] }).panoramica.status, 'failed');
});

test('DELEGHE-RUN-08 — un ventaglio (un agente, molti sotto-agenti nel lotto accanto) corre in UNA corsia; due agenti, due corsie', async () => {
  const ELK = createRequire(import.meta.url)('elkjs/lib/elk.bundled.js');
  const r = runDalleDeleghe({ corrente: madre, sessioni: [
    ...['n1', 'n2', 'n3'].map((id, i) => ({ sessionId: id, padreId: 'a', avviataAlle: at(200 + i), conclusa: false })),
    ...['m1', 'm2'].map((id, i) => ({ sessionId: id, padreId: 'b', avviataAlle: at(200 + i), conclusa: false })),
  ], figli: ['a', 'b', 'c'].map((id, i) => figlia(id, 10 + i)) });
  const esito = await disponi(new ELK(), { panoramica: r.panoramica, righeFase: r.righe, archi: r.archi }, new Set(r.panoramica.groups.map((g) => g.phaseId)));
  const fraFasi = esito.archi.filter((x) => x.ventaglio);
  assert.equal(fraFasi.length, 5, 'tre nipoti di «a», due di «b»');
  const perVentaglio = new Map();
  for (const x of fraFasi) { if (!perVentaglio.has(x.ventaglio)) perVentaglio.set(x.ventaglio, new Set()); perVentaglio.get(x.ventaglio).add(x.punti[1][0]); }
  assert.equal(perVentaglio.size, 2);
  for (const [ventaglio, corsie] of perVentaglio) assert.equal(corsie.size, 1, `${ventaglio}: una corsia sola, non un fascio`);
  assert.equal(new Set(fraFasi.map((x) => x.punti.at(-1).join(','))).size, 5, 'ogni arco arriva comunque al SUO agente');
});

test('DELEGHE-RUN-09 — la conversazione com’è nella riga vera di GET /sessions: il nome è la sua richiesta, l’ultima risposta la sua fine', () => {
  const riga = { sessionId: 'madre', nome: 'Delega CINQUE sotto-compiti in sola lettura', avviataAlle: at(0), ultimaRispostaAlle: at(260), conclusa: true, ultimoEsito: 'successo', motivoChiusura: 'fine-lavoro' };
  const r = runDalleDeleghe({ corrente: riga, figli: [finita('a', 10, 70)] });
  assert.deepEqual([r.conversazione.state, r.conversazione.finishedAt, r.conversazione.durationMs, r.conversazione.taskPreview, r.conversazione.label],
    ['succeeded', at(260), 260_000, riga.nome, riga.nome]);
  assert.equal(runDalleDeleghe({ corrente: { ...riga, conclusa: false }, figli: [figlia('a', 10)] }).conversazione.finishedAt, null);
  assert.equal(runDalleDeleghe({ corrente: riga, figli: [figlia('a', 10, { conclusa: true, esitoDelega: 'concluso', ultimaRispostaAlle: at(50) })] }).tutte[0].finishedAt, null,
    'una FIGLIA non prende mai l’ultima risposta come fine');
});

test('DELEGHE-RUN-10 — figli senza orario di nascita: un lotto solo per padre, non uno a testa; e non si mescolano a quelli con l’orario', () => {
  const senza = Array.from({ length: 199 }, (_, i) => ({ sessionId: `s${String(i).padStart(3, '0')}`, padreId: 'madre', taskCorto: `Agente ${i + 1}`, conclusa: true }));
  const r = runDalleDeleghe({ corrente: madre, figli: senza });
  assert.deepEqual(r.panoramica.groups.map((g) => g.total), [199]);
  assert.deepEqual(r.panoramica.delegated, { total: 199, terminated: 199 });
  assert.equal(r.storia.filter((v) => v.scope === 'node').length, 0, 'senza orari non si inventa una storia');
  const misti = runDalleDeleghe({ corrente: madre, figli: [figlia('a', 10), figlia('b', 11), ...senza.slice(0, 3)] });
  assert.deepEqual(misti.panoramica.groups.map((g) => g.total), [2, 3], 'chi ha l’orario da una parte, chi non ce l’ha dall’altra');
});

/*
 * Owner 12/10/2026 sera: «le deleghe si accodano a quella passata… bisogna differenziare le deleghe passate dalle deleghe nuove».
 * Decisione: «Una richiesta alla volta» — di serie l'ultima richiesta che ha delegato, le passate dal selettore, e «Tutte».
 */
const RICHIESTE = [{ id: 'r1', at: T0, testo: 'Sistema i listini' }, { id: 'r2', at: T0 + 300_000, testo: 'Ora aggiungi le prove' }, { id: 'r3', at: T0 + 900_000, testo: 'Grazie' }];
const dueRichieste = () => ({ corrente: madre, sessioni: [{ sessionId: 'n1', padreId: 'b', avviataAlle: at(500), conclusa: true, conclusaAlle: at(520), esitoDelega: 'concluso' }],
  figli: [finita('a', 10, 70), finita('b', 12, 90), figlia('c', 320), figlia('d', 321), figlia('e', 400)] });

test('DELEGHE-RUN-12 — una richiesta alla volta: di serie l’ULTIMA che ha delegato, coi suoi lotti numerati da 1 e i suoi conti', () => {
  const r = runDalleDeleghe(dueRichieste(), { richieste: RICHIESTE });
  assert.equal(r.panoramica.richiesta, 'r2', 'r3 è l’ultima richiesta ma non ha delegato: si mostra l’ultima CON deleghe');
  assert.equal(r.panoramica.ultimaRichiesta, 'r3');
  assert.deepEqual(r.tutte.map((x) => x.sessionId), ['c', 'd', 'e']);
  assert.deepEqual(r.panoramica.groups.map((g) => [g.phaseId, g.total]), [['lotto-1', 2], ['lotto-2', 1]], 'i lotti ripartono da 1 dentro la richiesta');
  assert.deepEqual([r.panoramica.total, r.panoramica.terminated], [3, 0], 'i conti parlano di questa richiesta, non di quella passata');
  assert.deepEqual(r.panoramica.richieste.map((x) => [x.id, x.testo, x.total, x.terminated]), [['r1', 'Sistema i listini', 3, 3], ['r2', 'Ora aggiungi le prove', 3, 0]]);
  assert.equal(r.panoramica.agentiInTutto, 6);
  assert.equal(r.nodoDi.has('a'), false, 'un agente della richiesta passata non è nel diagramma di questa');
});

test('DELEGHE-RUN-13 — la richiesta passata si può guardare (i nipoti seguono il loro agente, non l’orologio), e «tutte» le mette insieme', () => {
  const passata = runDalleDeleghe(dueRichieste(), { richieste: RICHIESTE, richiesta: 'r1' });
  // n1 è nato a 500 s, dopo la seconda richiesta (300 s): ma l'ha avviato b, che è della prima
  assert.deepEqual(passata.tutte.map((x) => x.sessionId).sort(), ['a', 'b', 'n1']);
  assert.equal(passata.panoramica.richiesta, 'r1');
  const tutte = runDalleDeleghe(dueRichieste(), { richieste: RICHIESTE, richiesta: 'tutte' });
  assert.equal(tutte.tutte.length, 6);
  assert.equal(tutte.panoramica.richiesta, 'tutte');
  // AL CONTRARIO: un id che non esiste (o di una richiesta senza deleghe) torna a quella di serie; senza richieste note non si divide
  assert.equal(runDalleDeleghe(dueRichieste(), { richieste: RICHIESTE, richiesta: 'r3' }).panoramica.richiesta, 'r2');
  assert.equal(runDalleDeleghe(dueRichieste(), { richieste: RICHIESTE, richiesta: 'inventata' }).panoramica.richiesta, 'r2');
  const senza = runDalleDeleghe(dueRichieste());
  assert.deepEqual([senza.tutte.length, senza.panoramica.richiesta, senza.panoramica.richieste], [6, null, []]);
});

test('DELEGHE-RUN-14 — agenti senza orario, o nati prima della prima richiesta nota, stanno con la PRIMA richiesta: nessuno sparisce', () => {
  const fatti = { corrente: madre, figli: [{ sessionId: 'x', padreId: 'madre', conclusa: true, esitoDelega: 'concluso' }, figlia('presto', -50), figlia('c', 320)] };
  const r = runDalleDeleghe(fatti, { richieste: RICHIESTE, richiesta: 'tutte' });
  assert.equal(r.tutte.length, 3);
  assert.deepEqual(r.panoramica.richieste.map((x) => [x.id, x.total]), [['r1', 2], ['r2', 1]]);
  assert.equal(r.panoramica.richieste.reduce((n, x) => n + x.total, 0), r.panoramica.agentiInTutto, 'la somma delle richieste è il totale: nessun agente fuori da ogni richiesta');
});

test('DELEGHE-RUN-15 — il client ricorda la richiesta scelta e rilegge; le richieste arrivano coi fatti (cambiano a ogni messaggio)', async () => {
  const fatti = { ...dueRichieste(), richieste: RICHIESTE };
  const client = creaClientDeleghe({ leggi: async () => fatti });
  assert.equal((await client.panoramica()).data.richiesta, 'r2');
  client.scegliRichiesta('r1');
  const pan = (await client.panoramica()).data;
  assert.deepEqual([pan.richiesta, pan.total, pan.terminated], ['r1', 3, 3]);
  assert.equal(await client.nodoDellaSessione('c'), null, 'l’agente dell’altra richiesta non è in questa');
  client.scegliRichiesta('tutte');
  assert.equal((await client.panoramica()).data.total, 6);
  client.scegliRichiesta(null);
  assert.equal((await client.panoramica()).data.richiesta, 'r2');
});

test('DELEGHE-RUN-16 — parità 7: una conversazione FERMATA o fallita non diventa «riuscita» in cima al diagramma, anche con agenti finiti bene', () => {
  const fermata = runDalleDeleghe({ corrente: { ...madre, conclusa: true, interrotta: true }, figli: [finita('a', 10, 70)] });
  assert.equal(fermata.panoramica.status, 'cancelled');
  assert.equal(fermata.panoramica.conversazione.state, 'cancelled');
  const fermataDalServer = runDalleDeleghe({ corrente: { ...madre, conclusa: true, motivoChiusura: 'fermata' }, figli: [finita('a', 10, 70)] });
  assert.equal(fermataDalServer.panoramica.status, 'cancelled');
  /* un ERRORE della conversazione arriva in `ultimoEsito` (non in `esitoDelega`): era letto «riuscita» (13/10/2026) */
  assert.equal(runDalleDeleghe({ corrente: { ...madre, conclusa: true, ultimoEsito: 'errore' }, figli: [finita('a', 10, 70)] }).panoramica.status, 'failed');
  assert.equal(statoDelPasso({ conclusa: true, ultimoEsito: 'successo', esitoDelega: 'fallito' }), 'failed', 'un ultimo esito buono non copre una delega fallita');
  assert.equal(statoDelPasso({ conclusa: true, ultimoEsito: 'successo', esitoDelega: 'concluso' }), 'succeeded');
  /* al contrario: finita bene resta riuscita */
  assert.equal(runDalleDeleghe({ corrente: { ...madre, conclusa: true }, figli: [finita('a', 10, 70)] }).panoramica.status, 'succeeded');
});

/* Owner 13/10/2026 (mockup approvato; «Spariscono»): filtro per stato, «isola un ramo» e ambito «cartella» nel diagramma nuovo. */
const scena17 = () => [
  finita('a', 10, 70), figlia('b', 11), // lotto 1: una finita, una al lavoro
  finita('c', 400, 460, { esitoDelega: 'fallito' }), figlia('d', 401, { inAttesaApprovazione: true }), // lotto 2: fallita, in attesa
  figlia('e', 12, { padreId: 'b' }), figlia('f', 13, { padreId: 'e' }), // nipoti di b
];

test('DELEGHE-RUN-17 — filtro per stato: fuori dal filtro gli agenti SPARISCONO, i conti del menu restano quelli di prima, e i lotti tengono il loro numero', () => {
  const tutto = runDalleDeleghe({ corrente: madre, figli: scena17() });
  assert.deepEqual(tutto.panoramica.filtro.conti, { all: 6, working: 3, waiting: 1, failed: 1, finished: 1 });
  assert.equal(tutto.panoramica.filtro.mostrati, 6);
  assert.equal(tutto.panoramica.filtro.inTutto, 6);
  const numeroDelFallito = tutto.tutte.find((r) => r.sessionId === 'c').phaseId;

  const falliti = runDalleDeleghe({ corrente: madre, figli: scena17() }, { stato: 'failed' });
  assert.deepEqual(falliti.tutte.map((r) => r.sessionId), ['c']);
  assert.deepEqual(falliti.panoramica.filtro.conti, tutto.panoramica.filtro.conti, 'le voci del menu non cambiano col filtro');
  assert.equal(falliti.panoramica.filtro.mostrati, 1);
  assert.equal(falliti.panoramica.filtro.inTutto, 6);
  assert.equal(falliti.panoramica.groups.length, 1, 'i lotti vuoti non restano come scatole vuote');
  assert.equal(falliti.tutte[0].phaseId, numeroDelFallito, 'il lotto tiene il suo numero anche se quelli prima sono spariti');
  assert.equal(falliti.panoramica.groups[0].label, tutto.panoramica.groups.find((g) => g.phaseId === numeroDelFallito).label);

  assert.deepEqual(runDalleDeleghe({ corrente: madre, figli: scena17() }, { stato: 'waiting' }).tutte.map((r) => r.sessionId), ['d']);
  assert.deepEqual(runDalleDeleghe({ corrente: madre, figli: scena17() }, { stato: 'finished' }).tutte.map((r) => r.sessionId), ['a']);
  /* al contrario: uno stato che non esiste non filtra niente (non svuota il diagramma) */
  assert.equal(runDalleDeleghe({ corrente: madre, figli: scena17() }, { stato: 'inventato' }).tutte.length, 6);
  assert.equal(runDalleDeleghe({ corrente: madre, figli: scena17() }, { stato: 'inventato' }).panoramica.filtro.stato, 'all');
});

test('DELEGHE-RUN-18 — isola un ramo: l’agente scelto e TUTTI quelli che ha avviato, nient’altro; un id sconosciuto non isola niente', () => {
  const ramo = runDalleDeleghe({ corrente: madre, figli: scena17() }, { isolato: 'b' });
  assert.deepEqual(ramo.tutte.map((r) => r.sessionId).sort(), ['b', 'e', 'f']);
  assert.equal(ramo.panoramica.filtro.isolato, 'b');
  assert.equal(ramo.panoramica.filtro.isolatoNome, 'Compito b');
  assert.equal(ramo.panoramica.filtro.mostrati, 3);
  assert.equal(ramo.panoramica.filtro.inTutto, 6);
  /* le frecce dentro il ramo restano: b → e → f */
  const nodo = (id) => ramo.tutte.find((r) => r.sessionId === id).nodeId;
  assert.ok(ramo.archi.some((a) => a.fromNodeId === nodo('b') && a.toNodeId === nodo('e')));
  assert.ok(ramo.archi.some((a) => a.fromNodeId === nodo('e') && a.toNodeId === nodo('f')));
  /* isolato + stato insieme */
  assert.deepEqual(runDalleDeleghe({ corrente: madre, figli: scena17() }, { isolato: 'b', stato: 'finished' }).tutte, []);
  /* al contrario */
  const niente = runDalleDeleghe({ corrente: madre, figli: scena17() }, { isolato: 'non-esiste' });
  assert.equal(niente.tutte.length, 6);
  assert.equal(niente.panoramica.filtro.isolato, null);
});

test('DELEGHE-RUN-19 — ambito «cartella»: le altre conversazioni della stessa cartella in un gruppo loro, senza frecce; di serie no', () => {
  const corrente = { ...madre, cartella: 'C:/progetti/listini' };
  const sessioni = [
    { sessionId: 'altra-1', cartella: 'C:/progetti/listini', avviataAlle: at(5), conclusa: true, taskCorto: 'Altra conversazione' },
    { sessionId: 'altra-2', cartella: 'C:/progetti/listini', avviataAlle: at(6), conclusa: false, taskCorto: 'Seconda conversazione' },
    { sessionId: 'altrove', cartella: 'C:/progetti/altro', avviataAlle: at(7), conclusa: false, taskCorto: 'Un altro progetto' },
  ];
  const diSerie = runDalleDeleghe({ corrente, sessioni, figli: [figlia('a', 10)] });
  assert.deepEqual(diSerie.tutte.map((r) => r.sessionId), ['a']);
  assert.equal(diSerie.panoramica.filtro.ambito, 'sessione');
  assert.equal(diSerie.panoramica.filtro.cartellaNota, true);

  const cartella = runDalleDeleghe({ corrente, sessioni, figli: [figlia('a', 10)] }, { ambito: 'cartella', etichettaCartella: 'Same folder' });
  assert.deepEqual(cartella.tutte.map((r) => r.sessionId), ['a', 'altra-1', 'altra-2']);
  const gruppo = cartella.panoramica.groups.at(-1);
  assert.equal(gruppo.phaseId, 'cartella');
  assert.equal(gruppo.label, 'Same folder');
  assert.deepEqual(cartella.panoramica.delegated, { total: 1, terminated: 0 }, 'le altre conversazioni non sono agenti delegati: non entrano nel conto');
  assert.deepEqual(cartella.panoramica.folder, { total: 2 });
  assert.deepEqual(diSerie.panoramica.folder, { total: 0 });
  assert.equal(gruppo.daConversazione, false, 'non le ha avviate questa conversazione: nessuna freccia dalla cima');
  const nodiCartella = new Set(cartella.tutte.filter((r) => r.phaseId === 'cartella').map((r) => r.nodeId));
  assert.equal(cartella.archi.some((a) => nodiCartella.has(a.fromNodeId) || nodiCartella.has(a.toNodeId)), false);
  assert.equal(cartella.panoramica.groups[0].label, diSerie.panoramica.groups[0].label, 'il lotto della conversazione resta com’era');
  /* al contrario: senza una cartella nota l'ambito non aggiunge niente, e lo dice */
  const senza = runDalleDeleghe({ corrente: madre, sessioni, figli: [figlia('a', 10)] }, { ambito: 'cartella' });
  assert.deepEqual(senza.tutte.map((r) => r.sessionId), ['a']);
  assert.equal(senza.panoramica.filtro.ambito, 'sessione');
  assert.equal(senza.panoramica.filtro.cartellaNota, false);
});

test('DELEGHE-RUN-20 — il client ricorda stato, ramo e ambito, e «mostra tutti» toglie stato e ramo ma non l’ambito', async () => {
  const corrente = { ...madre, cartella: 'C:/progetti/listini' };
  const sessioni = [{ sessionId: 'altra-1', cartella: 'C:/progetti/listini', avviataAlle: at(5), conclusa: true, taskCorto: 'Altra' }];
  const client = creaClientDeleghe({ leggi: async () => ({ corrente, sessioni, figli: scena17() }) });
  assert.equal((await client.panoramica()).data.total, 6);
  client.scegliStato('failed');
  assert.equal((await client.panoramica()).data.total, 1);
  client.isola('b'); client.scegliStato('all');
  assert.equal((await client.panoramica()).data.total, 3);
  assert.equal(client.filtro().isolato, 'b');
  client.scegliAmbito('cartella'); client.mostraTutti();
  const p = (await client.panoramica()).data;
  assert.equal(p.total, 7);
  assert.equal(p.filtro.ambito, 'cartella');
  assert.equal(p.filtro.isolato, null);
});

test('DELEGHE-RUN-21 — i file toccati arrivano alla riga dell’agente coi loro fatti; senza il fatto è null, non un elenco vuoto', () => {
  const con = figlia('a', 10, { attivita: { file: [{ percorso: 'src/csv.js', letto: true, scritto: true, creato: false }, { percorso: 'test/csv.test.js', letto: false, scritto: true, creato: true }, { percorso: '', letto: true }, { letto: true }, { percorso: 'NOTE.md', letto: true, scritto: false, creato: false }], fileTagliati: 3 } });
  const r = runDalleDeleghe({ corrente: madre, figli: [con, figlia('b', 11)] });
  const a = r.tutte.find((x) => x.sessionId === 'a'); const b = r.tutte.find((x) => x.sessionId === 'b');
  assert.deepEqual(a.files, [{ path: 'src/csv.js', read: true, written: true, created: false }, { path: 'test/csv.test.js', read: false, written: true, created: true }, { path: 'NOTE.md', read: true, written: false, created: false }], 'le voci senza percorso non entrano');
  assert.equal(a.filesCut, 3);
  assert.equal(b.files, null);
  assert.equal(b.filesCut, 0);
});

/* Owner 13/10/2026 («Collega la storia salvata»): la riproduzione legge la cronologia osservata del registro. */
const registrato = (seq, secondi, node, event = 'updated') => ({ tipo: 'grafo-agenti', schema: 'talos.agent-timeline.v1', rootId: 'madre', seq, at: at(secondi), coverage: 'complete', event, node });
const pagine = (record, { coverage = 'complete' } = {}) => async ({ after = 0, through = record.length, limit = 250 }) => {
  const items = record.filter((x) => x.seq > after && x.seq <= through).slice(0, Math.min(limit, 2));
  return { schema: 'talos.agent-timeline.v1', rootId: 'madre', coverage, persisted: true, through, next: items.at(-1)?.seq < through ? items.at(-1).seq : null, items };
};

test('DELEGHE-RUN-22 — la storia rigiocata viene dalla cronologia OSSERVATA: gli stati com’erano, uno stato ripetuto non fa una voce, chi non è nel diagramma si salta', async () => {
  const a = figlia('a', 10); const b = figlia('b', 11);
  const record = [
    registrato(1, 0, { ...madre }, 'created'),
    registrato(2, 10, { ...a }, 'created'),
    registrato(3, 11, { ...b }, 'created'),
    registrato(4, 20, { ...a, attivita: { chiamate: 3 } }), // stesso stato: nessuna voce nuova
    registrato(5, 30, { ...a, inAttesaApprovazione: true }),
    registrato(6, 40, { ...a, inAttesaApprovazione: false }),
    registrato(7, 50, { ...a, conclusa: true, conclusaAlle: at(50), esitoDelega: 'fallito' }),
    registrato(8, 55, { sessionId: 'sconosciuto', padreId: 'madre', conclusa: false, avviataAlle: at(55) }),
    registrato(9, 60, { ...madre, conclusa: true, ultimoEsito: 'successo' }),
  ];
  const client = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [finita('a', 10, 50, { esitoDelega: 'fallito' }), b] }), leggiCronologia: pagine(record) });
  await client.panoramica();
  const storia = await client.storia();
  const nodo = async (id) => client.nodoDellaSessione(id);
  assert.deepEqual(storia.items.map((v) => [v.scope, v.scope === 'node' ? v.nodeId : null, v.state, v.at]), [
    ['run', null, 'running', at(0)],
    ['node', await nodo('a'), 'running', at(10)],
    ['node', await nodo('b'), 'running', at(11)],
    ['node', await nodo('a'), 'waiting_human', at(30)],
    ['node', await nodo('a'), 'running', at(40)],
    ['node', await nodo('a'), 'failed', at(50)],
    // alle :60 il giro della conversazione è finito, ma «b» lavora ancora: il run resta in corso (la regola del vivo)
  ]);
  assert.deepEqual(storia.items.map((v) => v.seq), [1, 2, 3, 4, 5, 6]);
  assert.equal(client.fonteDellaStoria(), 'registro');
  assert.equal(client.erroreCronologia(), null);
  /* la storia cresce soltanto: chi ne ha già letta una parte chiede il resto */
  record.push(registrato(10, 70, { ...b, conclusa: true, conclusaAlle: at(70), esitoDelega: 'concluso' }));
  const resto = await client.storia(null, { offset: 6 });
  assert.deepEqual(resto.items.map((v) => [v.seq, v.scope, v.state]), [[7, 'node', 'succeeded'], [8, 'run', 'succeeded']], 'finito anche «b», il run è riuscito');
  /* un errore o uno stop della conversazione restano tali anche con agenti ancora al lavoro */
  const fermata = storiaDallaCronologia([registrato(1, 0, { ...madre }), registrato(2, 10, figlia('a', 10)), registrato(3, 20, { ...madre, conclusa: true, interrotta: true })],
    { radice: 'madre', nodoDi: new Map([['a', 'lotto-1-0000']]), faseDi: new Map([['lotto-1-0000', 'lotto-1']]) });
  assert.deepEqual(fermata.filter((v) => v.scope === 'run').map((v) => v.state), ['running', 'cancelled']);
});

test('DELEGHE-RUN-23 — una lettura fallita della cronologia si DICE (e si può riprovare); senza registro, o con copertura assente, si rigioca dai fatti e lo si dichiara', async () => {
  let rotto = true;
  const record = [registrato(1, 0, { ...madre }, 'created'), registrato(2, 10, { ...figlia('a', 10) }, 'created')];
  const buona = pagine(record);
  const client = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [figlia('a', 10)] }), leggiCronologia: async (q) => { if (rotto) throw new Error('Cronologia temporaneamente non disponibile'); return buona(q); } });
  await client.panoramica();
  await assert.rejects(client.storia(), /temporaneamente non disponibile/u);
  assert.equal(client.erroreCronologia(), 'Cronologia temporaneamente non disponibile');
  rotto = false;
  assert.equal((await client.storia()).items.length, 2);
  assert.equal(client.erroreCronologia(), null);
  /* una pagina malformata è un errore, non una storia vuota */
  const storta = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [figlia('a', 10)] }), leggiCronologia: async () => ({ schema: 'altro', through: 0, items: [] }) });
  await storta.panoramica();
  await assert.rejects(storta.storia(), /HISTORY_INVALID/u);
  /* al contrario: senza registro la storia è quella dei fatti, come prima, e lo dice */
  const senza = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [finita('a', 10, 70)] }) });
  await senza.panoramica();
  assert.equal(senza.fonteDellaStoria(), 'fatti');
  assert.deepEqual((await senza.storia()).items.map((v) => v.state), ['running', 'running', 'succeeded']);
  const assente = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [finita('a', 10, 70)] }), leggiCronologia: pagine([], { coverage: 'unavailable' }) });
  await assente.panoramica();
  assert.deepEqual((await assente.storia()).items.map((v) => v.state), ['running', 'running', 'succeeded']);
  assert.equal(assente.fonteDellaStoria(), 'fatti');
});

test('DELEGHE-RUN-NOME-01 — il nome di un agente è un NOME: spazi e a capo ridotti a uno, al più 160 caratteri coi puntini; un nome corto resta com’è', () => {
  assert.equal(nomeBreve('Correggi i prezzi'), 'Correggi i prezzi');
  assert.equal(nomeBreve('  Correggi\n\n  i   prezzi \t'), 'Correggi i prezzi');
  assert.equal(nomeBreve(''), ''); assert.equal(nomeBreve(null), ''); assert.equal(nomeBreve(42), '');
  const esatto = 'x'.repeat(NOME_MASSIMO);
  assert.equal(nomeBreve(esatto), esatto, 'esattamente al tetto: intero, senza puntini');
  const lungo = nomeBreve('Trova perché i prezzi scontati escono sbagliati.\n' + 'Riga di consegna. '.repeat(500));
  assert.equal(lungo.length <= NOME_MASSIMO, true);
  assert.equal(lungo.endsWith('…'), true);
  assert.equal(/\s…$/u.test(lungo), false, 'niente spazio prima dei puntini');
  assert.equal(lungo.includes('\n'), false);
  assert.equal(lungo.startsWith('Trova perché i prezzi scontati escono sbagliati. Riga di consegna.'), true);
  // mai a metà di una coppia surrogata (un'emoji sul confine): l'ultima unità prima dei puntini non è una metà alta rimasta sola
  const conEmoji = nomeBreve('a'.repeat(NOME_MASSIMO - 2) + '😀😀😀');
  const ultima = conEmoji.charCodeAt(conEmoji.length - 2);
  assert.equal(ultima >= 0xD800 && ultima <= 0xDBFF, false);
  assert.equal(conEmoji.length <= NOME_MASSIMO, true);
  assert.equal(conEmoji.endsWith('…'), true);
  // un testo fatto quasi solo di spazi, più lungo della finestra guardata: tagliato lo stesso, coi puntini
  assert.equal(nomeBreve('ciao' + ' '.repeat(NOME_MASSIMO * 5) + 'fine'), 'ciao…');
  assert.equal(nomeBreve('Leggi il CSV e di’ che cosa si rompe', 20), 'Leggi il CSV e di’…');
});

test('DELEGHE-RUN-NOME-02 — con una consegna di migliaia di caratteri (misurato sui dati veri: da 537 a 7.550) la riga porta il nome breve, il testo intero resta nel compito, e i nomi dentro le frasi sono più corti ancora', () => {
  const consegna = 'Sei un agente. Leggi src/csv.js e di’ esattamente che cosa si rompe con la virgola decimale.\n\n' + 'Vincolo numero N: non toccare altro. '.repeat(200);
  const r = runDalleDeleghe({ corrente: madre, figli: [figlia('a', 10, { taskCorto: consegna }), figlia('n', 40, { padreId: 'a', taskCorto: 'Conta le righe' }), figlia('b', 12, { taskCorto: 'Breve' })] },
    { isolato: 'a', etichettaLotto: (n, lotto) => (lotto.da === 'madre' ? `Lotto ${n}` : `Deleghe di ${lotto.padre?.taskCorto}`) });
  const a = r.tutte.find((x) => x.sessionId === 'a');
  assert.equal(a.label.length <= NOME_MASSIMO, true);
  assert.equal(a.label.endsWith('…'), true);
  assert.equal(a.label.includes('\n'), false);
  assert.equal(a.taskPreview, consegna, 'il testo intero resta nel compito: si legge nel dettaglio e la ricerca lo guarda');
  // dentro una frase: «solo «…» e gli agenti che ha avviato», e il titolo del lotto di un sotto-agente
  assert.equal(r.panoramica.filtro.isolatoNome.length <= NOME_IN_UNA_FRASE, true);
  assert.equal(r.panoramica.filtro.isolatoNome.endsWith('…'), true);
  const lottoDiA = r.panoramica.groups.find((g) => !g.daConversazione);
  assert.equal(lottoDiA.label.length <= 'Deleghe di '.length + NOME_IN_UNA_FRASE, true, lottoDiA.label);
  // AL CONTRARIO: un nome corto non cambia e non riempie il compito con una copia di sé
  const tutti = runDalleDeleghe({ corrente: madre, figli: [figlia('b', 12, { taskCorto: 'Breve' })] });
  assert.equal(tutti.tutte[0].label, 'Breve');
  assert.equal(tutti.tutte[0].taskPreview, null);
});

test('DELEGHE-RUN-COPERTURA — owner 13/10/2026 (D9): una storia del registro A BUCHI si dichiara, con l’ora da cui comincia; e una volta detta resta detta', async () => {
  const record = [registrato(1, 30, { ...madre }, 'created'), registrato(2, 40, { ...figlia('a', 10) }, 'created'), registrato(3, 90, { ...finita('a', 10, 90) })];
  let coverage = 'partial';
  const client = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [finita('a', 10, 90)] }), leggiCronologia: (q) => pagine(record, { coverage })(q) });
  await client.panoramica();
  assert.deepEqual(client.coperturaDellaStoria(), { parziale: false, da: null }, 'prima di leggere non si dichiara niente');
  await client.storia();
  assert.equal(client.fonteDellaStoria(), 'registro');
  assert.deepEqual(client.coperturaDellaStoria(), { parziale: true, da: at(30) });
  // il registro torna a dire «completa» per le pagine nuove: i record già letti hanno ancora il loro buco
  coverage = 'complete';
  await client.storia();
  assert.equal(client.coperturaDellaStoria().parziale, true);
  // AL CONTRARIO: una storia completa non dichiara buchi; e senza registro (si rigioca dai fatti) nemmeno
  const intera = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [finita('a', 10, 90)] }), leggiCronologia: pagine(record) });
  await intera.panoramica(); await intera.storia();
  assert.deepEqual(intera.coperturaDellaStoria(), { parziale: false, da: at(30) });
  const assente = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [finita('a', 10, 90)] }), leggiCronologia: pagine([], { coverage: 'unavailable' }) });
  await assente.panoramica(); await assente.storia();
  assert.deepEqual(assente.coperturaDellaStoria(), { parziale: false, da: null });
  // un registro a buchi e SENZA record non ha una storia sua: si rigioca dai FATTI (e non si dichiara una storia del registro incompleta)
  const vuota = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [finita('a', 10, 90)] }), leggiCronologia: pagine([], { coverage: 'partial' }) });
  await vuota.panoramica(); await vuota.storia();
  assert.equal(vuota.fonteDellaStoria(), 'fatti');
  assert.deepEqual(vuota.coperturaDellaStoria(), { parziale: false, da: null });
  assert.deepEqual((await vuota.storia()).items.map((v) => v.state), ['running', 'running', 'succeeded'], 'la storia dei fatti: nascita e fine');
});

/* 13/10/2026 sera: gli id dei nodi seguono la SESSIONE (cura di SECONDA-POSIZIONE-03). Prima erano posizionali, e la premessa di
   queste due prove era «b ha preso l'id di a»: ora è il contrario, e lo si afferma. */
test('DELEGHE-RUN-STORIA-STRUTTURA — cambiato che cosa si guarda (un ramo isolato) ogni agente TIENE il suo id di nodo, la storia si rilegge da capo e ognuno ha i SUOI tentativi', async () => {
  const fatti = { corrente: madre, figli: [finita('a', 60, 420), finita('b', 70, 200), finita('n', 100, 150, { padreId: 'b' })] };
  const client = creaClientDeleghe({ leggi: async () => fatti });
  const fonte = creaFonte({ client, sorgente: await client.sorgente() });
  await fonte.caricaPanoramica();
  assert.equal(await fonte.aggiornaStoria(), true);
  const nodo = (s) => client.nodoDellaSessione(s);
  const campata = (id) => { const t = fonte.tentativi().get(id)?.at(-1); return t ? [t.da - T0, t.a === null ? null : t.a - T0] : null; };
  const idA = await nodo('a'); const idB = await nodo('b');
  assert.deepEqual(campata(idA), [60_000, 420_000]);
  assert.deepEqual(campata(idB), [70_000, 200_000]);
  // si isola il ramo di «b»: ora «b» sta al POSTO che aveva «a», ma il suo id resta il suo
  client.isola('b');
  await fonte.caricaPanoramica();
  const nuovoB = await nodo('b');
  assert.equal(nuovoB, idB, 'gli id seguono la sessione: «b» tiene il suo');
  assert.notEqual(nuovoB, idA, '«b» non prende l’id di «a»');
  assert.equal(await nodo('a'), null, '«a» non è fra quelli mostrati');
  // anche PRIMA che la storia sia riletta (l'«attimo» in cui resta quella di prima) ognuno ha i suoi tentativi
  assert.deepEqual(campata(nuovoB), [70_000, 200_000], 'nell’attimo prima della rilettura «b» non mostra i tentativi di «a»');
  assert.equal(await fonte.aggiornaStoria(), true, 'la storia si rilegge da capo: l’elenco dipende da ciò che si guarda');
  assert.deepEqual(campata(nuovoB), [70_000, 200_000], 'i tentativi di «b», non quelli di «a»');
  assert.equal(fonte.statoDi(nuovoB, T0 + 300_000), 'succeeded', 'a 300 s «b» è finito («a» lavorava ancora)');
  // si torna a tutti: di nuovo ognuno i suoi
  client.mostraTutti();
  await fonte.caricaPanoramica(); await fonte.aggiornaStoria();
  assert.deepEqual(campata(await nodo('a')), [60_000, 420_000]);
  assert.deepEqual(campata(await nodo('b')), [70_000, 200_000]);
  assert.equal(fonte.statoDi(await nodo('a'), T0 + 300_000), 'running');
  // AL CONTRARIO: senza un cambio di struttura la storia si allunga soltanto — niente di nuovo, niente rilettura, stessa versione
  const versione = fonte.versioneStoria;
  assert.equal(await fonte.aggiornaStoria(), false);
  assert.equal(fonte.versioneStoria, versione);
});

test('DELEGHE-RUN-STORIA-STRUTTURA-02 — struttura cambiata e registro che non risponde: la storia di prima NON resta attribuita agli agenti di adesso (si svuota), e quando il registro torna ognuno ha la sua', async () => {
  const a = finita('a', 60, 420); const b = finita('b', 70, 200);
  const record = [registrato(1, 0, { ...madre }, 'created'), registrato(2, 60, { ...figlia('a', 60) }, 'created'), registrato(3, 70, { ...figlia('b', 70) }, 'created'), registrato(4, 200, { ...b }), registrato(5, 420, { ...a })];
  let rotto = false; const buona = pagine(record);
  const client = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [a, b] }), leggiCronologia: async (q) => { if (rotto) throw new Error('Cronologia temporaneamente non disponibile'); return buona(q); } });
  const fonte = creaFonte({ client, sorgente: await client.sorgente() });
  const campata = (id) => { const t = fonte.tentativi().get(id)?.at(-1); return t ? [t.da - T0, t.a === null ? null : t.a - T0] : null; };
  await fonte.caricaPanoramica();
  assert.equal(await fonte.aggiornaStoria(), true);
  assert.equal(client.fonteDellaStoria(), 'registro');
  const idA = await client.nodoDellaSessione('a'); const idB = await client.nodoDellaSessione('b');
  assert.deepEqual(campata(idA), [60_000, 420_000]);
  // si isola «b» proprio mentre il registro smette di rispondere
  client.isola('b'); rotto = true;
  await fonte.caricaPanoramica();
  assert.equal(await client.nodoDellaSessione('b'), idB, 'gli id seguono la sessione: «b» tiene il suo');
  await assert.rejects(fonte.aggiornaStoria(), /temporaneamente non disponibile/u);
  assert.equal(fonte.storia.length, 0, 'la storia di prima non vale più: non resta');
  assert.equal(campata(idB), null);
  assert.equal(campata(idA), null, 'e nemmeno quella di «a», che non si vede più');
  // il registro torna: la storia si rilegge da capo, e «b» ha la sua
  rotto = false;
  assert.equal(await fonte.aggiornaStoria(), true);
  assert.deepEqual(campata(idB), [70_000, 200_000]);
  // AL CONTRARIO: una lettura fallita SENZA un cambio di struttura non butta la storia che c'è
  rotto = true;
  await assert.rejects(fonte.aggiornaStoria(), /temporaneamente non disponibile/u);
  assert.deepEqual(campata(idB), [70_000, 200_000]);
});

test('DELEGHE-RUN-IMPRONTA — gli stessi agenti in lotti DIVERSI sono un’altra struttura; AL CONTRARIO, cambiare solo lo stato di un agente non lo è', async () => {
  /* 13/10/2026 sera: l'id di un nodo segue la sessione e non dice più il lotto. L'impronta della struttura porta il lotto: senza,
     un agente che passa in un altro lotto non farebbe rileggere righe e archi. */
  let figli = [figlia('a', 10), figlia('b', 11)];
  const client = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli }) });
  const uno = (await client.panoramica()).data;
  assert.equal(uno.groups.length, 1, 'la premessa: nati vicini, stanno nello stesso lotto');
  // solo lo stato cambia: stessa struttura
  figli = [finita('a', 10, 50), figlia('b', 11)];
  assert.equal((await client.panoramica()).data.graphVersion, uno.graphVersion);
  // «b» nasce molto dopo: stessi agenti, due lotti
  figli = [figlia('a', 10), figlia('b', 11 + FINESTRA_LOTTO_MS / 1000 + 60)];
  const due = (await client.panoramica()).data;
  assert.equal(due.groups.length, 2, 'la premessa: adesso i lotti sono due');
  assert.notEqual(due.graphVersion, uno.graphVersion);
  // e gli id dei nodi non sono cambiati: seguono la sessione
  assert.equal(await client.nodoDellaSessione('a'), idDelNodo('a'));
  assert.equal(await client.nodoDellaSessione('b'), idDelNodo('b'));
});

test('DELEGHE-RUN-VUOTO — senza agenti la sorgente c’è solo per chi la chiede (`ancheVuota`): nessun gruppo, la conversazione in cima', async () => {
  // 13/10/2026: lo stato vuoto lo disegna il diagramma nuovo; chi non lo chiede resta a `null` («niente da mostrare»), come prima
  const client = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [] }) });
  assert.equal(await client.sorgente(), null, 'di serie: senza agenti niente sorgente');
  const sorgente = await client.sorgente({ ancheVuota: true });
  assert.equal(sorgente.tipo, 'run');
  assert.equal(sorgente.deleghe, true);
  const p = (await client.panoramica()).data;
  assert.equal(p.total, 0);
  assert.equal(p.agentiInTutto, 0, 'il conto che decide lo stato vuoto: nessun agente in tutta la conversazione');
  assert.equal(p.delegated.total, 0);
  assert.equal(p.filtro.inTutto, 0);
  assert.deepEqual(p.groups, []);
  assert.equal(p.conversazione.sessionId, 'madre', 'la conversazione resta in cima anche da sola');
  // AL CONTRARIO: con un agente la sorgente c'è anche senza chiederla
  assert.notEqual(await creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [figlia('a', 10)] }) }).sorgente(), null);
});
