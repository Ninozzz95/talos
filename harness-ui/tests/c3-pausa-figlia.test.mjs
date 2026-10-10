/*
 * C3 tappa 4 (09/10/2026, owner «finisce l'attrezzo, poi si ferma») — LA PAUSA DI UNA DELEGA, nel kernel.
 * `segnalePausa` si guarda solo in cima al giro: gli attrezzi del giro in corso finiscono e i loro risultati entrano nella
 * storia; il modello NON riceve la richiesta dopo; il giro si chiude «in-pausa» con la storia salva, e riprende con un messaggio
 * nuovo (Claude Code: un agente fermato si riprende con SendMessage, a contesto intatto). Hermes non ha una pausa per figlia
 * (solo l'interruttore che blocca le deleghe NUOVE, `tools/delegate_tool.py:460-464`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const enc = new TextEncoder();
function flusso(fotogrammi) {
  return new Response(new ReadableStream({
    start(c) {
      for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  }));
}
const leggi = { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"nota.txt"}' } }] } }] };
const fineAttrezzi = { choices: [{ delta: {}, finish_reason: 'tool_calls' }] };
const testo = (t) => ({ choices: [{ delta: { content: t } }] });
const fine = { choices: [{ delta: {}, finish_reason: 'stop' }] };

/** Il giro 1 chiede `leggi`; mentre il modello risponde arriva la pausa (e, se chiesto, lo Stop). Il giro 2 risponde e basta. */
function banco({ pausa = false, stop = false } = {}) {
  const cartella = cartellaDiProva('talos-c3-pausa-');
  writeFileSync(join(cartella, 'nota.txt'), 'CONTENUTO_DELLA_NOTA');
  const segnalePausa = new AbortController();
  const segnaleStop = new AbortController();
  const corpi = [];
  const fetchDiRete = async (_url, opzioni) => {
    corpi.push(JSON.parse(opzioni.body));
    if (corpi.length === 1) {
      if (pausa) segnalePausa.abort();
      if (stop) segnaleStop.abort();
      return flusso([leggi, fineAttrezzi]);
    }
    return flusso([testo('Fatto.'), fine]);
  };
  return { corpi, input: { cartella, task: { consegna: 'Leggi nota.txt e riassumila.' }, modello: 'x', chiave: 'y', onDelta: () => {},
    fetchDiRete, segnalePausa: segnalePausa.signal, segnaleStop: segnaleStop.signal } };
}

test('C3-PAUSA-KERNEL: the tool in flight finishes, the next request is never sent, the turn ends «in-pausa» with its history', async () => {
  const b = banco({ pausa: true });
  const esito = await talosLavora(b.input);
  assert.equal(b.corpi.length, 1, 'the model does not receive the request after the pause');
  assert.equal(esito.comeFinita, 'in-pausa');
  assert.match(esito.detto, /^⏸ paused on request: before round 2\./u);
  const risultato = esito.messaggiFinali.find((m) => m.role === 'tool' && m.tool_call_id === 'call_1');
  assert.ok(risultato, 'the result of the tool in flight is in the history, ready for the resume');
  assert.match(String(risultato.content), /CONTENUTO_DELLA_NOTA/u, 'and it is the real result: the tool finished');
});

test('C3-PAUSA-KERNEL (the other way): without a pause the next round goes; with Stop and pause together, Stop wins', async () => {
  const libero = banco();
  const esito = await talosLavora(libero.input);
  assert.equal(libero.corpi.length, 2);
  assert.equal(esito.comeFinita, 'concluso');
  const tutti = banco({ pausa: true, stop: true });
  const fermato = await talosLavora(tutti.input);
  assert.equal(fermato.comeFinita, 'fermato', 'a Stop is a Stop, even when a pause was asked too');
});
