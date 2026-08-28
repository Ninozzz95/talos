import assert from 'node:assert/strict';
import test from 'node:test';

import { avviaSessione, compattaSessione, eseguiComandoDiretto } from '../src/agent-service.mjs';
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
      await input.onDocumento?.(documento.argomenti);
    }
    return script.esito;
  };
}

const TASK = { consegna: 'fai qualcosa' };

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

test('⭐ RunStarted porta il contesto workspace (progetto/cartella/branch), letto PRIMA di emettere l\'evento', async () => {
  const eventi = [];
  const contestoFinto = { progetto: 'listino', cartella: '/tmp/x', branch: null };
  const leggiContestoWorkspaceFn = () => contestoFinto;
  const talosLavoraFn = talosLavoraFinto({ script: { esito: { comeFinita: 'concluso', detto: 'fatto' } } });

  await avviaSessione({
    cartella: '/tmp/x', task: { ...TASK, progetto: 'listino' }, modello: 'm', chiave: 'k',
    onEvento: (e) => eventi.push(e), talosLavoraFn, leggiContestoWorkspaceFn,
  });

  assert.deepEqual(eventi[0].contesto, contestoFinto);
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

  assert.deepEqual(eventi.map((e) => e.type), ['RunStarted', 'ToolCallStart', 'ToolCallArgs', 'ToolCallResult', 'RunFinished']);
  assert.equal(eventi[1].toolCallName, 'shell', 'lo stesso nome attrezzo che il modello userebbe dentro talosLavora — un solo vocabolario');
  assert.equal(eventi[1].toolCallId, eventi[2].toolCallId, 'ToolCallArgs deve riferirsi allo STESSO toolCallId di ToolCallStart');
  assert.equal(eventi[1].toolCallId, eventi[3].toolCallId, 'e ToolCallResult pure');
  assert.match(eventi[3].content, /exit 0 \[sandbox: wsl2\]/, 'il livello usato e\' dichiarato nel testo, mai taciuto');
  assert.match(eventi[3].content, /ciao/);
  assert.deepEqual(eventi[4].outcome, { type: 'success' });
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
  assert.equal(finale.type, 'RunFinished', 'un\'uscita non-zero è informazione, non un guasto del SERVIZIO — vedi la stessa distinzione già in esitoInEventoFinale');
  assert.deepEqual(finale.outcome, { type: 'success' });
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

  assert.deepEqual(opzioniCatturate, { mobile: true });
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

  assert.deepEqual(opzioniCatturate, { mobile: false });
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
