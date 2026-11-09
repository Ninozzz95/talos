/*
 * R3 della revisione di 245 (Performance, 05/11/2026): la riga dei risultati accorciati (FE-049) cerca l'inizio della
 * richiesta in corso come l'ultimo messaggio `user` non preceduto da un esito. La spinta «non fermarti per il contesto»
 * (`NOTA_FERMATA_CONTESTO`) è `user` e arriva dopo una risposta dell'assistente: veniva presa per la richiesta, e gli esiti
 * accorciati PRIMA della spinta sparivano dal conto (letto 0). Lo stesso per il riassunto in testa alla coda.
 * Come Hermes `agent/context_compressor.py:491`: «synthetic continuation rows ... never mark a turn boundary».
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { MARCATORE_RIASSUNTO, usciteAccorciateDellaRichiesta } from '../src/kernel/compattazione-desktop.mjs';
import { NOTA_FERMATA_CONTESTO } from '../src/kernel/talosHarness.mjs';

const chiamata = (id) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'shell', arguments: '{}' } }] });
const esito = (id) => ({ role: 'tool', tool_call_id: id, content: 'X'.repeat(50) });
const accorcia = (m) => ({ ...m, content: '[accorciato]' });

test('UAN-01 la spinta del contesto non apre una richiesta: gli esiti accorciati prima di lei si contano', () => {
  const prima = [{ role: 'user', content: 'fai il lavoro' }, chiamata('a'), esito('a'), chiamata('b'), esito('b'),
    { role: 'assistant', content: 'Riprendo al prossimo giro.' }, { role: 'user', content: NOTA_FERMATA_CONTESTO }, chiamata('c'), esito('c')];
  const dopo = prima.map((m, i) => (i === 2 || i === 4 ? accorcia(m) : m));
  assert.equal(usciteAccorciateDellaRichiesta(prima, dopo), 2);
});

test('UAN-02 le altre note del kernel ([TALOS], risposta vuota) non aprono una richiesta', () => {
  for (const nota of ['[TALOS] Identical copies skipped.', 'You just executed tool calls but returned an empty response. Continue.']) {
    const prima = [{ role: 'user', content: 'fai il lavoro' }, chiamata('a'), esito('a'), { role: 'assistant', content: '' }, { role: 'user', content: nota }, chiamata('b'), esito('b')];
    const dopo = prima.map((m, i) => (i === 2 ? accorcia(m) : m));
    assert.equal(usciteAccorciateDellaRichiesta(prima, dopo), 1, nota);
  }
});

test('UAN-03 il riassunto in testa alla coda non è la richiesta: si contano gli esiti della richiesta coperta', () => {
  const riassunto = { role: 'user', content: `${MARCATORE_RIASSUNTO}\n\nriassunto` };
  const coda = [riassunto, chiamata('d'), esito('d')];
  const coperti = [{ role: 'user', content: 'fai il lavoro' }, chiamata('a'), esito('a'), chiamata('b'), esito('b')];
  assert.equal(usciteAccorciateDellaRichiesta(coda, [riassunto, chiamata('d'), accorcia(esito('d'))], coperti), 3);
});

test('UAN-05 anche nel tratto coperto dal riassunto la spinta non apre una richiesta', () => {
  const riassunto = { role: 'user', content: `${MARCATORE_RIASSUNTO}\n\nriassunto` };
  const coda = [riassunto, chiamata('d'), esito('d')];
  const coperti = [{ role: 'user', content: 'fai il lavoro' }, chiamata('a'), esito('a'),
    { role: 'assistant', content: 'Riprendo al prossimo giro.' }, { role: 'user', content: NOTA_FERMATA_CONTESTO }, chiamata('b'), esito('b')];
  assert.equal(usciteAccorciateDellaRichiesta(coda, [riassunto, chiamata('d'), accorcia(esito('d'))], coperti), 3);
});

test('UAN-04 al contrario: una richiesta vera nuova azzera il conto della richiesta di prima', () => {
  const prima = [{ role: 'user', content: 'primo' }, chiamata('a'), esito('a'), { role: 'assistant', content: 'ok' }, { role: 'user', content: 'secondo' }, chiamata('b'), esito('b')];
  const dopo = prima.map((m, i) => (i === 2 ? accorcia(m) : m));
  assert.equal(usciteAccorciateDellaRichiesta(prima, dopo), 0);
});
