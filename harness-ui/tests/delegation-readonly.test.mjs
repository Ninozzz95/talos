import test from 'node:test';
import { togliConfiniDati } from '../src/kernel/confine-dati.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { creaSubagentOrchestrator, taskRichiedeEvidenzaScrittura, esitoDelegaDaEventi } from '../src/subagent-orchestrator.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const contratto = modalita => ({ schema: 'talos.delegation.v1', modalita });
const taskLettura = { consegna: 'Leggi alpha.txt senza scrivere nulla.', contrattoDelega: contratto('lettura') };
const eventiLettura = [{ type: 'ToolCallResult', isError: false, content: 'TOKEN_OK' }, { type: 'RunFinished' }];

test('DELEGHE02-NEGATION: historical read-only requests do not demand a write', () => {
  for (const task of ['Leggi alpha.txt senza scrivere nulla.', 'Non modificare o creare file. Analizza.',
    'Leggi senza scrivere, modificare o eliminare file.', 'Read the file without writing or modifying anything.',
    'Do not write or delete files. Read alpha.txt.', 'Analizza i crediti disponibili.',
    'Sei una sessione autonoma che puo scrivere. Compito: leggi alpha.txt senza scrivere nulla.']) {
    assert.equal(taskRichiedeEvidenzaScrittura(task), false, task);
    assert.equal(esitoDelegaDaEventi(eventiLettura, { task }), 'concluso', task);
  }
});

test('DELEGHE02-MIXED: a local prohibition does not erase the requested modification', () => {
  for (const task of ['Scrivi A senza modificare B.', 'Non modificare B. Aggiungi un test in A.',
    'Write A without modifying B.', 'Read B and update A without deleting B.']) {
    assert.equal(taskRichiedeEvidenzaScrittura(task), true, task);
    assert.equal(esitoDelegaDaEventi(eventiLettura, { task }), 'fallito', task);
  }
  assert.equal(esitoDelegaDaEventi(eventiLettura, { task: taskLettura }), 'concluso');
});

test('DELEGHE02-UNFULFILLED: read-only capability cannot turn an unperformed requested write into success', () => {
  assert.equal(esitoDelegaDaEventi(eventiLettura, {
    task: { consegna: 'Scrivi alpha.txt.', contrattoDelega: contratto('lettura') },
  }), 'fallito');
  assert.equal(esitoDelegaDaEventi([{ type: 'RunFinished' }], {
    task: { consegna: 'Analizza.', contrattoDelega: { schema: 'corrupt' } },
  }), 'fallito');
});

function orchestrator(parent = {}) {
  const starts = [];
  const sessioni = new Map([['parent', { cartella: process.cwd(), modello: 'fixture', permessi: 'Full access',
    permessiPerAttrezzo: { scrivi: 'sempre', shell: 'chiedi', prova: 'nega' }, ...parent }]]);
  const orch = creaSubagentOrchestrator({ sessioni, cartellaEsisteFn: () => true,
    avviaESeguiFn(opts) { starts.push(opts); return { sessionId: 'child' }; },
  });
  return { starts, run: extra => orch.delegaSottoTask({ sessionPadreId: 'parent', task: 'Analizza alpha.txt.', ...extra }) };
}

test('DELEGHE02-READONLY: an explicit read-only analysis keeps a durable read-only contract and no inherited allow', async () => {
  const { run, starts } = orchestrator();
  assert.equal((await run({ modalita: 'lettura' })).esito, 'avviato');
  assert.equal(starts[0].permessiRichiesti, 'Read only');
  assert.deepEqual(starts[0].permessiPerAttrezzoRichiesti, { prova: 'nega' });
  assert.deepEqual(starts[0].task.contrattoDelega, contratto('lettura'));
  assert.equal(starts[0].cartellaGiaScelta, true);
});

/* ⭐ F-022 (owner 01/10/2026, «come Hermes: eredita i permessi del padre»): senza modalità la figlia ha i permessi del padre,
   mai di più; con il padre in sola lettura parte in sola lettura invece di essere rifiutata. */
test('F022-DEFAULT: without a mode the child inherits the parent permissions, never more', async () => {
  const { run, starts } = orchestrator({ permessi: 'Workspace write' });
  const esito = await run();
  assert.equal(esito.esito, 'avviato');
  assert.match(esito.riassunto, /with the parent's permissions/);
  assert.equal(starts[0].permessiRichiesti, 'Workspace write');
  assert.deepEqual(starts[0].permessiPerAttrezzoRichiesti, { scrivi: 'sempre', shell: 'chiedi', prova: 'nega' });
  assert.deepEqual(starts[0].task.contrattoDelega, contratto('modifica'));
});

test('F022-PARENT-READONLY: without a mode, a read-only parent starts a read-only child instead of refusing', async () => {
  for (const parent of [{ permessi: 'Read only' }, { task: taskLettura }]) {
    const { run, starts } = orchestrator(parent);
    const esito = await run();
    assert.equal(esito.esito, 'avviato');
    assert.match(esito.riassunto, /read-only/);
    assert.equal(starts[0].permessiRichiesti, 'Read only');
    assert.deepEqual(starts[0].task.contrattoDelega, contratto('lettura'));
  }
});

test('DELEGHE02-WRITE: explicit modification preserves parent limits and the workspace', async () => {
  const { run, starts } = orchestrator({ permessi: 'Workspace write' });
  assert.equal((await run({ task: 'Scrivi A.', modalita: 'modifica' })).esito, 'avviato');
  assert.equal(starts[0].permessiRichiesti, 'Workspace write');
  assert.deepEqual(starts[0].permessiPerAttrezzoRichiesti, { scrivi: 'sempre', shell: 'chiedi', prova: 'nega' });
  assert.deepEqual(starts[0].task.contrattoDelega, contratto('modifica'));
});

test('DELEGHE02-PARENT: child cannot acquire modification from a read-only parent', async () => {
  for (const parent of [{ permessi: 'Read only' }, { task: taskLettura }]) {
    const { run, starts } = orchestrator(parent);
    assert.equal((await run({ modalita: 'modifica' })).esito, 'rifiutato');
    assert.equal(starts.length, 0);
  }
});

test('DELEGHE02-INVALID: malformed mode never starts a model', async () => {
  for (const modalita of [null, false, {}, 'Full access', '']) {
    const { run, starts } = orchestrator();
    assert.equal((await run({ modalita })).esito, 'rifiutato');
    assert.equal(starts.length, 0);
  }
});

function workspace(t) {
  const p = mkdtempSync(join(tmpdir(), 'talos-deleghe02-'));
  t.after(() => rimuoviCartellaDiProva(p));
  return p;
}

function providerControllato(calls) {
  const requests = [];
  return { requests, async fetch(_url, init) {
    requests.push(JSON.parse(init.body));
    assert.ok(requests.length <= 2, 'no unexpected extra request');
    const choice = requests.length === 1
      ? { delta: { role: 'assistant', tool_calls: calls.map(([name, args], index) => ({ index, id: `call-${index}`, type: 'function',
        function: { name, arguments: JSON.stringify(args) } })) }, finish_reason: 'tool_calls' }
      : { delta: { content: 'Analisi completata.' }, finish_reason: 'stop' };
    return new Response(`data: ${JSON.stringify({ choices: [choice] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
  } };
}

async function giro(cartella, calls, extra = {}, task = taskLettura) {
  const provider = providerControllato(calls), events = [];
  const result = await avviaSessione({ cartella, task, modello: 'fixture', chiave: 'unused',
    onEvento: e => events.push(e), talosLavoraFn: input => talosLavora({ ...input, livelloAccesso: 'accesso-pieno',
      permessiPerAttrezzo: { scrivi: 'sempre', shell: 'sempre', prova: 'sempre' },
      giriMassimi: 2, fetchDiRete: provider.fetch, ...extra }),
  });
  return { result, events, requests: provider.requests };
}

test('DELEGHE02-DISPATCH: all mutation surfaces are refused even when the model bypasses its tool list', async t => {
  const cartella = workspace(t);
  writeFileSync(join(cartella, 'alpha.txt'), 'TOKEN_OK');
  let callbacks = 0, hooks = 0;
  const callback = async () => { callbacks++; return { ok: true, esito: 'created', riassunto: 'created', content: [] }; };
  const denied = [
    ['scrivi', { percorso: 'GATE-RESEARCH-NOTE.md', contenuto: 'unrequested' }],
    ['shell', { comando: 'echo never' }], ['prova', {}],
    ['artifact_create', { title: 'not requested', content: 'x' }], ['document_create', { name: 'x', content: 'x' }],
    ['notes_create', { titolo: 'x', testo: 'x' }], ['tasks_create', { titolo: 'x' }], ['memory_add', { text: 'x' }],
    ['delega_sottotask', { task: 'Scrivi A.', modalita: 'modifica' }],
    ['mcp_write', {}], ['plugin_write', {}], ['forge_write', {}], ['future_mutation', {}],
  ];
  const { events, requests } = await giro(cartella, [['leggi', { percorso: 'alpha.txt' }], ...denied], {
    strumentiEstesi: denied.map(([name]) => name), onDelega: callback, onArtefatto: callback, onDocumento: callback,
    onNotaCrea: callback, onAttivitaCrea: callback, onMemoriaAggiungi: callback,
    toolMcp: [{ name: 'mcp_write', annotations: { readOnlyHint: true } }], chiamaToolMcpFn: callback,
    toolPlugin: [{ nome: 'plugin_write' }], eseguiToolPluginFn: callback,
    toolForge: [{ name: 'forge_write' }], eseguiToolForgeFn: callback,
    hookFn: async () => { hooks++; return { consentito: true }; },
    comandoProva: `"${process.execPath}" -e "process.exit(0)"`,
  });
  assert.equal(callbacks, 0);
  assert.equal(hooks, 0, 'arbitrary executable hooks are not a read-only capability');
  assert.equal(existsSync(join(cartella, 'GATE-RESEARCH-NOTE.md')), false);
  assert.equal(readFileSync(join(cartella, 'alpha.txt'), 'utf8'), 'TOKEN_OK');
  const results = events.filter(e => e.type === 'ToolCallResult');
  assert.equal(results.length, denied.length + 1);
  assert.equal(togliConfiniDati(results[0].content), 'TOKEN_OK');
  for (const e of results.slice(1)) { assert.equal(e.isError, true); assert.match(e.content, /DELEGATION_READ_ONLY/); }
  const offered = requests[0].tools.map(t => t.function.name);
  for (const [name] of denied) assert.ok(!offered.includes(name), name);
});

test('DELEGHE02-LEGACY: root sessions without a contract retain their existing dispatch', async t => {
  let calls = 0;
  const { events } = await giro(workspace(t), [['mcp_test', {}]], {
    toolMcp: [{ name: 'mcp_test' }], chiamaToolMcpFn: async () => { calls++; return { content: [{ type: 'text', text: 'ok' }] }; },
  }, { consegna: 'Usa lo strumento.' });
  assert.equal(calls, 1);
  assert.equal(togliConfiniDati(events.find(e => e.type === 'ToolCallResult').content), 'ok');
});

test('DELEGHE02-ACTUAL-WRITE: an explicit modification writes real bytes and preserves parent denials', async t => {
  const cartella = workspace(t);
  const task = { consegna: 'Scrivi alpha.txt.', contrattoDelega: contratto('modifica') };
  const success = await giro(cartella, [['scrivi', { percorso: 'alpha.txt', contenuto: 'REQUESTED' }]], {}, task);
  assert.equal(readFileSync(join(cartella, 'alpha.txt'), 'utf8'), 'REQUESTED');
  assert.equal(esitoDelegaDaEventi(success.events, { task }), 'concluso');
  await giro(cartella, [['scrivi', { percorso: 'alpha.txt', contenuto: 'MUST_NOT_REPLACE' }]],
    { permessiPerAttrezzo: { scrivi: 'nega' } }, task);
  assert.equal(readFileSync(join(cartella, 'alpha.txt'), 'utf8'), 'REQUESTED');
});

test('DELEGHE02-CANCEL: Stop before dispatch leaves the workspace intact', async t => {
  const cartella = workspace(t), controller = new AbortController();
  const provider = providerControllato([['scrivi', { percorso: 'cancelled.txt', contenuto: 'no' }]]);
  await avviaSessione({ cartella, task: taskLettura, modello: 'fixture', chiave: 'unused', segnaleStop: controller.signal,
    onEvento(e) { if (e.type === 'ToolCallStart') controller.abort(); },
    talosLavoraFn: input => talosLavora({ ...input, livelloAccesso: 'accesso-pieno', giriMassimi: 2, fetchDiRete: provider.fetch }),
  });
  assert.equal(existsSync(join(cartella, 'cancelled.txt')), false);
  assert.equal(provider.requests.length, 1);
});

test('DELEGHE02-CORRUPT: an invalid persisted contract blocks even prestarted reads', async t => {
  const cartella = workspace(t);
  writeFileSync(join(cartella, 'alpha.txt'), 'MUST_NOT_READ');
  let opened = 0;
  const original = fsPromises.open;
  const spy = t.mock.method(fsPromises, 'open', (...args) => {
    if (String(args[0]) === join(cartella, 'alpha.txt')) opened++;
    return original(...args);
  });
  syncBuiltinESMExports();
  try {
    // A single read waits for dispatch; two reads exercise the speculative prefix.
    const { events } = await giro(cartella, [['leggi', { percorso: 'alpha.txt' }], ['leggi', { percorso: 'alpha.txt' }]], {}, {
      consegna: 'Leggi.', contrattoDelega: { schema: 'future-or-corrupt', modalita: 'modifica' },
    });
    assert.equal(events.find(e => e.type === 'ToolCallResult').isError, true);
    assert.ok(events.every(e => !JSON.stringify(e).includes('MUST_NOT_READ')));
    assert.equal(opened, 0, 'a denial after opening the file would be too late');
  } finally {
    spy.mock.restore();
    syncBuiltinESMExports();
  }
});

test('DELEGHE02-EXTENSIONS: no MCP/plugin process or executable hook starts for a limited child', async t => {
  let starts = 0;
  await avviaSessione({ cartella: workspace(t), task: taskLettura, modello: 'fixture', chiave: 'unused', onEvento() {},
    cartellaTrustMcp: 'fixture', cartellaTrustPlugin: 'fixture',
    preparaToolMcpPerSessioneFn: async () => { starts++; return { toolMcp: [], chiudiTutti: async () => {} }; },
    preparaToolPluginPerSessioneFn: async () => { starts++; return { toolPlugin: [], hookPlugin: [] }; },
    hookFn: async () => { starts++; },
    talosLavoraFn: async input => { await input.hookFn?.({ tipo: 'session_start' }); return { detto: 'ok', comeFinita: 'concluso' }; },
  });
  assert.equal(starts, 0);
});

test('DELEGHE02-WIRE: the real tool forwards a typed mode and rejects an invalid one', async t => {
  const seen = [];
  const { events } = await giro(workspace(t), [
    ['delega_sottotask', { task: 'Leggi A.' }],
    ['delega_sottotask', { task: 'Scrivi A.', modalita: 'modifica' }],
    ['delega_sottotask', { task: 'A.', modalita: {} }],
  ], { strumentiEstesi: ['delega_sottotask'], onDelega: async (...args) => { seen.push(args); return { riassunto: 'avviato' }; } }, { consegna: 'Delega.' });
  assert.equal(seen.length, 2);
  // F-022: senza modalità il kernel non sceglie la sola lettura al posto dell'host — decide chi ospita la delega
  assert.deepEqual(seen[0][2], { modalita: undefined });
  assert.deepEqual(seen[1][2], { modalita: 'modifica' });
  assert.equal(events.filter(e => e.type === 'ToolCallResult').at(-1).isError, true);
});

test('DELEGHE02-JOURNAL: read-only verdict and authority survive restart, settings, resume and fork', async t => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-deleghe02-journal-'));
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-deleghe02-store-'));
  writeFileSync(join(cartella, 'alpha.txt'), 'TOKEN_OK');
  let parentInput, finishParent, starts = 0;
  const initial = providerControllato([['leggi', { percorso: 'alpha.txt' }]]);
  const registries = [], captured = [];
  t.after(async () => { finishParent?.(); for (const r of registries) await r.chiudi(); await attendiScritture({ cartellaStore });
    rimuoviCartellaDiProva(cartella); rimuoviCartellaDiProva(cartellaStore); });
  const registry = createSessionRegistry({ cartellaStore, modello: 'fixture', chiave: 'unused', guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: () => ({ cartella, task: { consegna: 'Analizza con una delega.' } }),
    avviaSessioneFn(input) {
      starts++;
      if (starts === 1) {
        parentInput = input;
        input.onEvento({ type: 'RunStarted', threadId: 'p', runId: 'p' });
        return new Promise(resolve => { finishParent = () => { finishParent = null;
          input.onEvento({ type: 'RunError', code: 'fermato', message: 'Stop' });
          resolve({ ok: false, esito: { detto: 'Stop', comeFinita: 'fermato' } });
        }; });
      }
      captured.push(input);
      return avviaSessione({ ...input, talosLavoraFn: opts => talosLavora({ ...opts, giriMassimi: 2, fetchDiRete: initial.fetch }) });
    },
  });
  registries.push(registry);
  const parent = registry.avvia('analysis', { permessiScelto: 'Full access' });
  const child = await parentInput.onDelega(taskLettura.consegna, cartella, { modalita: 'lettura' });
  assert.equal(child.esito, 'avviato');
  finishParent();
  await registry.attendiAssestamento(parent.sessionId);
  await registry.attendiAssestamento(child.childId);
  await t.waitFor(() => assert.equal(registry.elencaFigli(parent.sessionId).figli[0]?.conclusa, true));
  assert.equal(registry.elencaFigli(parent.sessionId).figli[0].esitoDelega, 'concluso');
  assert.deepEqual(captured[0].task.contrattoDelega, contratto('lettura'));
  await registry.chiudi();
  await attendiScritture({ cartellaStore });
  const resumedInputs = [], outputs = [];
  const restored = createSessionRegistry({ cartellaStore, chiave: 'unused', guardaWorkspaceFn: () => () => {},
    avviaSessioneFn(input) {
      resumedInputs.push(input);
      const provider = providerControllato([['scrivi', { percorso: 'forbidden.txt', contenuto: 'not allowed' }]]);
      return avviaSessione({ ...input, onEvento: (...args) => { outputs.push(args[0]); return input.onEvento(...args); },
        talosLavoraFn: opts => talosLavora({ ...opts, giriMassimi: 2, fetchDiRete: provider.fetch }) });
    },
  });
  registries.push(restored);
  await restored.ripristina();
  assert.equal(resumedInputs.length, 0);
  assert.equal(restored.elencaFigli(parent.sessionId).figli[0].esitoDelega, 'concluso');
  for (const patch of [{ permessi: 'Full access' }, { permessiPerAttrezzo: { scrivi: 'sempre' } }]) {
    assert.equal((await restored.aggiornaImpostazioni(child.childId, patch)).code, 'DELEGATION_READ_ONLY');
  }
  const resumed = restored.resume(child.childId, 'Continua la verifica.');
  assert.equal(resumed.erroreAvvio, undefined);
  await restored.attendiAssestamento(child.childId);
  const fork = restored.forka(child.childId);
  assert.equal(fork.erroreAvvio, undefined);
  await restored.attendiAssestamento(fork.sessionId);
  assert.equal(resumedInputs.length, 2);
  for (const input of resumedInputs) assert.deepEqual(input.task.contrattoDelega, contratto('lettura'));
  assert.equal(existsSync(join(cartella, 'forbidden.txt')), false);
  const results = outputs.filter(e => e.type === 'ToolCallResult');
  assert.equal(results.length, 2);
  assert.ok(results.every(e => e.isError === true && e.content.includes('DELEGATION_READ_ONLY')));
});

/* F-022 dal registro vero: la porta che il kernel chiama (`onDelega` senza modalità) arriva all'orchestratore senza che nessuno
   in mezzo rimetta la sola lettura; la figlia nasce coi permessi del padre. */
test('F022-REGISTRY: the real registry door forwards no mode, and the child gets the parent permissions', async t => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-f022-'));
  const inputs = [];
  const registry = createSessionRegistry({ cartellaStore, modello: 'fixture', chiave: 'unused', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, task: { id: 'task', consegna: 'Dividi il lavoro.' } }),
    avviaSessioneFn(input) { inputs.push(input); input.onEvento({ type: 'RunStarted' }); return new Promise(() => {}); } });
  t.after(async () => { await registry.chiudi(); await attendiScritture({ cartellaStore }); rimuoviCartellaDiProva(cartellaStore); });
  const { sessionId: padre } = registry.avvia('task');
  const esito = await inputs[0].onDelega('Scrivi A.', undefined, {});
  assert.equal(esito.esito, 'avviato');
  const figlia = registry.elencaFigli(padre).figli.find(f => f.sessionId === esito.childId);
  assert.equal(figlia.permessi, 'Workspace write', 'i permessi di serie del padre, non «Read only»');
});
