/*
 * R4 — ATTIVITÀ COMPATTA: le cinque scene della proposta (23/09/2026). SOLO LABORATORIO.
 *
 * ⛔ Le scene sono scritte come EVENTI del prodotto, nella stessa forma che `handleRealEvent` riceve dal
 *   server (`ToolCallStart/Args/Result`, `ReasoningMessage*`, `TextMessageContent`, `StateDelta`, `RunFinished`)
 *   e che le prove di `tests/browser/ragionamento-compresso.spec.mjs` già usano. Così la STESSA lista si dà
 *   al prodotto attuale (per la foto «prima») e al prototipo (per la foto «dopo»): il confronto è a parità
 *   di dati, non fra due storie scritte a mano.
 * ⛔ Nessun orario negli eventi, come nel prodotto (zero su 105.853 nello store, 13/09): le sole durate
 *   note sono quelle dei ragionamenti, che il server restituisce da `/metrics` (`ragionamentiMs`). Le
 *   durate degli attrezzi esistono solo dal vivo: in una scena rigiocata non si scrivono.
 * ⛔ Nessun dato di questa pagina è un dato di produzione: percorsi e testi sono plausibili, non misurati.
 */

const avvio = (consegna) => ({ type: 'RunStarted', input: { consegna } });
const attrezzo = (id, nome, argomenti, esito) => [
  { type: 'ToolCallStart', toolCallId: id, toolCallName: nome },
  { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify(argomenti) },
  ...(esito === undefined ? [] : [{ type: 'ToolCallResult', toolCallId: id, content: esito }]),
];
const ragionamento = (id, testo, { fine = true } = {}) => [
  { type: 'ReasoningMessageStart', messageId: id },
  { type: 'ReasoningMessageContent', messageId: id, delta: testo },
  ...(fine ? [{ type: 'ReasoningMessageEnd', messageId: id }] : []),
];
const testo = (id, contenuto) => [
  { type: 'TextMessageStart', messageId: id },
  { type: 'TextMessageContent', messageId: id, delta: contenuto },
  { type: 'TextMessageEnd', messageId: id },
];
const numera = (eventi, da = 1) => eventi.map((evento, indice) => ({ ...evento, _sequenza: da + indice }));

const RISULTATO_CERCA_1 = [
  'harness-ui/frontend/src/legacy/app.js:11364  function aggiornaRiassuntoSegmento(segmento) {',
  'harness-ui/frontend/src/legacy/app.js:11420      aggiornaRiassuntoSegmento(segmento);',
  'harness-ui/frontend/src/legacy/app.js:11583    aggiornaRiassuntoSegmento(batch.segmento);',
].join('\n');
const RISULTATO_CERCA_2 = [
  'harness-ui/frontend/src/legacy/app.js:11536  function formattaConteggioAttivita(categoria, totale) {',
  'harness-ui/frontend/src/legacy/app.js:11381      if (contatori[chiave] > 0) parti.push(formattaConteggioAttivita(categoria, contatori[chiave]));',
].join('\n');

const EVENTI_VIVO = numera([
  avvio('Controlla se i test del riassunto coprono anche gli errori.'),
  ...attrezzo('v-t1', 'leggi', { percorso: 'harness-ui/frontend/tests/unit/ragionamento.test.mjs' }, "1  import { test } from 'node:test';\n2  import assert from 'node:assert/strict';"),
  ...ragionamento('v-r1', '**Cerco le prove sugli errori**\n\nIl file copre le durate e l’argomento, non vedo casi di attrezzi falliti.'),
  ...attrezzo('v-t2', 'elenca', { percorso: 'harness-ui/frontend/tests/browser' }, 'ragionamento-compresso.spec.mjs  31,0 KB\nbaseline-shell.spec.mjs         88,4 KB\n… 142 file in tutto'),
  ...attrezzo('v-t3', 'cerca', { testo: 'R4-CHAT-ACTIVITY-ERROR' }),
]);

export const SCENE_ATTIVITA = {
  /* 1 — BREVE: le parole dell'owner, «due ricerche completate, Ha ragionato per 3 secondi». */
  breve: Object.freeze({
    titolo: 'Segmento breve',
    ragionamentiMs: { 'b-r1': 3_000 },
    eventi: numera([
      avvio('Dove nasce il testo del riassunto delle attività nella chat?'),
      ...attrezzo('b-t1', 'cerca', { testo: 'aggiornaRiassuntoSegmento' }, RISULTATO_CERCA_1),
      ...attrezzo('b-t2', 'cerca', { testo: 'formattaConteggioAttivita' }, RISULTATO_CERCA_2),
      ...ragionamento('b-r1', '**Le due ricerche portano allo stesso file**\n\nIl testo nasce in `formattaConteggioAttivita`; la categoria di ogni attrezzo la sceglie `categoriaAttrezzoPerBatch`, qualche riga sopra.'),
      ...testo('b-m1', 'Il riassunto nasce in `formattaConteggioAttivita` (`app.js:11536`), ma la **categoria** la sceglie `categoriaAttrezzoPerBatch`: è lì che un elenco di cartella finisce fra le ricerche.'),
      { type: 'RunFinished', outcome: { type: 'success' } },
    ]),
  }),

  /* 2 — LUNGO E MISTO: ricerca, lettura, elenco, comando, modifica, ragionamento ×3. */
  lungo: Object.freeze({
    titolo: 'Segmento lungo e misto',
    ragionamentiMs: { 'l-r1': 4_000, 'l-r2': 7_000, 'l-r3': 2_000 },
    eventi: numera([
      avvio('Correggi il riassunto: elencare una cartella non è una ricerca.'),
      ...ragionamento('l-r1', '**Cerco dove nasce la categoria**\n\nPrima di cambiare il testo devo sapere quale funzione decide che un attrezzo è una «ricerca».'),
      ...attrezzo('l-t1', 'cerca', { testo: 'categoriaAttrezzoPerBatch' }, [
        'harness-ui/frontend/src/legacy/app.js:11518  function categoriaAttrezzoPerBatch(nome) {',
        'harness-ui/frontend/src/legacy/app.js:17514  const categoria = categoriaAttrezzoPerBatch(evento.toolCallName);',
      ].join('\n')),
      ...attrezzo('l-t2', 'leggi', { percorso: 'harness-ui/frontend/src/legacy/app.js' }, [
        '11518  function categoriaAttrezzoPerBatch(nome) {',
        "11519    if (nome === 'leggi') return 'letto';",
        "11520    if (nome === 'cerca' || nome === 'elenca') return 'cercato';",
        "11521    if (nome === 'shell' || nome === 'prova') return 'comando';",
      ].join('\n')),
      ...attrezzo('l-t3', 'elenca', { percorso: 'harness-ui/frontend/tests/unit' }, [
        'ragionamento.test.mjs            7,9 KB',
        'nomi-attrezzi-copertura.test.mjs 3,2 KB',
        'conversazione.test.mjs          21,4 KB',
        '… 209 file in tutto',
      ].join('\n')),
      ...ragionamento('l-r2', "**«elenca» e «cerca» condividono la categoria**\n\n`if (nome === 'cerca' || nome === 'elenca') return 'cercato'` — per questo una cartella elencata diventa «1 ricerca completata». Serve una categoria sua, con le sue parole: «1 cartella elencata»."),
      ...attrezzo('l-t4', 'file_edit', {
        percorso: 'harness-ui/frontend/src/legacy/app.js',
        old_string: "    if (nome === 'cerca' || nome === 'elenca') return 'cercato';",
        new_string: "    if (nome === 'cerca') return 'cercato';\n    if (nome === 'elenca') return 'elencato';",
      }, 'edited: harness-ui/frontend/src/legacy/app.js (1 occorrenza)'),
      { type: 'StateDelta', delta: [{ op: 'replace', path: '/file/harness-ui/frontend/src/legacy/app.js', prima: "if (nome === 'cerca' || nome === 'elenca') return 'cercato';\n", value: "if (nome === 'cerca') return 'cercato';\nif (nome === 'elenca') return 'elencato';\n" }] },
      ...attrezzo('l-t5', 'shell', { comando: 'node --test tests/unit/ragionamento.test.mjs', descrizione: 'Esegue i test del riassunto' }, 'exit 0\n✔ 14 test superati\nℹ pass 14\nℹ fail 0'),
      ...ragionamento('l-r3', 'I test passano: la categoria nuova non cambia il conteggio dei ragionamenti.'),
      ...attrezzo('l-t6', 'leggi', { percorso: 'harness-ui/frontend/src/components/nomi-attrezzi.js' }, "28  elenca: 'elenco della cartella',\n29  cerca: 'ricerca nei file',"),
      ...testo('l-m1', 'Ho separato l’elenco delle cartelle dalla ricerca: ora il riassunto dice **«1 cartella elencata»** invece di «1 ricerca completata». I 14 test del riassunto passano.'),
      { type: 'RunFinished', outcome: { type: 'success' } },
    ]),
  }),

  /* 3 — VIVO: il giro è a metà, una ricerca è ancora in corso. */
  vivo: Object.freeze({
    titolo: 'Segmento in corso',
    ragionamentiMs: {},
    vivo: true,
    eventi: EVENTI_VIVO,
    /* Il seguito, per la riproduzione dal vivo nel laboratorio (bottone «Riproduci il seguito»). */
    seguito: numera([
      { type: 'ToolCallResult', toolCallId: 'v-t3', content: 'harness-ui/frontend/tests/browser/ragionamento-compresso.spec.mjs:470  R4-CHAT-ACTIVITY-ERROR-02' },
      ...ragionamento('v-r2', '**Una sola prova sugli errori**\n\nC’è `R4-CHAT-ACTIVITY-ERROR-02`: controlla che il segmento si apra, non che l’errore si legga da chiuso. Leggo la prova per esserne sicuro.'),
      ...attrezzo('v-t4', 'leggi', { percorso: 'harness-ui/frontend/tests/browser/ragionamento-compresso.spec.mjs' }, '470    test(`R4-CHAT-ACTIVITY-ERROR-02 — un tool fallito resta subito visibile nel segmento`'),
      ...testo('v-m1', 'C’è una sola prova sugli errori, e controlla che il segmento **si apra**: nessuna prova dice che l’errore si legge a segmento chiuso.'),
      { type: 'RunFinished', outcome: { type: 'success' } },
    ], EVENTI_VIVO.length + 1),
  }),

  /* 4 — ERRORE: un comando fallisce in mezzo al segmento. */
  errore: Object.freeze({
    titolo: 'Segmento con un errore',
    ragionamentiMs: { 'e-r1': 3_000 },
    eventi: numera([
      avvio('Lancia i test unitari del frontend e dimmi cosa non va.'),
      ...attrezzo('e-t1', 'cerca', { testo: 'formattaConteggioAttivita' }, RISULTATO_CERCA_2),
      ...attrezzo('e-t2', 'shell', { comando: 'npm run test:unit', descrizione: 'Esegue i test unitari del frontend' }, [
        'exit 1',
        '✖ ragionamento.test.mjs › il riassunto chiama le cose col loro nome',
        '  atteso: «1 cartella elencata»',
        '  ricevuto: «1 ricerca completata»',
        'ℹ pass 213',
        'ℹ fail 1',
      ].join('\n')),
      ...ragionamento('e-r1', '**Il test fallisce come previsto**\n\nLa prova nuova chiede «1 cartella elencata» e il prodotto dice ancora «1 ricerca completata»: è il difetto, non la prova.'),
      ...attrezzo('e-t3', 'leggi', { percorso: 'harness-ui/frontend/tests/unit/ragionamento.test.mjs' }, "212  test('il riassunto chiama le cose col loro nome', () => {"),
      ...testo('e-m1', 'Un test su 214 fallisce: il riassunto chiama ancora «ricerca» l’elenco di una cartella. È il difetto da curare, non la prova.'),
      { type: 'RunFinished', outcome: { type: 'success' } },
    ]),
  }),
};

/* 5 — NARRATA: la forma della foto dell'owner delle 18:52 — il modello racconta ogni passo in una frase, poi
   lavora, poi racconta di nuovo. Serve a MISURARE dove sta davvero lo spazio verticale di un giro così. */
const PASSI_NARRATI = [
  ['La chat vive in `harness-ui/`: cerco dove si monta il blocco delle attività.', 'cerca', { testo: 'talos-activity--segment' }, 'harness-ui/frontend/src/legacy/app.js:11411'],
  ['Il segmento nasce in `aggiungiVoceSegmento`. Leggo la funzione per capire i confini.', 'leggi', { percorso: 'harness-ui/frontend/src/legacy/app.js' }, '11392  function aggiungiVoceSegmento({ card, tipo, batch = null, ordine }) {'],
  ['Il confine è il testo del modello. Controllo come si contano le categorie.', 'cerca', { testo: 'categoriaAttrezzoPerBatch' }, 'harness-ui/frontend/src/legacy/app.js:11518'],
  ['Guardo quali prove coprono già il segmento.', 'elenca', { percorso: 'harness-ui/frontend/tests/browser' }, 'ragionamento-compresso.spec.mjs\nbaseline-shell.spec.mjs\n… 142 file in tutto'],
  ['Una prova sola copre gli errori: la leggo prima di proporre.', 'leggi', { percorso: 'harness-ui/frontend/tests/browser/ragionamento-compresso.spec.mjs' }, '470    test(`R4-CHAT-ACTIVITY-ERROR-02 …`'],
];
const EVENTI_NARRATI = [avvio('Ispeziona in sola lettura il renderer delle attività della chat.')];
const DURATE_NARRATE = {};
PASSI_NARRATI.forEach(([frase, nome, argomenti, esito], i) => {
  EVENTI_NARRATI.push(...testo(`n-m${i}`, frase));
  EVENTI_NARRATI.push(...attrezzo(`n-t${i}a`, nome, argomenti, esito));
  EVENTI_NARRATI.push(...attrezzo(`n-t${i}b`, 'cerca', { testo: `passo ${i + 1}` }, 'nessun risultato in più'));
  EVENTI_NARRATI.push(...ragionamento(`n-r${i}`, `**Passo ${i + 1}**\n\nIl risultato conferma la pista: vado avanti.`));
  DURATE_NARRATE[`n-r${i}`] = 2_000 + i * 1_000;
});
EVENTI_NARRATI.push(...testo('n-mf', 'Il renderer è in `legacy/app.js` e i suoi confini sono quelli del ticket.'), { type: 'RunFinished', outcome: { type: 'success' } });

SCENE_ATTIVITA.narrata = Object.freeze({ titolo: 'Giro narrato passo per passo', ragionamentiMs: DURATE_NARRATE, eventi: numera(EVENTI_NARRATI) });
Object.freeze(SCENE_ATTIVITA);

export const ORDINE_SCENE_ATTIVITA = Object.freeze(['breve', 'lungo', 'vivo', 'errore', 'narrata']);
