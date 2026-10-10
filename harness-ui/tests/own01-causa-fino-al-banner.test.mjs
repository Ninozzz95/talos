/*
 * OWN-01 nel desktop (09/10/2026, bugfixer, nel port del kernel CLI 0.5.2). Il kernel dice la CAUSA di un reinvio senza nessun
 * byte (`causa: 'nessuna-prima-risposta'`), ma `agent-service.mjs` traduce il giro in `talos.provider-retry` copiando i campi da un
 * elenco fisso: la causa si perdeva lì, e il banner del desktop diceva «si è interrotta senza esito» per una risposta mai
 * cominciata. Qui la forma che il frontend legge (`provider-retry.js`, `valoreRetry`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { avviaSessione } from '../src/agent-service.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { erroreEsitoProviderIncerto } from '../src/provider-retry.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const enc = new TextEncoder();
const flussoIntero = (testo) => new Response(new ReadableStream({ start(c) {
  c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', content: testo }, finish_reason: 'stop' }] })}\n\n`));
  c.enqueue(enc.encode('data: [DONE]\n\n')); c.close();
} }), { headers: { 'Content-Type': 'text/event-stream' } });
const nessunaPrimaRisposta = () => erroreEsitoProviderIncerto({ classe: 'timeout-fornitore', transitorio: true, causaDiTrasporto: 'PROVIDER_FIRST_RESPONSE_TIMEOUT' });

async function giro(prima) {
  const cartella = cartellaDiProva('talos-own01-banner-');
  const eventi = [];
  let n = 0;
  try {
    await avviaSessione({ cartella, task: { consegna: 'Rispondi senza strumenti.' }, modello: 'test/model', chiave: 'test-key',
      onEvento: (e) => eventi.push(e),
      talosLavoraFn: (opts) => talosLavora({ ...opts, giriMassimi: 1, attesaRitentaMassimaMs: 1,
        fetchDiRete: async () => { n += 1; if (n === 1) { const v = prima(); if (v instanceof Error) throw v; return v; } return flussoIntero('Fatto.'); } }),
    });
  } finally { rimuoviCartellaDiProva(cartella); }
  return eventi.filter((e) => e.name === 'talos.provider-retry').map((e) => e.value);
}

test('OWN01-CAUSA-01: un reinvio senza nessun byte arriva al frontend con la sua causa, sul canale incerto', async () => {
  const retry = await giro(nessunaPrimaRisposta);
  const attesa = retry.find((v) => v.fase === 'attesa');
  assert.ok(attesa, JSON.stringify(retry));
  assert.equal(attesa.canale, 'esito-incerto');
  assert.equal(attesa.causa, 'nessuna-prima-risposta');
  assert.equal(attesa.schema, 'talos.provider-retry.v1');
});

test('OWN01-CAUSA-02: AL CONTRARIO — un reinvio per HTTP 503 non porta nessuna causa', async () => {
  const retry = await giro(() => new Response('private-provider-body-must-not-leak', { status: 503 }));
  const attesa = retry.find((v) => v.fase === 'attesa');
  assert.ok(attesa, JSON.stringify(retry));
  assert.equal(Object.hasOwn(attesa, 'causa'), false);
  assert.doesNotMatch(JSON.stringify(retry), /private-provider|test-key/u);
});
