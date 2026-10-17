/*
 * TERZA PASSATA DEL REVISORE (14/10/2026) — la RIMOZIONE della vista classica delle deleghe (`7d3f78421`): qualcosa nomina
 * ancora ciò che è stato tolto? ogni prova cancellata ha la sua erede? i file distinti in testata reggono i percorsi scritti in
 * modi diversi? Punti 1, 2 e 7 del brief.
 * «[REGGE]» = attaccato, ha retto. Senza etichetta = ROSSA: un difetto, con la cura proposta nel rapporto
 * (`handoff …/bugfixer/RAPPORTO-TERZA-PASSATA-2026-10-14.md`).
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

import { TESTI } from '../../src/i18n/testi/index.js';
import { creaClientDeleghe, runDalleDeleghe } from '../../src/components/grafo/run-dalle-deleghe.js';
import { tentativiDallaStoria } from '../../src/components/grafo/tempo-modello.js';
import { riassuntoAttivitaSessione } from '../../../src/attivita-figlia.mjs';

const FRONTEND = join(import.meta.dirname, '..', '..');
const HARNESS = join(FRONTEND, '..');
function* file(dir, salta = new Set(['node_modules', 'dist', 'dist-lab', 'artifacts', 'test-results', 'vendor', 'public'])) {
  let voci = [];
  try { voci = readdirSync(dir); } catch { return; }
  for (const v of voci) {
    if (salta.has(v)) continue;
    const p = join(dir, v); const s = statSync(p);
    if (s.isDirectory()) yield* file(p, salta); else if (/\.(m?js|cjs|ts|css|html)$/u.test(v)) yield p;
  }
}
const leggi = (cartelle) => cartelle.flatMap((c) => [...file(c)]).map((p) => ({ p: relative(HARNESS, p).replaceAll('\\', '/'), testo: readFileSync(p, 'utf8') }));

test('TERZA-RIMOZIONE-01 [REGGE] — nei sorgenti del prodotto (frontend, guscio desktop, server) nessuno nomina più le classi della vista classica, il suo disegnatore, la sua cronologia, la sua preferenza nel browser', () => {
  const sorgenti = leggi([join(FRONTEND, 'src'), join(HARNESS, 'desktop'), join(HARNESS, 'src')]);
  assert.ok(sorgenti.length > 300, `la scansione ha visto solo ${sorgenti.length} file: il giro è rotto, non è un esito`);
  // composti a pezzi: scritti interi, questa prova troverebbe se stessa se un giorno finisse fra i file guardati
  const tolti = [['talos-grafo', '__'].join(''), ['monta', 'GrafoAgenti('].join(''), ['cronologia', '-grafo'].join(''), ['creaCronologia', 'Grafo'].join(''),
    ['deleghe-sul-diagramma', '.v1'].join(''), ['data-anteprima', '-deleghe'].join(''), ['telemetria', 'GrafoAgenti'].join(''), ['layout', 'GrafoAgenti'].join('')];
  const trovati = [];
  for (const { p, testo } of sorgenti) {
    // i commenti che raccontano la storia possono nominarli; il codice no: si cerca nel testo senza i commenti
    const codice = testo.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:'"`])\/\/.*$/gmu, '$1');
    for (const nome of tolti) if (codice.includes(nome)) trovati.push(`${p}: ${nome}`);
  }
  assert.deepEqual(trovati, []);
  // AL CONTRARIO: la scansione vede davvero ciò che cerca (il contenitore comune, che resta, c'è)
  assert.ok(sorgenti.some(({ testo }) => testo.includes('talos-grafo-aperto')), 'la scansione non trova nemmeno ciò che c’è');
});

test('TERZA-RIMOZIONE-02 — le chiavi di testo che usava SOLO la cronologia della vista classica (`agenti.timeline.error.*`) sono rimaste nel dizionario senza nessuno che le nomini: tolta la vista, si tolgono con lei', () => {
  const sorgenti = leggi([join(FRONTEND, 'src'), join(HARNESS, 'src')]).filter(({ p }) => !p.includes('/i18n/'));
  const tutto = sorgenti.map((x) => x.testo).join('\n');
  // le aree toccate dalla rimozione; le chiavi costruite a pezzi dichiarate (`app.js`: `app.delegations.${riuscito}` e `…Body`)
  const prefissi = ['agenti.delegations.', 'app.delegations.', 'agenti.timeline.', 'agenti.family.', 'agenti.workflow.conversationState.'];
  const costruite = /^app\.delegations\.(paused|resumed|retried)(Body)?$/u;
  const guardate = Object.keys(TESTI.en).filter((k) => prefissi.some((x) => k.startsWith(x)));
  assert.ok(guardate.length > 80, `chiavi guardate: ${guardate.length}`);
  const orfane = guardate.filter((k) => !costruite.test(k) && !tutto.includes(k));
  assert.deepEqual(orfane, [], `chiavi che nessun sorgente nomina più: ${orfane.join(', ')}`);
});

/* ——— la cronologia del registro: le prove unitarie della vista classica (`cronologia-grafo.test.mjs`, cancellate) ——— */
const T0 = Date.parse('2026-10-12T09:00:00.000Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const madre = { sessionId: 'madre', avviataAlle: at(0), conclusa: false, taskCorto: 'Conversazione' };
const figlia = (id, nascita, extra = {}) => ({ sessionId: id, padreId: 'madre', avviataAlle: at(nascita), conclusa: false, modello: 'ollama:mock-model', taskCorto: `Compito ${id}`, ...extra });
const registrato = (seq, secondi, node, event = 'updated') => ({ tipo: 'grafo-agenti', schema: 'talos.agent-timeline.v1', rootId: 'madre', seq, at: at(secondi), coverage: 'complete', event, node });
const unaPagina = (record) => async ({ after = 0 } = {}) => ({ schema: 'talos.agent-timeline.v1', rootId: 'madre', coverage: 'complete', persisted: true, through: record.length, next: null, items: record.filter((x) => x.seq > after) });

test('TERZA-STORIA-01 — l’orologio del sistema torna indietro fra due record del registro (era RIPRESA-REPLAY-CLOCK: «regressione ora di sistema non inverte il tempo del player»): nessun agente «finisce prima di cominciare» nella storia rigiocata', async () => {
  const a = figlia('a', 60);
  const record = [
    registrato(1, 0, { ...madre }, 'created'),
    registrato(2, 60, { ...a }, 'created'), // «a» comincia a lavorare alle 09:01:00
    // l'orologio viene corretto di 30 s all'indietro; poi «a» finisce: il suo record porta le 09:00:45
    registrato(3, 45, { ...a, conclusa: true, conclusaAlle: at(45), esitoDelega: 'concluso' }),
    registrato(4, 50, { ...madre, conclusa: true, ultimoEsito: 'concluso' }),
  ];
  const client = creaClientDeleghe({ leggi: async () => ({ corrente: { ...madre, conclusa: true }, figli: [{ ...a, conclusa: true, conclusaAlle: at(45), esitoDelega: 'concluso' }] }), leggiCronologia: unaPagina(record) });
  await client.panoramica();
  const storia = await client.storia();
  assert.equal(client.fonteDellaStoria(), 'registro', 'la premessa: si rigioca dal registro');
  const istanti = storia.items.map((v) => Date.parse(v.at));
  const tentativi = [...tentativiDallaStoria(storia.items).values()].flat();
  assert.ok(tentativi.length === 1 && tentativi[0].a !== null, `la premessa: «a» ha un tentativo chiuso: ${JSON.stringify(tentativi)}`);
  assert.ok(tentativi.every((t) => t.a >= t.da), `un tentativo finisce prima di cominciare: ${JSON.stringify(tentativi.map((t) => ({ da: new Date(t.da).toISOString(), a: new Date(t.a).toISOString() })))}`);
  assert.deepEqual(istanti, [...istanti].sort((x, y) => x - y), 'gli istanti della storia rigiocata non tornano indietro');
});

test('TERZA-STORIA-02 [REGGE] — un record del registro malformato o di un’altra conversazione (era RIPRESA-REPLAY-ORDINE) non entra nella storia rigiocata e non la rompe: senza nodo, senza ora, con uno schema ignoto, di una sessione che qui non c’è; un numero di sequenza già visto non fa una voce doppia', async () => {
  const a = figlia('a', 10);
  const record = [
    registrato(1, 0, { ...madre }, 'created'),
    registrato(2, 10, { ...a }, 'created'),
    { ...registrato(3, 20, { ...a, inAttesaApprovazione: true }), schema: 'sconosciuto' }, // il lettore guarda la pagina, non il record: entra, ed è un fatto dell'agente «a»
    { schema: 'talos.agent-timeline.v1', rootId: 'madre', seq: 4, at: 'non-è-un-orario', node: { ...a, conclusa: true } },
    { schema: 'talos.agent-timeline.v1', rootId: 'madre', seq: 5, at: at(30) }, // senza nodo
    registrato(6, 40, { sessionId: 'di-un-altra', padreId: 'altra-madre', conclusa: true, avviataAlle: at(1) }),
    registrato(2, 99, { ...a, conclusa: true, esitoDelega: 'fallito' }), // sequenza già vista, con un contenuto diverso
    registrato(7, 50, { ...a, inAttesaApprovazione: false, conclusa: true, conclusaAlle: at(50), esitoDelega: 'concluso' }),
  ];
  const client = creaClientDeleghe({ leggi: async () => ({ corrente: madre, figli: [{ ...a, conclusa: true, conclusaAlle: at(50), esitoDelega: 'concluso' }] }), leggiCronologia: unaPagina(record) });
  await client.panoramica();
  const storia = await client.storia();
  const nodo = await client.nodoDellaSessione('a');
  const diA = storia.items.filter((v) => v.scope === 'node');
  assert.ok(diA.every((v) => v.nodeId === nodo), `solo l’agente di questa conversazione: ${JSON.stringify(diA)}`);
  assert.deepEqual(diA.map((v) => [v.state, v.at]), [['running', at(10)], ['waiting_human', at(20)], ['succeeded', at(50)]]);
  assert.equal(client.erroreCronologia(), null);
});

/* ——— i file toccati in testata: quelli distinti ——— */
const eventiDi = (letti = [], scritti = []) => [
  ...letti.flatMap((percorso, i) => [{ type: 'ToolCallStart', toolCallId: `l${i}`, toolCallName: 'leggi' }, { type: 'ToolCallArgs', toolCallId: `l${i}`, delta: JSON.stringify({ percorso }) }, { type: 'ToolCallResult', toolCallId: `l${i}`, content: 'ok' }]),
  ...scritti.map((percorso) => ({ type: 'StateDelta', delta: [{ op: 'add', path: `/file/${percorso}`, value: { righe: 3 } }] })),
];

test('TERZA-FILE-02 [REGGE] — dalla porta vera (il riassunto del server, `attivita-figlia.mjs`, fino al totale della testata): lo stesso file scritto con barre rovesciate, con «./» davanti o con spazi attorno, da tre agenti, è UN file toccato', () => {
  const attivita = [
    riassuntoAttivitaSessione(eventiDi(['src\\prezzi.js', 'src/a.js'])),
    riassuntoAttivitaSessione(eventiDi(['./src/prezzi.js'], ['src/b.js'])),
    riassuntoAttivitaSessione(eventiDi(['  src/prezzi.js  '])),
  ];
  for (const x of attivita) assert.ok(Array.isArray(x.file) && x.file.length > 0, `la premessa: il server dichiara l’elenco: ${JSON.stringify(x)}`);
  const r = runDalleDeleghe({ corrente: madre, figli: attivita.map((x, i) => figlia(`f${i}`, 10 + i, { attivita: x })) });
  assert.deepEqual([...new Set(r.tutte.flatMap((x) => x.files.map((f) => f.path)))].sort(), ['src/a.js', 'src/b.js', 'src/prezzi.js']);
  assert.equal(r.panoramica.totals.files, 3, JSON.stringify(r.panoramica.totals));
  assert.equal(r.panoramica.totals.filesPartial, false);
  // AL CONTRARIO: la somma dei conti di ognuno (ciò che la testata diceva prima) sarebbe 5
  assert.equal(r.tutte.reduce((n, x) => n + x.fileCount, 0), 5);
  /* ⛔ NON coperto, e dichiarato nel rapporto: due percorsi che differiscono solo per le MAIUSCOLE («README.md», «readme.md»)
     restano due file anche su Windows, dove sono lo stesso — la regola è del server (`tocca`), ed è giusta su Linux. */
});
