import assert from 'node:assert/strict';
import test from 'node:test';

import { avviaSessione, compattaSessione, eseguiComandoDiretto } from '../src/agent-service.mjs';

// `talosLavoraFn` finto: agent-service.mjs non deve mai far girare un vero
// talosLavora per essere provato — quello ha già i suoi 33 test in
// AVM-harness. Qui si prova SOLO la traduzione: quali eventi arrivano, in
// che ordine, con quali campi.

function talosLavoraFinto({ script, cattura = () => {} }) {
  return async (input) => {
    cattura(input);
    if (script.tipo === 'lancia') throw script.errore;
    input.onGiro?.({ tipo: 'risposta', giro: 0, risposta: { role: 'assistant', content: 'ciao', tool_calls: [] } });
    for (const scrittura of script.scritture ?? []) {
      input.onScrittura?.(scrittura.percorso, scrittura.contenuto);
    }
    for (const toolEsito of script.toolEsiti ?? []) {
      input.onGiro?.({ tipo: 'tool-esito', giro: 0, toolCallId: toolEsito.toolCallId, content: toolEsito.content });
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

test('onScrittura: la STESSA sessione vede "add" la prima volta su un percorso, "replace" la seconda', async () => {
  const eventi = [];
  const talosLavoraFn = talosLavoraFinto({
    script: {
      esito: { comeFinita: 'concluso', detto: 'fatto' },
      scritture: [
        { percorso: 'a.ts', contenuto: 'v1' },
        { percorso: 'a.ts', contenuto: 'v2' },
        { percorso: 'b.ts', contenuto: 'v1' },
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

test('avviaSessione passa cartella/modello/chiave/comandoProva/segnaleStop/messaggiIniziali intatti a talosLavora', async () => {
  let catturato = null;
  const controller = new AbortController();
  const messaggiIniziali = [{ role: 'system', content: 's' }];
  const talosLavoraFn = talosLavoraFinto({
    script: { esito: { comeFinita: 'concluso', detto: 'fatto' } },
    cattura: (input) => { catturato = input; },
  });

  await avviaSessione({
    cartella: '/tmp/progetto', task: TASK, modello: 'z-ai/glm-4.7-flash', chiave: 'segreta',
    comandoProva: 'npm run test:unit', segnaleStop: controller.signal, messaggiIniziali,
    onEvento: () => {}, talosLavoraFn,
  });

  assert.equal(catturato.cartella, '/tmp/progetto');
  assert.equal(catturato.modello, 'z-ai/glm-4.7-flash');
  assert.equal(catturato.chiave, 'segreta');
  assert.equal(catturato.comandoProva, 'npm run test:unit');
  assert.equal(catturato.segnaleStop, controller.signal);
  assert.equal(catturato.messaggiIniziali, messaggiIniziali);
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
