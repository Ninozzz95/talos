import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = await readFile(join(root, 'frontend/src/legacy/app.js'), 'utf8');
const css = await readFile(join(root, 'frontend/src/styles/index.css'), 'utf8');

/** ⛔ Mai `assert.match` su un file intero: in caso di rosso il runner stamperebbe 700 KB di sorgente e il messaggio vero sparirebbe. */
function ok(testo, regex, messaggio) { assert.ok(regex.test(testo), messaggio || `atteso: ${regex}`); }

/**
 * Estrae una funzione del monolite (IIFE senza export) e la istanzia con uno
 * `state` finto — stesso attrezzo di `aperti-minori.test.mjs`: si prova il
 * COMPORTAMENTO, non solo il testo.
 */
function funzioneDalMonolite(nome, { state = {}, deps = [] } = {}) {
  const estrai = (n) => {
    const inizio = app.indexOf(`  function ${n}(`);
    assert.ok(inizio > 0, `${n} deve esistere in app.js`);
    const fine = app.indexOf('\n  }\n', inizio);
    return app.slice(inizio, fine + 4);
  };
  const sorgente = deps.map(estrai).join('\n') + estrai(nome);
  // eslint-disable-next-line no-new-func
  return new Function('state', `${sorgente}\nreturn ${nome};`)(state);
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
  // ⛔ Ripiego ONESTO: un attrezzo nato da `tool_create` e mai etichettato mostra il suo nome grezzo, mai un'etichetta inventata.
  assert.equal(nomeUmanoAttrezzo('attrezzo_inventato_dall_owner'), 'attrezzo_inventato_dall_owner');
  assert.equal(nomeUmanoAttrezzo(undefined), '');
});

test('O-02/owner — la mappa nome-umano sta in UN posto solo, e il nome tecnico resta solo come dettaglio secondario', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, () => {
  assert.equal((app.match(/function nomeUmanoAttrezzo\(/g) || []).length, 1, 'una sola definizione della mappa');
  assert.equal((app.match(/web_search: 'ricerca sul web'/g) || []).length, 1, 'una sola tabella, mai una seconda copia sparsa');
  const riga = app.slice(app.indexOf('  function rigaAttrezzo('), app.indexOf('  const ICONA_ATTREZZO'));
  ok(riga, /textElement\('strong', null, nomeUmanoAttrezzo\(attrezzo\.nome\)\)/, 'l\'etichetta principale della riga è il nome umano');
  ok(riga, /Nome tecnico \(quello che riceve il modello\): \$\{attrezzo\.nome\}/, 'il nome tecnico resta nel title, come dettaglio secondario');
  // ⛔ E i due riassunti della chat non ricadono più su `web_search(…)` per i ~30 attrezzi senza un caso dedicato.
  assert.equal((app.match(/default: return `\$\{nome\}\(…\)`;/g) || []).length, 0, 'nessun ripiego che stampi il nome tecnico grezzo');
  assert.equal((app.match(/default: return `\$\{nomeUmanoAttrezzo\(nome\)\}…`;/g) || []).length, 2, 'riassuntoAttrezzoInCorso e riassuntoAttrezzo usano la stessa mappa');
});

test('O-02 AL CONTRARIO — senza eventi di attrezzo la diagnosi dice «non registrat», mai «0 chiamate»', () => {
  const testoDiagnosiGiri = funzioneDalMonolite('testoDiagnosiGiri');
  for (const riassunto of [null, { registrato: false, chiamate: 0, ripetute: 0, perAttrezzo: [] }]) {
    const testo = testoDiagnosiGiri(riassunto);
    ok(testo, /non registrat/i);
    assert.doesNotMatch(testo, /\b0 chiamate\b/, 'uno zero inventato è peggio di un «non registrato»');
  }
});

test('O-02 — consiglioDaRiassunto: il suggerimento nasce dai NUMERI misurati, non è una frase fissa', () => {
  const consiglioDaRiassunto = funzioneDalMonolite('consiglioDaRiassunto', { deps: DEPS_TESTO });
  const conRipetizioni = consiglioDaRiassunto({ registrato: true, chiamate: 20, ripetute: 6, perAttrezzo: [{ nome: 'elenca', chiamate: 8, ripetute: 6 }, { nome: 'cerca', chiamate: 12, ripetute: 0 }] });
  ok(conRipetizioni, /6/, 'nomina quante chiamate erano già state fatte');
  const dominatoDaShell = consiglioDaRiassunto({ registrato: true, chiamate: 20, ripetute: 0, perAttrezzo: [{ nome: 'shell', chiamate: 16, ripetute: 0 }] });
  ok(dominatoDaShell, /comando nel terminale/, 'nomina l\'attrezzo che ha consumato i giri, col suo nome umano');
  assert.doesNotMatch(dominatoDaShell, /\bshell\b/, 'owner 04/9: mai il nome tecnico a schermo');
  assert.notEqual(conRipetizioni, dominatoDaShell);
  const senzaDato = consiglioDaRiassunto({ registrato: false, chiamate: 0, ripetute: 0, perAttrezzo: [] });
  assert.ok(senzaDato.length > 0, 'anche senza dati la persona riceve un passo da fare');
});

// --------------------------------------------------------------------
// 3. Il tetto: si LEGGE dal messaggio del server, non si scrive a mano.
// --------------------------------------------------------------------

test('O-02 — tettoGiriDaMessaggio: il tetto arriva dalle parole del kernel (`24 su 24`), mai da una costante nel client', () => {
  const tettoGiriDaMessaggio = funzioneDalMonolite('tettoGiriDaMessaggio');
  assert.equal(tettoGiriDaMessaggio('⛔ giri esauriti: 24 su 24 usati senza chiudere il task. Non e un fallimento del ragionamento: e un tetto raggiunto.'), 24);
  assert.equal(tettoGiriDaMessaggio('⛔ giri esauriti: 8 su 8 usati senza chiudere il task.'), 8, 'il planner ha un tetto diverso: si legge, non si presume');
  assert.equal(tettoGiriDaMessaggio('la generazione si e fermata senza risposta'), null);
  assert.equal(tettoGiriDaMessaggio(undefined), null);
});

test('O-02 ⛔ — nessuna costante 24 scritta a mano nel client: GIRI_MASSIMI è del kernel', () => {
  const fonte = app.slice(app.indexOf('  function tettoGiriDaMessaggio('), app.indexOf('  function tettoGiriDaMessaggio(') + 900);
  assert.doesNotMatch(fonte, /=\s*24\b/, 'il tetto non si scrive nel client');
  assert.doesNotMatch(app, /GIRI_MASSIMI\s*=/, 'la costante del kernel non si duplica qui');
});

test('O-02 — formattaUsageBreve: mostra i giri usati; il tetto SOLO se qualcuno lo ha dichiarato', () => {
  const formattaUsageBreve = funzioneDalMonolite('formattaUsageBreve');
  assert.equal(formattaUsageBreve({ prompt_tokens: 12000, completion_tokens: 300, giri: 12 }, { live: true }), '12.3k token · 12 giri · live');
  assert.equal(formattaUsageBreve({ prompt_tokens: 12000, completion_tokens: 300, giri: 12 }, { live: true, tettoGiri: 24 }), '12.3k token · 12 giri su 24 · live');
  assert.equal(formattaUsageBreve({ prompt_tokens: 500, completion_tokens: 0, giri: 1 }, { tettoGiri: 24 }), '500 token · 1 giro su 24');
  assert.equal(formattaUsageBreve(null, { finita: true }), 'consumo non registrato');
});

// --------------------------------------------------------------------
// 4. Il cablaggio nel monolite.
// --------------------------------------------------------------------

test('O-02 — handleRealEvent registra gli eventi di attrezzo in UN punto solo, dopo il dedup `_sequenza`', () => {
  const inizio = app.indexOf('  function handleRealEvent(');
  const corpo = app.slice(inizio, app.indexOf("      case 'RunStarted': {", inizio));
  ok(corpo, /eventiAttrezzi\.push/, 'il registro si riempie prima dello switch, una volta per evento');
  ok(corpo, /ToolCallStart/);
  ok(corpo, /ToolCallArgs/);
  ok(corpo, /ToolCallResult/);
  ok(app, /eventiAttrezzi: \[\]/, 'lo stato della sessione dichiara il registro');
  const nuova = app.slice(app.indexOf('  function nuovaGenerazioneSessione('), app.indexOf('  function nuovaGenerazioneSessione(') + 3000);
  ok(nuova, /eventiAttrezzi = \[\]/, 'una sessione NUOVA non eredita il registro della precedente');
  ok(nuova, /tettoGiriDichiarato = null/, 'né il tetto dichiarato da un\'altra sessione');
});

test('O-02 — la bolla `giri-esauriti` porta la DIAGNOSI, non più la sola frase di continuità', () => {
  const caso = app.slice(app.lastIndexOf("      case 'RunError': {"), app.lastIndexOf("      case 'HookInvoked': {"));
  ok(caso, /riassuntoAttrezziDaEventi\(state\.realSession\.eventiAttrezzi\)/, 'i conteggi vengono dagli eventi VERI di questa sessione');
  ok(caso, /testoDiagnosiGiri\(/);
  ok(caso, /consiglioDaRiassunto\(/);
  ok(caso, /tettoGiriDaMessaggio\(evento\.message\)/, 'il tetto si impara dalle parole del server');
  // ⛔ 04/9, difetto trovato dalla corsa `qa-giri-esauriti-diagnosi`: lo /usage con giri=24 arriva PRIMA di questo RunError, quindi senza un redraw il contatore resta senza il «su 24» appena imparato.
  ok(caso, /aggiornaComposerUsage\(state\.realSession\.usage\)/, 'imparato il tetto, il contatore si RIDISEGNA');
  ok(caso, /aggiornaContatoreUsage\(\)/, 'e con lui la riga «Main» del foglio Albero sessione');
  ok(caso, /aggiornaComposerUsage\(state\.realSession\.usage\)/, 'imparato il tetto, il contatore si RIDISEGNA: lo /usage con i giri è già passato prima di questo evento');
  ok(caso, /Premi «Nuova»/, 'la guida di continuità del 30/8 resta');
  assert.ok(/evento\.code === 'giri-esauriti'/.test(caso), 'la diagnosi NON deve finire su un RunError qualsiasi');
});

test('O-02 — il contatore live: il composer mostra i giri e segnala quando è vicino al tetto DICHIARATO', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, () => {
  const fn = app.slice(app.indexOf('  function aggiornaComposerUsage('), app.indexOf('  function aggiornaComposerUsage(') + 1800);
  ok(fn, /state\.realSession\.tettoGiriDichiarato/, 'il tetto mostrato è quello che il server ha dichiarato, mai uno inventato');
  ok(fn, /dataset\.giriStato/, 'lo stato «vicino al tetto» è un dato sul DOM, che il CSS può colorare');
  ok(css, /\[data-giri-stato="vicino-al-tetto"\]/, 'e il CSS lo colora davvero');
  const contatore = app.slice(app.indexOf('  function aggiornaContatoreUsage('), app.indexOf('  function aggiornaContatoreUsage(') + 500);
  ok(contatore, /tettoGiri: state\.realSession\.tettoGiriDichiarato/, 'stessa verità nel foglio Albero sessione');
});

test('O-02 — il Capability hub risponde a «perché questa sessione è costata tanto?»: uso per attrezzo e ripetizioni', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, () => {
  const carica = app.slice(app.indexOf('  async function caricaPannelloAttrezzi('), app.indexOf('  function rigaAttrezzo('));
  ok(carica, /riassuntoAttrezziDaEventi\(state\.realSession\.eventiAttrezzi\)/);
  ok(carica, /rigaAttrezzo\(a, /, 'ogni riga riceve l\'uso misurato per quell\'attrezzo');
  ok(carica, /non registrat/i, 'una sessione senza eventi di attrezzo lo DICHIARA, non mostra zeri');
  const riga = app.slice(app.indexOf('  function rigaAttrezzo('), app.indexOf('  const ICONA_ATTREZZO'));
  ok(riga, /usato/, 'la riga dice quante volte è stato usato in questa sessione');
  ok(riga, /identich/, 'e quante di quelle chiamate erano identiche a una precedente');
  ok(css, /\.tools-panel-uso/, 'la riga di riepilogo dell\'uso ha il suo stile');
});
