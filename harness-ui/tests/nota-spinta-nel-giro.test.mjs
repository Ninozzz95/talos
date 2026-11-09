/*
 * R1 della revisione di 245 (Performance, 05/11/2026): la spinta «non fermarti per il contesto» (`NOTA_FERMATA_CONTESTO`)
 * resta nella storia come messaggio `user`. Il fork «prima del giro» (`taglioPrimaDelGiro`) e l'eliminazione di un giro
 * (`messaggiSenzaMessaggio`) contano i giri per POSIZIONE (n-esimo `RunStarted` ↔ n-esimo `user`): la nota li sfasava.
 * Prima della cura: fork del giro dopo ⇒ FORK_POINT_NOT_FOUND, eliminazione del giro dopo rifiutata, eliminazione del giro
 * con la spinta ⇒ nota e risposta finale restavano orfane nella storia che il modello rilegge.
 * La stessa classe vale per le altre note del kernel (`[TALOS]`, risposta vuota): `eNotaDiTalos` le riconosce tutte.
 * Come Hermes: `agent/context_compressor.py:940` `_synthetic_user_row` («scaffolding user rows that carry no real user
 * words») e `:491` «synthetic continuation rows ... never mark a turn boundary».
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { taglioPrimaDelGiro } from '../src/taglio-del-giro.mjs';
import { messaggiSenzaMessaggio } from '../src/session-registry.mjs';
import { NOTA_FERMATA_CONTESTO } from '../src/kernel/talosHarness.mjs';

const chiamata = { id: 'a', type: 'function', function: { name: 'shell', arguments: '{}' } };
const storia = () => [
  { role: 'system', content: 'preambolo' },
  { role: 'user', content: 'primo giro' },
  { role: 'assistant', content: null, tool_calls: [chiamata] },
  { role: 'tool', tool_call_id: 'a', content: 'ok' },
  { role: 'assistant', content: 'Riprendo al prossimo giro: il contesto è agli ultimi token.' },
  { role: 'user', content: NOTA_FERMATA_CONTESTO },
  { role: 'assistant', content: 'Fatto.' },
  { role: 'user', content: 'secondo giro' },
  { role: 'assistant', content: 'ok' },
];
const eventi = [
  { type: 'RunStarted', runId: 'r1', input: { consegna: 'primo giro' } },
  { type: 'RunStarted', runId: 'r2', input: { consegna: 'secondo giro' } },
];

test('NSG-01 il fork prima del giro dopo la spinta trova il messaggio giusto', () => {
  const t = taglioPrimaDelGiro({ eventi, messaggi: storia(), runId: 'r2' });
  assert.equal(t.ok, true, JSON.stringify(t));
  assert.equal(t.indice, 7);
  assert.equal(t.messaggi.length, 7);
});

test('NSG-02 il fork prima del giro con la spinta taglia prima del suo messaggio', () => {
  const t = taglioPrimaDelGiro({ eventi, messaggi: storia(), runId: 'r1' });
  assert.equal(t.ok, true, JSON.stringify(t));
  assert.equal(t.indice, 1);
});

test('NSG-03 eliminare il giro dopo la spinta toglie quel giro', () => {
  const via = messaggiSenzaMessaggio(storia(), { posizione: 1, ruolo: 'user', testo: 'secondo giro' });
  assert.equal(via.tolto, true, via.motivo);
  assert.deepEqual(via.messaggi.map((m) => m.content ?? null), storia().slice(0, 7).map((m) => m.content ?? null));
});

test('NSG-04 eliminare il giro con la spinta porta via anche la nota e la sua risposta', () => {
  const via = messaggiSenzaMessaggio(storia(), { posizione: 0, ruolo: 'user', testo: 'primo giro' });
  assert.equal(via.tolto, true, via.motivo);
  assert.deepEqual(via.messaggi.map((m) => [m.role, m.content]), [['system', 'preambolo'], ['user', 'secondo giro'], ['assistant', 'ok']]);
});

test('NSG-05 le altre note del kernel non contano come giro (forma [TALOS] e risposta vuota)', () => {
  const messaggi = storia();
  messaggi.splice(3, 0, { role: 'user', content: '[TALOS] Identical copies skipped.' });
  messaggi.splice(5, 0, { role: 'user', content: 'You just executed tool calls but returned an empty response. Continue.' });
  const t = taglioPrimaDelGiro({ eventi, messaggi, runId: 'r2' });
  assert.equal(t.ok, true, JSON.stringify(t));
  assert.equal(messaggi[t.indice].content, 'secondo giro');
  const via = messaggiSenzaMessaggio(messaggi, { posizione: 1, ruolo: 'user', testo: 'secondo giro' });
  assert.equal(via.tolto, true, via.motivo);
});

test('NSG-06 una persona che scrive [TALOS] in testa: si rifiuta, mai un taglio sbagliato', () => {
  const messaggi = [
    { role: 'user', content: '[TALOS] è il nome del progetto: leggi il README' },
    { role: 'assistant', content: 'ok' },
    { role: 'user', content: 'secondo giro' },
    { role: 'assistant', content: 'ok' },
  ];
  const ev = [
    { type: 'RunStarted', runId: 'r1', input: { consegna: messaggi[0].content } },
    { type: 'RunStarted', runId: 'r2', input: { consegna: 'secondo giro' } },
  ];
  for (const runId of ['r1', 'r2']) {
    const t = taglioPrimaDelGiro({ eventi: ev, messaggi, runId });
    if (t.ok) assert.equal(messaggi[t.indice].content, ev.find((e) => e.runId === runId).input.consegna);
    else assert.equal(t.code, 'FORK_POINT_NOT_FOUND');
  }
  for (const [posizione, testo] of [[0, messaggi[0].content], [1, 'secondo giro']]) {
    const via = messaggiSenzaMessaggio(messaggi, { posizione, ruolo: 'user', testo });
    if (via.tolto) assert.ok(!via.messaggi.some((m) => m.content === testo), `tolto il giro sbagliato per ${testo}`);
  }
});
