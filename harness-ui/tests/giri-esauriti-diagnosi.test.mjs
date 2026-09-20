import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { nomeUmanoAttrezzo as nomeUmanoAttrezzoCondiviso, nomeDiRipiegoAttrezzo } from '../frontend/src/components/nomi-attrezzi.js';

const root =join(dirname(fileURLToPath(import.meta.url)), '..');
const app = await readFile(join(root, 'frontend/src/legacy/app.js'), 'utf8');
const css = await readFile(join(root, 'frontend/src/styles/index.css'), 'utf8');

/** ⛔ Mai `assert.match` su un file intero: in caso di rosso il runner stamperebbe 700 KB di sorgente e il messaggio vero sparirebbe. */
function ok(testo, regex, messaggio) { assert.ok(regex.test(testo), messaggio || `atteso: ${regex}`); }

/**
 * Estrae una funzione del monolite (IIFE senza export) e la istanzia con uno
 * `state` finto — stesso attrezzo di `aperti-minori.test.mjs`: si prova il
 * COMPORTAMENTO, non solo il testo.
 */
/*
 * 17/09 — `legami`: dal BC-59 `nomeUmanoAttrezzo` non porta più una copia della mappa dei nomi, legge quella UNICA
 * di `components/nomi-attrezzi.js`. Un nome importato non si estrae dal testo del monolite: si inietta qui, così il
 * test valuta la funzione VERA di app.js con la mappa VERA (trovato dalla suite intera dopo la fusione della corsia C:
 * `ReferenceError: nomeUmanoAttrezzoCondiviso is not defined`, tre rossi che nessun cancello della corsia vedeva).
 */
const LEGAMI_NOMI = { nomeUmanoAttrezzoCondiviso, nomeDiRipiegoAttrezzo };

function funzioneDalMonolite(nome, { state = {}, deps = [], legami = LEGAMI_NOMI } = {}) {
  const estrai = (n) => {
    const inizio = app.indexOf(`  function ${n}(`);
    assert.ok(inizio > 0, `${n} deve esistere in app.js`);
    const fine = app.indexOf('\n  }\n', inizio);
    return app.slice(inizio, fine + 4);
  };
  const sorgente = deps.map(estrai).join('\n') + estrai(nome);
  // eslint-disable-next-line no-new-func
  return new Function('state', ...Object.keys(legami), `${sorgente}\nreturn ${nome};`)(state, ...Object.values(legami));
}

const DEPS_RIASSUNTO = ['chiaveStabile', 'chiaveChiamataAttrezzo'];

/*
 * ⭐⭐⭐ O-02 (04/9) — owner: «vedi perché mi spunta spesso `TALOS · errore
 * [giri-esauriti] ⛔ giri esauriti: 24 su 24 usati senza chiudere il task`
 * con modello locale e probabilmente su modelli a chiave».
 *
 * Misurato sui file VERI di `.sessions-store` (71 sessioni con conteggio
 * giri, 742 chiamate ad attrezzi ricostruite per `toolCallId`):
 *  - le 7 sessioni che hanno toccato il tetto fanno 37,9 chiamate in media,
 *    le altre 7,5;
 *  - `shell` è 379 su 742 (51%), poi `cerca` 147, `leggi` 113, `elenca` 78;
 *  - 71 chiamate su 742 (9,6%) sono IDENTICHE a una precedente della stessa
 *    sessione — `elenca` il 35%, `leggi` 14%, `cerca` 12%, `shell` 2%.
 * ⇒ La bolla d'errore di oggi dice solo «tetto raggiunto»: non dice CHI ha
 * consumato i giri, quindi non è azionabile. Questi test provano la
 * diagnosi come funzione pura, poi il suo cablaggio nel monolite.
 *
 * ⛔ Misura sbagliata da non ripetere: contare i frammenti `ToolCallArgs`
 * (lo streaming li spezza, e nello store persistito arrivano perfino PRIMA
 * del loro `ToolCallStart`). Gli argomenti si ricostruiscono per
 * `toolCallId`, accumulando i delta — è quello che fa la funzione pura.
 */

// --------------------------------------------------------------------
// 1. Il conteggio, come funzione pura su una sequenza di eventi.
// --------------------------------------------------------------------

/** La forma VERA degli eventi persistiti (vedi `.sessions-store/*.jsonl`). */
function chiamata(id, nome, pezziArgomenti, { conclusa = true } = {}) {
  const eventi = [{ type: 'ToolCallStart', toolCallId: id, toolCallName: nome }];
  for (const delta of pezziArgomenti) eventi.push({ type: 'ToolCallArgs', toolCallId: id, delta });
  if (conclusa) eventi.push({ type: 'ToolCallResult', toolCallId: id, content: 'ok' });
  return eventi;
}

test('O-02 — riassuntoAttrezziDaEventi: conta per attrezzo e riconosce le chiamate IDENTICHE, con gli argomenti ricostruiti dai delta', () => {
  const riassunto = funzioneDalMonolite('riassuntoAttrezziDaEventi', { deps: DEPS_RIASSUNTO })([
    ...chiamata('a1', 'elenca', ['{}']),
    ...chiamata('a2', 'cerca', ['{', '"nome": "matematica"}']),
    ...chiamata('a3', 'elenca', ['{}']), // identica ad a1
    ...chiamata('a4', 'shell', ['{"comando":"npm test"}']),
    ...chiamata('a5', 'shell', ['{"comando":"npm test"}']), // identica ad a4
    ...chiamata('a6', 'shell', ['{"comando":"npm run build"}']),
    ...chiamata('a7', 'elenca', ['{}']), // identica ad a1 (terza volta)
  ]);
  assert.equal(riassunto.registrato, true);
  assert.equal(riassunto.chiamate, 7);
  assert.equal(riassunto.ripetute, 3);
  assert.deepEqual(riassunto.perAttrezzo, [
    { nome: 'elenca', chiamate: 3, ripetute: 2 },
    { nome: 'shell', chiamate: 3, ripetute: 1 },
    { nome: 'cerca', chiamate: 1, ripetute: 0 },
  ], 'ordinati per numero di chiamate, a parità di conteggio in ordine alfabetico');
});

test('O-02 — argomenti EQUIVALENTI ma scritti diversi (spazi, ordine delle chiavi) contano come identici; argomenti diversi no', () => {
  const riassunto = funzioneDalMonolite('riassuntoAttrezziDaEventi', { deps: DEPS_RIASSUNTO })([
    ...chiamata('b1', 'cerca', ['{"testo":"ledger","nome":"docs"}']),
    ...chiamata('b2', 'cerca', ['{ "nome": "docs", "testo": "ledger" }']),
    ...chiamata('b3', 'cerca', ['{"testo":"roadmap","nome":"docs"}']),
  ]);
  assert.equal(riassunto.chiamate, 3);
  assert.equal(riassunto.ripetute, 1, 'b2 è la stessa richiesta di b1; b3 no');
});

test('O-02 — lo STESSO argomento su attrezzi DIVERSI non è una ripetizione', () => {
  const riassunto = funzioneDalMonolite('riassuntoAttrezziDaEventi', { deps: DEPS_RIASSUNTO })([
    ...chiamata('c1', 'elenca', ['{}']),
    ...chiamata('c2', 'leggi', ['{}']),
  ]);
  assert.equal(riassunto.ripetute, 0);
});

test('O-02 — ToolCallArgs che arriva PRIMA del suo ToolCallStart (succede davvero nello store persistito) non perde il primo pezzo', () => {
  const riassunto = funzioneDalMonolite('riassuntoAttrezziDaEventi', { deps: DEPS_RIASSUNTO })([
    { type: 'ToolCallArgs', toolCallId: 'd1', delta: '{' },
    { type: 'ToolCallStart', toolCallId: 'd1', toolCallName: 'cerca' },
    { type: 'ToolCallArgs', toolCallId: 'd1', delta: '"nome":"x"}' },
    { type: 'ToolCallResult', toolCallId: 'd1', content: 'ok' },
    ...chiamata('d2', 'cerca', ['{"nome":"x"}']),
  ]);
  assert.equal(riassunto.chiamate, 2);
  assert.equal(riassunto.ripetute, 1, 'senza il primo `{` la chiave sarebbe diversa e la ripetizione sparirebbe');
});

test('O-02 — una chiamata ancora IN CORSO (nessun ToolCallResult) è comunque contata: i giri li ha già consumati', () => {
  const riassunto = funzioneDalMonolite('riassuntoAttrezziDaEventi', { deps: DEPS_RIASSUNTO })([
    ...chiamata('e1', 'shell', ['{"comando":"npm test"}']),
    ...chiamata('e2', 'shell', ['{"comando":"npm test"}'], { conclusa: false }),
  ]);
  assert.equal(riassunto.chiamate, 2);
  assert.equal(riassunto.ripetute, 1);
});

test('O-02 AL CONTRARIO — nessun evento di attrezzo: «non registrato», MAI zero', () => {
  const riassuntoAttrezziDaEventi = funzioneDalMonolite('riassuntoAttrezziDaEventi', { deps: DEPS_RIASSUNTO });
  for (const eventi of [[], null, undefined, [{ type: 'TextMessageContent', messageId: 'm', delta: 'ciao' }]]) {
    const riassunto = riassuntoAttrezziDaEventi(eventi);
    assert.equal(riassunto.registrato, false, `«registrato:false» per ${JSON.stringify(eventi)}`);
    assert.equal(riassunto.chiamate, 0);
    assert.deepEqual(riassunto.perAttrezzo, []);
  }
});

test('O-02 AL CONTRARIO — un ToolCallArgs/Result orfano (nessuno Start: mai un nome) non inventa un attrezzo', () => {
  const riassunto = funzioneDalMonolite('riassuntoAttrezziDaEventi', { deps: DEPS_RIASSUNTO })([
    { type: 'ToolCallArgs', toolCallId: 'f1', delta: '{}' },
    { type: 'ToolCallResult', toolCallId: 'f1', content: 'ok' },
  ]);
  assert.equal(riassunto.registrato, false);
});

// --------------------------------------------------------------------
// 2. Il testo della diagnosi.
// --------------------------------------------------------------------

const DEPS_TESTO = ['nomeUmanoAttrezzo'];

test('O-02 — testoDiagnosiGiri: i primi TRE attrezzi col conteggio, e quante chiamate erano identiche', () => {
  const testoDiagnosiGiri = funzioneDalMonolite('testoDiagnosiGiri', { deps: DEPS_TESTO });
  const testo = testoDiagnosiGiri({
    registrato: true,
    chiamate: 34,
    ripetute: 5,
    perAttrezzo: [
      { nome: 'shell', chiamate: 18, ripetute: 1 },
      { nome: 'cerca', chiamate: 8, ripetute: 1 },
      { nome: 'elenca', chiamate: 5, ripetute: 3 },
      { nome: 'leggi', chiamate: 3, ripetute: 0 },
    ],
  });
  ok(testo, /34 chiamate ad attrezzi/);
  ok(testo, /comando nel terminale 18/);
  ok(testo, /ricerca nei file 8/);
  ok(testo, /elenco della cartella 5/);
  ok(testo, /altri 1 attrezzi/, 'gli attrezzi oltre i primi tre si contano, non spariscono — e si dice che sono ATTREZZI, non chiamate');
  ok(testo, /5 identiche a una precedente/);
  ok(testo, /elenco della cartella 3/, 'le ripetizioni sono attribuite, in ordine di quante sono');
  // ⛔⛔⛔ owner 04/9: «nella UI non compaiono nomi tecnici degli attrezzi».
  for (const tecnico of ['shell', 'cerca', 'elenca', 'leggi']) assert.doesNotMatch(testo, new RegExp(`\\b${tecnico}\\b`), `«${tecnico}» è un nome tecnico: non deve comparire nella bolla`);
});

test('O-02 — testoDiagnosiGiri: zero ripetizioni si DICE, non si tace', () => {
  const testo = funzioneDalMonolite('testoDiagnosiGiri', { deps: DEPS_TESTO })({ registrato: true, chiamate: 4, ripetute: 0, perAttrezzo: [{ nome: 'shell', chiamate: 4, ripetute: 0 }] });
  ok(testo, /nessuna identica a una precedente/);
});

/*
 * ⛔⛔⛔ owner 04/9, vincolante: «nella UI non compaiono nomi tecnici degli
 * attrezzi». Niente `web_search`, `artifact_create`, `document_create`,
 * `delega_sottotask`, `time_now` a schermo — e la mappa sta in UN posto solo.
 */
test('O-02/owner — nomeUmanoAttrezzo: un nome che una persona capisce per OGNI attrezzo dei 43, e il nome grezzo solo come ripiego onesto', () => {
  const nomeUmanoAttrezzo = funzioneDalMonolite('nomeUmanoAttrezzo');
  assert.equal(nomeUmanoAttrezzo('web_search'), 'ricerca sul web');
  assert.equal(nomeUmanoAttrezzo('shell'), 'comando nel terminale');
  assert.equal(nomeUmanoAttrezzo('leggi'), 'lettura di un file');
  assert.equal(nomeUmanoAttrezzo('cerca'), 'ricerca nei file');
  assert.equal(nomeUmanoAttrezzo('elenca'), 'elenco della cartella');
  assert.equal(nomeUmanoAttrezzo('scrivi'), 'scrittura di un file');
  assert.equal(nomeUmanoAttrezzo('prova'), 'esecuzione dei test');
  assert.equal(nomeUmanoAttrezzo('naviga'), 'apertura di una pagina web');
  assert.equal(nomeUmanoAttrezzo('document_create'), 'creazione di un documento');
  assert.equal(nomeUmanoAttrezzo('delega_sottotask'), 'delega a un sotto-agente');
  assert.equal(nomeUmanoAttrezzo('time_now'), 'data e ora');
  assert.equal(nomeUmanoAttrezzo('generate_image'), 'generazione di un’immagine');
  // ⛔ Ripiego ONESTO (17/09): un attrezzo nato da `tool_create` e mai etichettato mostra il SUO nome, reso leggibile —
  //   mai un'etichetta inventata («attrezzo senza nome»), mai l'id grezzo coi trattini bassi (regola del 04/09).
  assert.equal(nomeUmanoAttrezzo('attrezzo_inventato_dall_owner'), 'attrezzo inventato dall owner');
  assert.equal(nomeUmanoAttrezzo('mcp__github__create_issue'), 'create issue (github)');
  assert.equal(nomeUmanoAttrezzo(undefined), '');
});

