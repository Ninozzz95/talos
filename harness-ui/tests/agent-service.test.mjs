import assert from 'node:assert/strict';
import test from 'node:test';

import { avviaSessione, compattaSessione, eseguiComandoDiretto } from '../src/agent-service.mjs';
import { TALOS_SOURCE_TEXT_FORMATS } from '../src/document-generator.mjs';
import { NoteStoreError } from '../src/notes-store.mjs';
import { TaskStoreError } from '../src/tasks-store.mjs';
import { MemoryStoreError } from '../src/memory-store.mjs';
import { ToolForgeStoreError } from '../src/tool-forge-store.mjs';
import { WorkspaceFileError } from '../src/workspace-files.mjs';

// `talosLavoraFn` finto: agent-service.mjs non deve mai far girare un vero
// talosLavora per essere provato — quello ha già i suoi 65 test in
// AVM-harness. Qui si prova SOLO la traduzione: quali eventi arrivano, in
// che ordine, con quali campi.
//
// ⛔ 27/8 — `esisteva` (terzo argomento di onScrittura) ora arriva SEMPRE da
// talosLavora stesso (letto dal disco vero, mai una approssimazione qui
// dentro — vedi talosHarness.mjs, premessaDellaScrittura): questo finto deve
// dichiararlo esplicitamente in ogni voce di `scritture`, non può più
// inventarlo, esattamente come il vero talosLavora non lo inventa.

function talosLavoraFinto({ script, cattura = () => {} }) {
  return async (input) => {
    cattura(input);
    if (script.tipo === 'lancia') throw script.errore;
    // ⭐ 27/8, R1 — i delta (se il finto ne dichiara) arrivano PRIMA della
    // risposta finale del giro, come nel vero talosLavora (onDelta durante
    // lo stream, onGiro dopo che chiamaConRitenta è tornata).
    for (const delta of script.deltas ?? []) input.onDelta?.(delta);
    input.onGiro?.({
      tipo: 'risposta', giro: 0, risposta: script.risposta ?? { role: 'assistant', content: 'ciao', tool_calls: [] },
      // ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 — come nel
      // vero talosHarness.mjs, ENTRAMBI i campi sono assenti quando lo script
      // non li dichiara (mai {usage:undefined}), stessa forma additiva.
      ...(script.usageGiro ? { usage: script.usageGiro } : {}),
      ...(script.totaliGiro ? { totali: script.totaliGiro } : {}),
    });
    for (const scrittura of script.scritture ?? []) {
      input.onScrittura?.(scrittura.percorso, scrittura.contenuto, scrittura.esisteva, scrittura.contenutoPrima);
    }
    for (const toolEsito of script.toolEsiti ?? []) {
      input.onGiro?.({ tipo: 'tool-esito', giro: 0, toolCallId: toolEsito.toolCallId, content: toolEsito.content });
    }
    // ⭐⭐⭐ 28/8 — come per onScrittura sopra: il finto chiama onArtefatto ESATTAMENTE come farebbe il kernel vero (talosHarness.mjs), risultato incluso.
    for (const artefatto of script.artefatti ?? []) {
      await input.onArtefatto?.(artefatto.titolo, artefatto.html);
    }
    // ⭐⭐⭐ 28/8 — stesso principio, per onDocumento: il finto passa gli argomenti grezzi COSÌ COME li manderebbe il modello (nessuna forma diversa qui rispetto al kernel vero).
    for (const documento of script.documenti ?? []) {
      /*
       * ⛔ BC-11 (11/09/2026) — il risultato di `onDocumento` torna a chi lo chiede (`raccogli`).
       *   Il finto lo buttava, e per BC-11 QUELLO È L'OGGETTO DELLA PROVA: l'esito dell'attrezzo è
       *   l'unico canale con cui l'harness può insegnare al modello la mossa successiva (lo schema
       *   di document_create vive nel kernel e non nomina `mode`). Chi non passa `raccogli` non
       *   vede nessuna differenza.
       */
      const esitoDocumento = await input.onDocumento?.(documento.argomenti);
      documento.raccogli?.(esitoDocumento);
    }
    // ⭐⭐⭐ 29/8 — FASE H, stesso principio di onDocumento appena sopra, per onImmagine.
    for (const immagine of script.immagini ?? []) {
      await input.onImmagine?.(immagine.argomenti);
    }
    return script.esito;
  };
}

const TASK = { consegna: 'fai qualcosa' };

/*
 * ⛔⛔ (16/09/2026) — la Libreria FINTA per i test che oggi la lasciano reale. Misurato: ogni test
 * con script `documenti:`/`artefatti:`/`immagini:` e `cartella:'/tmp/x'` senza questa iniezione
 * depositava DAVVERO in `C:\tmp\x\.harness-ui-library` — 2426 voci contate sul disco (Grafico.html,
 * Prova.md/.docx, «un gatto rosso».png, x.png, Nuovo.md, Lungo.md, R.pdf: un nome per test
 * colpevole, tutti riconosciuti al contatore). Il deposito in Libreria è un effetto collaterale
 * mai inteso di questi test: si finge come ogni altra porta di scrittura. (La prassi esisteva già:
 * i test «l'immagine finisce in LIBRERIA» qui sotto iniettano da sempre.)
 */
function libreriaFinta() {
  const depositi = [];
  return {
    depositi,
    salvaVoceLibreriaFn: async (voce) => { depositi.push(voce); return { id: 'lib-finto' }; },
  };
}

test('avviaSessione emette RunStarted per PRIMO, con threadId/runId nuovi e l\'input del task', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } } });

  const risultato = await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn,
  });

  assert.equal(eventi[0].type, 'RunStarted');
  assert.equal(eventi[0].threadId, risultato.threadId);
  assert.equal(eventi[0].runId, risultato.runId);
  assert.deepEqual(eventi[0].input, TASK);
  assert.ok(risultato.threadId && risultato.runId, 'entrambi gli id devono esistere');
  assert.notEqual(risultato.threadId, risultato.runId, 'thread e run sono concetti diversi, id diversi');
});

test('onGiro "risposta" viene tradotto e inoltrato nell\'ordine (testo, poi eventuali tool)', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } } });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });

  const tipi = eventi.map((e) => e.type);
  assert.deepEqual(tipi, ['RunStarted', 'TextMessageStart', 'TextMessageContent', 'TextMessageEnd', 'RunFinished']);
  assert.equal(eventi[2].delta, 'ciao');
});

/*
 * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 — il
 * contatore costo/token per una sessione VIVA. `evento.totali` (già una
 * somma cumulativa da talosHarness.mjs) diventa un unico StateDelta
 * /usage, DOPO gli eventi di quel giro — mai prima, un consumer deve
 * vedere prima il testo/tool-call, poi il totale aggiornato.
 */
test('onGiro "risposta" con totali presenti emette StateDelta /usage, DOPO gli eventi del giro', async () => {
  const eventi = [];
  const totaliGiro = { prompt_tokens: 900, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 50 }, giri: 1 };
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, totaliGiro } });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });

  const tipi = eventi.map((e) => e.type);
  assert.deepEqual(tipi, ['RunStarted', 'TextMessageStart', 'TextMessageContent', 'TextMessageEnd', 'StateDelta', 'RunFinished']);
  assert.deepStrictEqual(eventi[4].delta, [{ op: 'replace', path: '/usage', value: totaliGiro }]);
});

test('⛔ AL CONTRARIO: onGiro "risposta" SENZA totali (script non li dichiara) non emette nessuno StateDelta — mai un contatore inventato', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } } });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });

  assert.ok(!eventi.some((e) => e.type === 'StateDelta'), 'nessun evento StateDelta quando talosHarness.mjs non ha mai riportato usage');
});

test('⭐⭐⭐ RunFinished porta esito.usage nel result, quando talosLavora lo riporta', async () => {
  const eventi = [];
  const usage = { prompt_tokens: 900, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 50 }, giri: 3 };
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto', usage } } });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });

  const runFinished = eventi.find((e) => e.type === 'RunFinished');
  assert.deepStrictEqual(runFinished.result.usage, usage);
});

test('⛔ AL CONTRARIO: RunFinished porta usage:null quando talosLavora non lo riporta (esito.usage assente) — mai undefined, mai un valore inventato', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } } });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });

  const runFinished = eventi.find((e) => e.type === 'RunFinished');
  assert.equal(runFinished.result.usage, null);
});

/*
 * ⭐⭐⭐ R1 — piano `elegant-spinning-dongarra.md`, sezione "RICOGNIZIONE
 * COMPETITIVA" (27/8). `onDelta` arriva DURANTE il giro (prima di
 * onGiro('risposta')) — qui si prova che agent-service.mjs lo traduce in
 * Text/ReasoningMessage Start, N Content, End VERI, e — cruciale — che il
 * testo finale di eventiPerRisposta NON lo ripete: stessa famiglia del
 * difetto "RunFinished ripeteva l'intera risposta" già chiuso stanotte.
 */
test('⭐⭐⭐ onDelta "testo" produce TextMessageStart/Content*/End dal vivo, e la risposta finale NON lo ripete', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({
    script: {
      esito: { comeFinita: 'concluso', detto: 'fatto' },
      deltas: [{ giro: 0, tipo: 'testo', delta: 'Cia' }, { giro: 0, tipo: 'testo', delta: 'o!' }],
      risposta: { role: 'assistant', content: 'Ciao!', tool_calls: [] },
    },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });

  const tipi = eventi.map((e) => e.type);
  assert.deepEqual(tipi, ['RunStarted', 'TextMessageStart', 'TextMessageContent', 'TextMessageContent', 'TextMessageEnd', 'RunFinished'],
    'un SOLO Start/End per giro, un Content per delta — la risposta finale non aggiunge un secondo blocco di testo');
  assert.equal(eventi[2].delta, 'Cia');
  assert.equal(eventi[3].delta, 'o!');
  const messageIdStart = eventi[1].messageId;
  assert.equal(eventi[2].messageId, messageIdStart, 'stesso messageId per tutti i pezzi dello stesso giro');
  assert.equal(eventi[4].messageId, messageIdStart, 'End chiude lo STESSO messaggio aperto da Start');
});

test('⭐⭐ onDelta "ragionamento" produce ReasoningMessage* — un canale SEPARATO dal testo, mai mischiati', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({
    script: {
      esito: { comeFinita: 'concluso', detto: 'fatto' },
      deltas: [
        { giro: 0, tipo: 'ragionamento', delta: 'Penso ' },
        { giro: 0, tipo: 'ragionamento', delta: 'un po.' },
        { giro: 0, tipo: 'testo', delta: '4' },
      ],
      risposta: { role: 'assistant', content: '4', tool_calls: [] },
    },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });

  const tipi = eventi.map((e) => e.type);
  assert.deepEqual(tipi, [
    'RunStarted',
    'ReasoningMessageStart', 'ReasoningMessageContent', 'ReasoningMessageContent',
    'TextMessageStart', 'TextMessageContent',
    'TextMessageEnd', 'ReasoningMessageEnd', // testo chiuso prima, poi ragionamento — ordine deterministico di agent-service.mjs
    'RunFinished',
  ]);
  assert.equal(eventi.find((e) => e.type === 'ReasoningMessageStart').role, 'reasoning');
});

test('⭐⭐⭐ e AL CONTRARIO: le tool-call restano emesse anche se il testo di quel giro era già streamato', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({
    script: {
      esito: { comeFinita: 'concluso', detto: 'fatto' },
      deltas: [{ giro: 0, tipo: 'testo', delta: 'Uso un attrezzo.' }],
      risposta: {
        role: 'assistant', content: 'Uso un attrezzo.',
        tool_calls: [{ id: 'c1', function: { name: 'leggi', arguments: '{"percorso":"a.txt"}' } }],
      },
    },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });

  const tipi = eventi.map((e) => e.type);
  assert.deepEqual(tipi, ['RunStarted', 'TextMessageStart', 'TextMessageContent', 'TextMessageEnd', 'ToolCallStart', 'ToolCallArgs', 'RunFinished'],
    'niente un secondo TextMessage* per il testo, ma la tool-call arriva comunque');
});

/*
 * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 4 — gli
 * argomenti delle tool-call a pezzi, il canale che mancava. Stesso
 * schema del test "ragionamento" sopra: `tool-inizio` una volta,
 * `tool-args` per ogni frammento, e la risposta finale NON li ripete
 * (toolCallsGiaStreamate salta l'id già visto).
 */
test('⭐⭐⭐ onDelta "tool-inizio"/"tool-args" produce ToolCallStart/Args LIVE, e la risposta finale non li ripete', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({
    script: {
      esito: { comeFinita: 'concluso', detto: 'fatto' },
      deltas: [
        { giro: 0, tipo: 'tool-inizio', indice: 0, toolCallId: 'c1', nome: 'leggi' },
        { giro: 0, tipo: 'tool-args', indice: 0, toolCallId: 'c1', delta: '{"percorso":"a.' },
        { giro: 0, tipo: 'tool-args', indice: 0, toolCallId: 'c1', delta: 'txt"}' },
      ],
      risposta: {
        role: 'assistant', content: '',
        tool_calls: [{ id: 'c1', function: { name: 'leggi', arguments: '{"percorso":"a.txt"}' } }],
      },
    },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });

  const tipi = eventi.map((e) => e.type);
  assert.deepEqual(tipi, ['RunStarted', 'ToolCallStart', 'ToolCallArgs', 'ToolCallArgs', 'RunFinished'],
    'niente un secondo ToolCallStart/Args dalla risposta finale — solo quelli live');
  const args = eventi.filter((e) => e.type === 'ToolCallArgs');
  assert.deepEqual(args.map((e) => e.delta), ['{"percorso":"a.', 'txt"}']);
});

test('⭐⭐ e con DUE tool-call nello stesso giro: una streamata live, l\'altra no (es. un fornitore che non manda delta per tutte) — entrambe arrivano, mai duplicate', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({
    script: {
      esito: { comeFinita: 'concluso', detto: 'fatto' },
      deltas: [
        { giro: 0, tipo: 'tool-inizio', indice: 0, toolCallId: 'c1', nome: 'leggi' },
        { giro: 0, tipo: 'tool-args', indice: 0, toolCallId: 'c1', delta: '{}' },
      ],
      risposta: {
        role: 'assistant', content: '',
        tool_calls: [
          { id: 'c1', function: { name: 'leggi', arguments: '{}' } },
          { id: 'c2', function: { name: 'cerca', arguments: '{"q":"x"}' } },
        ],
      },
    },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });

  const startati = eventi.filter((e) => e.type === 'ToolCallStart').map((e) => e.toolCallId);
  assert.deepEqual(startati, ['c1', 'c2'], 'c1 arriva dal canale live, c2 dalla risposta finale — nessuna delle due si perde o si duplica');
  assert.equal(eventi.filter((e) => e.type === 'ToolCallStart' && e.toolCallId === 'c1').length, 1);
});

test('⛔ e AL CONTRARIO: senza NESSUN delta, il comportamento resta quello di sempre — un solo blocco di testo, dalla risposta finale', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } } });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });

  const tipi = eventi.map((e) => e.type);
  assert.deepEqual(tipi, ['RunStarted', 'TextMessageStart', 'TextMessageContent', 'TextMessageEnd', 'RunFinished']);
});

test('⭐ reasoning passa intatto fino a talosLavora, assente di default', async () => {
  let visto;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { visto = input.reasoning; },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });
  assert.equal(visto, undefined, 'senza che il chiamante lo chieda, nessun reasoning');

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, reasoning: { effort: 'high' } });
  assert.deepEqual(visto, { effort: 'high' });
});

test('⭐ onDelta è SEMPRE passato a talosLavora (streaming del testo a costo zero), anche senza reasoning', async () => {
  let visto;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { visto = typeof input.onDelta; },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });
  assert.equal(visto, 'function');
});

test('onGiro "tool-esito" diventa ToolCallResult', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({
    script: {
      esito: { comeFinita: 'concluso', detto: 'fatto' },
      toolEsiti: [{ toolCallId: 'c1', content: 'exit 0' }],
    },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });

  const risultatoTool = eventi.find((e) => e.type === 'ToolCallResult');
  assert.ok(risultatoTool, 'deve esistere un ToolCallResult');
  assert.equal(risultatoTool.toolCallId, 'c1');
  assert.equal(risultatoTool.content, 'exit 0');
});

test('onScrittura: "esisteva" (letto DA talosLavora, non da questo file) sceglie "add" o "replace" nel delta', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({
    script: {
      esito: { comeFinita: 'concluso', detto: 'fatto' },
      scritture: [
        { percorso: 'a.ts', contenuto: 'v1', esisteva: false },
        { percorso: 'a.ts', contenuto: 'v2', esisteva: true },
        { percorso: 'b.ts', contenuto: 'v1', esisteva: false },
      ],
    },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });

  const delte = eventi.filter((e) => e.type === 'StateDelta').map((e) => e.delta[0]);
  assert.deepEqual(delte, [
    { op: 'add', path: '/file/a.ts', value: 'v1' },
    { op: 'replace', path: '/file/a.ts', value: 'v2' },
    { op: 'add', path: '/file/b.ts', value: 'v1' },
  ]);
});

test('onScrittura: contenutoPrima (quarto argomento, letto DA talosLavora) arriva fino al delta come "prima" — 27/8, il formattatore diff', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({
    script: {
      esito: { comeFinita: 'concluso', detto: 'fatto' },
      scritture: [
        { percorso: 'a.ts', contenuto: 'v1', esisteva: false, contenutoPrima: null },
        { percorso: 'a.ts', contenuto: 'v2', esisteva: true, contenutoPrima: 'v1' },
      ],
    },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });

  const delte = eventi.filter((e) => e.type === 'StateDelta').map((e) => e.delta[0]);
  assert.deepEqual(delte, [
    { op: 'add', path: '/file/a.ts', value: 'v1', prima: null },
    { op: 'replace', path: '/file/a.ts', value: 'v2', prima: 'v1' },
  ], 'il "prima" della seconda scrittura è ciò che ha scritto la prima ("v1"), non un valore inventato qui');
});

test('comeFinita "concluso" produce RunFinished con outcome success', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'ho finito', compattazioni: 1, premesseNegate: 0 } },
  });

  const risultato = await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });

  const finale = eventi.at(-1);
  assert.equal(finale.type, 'RunFinished');
  assert.deepEqual(finale.outcome, { type: 'success' });
  assert.equal(finale.result.detto, 'ho finito');
  assert.equal(risultato.ok, true);
});

for (const comeFinita of ['giri-esauriti', 'fermato']) {
  test(`comeFinita "${comeFinita}" produce RunError col code originale, MAI RunFinished`, async () => {
    const eventi = [];
    const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita, detto: `⛔ ${comeFinita}` } } });

    const risultato = await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });

    const finale = eventi.at(-1);
    assert.equal(finale.type, 'RunError');
    assert.equal(finale.code, comeFinita);
    assert.equal(finale.message, `⛔ ${comeFinita}`);
    assert.ok(!eventi.some((e) => e.type === 'RunFinished'), 'un esito non concluso non e mai un successo travestito');
    assert.equal(risultato.ok, false);
  });
}

test('⛔ talosLavora che LANCIA non si propaga: diventa RunError "internal-error", mai un\'eccezione', async () => {
  const eventi = [];
  const erroreVero = new Error('rete giù per davvero');
  const talosLavoraFn = talosLavoraFinto({ script: { tipo: 'lancia', errore: erroreVero } });

  const risultato = await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn });

  const finale = eventi.at(-1);
  assert.equal(finale.type, 'RunError');
  assert.equal(finale.code, 'internal-error');
  assert.equal(finale.message, 'rete giù per davvero');
  assert.equal(risultato.ok, false);
  assert.equal(risultato.esito, null);
  assert.equal(risultato.erroreInterno, 'rete giù per davvero');
});

/*
 * ⛔ 09/09 — misurato in TRE giri veri con glm-5.3-flash: una compattazione del contesto fallita
 * arrivava in chat come carta generica «Il giro si è interrotto per un errore», perché il `code` qui
 * era FISSO a 'internal-error' e la `ContextEngineError` perdeva per strada il suo
 * `CTX_TRUNCATED_SUMMARY`. Il messaggio (già in italiano) sopravviveva; il codice no, e la chat
 * doveva riconoscere l'errore indovinando dalla frase.
 */
test('⛔ il CODICE di un errore che sa dirsi sopravvive: CTX_TRUNCATED_SUMMARY non diventa "internal-error"', async () => {
  const eventi = [];
  const errore = Object.assign(new Error('La sintesi non è stata completata.'), { code: 'CTX_TRUNCATED_SUMMARY' });
  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn: talosLavoraFinto({ script: { tipo: 'lancia', errore } }) });
  const finale = eventi.at(-1);
  assert.equal(finale.type, 'RunError');
  assert.equal(finale.code, 'CTX_TRUNCATED_SUMMARY');
  assert.equal(finale.message, 'La sintesi non è stata completata.');
});

/*
 * ⛔ AL CONTRARIO, e sono i due casi che tengono in piedi il commento del `catch`: un throw resta un
 * guasto del SERVIZIO, e non deve poter fingersi un esito del TASK passando per il `.code` di
 * un'eccezione qualunque. Né può finire in chat una frase intera travestita da codice.
 */
test('⛔ AL CONTRARIO: un errore interno non si traveste da esito del task, e una frase non è un codice', async () => {
  const casi = [
    [Object.assign(new Error('boom'), { code: 'fermato' }), 'internal-error'],
    [Object.assign(new Error('boom'), { code: 'giri-esauriti' }), 'internal-error'],
    [Object.assign(new Error('boom'), { code: 'la rete non risponde' }), 'internal-error'],
    [Object.assign(new Error('boom'), { code: '   ' }), 'internal-error'],
    [Object.assign(new Error('boom'), { code: 42 }), 'internal-error'],
    [new Error('boom'), 'internal-error'],
  ];
  for (const [errore, atteso] of casi) {
    const eventi = [];
    await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn: talosLavoraFinto({ script: { tipo: 'lancia', errore } }) });
    assert.equal(eventi.at(-1).code, atteso, `il codice ${JSON.stringify(errore.code)} non deve arrivare in chat`);
  }
});

test('⭐ RunStarted porta il contesto workspace (progetto/cartella/branch), letto PRIMA di emettere l\'evento', async () => {
  const eventi = [];
  const contestoFinto = { progetto: 'listino', cartella: '/tmp/x', branch: null };
  const leggiContestoWorkspaceFn = () => contestoFinto;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } } });

  await avviaSessione({
    cartella: '/tmp/x', task: { ...TASK, progetto: 'listino' }, modello: 'm', chiave: 'k',
    onEvento: (e) => eventi.push(e), talosLavoraFn, leggiContestoWorkspaceFn,
  });

  assert.deepEqual(eventi[0].contesto, { ...contestoFinto, modello: 'm', reasoning: null, permessi: null });
});

test('⛔ 02/09 — RunStarted dichiara il PERMESSO del giro nel contesto (la sessione dell\'owner era stata messa in Read only da un altro client e la UI diceva Full access)', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } } });
  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', permessi: 'Read only',
    onEvento: (e) => eventi.push(e), talosLavoraFn,
    leggiContestoWorkspaceFn: () => ({ progetto: 'p', cartella: '/tmp/x', branch: null }),
  });
  assert.equal(eventi[0].type, 'RunStarted');
  assert.equal(eventi[0].contesto.permessi, 'Read only');
  // AL CONTRARIO: senza etichetta, null dichiarato — mai un default inventato ("Workspace write") che il server non ha scelto.
  const eventiSenza = [];
  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k',
    onEvento: (e) => eventiSenza.push(e), talosLavoraFn,
    leggiContestoWorkspaceFn: () => ({ progetto: 'p', cartella: '/tmp/x', branch: null }),
  });
  assert.equal(eventiSenza[0].contesto.permessi, null);
});

test('RUN-MODEL-TRACE-07 — RunStarted attribuisce modello e reasoning effettivi al singolo turno', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } } });
  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'qwen/qwen3.8-flash', chiave: 'k',
    reasoning: { effort: 'high' }, onEvento: (evento) => eventi.push(evento), talosLavoraFn,
    leggiContestoWorkspaceFn: () => ({ progetto: 'talos', cartella: '/tmp/x', branch: 'lane/test' }),
  });
  assert.deepEqual(eventi[0].contesto, {
    progetto: 'talos', cartella: '/tmp/x', branch: 'lane/test',
    modello: 'qwen/qwen3.8-flash', reasoning: { effort: 'high' }, permessi: null,
  });
});

test('⭐⭐ senza iniezione, il contesto workspace è QUELLO VERO (nessun mock): questo repo ha un branch reale', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } } });
  const quiRepo = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:');

  await avviaSessione({
    cartella: quiRepo, task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn,
  });

  assert.equal(eventi[0].contesto.cartella, quiRepo);
  assert.equal(typeof eventi[0].contesto.branch, 'string');
  assert.ok(eventi[0].contesto.branch.length > 0);
});

test('avviaSessione passa cartella/modello/chiave/comandoProva/segnaleStop/messaggiIniziali/mobile intatti a talosLavora', async () => {
  let catturato = null;
  const controller = new AbortController();
  const messaggiIniziali = [{ role: 'system', content: 's' }];
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });

  await avviaSessione({
    cartella: '/tmp/progetto', task: TASK, modello: 'z-ai/glm-4.7-flash', chiave: 'segreta',
    comandoProva: 'npm run test:unit', segnaleStop: controller.signal, messaggiIniziali, mobile: true,
    onEvento: () => {}, talosLavoraFn,
  });

  assert.equal(catturato.cartella, '/tmp/progetto');
  assert.equal(catturato.modello, 'z-ai/glm-4.7-flash');
  assert.equal(catturato.chiave, 'segreta');
  assert.equal(catturato.comandoProva, 'npm run test:unit');
  assert.equal(catturato.segnaleStop, controller.signal);
  assert.equal(catturato.messaggiIniziali, messaggiIniziali);
  // ⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 — talosLavora
  // riceve 'mobile' così com'è, senza che questo file lo interpreti.
  assert.equal(catturato.mobile, true);
});

test('⛔ AL CONTRARIO: senza mobile, talosLavora riceve mobile:false — il comportamento desktop di sempre', async () => {
  let catturato = null;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });

  assert.equal(catturato.mobile, false);
});

// compattaSessione — "compatta ora" (piano §1.4). Stesso principio delle
// prove sopra: mai una vera chiamata di rete, `fetchDiRete` iniettato.

test('compattaSessione costruisce un chiamaModello wired a chiamaConRitenta con modello/chiave/fetchDiRete giusti', async () => {
  const messaggiFinali = [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }];
  let corpoCatturato = null;
  let autenticazioneCatturata = null;
  let urlCatturato = null;
  const fetchDiRete = async (url, init) => {
    urlCatturato = url;
    corpoCatturato = JSON.parse(init.body);
    autenticazioneCatturata = init.headers.Authorization;
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'riassunto vero' } }],
        usage: { total_tokens: 42 },
      }),
    };
  };
  let chiamaModelloRicevuto = null;
  const compattaConversazioneFn = async (messaggi, chiamaModello) => {
    chiamaModelloRicevuto = chiamaModello;
    const { scelta } = await chiamaModello([...messaggi, { role: 'user', content: 'riassumi' }]);
    return { messaggi: [messaggi[0], messaggi[1], scelta], compattato: true, usage: null };
  };

  const risultato = await compattaSessione({
    messaggiFinali, modello: 'z-ai/glm-4.7-flash', chiave: 'segreta', fetchDiRete, compattaConversazioneFn,
  });

  assert.equal(typeof chiamaModelloRicevuto, 'function', 'compattaConversazioneFn deve ricevere un chiamaModello richiamabile');
  assert.equal(urlCatturato, 'https://openrouter.ai/api/v1/chat/completions', 'stesso endpoint di chiamaConRitenta, nessun proxy nuovo');
  assert.equal(corpoCatturato.model, 'z-ai/glm-4.7-flash');
  assert.deepEqual(corpoCatturato.tools, [], 'nessun tool durante il riassunto: solo testo, come dichiarato in talosHarness.mjs');
  assert.equal(autenticazioneCatturata, 'Bearer segreta');
  assert.equal(risultato.compattato, true);
  assert.equal(risultato.messaggi.at(-1).content, 'riassunto vero');
});

test('⭐ senza compattaConversazioneFn iniettato, usa la funzione VERA di talosHarness.mjs — nessun mock a metà', async () => {
  const messaggiFinali = [{ role: 'system', content: 's' }, { role: 'user', content: 'fai una cosa' }];
  const fetchDiRete = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { role: 'assistant', content: '  Ho fatto X, Y, Z.  ' } }],
      usage: { total_tokens: 12 },
    }),
  });

  const risultato = await compattaSessione({ messaggiFinali, modello: 'm', chiave: 'k', fetchDiRete });

  assert.equal(risultato.compattato, true);
  assert.equal(risultato.messaggi.length, 3, 'sistema + compito originale + il riassunto, come documentato in compattaConversazione');
  assert.equal(risultato.messaggi[0], messaggiFinali[0]);
  assert.equal(risultato.messaggi[1], messaggiFinali[1]);
  assert.match(risultato.messaggi[2].content, /Ho fatto X, Y, Z\./);
});

test('⛔ verso contrario: se il modello rifiuta (401, non ritentabile), compattato:false e i messaggi TORNANO INVARIATI', async () => {
  const messaggiFinali = [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }];
  const fetchDiRete = async () => ({ ok: false, status: 401, text: async () => 'chiave non valida' });

  const risultato = await compattaSessione({ messaggiFinali, modello: 'm', chiave: 'k', fetchDiRete });

  assert.equal(risultato.compattato, false);
  assert.deepEqual(risultato.messaggi, messaggiFinali);
});

// eseguiComandoDiretto — `!comando` nel composer (piano §1.3-BIS.T, seconda
// metà). Mai un vero wsl.exe/spawn in questi test: eseguiComandoSandboxatoFn
// iniettata, come talosLavoraFn sopra.

test('eseguiComandoDiretto emette RunStarted, ToolCallStart/Args, ToolCallResult, RunFinished — in quest\'ordine', async () => {
  const eventi = [];
  const eseguiComandoSandboxatoFn = async (comando, cartella) => {
    assert.equal(comando, 'echo ciao');
    assert.equal(cartella, '/tmp/cartella-sessione');
    return { codice: 0, testo: 'ciao\n', enforcement: 'wsl2' };
  };

  const risultato = await eseguiComandoDiretto({
    cartella: '/tmp/cartella-sessione', comando: 'echo ciao', onEvento: (e) => eventi.push(e), eseguiComandoSandboxatoFn,
  });

  assert.deepEqual(eventi.map((e) => e.type), ['ComandoUtenteIniziato', 'ToolCallStart', 'ToolCallArgs', 'ToolCallResult', 'ComandoUtenteFinito']);
  /* ⛔ Nessun evento del giro del modello, mai: è tutto il punto della riga. */
  assert.equal(eventi.some((e) => e.type === 'RunStarted' || e.type === 'RunFinished'), false,
    '⛔ un comando della persona non apre e non chiude un giro: sette lettori del registro ci credevano');
  assert.equal(eventi[0].comando, 'echo ciao', 'chi legge deve sapere QUALE comando è partito');
  assert.equal(eventi[0].comandoId, eventi[4].comandoId, 'inizio e fine parlano dello stesso comando');
  assert.equal(eventi[1].toolCallName, 'shell', 'lo stesso nome attrezzo che il modello userebbe dentro talosLavora — un solo vocabolario');
  assert.equal(eventi[1].toolCallId, eventi[2].toolCallId, 'ToolCallArgs deve riferirsi allo STESSO toolCallId di ToolCallStart');
  assert.equal(eventi[1].toolCallId, eventi[3].toolCallId, 'e ToolCallResult pure');
  assert.match(eventi[3].content, /exit 0 \[sandbox: wsl2\]/, 'il livello usato e\' dichiarato nel testo, mai taciuto');
  assert.match(eventi[3].content, /ciao/);
  assert.equal(eventi[4].codice, 0);
  assert.equal(eventi[4].enforcement, 'wsl2');
  assert.equal(risultato.ok, true);
  assert.equal(risultato.enforcement, 'wsl2');
});

test('⛔ verso contrario: un\'uscita diversa da zero NON diventa un RunError — solo un\'informazione nel testo, come per "prova"', async () => {
  const eventi = [];
  const eseguiComandoSandboxatoFn = async () => ({ codice: 1, testo: 'comando fallito', enforcement: 'none' });

  await eseguiComandoDiretto({
    cartella: '/tmp/x', comando: 'false', onEvento: (e) => eventi.push(e), eseguiComandoSandboxatoFn,
  });

  const finale = eventi.at(-1);
  /* ⛔ D-10D: l'evento finale non e' piu' RunFinished (un comando della persona non chiude un giro
     del modello), ma la DISTINZIONE che questo test difende vale identica: un'uscita diversa da
     zero e' informazione, non un guasto del servizio. */
  assert.equal(finale.type, 'ComandoUtenteFinito');
  assert.equal(finale.codice, 1, 'e il codice si dice, invece di sparire dentro un esito generico');
  assert.equal(finale.errore, undefined, 'uscita 1 non e la stessa cosa di non e partito: due fatti, due campi');
  assert.equal(eventi.some((e) => e.type === 'RunError'), false);
});

/**
 * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 — il
 * comando diretto (`!comando`) di una sessione mobile deve passare
 * {mobile:true} a eseguiComandoSandboxatoFn, ESATTAMENTE come l'attrezzo
 * `shell` dentro il ciclo (stessa funzione, vedi la doc in agent-service.mjs).
 */
test('eseguiComandoDiretto passa {mobile:true} a eseguiComandoSandboxatoFn quando la sessione è mobile', async () => {
  let opzioniCatturate = null;
  const eseguiComandoSandboxatoFn = async (comando, cartella, opzioni) => {
    opzioniCatturate = opzioni;
    return { codice: 0, testo: '', enforcement: 'adb-shell-on-device' };
  };

  await eseguiComandoDiretto({
    cartella: '/tmp/x', comando: 'pm list packages', onEvento: () => {}, mobile: true, eseguiComandoSandboxatoFn,
  });

  /* ⛔ D-10B: ora c'e' anche `onPezzo` (l'uscita mentre esce). Si prova che `mobile` sia quello
     giusto E che il gancio ci sia — non si allenta l'asserzione a un `mobile` solo, che smetterebbe
     di accorgersi se domani qualcuno passasse un'opzione di troppo. */
  assert.equal(opzioniCatturate.mobile, true);
  assert.equal(typeof opzioniCatturate.onPezzo, 'function', 'D-10B: senza questo l’output torna ad arrivare tutto alla fine');
  /* ⛔ 10/09: si aggiunge `tracciaCartella` — il kernel dice DOVE il comando si e' fermato, cosi'
     il prossimo riparte da li' (il `cd` che non persisteva). L'elenco resta CHIUSO apposta: se
     domani nasce un'altra opzione, questo test la fa vedere invece di lasciarla passare muta. */
  /* ⛔ 11/09: si aggiunge `dove` (D-10F) — dove gira il comando e' una scelta della sessione.
     L'elenco resta CHIUSO apposta: un'opzione nuova la fa vedere invece di lasciarla passare muta. */
  assert.deepEqual(Object.keys(opzioniCatturate).sort(), ['dove', 'mobile', 'onPezzo', 'tracciaCartella']);
  assert.equal(opzioniCatturate.tracciaCartella, true);
});

test('⛔ AL CONTRARIO: senza mobile, eseguiComandoSandboxatoFn riceve {mobile:false} — il comportamento desktop di sempre', async () => {
  let opzioniCatturate = null;
  const eseguiComandoSandboxatoFn = async (comando, cartella, opzioni) => {
    opzioniCatturate = opzioni;
    return { codice: 0, testo: '', enforcement: 'wsl2' };
  };

  await eseguiComandoDiretto({
    cartella: '/tmp/x', comando: 'echo x', onEvento: () => {}, eseguiComandoSandboxatoFn,
  });

  assert.equal(opzioniCatturate.mobile, false);
  assert.equal(typeof opzioniCatturate.onPezzo, 'function');
  /* ⛔ 10/09: si aggiunge `tracciaCartella` — il kernel dice DOVE il comando si e' fermato, cosi'
     il prossimo riparte da li' (il `cd` che non persisteva). L'elenco resta CHIUSO apposta: se
     domani nasce un'altra opzione, questo test la fa vedere invece di lasciarla passare muta. */
  /* ⛔ 11/09: si aggiunge `dove` (D-10F) — dove gira il comando e' una scelta della sessione.
     L'elenco resta CHIUSO apposta: un'opzione nuova la fa vedere invece di lasciarla passare muta. */
  assert.deepEqual(Object.keys(opzioniCatturate).sort(), ['dove', 'mobile', 'onPezzo', 'tracciaCartella']);
  assert.equal(opzioniCatturate.tracciaCartella, true);
});

/*
 * ⭐⭐⭐ 28/8 — owner: "l'harness desktop diventa l'unica chat, con tutti i
 * tool come la generazione di artefatti oppure la ricerca web". Stessa
 * disciplina di prova di onScrittura/onDelta: il finto chiama onArtefatto
 * come farebbe il kernel vero, si prova SOLO la traduzione qui.
 */
test('⭐ avviaSessione inoltra strumentiEstesi/ricercaWeb a talosLavoraFn così come sono', async () => {
  let inputCatturato = null;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { inputCatturato = input; },
  });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    strumentiEstesi: ['web_search', 'artifact_create'], ricercaWeb: { provider: 'tavily', apiKey: 'k' },
  });

  assert.deepEqual(inputCatturato.strumentiEstesi, ['web_search', 'artifact_create']);
  assert.deepEqual(inputCatturato.ricercaWeb, { provider: 'tavily', apiKey: 'k' });
  assert.equal(typeof inputCatturato.onArtefatto, 'function');
});

test('⛔ AL CONTRARIO: senza strumentiEstesi/ricercaWeb, talosLavoraFn li riceve undefined — nessuna invenzione', async () => {
  let inputCatturato = null;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { inputCatturato = input; },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });

  assert.equal(inputCatturato.strumentiEstesi, undefined);
  assert.equal(inputCatturato.ricercaWeb, undefined);
});

/*
 * ⭐⭐⭐ 29/8 — FASE D, firma Ed25519. Stessa disciplina di ricercaWeb due
 * test sopra: si prova SOLO che questo file inoltri il valore così com'è
 * a talosLavoraFn, non la firma stessa (già provata in AVM-harness).
 */
test('⭐⭐⭐ avviaSessione inoltra firma a talosLavoraFn così com\'è', async () => {
  let inputCatturato = null;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { inputCatturato = input; },
  });
  const firma = { chiavePrivata: 'chiave-finta-pem', keyId: 'talos-harness-receipt-test' };

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    firma,
  });

  assert.deepEqual(inputCatturato.firma, firma);
});

test('⛔ AL CONTRARIO — senza firma, talosLavoraFn la riceve undefined: nessuna chiave inventata', async () => {
  let inputCatturato = null;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { inputCatturato = input; },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });

  assert.equal(inputCatturato.firma, undefined);
});

test('⭐⭐⭐ un artefatto creato dal kernel viene salvato E diventa un evento ArtifactCreated senza html (solo id/titolo — vedi artifact-store.mjs)', async () => {
  const eventi = [];
  const salvati = [];
  const html = '<!doctype html><html><body>ciao</body></html>';
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, artefatti: [{ titolo: 'Grafico', html }] },
  });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn,
    salvaArtefattoFn: (id, h) => salvati.push({ id, html: h }),
    ...libreriaFinta(),
  });

  const evento = eventi.find((e) => e.type === 'ArtifactCreated');
  assert.ok(evento, 'un evento ArtifactCreated deve essere emesso');
  assert.equal(evento.titolo, 'Grafico');
  assert.equal('html' in evento, false, 'MAI html nell\'evento — solo id, il frontend lo fetcha via /api/v1/artifacts/:id');
  assert.match(evento.id, /^[0-9a-f-]{36}$/, 'un vero UUID, non l\'id di fallback del kernel');
  assert.equal(salvati.length, 1);
  assert.equal(salvati[0].id, evento.id, 'lo stesso id salvato e nell\'evento');
  assert.equal(salvati[0].html, html, 'html VERO passato al salvataggio, intero');
});

test('⛔⛔⛔ un artefatto oltre il tetto di dimensione NON viene salvato e NON emette un evento', async () => {
  const eventi = [];
  const salvati = [];
  const htmlEnorme = `<!doctype html><html><body>${'x'.repeat(400_001)}</body></html>`;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, artefatti: [{ titolo: 'Troppo grande', html: htmlEnorme }] },
  });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn,
    salvaArtefattoFn: (id, h) => salvati.push({ id, html: h }),
  });

  assert.equal(eventi.find((e) => e.type === 'ArtifactCreated'), undefined);
  assert.equal(salvati.length, 0, 'niente salvato: un id-solo di rifiuto non deve lasciare tracce nello store');
});

/*
 * ⭐⭐⭐ 28/8 — document_create: pipeline generate→verify→salva, MAI il
 * passo dopo se quello prima fallisce. Le tre funzioni iniettabili sono
 * finte qui apposta — le vere (document-generator.mjs/workspace-files.mjs,
 * 7 librerie npm) hanno i loro test dedicati, questo file prova SOLO che
 * agent-service.mjs le collega nell'ordine giusto e traduce gli esiti.
 */
test('⭐⭐⭐ document_create: generate→verify→salva, un evento StateDelta con testo VERO per un formato testuale', async () => {
  const eventi = [];
  const bytes = new TextEncoder().encode('# Titolo\ncorpo vero');
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, documenti: [{ argomenti: { format: 'md', title: 'Prova', body: 'x' } }] },
  });

  const risultato = await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn,
    generateTalosDocumentFn: async (spec) => ({ format: spec.format, fileName: 'Prova.md', mediaType: 'text/markdown', bytes }),
    verifyTalosDocumentFn: async () => ({ ok: true, detail: '20 caratteri, 2 righe' }),
    creaFileWorkspaceFn: async ({ nome }) => ({ percorso: nome }),
    ...libreriaFinta(),
  });

  assert.equal(risultato.ok, true);
  const evento = eventi.find((e) => e.type === 'StateDelta');
  assert.ok(evento, 'un evento StateDelta deve essere emesso');
  assert.equal(evento.delta[0].op, 'add');
  assert.equal(evento.delta[0].path, '/file/Prova.md');
  assert.equal(evento.delta[0].value, '# Titolo\ncorpo vero', 'un formato testuale porta il testo VERO, non un placeholder');
});

test('⭐⭐⭐ document_create: un formato BINARIO non mette mai i byte grezzi nell evento — una riga onesta al loro posto', async () => {
  const eventi = [];
  const bytesFinti = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0xfe]); // non UTF-8 valido, come un vero .docx
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, documenti: [{ argomenti: { format: 'docx', title: 'Prova', body: 'x' } }] },
  });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn,
    generateTalosDocumentFn: async () => ({ format: 'docx', fileName: 'Prova.docx', mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: bytesFinti }),
    verifyTalosDocumentFn: async () => ({ ok: true, detail: 'reopened: 1 paragraph' }),
    creaFileWorkspaceFn: async ({ nome }) => ({ percorso: nome }),
    ...libreriaFinta(),
  });

  const evento = eventi.find((e) => e.type === 'StateDelta');
  assert.ok(evento);
  assert.match(evento.delta[0].value, /^\[binary docx file, \d+ bytes\]$/);
});

test('⛔⛔⛔ AL CONTRARIO — document_create: se la verifica fallisce, NIENTE viene salvato e NESSUN evento parte', async () => {
  const eventi = [];
  let salvataChiamata = false;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, documenti: [{ argomenti: { format: 'pdf', title: 'Rotto', body: 'x' } }] },
  });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn,
    generateTalosDocumentFn: async () => ({ format: 'pdf', fileName: 'Rotto.pdf', mediaType: 'application/pdf', bytes: new Uint8Array() }),
    verifyTalosDocumentFn: async () => ({ ok: false, detail: 'the pdf has no pages' }),
    creaFileWorkspaceFn: async () => { salvataChiamata = true; return { percorso: 'mai' }; },
  });

  assert.equal(salvataChiamata, false, 'il salvataggio non deve MAI essere tentato su un documento che ha fallito la verifica');
  assert.equal(eventi.find((e) => e.type === 'StateDelta'), undefined);
});

test('⛔ document_create: un salvataggio fallito (es. nome già esistente) è onesto, mai un successo inventato', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, documenti: [{ argomenti: { format: 'csv', title: 'Duplicato', rows: [['a']] } }] },
  });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn,
    generateTalosDocumentFn: async () => ({ format: 'csv', fileName: 'Duplicato.csv', mediaType: 'text/csv', bytes: new TextEncoder().encode('a') }),
    verifyTalosDocumentFn: async () => ({ ok: true, detail: '1 riga' }),
    creaFileWorkspaceFn: async () => { throw new WorkspaceFileError('Esiste già un file con questo nome', 'FILE_EXISTS'); },
  });

  assert.equal(eventi.find((e) => e.type === 'StateDelta'), undefined, 'nessun evento su un salvataggio fallito');
});

/*
 * ⭐⭐⭐ 29/8 — FASE H, generate_image: pipeline genera→salva, mirror di
 * document_create sopra — MA senza un passo "verify" separato:
 * generaImmagineFn stessa lancia su una risposta malformata (vedi
 * image-generator.mjs, TALOS_IMAGE_*), quindi il primo try copre già
 * generazione+parsing. Le funzioni iniettabili sono finte qui apposta —
 * le vere hanno i loro test dedicati in image-generator.test.mjs.
 */
const IMMAGINE_CONFIG = Object.freeze({ modello: 'bytedance-seed/seedream-4.5', nativo: false });

test('⭐⭐⭐ generate_image: genera→salva, un evento StateDelta con una riga ONESTA (mai i byte grezzi — un\'immagine non è UTF-8)', async () => {
  const eventi = [];
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // firma PNG vera, non testo
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, immagini: [{ argomenti: { prompt: 'un gatto rosso', shape: 'square' } }] },
  });

  const risultato = await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn,
    immagine: IMMAGINE_CONFIG,
    generaImmagineFn: async () => ({ mediaType: 'image/png', bytes, fileStem: 'un gatto rosso' }),
    creaFileWorkspaceFn: async ({ nome }) => ({ percorso: nome }),
    ...libreriaFinta(),
  });

  assert.equal(risultato.ok, true);
  const evento = eventi.find((e) => e.type === 'StateDelta');
  assert.ok(evento, 'un evento StateDelta deve essere emesso');
  assert.equal(evento.delta[0].op, 'add');
  assert.equal(evento.delta[0].path, '/file/un gatto rosso.png');
  assert.match(evento.delta[0].value, /^\[image image\/png, 4 bytes\]$/, 'mai i byte grezzi — un\'immagine non è testo UTF-8');
});

/*
 * ⛔⛔ 10/09, owner: «OGNI artefatto va salvato in libreria». Misurato prima di curare: la copia in
 * Libreria era chiamata DUE volte in questo file — artefatto HTML e documento — e l'immagine
 * generata non era nessuna delle due: finiva solo nel workspace, e chi riapriva la sessione domani
 * non la ritrovava fra le cose prodotte.
 * ⛔ E l'evento porta l'allegato (PO-05), o in chat resta una riga onesta e inservibile, senza
 * nessun modo di avere il file.
 */
test('⛔ generate_image: l’immagine finisce in LIBRERIA (base64, mai testo) e l’evento porta l’allegato', async () => {
  const eventi = [];
  const inLibreria = [];
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]); // firma PNG vera
  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e),
    talosLavoraFn: talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, immagini: [{ argomenti: { prompt: 'un gatto rosso', shape: 'square' } }] } }),
    immagine: IMMAGINE_CONFIG,
    generaImmagineFn: async () => ({ mediaType: 'image/png', bytes, fileStem: 'un gatto rosso' }),
    creaFileWorkspaceFn: async ({ nome }) => ({ percorso: nome }),
    salvaVoceLibreriaFn: async (voce) => { inLibreria.push(voce); return { id: 'lib-1' }; },
  });

  assert.equal(inLibreria.length, 1, 'l’immagine generata è un artefatto: in Libreria ci va');
  assert.equal(inLibreria[0].nome, 'un gatto rosso.png');
  assert.equal(inLibreria[0].mediaType, 'image/png');
  assert.equal(inLibreria[0].origine, 'generated');
  assert.equal(inLibreria[0].base64, Buffer.from(bytes).toString('base64'), 'i byte VERI, in base64');
  assert.equal(inLibreria[0].testo, undefined, '⛔ un PNG in un campo di testo si corromperebbe');

  const delta = eventi.find((e) => e.type === 'StateDelta').delta[0];
  assert.deepEqual(delta.allegato, { nome: 'un gatto rosso.png', formato: 'png', byte: 6 },
    'nome, formato e byte MISURATI: senza, la chat non può costruire il collegamento');
});

test('⛔ AL CONTRARIO — se la Libreria non è scrivibile, il giro NON fallisce e l’immagine resta nel workspace', async () => {
  const eventi = [];
  const risultato = await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e),
    talosLavoraFn: talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, immagini: [{ argomenti: { prompt: 'x', shape: 'square' } }] } }),
    immagine: IMMAGINE_CONFIG,
    generaImmagineFn: async () => ({ mediaType: 'image/png', bytes: new Uint8Array([0x89, 0x50]), fileStem: 'x' }),
    creaFileWorkspaceFn: async ({ nome }) => ({ percorso: nome }),
    salvaVoceLibreriaFn: async () => { throw new Error('disco pieno'); },
  });
  /* ⛔ Meglio un'immagine senza copia che un giro rotto per una copia: stessa scelta già fatta per
     l'artefatto HTML e per il documento. */
  assert.equal(risultato.ok, true, 'il giro arriva in fondo');
  assert.ok(eventi.some((e) => e.type === 'StateDelta' && e.delta[0].path === '/file/x.png'), 'e l’immagine è nel workspace');
});

test('⭐⭐⭐ generate_image: generaImmagineFn riceve prompt/shape VERI del modello, e modello/nativo/chiave dalla config di sessione', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, immagini: [{ argomenti: { prompt: 'una montagna innevata', shape: 'landscape' } }] },
  });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'chiave-vera', onEvento: () => {}, talosLavoraFn,
    immagine: { modello: 'google/gemini-3.1-flash-image', nativo: true },
    generaImmagineFn: async (spec) => { catturato = spec; return { mediaType: 'image/png', bytes: new Uint8Array([1]), fileStem: 'x' }; },
    creaFileWorkspaceFn: async ({ nome }) => ({ percorso: nome }),
    ...libreriaFinta(),
  });

  assert.deepEqual(catturato, {
    prompt: 'una montagna innevata', shape: 'landscape', modello: 'google/gemini-3.1-flash-image', nativo: true, chiave: 'chiave-vera',
  });
});

test('⛔⛔⛔ AL CONTRARIO — generate_image: se generaImmagineFn lancia (es. errore a monte), NIENTE viene salvato e NESSUN evento parte', async () => {
  const eventi = [];
  let salvataChiamata = false;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, immagini: [{ argomenti: { prompt: 'x' } }] },
  });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn,
    immagine: IMMAGINE_CONFIG,
    generaImmagineFn: async () => { throw new Error('TALOS_IMAGE_UPSTREAM_ERROR: 402 insufficient credit'); },
    creaFileWorkspaceFn: async () => { salvataChiamata = true; return { percorso: 'mai' }; },
  });

  assert.equal(salvataChiamata, false, 'il salvataggio non deve MAI essere tentato se la generazione è fallita');
  assert.equal(eventi.find((e) => e.type === 'StateDelta'), undefined);
});

test('⛔ generate_image: un salvataggio fallito (es. nome già esistente) è onesto, mai un successo inventato', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, immagini: [{ argomenti: { prompt: 'duplicato' } }] },
  });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn,
    immagine: IMMAGINE_CONFIG,
    generaImmagineFn: async () => ({ mediaType: 'image/png', bytes: new Uint8Array([1]), fileStem: 'duplicato' }),
    creaFileWorkspaceFn: async () => { throw new WorkspaceFileError('Esiste già un file con questo nome', 'FILE_EXISTS'); },
  });

  assert.equal(eventi.find((e) => e.type === 'StateDelta'), undefined, 'nessun evento su un salvataggio fallito');
});

test('⛔⛔ AL CONTRARIO — generate_image: immagine assente (config non wireata): messaggio onesto, generaImmagineFn MAI chiamata', async () => {
  let chiamata = false;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, immagini: [{ argomenti: { prompt: 'x' } }] },
  });

  const risultato = await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    generaImmagineFn: async () => { chiamata = true; return { mediaType: 'image/png', bytes: new Uint8Array([1]), fileStem: 'x' }; },
  });

  assert.equal(risultato.ok, true, 'una config mancante non deve impedire alla sessione di concludere');
  assert.equal(chiamata, false, 'senza `immagine` generaImmagineFn non va MAI chiamata, mai un tentativo con un modello indovinato');
});

test('P0.4 generate_image usa il recupero durevole prima della copia nel workspace e passa hash/source reali', async () => {
  let persistito;
  const bytes = Buffer.from([137, 80, 78, 71]);
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, immagini: [{ argomenti: { prompt: 'un gatto rosso', shape: 'square' } }] },
  });
  const risultato = await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    immagine: IMMAGINE_CONFIG,
    generaImmagineFn: async () => ({ mediaType: 'image/png', bytes, fileStem: 'gatto' }),
    persistGeneratedImageFn: async (spec) => { persistito = spec; return { id: 'recovery-1' }; },
    creaFileWorkspaceFn: async ({ nome }) => ({ percorso: nome }),
    ...libreriaFinta(),
  });
  assert.equal(risultato.ok, true);
  assert.equal(persistito.mimeType, 'image/png');
  assert.deepEqual([...persistito.bytes], [...bytes]);
  assert.equal(persistito.source, 'openrouter/bytedance-seed/seedream-4.5');
  assert.match(persistito.promptHash, /^[a-f0-9]{64}$/u);
});

test('P0.4 AL CONTRARIO — se il recupero durevole fallisce non viene dichiarato un salvataggio riuscito e il workspace resta intatto', async () => {
  let workspaceChiamato = false;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, immagini: [{ argomenti: { prompt: 'x' } }] },
  });
  const risultato = await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    immagine: IMMAGINE_CONFIG,
    generaImmagineFn: async () => ({ mediaType: 'image/png', bytes: Buffer.from([1]), fileStem: 'x' }),
    persistGeneratedImageFn: async () => { throw new Error('storage unavailable'); },
    creaFileWorkspaceFn: async () => { workspaceChiamato = true; return { percorso: 'x.png' }; },
  });
  assert.equal(workspaceChiamato, false);
  assert.equal(risultato.ok, true, 'il tool ha fallito in modo controllato, la sessione non deve andare in crash');
});

/*
 * ⭐⭐⭐ 29/8 — FASE K, R2 planner costoso + editor economico. Questo
 * file resta un adattatore puro: `modelloPlanner` viaggia SENZA logica
 * propria fino a talosLavoraFn — il pre-loop, il gate di sola
 * lettura, il filtro degli attrezzi vivono tutti nel kernel.
 */
test('⭐⭐⭐ PARITÀ — modelloPlanner arriva a talosLavoraFn ESATTAMENTE come passato, senza trasformazione', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'editor-economico', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    modelloPlanner: 'planner-costoso',
  });

  assert.equal(catturato.modelloPlanner, 'planner-costoso');
  assert.equal(catturato.modello, 'editor-economico', 'modello resta il campo dell\'editor, invariato');
});

test('⛔ AL CONTRARIO — modelloPlanner assente arriva undefined a talosLavoraFn, mai un valore inventato', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });

  assert.equal(catturato.modelloPlanner, undefined);
});

/*
 * ⭐⭐⭐ 28/8 — LA PILLOLA PERMESSI: questo file resta un adattatore puro,
 * `livelloAccesso`/`chiediApprovazioneFn` viaggiano SENZA logica propria
 * fino a talosLavoraFn — la decisione COSA rifiutare vive tutta nel
 * kernel (talosHarness.mjs, verificaPermessoScrittura).
 */
test('⭐⭐⭐ PARITÀ — livelloAccesso/chiediApprovazioneFn arrivano a talosLavoraFn ESATTAMENTE come passati, senza trasformazione', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const chiediApprovazioneFn = async () => true;

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    livelloAccesso: 'lettura', chiediApprovazioneFn,
  });

  assert.equal(catturato.livelloAccesso, 'lettura');
  assert.equal(catturato.chiediApprovazioneFn, chiediApprovazioneFn, 'STESSA funzione, non una copia/wrapper');
});

test('⛔ AL CONTRARIO — livelloAccesso/chiediApprovazioneFn assenti arrivano undefined a talosLavoraFn, mai un valore inventato', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });

  assert.equal(catturato.livelloAccesso, undefined);
  assert.equal(catturato.chiediApprovazioneFn, undefined);
});

/*
 * ⭐⭐⭐ 28/8 — FASE A (hook), stesso principio dei due test sopra: questo
 * file resta un adattatore puro, `hookFn` viaggia SENZA trasformazione
 * fino a talosLavoraFn — la decisione (quale hook fidato blocca cosa)
 * vive tutta in session-registry.mjs (costruisciHookFn) e nel kernel.
 * Chiude il gap dichiarato in LEDGER-FASE-A-HOOKS.md: prima di questo
 * commit `hookFn` non era nemmeno un parametro di avviaSessione, quindi
 * una sessione reale lo avrebbe SEMPRE ignorato in silenzio.
 */
test('⭐⭐⭐ PARITÀ — hookFn arriva a talosLavoraFn ESATTAMENTE come passato, senza trasformazione', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const hookFn = async () => ({ consentito: true });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, hookFn,
  });

  assert.equal(catturato.hookFn, hookFn, 'STESSA funzione, non una copia/wrapper');
});

test('⛔ AL CONTRARIO — hookFn assente arriva undefined a talosLavoraFn, mai un valore inventato', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });

  assert.equal(catturato.hookFn, undefined);
});

/*
 * ⭐⭐⭐ FASE B (28/8) — stesso principio dei due blocchi sopra:
 * `permessiPerAttrezzo` viaggia SENZA trasformazione, la semantica di
 * ogni valore vive nel kernel (verificaPermessoScrittura).
 */
test('⭐⭐⭐ PARITÀ — permessiPerAttrezzo arriva a talosLavoraFn ESATTAMENTE come passato, senza trasformazione', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const permessiPerAttrezzo = { shell: 'chiedi' };

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, permessiPerAttrezzo,
  });

  assert.equal(catturato.permessiPerAttrezzo, permessiPerAttrezzo, 'STESSO oggetto, non una copia');
});

test('⛔ AL CONTRARIO — permessiPerAttrezzo assente arriva undefined a talosLavoraFn, mai un valore inventato', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });

  assert.equal(catturato.permessiPerAttrezzo, undefined);
});

/*
 * ⭐⭐⭐ FASE C (28/8) — sub-agenti: stesso principio dei blocchi sopra,
 * `onDelega` viaggia SENZA trasformazione. Chiude lo STESSO gap che
 * `hookFn` aveva prima di FASE A (un parametro costruito dal
 * chiamante ma mai arrivato fin qui) — non ripetuto, corretto nello
 * stesso commit del resto della fase.
 */
test('⭐⭐⭐ PARITÀ — onDelega arriva a talosLavoraFn ESATTAMENTE come passato, senza trasformazione', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const onDelega = async () => ({ riassunto: 'mai chiamata in questo test', esito: 'concluso' });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, onDelega,
  });

  assert.equal(catturato.onDelega, onDelega, 'STESSA funzione, non un wrapper');
});

test('⛔ AL CONTRARIO — onDelega assente arriva undefined a talosLavoraFn, mai un valore inventato', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });

  assert.equal(catturato.onDelega, undefined);
});

/*
 * ⭐⭐⭐ FASE N, ottavo sistema (30/8) — Deep Research: stesso principio
 * ESATTO dei blocchi onDelega/hookFn/codaMessaggiFn sopra — gli 8
 * onRicerca* viaggiano SENZA trasformazione, costruiti tutti in
 * session-registry.mjs (mai qui). Stesso gap da non ripetere.
 */
const OTTO_CALLBACK_RICERCA = ['onRicercaLista', 'onRicercaAvvia', 'onRicercaLeggi', 'onRicercaRinomina', 'onRicercaPausa', 'onRicercaRiprendi', 'onRicercaAnnulla', 'onRicercaElimina'];

for (const nome of OTTO_CALLBACK_RICERCA) {
  test(`⭐⭐⭐ PARITÀ — ${nome} arriva a talosLavoraFn ESATTAMENTE come passato, senza trasformazione`, async () => {
    let catturato;
    const talosLavoraFn = talosLavoraFinto({
      script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
      cattura: (input) => { catturato = input; },
    });
    const callback = async () => ({ ok: true, esito: 'mai chiamata in questo test' });

    await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, [nome]: callback });

    assert.equal(catturato[nome], callback, 'STESSA funzione, non un wrapper');
  });

  test(`⛔ AL CONTRARIO — ${nome} assente arriva undefined a talosLavoraFn, mai un valore inventato`, async () => {
    let catturato;
    const talosLavoraFn = talosLavoraFinto({
      script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
      cattura: (input) => { catturato = input; },
    });

    await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });

    assert.equal(catturato[nome], undefined);
  });
}

/*
 * ⭐⭐⭐ FASE D (28/8) — coda messaggi: stesso principio dei blocchi sopra,
 * `codaMessaggiFn` viaggia SENZA trasformazione. Stesso gap da non
 * ripetere: un parametro costruito dal chiamante (session-registry.mjs)
 * ma mai arrivato fin qui — aggiunto nello stesso commit del resto
 * della fase, non un secondo giro. Vedi LEDGER-FASE-D-CODA.md.
 */
test('⭐⭐⭐ PARITÀ — codaMessaggiFn arriva a talosLavoraFn ESATTAMENTE come passato, senza trasformazione', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const codaMessaggiFn = () => null;

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, codaMessaggiFn,
  });

  assert.equal(catturato.codaMessaggiFn, codaMessaggiFn, 'STESSA funzione, non un wrapper');
});

test('⛔ AL CONTRARIO — codaMessaggiFn assente arriva undefined a talosLavoraFn, mai un valore inventato', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });

  assert.equal(catturato.codaMessaggiFn, undefined);
});

/*
 * ⭐⭐⭐ FASE E (29/8), seconda metà — mcp-session.mjs collegato dentro
 * avviaSessione(). Investigato prima di scrivere (vedi
 * elegant-spinning-dongarra.md): `avvia()`/`avviaLibero()` in
 * session-registry.mjs restano sincrone, il lavoro asincrono vive QUI,
 * dopo RunStarted e prima di talosLavoraFn — stesso principio PARITÀ
 * di ogni altro parametro di questo file: `cartellaTrustMcp` assente
 * ⇒ zero lavoro nuovo, zero I/O, `preparaToolMcpPerSessioneFn` mai
 * chiamata.
 */
test('⛔⛔⛔ AL CONTRARIO — cartellaTrustMcp assente: preparaToolMcpPerSessioneFn MAI chiamata, toolMcp/chiamaToolMcpFn arrivano undefined', async () => {
  let catturato;
  let chiamataPrepara = false;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const preparaToolMcpPerSessioneFn = async () => { chiamataPrepara = true; return { toolMcp: [], chiamaToolMcpFn: null, falliti: [], chiudiTutti: async () => {} }; };

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, preparaToolMcpPerSessioneFn,
  });

  assert.equal(chiamataPrepara, false, 'senza cartellaTrustMcp non deve esserci NESSUN lavoro MCP, nemmeno un tentativo');
  assert.equal(catturato.toolMcp, undefined);
  assert.equal(catturato.chiamaToolMcpFn, undefined);
});

test('⭐⭐⭐ cartellaTrustMcp presente: preparaToolMcpPerSessioneFn chiamata con {cartella,cartellaTrust}, toolMcp/chiamaToolMcpFn arrivano a talosLavoraFn ESATTAMENTE come risolti', async () => {
  let catturato;
  let argomentiPrepara;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const toolMcpFinto = [{ name: 'mcp__filesystem__read_file', description: 'legge', inputSchema: {} }];
  const chiamaToolMcpFnFinta = async () => ({ content: [], isError: false });
  const preparaToolMcpPerSessioneFn = async (argomenti) => {
    argomentiPrepara = argomenti;
    return { toolMcp: toolMcpFinto, chiamaToolMcpFn: chiamaToolMcpFnFinta, falliti: [], chiudiTutti: async () => {} };
  };

  await avviaSessione({
    cartella: '/tmp/workspace-vero', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    cartellaTrustMcp: '/tmp/mcp-trust', preparaToolMcpPerSessioneFn,
  });

  assert.deepEqual(argomentiPrepara, { cartella: '/tmp/workspace-vero', cartellaTrust: '/tmp/mcp-trust' });
  assert.equal(catturato.toolMcp, toolMcpFinto, 'STESSO array, non una copia');
  assert.equal(catturato.chiamaToolMcpFn, chiamaToolMcpFnFinta, 'STESSA funzione, non un wrapper');
});

test('⭐⭐⭐ chiudiTutti() viene chiamata DAVVERO dopo un run concluso con successo', async () => {
  let chiusa = false;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } } });
  const preparaToolMcpPerSessioneFn = async () => ({ toolMcp: [], chiamaToolMcpFn: null, falliti: [], chiudiTutti: async () => { chiusa = true; } });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    cartellaTrustMcp: '/tmp/mcp-trust', preparaToolMcpPerSessioneFn,
  });

  assert.equal(chiusa, true, 'un server MCP e\' un processo figlio vero — lasciato aperto sarebbe un leak');
});

test('⛔⛔⛔ AL CONTRARIO — chiudiTutti() viene chiamata ANCHE quando talosLavoraFn LANCIA (finally, mai un leak sull\'errore)', async () => {
  let chiusa = false;
  const talosLavoraFn = talosLavoraFinto({ script: { tipo: 'lancia', errore: new Error('rete giù') } });
  const preparaToolMcpPerSessioneFn = async () => ({ toolMcp: [], chiamaToolMcpFn: null, falliti: [], chiudiTutti: async () => { chiusa = true; } });

  const risultato = await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    cartellaTrustMcp: '/tmp/mcp-trust', preparaToolMcpPerSessioneFn,
  });

  assert.equal(risultato.ok, false, 'il percorso d\'errore resta invariato');
  assert.equal(chiusa, true, 'chiudiTutti() deve girare ANCHE sul percorso d\'errore, non solo su quello felice');
});

test('⛔⛔ AL CONTRARIO — RunStarted arriva PRIMA di preparaToolMcpPerSessioneFn, mai dopo (l\'ordine dei bubble non cambia)', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } } });
  const preparaToolMcpPerSessioneFn = async () => {
    eventi.push('mcp-preparato');
    return { toolMcp: [], chiamaToolMcpFn: null, falliti: [], chiudiTutti: async () => {} };
  };

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e.type), talosLavoraFn,
    cartellaTrustMcp: '/tmp/mcp-trust', preparaToolMcpPerSessioneFn,
  });

  assert.equal(eventi[0], 'RunStarted');
  assert.equal(eventi[1], 'mcp-preparato', 'la preparazione MCP deve girare dopo RunStarted, mai prima');
});

/*
 * ⭐⭐⭐ FASE F (29/8), piano elegant-spinning-dongarra.md - skill-registry.mjs
 * collegato dentro avviaSessione(). A differenza di MCP: nessun gate
 * (caricaSkillDisponibiliFn e' SEMPRE chiamata, mai dietro un
 * cartellaTrust...) - vedi la doc del parametro.
 */
test('⭐⭐⭐ caricaSkillDisponibiliFn chiamata SEMPRE con {cartella} esatta, skillsDisponibili/caricaSkillFn arrivano a talosLavoraFn', async () => {
  let catturato;
  let argomentiCarica;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const caricaSkillDisponibiliFn = async (argomenti) => {
    argomentiCarica = argomenti;
    return { skills: [{ id: 'code-review', name: 'code-review', description: 'Revisione in due assi.', corpo: '# Corpo vero' }] };
  };

  await avviaSessione({
    cartella: '/tmp/workspace-vero', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, caricaSkillDisponibiliFn,
  });

  assert.deepEqual(argomentiCarica, { cartella: '/tmp/workspace-vero' });
  assert.deepEqual(catturato.skillsDisponibili, [{ name: 'code-review', description: 'Revisione in due assi.' }]);
  assert.equal(typeof catturato.caricaSkillFn, 'function');
});

test('⭐⭐⭐ caricaSkillFn(nome) torna il corpo VERO della skill corrispondente', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const caricaSkillDisponibiliFn = async () => ({ skills: [{ id: 'code-review', name: 'code-review', description: 'd', corpo: '# Corpo vero, non un placeholder' }] });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, caricaSkillDisponibiliFn });

  const corpo = await catturato.caricaSkillFn('code-review');
  assert.equal(corpo, '# Corpo vero, non un placeholder');
});

test('⛔⭐⭐ AL CONTRARIO — nessuna skill trovata: skillsDisponibili/caricaSkillFn arrivano undefined, mai un array vuoto passato al kernel', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const caricaSkillDisponibiliFn = async () => ({ skills: [] });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, caricaSkillDisponibiliFn });

  assert.equal(catturato.skillsDisponibili, undefined);
  assert.equal(catturato.caricaSkillFn, undefined);
});

test('⛔⛔⛔ AL CONTRARIO — caricaSkillDisponibiliFn che LANCIA (skill malformata) degrada: skillsDisponibili resta undefined, la sessione NON si blocca', async () => {
  let catturato;
  let esitoInEvento;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const caricaSkillDisponibiliFn = async () => { throw new Error('.harness-ui-skills/rotta/SKILL.md manca di "description"'); };

  const risultato = await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k',
    onEvento: (e) => { if (e.type === 'RunFinished') esitoInEvento = e; },
    talosLavoraFn, caricaSkillDisponibiliFn,
  });

  assert.equal(risultato.ok, true, 'una skill malformata non deve impedire alla sessione di concludere');
  assert.equal(catturato.skillsDisponibili, undefined);
  assert.ok(esitoInEvento, 'RunFinished deve comunque arrivare — nessun blocco silenzioso');
});

test('⛔ AL CONTRARIO — RunStarted arriva PRIMA di caricaSkillDisponibiliFn, mai dopo', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } } });
  const caricaSkillDisponibiliFn = async () => { eventi.push('skill-caricata'); return { skills: [] }; };

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e.type), talosLavoraFn, caricaSkillDisponibiliFn,
  });

  assert.equal(eventi[0], 'RunStarted');
  assert.equal(eventi[1], 'skill-caricata');
});

/*
 * ⭐⭐⭐ FASE G (29/8), piano elegant-spinning-dongarra.md - plugin-session.mjs
 * collegato dentro avviaSessione(). Stesso gate esplicito di MCP
 * (cartellaTrustPlugin, non SEMPRE come le skill) - vedi la doc del
 * parametro. In più: gli hook di un plugin fidato si fondono nel
 * `hookFn` passato a talosLavoraFn, un wrapping che questo file (non
 * session-registry.mjs) possiede - vedi la doc su hookFnConPlugin.
 */
test('⛔⛔⛔ AL CONTRARIO — cartellaTrustPlugin assente: preparaToolPluginPerSessioneFn MAI chiamata, toolPlugin/eseguiToolPluginFn arrivano undefined', async () => {
  let catturato;
  let chiamataPrepara = false;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const preparaToolPluginPerSessioneFn = async () => { chiamataPrepara = true; return { toolPlugin: [], eseguiToolPluginFn: null, hookPlugin: [], falliti: [] }; };

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, preparaToolPluginPerSessioneFn,
  });

  assert.equal(chiamataPrepara, false, 'senza cartellaTrustPlugin non deve esserci NESSUN lavoro di plugin, nemmeno un tentativo');
  assert.equal(catturato.toolPlugin, undefined);
  assert.equal(catturato.eseguiToolPluginFn, undefined);
});

test('⭐⭐⭐ cartellaTrustPlugin presente: preparaToolPluginPerSessioneFn chiamata con {cartella,cartellaTrust}, toolPlugin/eseguiToolPluginFn arrivano a talosLavoraFn ESATTAMENTE come risolti', async () => {
  let catturato;
  let argomentiPrepara;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const toolPluginFinto = [{ nome: 'plugin__esempio__conta_righe', descrizione: 'conta', parametri: {} }];
  const eseguiToolPluginFnFinta = async () => '3 righe';
  const preparaToolPluginPerSessioneFn = async (argomenti) => {
    argomentiPrepara = argomenti;
    return { toolPlugin: toolPluginFinto, eseguiToolPluginFn: eseguiToolPluginFnFinta, hookPlugin: [], falliti: [] };
  };

  await avviaSessione({
    cartella: '/tmp/workspace-vero', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    cartellaTrustPlugin: '/tmp/plugin-trust', preparaToolPluginPerSessioneFn,
  });

  assert.deepEqual(argomentiPrepara, { cartella: '/tmp/workspace-vero', cartellaTrust: '/tmp/plugin-trust' });
  assert.equal(catturato.toolPlugin, toolPluginFinto, 'STESSO array, non una copia');
  assert.equal(catturato.eseguiToolPluginFn, eseguiToolPluginFnFinta, 'STESSA funzione, non un wrapper');
});

test('⛔⛔ AL CONTRARIO — RunStarted arriva PRIMA di preparaToolPluginPerSessioneFn, mai dopo', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } } });
  const preparaToolPluginPerSessioneFn = async () => {
    eventi.push('plugin-preparato');
    return { toolPlugin: [], eseguiToolPluginFn: null, hookPlugin: [], falliti: [] };
  };

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e.type), talosLavoraFn,
    cartellaTrustPlugin: '/tmp/plugin-trust', preparaToolPluginPerSessioneFn,
  });

  assert.equal(eventi[0], 'RunStarted');
  assert.equal(eventi[1], 'plugin-preparato', 'la preparazione dei plugin deve girare dopo RunStarted, mai prima');
});

test('⭐⭐⭐ PARITÀ — hookPlugin vuoto (nessun plugin con hook fidato): hookFn arriva a talosLavoraFn come LO STESSO riferimento, zero wrapping', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const hookFnOriginale = async () => ({ consentito: true });
  const preparaToolPluginPerSessioneFn = async () => ({ toolPlugin: [], eseguiToolPluginFn: null, hookPlugin: [], falliti: [] });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    hookFn: hookFnOriginale, cartellaTrustPlugin: '/tmp/plugin-trust', preparaToolPluginPerSessioneFn,
  });

  assert.equal(catturato.hookFn, hookFnOriginale, 'senza hook di plugin, hookFn non deve essere avvolto — stesso riferimento di prima di FASE G');
});

test('⭐⭐⭐ un hook di plugin fidato che RIFIUTA blocca — nessun hookFn standalone', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const hookPluginFinto = [{ id: 'plugin:esempio:blocca-rm', eventi: ['pre_tool_call'], comando: 'echo mai eseguito' }];
  const preparaToolPluginPerSessioneFn = async () => ({ toolPlugin: [], eseguiToolPluginFn: null, hookPlugin: hookPluginFinto, falliti: [] });
  const eventiHook = [];
  const eseguiHookFn = async ({ hook }) => { eventiHook.push(hook.id); return { consentito: false, motivo: 'bloccato dal plugin' }; };

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    cartellaTrustPlugin: '/tmp/plugin-trust', preparaToolPluginPerSessioneFn, eseguiHookFn,
  });

  assert.equal(typeof catturato.hookFn, 'function');
  const esito = await catturato.hookFn({ tipo: 'pre_tool_call', azione: { tipo: 'scrivi' } });
  assert.equal(esito.consentito, false);
  assert.equal(esito.motivo, 'bloccato dal plugin');
  assert.deepEqual(eventiHook, ['plugin:esempio:blocca-rm']);
});

test('⛔⛔⛔ AL CONTRARIO — hookFn standalone che rifiuta: gli hook di plugin NON girano nemmeno (il primo che rifiuta vince)', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const hookPluginFinto = [{ id: 'plugin:esempio:mai-chiamato', eventi: ['pre_tool_call'], comando: 'echo mai' }];
  const preparaToolPluginPerSessioneFn = async () => ({ toolPlugin: [], eseguiToolPluginFn: null, hookPlugin: hookPluginFinto, falliti: [] });
  let eseguiHookFnChiamata = false;
  const eseguiHookFn = async () => { eseguiHookFnChiamata = true; return { consentito: true }; };
  const hookFnOriginale = async () => ({ consentito: false, motivo: 'bloccato dallo standalone' });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    hookFn: hookFnOriginale, cartellaTrustPlugin: '/tmp/plugin-trust', preparaToolPluginPerSessioneFn, eseguiHookFn,
  });

  const esito = await catturato.hookFn({ tipo: 'pre_tool_call', azione: { tipo: 'scrivi' } });
  assert.equal(esito.consentito, false);
  assert.equal(esito.motivo, 'bloccato dallo standalone');
  assert.equal(eseguiHookFnChiamata, false, 'un hook di plugin non deve nemmeno girare se lo standalone ha già rifiutato');
});

test('⭐⭐ hookFn standalone consente, un hook di plugin poi rifiuta: il combinato rifiuta, HookInvoked arriva in evento', async () => {
  let catturato;
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const hookPluginFinto = [{ id: 'plugin:esempio:blocca-rm', eventi: ['pre_tool_call'], comando: 'echo no' }];
  const preparaToolPluginPerSessioneFn = async () => ({ toolPlugin: [], eseguiToolPluginFn: null, hookPlugin: hookPluginFinto, falliti: [] });
  const eseguiHookFn = async () => ({ consentito: false, motivo: 'bloccato dal plugin' });
  const hookFnOriginale = async () => ({ consentito: true });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn,
    hookFn: hookFnOriginale, cartellaTrustPlugin: '/tmp/plugin-trust', preparaToolPluginPerSessioneFn, eseguiHookFn,
  });

  const esito = await catturato.hookFn({ tipo: 'pre_tool_call', azione: { tipo: 'scrivi' } });
  assert.equal(esito.consentito, false);
  const hookInvocatoEvento = eventi.find((e) => e.type === 'HookInvoked');
  assert.ok(hookInvocatoEvento, 'HookInvoked deve arrivare anche per un hook sorgente-plugin, stessa UI del Control-plane');
  assert.equal(hookInvocatoEvento.hookId, 'plugin:esempio:blocca-rm');
});

test('⛔⛔⛔ AL CONTRARIO — eseguiHookFn di un hook di plugin che LANCIA: non autorizza, stessa disciplina di un hook standalone che lancia', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });
  const hookPluginFinto = [{ id: 'plugin:esempio:rotto', eventi: ['pre_tool_call'], comando: 'echo rotto' }];
  const preparaToolPluginPerSessioneFn = async () => ({ toolPlugin: [], eseguiToolPluginFn: null, hookPlugin: hookPluginFinto, falliti: [] });
  const eseguiHookFn = async () => { throw new Error('comando non trovato'); };

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    cartellaTrustPlugin: '/tmp/plugin-trust', preparaToolPluginPerSessioneFn, eseguiHookFn,
  });

  const esito = await catturato.hookFn({ tipo: 'pre_tool_call', azione: { tipo: 'scrivi' } });
  assert.equal(esito.consentito, false, 'un hook di plugin che lancia non autorizza in silenzio — stessa regola di un hook standalone che lancia');
});

/*
 * ⭐⭐⭐ FASE N (29/8), piano elegant-spinning-dongarra.md - library-store.mjs
 * collegato dentro avviaSessione(). A differenza di MCP/plugin (gate
 * esplicito) MA come document_create/generate_image (non come skill,
 * che si costruisce SOLO se trova qualcosa): i quattro callback sono
 * SEMPRE costruiti, incondizionatamente — le 4 voci Libreria sono già
 * nel default `strumentiEstesi` di session-registry.mjs (offerte come
 * ogni altro ATTREZZI_ESTESI a schema fisso), e library-store.mjs
 * stesso degrada onestamente ({pagina:[],totale:0,...}) per un
 * `.harness-ui-library/` assente — non serve un secondo "esiste?" qui.
 */
test('⭐⭐⭐ i 4 callback onLibreria* arrivano SEMPRE a talosLavoraFn, incondizionatamente (a differenza delle skill)', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });

  await avviaSessione({ cartella: '/tmp/senza-libreria', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });

  for (const nome of ['onLibreriaLista', 'onLibreriaCerca', 'onLibreriaLeggi', 'onLibreriaOrigine']) {
    assert.equal(typeof catturato[nome], 'function', `${nome} deve essere sempre una funzione, mai undefined`);
  }
});

test('⭐⭐⭐ onLibreriaLista: cartella VERA passata a elencaVociFn, argomenti del modello tradotti per impaginaVoci', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let argomentiRicevuti;
  const elencaVociFn = async (argomenti) => {
    argomentiRicevuti = argomenti;
    return [{ id: 'lib-1', nome: 'a.md', fileType: 'document', origine: 'uploaded', creatoIl: '2026-08-29T10:00:00.000Z', aggiornatoIl: '2026-08-29T10:00:00.000Z' }];
  };

  await avviaSessione({ cartella: '/tmp/progetto-vero', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, elencaVociFn });

  const risultato = await catturato.onLibreriaLista({ origin: 'uploaded', file_type: 'document', page_size: 5 });
  assert.deepEqual(argomentiRicevuti, { cartella: '/tmp/progetto-vero' });
  assert.equal(risultato.pagina.length, 1);
  assert.equal(risultato.pagina[0].id, 'lib-1');
  assert.equal(risultato.totale, 1);
});

test('⭐⭐ onLibreriaLista: argomenti assenti (il modello chiama senza filtri) ricadono sui default onesti — mai un\'eccezione', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const elencaVociFn = async () => [];

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, elencaVociFn });

  const risultato = await catturato.onLibreriaLista({});
  assert.deepEqual(risultato, { pagina: [], totale: 0, vistiPrima: 0, vistiDopo: 0, nextPageToken: null });
});

test('⭐⭐⭐ onLibreriaLista: lo STESSO cursore vive per l\'intera sessione — un page_token del primo giro funziona nel secondo', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const voci = Array.from({ length: 3 }, (_, i) => ({
    id: `lib-${i}`, nome: `f${i}.md`, fileType: 'document', origine: 'uploaded',
    creatoIl: `2026-08-2${9 - i}T00:00:00.000Z`, aggiornatoIl: `2026-08-2${9 - i}T00:00:00.000Z`,
  }));
  const elencaVociFn = async () => voci;

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, elencaVociFn });

  const prima = await catturato.onLibreriaLista({ page_size: 2 });
  assert.equal(prima.pagina.length, 2);
  assert.ok(prima.nextPageToken);
  const seconda = await catturato.onLibreriaLista({ page_size: 2, page_token: prima.nextPageToken });
  assert.equal(seconda.pagina.length, 1);
  assert.equal(seconda.pagina[0].id, 'lib-2');
});

test('⭐⭐⭐ onLibreriaCerca: legge elencaVociConTestoFn (non elencaVociFn), query tradotta per cercaVoci', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let argomentiRicevuti;
  const elencaVociConTestoFn = async (argomenti) => {
    argomentiRicevuti = argomenti;
    return [{ id: 'lib-1', nome: 'fattura.md', origine: 'uploaded', testoEstratto: 'contenuto vero' }];
  };
  const elencaVociFn = async () => { throw new Error('library_search non deve MAI chiamare elencaVociFn (metadata-only) — deve leggere il testo'); };

  await avviaSessione({ cartella: '/tmp/progetto-vero', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, elencaVociFn, elencaVociConTestoFn });

  const risultato = await catturato.onLibreriaCerca({ query: 'fattura', limit: 3 });
  assert.deepEqual(argomentiRicevuti, { cartella: '/tmp/progetto-vero' });
  assert.equal(risultato.pagina.length, 1);
  assert.equal(risultato.pagina[0].id, 'lib-1');
});

test('⭐⭐⭐ onLibreriaLeggi: id del modello passato a leggiVoceFn con la cartella VERA', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let argomentiRicevuti;
  const leggiVoceFn = async (argomenti) => { argomentiRicevuti = argomenti; return { nome: 'a.md', mediaType: 'text/markdown', origine: 'uploaded', testo: 'contenuto vero' }; };

  await avviaSessione({ cartella: '/tmp/progetto-vero', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, leggiVoceFn });

  const risultato = await catturato.onLibreriaLeggi({ id: 'lib-42' });
  assert.deepEqual(argomentiRicevuti, { cartella: '/tmp/progetto-vero', id: 'lib-42' });
  assert.equal(risultato.testo, 'contenuto vero');
});

test('⭐⭐⭐ onLibreriaOrigine: id del modello passato a origineVoceFn con la cartella VERA', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let argomentiRicevuti;
  const origineVoceFn = async (argomenti) => { argomentiRicevuti = argomenti; return { nome: 'a.md', origine: 'generated', modello: 'qwen/qwen3.8-flash', provider: 'openrouter', creatoIl: '2026-08-29T10:00:00.000Z' }; };

  await avviaSessione({ cartella: '/tmp/progetto-vero', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, origineVoceFn });

  const risultato = await catturato.onLibreriaOrigine({ id: 'lib-7' });
  assert.deepEqual(argomentiRicevuti, { cartella: '/tmp/progetto-vero', id: 'lib-7' });
  assert.equal(risultato.modello, 'qwen/qwen3.8-flash');
});

test('⛔⛔⛔ AL CONTRARIO — elencaVociFn che LANCIA (disco illeggibile) si propaga a onLibreriaLista, mai un successo inventato', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const elencaVociFn = async () => { throw new Error('EACCES: permesso negato'); };

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, elencaVociFn });

  await assert.rejects(() => catturato.onLibreriaLista({}), /EACCES/);
});

/*
 * ⭐⭐⭐ FASE N, quarto sistema (30/8) — Notes. Stesso principio dei 4
 * callback Libreria di lettura sopra (sempre costruiti,
 * incondizionatamente): le 4 voci Notes sono già nel default
 * `strumentiEstesi` di session-registry.mjs. ⛔ Unica differenza reale:
 * `cartellaNote` è GLOBALE, non la `cartella` della sessione — ogni
 * test sotto lo prova esplicitamente passando le due come percorsi
 * DIVERSI e verificando quale delle due arriva davvero allo store.
 */
test('⭐⭐⭐ i 4 callback onNote* arrivano SEMPRE a talosLavoraFn, incondizionatamente', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });

  await avviaSessione({ cartella: '/tmp/senza-note', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });

  for (const nome of ['onNoteLista', 'onNoteCrea', 'onNoteAggiorna', 'onNoteElimina']) {
    assert.equal(typeof catturato[nome], 'function', `${nome} deve essere sempre una funzione, mai undefined`);
  }
});

test('⭐⭐⭐ onNoteLista: cartellaNote (GLOBALE) passata a elencaNoteFn, MAI la cartella della sessione', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let argomentiRicevuti;
  const elencaNoteFn = async (argomenti) => {
    argomentiRicevuti = argomenti;
    return [{ id: 'nota-1', titolo: 'x', contenuto: 'y' }];
  };

  await avviaSessione({
    cartella: '/tmp/progetto-vero', cartellaNote: '/tmp/note-globali', task: TASK, modello: 'm', chiave: 'k',
    onEvento: () => {}, talosLavoraFn, elencaNoteFn,
  });

  const risultato = await catturato.onNoteLista({});
  assert.deepEqual(argomentiRicevuti, { cartella: '/tmp/note-globali' });
  assert.equal(risultato.totale, 1);
  assert.equal(risultato.note[0].id, 'nota-1');
});

test('⭐⭐ onNoteLista: limit fuori range (0, negativo, oltre 50, assente) viene sempre riportato a 1-50', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const tutte = Array.from({ length: 60 }, (_, i) => ({ id: `nota-${i}`, titolo: `t${i}`, contenuto: 'x' }));
  const elencaNoteFn = async () => tutte;

  await avviaSessione({ cartella: '/tmp/x', cartellaNote: '/tmp/n', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, elencaNoteFn });

  assert.equal((await catturato.onNoteLista({})).note.length, 20, 'assente: default 20');
  assert.equal((await catturato.onNoteLista({ limit: 0 })).note.length, 1, '0: riportato al minimo 1');
  assert.equal((await catturato.onNoteLista({ limit: -5 })).note.length, 1, 'negativo: riportato al minimo 1');
  assert.equal((await catturato.onNoteLista({ limit: 999 })).note.length, 50, 'oltre 50: riportato al massimo 50');
  assert.equal((await catturato.onNoteLista({})).totale, 60, 'totale resta il conteggio VERO, non troncato dal limit');
});

test('⭐⭐⭐ onNoteCrea: argomenti VERI passati a creaNotaFn su cartellaNote, esito onesto sulla nota salvata', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let ricevuti;
  const creaNotaFn = async (argomenti) => { ricevuti = argomenti; return { id: 'nota-1', titolo: argomenti.title }; };

  await avviaSessione({ cartella: '/tmp/x', cartellaNote: '/tmp/note-globali', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, creaNotaFn });

  const risultato = await catturato.onNoteCrea({ title: 'Codice cancello', content: '4471' });
  assert.deepEqual(ricevuti, { cartella: '/tmp/note-globali', title: 'Codice cancello', content: '4471' });
  assert.equal(risultato.ok, true);
  assert.match(risultato.esito, /Saved the note «Codice cancello» \(id nota-1\)\./);
});

test('⛔⛔ AL CONTRARIO — onNoteCrea: un creaNotaFn che lancia NoteStoreError (title vuoto) torna ok:false col messaggio VERO, mai un\'eccezione che scavalca il kernel', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const creaNotaFn = async () => { throw new NoteStoreError('title deve avere 1-120 caratteri', 'NOTE_INVALID'); };

  await avviaSessione({ cartella: '/tmp/x', cartellaNote: '/tmp/n', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, creaNotaFn });

  const risultato = await catturato.onNoteCrea({ title: '', content: 'x' });
  assert.equal(risultato.ok, false);
  assert.match(risultato.esito, /title deve avere 1-120 caratteri/);
});

test('⛔⛔ AL CONTRARIO — onNoteAggiorna: né title né content passati è un rifiuto onesto, creaNotaFn/aggiornaNotaFn MAI chiamata', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let chiamata = false;
  const aggiornaNotaFn = async () => { chiamata = true; return {}; };

  await avviaSessione({ cartella: '/tmp/x', cartellaNote: '/tmp/n', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, aggiornaNotaFn });

  const risultato = await catturato.onNoteAggiorna({ id: 'nota-1' });
  assert.equal(risultato.ok, false);
  assert.match(risultato.esito, /Nothing to change/);
  assert.equal(chiamata, false);
});

test('⭐⭐ onNoteAggiorna: un id inesistente (NOTE_NOT_FOUND) diventa il messaggio onesto del tool mobile, non l\'errore grezzo dello store', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const aggiornaNotaFn = async () => { throw new NoteStoreError('nessuna nota con id mai-esistita', 'NOTE_NOT_FOUND'); };

  await avviaSessione({ cartella: '/tmp/x', cartellaNote: '/tmp/n', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, aggiornaNotaFn });

  const risultato = await catturato.onNoteAggiorna({ id: 'mai-esistita', title: 'x' });
  assert.equal(risultato.ok, false);
  assert.equal(risultato.esito, 'There is no note with that id. Call notes_list to see the current ones.');
});

test('⭐⭐⭐ onNoteElimina: una nota che esisteva davvero dice "deleted", una già assente dice "nothing to delete" — due messaggi diversi per due stati diversi', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const presenti = new Set(['nota-vera']);
  const leggiNotaFn = async ({ id }) => (presenti.has(id) ? { id, titolo: 'x', contenuto: 'y' } : null);
  const eliminaNotaFn = async () => {};

  await avviaSessione({ cartella: '/tmp/x', cartellaNote: '/tmp/n', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, leggiNotaFn, eliminaNotaFn });

  const rimossa = await catturato.onNoteElimina({ id: 'nota-vera' });
  assert.equal(rimossa.esito, 'That note has been deleted.');
  const giaAssente = await catturato.onNoteElimina({ id: 'mai-esistita' });
  assert.equal(giaAssente.esito, 'There was no note with that id — nothing to delete.');
  assert.equal(giaAssente.ok, true, 'idempotente: già assente è l\'esito voluto, non un fallimento');
});

/*
 * ⭐⭐⭐ FASE N, quinto sistema (30/8) — Tasks. Stesso principio ESATTO
 * dei 4 callback Notes appena sopra: `cartellaAttivita` è GLOBALE, mai
 * la `cartella` della sessione — ogni test lo prova esplicitamente.
 */
test('⭐⭐⭐ i 5 callback onAttivita* arrivano SEMPRE a talosLavoraFn, incondizionatamente', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });

  await avviaSessione({ cartella: '/tmp/senza-tasks', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });

  for (const nome of ['onAttivitaLista', 'onAttivitaCrea', 'onAttivitaCompleta', 'onAttivitaAggiorna', 'onAttivitaElimina']) {
    assert.equal(typeof catturato[nome], 'function', `${nome} deve essere sempre una funzione, mai undefined`);
  }
});

test('⭐⭐⭐ onAttivitaLista: cartellaAttivita (GLOBALE) passata a elencaAttivitaFn, MAI la cartella della sessione — e filtra per status', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let cartellaRicevuta;
  const tutte = [
    { id: 'task-1', titolo: 'Aperta', stato: 'todo' },
    { id: 'task-2', titolo: 'Fatta', stato: 'done' },
  ];
  const elencaAttivitaFn = async ({ cartella }) => { cartellaRicevuta = cartella; return tutte; };

  await avviaSessione({
    cartella: '/tmp/progetto-vero', cartellaAttivita: '/tmp/tasks-globali', task: TASK, modello: 'm', chiave: 'k',
    onEvento: () => {}, talosLavoraFn, elencaAttivitaFn,
  });

  const tuttiRisultato = await catturato.onAttivitaLista({});
  assert.equal(cartellaRicevuta, '/tmp/tasks-globali');
  assert.equal(tuttiRisultato.totale, 2, 'status assente/all: nessun filtro');

  const soloAperte = await catturato.onAttivitaLista({ status: 'open' });
  assert.deepEqual(soloAperte.attivita.map((a) => a.id), ['task-1']);

  const soloFatte = await catturato.onAttivitaLista({ status: 'done' });
  assert.deepEqual(soloFatte.attivita.map((a) => a.id), ['task-2']);
});

test('⭐⭐⭐ onAttivitaCrea: argomenti VERI passati a creaAttivitaFn su cartellaAttivita, priority default "normal" se assente', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let ricevuti;
  const creaAttivitaFn = async (argomenti) => { ricevuti = argomenti; return { id: 'task-1', titolo: argomenti.title }; };

  await avviaSessione({ cartella: '/tmp/x', cartellaAttivita: '/tmp/tasks-globali', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, creaAttivitaFn });

  const risultato = await catturato.onAttivitaCrea({ title: 'Chiama idraulico' });
  assert.deepEqual(ricevuti, { cartella: '/tmp/tasks-globali', title: 'Chiama idraulico', description: undefined, priority: 'normal' });
  assert.equal(risultato.ok, true);
  assert.match(risultato.esito, /Added the task «Chiama idraulico» \(id task-1\)\./);
});

test('⛔⛔ AL CONTRARIO — onAttivitaCrea: un creaAttivitaFn che lancia TaskStoreError torna ok:false col messaggio VERO', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const creaAttivitaFn = async () => { throw new TaskStoreError('title deve avere 1-200 caratteri', 'TASK_INVALID'); };

  await avviaSessione({ cartella: '/tmp/x', cartellaAttivita: '/tmp/t', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, creaAttivitaFn });

  const risultato = await catturato.onAttivitaCrea({ title: '' });
  assert.equal(risultato.ok, false);
  assert.match(risultato.esito, /title deve avere 1-200 caratteri/);
});

test('⭐⭐ onAttivitaCompleta: il messaggio distingue "Marked as done" da "Moved to <stato>"', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const completaAttivitaFn = async ({ status }) => ({ id: 'task-1', titolo: 'x', stato: status });

  await avviaSessione({ cartella: '/tmp/x', cartellaAttivita: '/tmp/t', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, completaAttivitaFn });

  const fatto = await catturato.onAttivitaCompleta({ id: 'task-1', status: 'done' });
  assert.equal(fatto.esito, 'Marked «x» as done.');
  const inCorso = await catturato.onAttivitaCompleta({ id: 'task-1', status: 'doing' });
  assert.equal(inCorso.esito, 'Moved «x» to doing.');
});

test('⭐⭐ onAttivitaCompleta: un id inesistente (TASK_NOT_FOUND) diventa il messaggio onesto del tool mobile', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const completaAttivitaFn = async () => { throw new TaskStoreError('nessuna attività con id mai-esistita', 'TASK_NOT_FOUND'); };

  await avviaSessione({ cartella: '/tmp/x', cartellaAttivita: '/tmp/t', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, completaAttivitaFn });

  const risultato = await catturato.onAttivitaCompleta({ id: 'mai-esistita' });
  assert.equal(risultato.ok, false);
  assert.equal(risultato.esito, 'There is no task with that id. Call tasks_list to see the current ones.');
});

test('⛔⛔ AL CONTRARIO — onAttivitaAggiorna: né title né description né priority passati è un rifiuto onesto (indica tasks_complete), aggiornaAttivitaFn MAI chiamata', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let chiamata = false;
  const aggiornaAttivitaFn = async () => { chiamata = true; return {}; };

  await avviaSessione({ cartella: '/tmp/x', cartellaAttivita: '/tmp/t', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, aggiornaAttivitaFn });

  const risultato = await catturato.onAttivitaAggiorna({ id: 'task-1' });
  assert.equal(risultato.ok, false);
  assert.match(risultato.esito, /Nothing to change/);
  assert.match(risultato.esito, /tasks_complete/);
  assert.equal(chiamata, false);
});

test('⭐⭐⭐ onAttivitaElimina: un\'attività che esisteva davvero dice "deleted", una già assente dice "nothing to delete"', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const presenti = new Set(['task-vero']);
  const leggiAttivitaFn = async ({ id }) => (presenti.has(id) ? { id, titolo: 'x' } : null);
  const eliminaAttivitaFn = async () => {};

  await avviaSessione({ cartella: '/tmp/x', cartellaAttivita: '/tmp/t', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, leggiAttivitaFn, eliminaAttivitaFn });

  const rimossa = await catturato.onAttivitaElimina({ id: 'task-vero' });
  assert.equal(rimossa.esito, 'That task has been deleted.');
  const giaAssente = await catturato.onAttivitaElimina({ id: 'mai-esistita' });
  assert.equal(giaAssente.esito, 'There was no task with that id — nothing to delete.');
  assert.equal(giaAssente.ok, true, 'idempotente: già assente è l\'esito voluto, non un fallimento');
});

/*
 * ⭐⭐⭐ FASE N, sesto sistema (30/8) — Memory. Stesso principio ESATTO
 * dei callback Notes/Tasks: `cartellaMemoria` è GLOBALE.
 */
test('⭐⭐⭐ i 4 callback onMemoria* arrivano SEMPRE a talosLavoraFn, incondizionatamente', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });

  await avviaSessione({ cartella: '/tmp/senza-memory', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });

  for (const nome of ['onMemoriaCerca', 'onMemoriaScrivi', 'onMemoriaAggiorna', 'onMemoriaElimina']) {
    assert.equal(typeof catturato[nome], 'function', `${nome} deve essere sempre una funzione, mai undefined`);
  }
});

test('⭐⭐⭐ onMemoriaCerca: cartellaMemoria (GLOBALE) passata a elencaMemorieFn, ricerca DAVVERO nel testo (via cercaMemorie pura)', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let cartellaRicevuta;
  const elencaMemorieFn = async ({ cartella }) => {
    cartellaRicevuta = cartella;
    return [
      { id: 'mem-1', titolo: 'Preferenze risposta', contenuto: 'Risposte brevi' },
      { id: 'mem-2', titolo: 'Lingua', contenuto: 'Sempre in italiano' },
    ];
  };

  await avviaSessione({
    cartella: '/tmp/x', cartellaMemoria: '/tmp/memoria-globale', task: TASK, modello: 'm', chiave: 'k',
    onEvento: () => {}, talosLavoraFn, elencaMemorieFn,
  });

  const risultato = await catturato.onMemoriaCerca({ query: 'italiano' });
  assert.equal(cartellaRicevuta, '/tmp/memoria-globale');
  assert.deepEqual(risultato.memorie.map((m) => m.id), ['mem-2']);
});

test('⭐⭐⭐ onMemoriaScrivi: caso normale — id incluso nel messaggio (a differenza di mobile, vedi la doc in memory-store.mjs)', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let ricevuti;
  const creaMemoriaFn = async (argomenti) => {
    ricevuti = argomenti;
    return { voce: { id: 'mem-1', titolo: argomenti.title, contenuto: argomenti.content }, duplicato: false };
  };

  await avviaSessione({ cartella: '/tmp/x', cartellaMemoria: '/tmp/m', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, creaMemoriaFn });

  const risultato = await catturato.onMemoriaScrivi({ title: 'Preferenze risposta', content: 'Risposte brevi' });
  assert.deepEqual(ricevuti, { cartella: '/tmp/m', title: 'Preferenze risposta', content: 'Risposte brevi', kind: 'preference' });
  assert.equal(risultato.esito, 'Remembered as «Preferenze risposta» (id mem-1): Risposte brevi');
});

test('⭐⭐⭐⭐⭐ onMemoriaScrivi: caso DUPLICATO — messaggio distinto, mai una "creazione" travestita', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const creaMemoriaFn = async () => ({ voce: { id: 'mem-1', titolo: 'Preferenze risposta', contenuto: 'Risposte brevi' }, duplicato: true });

  await avviaSessione({ cartella: '/tmp/x', cartellaMemoria: '/tmp/m', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, creaMemoriaFn });

  const risultato = await catturato.onMemoriaScrivi({ title: 'Preferenze risposta', content: 'testo diverso' });
  assert.equal(risultato.ok, true);
  assert.match(risultato.esito, /Already remembered as «Preferenze risposta» \(id mem-1\)\. Nothing new was written\./);
});

test('⛔⛔ AL CONTRARIO — onMemoriaAggiorna: né title né content né kind passati è un rifiuto onesto, aggiornaMemoriaFn MAI chiamata', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let chiamata = false;
  const aggiornaMemoriaFn = async () => { chiamata = true; return {}; };

  await avviaSessione({ cartella: '/tmp/x', cartellaMemoria: '/tmp/m', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, aggiornaMemoriaFn });

  const risultato = await catturato.onMemoriaAggiorna({ id: 'mem-1' });
  assert.equal(risultato.ok, false);
  assert.match(risultato.esito, /Nothing to change/);
  assert.equal(chiamata, false);
});

test('⭐⭐ onMemoriaAggiorna: un id inesistente (MEMORY_NOT_FOUND) diventa il messaggio onesto del tool mobile', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const aggiornaMemoriaFn = async () => { throw new MemoryStoreError('nessuna memoria con id mai-esistita', 'MEMORY_NOT_FOUND'); };

  await avviaSessione({ cartella: '/tmp/x', cartellaMemoria: '/tmp/m', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, aggiornaMemoriaFn });

  const risultato = await catturato.onMemoriaAggiorna({ id: 'mai-esistita', title: 'x' });
  assert.equal(risultato.ok, false);
  assert.match(risultato.esito, /No memory has the id "mai-esistita"/);
});

test('⭐⭐⭐ onMemoriaElimina: una memoria che esisteva davvero dice "removed", una già assente dice "may already be gone"', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const presenti = new Set(['mem-vera']);
  const leggiMemoriaFn = async ({ id }) => (presenti.has(id) ? { id, titolo: 'x' } : null);
  const eliminaMemoriaFn = async () => {};

  await avviaSessione({ cartella: '/tmp/x', cartellaMemoria: '/tmp/m', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, leggiMemoriaFn, eliminaMemoriaFn });

  const rimossa = await catturato.onMemoriaElimina({ id: 'mem-vera' });
  assert.equal(rimossa.esito, 'That memory has been removed from this device.');
  const giaAssente = await catturato.onMemoriaElimina({ id: 'mai-esistita' });
  assert.match(giaAssente.esito, /No memory has the id "mai-esistita".*may already be gone/);
  assert.equal(giaAssente.ok, true, 'idempotente: già assente è l\'esito voluto, non un fallimento');
});

/*
 * ⭐⭐⭐ FASE N (29/8), seconda fetta — i 3 callback di mutazione. Stesso
 * principio dei 4 di lettura sopra (sempre costruiti, incondizionatamente),
 * ma qui scrivono il MESSAGGIO finale per intero (a differenza dei 4 di
 * lettura, che tornano dati grezzi per il formattatore del kernel).
 */
test('⭐⭐⭐ i 3 callback onLibreria* di mutazione arrivano SEMPRE a talosLavoraFn, incondizionatamente', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });

  for (const nome of ['onLibreriaRinomina', 'onLibreriaElimina', 'onLibreriaEsporta']) {
    assert.equal(typeof catturato[nome], 'function', `${nome} deve essere sempre una funzione, mai undefined`);
  }
});

test('⭐⭐⭐ onLibreriaRinomina: cartella+id+nome VERI passati a rinominaVoceFn, il messaggio riporta ENTRAMBI i nomi', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let argomentiRicevuti;
  const rinominaVoceFn = async (argomenti) => { argomentiRicevuti = argomenti; return { id: 'lib-1', nomePrima: 'vecchio.md', nomeDopo: 'nuovo.md' }; };

  await avviaSessione({ cartella: '/tmp/progetto-vero', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, rinominaVoceFn });

  const risultato = await catturato.onLibreriaRinomina({ id: 'lib-1', name: 'nuovo.md' });
  assert.deepEqual(argomentiRicevuti, { cartella: '/tmp/progetto-vero', id: 'lib-1', nome: 'nuovo.md' });
  assert.equal(risultato.ok, true);
  assert.equal(risultato.esito, 'Renamed «vecchio.md» to «nuovo.md».');
});

test('⛔ AL CONTRARIO — onLibreriaRinomina: un id inesistente (rinominaVoceFn torna null) è ok:false, mai un successo inventato', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const rinominaVoceFn = async () => null;

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, rinominaVoceFn });

  const risultato = await catturato.onLibreriaRinomina({ id: 'lib-fantasma', name: 'x.md' });
  assert.equal(risultato.ok, false);
  assert.match(risultato.esito, /No Library file has the id "lib-fantasma"/);
});

test('⭐⭐⭐ onLibreriaElimina: cartella+id VERI passati a eliminaVoceFn, il messaggio riporta il nome tolto', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let argomentiRicevuti;
  const eliminaVoceFn = async (argomenti) => { argomentiRicevuti = argomenti; return { id: 'lib-1', nome: 'via.md' }; };

  await avviaSessione({ cartella: '/tmp/progetto-vero', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, eliminaVoceFn });

  const risultato = await catturato.onLibreriaElimina({ id: 'lib-1' });
  assert.deepEqual(argomentiRicevuti, { cartella: '/tmp/progetto-vero', id: 'lib-1' });
  assert.equal(risultato.esito, '«via.md» has been removed from the Library.');
});

test('⭐⭐⭐ onLibreriaEsporta: risolve il riferimento, legge la voce, la scrive nel workspace VERO con creaFileWorkspaceFn', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const elencaVociFn = async () => [{ id: 'lib-1', nome: 'report.md', fileType: 'document', origine: 'uploaded' }];
  // 14/09 (F03): l'esportazione legge dalla porta BINARIA della Libreria, non da quella del modello — vedi i due test qui sotto.
  const leggiBytesVoceFn = async ({ id }) => (id === 'lib-1'
    ? { bytes: Buffer.from('contenuto vero', 'utf8'), dimensione: 14, nome: 'report.md', mediaType: 'text/markdown' }
    : null);
  let scritturaRicevuta;
  const creaFileWorkspaceFn = async (spec) => { scritturaRicevuta = spec; return { percorso: spec.nome }; };
  const eventi = [];

  await avviaSessione({
    cartella: '/tmp/progetto-vero', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn,
    elencaVociFn, leggiBytesVoceFn, creaFileWorkspaceFn,
  });

  const risultato = await catturato.onLibreriaEsporta({ reference: 'lib-1' });
  assert.deepEqual(scritturaRicevuta, { cartella: '/tmp/progetto-vero', nome: 'report.md', bytes: Buffer.from('contenuto vero', 'utf8') });
  assert.equal(risultato.ok, true);
  assert.match(risultato.esito, /Exported "report\.md" into the workspace \(14 bytes\)/);
  const eventoScrittura = eventi.find((e) => e.type === 'StateDelta');
  assert.ok(eventoScrittura, 'una scrittura reale nel workspace deve emettere StateDelta, come document_create/generate_image');
  assert.ok(JSON.stringify(eventoScrittura).includes('contenuto vero'), 'un file di TESTO resta leggibile nell\'anteprima a schermo');
});

test('⛔⛔ AL CONTRARIO — onLibreriaEsporta: due voci con lo stesso nome sono ambigue, creaFileWorkspaceFn MAI chiamata', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const elencaVociFn = async () => [
    { id: 'lib-1', nome: 'a.md', fileType: 'document', origine: 'uploaded' },
    { id: 'lib-2', nome: 'a.md', fileType: 'document', origine: 'uploaded' },
  ];
  let chiamataScrittura = false;
  const creaFileWorkspaceFn = async () => { chiamataScrittura = true; return { percorso: 'x' }; };

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, elencaVociFn, creaFileWorkspaceFn });

  const risultato = await catturato.onLibreriaEsporta({ reference: 'a.md' });
  assert.equal(risultato.ok, false);
  assert.match(risultato.esito, /More than one Library file is named "a\.md"/);
  assert.equal(chiamataScrittura, false, 'un\'ambiguità non deve MAI arrivare a scrivere qualcosa');
});

test('⛔ AL CONTRARIO — onLibreriaEsporta: un nome già occupato nel workspace rifiuta onestamente (WorkspaceFileError), mai una sovrascrittura', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const elencaVociFn = async () => [{ id: 'lib-1', nome: 'esiste-gia.md', fileType: 'document', origine: 'uploaded' }];
  const leggiBytesVoceFn = async () => ({ bytes: Buffer.from('x', 'utf8'), dimensione: 1, nome: 'esiste-gia.md', mediaType: 'text/markdown' });
  const creaFileWorkspaceFn = async () => { throw new WorkspaceFileError('Esiste già un file con questo nome', 'FILE_EXISTS'); };

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, elencaVociFn, leggiBytesVoceFn, creaFileWorkspaceFn });

  const risultato = await catturato.onLibreriaEsporta({ reference: 'lib-1' });
  assert.equal(risultato.ok, false);
  assert.match(risultato.esito, /could not be saved into the workspace: Esiste già un file con questo nome/);
});

/*
 * ⛔⛔⛔ 14/09 — F03 della review, riprodotto prima di curarlo: `library_export` leggeva dalla porta del MODELLO
 *   (`leggiVoce`, che decodifica in utf8 tutto ciò che non è un'immagine) e depositava nel workspace un file
 *   BINARIO corrotto — ogni byte non valido diventato U+FFFD — dichiarando «Exported» con un conteggio di byte
 *   che non era quello del file vero. Il criterio della riga è byte per byte, non «sembra uguale».
 */
test('⛔⛔⛔ F03 — onLibreriaEsporta: un file BINARIO arriva nel workspace IDENTICO, senza passare da utf8', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  // L'intestazione di uno zip (cioè di un .docx) più byte non validi in utf8: esattamente ciò che la vecchia strada distruggeva.
  const veri = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0xfe, 0x00, 0x01, 0x80, 0x9f]);
  assert.notDeepEqual(Buffer.from(veri.toString('utf8'), 'utf8'), veri, 'premessa della prova: passare da utf8 DISTRUGGE questi byte');

  const mediaType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const elencaVociFn = async () => [{ id: 'lib-1', nome: 'contratto.docx', fileType: 'document', origine: 'uploaded' }];
  const leggiBytesVoceFn = async ({ id }) => (id === 'lib-1' ? { bytes: veri, dimensione: veri.byteLength, nome: 'contratto.docx', mediaType } : null);
  let scritturaRicevuta;
  const creaFileWorkspaceFn = async (spec) => { scritturaRicevuta = spec; return { percorso: spec.nome }; };
  const eventi = [];

  await avviaSessione({
    cartella: '/tmp/progetto-vero', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn,
    elencaVociFn, leggiBytesVoceFn, creaFileWorkspaceFn,
  });

  const risultato = await catturato.onLibreriaEsporta({ reference: 'contratto.docx' });
  assert.equal(risultato.ok, true);
  assert.deepEqual(scritturaRicevuta.bytes, veri, 'i byte scritti sono quelli della Libreria, non la loro ombra utf8');
  assert.match(risultato.esito, /Exported "contratto\.docx" into the workspace \(10 bytes\)/);

  const eventoScrittura = eventi.find((e) => e.type === 'StateDelta' && JSON.stringify(e).includes('contratto.docx'));
  assert.ok(eventoScrittura, 'una scrittura reale nel workspace deve emettere StateDelta');
  const detto = JSON.stringify(eventoScrittura);
  assert.ok(detto.includes(`[${mediaType}, 10 bytes]`), 'l\'anteprima DICHIARA il binario invece di fingerlo testo');
  assert.ok(!detto.includes('�'), 'mai caratteri sostituti a schermo per un file che non ne ha');
});

test('⛔ AL CONTRARIO — F03: se la Libreria RIFIUTA di dare i byte (tetto dello scarico), si dice il motivo e non si scrive niente', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const elencaVociFn = async () => [{ id: 'lib-1', nome: 'enorme.bin', fileType: 'document', origine: 'uploaded' }];
  const leggiBytesVoceFn = async () => { throw new Error('File troppo grande da scaricare (70 MB, tetto 64 MB)'); };
  let chiamataScrittura = false;
  const creaFileWorkspaceFn = async () => { chiamataScrittura = true; return { percorso: 'x' }; };

  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, elencaVociFn, leggiBytesVoceFn, creaFileWorkspaceFn });

  const risultato = await catturato.onLibreriaEsporta({ reference: 'lib-1' });
  assert.equal(risultato.ok, false);
  assert.match(risultato.esito, /could not be read from the Library: File troppo grande da scaricare \(70 MB, tetto 64 MB\)/);
  assert.equal(chiamataScrittura, false, 'un rifiuto in lettura non deve MAI arrivare a scrivere qualcosa');
});

/*
 * ⭐⭐⭐ FASE N (29/8), terza fetta — onLibreriaPolitica.
 */
function politicaFinta(overrides) {
  return { revision: 0, enabled: true, mode: 'agentic_on_demand_v1', includedFileIds: [], excludedFileIds: [], ...overrides };
}

test('⭐⭐⭐ onLibreriaPolitica è SEMPRE presente, incondizionatamente', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });
  assert.equal(typeof catturato.onLibreriaPolitica, 'function');
});

test('⭐⭐⭐ onLibreriaPolitica set_enabled: legge/scrive con la cartella VERA, la revisione avanza, la ricevuta torna nel messaggio', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const leggiPoliticaFn = async () => politicaFinta({});
  let scritturaRicevuta;
  const scriviPoliticaFn = async (spec) => { scritturaRicevuta = spec; return { ...spec.valore, revision: spec.revisioneAttesa + 1 }; };

  await avviaSessione({ cartella: '/tmp/progetto-vero', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, leggiPoliticaFn, scriviPoliticaFn });

  const risultato = await catturato.onLibreriaPolitica({ action: 'set_enabled', expected_revision: 0, enabled: false });
  assert.equal(scritturaRicevuta.cartella, '/tmp/progetto-vero');
  assert.equal(scritturaRicevuta.valore.enabled, false);
  assert.equal(risultato.ok, true);
  assert.match(risultato.esito, /Updated the Library policy to revision 1\. Undo receipt: /);
});

for (const [azione, campo] of [['set_mode', 'mode'], ['set_enabled', 'enabled'], ['include_files', 'file_ids'], ['exclude_files', 'file_ids'], ['undo', 'receipt_id']]) {
  test(`⛔ AL CONTRARIO — onLibreriaPolitica ${azione} senza "${campo}": rifiutato PRIMA di leggere la politica, mai un giro di I/O sprecato`, async () => {
    let catturato;
    const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
    let lettaChiamata = false;
    const leggiPoliticaFn = async () => { lettaChiamata = true; return politicaFinta({}); };
    await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, leggiPoliticaFn });

    const risultato = await catturato.onLibreriaPolitica({ action: azione, expected_revision: 0 });
    assert.equal(risultato.ok, false);
    assert.match(risultato.esito, new RegExp(`^${campo} is required when action is ${azione}\\.`));
    assert.equal(lettaChiamata, false);
  });
}

test('⛔⛔ AL CONTRARIO — onLibreriaPolitica: expected_revision sbagliata è un conflitto onesto, scriviPoliticaFn MAI chiamata', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const leggiPoliticaFn = async () => politicaFinta({ revision: 3 });
  let chiamataScrittura = false;
  const scriviPoliticaFn = async () => { chiamataScrittura = true; return politicaFinta({}); };
  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, leggiPoliticaFn, scriviPoliticaFn });

  const risultato = await catturato.onLibreriaPolitica({ action: 'set_enabled', expected_revision: 0, enabled: false });
  assert.equal(risultato.ok, false);
  assert.match(risultato.esito, /expected revision 0, current revision 3/);
  assert.equal(chiamataScrittura, false);
});

test('⛔⛔⛔ AL CONTRARIO — onLibreriaPolitica set_mode verso una modalità NON supportata: rifiutato onestamente, scriviPoliticaFn MAI chiamata', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const leggiPoliticaFn = async () => politicaFinta({});
  let chiamataScrittura = false;
  const scriviPoliticaFn = async () => { chiamataScrittura = true; return politicaFinta({}); };
  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, leggiPoliticaFn, scriviPoliticaFn });

  const risultato = await catturato.onLibreriaPolitica({ action: 'set_mode', expected_revision: 0, mode: 'broad_compat_v1' });
  assert.equal(risultato.ok, false);
  assert.match(risultato.esito, /only supports the "agentic_on_demand_v1" mode today; "broad_compat_v1" is not implemented/);
  assert.equal(chiamataScrittura, false);
});

test('⭐⭐ onLibreriaPolitica set_mode verso l\'UNICA modalità supportata: riuscito', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const leggiPoliticaFn = async () => politicaFinta({});
  const scriviPoliticaFn = async (spec) => ({ ...spec.valore, revision: spec.revisioneAttesa + 1 });
  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, leggiPoliticaFn, scriviPoliticaFn });

  const risultato = await catturato.onLibreriaPolitica({ action: 'set_mode', expected_revision: 0, mode: 'agentic_on_demand_v1' });
  assert.equal(risultato.ok, true);
});

test('⭐⭐ onLibreriaPolitica include_files/exclude_files sono mutuamente esclusivi: includere un id lo toglie dagli esclusi', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const leggiPoliticaFn = async () => politicaFinta({ excludedFileIds: ['lib-1'] });
  let scritturaRicevuta;
  const scriviPoliticaFn = async (spec) => { scritturaRicevuta = spec; return { ...spec.valore, revision: spec.revisioneAttesa + 1 }; };
  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, leggiPoliticaFn, scriviPoliticaFn });

  await catturato.onLibreriaPolitica({ action: 'include_files', expected_revision: 0, file_ids: ['lib-1'] });
  assert.deepEqual(scritturaRicevuta.valore.includedFileIds, ['lib-1']);
  assert.deepEqual(scritturaRicevuta.valore.excludedFileIds, []);
});

test('⭐⭐ onLibreriaPolitica clear_overrides: riporta al default (abilitata, agentic_on_demand_v1, liste vuote)', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const leggiPoliticaFn = async () => politicaFinta({ enabled: false, includedFileIds: ['lib-1'] });
  let scritturaRicevuta;
  const scriviPoliticaFn = async (spec) => { scritturaRicevuta = spec; return { ...spec.valore, revision: spec.revisioneAttesa + 1 }; };
  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, leggiPoliticaFn, scriviPoliticaFn });

  await catturato.onLibreriaPolitica({ action: 'clear_overrides', expected_revision: 0 });
  assert.deepEqual(scritturaRicevuta.valore, { enabled: true, mode: 'agentic_on_demand_v1', includedFileIds: [], excludedFileIds: [] });
});

test('⭐⭐⭐ onLibreriaPolitica undo: annulla DAVVERO l\'ultima modifica fatta nella stessa sessione', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let stato = politicaFinta({});
  const leggiPoliticaFn = async () => stato;
  const scriviPoliticaFn = async (spec) => { stato = { ...spec.valore, revision: spec.revisioneAttesa + 1 }; return stato; };
  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, leggiPoliticaFn, scriviPoliticaFn });

  const primo = await catturato.onLibreriaPolitica({ action: 'set_enabled', expected_revision: 0, enabled: false });
  const receiptId = primo.esito.match(/Undo receipt: (\S+)/)[1];
  assert.equal(stato.enabled, false);

  const secondo = await catturato.onLibreriaPolitica({ action: 'undo', expected_revision: 1, receipt_id: receiptId });
  assert.equal(secondo.ok, true);
  assert.equal(stato.enabled, true, 'undo deve riportare enabled al valore di PRIMA della modifica');
});

test('⭐⭐⭐ onLibreriaPolitica undo: un receipt_id con un punto di FRASE finale (copiato dal messaggio "Undo receipt: xxx.") funziona lo stesso — porto di receiptLookupIds mobile', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let stato = politicaFinta({});
  const leggiPoliticaFn = async () => stato;
  const scriviPoliticaFn = async (spec) => { stato = { ...spec.valore, revision: spec.revisioneAttesa + 1 }; return stato; };
  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, leggiPoliticaFn, scriviPoliticaFn });

  const primo = await catturato.onLibreriaPolitica({ action: 'set_enabled', expected_revision: 0, enabled: false });
  const idEsatto = primo.esito.match(/Undo receipt: (\S+)\.$/)[1];
  const idConPunto = `${idEsatto}.`; // esattamente come un modello lo leggerebbe copiando l'intera frase

  const secondo = await catturato.onLibreriaPolitica({ action: 'undo', expected_revision: 1, receipt_id: idConPunto });
  assert.equal(secondo.ok, true);
  assert.equal(stato.enabled, true);
});

test('⛔⛔ AL CONTRARIO — onLibreriaPolitica undo con un receipt_id sconosciuto: rifiutato onestamente, mai un ripristino a caso', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const leggiPoliticaFn = async () => politicaFinta({});
  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, leggiPoliticaFn });

  const risultato = await catturato.onLibreriaPolitica({ action: 'undo', expected_revision: 0, receipt_id: 'libpol-mai-esistito' });
  assert.equal(risultato.ok, false);
  assert.match(risultato.esito, /missing, expired, already used, or belongs to another scope/);
});

test('⛔ AL CONTRARIO — onLibreriaPolitica: leggiPoliticaFn che LANCIA produce un esito onesto, mai un crash', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const leggiPoliticaFn = async () => { throw new Error('EACCES: permesso negato'); };
  await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, leggiPoliticaFn });

  const risultato = await catturato.onLibreriaPolitica({ action: 'set_enabled', expected_revision: 0, enabled: false });
  assert.equal(risultato.ok, false);
  assert.match(risultato.esito, /could not be read.*EACCES/);
});

/*
 * ⭐⭐⭐⭐ FASE N, nono e ultimo sistema (30/8) — Tool Forge, "fetta
 * onesta". eseguiCapacitaForge non è esportata (closure interna,
 * stesso confine di hookFnConPlugin) — si prova indirettamente
 * attraverso eseguiToolForgeFn, esattamente come un tool forgiato
 * VERO la eserciterebbe.
 */
function manifestoDiProva({ id = 'x', capability, input = {}, target } = {}) {
  return {
    id, title: 'x', description: 'x',
    inputSchema: { type: 'object', properties: {} },
    flow: {
      entry: 'n1', maxTransitions: 10,
      nodes: [
        { id: 'n1', type: 'capability', capability, input, ...(target ? { target } : {}), next: 'n2' },
        { id: 'n2', type: 'return', value: target ? { $ref: target } : null },
      ],
    },
  };
}

function elencaToolForgiatiFintoConUno(manifest, abilitato = true) {
  return async () => [{ id: manifest.id, manifest, capacita: [], azioni: [], rischio: 'R1', abilitato }];
}

for (const [capacita, campiInput, nomeFn, argomentiAttesi, rispostaFinta] of [
  ['tasks.list', {}, 'elencaAttivitaFn', { cartella: '/tmp/a' }, [{ id: 't-1' }]],
  ['tasks.create', { title: 'Compra il latte', description: 'x', priority: 'high' }, 'creaAttivitaFn', { cartella: '/tmp/a', title: 'Compra il latte', description: 'x', priority: 'high' }, { id: 't-1' }],
  ['tasks.setStatus', { id: 't-1', status: 'done' }, 'completaAttivitaFn', { cartella: '/tmp/a', id: 't-1', status: 'done' }, { id: 't-1', stato: 'done' }],
  ['notes.list', {}, 'elencaNoteFn', { cartella: '/tmp/n' }, [{ id: 'n-1' }]],
  ['notes.create', { title: 'Titolo', content: 'Corpo' }, 'creaNotaFn', { cartella: '/tmp/n', title: 'Titolo', content: 'Corpo' }, { id: 'n-1' }],
  ['notes.update', { id: 'n-1', content: 'Nuovo corpo' }, 'aggiornaNotaFn', { cartella: '/tmp/n', id: 'n-1', content: 'Nuovo corpo' }, { id: 'n-1' }],
]) {
  test(`⭐⭐⭐ eseguiCapacitaForge(${capacita}) — chiamando DAVVERO il tool forgiato: l'input risolto raggiunge ${nomeFn}, con gli argomenti VERI`, async () => {
    const manifest = manifestoDiProva({
      capability: capacita,
      input: Object.fromEntries(Object.keys(campiInput).map((k) => [k, { $ref: `$.input.${k}` }])),
      target: '$.state.r',
    });
    const ricevuti = [];
    const fn = async (spec) => { ricevuti.push(spec); return rispostaFinta; };
    let catturato;
    const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
    await avviaSessione({
      cartella: '/tmp/x', cartellaAttivita: '/tmp/a', cartellaNote: '/tmp/n', cartellaMemoria: '/tmp/m', cartellaForge: '/tmp/f',
      task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
      elencaToolForgiatiFn: elencaToolForgiatiFintoConUno(manifest), [nomeFn]: fn,
    });
    // ⛔ talosLavoraFn è un MOCK — mai il kernel vero: la chiamata al tool forgiato non avviene mai da sola, si simula qui esattamente ciò che il dispatch del kernel farebbe (eseguiToolForgeFn(nome, argomenti)).
    const risultato = await catturato.eseguiToolForgeFn('forge_x', campiInput);
    assert.equal(risultato.status, 'succeeded');
    assert.deepEqual(risultato.output, rispostaFinta);
    assert.equal(ricevuti.length, 1);
    assert.deepEqual(ricevuti[0], argomentiAttesi);
  });
}

test('⭐⭐⭐ eseguiCapacitaForge(memory.create) — chiamando DAVVERO il tool forgiato: il risultato è la voce SPACCHETTATA da {voce,duplicato}, mai il wrapper interno', async () => {
  const manifest = manifestoDiProva({ capability: 'memory.create', input: { title: { $ref: '$.input.title' }, content: { $ref: '$.input.content' } }, target: '$.state.r' });
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const ricevuti = [];
  const creaMemoriaFn = async (spec) => { ricevuti.push(spec); return { voce: { id: 'm-1' }, duplicato: false }; };
  await avviaSessione({
    cartella: '/tmp/x', cartellaMemoria: '/tmp/m', cartellaForge: '/tmp/f', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    elencaToolForgiatiFn: elencaToolForgiatiFintoConUno(manifest), creaMemoriaFn,
  });
  const risultato = await catturato.eseguiToolForgeFn('forge_x', { title: 'x', content: 'y' });
  assert.equal(risultato.status, 'succeeded');
  assert.deepEqual(risultato.output, { id: 'm-1' }, 'la voce spacchettata, non {voce,duplicato}: un flow forgiato che legge $.state.r vuole il record, non il wrapper interno del dedup');
  assert.deepEqual(ricevuti, [{ cartella: '/tmp/m', title: 'x', content: 'y', kind: 'procedure' }]);
});

test('⭐⭐⭐ eseguiCapacitaForge(memory.search) — composizione in due passi: elencaMemorieFn poi cercaMemorie (pura), mai una terza store', async () => {
  const manifest = manifestoDiProva({ capability: 'memory.search', input: { query: { $ref: '$.input.query' } }, target: '$.state.r' });
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const chiamateElenco = [];
  const elencaMemorieFn = async (spec) => { chiamateElenco.push(spec); return [{ id: 'm-1', titolo: 'Preferenze', contenuto: 'Risposte brevi' }, { id: 'm-2', titolo: 'Altro', contenuto: 'xyz' }]; };
  await avviaSessione({
    cartella: '/tmp/x', cartellaMemoria: '/tmp/m', cartellaForge: '/tmp/f', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    elencaToolForgiatiFn: elencaToolForgiatiFintoConUno(manifest), elencaMemorieFn,
  });
  const risultato = await catturato.eseguiToolForgeFn('forge_x', { query: 'brevi' });
  assert.equal(risultato.status, 'succeeded');
  assert.deepEqual(chiamateElenco, [{ cartella: '/tmp/m' }]);
  assert.equal(risultato.output.memorie.length, 1, 'cercaMemorie ha filtrato DAVVERO — solo la voce che combacia "brevi"');
  assert.equal(risultato.output.memorie[0].id, 'm-1');
});

test('⛔⛔⛔ AL CONTRARIO — eseguiCapacitaForge su una capacità VALIDA nel kernel ma senza handler qui (nessuna oggi, provato con un id inventato): TALOS_FORGE_CAPABILITY_UNAVAILABLE', async () => {
  const manifest = manifestoDiProva({ capability: 'web.search', input: {} });
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  await avviaSessione({ cartella: '/tmp/x', cartellaForge: '/tmp/f', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, elencaToolForgiatiFn: elencaToolForgiatiFintoConUno(manifest) });
  const risultato = await catturato.eseguiToolForgeFn('forge_x', {});
  assert.equal(risultato.status, 'failed');
  assert.match(risultato.error.code, /TALOS_FORGE_CAPABILITY_FAILED/);
  assert.match(risultato.error.message, /TALOS_FORGE_CAPABILITY_UNAVAILABLE:web\.search/);
});

test('⭐⭐⭐⭐ PARITÀ — toolForge/eseguiToolForgeFn arrivano a talosLavoraFn ESATTAMENTE come costruiti, tool forgiato ABILITATO', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const manifest = manifestoDiProva({ id: 'log-water-intake', capability: 'notes.create', input: { title: { $ref: '$.input.title' } }, target: '$.state.r' });
  await avviaSessione({
    cartella: '/tmp/x', cartellaNote: '/tmp/n', cartellaForge: '/tmp/f', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    elencaToolForgiatiFn: elencaToolForgiatiFintoConUno(manifest, true),
  });
  assert.deepEqual(catturato.toolForge, [{ name: 'forge_log-water-intake', description: 'x', inputSchema: manifest.inputSchema }]);
  assert.equal(typeof catturato.eseguiToolForgeFn, 'function');
});

test('⛔⛔⛔ AL CONTRARIO — un tool forgiato installato ma NON abilitato non entra MAI in toolForge', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const manifest = manifestoDiProva({ id: 'mai-abilitato', capability: 'notes.list', input: {} });
  await avviaSessione({
    cartella: '/tmp/x', cartellaForge: '/tmp/f', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    elencaToolForgiatiFn: elencaToolForgiatiFintoConUno(manifest, false),
  });
  assert.equal(catturato.toolForge, undefined);
  assert.equal(catturato.eseguiToolForgeFn, undefined);
});

test('⛔ AL CONTRARIO — zero tool forgiati installati: toolForge/eseguiToolForgeFn restano undefined', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  await avviaSessione({
    cartella: '/tmp/x', cartellaForge: '/tmp/f', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    elencaToolForgiatiFn: async () => [],
  });
  assert.equal(catturato.toolForge, undefined);
});

test('⛔⛔ AL CONTRARIO — cartellaForge assente (elencaToolForgiatiFn lancia): degrada senza bloccare l\'avvio, PARITÀ con ogni altro chiamante', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const risultato = await avviaSessione({ cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });
  assert.equal(risultato.ok, true, 'la sessione parte comunque, mai bloccata da .tool-forge-store/ assente');
  assert.equal(catturato.toolForge, undefined);
  assert.equal(typeof catturato.onForgeCrea, 'function', 'onForgeCrea resta SEMPRE costruita, come Notes/Tasks/Memory — solo toolForge (scoperta dinamica) è condizionale');
});

test('⭐⭐⭐⭐ onForgeCrea: un manifest VALIDO chiama installaToolForgiatoFn con manifest/capacita/azioni/rischio VERI, torna il messaggio di successo mobile verbatim', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const ricevuti = [];
  const installaToolForgiatoFn = async (spec) => { ricevuti.push(spec); return { id: spec.manifest.id }; };
  await avviaSessione({ cartella: '/tmp/x', cartellaForge: '/tmp/f', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, installaToolForgiatoFn });

  const argomenti = { id: 'log-water-intake', title: 'Log water intake', description: 'x', flow: { entry: 'n1', maxTransitions: 10, nodes: [{ id: 'n1', type: 'return', value: 'ok' }] } };
  const esito = await catturato.onForgeCrea(argomenti);
  assert.equal(esito.ok, true);
  assert.equal(esito.esito, 'Created "Log water intake" — it stays off until the user enables it in Tool Forge.');
  assert.equal(ricevuti.length, 1);
  assert.equal(ricevuti[0].manifest.id, 'log-water-intake');
  assert.deepEqual(ricevuti[0].azioni, []);
  assert.equal(ricevuti[0].rischio, 'R1');
});

test('⛔⛔⛔ AL CONTRARIO — onForgeCrea: un manifest NON valido è rifiutato PRIMA di chiamare installaToolForgiatoFn — mai una scrittura sospetta', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  let chiamata = false;
  const installaToolForgiatoFn = async () => { chiamata = true; return {}; };
  await avviaSessione({ cartella: '/tmp/x', cartellaForge: '/tmp/f', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, installaToolForgiatoFn });

  const esito = await catturato.onForgeCrea({ id: 'X', title: '', description: 'x', flow: { entry: 'n1', maxTransitions: 10, nodes: [] } });
  assert.equal(esito.ok, false);
  assert.match(esito.esito, /^That tool could not be created:/);
  assert.equal(chiamata, false, 'un manifest invalido non deve MAI raggiungere lo store');
});

test('⛔⛔ AL CONTRARIO — onForgeCrea: installaToolForgiatoFn che lancia ToolForgeStoreError (id già esistente) torna il messaggio onesto, non un\'eccezione', async () => {
  let catturato;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } }, cattura: (input) => { catturato = input; } });
  const installaToolForgiatoFn = async () => { throw new ToolForgeStoreError('a tool with id "my-tool" already exists — pick a different id', 'FORGE_VERSION_NOT_NEWER'); };
  await avviaSessione({ cartella: '/tmp/x', cartellaForge: '/tmp/f', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, installaToolForgiatoFn });

  const argomenti = { id: 'my-tool', title: 'x', description: 'x', flow: { entry: 'n1', maxTransitions: 10, nodes: [{ id: 'n1', type: 'return', value: 'ok' }] } };
  const esito = await catturato.onForgeCrea(argomenti);
  assert.equal(esito.ok, false);
  assert.equal(esito.esito, 'That tool could not be created: a tool with id "my-tool" already exists — pick a different id.');
});

test('⭐⭐⭐ 06/9 — un artefatto creato finisce ANCHE in Libreria, non solo nella memoria del server', async () => {
  /*
   * ⛔ Owner: «con i modelli a chiave API gli artefatti vengono creati, ma non salvati nella
   * libreria». Vero, e peggio: non erano salvati da nessuna parte — artifact-store.mjs li tiene in
   * una Map in memoria, che un riavvio del server azzera (dichiarato nella sua doc). Un artefatto è
   * lavoro prodotto per la persona: si salva dove lo ritrova.
   */
  const inMemoria = [];
  const inLibreria = [];
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, artefatti: [{ titolo: 'Grafico: vendite/mese', html: '<!doctype html><p>ciao</p>' }] },
  });
  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    salvaArtefattoFn: (id, h) => inMemoria.push({ id, html: h }),
    salvaVoceLibreriaFn: async (voce) => { inLibreria.push(voce); return 'lib-1'; },
  });
  assert.equal(inMemoria.length, 1, 'la copia in memoria resta: serve a servire la rotta senza toccare il disco');
  assert.equal(inLibreria.length, 1, "e adesso c'è anche la copia durevole");
  assert.equal(inLibreria[0].cartella, '/tmp/x', 'nella Libreria del progetto di questa sessione');
  assert.equal(inLibreria[0].mediaType, 'text/html');
  assert.equal(inLibreria[0].origine, 'generated');
  assert.equal(inLibreria[0].nome, 'Grafico- vendite-mese.html', 'il titolo diventa un nome di file valido, senza caratteri proibiti');
  assert.equal(inLibreria[0].testo, '<!doctype html><p>ciao</p>');
});

test("⛔⛔ AL CONTRARIO — se la Libreria non è scrivibile l'artefatto resta comunque a schermo", async () => {
  const eventi = [];
  const inMemoria = [];
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, artefatti: [{ titolo: 'x', html: '<p>x</p>' }] },
  });
  const esito = await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn,
    salvaArtefattoFn: (id, h) => inMemoria.push({ id, html: h }),
    salvaVoceLibreriaFn: async () => { throw new Error('disco pieno'); },
  });
  assert.equal(inMemoria.length, 1, 'meglio un artefatto senza copia che un giro rotto per una scrittura');
  assert.ok(eventi.some((e) => e.type === 'ArtifactCreated'), "e l'artefatto compare comunque in chat");
  assert.ok(esito, 'il giro non fallisce');
});

/*
 * ⛔⛔ 07/09/2026, O-37 — owner: «con i modelli a chiave API gli artefatti vengono creati ma non
 *   salvati nella Libreria». RIPRODOTTO con un giro vero (GLM 5.3 Flash, istanza di prova 4311, store
 *   separato): il modello ha usato `document_create`, il `.docx` è finito nel workspace (7,7 KB sul
 *   disco) e in `.harness-ui-library/` non è comparso NIENTE — la cartella non è stata nemmeno creata.
 *   La causa non era un guasto: era un commento rimasto indietro. `onDocumento` diceva «qui non c'è
 *   una Libreria (il desktop non ne ha una)» — vero fino al 28/8, falso dal 29/8 (FASE N). Gli
 *   artefatti HTML la copia ce l'avevano; i documenti no, e il modello usa proprio quelli.
 */
test('⭐⭐⭐ O-37: un documento creato finisce ANCHE in Libreria, e i binari ci vanno in base64', async () => {
  const inLibreria = [];
  const bytesDocx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0xfe]); // firma ZIP: un .docx vero comincia così, e non è UTF-8
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, documenti: [{ argomenti: { format: 'docx', title: 'Riepilogo', body: 'x' } }] },
  });

  const risultato = await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    generateTalosDocumentFn: async () => ({ format: 'docx', fileName: 'Riepilogo.docx', mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: bytesDocx }),
    verifyTalosDocumentFn: async () => ({ ok: true, detail: 'riaperto' }),
    creaFileWorkspaceFn: async ({ nome }) => ({ percorso: nome }),
    salvaVoceLibreriaFn: async (voce) => { inLibreria.push(voce); return 'lib-1'; },
  });

  assert.equal(risultato.ok, true);
  assert.equal(inLibreria.length, 1, 'il documento deve arrivare in Libreria: è lavoro prodotto per la persona');
  const voce = inLibreria[0];
  assert.equal(voce.nome, 'Riepilogo.docx');
  assert.equal(voce.origine, 'generated');
  assert.equal(voce.mediaType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(voce.testo, undefined, 'un binario non passa mai per il campo di testo: si corromperebbe');
  assert.equal(voce.base64, Buffer.from(bytesDocx).toString('base64'));
});

test('O-37: un formato TESTUALE va in Libreria come testo, non come base64', async () => {
  const inLibreria = [];
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, documenti: [{ argomenti: { format: 'md', title: 'Note', body: 'x' } }] },
  });
  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    generateTalosDocumentFn: async () => ({ format: 'md', fileName: 'Note.md', mediaType: 'text/markdown', bytes: new TextEncoder().encode('# Note\nriga') }),
    verifyTalosDocumentFn: async () => ({ ok: true, detail: 'ok' }),
    creaFileWorkspaceFn: async ({ nome }) => ({ percorso: nome }),
    salvaVoceLibreriaFn: async (voce) => { inLibreria.push(voce); return 'lib-2'; },
  });
  assert.equal(inLibreria[0].testo, '# Note\nriga');
  assert.equal(inLibreria[0].base64, undefined);
});

test('O-37, al contrario: se la Libreria non è scrivibile il GIRO NON si rompe', async () => {
  /*
   * ⛔ Un artefatto senza copia è un fastidio; un giro rotto per una scrittura è un danno. La stessa
   *   scelta già presa per gli artefatti HTML: si registra nel log del server, mai in silenzio, e il
   *   documento resta dov'è — nel workspace, dove il modello l'ha messo.
   */
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, documenti: [{ argomenti: { format: 'md', title: 'Note', body: 'x' } }] },
  });
  const risultato = await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    generateTalosDocumentFn: async () => ({ format: 'md', fileName: 'Note.md', mediaType: 'text/markdown', bytes: new TextEncoder().encode('x') }),
    verifyTalosDocumentFn: async () => ({ ok: true, detail: 'ok' }),
    creaFileWorkspaceFn: async ({ nome }) => ({ percorso: nome }),
    salvaVoceLibreriaFn: async () => { throw new Error('disco pieno'); },
  });
  assert.equal(risultato.ok, true, 'il giro deve concludersi lo stesso');
});

/*
 * ⛔⛔⛔ D-10B — L'USCITA DI UN COMANDO ARRIVAVA TUTTA ALLA FINE.
 *
 * Misurato: 2.091 ms di schermo fermo su un comando da 2.091 ms. Chi lancia `!npm test` col `!` del
 * composer guarda un riquadro vuoto finché non finisce, e non sa nemmeno se è partito.
 * Ricerca 10/09/2026: AG-UI («a vocabulary of typed events that agents emit to frontends», dove
 * l'avanzamento è distinto dal messaggio finale) e Vercel Academy, «Streaming and Tool Rendering».
 */
test('D-10B: i pezzi di output escono come ToolCallOutput PRIMA del risultato, e nell’ordine', async () => {
  const eventi = [];
  const eseguiComandoSandboxatoFn = async (comando, cartella, { onPezzo }) => {
    onPezzo({ flusso: 'fuori', testo: 'riga uno\n' });
    onPezzo({ flusso: 'errori', testo: 'attenzione\n' });
    onPezzo({ flusso: 'fuori', testo: 'riga due\n' });
    return { codice: 0, testo: 'riga uno\nattenzione\nriga due', enforcement: 'none' };
  };
  await eseguiComandoDiretto({ cartella: '/tmp/x', comando: 'x', onEvento: (e) => eventi.push(e), eseguiComandoSandboxatoFn });

  const tipi = eventi.map((e) => e.type);
  const primaUscita = tipi.indexOf('ToolCallOutput');
  const esito = tipi.indexOf('ToolCallResult');
  assert.notEqual(primaUscita, -1, '⛔ senza ToolCallOutput lo schermo resta fermo come prima');
  assert.ok(primaUscita < esito, '⛔ l’avanzamento arriva PRIMA del risultato, mai dopo');
  const uscite = eventi.filter((e) => e.type === 'ToolCallOutput');
  assert.equal(uscite.map((e) => e.delta).join(''), 'riga uno\nattenzione\nriga due\n',
    '⛔ né perso né riordinato: è lo stesso ordine in cui i due flussi sono arrivati (D-10C)');
  assert.ok(uscite.every((e) => typeof e.toolCallId === 'string' && e.toolCallId));
  /* ⛔ E l'esito finale non cambia di un byte: chi leggeva solo quello vede quel che vedeva. */
  assert.equal(eventi.find((e) => e.type === 'ToolCallResult').content, 'exit 0 [sandbox: none]\nriga uno\nattenzione\nriga due');
});

test('D-10B, AL CONTRARIO: un comando muto non inventa nessun ToolCallOutput', async () => {
  const eventi = [];
  await eseguiComandoDiretto({
    cartella: '/tmp/x', comando: 'true', onEvento: (e) => eventi.push(e),
    eseguiComandoSandboxatoFn: async () => ({ codice: 0, testo: '', enforcement: 'none' }),
  });
  assert.equal(eventi.filter((e) => e.type === 'ToolCallOutput').length, 0);
  assert.equal(eventi.filter((e) => e.type === 'ToolCallResult').length, 1);
});

test('D-10B: un comando che stampa senza fermarsi ha un TETTO, e non riempie la chat', async () => {
  const eventi = [];
  await eseguiComandoDiretto({
    cartella: '/tmp/x', comando: 'yes', onEvento: (e) => eventi.push(e),
    eseguiComandoSandboxatoFn: async (c, k, { onPezzo }) => {
      for (let i = 0; i < 200; i += 1) onPezzo({ flusso: 'fuori', testo: 'x'.repeat(1_000) });
      return { codice: 0, testo: 'tagliato', enforcement: 'none' };
    },
  });
  const mandati = eventi.filter((e) => e.type === 'ToolCallOutput').reduce((n, e) => n + e.delta.length, 0);
  assert.ok(mandati > 0, 'qualcosa deve pur uscire');
  assert.ok(mandati <= 40_000, `⛔ il tetto è 40.000 caratteri, mandati ${mandati}: senza, 200 KB finiscono nella chat`);
});

/*
 * ⛔⛔⛔ LA CARTELLA DI LAVORO CHE RESTA — owner 10/09, con la sua schermata: `ls` mostrava il
 * Desktop, `cd Games` non faceva niente, e un `ls` dopo mostrava ancora il Desktop. «Non funziona un
 * cazzo». Ogni comando ripartiva da capo: non era un terminale, erano esecuzioni isolate.
 * Fonte: anthropics/claude-code#16361, «Working directory does not persist between Bash commands on
 * Windows» (letto il 10/09/2026) — stesso difetto, stessa causa: `cd` è interno alla shell e muore
 * con lei, quindi la cartella va tenuta come STATO di chi chiama.
 */
test('CARTELLA: eseguiComandoDiretto chiede la traccia e riporta dove il comando si è fermato', async () => {
  let opzioni = null;
  const risultato = await eseguiComandoDiretto({
    cartella: '/tmp/base', comando: 'cd sotto', onEvento: () => {},
    eseguiComandoSandboxatoFn: async (c, k, o) => { opzioni = o; return { codice: 0, testo: '', enforcement: 'wsl2', cartellaFinale: '/tmp/base/sotto' }; },
  });
  assert.equal(opzioni.tracciaCartella, true, '⛔ senza questo il kernel non dice dove si è fermato');
  assert.equal(risultato.cartellaFinale, '/tmp/base/sotto', 'e chi chiama la riceve, per passarla al comando dopo');
});

test('⛔ CARTELLA, AL CONTRARIO: se il comando non sa dire dove si è fermato, si torna a `null`', async () => {
  const risultato = await eseguiComandoDiretto({
    cartella: '/tmp/base', comando: 'echo x', onEvento: () => {},
    /* Un ramo che non supporta la traccia (adb) non mette `cartellaFinale`: e non deve inventarla. */
    eseguiComandoSandboxatoFn: async () => ({ codice: 0, testo: 'x', enforcement: 'adb-shell-on-device' }),
  });
  assert.equal(risultato.cartellaFinale, null, '⛔ meglio ripartire da un posto noto che da uno inventato');
});

/*
 * ⛔⛔⛔ D-10F — DOVE GIRA UN COMANDO: UNA SCELTA, NON UNA SORPRESA.
 *
 * Misurato il 10/09: `!npm --version` rispondeva `11.16.0`, che è l'npm di Linux; un comando col
 * programma assente in WSL finiva invece su `cmd`. Due sistemi operativi nella stessa sessione, a
 * seconda di cosa scrivi — con due filesystem, due PATH e due `node` diversi, e nessuno che l'abbia
 * scelto. Ricerca 10/09/2026: Claude Code su Windows è nativo e usa PowerShell (WSL solo se lo
 * scegli), Codex CLI idem; in entrambi la scelta è UNA e DICHIARATA. Owner: «io punterei sulla
 * scelta».
 */
test('D-10F: la scelta di dove gira il comando arriva al kernel', async () => {
  let opzioni = null;
  await eseguiComandoDiretto({
    cartella: '/tmp/x', comando: 'npm --version', onEvento: () => {}, dove: 'windows',
    eseguiComandoSandboxatoFn: async (c, k, o) => { opzioni = o; return { codice: 0, testo: '', enforcement: 'none' }; },
  });
  assert.equal(opzioni.dove, 'windows');
});

test('⛔ D-10F, AL CONTRARIO: senza scelta si passa `null`, cioè il comportamento di prima', async () => {
  let opzioni = null;
  await eseguiComandoDiretto({
    cartella: '/tmp/x', comando: 'npm --version', onEvento: () => {},
    eseguiComandoSandboxatoFn: async (c, k, o) => { opzioni = o; return { codice: 0, testo: '', enforcement: 'wsl2' }; },
  });
  assert.equal(opzioni.dove, null, '⛔ chi non sceglie non deve vedere nessun cambiamento');
});


/*
 * ⛔⛔⛔ BC-11 (11/09/2026) — «MENO GIRI POSSIBILI»: le prove della metà di agent-service.
 *
 * I numeri della riproduzione, dalle due sessioni vere dell'owner (`.sessions-store/8dde6bff-*.jsonl`
 * e `37e10d21-*.jsonl`, compito «genera un file html di almeno 1000 righe»):
 *   · 119 chiamate `shell` contro 23 `scrivi` nella prima, 99 contro 6 nella seconda;
 *   · 46 chiamate su 308 col NOME dell'argomento sbagliato (`command`, `path`, `content`, `contuto`);
 *   · il modello si è inventato `_p2.html`, `_p3.html`, `_p4.html`, `_p5.html`, `_p6core.js`.
 * Il messaggio di rifiuto di `document_create` diceva letteralmente «offer a different title»: era
 * l'harness a insegnare quella strada. Qui si prova che ora ne insegna un'altra, e che il verso
 * contrario (nessun `mode`) è rimasto quello di prima.
 */

test('⭐⭐⭐ BC-11 document_create mode:"append": la modalità arriva a workspace-files, e l\'esito dice quanto è cresciuto il file', async () => {
  let specRicevuta = null;
  let esito = null;
  const talosLavoraFn = talosLavoraFinto({
    script: {
      esito: { comeFinita: 'concluso', detto: 'fatto' },
      documenti: [{ argomenti: { format: 'md', title: 'Lungo', body: 'parte 2', mode: 'append' }, raccogli: (e) => { esito = e; } }],
    },
  });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    generateTalosDocumentFn: async () => ({ format: 'md', fileName: 'Lungo.md', mediaType: 'text/markdown', bytes: new TextEncoder().encode('parte 2') }),
    verifyTalosDocumentFn: async () => ({ ok: true, detail: '7 caratteri' }),
    creaFileWorkspaceFn: async (spec) => { specRicevuta = spec; return { percorso: spec.nome, accodato: true, byteTotali: 4096 }; },
  });

  assert.equal(specRicevuta.modalita, 'accoda', 'il `mode` del modello deve arrivare fino alla scrittura');
  assert.equal(esito.ok, true);
  assert.match(esito.esito, /Appended .* to "Lungo\.md" — it is now 4 KB/);
});

test('⭐⭐ BC-11 document_create: gli ALIAS del nome della modalità (mode/modalita/append:true) valgono tutti — 46 chiamate su 308 sbagliavano il nome', async () => {
  for (const argomentiModalita of [{ mode: 'append' }, { modalita: 'accoda' }, { append: true }, { mode: 'APPEND ' }]) {
    let specRicevuta = null;
    const talosLavoraFn = talosLavoraFinto({
      script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, documenti: [{ argomenti: { format: 'md', title: 'L', body: 'x', ...argomentiModalita } }] },
    });
    await avviaSessione({
      cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
      generateTalosDocumentFn: async () => ({ format: 'md', fileName: 'L.md', mediaType: 'text/markdown', bytes: new TextEncoder().encode('x') }),
      verifyTalosDocumentFn: async () => ({ ok: true, detail: 'ok' }),
      creaFileWorkspaceFn: async (spec) => { specRicevuta = spec; return { percorso: spec.nome, accodato: true, byteTotali: 2 }; },
    });
    assert.equal(specRicevuta.modalita, 'accoda', `alias non riconosciuto: ${JSON.stringify(argomentiModalita)}`);
  }
});

test('⛔⛔⛔ BC-11 AL CONTRARIO — senza `mode` la modalità resta "nuovo": il comportamento di sempre, nessuna aggiunta per distrazione', async () => {
  let specRicevuta = null;
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' }, documenti: [{ argomenti: { format: 'md', title: 'Nuovo', body: 'x' } }] },
  });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    generateTalosDocumentFn: async () => ({ format: 'md', fileName: 'Nuovo.md', mediaType: 'text/markdown', bytes: new TextEncoder().encode('x') }),
    verifyTalosDocumentFn: async () => ({ ok: true, detail: 'ok' }),
    creaFileWorkspaceFn: async (spec) => { specRicevuta = spec; return { percorso: spec.nome }; },
    ...libreriaFinta(),
  });

  assert.equal(specRicevuta.modalita, 'nuovo');
});

test('⛔⛔⛔ BC-11 un nome già preso NON insegna più «offer a different title»: insegna mode:"append"', async () => {
  let esito = null;
  const talosLavoraFn = talosLavoraFinto({
    script: {
      esito: { comeFinita: 'concluso', detto: 'fatto' },
      documenti: [{ argomenti: { format: 'md', title: 'Doppio', body: 'x' }, raccogli: (e) => { esito = e; } }],
    },
  });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    generateTalosDocumentFn: async () => ({ format: 'md', fileName: 'Doppio.md', mediaType: 'text/markdown', bytes: new TextEncoder().encode('x') }),
    verifyTalosDocumentFn: async () => ({ ok: true, detail: 'ok' }),
    creaFileWorkspaceFn: async () => { throw new WorkspaceFileError('Esiste già un file con questo nome', 'FILE_EXISTS'); },
  });

  assert.equal(esito.ok, false);
  assert.match(esito.esito, /mode:"append"/);
  assert.match(esito.esito, /Do not invent numbered variants/);
});

test('⛔⛔⛔ BC-11 un formato BINARIO rifiuta l\'aggiunta PRIMA di scrivere: due .docx concatenati sono un file corrotto', async () => {
  let scritturaTentata = false;
  let esito = null;
  const talosLavoraFn = talosLavoraFinto({
    script: {
      esito: { comeFinita: 'concluso', detto: 'fatto' },
      documenti: [{ argomenti: { format: 'docx', title: 'Rel', body: 'x', mode: 'append' }, raccogli: (e) => { esito = e; } }],
    },
  });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    generateTalosDocumentFn: async () => ({ format: 'docx', fileName: 'Rel.docx', mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: new Uint8Array([0x50, 0x4b]) }),
    verifyTalosDocumentFn: async () => ({ ok: true, detail: 'ok' }),
    creaFileWorkspaceFn: async () => { scritturaTentata = true; return { percorso: 'mai' }; },
  });

  assert.equal(scritturaTentata, false, 'la scrittura non deve nemmeno essere tentata');
  assert.equal(esito.ok, false);
  assert.match(esito.esito, /binary container/);

  /*
   * ⛔ 11/9 — IL RIFIUTO SUGGERIVA UN FORMATO CHE RIFIUTA ANCHE LUI. La frase diceva «use a text
   * format (md, html, txt, …)» e `html` NON è accodabile: non è nei `TALOS_SOURCE_TEXT_FORMATS` e
   * non è fra i due aggiunti a mano (`md`, `csv`) — `document-generator.mjs` non scrive il `body`
   * com'è, lo AVVOLGE in un documento intero, e accodarne due dà un file con due `<!doctype html>`.
   * Il commento sopra `formatoAccodabile` lo diceva già; la frase per il modello no.
   * ⇒ Qui non si controlla la STRINGA (cambierebbe a ogni riscrittura): si estraggono i formati
   *   nominati e si chiede che ognuno sia davvero accodabile. Un suggerimento nuovo e sbagliato
   *   casca allo stesso modo.
   */
  const nominati = (esito.esito.match(/\(([^)]*)\)\s*if you need to build it in pieces/) || [, ''])[1]
    .split(',').map((p) => p.trim()).filter((p) => /^[a-z0-9]+$/.test(p));
  assert.ok(nominati.length > 0, 'il rifiuto deve nominare almeno un formato che funziona');
  const accodabili = new Set([...TALOS_SOURCE_TEXT_FORMATS, 'md', 'csv']);
  for (const formato of nominati) {
    assert.ok(accodabili.has(formato), `il rifiuto suggerisce «${formato}», che non è accodabile`);
  }
});

test('⛔⛔ BC-11 un `mode` scritto male viene DETTO, non indovinato, e non si genera nulla', async () => {
  let generazioneTentata = false;
  let esito = null;
  const talosLavoraFn = talosLavoraFinto({
    script: {
      esito: { comeFinita: 'concluso', detto: 'fatto' },
      documenti: [{ argomenti: { format: 'md', title: 'X', body: 'x', mode: 'overwrite' }, raccogli: (e) => { esito = e; } }],
    },
  });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    generateTalosDocumentFn: async () => { generazioneTentata = true; return { format: 'md', fileName: 'X.md', mediaType: 'text/markdown', bytes: new Uint8Array() }; },
    verifyTalosDocumentFn: async () => ({ ok: true, detail: 'ok' }),
    creaFileWorkspaceFn: async ({ nome }) => ({ percorso: nome }),
  });

  assert.equal(generazioneTentata, false);
  assert.match(esito.esito, /is not a mode/);
});

test('⭐⭐ BC-11 l\'esito di una creazione riuscita INSEGNA come allungare il file, invece di lasciarlo scoprire', async () => {
  let esito = null;
  const talosLavoraFn = talosLavoraFinto({
    script: {
      esito: { comeFinita: 'concluso', detto: 'fatto' },
      documenti: [{ argomenti: { format: 'md', title: 'Lungo', body: 'x' }, raccogli: (e) => { esito = e; } }],
    },
  });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    generateTalosDocumentFn: async () => ({ format: 'md', fileName: 'Lungo.md', mediaType: 'text/markdown', bytes: new TextEncoder().encode('x') }),
    verifyTalosDocumentFn: async () => ({ ok: true, detail: 'ok' }),
    creaFileWorkspaceFn: async ({ nome }) => ({ percorso: nome }),
    ...libreriaFinta(),
  });

  assert.match(esito.esito, /call document_create again with the same title and mode:"append"/);
});

test('⛔⛔ BC-11 AL CONTRARIO — su un formato NON accodabile l\'esito non suggerisce l\'aggiunta: sarebbe un consiglio che corrompe il file', async () => {
  let esito = null;
  const talosLavoraFn = talosLavoraFinto({
    script: {
      esito: { comeFinita: 'concluso', detto: 'fatto' },
      documenti: [{ argomenti: { format: 'pdf', title: 'R', body: 'x' }, raccogli: (e) => { esito = e; } }],
    },
  });

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    generateTalosDocumentFn: async () => ({ format: 'pdf', fileName: 'R.pdf', mediaType: 'application/pdf', bytes: new Uint8Array([1]) }),
    verifyTalosDocumentFn: async () => ({ ok: true, detail: 'ok' }),
    creaFileWorkspaceFn: async ({ nome }) => ({ percorso: nome }),
    ...libreriaFinta(),
  });

  assert.doesNotMatch(esito.esito, /mode:"append"/);
});

test('⛔⛔ BC-11 un pezzo ACCODATO non diventa una voce nuova di Libreria: la Libreria custodisce documenti, non frammenti', async () => {
  let salvataggiLibreria = 0;
  const talosLavoraFn = talosLavoraFinto({
    script: {
      esito: { comeFinita: 'concluso', detto: 'fatto' },
      documenti: [
        { argomenti: { format: 'md', title: 'L', body: 'p1' } },
        { argomenti: { format: 'md', title: 'L', body: 'p2', mode: 'append' } },
      ],
    },
  });
  let primaChiamata = true;

  await avviaSessione({
    cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn,
    generateTalosDocumentFn: async () => ({ format: 'md', fileName: 'L.md', mediaType: 'text/markdown', bytes: new TextEncoder().encode('p') }),
    verifyTalosDocumentFn: async () => ({ ok: true, detail: 'ok' }),
    creaFileWorkspaceFn: async ({ nome }) => {
      const accodato = !primaChiamata; primaChiamata = false;
      return { percorso: nome, ...(accodato ? { accodato: true, byteTotali: 4 } : {}) };
    },
    salvaVoceLibreriaFn: async () => { salvataggiLibreria += 1; return { id: 'v1' }; },
  });

  assert.equal(salvataggiLibreria, 1, 'una sola voce per un file, non una per pezzo');
});
