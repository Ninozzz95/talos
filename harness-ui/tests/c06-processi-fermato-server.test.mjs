/*
 * C06 (bugfixer, 10/10/2026, prova dal vivo sul 4174 con glm-5.3-flash) — la proiezione dei processi del server (`GET …/processes`,
 *   `processiDaEventi`) non leggeva l'uscita vera di uno sfondato (`talos.processo-sfondo`, A6-bis): 42 s dopo lo Stop della persona
 *   la riga diceva ancora «in-sfondo» e `inCorsoDaMs` cresceva. E su Windows la chiusura forzata dà codice 1: fermata dalla persona è
 *   «annullato» senza codice (Hermes `tools/process_registry.py:636-644`, `mark_exited`: il kill non si sovrascrive).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { processiDaEventi } from '../src/session-registry.mjs';

const sfondato = (id) => [
  { type: 'RunStarted', _sequenza: 1 },
  { type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell', _sequenza: 2 },
  { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ comando: 'ping -n 300 127.0.0.1' }), _sequenza: 3 },
  { type: 'ToolCallResult', toolCallId: id, content: 'IN BACKGROUND: model. The output keeps going to a file.', inSfondo: true, fileSfondo: '/p/.talos/processi-sfondo/x.log', sfondoDa: 'modello', _sequenza: 4 },
];
const uscita = (id, valore, sequenza = 5) => ({ type: 'CUSTOM', name: 'talos.processo-sfondo', value: { toolCallId: id, finitoAlle: '2026-10-10T18:37:55.457Z', ...valore }, _sequenza: sequenza });
const istanti = new Map([[2, 1_000], [4, 1_200], [5, 9_000]]);
const riga = (eventi, opzioni = {}) => processiDaEventi(eventi, { istanti, adesso: 50_000, ...opzioni }).processi[0];

test('C06-SRV-01: premessa — senza uscita la riga è «in-sfondo» e conta il tempo', () => {
  const p = riga(sfondato('a'));
  assert.equal(p.esito, 'in-sfondo');
  assert.equal(p.inCorsoDaMs, 49_000);
});

test('C06-SRV-02: fermato dalla persona ⇒ «annullato», nessun codice, non più vivo, durata dall\'avvio all\'uscita', () => {
  const p = riga([...sfondato('a'), uscita('a', { esito: 'fallito', codice: 1, segnale: null, fermatoDallaPersona: true })]);
  assert.deepEqual([p.esito, p.codiceUscita, p.inSfondo, p.inCorsoDaMs, p.durataMs], ['annullato', null, false, null, 8_000]);
  assert.equal(p.fileSfondo, '/p/.talos/processi-sfondo/x.log', 'il file dell\'uscita resta leggibile');
});

test('C06-SRV-03: AL CONTRARIO — un\'uscita sua resta «concluso» col codice; un segnale senza codice resta senza codice', () => {
  assert.deepEqual(['esito', 'codiceUscita'].map((k) => riga([...sfondato('a'), uscita('a', { esito: 'fallito', codice: 1 })])[k]), ['concluso', 1]);
  assert.deepEqual(['esito', 'codiceUscita'].map((k) => riga([...sfondato('a'), uscita('a', { esito: 'terminato', codice: null, segnale: 'SIGTERM' })])[k]), ['concluso', null]);
});

test('C06-SRV-04: la prima uscita vince, anche se arriva prima del risultato «in sfondo»; un comando in primo piano non si tocca', () => {
  const [avvio, inizio, argomenti, risultato] = sfondato('a');
  const p = riga([avvio, inizio, argomenti, uscita('a', { esito: 'fallito', codice: 1, fermatoDallaPersona: true }, 5), risultato, uscita('a', { esito: 'riuscito', codice: 0 }, 6)]);
  assert.equal(p.esito, 'annullato');
  const primoPiano = riga([
    { type: 'RunStarted', _sequenza: 1 },
    { type: 'ToolCallStart', toolCallId: 'f', toolCallName: 'shell', _sequenza: 2 },
    { type: 'ToolCallArgs', toolCallId: 'f', delta: JSON.stringify({ comando: 'ls' }), _sequenza: 3 },
    { type: 'ToolCallResult', toolCallId: 'f', content: 'exit 0\nok', _sequenza: 4 },
    uscita('f', { esito: 'fallito', codice: 9, fermatoDallaPersona: true }),
  ]);
  assert.deepEqual([primoPiano.esito, primoPiano.codiceUscita], ['concluso', 0]);
});

test('C06-SRV-05: senza istanti la fine viene da `finitoAlle`; con l\'orologio all\'indietro nessuna durata', () => {
  const senzaSequenza = { ...uscita('a', { esito: 'fallito', codice: 1, fermatoDallaPersona: true }), _sequenza: undefined };
  const p = riga([...sfondato('a'), senzaSequenza], { istanti: new Map([[2, Date.parse('2026-10-10T18:37:53.457Z')]]) });
  assert.equal(p.durataMs, 2_000);
  const indietro = riga([...sfondato('a'), uscita('a', { esito: 'riuscito', codice: 0 })], { istanti: new Map([[2, 10_000], [5, 9_000]]) });
  assert.equal(indietro.durataMs, null);
});
