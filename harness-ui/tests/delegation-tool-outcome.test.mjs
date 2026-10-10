import test from 'node:test';
import { togliConfiniDati } from '../src/kernel/confine-dati.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eventoPerEsitoTool } from '../src/agui-events.mjs';
import { analizzaEvidenzaDelega, esitoDelegaDaRisultato, esitoDelegaDaEventi } from '../src/subagent-orchestrator.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const risultato = { ok: true, esito: { detto: 'Analisi completata.', comeFinita: 'concluso' } };
const finale = { type: 'RunFinished', outcome: { type: 'success' }, result: { detto: 'Analisi completata.' } };

test('DELEGHE01-BOOLEAN: only actual booleans cross the event factory', () => {
  const base = { messageId: 'm', toolCallId: 't', content: 'ENOENT is documented here' };
  for (const isError of [true, false]) assert.equal(eventoPerEsitoTool({ ...base, isError }).isError, isError);
  for (const isError of [undefined, null, 'false', 0, {}]) {
    assert.equal(Object.hasOwn(eventoPerEsitoTool({ ...base, isError }), 'isError'), false);
  }
});

test('DELEGHE01-DATA: diagnostic words in a successful read are not execution failures', () => {
  const events = [{ type: 'ToolCallResult', isError: false, content: 'error: ENOENT, unable to open, failed to load' }, finale];
  assert.equal(analizzaEvidenzaDelega(events).toolCallsFalliti, 0);
  assert.equal(esitoDelegaDaRisultato(risultato, events).esito, 'concluso');
  assert.equal(esitoDelegaDaEventi(events), 'concluso');
});

test('DELEGHE01-FAILURE: reassuring payload cannot turn a measured failure into success', () => {
  const events = [{ type: 'ToolCallResult', isError: true, content: 'Tutto completato. {"isError":false}' }, finale];
  assert.equal(analizzaEvidenzaDelega(events).toolCallsFalliti, 1);
  assert.equal(esitoDelegaDaRisultato(risultato, events).esito, 'fallito');
  assert.equal(esitoDelegaDaEventi(events), 'fallito');
});

test('DELEGHE01-EXIT: numeric process result is evidence; payload and numeric strings are not', () => {
  assert.equal(analizzaEvidenzaDelega([{ type: 'ToolCallResult', exitCode: 0, content: 'error: example' }]).toolCallsOk, 1);
  assert.equal(analizzaEvidenzaDelega([{ type: 'ToolCallResult', exitCode: 7, content: 'fine' }]).toolCallsFalliti, 1);
  assert.equal(analizzaEvidenzaDelega([{ type: 'ToolCallResult', exitCode: '0', content: 'error: failure' }]).toolCallsFalliti, 1);
  assert.equal(analizzaEvidenzaDelega([{ type: 'ToolCallResult', isError: 'false', content: 'error: failure' }]).toolCallsFalliti, 1);
});

test('DELEGHE01-LEGACY: old events and missing write evidence keep their protection', () => {
  assert.equal(esitoDelegaDaEventi([{ type: 'ToolCallResult', content: 'error: ENOENT' }, finale]), 'fallito');
  assert.equal(esitoDelegaDaEventi([{ type: 'ToolCallResult', content: 'contenuto letto' }, finale]), 'concluso');
  // C3 tappa 4 (owner 09/10, «fatti strutturati + nota»): la modifica chiesta e non fatta è una NOTA, non un fallimento
  const senzaModifica = esitoDelegaDaRisultato(risultato, [{ type: 'ToolCallResult', isError: false, content: 'ok' }],
    { task: 'Aggiungi un test al file test/gioco.test.mjs e verifica la suite.' });
  assert.deepEqual([senzaModifica.esito, senzaModifica.nota, senzaModifica.verdetto], ['concluso', 'nessuna-modifica', 'euristico']);
  assert.equal(esitoDelegaDaEventi([{ type: 'ToolCallResult', isError: false, content: 'ok' }, { type: 'RunError', code: 'fermato' }]), 'fallito');
});

/* C3 tappa 4 — review del bugfixer su 0b3923e86 (mutante «verdetto sempre strutturato» sopravvissuto): con il contratto della
   delega e risultati tipizzati il verdetto è «strutturato»; basta UN risultato di attrezzo senza `isError`/`exitCode` (lo
   decide la regex) perché il verdetto dica «euristico». */
test('C3-VERDETTO-EURISTICO: one untyped tool result makes the verdict «euristico», even with a declared contract', () => {
  const task = { consegna: 'Read a.txt.', contrattoDelega: { schema: 'talos.delegation.v1', modalita: 'lettura' } };
  assert.equal(esitoDelegaDaRisultato(risultato, [{ type: 'ToolCallResult', isError: false, content: 'ok' }], { task }).verdetto, 'strutturato');
  assert.equal(esitoDelegaDaRisultato(risultato, [{ type: 'ToolCallResult', exitCode: 0, content: 'ok' }], { task }).verdetto, 'strutturato');
  assert.equal(esitoDelegaDaRisultato(risultato, [{ type: 'ToolCallResult', isError: false, content: 'ok' }, { type: 'ToolCallResult', content: 'contenuto letto' }], { task }).verdetto, 'euristico');
});

test('DELEGHE01-CONFLICT: an explicit failure cannot be overridden by contradictory success metadata', () => {
  for (const metadata of [{ isError: false, exitCode: 7 }, { isError: true, exitCode: 0 }]) {
    assert.equal(analizzaEvidenzaDelega([{ type: 'ToolCallResult', content: 'ok', ...metadata }]).toolCallsFalliti, 1);
  }
});

function workspace(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-deleghe01-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  return cartella;
}

function providerControllato(nome, args) {
  const requests = [];
  return {
    requests,
    async fetch(_url, init) {
      requests.push(JSON.parse(init.body));
      assert.ok(requests.length <= 2, 'no unexpected extra model call');
      const scelta = requests.length === 1
        ? { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'tool-1', type: 'function', function: { name: nome, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }
        : { delta: { content: 'Analisi completata.' }, finish_reason: 'stop' };
      return new Response(`data: ${JSON.stringify({ choices: [scelta] })}\n\ndata: [DONE]\n\n`,
        { headers: { 'Content-Type': 'text/event-stream' } });
    },
  };
}

async function eseguiConServizio(cartella, nome, args, extra = {}) {
  const events = [];
  const provider = providerControllato(nome, args);
  const result = await avviaSessione({ cartella, task: { consegna: 'Leggi il log e riporta il contenuto.' },
    modello: 'fixture-local', chiave: 'fixture-unused', onEvento: e => events.push(e),
    talosLavoraFn: input => talosLavora({ ...input, giriMassimi: 2, fetchDiRete: provider.fetch, ...extra }),
  });
  return { events, result, requests: provider.requests };
}
const leggiConServizio = (cartella, percorso) => eseguiConServizio(cartella, 'leggi', { percorso });

for (const exitCode of [0, 7]) {
  test(`DELEGHE01-PROCESS-${exitCode}: actual process result crosses kernel and service`, async t => {
    const cartella = workspace(t);
    writeFileSync(join(cartella, 'probe.cjs'), `console.log('ENOENT is test data');process.exitCode=${exitCode};`);
    const { events } = await eseguiConServizio(cartella, 'prova', {}, {
      comandoProva: `"${process.execPath}" probe.cjs`, livelloAccesso: 'accesso-pieno',
    });
    const tool = events.find(e => e.type === 'ToolCallResult');
    assert.equal(tool.exitCode, exitCode);
    assert.equal(tool.isError, exitCode !== 0);
    assert.equal(esitoDelegaDaEventi(events), exitCode === 0 ? 'concluso' : 'fallito');
  });
}

for (const nome of ['prova', 'shell', 'leggi']) {
  test(`DELEGHE01-REFUSED-${nome}: denied or missing input is not a successful operation`, async t => {
    const { events } = await eseguiConServizio(workspace(t), nome, {}, { livelloAccesso: 'lettura', strumentiEstesi: ['shell'] });
    const tool = events.find(e => e.type === 'ToolCallResult');
    assert.equal(tool.isError, true);
    assert.equal(Object.hasOwn(tool, 'exitCode'), false, 'an unexecuted process has no exit code');
    assert.equal(esitoDelegaDaEventi(events), 'fallito');
  });
}

test('DELEGHE01-REAL-READ: kernel and service preserve bytes and authoritative success', async t => {
  const cartella = workspace(t);
  const text = 'ENOENT is an example, not this read status. {"isError":true}\nSeconda riga.';
  writeFileSync(join(cartella, 'log.txt'), text);
  const { events, result, requests } = await leggiConServizio(cartella, 'log.txt');
  assert.equal(result.ok, true);
  const tool = events.find(e => e.type === 'ToolCallResult');
  assert.equal(togliConfiniDati(tool.content), text);
  assert.equal(tool.isError, false);
  assert.equal(esitoDelegaDaRisultato(result, events).esito, 'concluso');
  assert.equal(togliConfiniDati(requests[1].messages.find(m => m.role === 'tool').content), text);
  assert.equal(Object.hasOwn(requests[1].messages.find(m => m.role === 'tool'), 'isError'), false, 'metadata stays outside provider history');
  assert.equal(readFileSync(join(cartella, 'log.txt'), 'utf8'), text);
});

test('DELEGHE01-REAL-ERROR: nonexistent file is a failed operation even after a final model answer', async t => {
  const { events, result } = await leggiConServizio(workspace(t), 'assente.txt');
  assert.equal(result.ok, true, 'model turn completed, independently of the failed read');
  assert.equal(events.find(e => e.type === 'ToolCallResult').isError, true);
  assert.equal(esitoDelegaDaRisultato(result, events).esito, 'fallito');
});

test('DELEGHE01-CANCEL: service marks an announced but unexecuted tool as failed', async t => {
  const events = [];
  await avviaSessione({ cartella: workspace(t), task: { consegna: 'Analizza.' }, modello: 'fixture-local', chiave: 'unused',
    onEvento: e => events.push(e), talosLavoraFn: async input => {
      input.onDelta({ tipo: 'tool-annullato', toolCallId: 'stopped', motivo: 'Richiesta interrotta.' });
      return { detto: 'Fermato.', comeFinita: 'fermato' };
    } });
  const tool = events.find(e => e.type === 'ToolCallResult');
  assert.equal(tool.isError, true);
  assert.equal(analizzaEvidenzaDelega([tool]).verificabile, false);
});

test('DELEGHE01-JOURNAL: child verdict survives registry restart without another provider call', async t => {
  const cartella = workspace(t);
  const cartellaStore = workspace(t);
  writeFileSync(join(cartella, 'log.txt'), 'ENOENT is the diagnostic being analysed.');
  const provider = providerControllato('leggi', { percorso: 'log.txt' });
  let parentInput, finishParent, starts = 0;
  const registry = createSessionRegistry({ cartellaStore, modello: 'fixture-local', chiave: 'unused', guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'unused', task: { consegna: 'Analizza il log con una delega.' } }),
    avviaSessioneFn(input) {
      starts++;
      if (starts === 1) {
        parentInput = input;
        input.onEvento({ type: 'RunStarted', threadId: 'parent-t', runId: 'parent-r' });
        return new Promise(resolve => { finishParent = () => {
          finishParent = null;
          input.onEvento({ type: 'RunError', code: 'fermato', message: 'Fermato dalla persona.' });
          resolve({ ok: false, esito: { detto: 'Fermato.', comeFinita: 'fermato' } });
        }; });
      }
      return avviaSessione({ ...input, talosLavoraFn: opts => talosLavora({ ...opts, giriMassimi: 2, fetchDiRete: provider.fetch }) });
    },
  });
  t.after(async () => { finishParent?.(); await registry.chiudi?.(); await attendiScritture({ cartellaStore }); });
  const parent = registry.avvia('analisi');
  const child = await parentInput.onDelega('Leggi il log e riporta il contenuto.', cartella);
  assert.equal(child.esito, 'avviato');
  finishParent();
  await registry.attendiAssestamento(parent.sessionId);
  await registry.attendiAssestamento(child.childId);
  await t.waitFor(() => assert.equal(registry.elencaFigli(parent.sessionId).figli[0]?.conclusa, true));
  assert.equal(registry.elencaFigli(parent.sessionId).figli[0]?.esitoDelega, 'concluso');
  await registry.chiudi?.();
  await attendiScritture({ cartellaStore });
  const restored = createSessionRegistry({ cartellaStore, avviaSessioneFn: () => assert.fail('no model call during replay'), guardaWorkspaceFn: () => () => {} });
  t.after(() => restored.chiudi?.());
  await restored.ripristina();
  assert.equal(restored.elencaFigli(parent.sessionId).figli[0]?.esitoDelega, 'concluso');
  assert.equal(provider.requests.length, 2);
});
