/*
 * Refactor dei grafi, il PORT (decisioni owner 24-31, 26/09/2026): le parti pure del diagramma nel prodotto — tentativi e asse
 * dalla storia degli stati (decisione 29), il riproduttore, la sorgente dati (pagine pigre per indice, concorrenza, storia
 * incrementale, una rilettura vecchia che non torna indietro), la disposizione con ELK vero (archi solo fra sottografi,
 * decisione 30; celle pigre; archi fusi dai groupConnections) e le tre letture nuove del client.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { chiaveCella, disponi, SOGLIA_GRIGLIA } from '../../src/components/grafo/disposizione.js';
import { creaFonte, PAGINA } from '../../src/components/grafo/fonte.js';
import { asseDelTempo, creaRiproduttore, tentativiDallaStoria, VUOTO_COMPRESSO_MS } from '../../src/components/grafo/tempo-modello.js';
import { creaClientGrafo } from '../../src/components/workflow-graph-client.js';

const ELK = createRequire(import.meta.url)('elkjs/lib/elk.bundled.js');
const MIN = 60_000;
const T0 = Date.parse('2026-09-26T08:00:00.000Z');
const at = (m) => new Date(T0 + m * MIN).toISOString();
let seq = 0;
const voce = (m, nodeId, state, phaseId = 'p') => ({ seq: ++seq, at: at(m), scope: 'node', nodeId, phaseId, state });

test('GRAFO-TENTATIVI: ogni tratto al lavoro è un tentativo; un ritentativo apre il secondo, uno in corso resta aperto', () => {
  const storia = [
    voce(0, 'a', 'ready'), voce(1, 'a', 'leased'), voce(1, 'a', 'running'), voce(5, 'a', 'retry_wait'),
    voce(7, 'a', 'ready'), voce(7, 'a', 'running'), voce(12, 'a', 'succeeded'),
    voce(2, 'b', 'running'), voce(3, 'b', 'uncertain'), voce(4, 'b', 'reconciling'),
    { seq: ++seq, at: at(13), scope: 'run', state: 'paused' },
  ];
  const t = tentativiDallaStoria(storia);
  assert.deepEqual(t.get('a'), [{ da: T0 + MIN, a: T0 + 5 * MIN, esito: 'retry_wait' }, { da: T0 + 7 * MIN, a: T0 + 12 * MIN, esito: 'succeeded' }]);
  // «da verificare» e «in verifica» sono ancora quel tentativo: resta aperto finché il passo non ne esce
  assert.deepEqual(t.get('b'), [{ da: T0 + 2 * MIN, a: null, esito: null }]);
  assert.equal(t.has('run'), false);
});

test('GRAFO-ASSE-STORIA: un buco senza lavoro oltre 3 minuti si comprime a 90 s, e il ritorno dall\'asse dà l\'istante vero', () => {
  const t = tentativiDallaStoria([voce(0, 'a', 'running'), voce(10, 'a', 'succeeded'), voce(40, 'b', 'running'), voce(50, 'b', 'succeeded')]);
  const asse = asseDelTempo(t, { inizio: at(0), adesso: T0 + 50 * MIN });
  assert.equal(asse.vuoti.length, 1);
  assert.equal(asse.vuoti[0].a - asse.vuoti[0].da, 30 * MIN, 'la durata VERA del buco resta scritta');
  assert.equal(asse.lunghezza, 10 * MIN + VUOTO_COMPRESSO_MS + 10 * MIN);
  for (const m of [0, 5, 10, 40, 45, 50]) assert.equal(Math.round(asse.dalAsse(asse.versoAsse(T0 + m * MIN))), T0 + m * MIN, `andata e ritorno a ${m} min`);
  // un tentativo ancora in corso lavora fino ad «adesso»: nessun buco finto dopo il suo inizio
  const aperto = asseDelTempo(tentativiDallaStoria([voce(0, 'a', 'running')]), { inizio: at(0), adesso: T0 + 30 * MIN });
  assert.equal(aperto.vuoti.length, 0);
  assert.equal(aperto.lunghezza, 30 * MIN);
});

test('GRAFO-RIPRODUTTORE: stati e conteggi a un istante, avanti e indietro, per fase', () => {
  const storia = [
    { seq: 1, at: at(0), scope: 'run', state: 'running' },
    voce(0, 'a', 'ready', 'uno'), voce(0, 'b', 'blocked', 'due'),
    voce(1, 'a', 'running', 'uno'), voce(5, 'a', 'succeeded', 'uno'), voce(5, 'b', 'ready', 'due'), voce(6, 'b', 'running', 'due'), voce(8, 'b', 'failed', 'due'),
  ];
  const rip = creaRiproduttore(storia, [{ phaseId: 'uno', total: 1 }, { phaseId: 'due', total: 2 }]);
  rip.al(T0 + 3 * MIN);
  assert.deepEqual([rip.statoDi('a'), rip.statoDi('b'), rip.statoDi('mai-visto'), rip.statoDelRun()], ['running', 'blocked', 'pending', 'running']);
  assert.deepEqual(rip.conteggi('due'), { counts: { pending: 1, blocked: 1 }, total: 2, terminated: 0, attention: 0, progress: 0 });
  rip.al(T0 + 9 * MIN);
  assert.deepEqual(rip.conteggi('uno'), { counts: { succeeded: 1 }, total: 1, terminated: 1, attention: 0, progress: 1 });
  assert.deepEqual(rip.conteggi('due').counts, { pending: 1, failed: 1 });
  assert.equal(rip.conteggi('due').attention, 1);
  assert.deepEqual(rip.passiIn(new Set(['failed'])), ['b']);
  // indietro: si riparte dall'inizio e si ritrova lo stato di allora
  rip.al(T0 + 2 * MIN);
  assert.deepEqual([rip.statoDi('a'), rip.statoDi('b')], ['running', 'blocked']);
  assert.deepEqual(rip.passiIn(new Set(['failed'])), []);
});

/* un client finto con le forme delle rotte vere, che conta le letture */
function clientFinto({ fasi = { p: 120 }, storia = [], lastSeq = 10, graphVersion = 1 } = {}) {
  const letture = [];
  const righe = Object.fromEntries(Object.entries(fasi).map(([phaseId, n]) => [phaseId, Array.from({ length: n }, (_, i) => ({ nodeId: `${phaseId}-${i}`, phaseId, label: `P${i}`, state: i % 2 ? 'running' : 'pending' }))]));
  let inVolo = 0, massimo = 0;
  const panoramica = { graphVersion, lastSeq, total: Object.values(fasi).reduce((a, b) => a + b, 0),
    groups: Object.entries(fasi).map(([phaseId, n]) => ({ phaseId, total: n, counts: { pending: Math.ceil(n / 2), running: Math.floor(n / 2) }, terminated: 0, attention: 0, progress: 0 })) };
  const client = {
    stato: { panoramica, letture, get massimo() { return massimo; } },
    panoramica: async () => { letture.push('panoramica'); return { data: structuredClone(client.stato.panoramica), meta: {} }; },
    revisione: async () => ({ title: 'W' }),
    gruppo: async (s, phaseId, { offset, limit, arricchisci }) => {
      letture.push(`gruppo:${phaseId}:${offset}${arricchisci ? '+' : ''}`);
      inVolo += 1; massimo = Math.max(massimo, inVolo);
      await new Promise((fatto) => setTimeout(fatto, 5));
      inVolo -= 1;
      return { offset, limit, total: righe[phaseId].length, items: righe[phaseId].slice(offset, offset + limit).map((r) => (arricchisci ? { ...r, model: 'scelto' } : r)) };
    },
    archi: async (s, f) => { letture.push(`archi:${[...f].join(',')}`); return []; },
    storia: async (s, { offset }) => { letture.push(`storia:${offset}`); return { items: storia.slice(offset), total: storia.length, lastSeq }; },
    discendenza: async (s, id, verso) => { letture.push(`discendenza:${id}:${verso}`); return ['x', 'y']; },
  };
  return client;
}

test('GRAFO-FONTE-PAGINE: le celle chiedono solo le pagine che mancano, al più quattro alla volta, e una pagina ricca non si perde', async () => {
  const client = clientFinto({ fasi: { p: 420 } });
  let cambi = 0;
  const fonte = creaFonte({ client, sorgente: { tipo: 'run' }, onCambio: () => { cambi += 1; } });
  await fonte.caricaPanoramica();
  assert.equal(fonte.cella('p', 0), null, 'una cella senza la sua pagina non inventa niente');
  fonte.chiedi('p', 0, 419); // tutte e 9 le pagine
  fonte.chiedi('p', 10, 60); // doppione: niente di nuovo
  await new Promise((fatto) => setTimeout(fatto, 120));
  const pagine = client.stato.letture.filter((l) => l.startsWith('gruppo:'));
  assert.deepEqual(pagine, Array.from({ length: 9 }, (_, n) => `gruppo:p:${n * PAGINA}`));
  assert.ok(client.stato.massimo <= 4, `concorrenza ${client.stato.massimo}`);
  assert.equal(fonte.cella('p', 419).nodeId, 'p-419');
  assert.deepEqual(fonte.posto('p-173'), { phaseId: 'p', indice: 173 });
  // un avviso per pagina arrivata: una richiesta doppia non rimette in coda pagine già chieste (né ridisegni in più)
  assert.equal(cambi, 9);
  // la pagina «arricchita» porta il modello scelto; una povera letta DOPO non lo cancella
  const altra = creaFonte({ client: clientFinto({ fasi: { p: 10 } }), sorgente: { tipo: 'run' } });
  await altra.caricaPanoramica();
  await altra.pagina('p', 0, { arricchisci: true });
  assert.equal(altra.riga('p-3').model, 'scelto');
  await altra.pagina('p', 0);
  assert.equal(altra.riga('p-3').model, 'scelto');
});

test('GRAFO-FONTE-STORIA: la prima volta tutta, poi solo la coda; dal vivo vince la riga, in riproduzione la storia', async () => {
  const storia = [voce(0, 'p-0', 'ready'), voce(1, 'p-0', 'running')];
  const client = clientFinto({ fasi: { p: 3 }, storia });
  const fonte = creaFonte({ client, sorgente: { tipo: 'run' } });
  await fonte.caricaPanoramica();
  assert.equal(await fonte.aggiornaStoria(), true);
  storia.push(voce(4, 'p-0', 'succeeded'));
  assert.equal(await fonte.aggiornaStoria(), true);
  assert.equal(await fonte.aggiornaStoria(), false);
  assert.deepEqual(client.stato.letture.filter((l) => l.startsWith('storia:')), ['storia:0', 'storia:2', 'storia:3']);
  assert.equal(fonte.statoDi('p-0'), 'succeeded', 'senza riga, dal vivo decide la storia');
  assert.equal(fonte.statoDi('p-2'), 'pending', 'un passo che la storia non nomina è ancora pending');
  await fonte.pagina('p', 0);
  assert.equal(fonte.statoDi('p-0'), 'pending', 'dal vivo la riga (aggiornata dai fotogrammi) vince');
  assert.equal(fonte.statoDi('p-0', T0 + 2 * MIN), 'running', 'in riproduzione decide la storia');
  // la discendenza si legge una volta per passo e verso
  await fonte.discendenza('p-0', 'valle'); await fonte.discendenza('p-0', 'valle');
  assert.equal(client.stato.letture.filter((l) => l === 'discendenza:p-0:valle').length, 1);
  // un piano non ha storia: nessuna lettura
  const piano = clientFinto();
  assert.equal(await creaFonte({ client: piano, sorgente: { tipo: 'piano' } }).aggiornaStoria(), false);
  assert.equal(piano.stato.letture.some((l) => l.startsWith('storia:')), false);
});

test('GRAFO-FONTE-VECCHIA: una rilettura più vecchia di un fotogramma già applicato non riporta indietro i conteggi', async () => {
  const client = clientFinto({ fasi: { p: 4 }, lastSeq: 10 });
  const fonte = creaFonte({ client, sorgente: { tipo: 'run' } });
  await fonte.caricaPanoramica();
  await fonte.pagina('p', 0);
  fonte.applicaFotogramma({ status: 'running', lastSeq: 11, nodes: [{ ...fonte.riga('p-0'), state: 'succeeded' }] });
  assert.equal(fonte.conteggi('p').terminated, 1);
  await fonte.caricaPanoramica(); // il server (finto) risponde ancora lastSeq 10: è partita prima del fotogramma
  assert.equal(fonte.conteggi('p').terminated, 1);
  client.stato.panoramica = { ...client.stato.panoramica, lastSeq: 12, groups: client.stato.panoramica.groups.map((g) => ({ ...g, terminated: 2, progress: 0.5 })) };
  await fonte.caricaPanoramica(); // più nuova: vince
  assert.equal(fonte.conteggi('p').terminated, 2);
});

test('GRAFO-DISPOSIZIONE: sottografi con ELK vero, griglie a celle pigre, archi solo fra sottografi e fusi altrove', async () => {
  const gruppi = [{ phaseId: 'a', label: 'A', order: 0, total: 3 }, { phaseId: 'b', label: 'B', order: 1, total: SOGLIA_GRIGLIA + 8 }, { phaseId: 'c', label: 'C', order: 2, total: 2 }];
  const righe = (p, n) => Array.from({ length: n }, (_, i) => ({ nodeId: `${p}${i}`, phaseId: p }));
  const panoramica = { groups: gruppi, groupConnections: [{ fromPhaseId: 'a', toPhaseId: 'b', total: 7 }, { fromPhaseId: 'a', toPhaseId: 'c', total: 2 }, { fromPhaseId: 'b', toPhaseId: 'c', total: 3 }] };
  const archi = [{ edgeId: 'a0-a1', fromNodeId: 'a0', toNodeId: 'a1' }, { edgeId: 'a2-c0', fromNodeId: 'a2', toNodeId: 'c0' }, { edgeId: 'a1-c1', fromNodeId: 'a1', toNodeId: 'c1' }];
  const disp = await disponi(new ELK(), { panoramica, righeFase: new Map([['a', righe('a', 3)], ['c', righe('c', 2)]]), archi }, new Set(['a', 'b', 'c']));
  assert.deepEqual(disp.blocchi.map((b) => b.tipo), ['fase', 'griglia', 'fase']);
  assert.ok(disp.passi.has('a0') && disp.passi.has('c1'));
  assert.deepEqual(disp.passi.get(chiaveCella('b', 19)), { ...disp.passi.get(chiaveCella('b', 19)), forma: 'mini', phaseId: 'b', indice: 19 });
  assert.equal(disp.passi.has(chiaveCella('b', 20)), false);
  // colonne con la cima allineata
  assert.equal(new Set(disp.blocchi.map((b) => b.y)).size, 1);
  const passo = disp.archi.filter((x) => x.livello === 'passo').map((x) => x.id).sort();
  assert.deepEqual(passo, ['a0-a1', 'a1-c1', 'a2-c0']);
  // a→b e b→c toccano la griglia: fusi e CONTATI dal groupConnections; a→c è disegnato passo per passo, niente fuso
  const fusi = Object.fromEntries(disp.archi.filter((x) => x.livello === 'fase').map((x) => [x.id, x.conto]));
  assert.deepEqual(fusi, { 'fuso:a>b': 7, 'fuso:b>c': 3 });
  // chiuso: nessuna cella, un fuso anche verso la fase chiusa
  const chiusa = await disponi(new ELK(), { panoramica, righeFase: new Map([['a', righe('a', 3)]]), archi: [] }, new Set(['a']));
  assert.deepEqual(chiusa.blocchi.map((b) => b.tipo), ['fase', 'gruppo', 'gruppo']);
  assert.deepEqual(Object.keys(Object.fromEntries(chiusa.archi.filter((x) => x.livello === 'fase').map((x) => [x.id, 1]))).sort(), ['fuso:a>b', 'fuso:a>c', 'fuso:b>c']);
});

test('GRAFO-CLIENT: archi per fase ripetuta, storia e discendenza a pagine fino in fondo', async () => {
  const chieste = [];
  const pagina = (items, offset, limit) => ({ ok: true, data: { offset, limit, total: items.length, nextOffset: offset + limit < items.length ? offset + limit : null, items: items.slice(offset, offset + limit) } });
  const fetchFn = async (url) => {
    chieste.push(url);
    const u = new URL(url, 'http://x');
    const offset = Number(u.searchParams.get('offset')), limit = Number(u.searchParams.get('limit'));
    const n = u.pathname.endsWith('/edges') ? 150 : u.pathname.endsWith('/history') ? 2500 : 3;
    return { ok: true, status: 200, json: async () => pagina(Array.from({ length: n }, (_, i) => `v${i}`), offset, limit) };
  };
  const client = creaClientGrafo({ sessionId: 's', fetchFn });
  const run = { tipo: 'run', runId: 'r', workflowId: 'w', version: 1 };
  assert.equal((await client.archi(run, ['a b', 'c'])).length, 150);
  assert.deepEqual(chieste.splice(0), ['/api/v1/sessions/s/workflows/r/edges?phaseId=a%20b&phaseId=c&offset=0&limit=100', '/api/v1/sessions/s/workflows/r/edges?phaseId=a%20b&phaseId=c&offset=100&limit=100']);
  assert.deepEqual(await client.archi(run, []), []);
  assert.equal(chieste.length, 0, 'nessuna fase aperta, nessuna lettura');
  assert.equal((await client.storia(run, { offset: 500 })).items.length, 2000);
  assert.deepEqual(chieste.splice(0), [500, 1500].map((o) => `/api/v1/sessions/s/workflows/r/history?offset=${o}&limit=1000`));
  await client.discendenza({ tipo: 'piano', workflowId: 'w', version: 2 }, 'n/1', 'monte');
  assert.deepEqual(chieste.splice(0), ['/api/v1/workflows/w/versions/2/nodes/n%2F1/lineage?direction=upstream&offset=0&limit=1000']);
  assert.deepEqual((await client.storia({ tipo: 'piano' })).items, []);
});
